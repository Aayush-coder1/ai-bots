"use server";

import { auth } from "@clerk/nextjs/server";
import { and, eq, inArray } from "drizzle-orm";
import * as Sentry from "@sentry/nextjs";
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
import { deleteSandbox, getDaytona } from "@/lib/daytona";
import { FEATURES, upgradeRequired } from "@/lib/billing";
import { hasFeatures } from "@/lib/billing-server";
import { ensureMemoryFile } from "@/lib/memory";

export async function createBot(input: unknown) {
  const { userId } = await auth();
  if (!userId) {
    throw new Error("Unauthorized");
  }

  // A bot comes with its own sandbox, so creating one needs both. Returned,
  // not thrown: production Next.js hides thrown messages, and the dialog
  // needs to tell a paywall apart from a failure.
  if (!(await hasFeatures(FEATURES.bots, FEATURES.sandboxes))) {
    Sentry.logger.info("Bot creation blocked by paywall", { userId });
    return upgradeRequired;
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

  const sandbox = await getDaytona().create();

  // The bot's memory starts blank. Not worth failing bot creation over: the
  // agent creates the file itself if it's ever missing.
  Sentry.logger.info("Sandbox created for bot", {
    botId,
    sandboxId: sandbox.id,
  });

  await ensureMemoryFile(sandbox).catch((error) =>
    console.error(`Failed to create MEMORY.md in sandbox ${sandbox.id}`, error)
  );

  const inserted = await db
    .batch([
      db
        .insert(bots)
        .values({
          id: botId,
          ...parsed.data,
          instructions,
          userId,
          sandboxId: sandbox.id,
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
    ])
    // Don't leave an orphaned sandbox behind if the bot never got persisted.
    .catch(async (error) => {
      Sentry.logger.error("Saving new bot failed; deleting its sandbox", {
        botId,
        sandboxId: sandbox.id,
      });
      await deleteSandbox(sandbox.id);
      throw error;
    });

  const [[bot]] = inserted as [[Bot], [Chat], [ChatMember]];

  Sentry.logger.info("Bot created", { botId, chatId, userId });

  revalidatePath("/");

  return { ok: true as const, bot };
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

  Sentry.logger.info("Bot updated", { botId, userId });

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

  if (bot.sandboxId) {
    await deleteSandbox(bot.sandboxId);
  }

  Sentry.logger.info("Bot deleted", {
    botId,
    userId,
    chatsRemoved: chatIds.length,
  });

  revalidatePath("/", "layout");

  return bot;
}
