"use server"

import { auth } from "@clerk/nextjs/server"

import { FEATURES } from "@/lib/billing"
import { hasFeatures } from "@/lib/billing-server"
import {
  DesktopUnavailable,
  getLiveDesktop,
  LIVE_URL_LIFETIME_MS,
  liveDesktopUrls,
} from "@/lib/desktop"
import { getChat } from "@/queries"

export type DesktopUrlResult =
  | {
      ok: true
      url: string
      /** The desktop's sound as an MP3 stream; VNC carries no audio. */
      audioUrl: string
      expiresAt: number
    }
  | {
      ok: false
      reason:
        | "unauthorized"
        | "upgrade-required"
        | "no-sandbox"
        | "not-configured"
        | "failed"
    }

/**
 * The noVNC URL of the bot's live desktop in this chat, started if needed.
 * Asking again before expiresAt also keeps the desktop from shutting down.
 *
 * Returns a reason instead of throwing: in production Next.js replaces a
 * thrown server action error with a generic one, and the panel needs to know
 * what went wrong to say so.
 */
export async function getDesktopUrl(chatId: string): Promise<DesktopUrlResult> {
  const { userId } = await auth()
  if (!userId) {
    return { ok: false, reason: "unauthorized" }
  }

  if (!(await hasFeatures(FEATURES.sandboxes))) {
    return { ok: false, reason: "upgrade-required" }
  }

  // Scoped to the signed-in user, so another user's desktop is not reachable.
  const chat = await getChat(chatId)
  const sandboxId = chat?.bot?.sandboxId
  if (!sandboxId) {
    return { ok: false, reason: "no-sandbox" }
  }

  try {
    // The bot's live screen runs on E2B, which has the open internet; it is
    // keyed by the bot's Daytona sandbox so the bot's tools use the same one.
    const desktop = await getLiveDesktop(sandboxId)
    return {
      ok: true,
      ...liveDesktopUrls(desktop),
      expiresAt: Date.now() + LIVE_URL_LIFETIME_MS,
    }
  } catch (error) {
    console.error(`Failed to start the desktop of sandbox ${sandboxId}`, error)
    return {
      ok: false,
      reason: error instanceof DesktopUnavailable ? "not-configured" : "failed",
    }
  }
}
