import { auth } from "@clerk/nextjs/server"
import { and, asc, desc, eq } from "drizzle-orm"

import { db } from "@/db"
import { type Bot, type Chat, bots, chats } from "@/db/schema"

export type ChatListItem = {
  id: string
  kind: "direct" | "group"
  name: string | null
  lastMessagePreview: string | null
  lastMessageAt: Date
  /** The bot of a direct chat; null for group chats. */
  bot: Bot | null
  /** Every bot in the chat, in the order they joined. */
  bots: Bot[]
}

export type ChatWithBot = Chat & { bot: Bot | null; bots: Bot[] }

function membersOf(chat: { kind: Chat["kind"]; members: { bot: Bot }[] }) {
  const members = chat.members.map((member) => member.bot)
  return {
    bots: members,
    bot: chat.kind === "direct" ? (members[0] ?? null) : null,
  }
}

export async function getChats(): Promise<ChatListItem[]> {
  const { userId } = await auth()
  if (!userId) {
    return []
  }

  const rows = await db.query.chats.findMany({
    where: eq(chats.userId, userId),
    orderBy: desc(chats.lastMessageAt),
    with: {
      members: {
        with: { bot: true },
        orderBy: (member, { asc }) => asc(member.joinedAt),
      },
    },
  })

  return rows.map((chat) => ({
    id: chat.id,
    kind: chat.kind,
    name: chat.name,
    lastMessagePreview: chat.lastMessagePreview,
    lastMessageAt: chat.lastMessageAt,
    ...membersOf(chat),
  }))
}

export async function getChat(chatId: string): Promise<ChatWithBot | null> {
  const { userId } = await auth()
  if (!userId) {
    return null
  }

  const chat = await db.query.chats.findFirst({
    where: and(eq(chats.id, chatId), eq(chats.userId, userId)),
    with: {
      members: {
        with: { bot: true },
        orderBy: (member, { asc }) => asc(member.joinedAt),
      },
    },
  })

  if (!chat) {
    return null
  }

  const { members, ...rest } = chat
  return { ...rest, ...membersOf({ kind: chat.kind, members }) }
}

/** The signed-in user's bots, oldest first. */
export async function getBots(): Promise<Bot[]> {
  const { userId } = await auth()
  if (!userId) {
    return []
  }

  return db.query.bots.findMany({
    where: eq(bots.userId, userId),
    orderBy: asc(bots.createdAt),
  })
}
