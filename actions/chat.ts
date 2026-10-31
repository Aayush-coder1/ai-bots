"use server"

import { auth as clerkAuth } from "@clerk/nextjs/server"
import { auth } from "@trigger.dev/sdk"
import { chat, type ChatStartSessionParams } from "@trigger.dev/sdk/ai"

import { FEATURES } from "@/lib/billing"
import { requireFeatures } from "@/lib/billing-server"
import { getChat } from "@/queries"
import type { chatAgent } from "@/trigger/chat"

const startSession = chat.createStartSessionAction<typeof chatAgent>("chat")

async function assertChatOwner(chatId: string) {
  const { userId } = await clerkAuth()
  if (!userId) {
    throw new Error("Unauthorized")
  }

  // Chatting runs the bot and, through its tools, its sandbox. Checked on
  // every session start and on every hourly token refresh, so a lapsed plan
  // stops chats within the hour.
  await requireFeatures(FEATURES.bots, FEATURES.sandboxes)

  // Scoped to the signed-in user, so another user's chat id is not readable.
  const chat = await getChat(chatId)
  if (!chat) {
    throw new Error("Unauthorized")
  }
}

export async function startChatSession(
  params: ChatStartSessionParams<typeof chatAgent>
) {
  await assertChatOwner(params.chatId)

  return startSession(params)
}

export async function mintChatAccessToken(chatId: string) {
  await assertChatOwner(chatId)

  return auth.createPublicToken({
    scopes: {
      read: { sessions: chatId },
      write: { sessions: chatId },
    },
    expirationTime: "1h",
  })
}
