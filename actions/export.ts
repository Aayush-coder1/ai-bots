"use server"

import { auth } from "@clerk/nextjs/server"
import * as Sentry from "@sentry/nextjs"

import { chatName } from "@/lib/chat-name"
import { chatTranscriptStorage } from "@/lib/chat-transcript-storage"
import { getChat } from "@/queries"
import type { ChatUIMessage } from "@/trigger/tools"

export type ExportChatResult =
  | { ok: true; filename: string; markdown: string }
  | { ok: false; reason: "unauthorized" | "not-found" | "failed" }

function slug(text: string) {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "chat"
  )
}

/**
 * The chat's saved transcript as Markdown: who said what, with each action a
 * bot took noted in place. Screenshots and raw tool output are left out.
 * Not paywalled: the conversation is the user's own data.
 */
export async function exportChatMarkdown(
  chatId: string
): Promise<ExportChatResult> {
  const { userId } = await auth()
  if (!userId) {
    return { ok: false, reason: "unauthorized" }
  }

  try {
    // Scoped to the signed-in user, so another user's chat id is not readable.
    const chat = await getChat(chatId)
    if (!chat) {
      return { ok: false, reason: "not-found" }
    }

    const { messages } = await chatTranscriptStorage.load<ChatUIMessage>({
      chatId: chat.id,
      clientData: undefined,
    })
    const botsById = new Map(chat.bots.map((bot) => [bot.id, bot]))
    const name = chatName(chat)

    const lines = [
      `# ${name}`,
      "",
      `_Exported ${new Date().toISOString()} from ai-bots._`,
      "",
    ]

    for (const message of messages) {
      const author =
        message.role === "user"
          ? "You"
          : (botsById.get(message.metadata?.botId ?? "")?.name ??
            chat.bot?.name ??
            "Bot")
      lines.push(`## ${author}`, "")

      for (const part of message.parts) {
        if (part.type === "text" && part.text.trim()) {
          lines.push(part.text.trim(), "")
        } else if (part.type.startsWith("tool-")) {
          lines.push(`> Used \`${part.type.slice("tool-".length)}\``, "")
        }
      }
    }

    Sentry.logger.info("Chat exported", { chatId, messages: messages.length })

    return {
      ok: true,
      filename: `${slug(name)}.md`,
      markdown: lines.join("\n"),
    }
  } catch (error) {
    Sentry.captureException(error)
    return { ok: false, reason: "failed" }
  }
}
