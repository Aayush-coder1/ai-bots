import { logger, schedules, task } from "@trigger.dev/sdk"
import { generateText, stepCountIs } from "ai"
import { and, desc, eq, lt, lte, ne } from "drizzle-orm"

import { db } from "@/db"
import { automationRuns, automations, deviceJobs } from "@/db/schema"
import { getOnlineDevices } from "@/lib/devices"
import { nextRunAt, TICK_MINUTES } from "@/lib/schedule"
import { captureTriggerError } from "@/lib/sentry-trigger"
import {
  assertWithinLimits,
  getBillingPeriod,
  isUsageLimitError,
  recordUsageSafely,
} from "@/lib/usage"
import { deliverToWebhook } from "@/lib/webhook"
import { buildBotSystemPrompt } from "@/trigger/bot-prompt"
import { closeOnlineSandboxes, runOnline } from "@/trigger/e2b"
import { chatModel } from "@/trigger/model"
import { ATTENDED_TOOLS, createSandboxTools, PC_TOOLS } from "@/trigger/tools"

// Automations: a bot does a task on a schedule and the result is kept (and
// optionally sent to a chat app). One cron task finds what is due; each due
// automation then runs as its own task, so one slow run never delays another.

const MAX_OUTPUT_CHARS = 20_000

/** A scheduled run has no chat; its usage and online sandbox are keyed by this. */
function runKey(automationId: string) {
  return `automation:${automationId}`
}

const GENERIC_FAILURE = "The bot couldn't finish this run."
/** A run still marked running after this long has died with its worker. */
const STALE_RUN_MS = 15 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

/** Whether the two runs before the current one also failed to finish. */
async function failedTwiceBefore(automationId: string) {
  const recent = await db.query.automationRuns.findMany({
    where: and(
      eq(automationRuns.automationId, automationId),
      ne(automationRuns.status, "running")
    ),
    orderBy: desc(automationRuns.startedAt),
    limit: 2,
  })
  return (
    recent.length === 2 &&
    recent.every(
      (run) => run.status === "error" && run.error?.startsWith(GENERIC_FAILURE)
    )
  )
}

/**
 * Housekeeping on every tick: close runs whose worker died, and drop rows
 * nobody will look at again, so the free database stays small.
 */
async function sweep(now: Date) {
  await db
    .update(automationRuns)
    .set({
      status: "error",
      error:
        "This run stopped unexpectedly. It will try again at the next scheduled time.",
      finishedAt: now,
    })
    .where(
      and(
        eq(automationRuns.status, "running"),
        lt(automationRuns.startedAt, new Date(now.getTime() - STALE_RUN_MS))
      )
    )
  await db
    .delete(automationRuns)
    .where(lt(automationRuns.startedAt, new Date(now.getTime() - 90 * DAY_MS)))
  await db
    .delete(deviceJobs)
    .where(lt(deviceJobs.createdAt, new Date(now.getTime() - 7 * DAY_MS)))
}

