import { chat } from "@trigger.dev/sdk/ai"
import { stepCountIs } from "ai"
import { z } from "zod"

import type { Bot } from "@/db/schema"
import { chatTranscriptStorage } from "@/lib/chat-transcript-storage"
import { captureTriggerError } from "@/lib/sentry-trigger"
import {
  assertWithinLimits,
  isUsageLimitError,
  recordUsageSafely,
} from "@/lib/usage"
import { firstMentionName, mentionedBot } from "@/lib/mentions"
import { getChatBot, getChatContext, refreshChatContext } from "@/trigger/bot"
import { buildBotSystemPrompt, type PromptGroup } from "@/trigger/bot-prompt"
import { closeOnlineSandboxes, runOnline } from "@/trigger/e2b"
import { chatModel } from "@/trigger/model"
import {
  activeToolsAfter,
  type ChatUIMessage,
  createSandboxTools,
  type HandoffResult,
  keepLatestScreenshots,
  latestUserText,
  type ToolContext,
} from "@/trigger/tools"

type Turn = {
  /** The bot answering right now; a handoff replaces it mid-turn. */
  bot: Bot
  /** Every bot that has held this turn, so it is never handed back. */
  heldBy: Set<string>
  handedFrom?: { name: string; reason: string }
}

// The turn in progress for each chat this worker serves. Tools read it, so
// after a handoff they act on the new bot's sandbox.
const turns = new Map<string, Turn>()

async function toolContextFor(
  chatId: string,
  botId?: string
): Promise<ToolContext> {
  const bot = turns.get(chatId)?.bot ?? (await getChatBot(chatId, botId))
  if (!bot.sandboxId) {
    throw new Error("This bot has no sandbox")
  }
  // The bot's owner pays for everything it uses.
  return { sandboxId: bot.sandboxId, userId: bot.userId, botId: bot.id, chatId }
}

async function handOff(
  chatId: string,
  { botId, reason }: { botId: string; reason: string }
): Promise<HandoffResult> {
  const turn = turns.get(chatId)
  const { kind, bots } = await getChatContext(chatId)
  if (!turn || kind !== "group") {
    return { ok: false, error: "Handoff only works in group chats." }
  }

  // Models sometimes pass the name instead of the id; accept a unique match.
  const byName = bots.filter(
    (bot) => bot.name.toLowerCase() === botId.trim().toLowerCase()
  )
  const target =
    bots.find((bot) => bot.id === botId.trim()) ??
    (byName.length === 1 ? byName[0] : undefined)

  if (!target) {
    return { ok: false, error: `No bot with id "${botId}" is in this group.` }
  }
  // A bot can't hand a message to itself; that would only loop.
  if (target.id === turn.bot.id) {
    return {
      ok: false,
      error: `You are ${target.name}; you can't hand a message to yourself.`,
    }
  }
  if (turn.heldBy.has(target.id)) {
    return {
      ok: false,
      error: `${target.name} already had this message and can't take it back.`,
    }
  }

  const from = turn.bot
  turn.bot = target
  turn.heldBy.add(target.id)
  turn.handedFrom = { name: from.name, reason }

  return {
    ok: true,
    fromBotId: from.id,
    fromBotName: from.name,
    toBotId: target.id,
    toBotName: target.name,
    reason,
  }
}

function promptFor(turn: Turn, group: PromptGroup | undefined) {
  return buildBotSystemPrompt(
    turn.bot,
    group && { ...group, handedFrom: turn.handedFrom }
  )
}

// Sent by the chat UI with every message through the transport. In a group
// chat it names the bot the user picked to answer this turn.
// Optional as a whole: a session started without client data (a server-side
// caller, an older client) is a direct chat or the first bot, not a crash.
const clientDataSchema = z
  .object({
    botId: z.string().optional(),
  })
  .optional()

