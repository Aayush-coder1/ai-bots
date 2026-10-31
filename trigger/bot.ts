import { asc, eq } from "drizzle-orm"

import { db } from "@/db"
import { type Bot, type Chat, chatMembers, chats } from "@/db/schema"

export type ChatContext = {
  kind: Chat["kind"]
  name: string | null
  /** Every bot in the chat, in the order they joined. */
  bots: Bot[]
}

async function fetchChatContext(chatId: string): Promise<ChatContext> {
  const chat = await db.query.chats.findFirst({
    where: eq(chats.id, chatId),
    with: {
      members: {
        with: { bot: true },
        orderBy: asc(chatMembers.joinedAt),
      },
    },
  })

  const bots = chat?.members.map((member) => member.bot) ?? []
  if (!chat || bots.length === 0) {
    throw new Error(`No bot found for chat ${chatId}`)
  }
  return { kind: chat.kind, name: chat.name, bots }
}

// One worker serves one chat for many turns, so the chat is read once and
// then refreshed in the background: later turns skip the database round
// trip, and an edit to a bot still applies from the following reply.
const contextCache = new Map<string, ChatContext>()

/** Reads the chat again now, for when the cached members may be out of date. */
export async function refreshChatContext(chatId: string) {
  const context = await fetchChatContext(chatId)
  contextCache.set(chatId, context)
  return context
}

export async function getChatContext(chatId: string) {
  const cached = contextCache.get(chatId)

  if (!cached) {
    const context = await fetchChatContext(chatId)
    contextCache.set(chatId, context)
    return context
  }

  fetchChatContext(chatId)
    .then((context) => contextCache.set(chatId, context))
    .catch((error) => console.error("Failed to refresh chat", error))

  return cached
}

/**
 * The bot that answers this turn. In a group chat the user picks it in the
 * UI and its id arrives as client data; that id is only trusted if the bot
 * is a member of this chat. A direct chat, or no pick, gets the first bot.
 */
export async function getChatBot(chatId: string, botId?: string) {
  const { bots } = await getChatContext(chatId)
  return bots.find((bot) => bot.id === botId) ?? bots[0]
}