export const runAutomation = task({
  id: "automation-run",
  maxDuration: 600,
  // A retry would do (and bill, and deliver) the whole task twice.
  retry: { maxAttempts: 1 },
  queue: { concurrencyLimit: 2 },
  run: async ({ automationId }: { automationId: string }) => {
    const automation = await db.query.automations.findFirst({
      where: eq(automations.id, automationId),
      with: { bot: true },
    })
    if (!automation) {
      return { ok: false, reason: "not-found" }
    }
    const { bot } = automation
    const key = runKey(automation.id)

    const [run] = await db
      .insert(automationRuns)
      .values({ automationId: automation.id, userId: automation.userId })
      .returning()

    const finish = async (
      result: { output: string } | { error: string },
      delivered: boolean | null = null
    ) => {
      await db
        .update(automationRuns)
        .set({
          status: "error" in result ? "error" : "done",
          output: "output" in result ? result.output : null,
          error: "error" in result ? result.error : null,
          delivered,
          finishedAt: new Date(),
        })
        .where(eq(automationRuns.id, run.id))
      await db
        .update(automations)
        .set({ lastRunAt: new Date() })
        .where(eq(automations.id, automation.id))
    }

    try {
      // Automations are a paid feature; a lapsed plan stops them here, since
      // the worker has no browser session to check.
      const period = await getBillingPeriod(automation.userId)
      if (period.plan !== "pro") {
        await finish({ error: "Automations are part of the paid plan." })
        return { ok: false, reason: "upgrade-required" }
      }
      if (!bot.sandboxId) {
        await finish({ error: "This bot has no computer to work on." })
        return { ok: false, reason: "no-sandbox" }
      }
      await assertWithinLimits(automation.userId, "aiTokens")

      // A task set to run on the user's own device needs that device's agent
      // running. Doing it somewhere else instead would be a different task.
      const device = automation.deviceId
        ? (await getOnlineDevices(automation.userId)).find(
            (candidate) => candidate.id === automation.deviceId
          )
        : undefined
      if (automation.deviceId && !device) {
        await finish({
          error:
            "The device this automation runs on was not connected. Start the agent there (Your PC page) and it will run at the next scheduled time, or press Run now.",
        })
        return { ok: false, reason: "device-offline" }
      }

      const context = {
        sandboxId: bot.sandboxId,
        userId: bot.userId,
        botId: bot.id,
        // Shown in the agent's approval prompt on the device.
        botName: `${bot.name} (automation "${automation.name}")`,
        chatId: key,
        deviceId: device?.id,
      }
      const all = createSandboxTools(
        async () => context,
        async () => ({ ok: false, error: "Not available in a scheduled run." }),
        (input) =>
          runOnline({
            chatId: key,
            botId: bot.id,
            userId: bot.userId,
            ...input,
          })
      )
      // No screen and no group when nobody is watching, and the user's
      // device only when they set this automation to run on it.
      const hidden = new Set<string>([
        ...ATTENDED_TOOLS,
        ...(device ? [] : PC_TOOLS),
      ])
      const tools = Object.fromEntries(
        Object.entries(all).filter(([name]) => !hidden.has(name))
      ) as Omit<typeof all, (typeof ATTENDED_TOOLS)[number]>

      const result = await generateText({
        model: chatModel(),
        system: buildBotSystemPrompt(bot, undefined, {
          unattended: true,
          pc: device && { name: device.name, folder: device.folder },
        }),
        prompt: `Scheduled task "${automation.name}". Today is ${new Date().toISOString().slice(0, 10)} (UTC).\n\n${automation.prompt}`,
        tools,
        stopWhen: stepCountIs(20),
        maxRetries: 1,
        onStepEnd: ({ usage }) => {
          void recordUsageSafely(bot.userId, [
            {
              metric: "ai_input_tokens",
              quantity: usage.inputTokens ?? 0,
              chatId: key,
              botId: bot.id,
            },
            {
              metric: "ai_output_tokens",
              quantity: usage.outputTokens ?? 0,
              chatId: key,
              botId: bot.id,
            },
          ])
        },
      })

      const output =
        result.text.trim().slice(0, MAX_OUTPUT_CHARS) ||
        "The bot finished without writing a result. Try making the task more specific."
      const delivered = automation.webhookUrl
        ? await deliverToWebhook(automation.webhookUrl, automation.name, output)
        : null
      await finish({ output }, delivered)
      logger.info("Automation finished", {
        automationId: automation.id,
        steps: result.steps.length,
        delivered,
      })
      return { ok: true }
    } catch (error) {
      // A used-up allowance is the user's to know about, in full; anything
      // else stays generic so provider internals never reach the page.
      const message = isUsageLimitError(error)
        ? error.message
        : `${GENERIC_FAILURE} It will try again at the next scheduled time.`
      // Three failures in a row means something is wrong with the task
      // itself: stop spending the user's allowance on it and say so.
      const pause =
        !isUsageLimitError(error) && (await failedTwiceBefore(automation.id))
      await finish({
        error: pause
          ? `${GENERIC_FAILURE} That is 3 failed runs in a row, so this automation was paused. Check the task, then switch it back on.`
          : message,
      })
      if (pause) {
        await db
          .update(automations)
          .set({ enabled: false, nextRunAt: null })
          .where(eq(automations.id, automation.id))
        if (automation.webhookUrl) {
          await deliverToWebhook(
            automation.webhookUrl,
            `${automation.name} was paused`,
            "It failed 3 times in a row. Open ai-bots, check the task, and switch it back on."
          )
        }
      }
      if (!isUsageLimitError(error)) {
        await captureTriggerError(
          error,
          { task: "automation-run", stage: "run" },
          { automationId: automation.id }
        )
      }
      return { ok: false, reason: "failed" }
    } finally {
      await closeOnlineSandboxes(key).catch(() => {})
    }
  },
})

export const automationTick = schedules.task({
  id: "automation-tick",
  cron: `*/${TICK_MINUTES} * * * *`,
  maxDuration: 120,
  run: async () => {
    const now = new Date()
    // Never let housekeeping stop the due automations from starting.
    await sweep(now).catch((error) =>
      logger.warn("Automation sweep failed", { error: String(error) })
    )
    const due = await db.query.automations.findMany({
      where: and(
        eq(automations.enabled, true),
        lte(automations.nextRunAt, now)
      ),
      limit: 50,
    })

    let started = 0
    for (const automation of due) {
      // Move the schedule on first, and only start the run if this tick was
      // the one that moved it: an overlapping tick can't start it twice.
      const [claimed] = await db
        .update(automations)
        .set({ nextRunAt: nextRunAt(automation, now) })
        .where(
          and(
            eq(automations.id, automation.id),
            eq(automations.enabled, true),
            lte(automations.nextRunAt, now)
          )
        )
        .returning({ id: automations.id })
      if (claimed) {
        await runAutomation.trigger({ automationId: automation.id })
        started += 1
      }
    }
    logger.info("Automation tick", { due: due.length, started })
    return { started }
  },
})
