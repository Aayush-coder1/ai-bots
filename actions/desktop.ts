"use server"

import { auth } from "@clerk/nextjs/server"

import { getDesktop } from "@/lib/sandbox"
import { getChat } from "@/queries"

// noVNC, started by Daytona's computer use, serves the desktop on this port.
const NOVNC_PORT = 6080
// The token lives in the URL, so it is kept short-lived; the panel asks for a
// fresh one when it reloads.
const URL_LIFETIME_SECONDS = 6 * 60 * 60

/**
 * A signed noVNC URL for the bot in this chat, with its sandbox and desktop
 * started. Signed URLs carry their token, so the viewer can be an iframe
 * (which cannot send the preview token header).
 */
export async function getDesktopUrl(chatId: string) {
  const { userId } = await auth()
  if (!userId) {
    throw new Error("Unauthorized")
  }

  // Scoped to the signed-in user, so another user's desktop is not reachable.
  const chat = await getChat(chatId)
  const sandboxId = chat?.bot?.sandboxId
  if (!sandboxId) {
    throw new Error("This bot has no sandbox")
  }

  const sandbox = await getDesktop(sandboxId)
  const { url } = await sandbox.getSignedPreviewUrl(
    NOVNC_PORT,
    URL_LIFETIME_SECONDS
  )

  const params = new URLSearchParams({
    autoconnect: "true",
    reconnect: "true",
    resize: "scale",
  })

  return `${url}/vnc.html?${params}`
}
