"use server";

import { auth } from "@clerk/nextjs/server";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { nanoid } from "nanoid";

import { db } from "@/db";
import {
  type Bot,
  type Chat,
  type ChatMember,
  bots,
  chatMembers,
  chats,
  insertBotSchema,
} from "@/db/schema";

export async function createBot(input: unknown) {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Unauthorized");
  }

  const parsed = insertBotSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const instructions = parsed.data.instructions?.trim()
    ? parsed.data.instructions
    : undefined;

  const botId = nanoid();
  const chatId = nanoid();

  const [[bot]] = (await db.batch([
    db
      .insert(bots)
      .values({
        id: botId,
        ...parsed.data,
        instructions,
        userId,
      })
      .returning(),
    db
      .insert(chats)
      .values({
        id: chatId,
        userId,
        kind: "direct",
      })
      .returning(),
    db.insert(chatMembers).values({ chatId, botId }).returning(),
  ])) as [[Bot], [Chat], [ChatMember]];

  revalidatePath("/");

  return bot;
}

export async function updateBot(botId: string, input: unknown) {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Unauthorized");
  }

  const parsed = insertBotSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const instructions = parsed.data.instructions?.trim()
    ? parsed.data.instructions
    : null;

  const [bot] = await db
    .update(bots)
    .set({ ...parsed.data, instructions })
    .where(and(eq(bots.id, botId), eq(bots.userId, userId)))
    .returning();

  if (!bot) {
    throw new Error("Bot not found");
  }

  revalidatePath("/", "layout");

  return bot;
}

export async function deleteBot(botId: string) {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Unauthorized");
  }

  // Collect the conversations this bot is part of before it disappears, so the
  // direct ones can be cleaned up alongside it.
  const memberships = await db
    .select({ chatId: chatMembers.chatId })
    .from(chatMembers)
    .innerJoin(chats, eq(chats.id, chatMembers.chatId))
    .where(and(eq(chatMembers.botId, botId), eq(chats.userId, userId)));

  const [bot] = await db
    .delete(bots)
    .where(and(eq(bots.id, botId), eq(bots.userId, userId)))
    .returning();

  if (!bot) {
    throw new Error("Bot not found");
  }

  const chatIds = memberships.map(({ chatId }) => chatId);

  if (chatIds.length > 0) {
    await db
      .delete(chats)
      .where(
        and(
          inArray(chats.id, chatIds),
          eq(chats.userId, userId),
          eq(chats.kind, "direct")
        )
      );
  }

  revalidatePath("/", "layout");

  return bot;
}