export const chatAgent = chat
  .withUIMessage<ChatUIMessage>()
  .withClientData({ schema: clientDataSchema })
  .agent({
    id: "chat",
    storage: chatTranscriptStorage,
    // Declared here as well as on streamText so each screenshot's
    // toModelOutput is re-applied when earlier turns are re-converted. The
    // tools act on the sandbox of the bot answering at that moment.
    tools: ({ chatId, clientData }) =>
      createSandboxTools(
        () => toolContextFor(chatId, clientData?.botId),
        (input) => handOff(chatId, input),
        async (input) => {
          // The online computer of whichever bot is answering right now.
          const bot =
            turns.get(chatId)?.bot ??
            (await getChatBot(chatId, clientData?.botId))
          return runOnline({
            chatId,
            botId: bot.id,
            userId: bot.userId,
            ...input,
          })
        }
      ),
    // Online sandboxes cost money while they run; don't leave them behind
    // once the chat's run is over (they also expire after 10 idle minutes).
    onComplete: async ({ payload }) => {
      await closeOnlineSandboxes(payload.chatId)
    },
    // Fetch the chat while the run boots, so the first turn rarely waits on it.
    onBoot: async ({ chatId }) => {
      await getChatContext(chatId)
    },
    // Earlier turns' screenshots are stale; keep only the newest in the prompt.
    prepareMessages: ({ messages }) => keepLatestScreenshots(messages),
    run: async ({
      chatId,
      clientData,
      messages,
      tools,
      signal,
      streamText,
    }) => {
      // The agent turns a failed turn into a chat message, so the run never
      // "fails" and the onFailure hook never sees it: report it here.
      try {
        // Decides whether showScreen is on offer this turn (see activeToolsAfter),
        // and carries any "@[Name]" tag.
        const userText = latestUserText(messages)
        let context = await getChatContext(chatId)
        // The members are cached; after the group is edited, a message can name
        // a bot (by pick or by tag) this worker hasn't seen yet. Read it again.
        const knows = (botId: string) =>
          context.bots.some((b) => b.id === botId)
        const tagName = firstMentionName(userText)
        if (
          (clientData?.botId && !knows(clientData.botId)) ||
          (tagName && !mentionedBot(userText, context.bots, clientData?.botId))
        ) {
          context = await refreshChatContext(chatId)
        }
        // A tagged bot answers: the tag in the text wins over the picker's id,
        // so the turn goes where the message says even if the two disagree.
        const tagged =
          context.kind === "group"
            ? mentionedBot(userText, context.bots, clientData?.botId)
            : undefined
        const bot =
          tagged ??
          context.bots.find((member) => member.id === clientData?.botId) ??
          context.bots[0]
        const turn: Turn = { bot, heldBy: new Set([bot.id]) }
        turns.set(chatId, turn)

        const isGroup = context.kind === "group"
        const group: PromptGroup | undefined = isGroup
          ? { name: context.name, members: context.bots }
          : undefined

        // Stamp the reply with the bot this turn was addressed to. After a
        // handoff the reply stays theirs; the handoff part records who took
        // over, and the chat shows that bot from the handoff on.
        chat.setUIMessageStreamOptions({
          messageMetadata: ({ part }) =>
            part.type === "start" ? { botId: bot.id } : undefined,
        })

        // Out of AI tokens for this billing period: say so in the reply, as a
        // notice the chat renders with links to the usage and pricing pages,
        // without calling the model.
        try {
          await assertWithinLimits(bot.userId, "aiTokens")
        } catch (error) {
          if (!isUsageLimitError(error)) {
            throw error
          }
          chat.response.write({
            type: "data-usageLimit",
            data: { meter: error.meter, message: error.message },
          })
          return
        }

        return streamText({
          model: chatModel(),
          // The `streamText` from the run argument appends any injected
          // instructions to this. Don't also call chat.prompt.set() or pass
          // chat.agent({ system }): the SDK throws when two system prompts are set.
          system: promptFor(turn, group),
          messages,
          tools,
          // Computer use takes many small steps: look, act, look again.
          stopWhen: stepCountIs(40),
          // Don't return `messages` here: the managed prepareStep keeps its own
          // step history, and an override would replace it. Old screenshots are
          // trimmed in the model middleware instead (trigger/model.ts).
          prepareStep: ({ steps }) => ({
            activeTools: activeToolsAfter({
              steps,
              names: Object.keys(tools),
              userText,
              isGroup,
            }) as Array<keyof typeof tools> | undefined,
            // After a handoff the next steps are the new bot's: its identity,
            // job and instructions replace the first bot's for the rest of the turn.
            ...(turn.bot.id !== bot.id
              ? { instructions: promptFor(turn, group) }
              : {}),
          }),
          abortSignal: signal,
          // Every model call's tokens go to the ledger, charged to the owner of
          // the bot answering at that step (it can change after a handoff).
          onStepEnd: ({ usage }) => {
            void recordUsageSafely(turn.bot.userId, [
              {
                metric: "ai_input_tokens",
                quantity: usage.inputTokens ?? 0,
                chatId,
                botId: turn.bot.id,
              },
              {
                metric: "ai_output_tokens",
                quantity: usage.outputTokens ?? 0,
                chatId,
                botId: turn.bot.id,
              },
            ])
          },
          // The fallback model already moves past overloaded models, so whole-call
          // retries would mostly add backoff delay before an error.
          maxRetries: 1,
        })
      } catch (error) {
        await captureTriggerError(
          error,
          { task: "chat", stage: "run" },
          { chatId }
        )
        throw error
      }
    },
    // Never send provider internals (keys, stack traces) to the browser.
    uiMessageStreamOptions: {
      onError: (error) => {
        // A used-up allowance is the user's to know about, in full.
        if (isUsageLimitError(error)) {
          return error.message
        }
        console.error("Chat stream failed", error)
        void captureTriggerError(error, { task: "chat", stage: "stream" })
        return "The bot couldn't reply right now. Please try again."
      },
    },
  })
