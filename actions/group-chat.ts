"use server"

import { auth } from "@clerk/nextjs/server"
import { and, eq, inArray } from "drizzle-orm"
import { nanoid } from "nanoid"
import { revalidatePath } from "next/cache"

import { db } from "@/db"
import { bots, chatMembers, chats, insertGroupChatSchema } from "@/db/schema"

export async function createGroupChat(input: unknown) {
  const { userId } = await auth()
  if (!userId) {
    throw new Error("Unauthorized")
  }

  const parsed = insertGroupChatSchema.safeParse(input)
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid input")
  }

  const name = parsed.data.name.trim()
  if (!name) {
    throw new Error("Name is required")
  }

  const botIds = [...new Set(parsed.data.botIds)]

  // Only the user's own bots can join their group.
  const owned = await db
    .select({ id: bots.id })
    .from(bots)
    .where(and(inArray(bots.id, botIds), eq(bots.userId, userId)))
  if (owned.length !== botIds.length || owned.length < 2) {
    throw new Error("Pick at least two of your bots")
  }

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

  return { id: chatId }
}
