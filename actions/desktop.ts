"use server"

import { auth } from "@clerk/nextjs/server"

import { DaytonaConfigError } from "@/lib/daytona"
import { getDesktop } from "@/lib/sandbox"
import { getChat } from "@/queries"

// noVNC, started by Daytona's computer use, serves the desktop on this port.
const NOVNC_PORT = 6080
// The token lives in the URL, so it is kept short-lived; the panel asks for a
// fresh one before it runs out (see DesktopPanelProvider).
const URL_LIFETIME_SECONDS = 6 * 60 * 60

export type DesktopUrlResult =
  | { ok: true; url: string; expiresAt: number }
  | {
      ok: false
      reason: "unauthorized" | "no-sandbox" | "not-configured" | "failed"
    }

/**
 * A signed noVNC URL for the bot in this chat, with its sandbox and desktop
 * started. Signed URLs carry their token, so the viewer can be an iframe
 * (which cannot send the preview token header).
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

  // Scoped to the signed-in user, so another user's desktop is not reachable.
  const chat = await getChat(chatId)
  const sandboxId = chat?.bot?.sandboxId
  if (!sandboxId) {
    return { ok: false, reason: "no-sandbox" }
  }

  try {
    const sandbox = await getDesktop(sandboxId)
    const signed = await sandbox.getSignedPreviewUrl(
      NOVNC_PORT,
      URL_LIFETIME_SECONDS
    )
    // Keep whatever the URL carries (a token subdomain today, but a proxy
    // may use a path prefix or query string) and add noVNC's page to it.
    const viewer = new URL(signed.url)
    const prefix = viewer.pathname.replace(/\/?$/, "/")
    viewer.pathname = `${prefix}vnc.html`

    const params = {
      autoconnect: "true",
      reconnect: "true",
      reconnect_delay: "2000",
      resize: "scale",
      // noVNC opens its WebSocket on the page's own host. Naming the scheme
      // keeps it on wss:// for an https preview, whatever the default.
      encrypt: viewer.protocol === "https:" ? "true" : "false",
      // Relative to the host, so a proxy path prefix must be included.
      path: `${prefix.slice(1)}websockify`,
    }
    for (const [key, value] of Object.entries(params)) {
      viewer.searchParams.set(key, value)
    }

    return {
      ok: true,
      url: viewer.toString(),
      expiresAt: Date.now() + URL_LIFETIME_SECONDS * 1000,
    }
  } catch (error) {
    console.error(`Failed to start the desktop of sandbox ${sandboxId}`, error)
    return {
      ok: false,
      reason: error instanceof DaytonaConfigError ? "not-configured" : "failed",
    }
  }
}
