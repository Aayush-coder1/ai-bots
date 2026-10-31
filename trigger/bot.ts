import { asc, eq } from "drizzle-orm"

import { db } from "@/db"
import { type Bot, chatMembers } from "@/db/schema"

async function fetchChatBots(chatId: string) {
  const memberships = await db.query.chatMembers.findMany({
    where: eq(chatMembers.chatId, chatId),
    with: { bot: true },
    orderBy: asc(chatMembers.joinedAt),
  })

  const bots = memberships.map((membership) => membership.bot)
  if (bots.length === 0) {
    throw new Error(`No bot found for chat ${chatId}`)
  }
  return bots
}

// One worker serves one chat for many turns, so its bots are read once and
// then refreshed in the background: later turns skip the database round
// trip, and an edit to a bot still applies from the following reply.
const membersCache = new Map<string, Bot[]>()

async function getChatBots(chatId: string) {
  const cached = membersCache.get(chatId)

  if (!cached) {
    const bots = await fetchChatBots(chatId)
    membersCache.set(chatId, bots)
    return bots
  }

  fetchChatBots(chatId)
    .then((bots) => membersCache.set(chatId, bots))
    .catch((error) => console.error("Failed to refresh chat bots", error))

  return cached
}

/**
 * The bot that answers this turn. In a group chat the user picks it in the
 * UI and its id arrives as client data; that id is only trusted if the bot
 * is a member of this chat. A direct chat, or no pick, gets the first bot.
 */
export async function getChatBot(chatId: string, botId?: string) {
  const bots = await getChatBots(chatId)
  return bots.find((bot) => bot.id === botId) ?? bots[0]
}
