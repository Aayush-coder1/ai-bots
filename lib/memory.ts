import type { Sandbox } from "@daytona/sdk"

/**
 * Each bot's long-term memory: a Markdown file in its own sandbox. The
 * sandbox belongs to the bot, not to a chat, so what it writes in a private
 * chat is there to read in any group chat it is in.
 */
export const MEMORY_FILE = "/home/daytona/MEMORY.md"

/** Creates the bot's memory file, blank, unless it already exists. */
export async function ensureMemoryFile(sandbox: Sandbox) {
  await sandbox.process.executeCommand(
    `test -e ${MEMORY_FILE} || : > ${MEMORY_FILE}`
  )
}
