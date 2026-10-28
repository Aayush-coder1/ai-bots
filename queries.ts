import { auth } from "@clerk/nextjs/server";
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { type Bot, type Chat, chats } from "@/db/schema";

export type ChatListItem = {
  id: string;
  kind: "direct" | "group";
  name: string | null;
  lastMessagePreview: string | null;
  lastMessageAt: Date;
  bot: Bot | null;
};

export type ChatWithBot = Chat & { bot: Bot | null };

export async function getChats(): Promise<ChatListItem[]> {
  const { userId } = await auth();
  if (!userId) {
    return [];
  }

  const rows = await db.query.chats.findMany({
    where: eq(chats.userId, userId),
    orderBy: desc(chats.lastMessageAt),
    with: {
      members: {
        with: { bot: true },
      },
    },
  });

  return rows.map((chat) => ({
    id: chat.id,
    kind: chat.kind,
    name: chat.name,
    lastMessagePreview: chat.lastMessagePreview,
    lastMessageAt: chat.lastMessageAt,
    // Group chats have several members; until they get their own UI, the first
    // bot stands in for the conversation.
    bot: chat.members[0]?.bot ?? null,
  }));
}

export async function getChat(chatId: string): Promise<ChatWithBot | null> {
  const { userId } = await auth();
  if (!userId) {
    return null;
  }

  const chat = await db.query.chats.findFirst({
    where: and(eq(chats.id, chatId), eq(chats.userId, userId)),
    with: {
      members: {
        with: { bot: true },
      },
    },
  });

  if (!chat) {
    return null;
  }

  return {
    ...chat,
    bot: chat.members[0]?.bot ?? null,
  };
}
