import { eq } from "drizzle-orm"

import { db } from "@/db"
import { type Bot, chatMembers } from "@/db/schema"

// Group chats have several members; until they get their own handling, the
// first bot answers, matching how the UI picks one.
async function fetchChatBot(chatId: string) {
  const membership = await db.query.chatMembers.findFirst({
    where: eq(chatMembers.chatId, chatId),
    with: { bot: true },
  })

  if (!membership?.bot) {
    throw new Error(`No bot found for chat ${chatId}`)
  }

  return membership.bot
}

// One worker serves one chat for many turns, so the bot is read once and then
// refreshed in the background: later turns skip the database round trip, and
// an edit to the bot still applies from the following reply.
const botCache = new Map<string, Bot>()

export async function getChatBot(chatId: string) {
  const cached = botCache.get(chatId)

  if (!cached) {
    const bot = await fetchChatBot(chatId)
    botCache.set(chatId, bot)
    return bot
  }

  fetchChatBot(chatId)
    .then((bot) => botCache.set(chatId, bot))
    .catch((error) => console.error("Failed to refresh bot", error))

  return cached
}
