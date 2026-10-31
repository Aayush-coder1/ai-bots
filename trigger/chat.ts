import { chat } from "@trigger.dev/sdk/ai"
import { stepCountIs } from "ai"
import { z } from "zod"

import { buildBotSystemPrompt } from "@/trigger/bot-prompt"
import { getChatBot } from "@/trigger/bot"
import { chatModel } from "@/trigger/model"
import {
  activeToolsAfter,
  type ChatUIMessage,
  createSandboxTools,
  keepLatestScreenshots,
  latestUserText,
} from "@/trigger/tools"
import { chatTranscriptStorage } from "@/lib/chat-transcript-storage"

async function sandboxIdFor(chatId: string, botId?: string) {
  const { sandboxId } = await getChatBot(chatId, botId)
  if (!sandboxId) {
    throw new Error("This bot has no sandbox")
  }
  return sandboxId
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
    // tools act on the sandbox of the bot answering this turn.
    tools: ({ chatId, clientData }) =>
      createSandboxTools(() => sandboxIdFor(chatId, clientData?.botId)),
    // Fetch the bot while the run boots, so the first turn rarely waits on it.
    onBoot: async ({ chatId }) => {
      await getChatBot(chatId)
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
      const bot = await getChatBot(chatId, clientData?.botId)

      // Stamp the reply with the bot that wrote it, so a group chat can show
      // who answered (and keep showing it after a reload).
      chat.setUIMessageStreamOptions({
        messageMetadata: ({ part }) =>
          part.type === "start" ? { botId: bot.id } : undefined,
      })
      // Decides whether showScreen is on offer this turn (see activeToolsAfter).
      const userText = latestUserText(messages)

      return streamText({
        model: chatModel(),
        // The `streamText` from the run argument appends any injected
        // instructions to this. Don't also call chat.prompt.set() or pass
        // chat.agent({ system }): the SDK throws when two system prompts are set.
        system: buildBotSystemPrompt(bot),
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
          }) as Array<keyof typeof tools> | undefined,
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
