import { Sandbox } from "@e2b/code-interpreter"

import { assertWithinLimits, recordRunningTimeSafely } from "@/lib/usage"

// A second, temporary computer with the open internet, for code that needs
// to reach the web: Daytona limits sandboxes on lower tiers to package
// registries and code hosts. The bot's own Daytona sandbox stays its main
// computer (terminal, files, desktop, sound); this one only runs code.

// Kept alive this long after its last use, then E2B shuts it down.
const IDLE_TIMEOUT_MS = 10 * 60 * 1000
const MAX_OUTPUT_CHARS = 20_000

export type OnlineLanguage = "python" | "javascript" | "bash"

export type OnlineRunResult = {
  language: OnlineLanguage
  exitCode: number | null
  stdout: string
  stderr: string
  /** The value of the last expression (python/javascript), if any. */
  result?: string
  error?: string
  truncated: boolean
}

/** Thrown when E2B isn't set up, so the bot can say so plainly. */
export class OnlineSandboxUnavailable extends Error {
  name = "OnlineSandboxUnavailable"
}

function apiKey() {
  const key = process.env.E2B_API_KEY?.trim()
  if (!key) {
    throw new OnlineSandboxUnavailable(
      "The online sandbox isn't configured (E2B_API_KEY is not set)."
    )
  }
  return key
}

// One per chat and bot, reused across calls and turns while it lives.
const sandboxes = new Map<string, Promise<Sandbox>>()

// Who pays for each sandbox and since when, so its running time can be
// charged to the usage ledger.
type Billing = {
  userId: string
  chatId: string
  botId: string
  startedAt: Date
}
const billing = new Map<string, Billing>()

function chargeRunningTime(sandboxId: string) {
  const owner = billing.get(sandboxId)
  if (!owner) {
    return Promise.resolve()
  }
  return recordRunningTimeSafely({
    userId: owner.userId,
    chatId: owner.chatId,
    botId: owner.botId,
    metric: "e2b_code_seconds",
    resourceId: sandboxId,
    startedAt: owner.startedAt,
  })
}

function create(key: string, metadata: Record<string, string>, userId: string) {
  const sandbox = Sandbox.create({
    apiKey: apiKey(),
    timeoutMs: IDLE_TIMEOUT_MS,
    allowInternetAccess: true,
    metadata,
  })
  sandbox
    .then((created) =>
      billing.set(created.sandboxId, {
        userId,
        chatId: metadata.chatId,
        botId: metadata.botId,
        startedAt: new Date(),
      })
    )
    .catch(() => {})
  // A failed create must not stick, or every later call fails with it.
  sandbox.catch(() => sandboxes.delete(key))
  sandboxes.set(key, sandbox)
  return sandbox
}

async function getOnlineSandbox(chatId: string, botId: string, userId: string) {
  const key = `${chatId}:${botId}`
  const existing = sandboxes.get(key)

  if (existing) {
    try {
      const sandbox = await existing
      // Each use restarts its idle clock; this also fails if it has expired.
      await sandbox.setTimeout(IDLE_TIMEOUT_MS)
      return sandbox
    } catch {
      sandboxes.delete(key)
    }
  }

  return create(key, { chatId, botId }, userId)
}

function clip(text: string) {
  return text.length > MAX_OUTPUT_CHARS
    ? `…[${text.length - MAX_OUTPUT_CHARS} earlier characters cut]\n${text.slice(-MAX_OUTPUT_CHARS)}`
    : text
}

/** Runs code or a shell command on the online sandbox. */
export async function runOnline({
  chatId,
  botId,
  userId,
  language,
  code,
  timeoutSeconds,
}: {
  chatId: string
  botId: string
  /** The bot's owner, whose allowance this uses. */
  userId: string
  language: OnlineLanguage
  code: string
  timeoutSeconds: number
}): Promise<OnlineRunResult> {
  // A UsageLimitError here reaches the model, which tells the user.
  await assertWithinLimits(userId, "e2bSeconds")
  const sandbox = await getOnlineSandbox(chatId, botId, userId)
  try {
    return await execute(sandbox, language, code, timeoutSeconds * 1000)
  } finally {
    void chargeRunningTime(sandbox.sandboxId)
  }
}

async function execute(
  sandbox: Sandbox,
  language: OnlineLanguage,
  code: string,
  timeoutMs: number
): Promise<OnlineRunResult> {
  if (language === "bash") {
    try {
      const result = await sandbox.commands.run(code, { timeoutMs })
      return finish(language, result.exitCode, result.stdout, result.stderr)
    } catch (error) {
      // A non-zero exit throws, carrying the command's output.
      const failed = error as Partial<{
        exitCode: number
        stdout: string
        stderr: string
        message: string
      }>
      if (typeof failed.exitCode === "number") {
        return finish(
          language,
          failed.exitCode,
          failed.stdout ?? "",
          failed.stderr ?? ""
        )
      }
      throw error
    }
  }

  const execution = await sandbox.runCode(code, { language, timeoutMs })
  const result = execution.results
    .map((item) => item.text)
    .filter(Boolean)
    .join("\n")

  return finish(
    language,
    execution.error ? 1 : 0,
    execution.logs.stdout.join(""),
    execution.logs.stderr.join(""),
    result || undefined,
    execution.error
      ? `${execution.error.name}: ${execution.error.value}\n${execution.error.traceback}`
      : undefined
  )
}

function finish(
  language: OnlineLanguage,
  exitCode: number | null,
  stdout: string,
  stderr: string,
  result?: string,
  error?: string
): OnlineRunResult {
  const truncated =
    stdout.length > MAX_OUTPUT_CHARS || stderr.length > MAX_OUTPUT_CHARS
  return {
    language,
    exitCode,
    stdout: clip(stdout),
    stderr: clip(stderr),
    ...(result ? { result: clip(result) } : {}),
    ...(error ? { error: clip(error) } : {}),
    truncated,
  }
}

/** Shuts down a chat's online sandboxes, e.g. when its run ends. */
export async function closeOnlineSandboxes(chatId: string) {
  const closing = [...sandboxes.entries()]
    .filter(([key]) => key.startsWith(`${chatId}:`))
    .map(async ([key, sandbox]) => {
      sandboxes.delete(key)
      try {
        const running = await sandbox
        // Charge it up to now before it goes; nothing can after.
        await chargeRunningTime(running.sandboxId)
        billing.delete(running.sandboxId)
        await running.kill()
      } catch {
        // Already gone, or never started.
      }
    })
  await Promise.all(closing)
}
