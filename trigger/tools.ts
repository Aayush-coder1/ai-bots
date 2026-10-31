import { type InferUITools, tool, type UIDataTypes, type UIMessage } from "ai"
import { z } from "zod"

import { getDesktop, getSandbox } from "@/lib/sandbox"

/** Width and height of the sandbox display; screenshots are taken at full size. */
export const SCREEN = { width: 1024, height: 768 }

const HOME = "/home/daytona"
const MAX_OUTPUT_CHARS = 20_000
const MAX_FILE_CHARS = 100_000
const MAX_LIST_ENTRIES = 500

const OMITTED_SCREEN = {
  type: "text" as const,
  value:
    "[Older screenshot removed to save context. Call viewScreen for a current one.]",
}

const x = z
  .number()
  .int()
  .min(0)
  .max(SCREEN.width - 1)
  .describe("Pixels from the left edge of the screen")
const y = z
  .number()
  .int()
  .min(0)
  .max(SCREEN.height - 1)
  .describe("Pixels from the top edge of the screen")
const modifiers = z
  .array(z.enum(["ctrl", "shift", "alt", "super"]))
  .optional()
  .describe("Modifier keys held during the action")

// Long output keeps its end, where errors and the final result usually are.
function clip(text: string, max: number) {
  if (text.length <= max) {
    return { text, truncated: false }
  }
  return {
    text: `…[${text.length - max} earlier characters cut]\n${text.slice(-max)}`,
    truncated: true,
  }
}

// Single quotes stop the outer shell from expanding $VARS or $(...) before
// bash sees the command.
function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

async function screenshot(sandboxId: string) {
  const sandbox = await getDesktop(sandboxId)
  const shot = await sandbox.computerUse.screenshot.takeCompressed({
    format: "jpeg",
    quality: 70,
    showCursor: true,
  })

  if (!shot.screenshot) {
    throw new Error("The sandbox returned an empty screenshot")
  }

  return {
    image: shot.screenshot,
    mediaType: "image/jpeg" as const,
    width: SCREEN.width,
    height: SCREEN.height,
    cursor: shot.cursorPosition ?? null,
  }
}

type ScreenOutput = Awaited<ReturnType<typeof screenshot>>

// The model sees the actual image; the raw base64 never enters the prompt as text.
function screenForModel({
  output,
}: {
  output: ScreenOutput & { omitted?: boolean }
}) {
  // Stored transcripts drop old hidden screenshots (lib/screenshots.ts).
  if (!output.image) {
    return {
      type: "content" as const,
      value: [{ type: "text" as const, text: OMITTED_SCREEN.value }],
    }
  }

  return {
    type: "content" as const,
    value: [
      {
        type: "text" as const,
        text: `Screenshot ${output.width}x${output.height}, cursor at ${
          output.cursor ? `(${output.cursor.x}, ${output.cursor.y})` : "unknown"
        }.`,
      },
      {
        type: "file" as const,
        mediaType: output.mediaType,
        data: { type: "data" as const, data: output.image },
      },
    ],
  }
}

// Clicks and key presses often start animations or page loads; a short pause
// lets the screenshot show their result rather than the moment before it.
const SETTLE_MS = 700

/**
 * Runs a mouse or keyboard action, then returns what it did together with a
 * screenshot of the result, so the model sees the effect in the same step
 * instead of spending another model call on viewScreen.
 */
async function actAndLook<T extends object>(
  sandboxId: string,
  action: (sandbox: Awaited<ReturnType<typeof getDesktop>>) => Promise<T>
) {
  const sandbox = await getDesktop(sandboxId)
  const result = await action(sandbox)
  await new Promise((resolve) => setTimeout(resolve, SETTLE_MS))
  return { ...result, screen: await screenshot(sandboxId) }
}

