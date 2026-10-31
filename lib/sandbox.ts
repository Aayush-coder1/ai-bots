import type { Sandbox } from "@daytona/sdk"

import { ensureAudioStream } from "@/lib/audio"
import { getDaytona } from "@/lib/daytona"

type Entry = {
  sandbox: Promise<Sandbox>
  desktop?: Promise<void>
  checkedAt: number
}

// Daytona stops an idle sandbox after its auto-stop interval (15 minutes by
// default), so a handle older than this is checked again before use.
const RECHECK_AFTER_MS = 5 * 60 * 1000

const entries = new Map<string, Entry>()

async function startSandbox(sandboxId: string) {
  const sandbox = await getDaytona().get(sandboxId)

  if (sandbox.state !== "started") {
    await sandbox.start()
  }

  return sandbox
}

function getEntry(sandboxId: string) {
  const existing = entries.get(sandboxId)

  if (existing && Date.now() - existing.checkedAt < RECHECK_AFTER_MS) {
    existing.checkedAt = Date.now()
    return existing
  }

  const entry: Entry = {
    sandbox: startSandbox(sandboxId),
    checkedAt: Date.now(),
  }

  // A failed start must not stick, or every later tool call fails with it.
  entry.sandbox.catch(() => entries.delete(sandboxId))
  entries.set(sandboxId, entry)

  return entry
}

/** The bot's sandbox, started if it had stopped. */
export function getSandbox(sandboxId: string) {
  return getEntry(sandboxId).sandbox
}

/** The bot's sandbox with its desktop (X server, window manager) running. */
export async function getDesktop(sandboxId: string) {
  const entry = getEntry(sandboxId)
  const sandbox = await entry.sandbox

  entry.desktop ??= (async () => {
    const { status } = await sandbox.computerUse.getStatus()
    if (status !== "active") {
      await sandbox.computerUse.start()
    }
    // Sound for the desktop: started with it, so it's there whenever the
    // desktop is. Not worth failing the desktop over.
    await ensureAudioStream(sandbox).catch((error) =>
      console.error(`Failed to start audio in sandbox ${sandboxId}`, error)
    )
  })()

  entry.desktop.catch(() => {
    entry.desktop = undefined
  })

  await entry.desktop
  return sandbox
}
