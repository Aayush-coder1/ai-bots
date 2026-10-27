"use server";

import { auth } from "@clerk/nextjs/server";
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
