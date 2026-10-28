import { auth } from "@clerk/nextjs/server";
import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { type Bot, chats } from "@/db/schema";

export type ChatListItem = {
  id: string;
  kind: "direct" | "group";
  name: string | null;
  lastMessagePreview: string | null;
  lastMessageAt: Date;
  bot: Bot | null;
};

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
