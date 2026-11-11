"use server"

import { auth } from "@clerk/nextjs/server"
import * as Sentry from "@sentry/nextjs"

import { FEATURES } from "@/lib/billing"
import { hasFeatures } from "@/lib/billing-server"
import { getSandbox } from "@/lib/sandbox"
import { getChat } from "@/queries"

/** Kept in step with MAX_SHARED_FILE_BYTES in trigger/tools.ts. */
const MAX_BYTES = 3 * 1024 * 1024

export type SharedFileResult =
  | { ok: true; name: string; base64: string }
  | {
      ok: false
      reason: "unauthorized" | "upgrade-required" | "not-found" | "too-large"
    }

/**
 * A file a bot shared with shareFile, read from that bot's sandbox. The path
 * comes from the chat transcript, so it is only ever looked up in the
 * sandboxes of bots that are in this chat, which the user owns.
 */
export async function downloadSharedFile(
  chatId: string,
  path: string
): Promise<SharedFileResult> {
  const { userId } = await auth()
  if (!userId) {
    return { ok: false, reason: "unauthorized" }
  }
  // Reading the file starts the sandbox, which is a paid resource.
  if (!(await hasFeatures(FEATURES.sandboxes))) {
    return { ok: false, reason: "upgrade-required" }
  }
  // Scoped to the signed-in user, so another user's chat id is not readable.
  const chat = await getChat(chatId)
  if (!chat || !path.startsWith("/") || path.length > 1000) {
    return { ok: false, reason: "not-found" }
  }

  for (const bot of chat.bots) {
    if (!bot.sandboxId) {
      continue
    }
    try {
      const sandbox = await getSandbox(bot.sandboxId)
      const buffer = await sandbox.fs.downloadFile(path)
      if (buffer.length > MAX_BYTES) {
        return { ok: false, reason: "too-large" }
      }
      Sentry.logger.info("Shared file downloaded", {
        chatId,
        botId: bot.id,
        bytes: buffer.length,
      })
      return {
        ok: true,
        name: path.split("/").pop() || "file",
        base64: buffer.toString("base64"),
      }
    } catch {
      // Not in this bot's sandbox; a group has several.
    }
  }
  return { ok: false, reason: "not-found" }
}
