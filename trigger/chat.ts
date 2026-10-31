import { chat } from "@trigger.dev/sdk/ai"
import { stepCountIs } from "ai"
import { z } from "zod"

import type { Bot } from "@/db/schema"
import { chatTranscriptStorage } from "@/lib/chat-transcript-storage"
import { mentionedBot } from "@/lib/mentions"
import { getChatBot, getChatContext } from "@/trigger/bot"
import { buildBotSystemPrompt, type PromptGroup } from "@/trigger/bot-prompt"
import { chatModel } from "@/trigger/model"
import {
  activeToolsAfter,
  type ChatUIMessage,
  createSandboxTools,
  type HandoffResult,
  keepLatestScreenshots,
  latestUserText,
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

async function sandboxIdFor(chatId: string, botId?: string) {
  const bot = turns.get(chatId)?.bot ?? (await getChatBot(chatId, botId))
  if (!bot.sandboxId) {
    throw new Error("This bot has no sandbox")
  }
  return bot.sandboxId
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
const clientDataSchema = z.object({
  botId: z.string().optional(),
})

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
        () => sandboxIdFor(chatId, clientData?.botId),
        (input) => handOff(chatId, input)
      ),
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
      const context = await getChatContext(chatId)
      // Decides whether showScreen is on offer this turn (see activeToolsAfter),
      // and carries any "@[Name]" tag.
      const userText = latestUserText(messages)
      // A tagged bot answers: the tag in the text wins over the picker's id,
      // so the turn goes where the message says even if the two disagree.
      const tagged =
        context.kind === "group"
          ? mentionedBot(userText, context.bots, clientData?.botId)
          : undefined
      const bot = tagged ?? (await getChatBot(chatId, clientData?.botId))
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
        // The fallback model already moves past overloaded models, so whole-call
        // retries would mostly add backoff delay before an error.
        maxRetries: 1,
      })
    },
    // Never send provider internals (keys, stack traces) to the browser.
    uiMessageStreamOptions: {
      onError: (error) => {
        console.error("Chat stream failed", error)
        return "The bot couldn't reply right now. Please try again."
      },
    },
  })
