"use server"

import { auth } from "@clerk/nextjs/server"
import { and, asc, eq, inArray, notInArray } from "drizzle-orm"
import { nanoid } from "nanoid"
import { revalidatePath } from "next/cache"

import { db } from "@/db"
import { FEATURES, upgradeRequired } from "@/lib/billing"
import { hasFeatures } from "@/lib/billing-server"
import { bots, chatMembers, chats, insertGroupChatSchema } from "@/db/schema"

export async function createGroupChat(input: unknown) {
  const { userId } = await auth()
  if (!userId) {
    throw new Error("Unauthorized")
  }

  if (!(await hasFeatures(FEATURES.bots))) {
    return upgradeRequired
  }

  const { name, botIds } = await parseGroupInput(userId, input)

  const chatId = nanoid()

  await db.batch([
    db.insert(chats).values({ id: chatId, userId, kind: "group", name }),
    // Members join in the order picked, which is the order shown and the
    // default bot to talk to.
    db.insert(chatMembers).values(
      botIds.map((botId, index) => ({
        chatId,
        botId,
        joinedAt: new Date(Date.now() + index),
      }))
    ),
  ])

  revalidatePath("/", "layout")

  return { ok: true as const, id: chatId }
}

// Parses the form and checks every picked bot belongs to the user. Shared by
// create and update, which accept the same fields.
async function parseGroupInput(userId: string, input: unknown) {
  const parsed = insertGroupChatSchema.safeParse(input)
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid input")
  }

  const name = parsed.data.name.trim()
  if (!name) {
    throw new Error("Name is required")
  }

  const botIds = [...new Set(parsed.data.botIds)]
  const owned = await db
    .select({ id: bots.id })
    .from(bots)
    .where(and(inArray(bots.id, botIds), eq(bots.userId, userId)))
  if (owned.length !== botIds.length || owned.length < 2) {
    throw new Error("Pick at least two of your bots")
  }

  return { name, botIds }
}

export async function updateGroupChat(chatId: string, input: unknown) {
  const { userId } = await auth()
  if (!userId) {
    throw new Error("Unauthorized")
  }

  const { name, botIds } = await parseGroupInput(userId, input)

  const chat = await db.query.chats.findFirst({
    where: and(
      eq(chats.id, chatId),
      eq(chats.userId, userId),
      eq(chats.kind, "group")
    ),
    with: { members: { orderBy: asc(chatMembers.joinedAt) } },
  })
  if (!chat) {
    throw new Error("Group chat not found")
  }

  // Members who stay keep their place, so the default bot doesn't change
  // unless it was removed; new members join at the end, in the order picked.
  const current = new Set(chat.members.map((member) => member.botId))
  const added = botIds.filter((botId) => !current.has(botId))

  await db.batch([
    db.update(chats).set({ name }).where(eq(chats.id, chatId)),
    db
      .delete(chatMembers)
      .where(
        and(
          eq(chatMembers.chatId, chatId),
          notInArray(chatMembers.botId, botIds)
        )
      ),
    ...(added.length > 0
      ? [
          db.insert(chatMembers).values(
            added.map((botId, index) => ({
              chatId,
              botId,
              joinedAt: new Date(Date.now() + index),
            }))
          ),
        ]
      : []),
  ])

  revalidatePath("/", "layout")

  return { id: chatId }
}

export async function deleteGroupChat(chatId: string) {
  const { userId } = await auth()
  if (!userId) {
    throw new Error("Unauthorized")
  }

  // Members and the transcript go with it (cascade); the bots stay.
  const [chat] = await db
    .delete(chats)
    .where(
      and(
        eq(chats.id, chatId),
        eq(chats.userId, userId),
        eq(chats.kind, "group")
      )
    )
    .returning({ id: chats.id })

  if (!chat) {
    throw new Error("Group chat not found")
  }

  revalidatePath("/", "layout")

  return chat
}