function actionForModel<T extends { screen: ScreenOutput }>({
  output,
}: {
  output: T
}) {
  const { screen, ...action } = output
  const view = screenForModel({ output: screen })
  return {
    type: "content" as const,
    value: [
      { type: "text" as const, text: `Done: ${JSON.stringify(action)}.` },
      ...view.value,
    ],
  }
}

/**
 * Tools that act on the bot's own Daytona sandbox. `resolveSandboxId` is
 * called on each use, so the sandbox is looked up lazily and only when the
 * model actually reaches for a tool.
 */
export function createSandboxTools(resolveSandboxId: () => Promise<string>) {
  return {
    bash: tool({
      description:
        "Run a shell command in your sandbox with bash and return its exit code and combined output. Runs in your home directory unless cwd is set. GUI apps need to be started in the background (`nohup app >/tmp/app.log 2>&1 &`); DISPLAY is already set.",
      inputSchema: z.object({
        command: z.string().min(1).describe("The bash command to run"),
        cwd: z
          .string()
          .optional()
          .describe(`Working directory, defaults to ${HOME}`),
        timeoutSeconds: z
          .number()
          .int()
          .min(1)
          .max(600)
          .optional()
          .describe("Stop the command after this many seconds (default 60)"),
      }),
      execute: async ({ command, cwd, timeoutSeconds }) => {
        const sandbox = await getSandbox(await resolveSandboxId())
        const result = await sandbox.process.executeCommand(
          `bash -lc ${shellQuote(command)}`,
          cwd ?? HOME,
          { DISPLAY: ":0" },
          timeoutSeconds ?? 60
        )
        const { text, truncated } = clip(result.result ?? "", MAX_OUTPUT_CHARS)
        return { exitCode: result.exitCode ?? null, output: text, truncated }
      },
    }),

    readFile: tool({
      description: "Read a text file from your sandbox.",
      inputSchema: z.object({
        path: z
          .string()
          .min(1)
          .describe(`Absolute path, or relative to ${HOME}`),
      }),
      execute: async ({ path }) => {
        const sandbox = await getSandbox(await resolveSandboxId())
        const buffer = await sandbox.fs.downloadFile(path)
        const { text, truncated } = clip(
          buffer.toString("utf8"),
          MAX_FILE_CHARS
        )
        return { path, size: buffer.length, content: text, truncated }
      },
    }),

    writeFile: tool({
      description:
        "Create or overwrite a text file in your sandbox. Missing parent folders are created.",
      inputSchema: z.object({
        path: z
          .string()
          .min(1)
          .describe(`Absolute path, or relative to ${HOME}`),
        content: z.string().describe("The full file contents"),
      }),
      execute: async ({ path, content }) => {
        const sandbox = await getSandbox(await resolveSandboxId())
        const buffer = Buffer.from(content, "utf8")
        await sandbox.fs.uploadFile(buffer, path)
        return { path, bytes: buffer.length }
      },
    }),

    listFiles: tool({
      description: "List the files and folders in a folder of your sandbox.",
      inputSchema: z.object({
        path: z
          .string()
          .optional()
          .describe(`Folder to list, defaults to ${HOME}`),
      }),
      execute: async ({ path }) => {
        const folder = path ?? HOME
        const sandbox = await getSandbox(await resolveSandboxId())
        const files = await sandbox.fs.listFiles(folder)
        return {
          path: folder,
          total: files.length,
          entries: files.slice(0, MAX_LIST_ENTRIES).map((file) => ({
            name: file.name,
            isDir: file.isDir,
            size: file.size,
          })),
        }
      },
    }),

    mouseClick: tool({
      description:
        "Click the mouse at a point on the screen. Returns a screenshot of the result.",
      inputSchema: z.object({
        x,
        y,
        button: z
          .enum(["left", "right", "middle"])
          .optional()
          .describe("Defaults to left"),
        double: z
          .boolean()
          .optional()
          .describe("Double-click instead of a single click"),
        modifiers,
      }),
      execute: async ({ x, y, button, double, modifiers }) =>
        actAndLook(await resolveSandboxId(), async (sandbox) => {
          await sandbox.computerUse.mouse.click(
            x,
            y,
            button ?? "left",
            double ?? false,
            undefined,
            modifiers
          )
          return { x, y, button: button ?? "left", double: double ?? false }
        }),
      toModelOutput: actionForModel,
    }),

    mouseMove: tool({
      description:
        "Move the mouse pointer to a point on the screen, for example to hover. Returns a screenshot of the result.",
      inputSchema: z.object({ x, y }),
      execute: async ({ x, y }) =>
        actAndLook(await resolveSandboxId(), async (sandbox) => {
          const position = await sandbox.computerUse.mouse.move(x, y)
          return { x: position.x ?? x, y: position.y ?? y }
        }),
      toModelOutput: actionForModel,
    }),

    mouseScroll: tool({
      description:
        "Scroll at a point on the screen. Returns a screenshot of the result.",
      inputSchema: z.object({
        x,
        y,
        direction: z.enum(["up", "down", "left", "right"]),
        amount: z
          .number()
          .int()
          .min(1)
          .max(20)
          .optional()
          .describe("Scroll steps, defaults to 3"),
      }),
      execute: async ({ x, y, direction, amount }) =>
        actAndLook(await resolveSandboxId(), async (sandbox) => {
          await sandbox.computerUse.mouse.scroll(x, y, direction, amount ?? 3)
          return { x, y, direction, amount: amount ?? 3 }
        }),
      toModelOutput: actionForModel,
    }),

    keyboardType: tool({
      description:
        "Type text with the keyboard into whatever has focus. Returns a screenshot of the result.",
      inputSchema: z.object({ text: z.string().min(1) }),
      execute: async ({ text }) =>
        actAndLook(await resolveSandboxId(), async (sandbox) => {
          await sandbox.computerUse.keyboard.type(text)
          return { characters: text.length }
        }),
      toModelOutput: actionForModel,
    }),

    keyboardPress: tool({
      description:
        "Press a single key, optionally with modifiers, e.g. key 'Return', 'Tab', 'Escape', 'BackSpace', 'Up', 'F5', or key 'l' with modifiers ['ctrl'] to focus a browser's address bar. Returns a screenshot of the result.",
      inputSchema: z.object({
        key: z.string().min(1).describe("The key name, e.g. 'Return' or 'a'"),
        modifiers,
      }),
      execute: async ({ key, modifiers }) =>
        actAndLook(await resolveSandboxId(), async (sandbox) => {
          await sandbox.computerUse.keyboard.press(key, modifiers)
          return { key, modifiers: modifiers ?? [] }
        }),
      toModelOutput: actionForModel,
    }),

    viewScreen: tool({
      description:
        "Take a screenshot so you can see the screen yourself. The user does not see it. Use it to look before acting; mouse and keyboard tools already return a screenshot of their result.",
      inputSchema: z.object({}),
      execute: async () => screenshot(await resolveSandboxId()),
      toModelOutput: screenForModel,
    }),

    showScreen: tool({
      description:
        "Put a screenshot of the screen in the chat for the user. Only call this when the user explicitly asked to see the screen or for a screenshot, and only once, as your last action. To look at the screen yourself, use viewScreen.",
      inputSchema: z.object({}),
      execute: async () => screenshot(await resolveSandboxId()),
      toModelOutput: screenForModel,
    }),
  }
}

