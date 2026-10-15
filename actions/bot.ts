"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { bots, insertBotSchema } from "@/db/schema";

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

  const [bot] = await db
    .insert(bots)
    .values({
      ...parsed.data,
      instructions,
      userId,
    })
    .returning();

  revalidatePath("/");

  return bot;
}
