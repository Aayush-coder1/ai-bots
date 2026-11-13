"use server"

import { auth } from "@clerk/nextjs/server"
import { tasks } from "@trigger.dev/sdk"
import { and, count, eq, gt } from "drizzle-orm"
import * as Sentry from "@sentry/nextjs"
import { revalidatePath } from "next/cache"

import { db } from "@/db"
import {
  automationRuns,
  automations,
  bots,
  devices,
  insertAutomationSchema,
} from "@/db/schema"
import { FEATURES, upgradeRequired } from "@/lib/billing"
import { hasFeatures } from "@/lib/billing-server"
import {
  isValidTimeZone,
  MAX_AUTOMATIONS,
  minuteOfDayFromTime,
  nextRunAt,
} from "@/lib/schedule"
import type { runAutomation } from "@/trigger/automation"

const AUTOMATIONS_PATH = "/automations"

async function requireUser() {
  const { userId } = await auth()
  if (!userId) {
    throw new Error("Unauthorized")
  }
  return userId
}

type ActionError = { ok: false; reason: "error"; message: string }
const fail = (message: string): ActionError => ({
  ok: false,
  reason: "error",
  message,
})

export async function createAutomation(input: unknown) {
  const userId = await requireUser()
  // Runs use the bot's sandbox and tools, so both features are needed.
  if (!(await hasFeatures(FEATURES.bots, FEATURES.sandboxes))) {
    return upgradeRequired
  }

  const parsed = insertAutomationSchema.safeParse(input)
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid input")
  }
  const data = parsed.data
  if (!isValidTimeZone(data.timezone)) {
    return fail("Unknown time zone")
  }

  // The bot must be the user's own.
  const bot = await db.query.bots.findFirst({
    where: and(eq(bots.id, data.botId), eq(bots.userId, userId)),
  })
  if (!bot) {
    return fail("Pick one of your bots")
  }

  // A device to run on must be one of the user's own, still connected.
  const deviceId = data.deviceId?.trim() || null
  if (deviceId) {
    const device = await db.query.devices.findFirst({
      where: and(eq(devices.id, deviceId), eq(devices.userId, userId)),
    })
    if (!device || device.revokedAt || !device.tokenHash) {
      return fail("Pick one of your connected devices")
    }
  }

  const [{ total }] = await db
    .select({ total: count() })
    .from(automations)
    .where(eq(automations.userId, userId))
  if (total >= MAX_AUTOMATIONS) {
    return fail(`You can have up to ${MAX_AUTOMATIONS} automations.`)
  }

  const schedule = {
    frequency: data.frequency,
    minuteOfDay: minuteOfDayFromTime(data.time),
    dayOfWeek: data.dayOfWeek,
    timezone: data.timezone,
  }
  const [automation] = await db
    .insert(automations)
    .values({
      userId,
      botId: bot.id,
      name: data.name.trim(),
      prompt: data.prompt.trim(),
      ...schedule,
      deviceId,
      webhookUrl: data.webhookUrl?.trim() || null,
      nextRunAt: nextRunAt(schedule),
    })
    .returning({ id: automations.id })

  Sentry.logger.info("Automation created", {
    automationId: automation.id,
    frequency: data.frequency,
  })
  revalidatePath(AUTOMATIONS_PATH)
  return { ok: true as const, id: automation.id }
}

export async function setAutomationEnabled(id: string, enabled: boolean) {
  const userId = await requireUser()
  const automation = await db.query.automations.findFirst({
    where: and(eq(automations.id, id), eq(automations.userId, userId)),
  })
  if (!automation) {
    throw new Error("Not found")
  }
  await db
    .update(automations)
    .set({
      enabled,
      // Turning it back on never replays the runs it missed.
      nextRunAt: enabled ? nextRunAt(automation) : null,
    })
    .where(eq(automations.id, automation.id))
  revalidatePath(AUTOMATIONS_PATH)
}

export async function deleteAutomation(id: string) {
  const userId = await requireUser()
  await db
    .delete(automations)
    .where(and(eq(automations.id, id), eq(automations.userId, userId)))
  revalidatePath(AUTOMATIONS_PATH)
}

/** Starts a run right away, without waiting for the schedule. */
export async function runAutomationNow(id: string) {
  const userId = await requireUser()
  if (!(await hasFeatures(FEATURES.bots, FEATURES.sandboxes))) {
    return upgradeRequired
  }
  const automation = await db.query.automations.findFirst({
    where: and(eq(automations.id, id), eq(automations.userId, userId)),
  })
  if (!automation) {
    return fail("Not found")
  }

  // One at a time: a second click while a run is going would bill twice.
  const running = await db.query.automationRuns.findFirst({
    where: and(
      eq(automationRuns.automationId, automation.id),
      eq(automationRuns.status, "running"),
      gt(automationRuns.startedAt, new Date(Date.now() - 10 * 60 * 1000))
    ),
  })
  if (running) {
    return fail("This automation is already running.")
  }

  try {
    await tasks.trigger<typeof runAutomation>("automation-run", {
      automationId: automation.id,
    })
  } catch (error) {
    Sentry.captureException(error)
    return fail("Couldn't start the run. Please try again.")
  }
  revalidatePath(AUTOMATIONS_PATH)
  return { ok: true as const }
}