export type ChatTools = ReturnType<typeof createSandboxTools>

/** Stamped on each reply, so a group chat shows which bot wrote it. */
export type ChatMessageMetadata = { botId?: string }

export type ChatUIMessage = UIMessage<
  ChatMessageMetadata,
  UIDataTypes,
  InferUITools<ChatTools>
>

type ResultLike = { type: string; output?: unknown }
type MessageLike = { role: string; content: unknown }

function hasImage(output: unknown) {
  const result = output as
    | { type?: string; value?: Array<{ type?: string; mediaType?: string }> }
    | undefined
  return (
    result?.type === "content" &&
    Array.isArray(result.value) &&
    result.value.some(
      (item) => item.type === "file" && item.mediaType?.startsWith("image")
    )
  )
}

/**
 * Keeps only the newest screenshots in a prompt. Every image costs tokens on
 * every later step, and only the current screen matters for acting.
 *
 * Works on both shapes it is given: the turn's ModelMessages (prepareMessages)
 * and the provider-level prompt inside the model middleware, which see tool
 * results the same way: `{ role: "tool", content: [{ type: "tool-result", output }] }`.
 */
export function keepLatestScreenshots<T extends MessageLike>(
  messages: T[],
  keep = 2
): T[] {
  let seen = 0

  return messages
    .slice()
    .reverse()
    .map((message) => {
      if (message.role !== "tool" || !Array.isArray(message.content)) {
        return message
      }

      const content = (message.content as ResultLike[])
        .slice()
        .reverse()
        .map((part) => {
          if (part.type !== "tool-result" || !hasImage(part.output)) {
            return part
          }
          seen += 1
          return seen > keep ? { ...part, output: OMITTED_SCREEN } : part
        })
        .reverse()

      return { ...message, content }
    })
    .reverse()
}

const LOOK_TOOLS = new Set(["viewScreen", "showScreen"])

// Phrases that ask to see the screen: "show me the screen", "take a
// screenshot", "let me see", "what's on your screen?".
const SCREEN_REQUEST =
  /\bscreen ?shots?\b|\blet me see\b|\b(show|see|view|look at|display|share|send)\b[^.?!\n]{0,40}\b(screen|desktop|display)\b|\bwhat(?:'s| is)\b[^.?!\n]{0,20}\bon\b[^.?!\n]{0,15}\b(screen|desktop)\b/i

/** Whether a user message explicitly asks to see the bot's screen. */
export function asksToSeeScreen(text: string) {
  return SCREEN_REQUEST.test(text)
}

type StepLike = { toolCalls: ReadonlyArray<{ toolName: string }> }

/**
 * Tool names to offer for the next step, or undefined to offer all of them.
 *
 * - showScreen is only offered when the user's message asked to see the
 *   screen, and only until it has been called once this turn, so the chat
 *   never fills with screenshots the user did not ask for.
 * - When the last two steps did nothing but look at the screen, the screen
 *   tools are withheld for one step, so the model acts or answers instead of
 *   polling the screen in a loop.
 */
export function activeToolsAfter({
  steps,
  names,
  userText,
}: {
  steps: ReadonlyArray<StepLike>
  names: string[]
  userText: string
}) {
  const hidden = new Set<string>()

  const shownAlready = steps.some((step) =>
    step.toolCalls.some((call) => call.toolName === "showScreen")
  )
  if (!asksToSeeScreen(userText) || shownAlready) {
    hidden.add("showScreen")
  }

  const lastTwo = steps.slice(-2)
  const onlyLooked =
    lastTwo.length === 2 &&
    lastTwo.every(
      (step) =>
        step.toolCalls.length > 0 &&
        step.toolCalls.every((call) => LOOK_TOOLS.has(call.toolName))
    )
  if (onlyLooked) {
    LOOK_TOOLS.forEach((name) => hidden.add(name))
  }

  return hidden.size > 0 ? names.filter((name) => !hidden.has(name)) : undefined
}

type MessageWithContent = { role: string; content: unknown }

/** The text of the newest user message: what this turn is answering. */
export function latestUserText(messages: ReadonlyArray<MessageWithContent>) {
  const message = messages.findLast((m) => m.role === "user")
  if (!message) {
    return ""
  }
  if (typeof message.content === "string") {
    return message.content
  }
  if (!Array.isArray(message.content)) {
    return ""
  }
  return (message.content as Array<{ type?: string; text?: string }>)
    .filter((part) => part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n")
}
