import { type InferUITools, NoSuchToolError, tool, type UIMessage } from "ai"
import { z } from "zod"

import { AUDIO_ENV } from "@/lib/audio"
import { ensureMemoryFile, MEMORY_FILE } from "@/lib/memory"
import {
  type Desktop,
  DESKTOP_ENV,
  desktopRun,
  getLiveDesktop,
  SCREEN,
} from "@/lib/desktop"
import { getSandbox } from "@/lib/sandbox"
import { assertWithinLimits, recordUsageSafely } from "@/lib/usage"
import type { Meter } from "@/lib/usage-limits"
import type { OnlineLanguage, OnlineRunResult } from "@/trigger/e2b"
import { fetchPage, searchWeb } from "@/trigger/web"

/** Width and height of the live desktop; screenshots are taken at full size. */
export { SCREEN }

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

// The screen tools act on the bot's live desktop (E2B, open internet), the
// same one the user watches in the panel. It is keyed by the Daytona sandbox.
/** Who is acting: the bot answering now, its sandbox, owner and chat. */
export type ToolContext = {
  sandboxId: string
  userId: string
  botId: string
  chatId: string
}

// The live desktop, with the owner's online-computer allowance checked and
// its running time charged (see getLiveDesktop).
function desktopFor(context: ToolContext) {
  return getLiveDesktop(context.sandboxId, {
    userId: context.userId,
    chatId: context.chatId,
    botId: context.botId,
  })
}

async function screenshot(context: ToolContext) {
  const desktop = await desktopFor(context)
  // A JPEG straight from the X display is far smaller than the SDK's PNG.
  const grab = await desktopRun(
    desktop,
    `ffmpeg -loglevel error -y -f x11grab -draw_mouse 1 -video_size ${SCREEN.width}x${SCREEN.height} -i :0 -frames:v 1 -q:v 6 /tmp/shot.jpg && xdotool getmouselocation --shell`
  )

  let image: string
  let mediaType: "image/jpeg" | "image/png" = "image/jpeg"
  if (grab.exitCode === 0) {
    const bytes = await desktop.files.read("/tmp/shot.jpg", { format: "bytes" })
    image = Buffer.from(bytes).toString("base64")
  } else {
    image = Buffer.from(await desktop.screenshot()).toString("base64")
    mediaType = "image/png"
  }

  const cx = /X=(\d+)/.exec(grab.output)?.[1]
  const cy = /Y=(\d+)/.exec(grab.output)?.[1]

  return {
    image,
    mediaType,
    width: SCREEN.width,
    height: SCREEN.height,
    cursor: cx && cy ? { x: Number(cx), y: Number(cy) } : null,
  }
}

const XDOTOOL_BUTTON = { left: 1, middle: 2, right: 3 } as const
const XDOTOOL_SCROLL = { up: 4, down: 5, left: 6, right: 7 } as const

// xdotool chains run in one command; modifiers are held around the action.
async function xdotool(
  desktop: Desktop,
  action: string,
  modifiers: string[] = []
) {
  const down = modifiers.map((key) => `keydown ${key}`).join(" ")
  const up = modifiers.map((key) => `keyup ${key}`).join(" ")
  const result = await desktopRun(desktop, `xdotool ${down} ${action} ${up}`)
  if (result.exitCode !== 0) {
    throw new Error(`The desktop action failed: ${result.output.trim()}`)
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
  context: ToolContext,
  action: (desktop: Desktop) => Promise<T>
) {
  const desktop = await desktopFor(context)
  const result = await action(desktop)
  await new Promise((resolve) => setTimeout(resolve, SETTLE_MS))
  return { ...result, screen: await screenshot(context) }
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

export type HandoffResult =
  | {
      ok: true
      fromBotId: string
      fromBotName: string
      toBotId: string
      toBotName: string
      reason: string
    }
  | { ok: false; error: string }

function handoffForModel(output: HandoffResult) {
  if (!output.ok) {
    return {
      type: "text" as const,
      value: `Handoff failed: ${output.error} Answer the user yourself instead.`,
    }
  }
  return {
    type: "text" as const,
    value: `${output.fromBotName} handed this message to ${output.toBotName}. From here on you are ${output.toBotName}: answer the user's last message yourself, fully, as ${output.toBotName}. Don't mention the handoff again or repeat what was said before it.`,
  }
}

/**
 * Tools that act on the bot's own Daytona sandbox and live desktop, plus the
 * group chat handoff. `resolveContext` is called on each use, so the sandbox
 * is looked up lazily, only when the model reaches for a tool, and always for
 * the bot answering at that moment (which changes after a handoff).
 *
 * Billable tools check the owner's allowance first and throw a
 * UsageLimitError when it's used up; the model then tells the user.
 */
export function createSandboxTools(
  resolveContext: () => Promise<ToolContext>,
  onHandoff: (input: {
    botId: string
    reason: string
  }) => Promise<HandoffResult>,
  onRunOnline: (input: {
    language: OnlineLanguage
    code: string
    timeoutSeconds: number
  }) => Promise<OnlineRunResult>
) {
  const resolveSandboxId = async () => (await resolveContext()).sandboxId

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
        const context = await resolveContext()
        await assertWithinLimits(context.userId, "daytonaSeconds")
        const sandbox = await getSandbox(context.sandboxId)
        const startedAt = Date.now()
        const result = await sandbox.process
          .executeCommand(
            `bash -lc ${shellQuote(command)}`,
            cwd ?? HOME,
            // A display for GUI apps, and PulseAudio so what they play
            // reaches the user (see lib/audio.ts).
            { DISPLAY: ":0", ...AUDIO_ENV },
            timeoutSeconds ?? 60
          )
          .finally(() => {
            // Terminal time: how long the command ran, at least a second.
            void recordUsageSafely(context.userId, [
              {
                metric: "daytona_seconds",
                quantity: Math.max(
                  1,
                  Math.ceil((Date.now() - startedAt) / 1000)
                ),
                chatId: context.chatId,
                botId: context.botId,
                resourceId: context.sandboxId,
              },
            ])
          })
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
        actAndLook(await resolveContext(), async (desktop) => {
          await xdotool(
            desktop,
            `mousemove --sync ${x} ${y} click --repeat ${double ? 2 : 1} ${XDOTOOL_BUTTON[button ?? "left"]}`,
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
        actAndLook(await resolveContext(), async (desktop) => {
          await xdotool(desktop, `mousemove --sync ${x} ${y}`)
          return { x, y }
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
        actAndLook(await resolveContext(), async (desktop) => {
          await xdotool(
            desktop,
            `mousemove --sync ${x} ${y} click --repeat ${amount ?? 3} ${XDOTOOL_SCROLL[direction]}`
          )
          return { x, y, direction, amount: amount ?? 3 }
        }),
      toModelOutput: actionForModel,
    }),

    keyboardType: tool({
      description:
        "Type text with the keyboard into whatever has focus. Returns a screenshot of the result.",
      inputSchema: z.object({ text: z.string().min(1) }),
      execute: async ({ text }) =>
        actAndLook(await resolveContext(), async (desktop) => {
          await xdotool(desktop, `type --delay 12 -- ${shellQuote(text)}`)
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
        actAndLook(await resolveContext(), async (desktop) => {
          const combo = [...(modifiers ?? []), key].join("+")
          await xdotool(desktop, `key -- ${shellQuote(combo)}`)
          return { key, modifiers: modifiers ?? [] }
        }),
      toModelOutput: actionForModel,
    }),

    openWebsite: tool({
      description:
        "Open a website in Google Chrome on your screen, which the user watches live. Your screen has the full internet, so any site works, including YouTube. Opens a new tab if Chrome is already open. Returns a screenshot of the result.",
      inputSchema: z.object({
        url: z.string().min(1).describe("The full http(s) URL to open"),
      }),
      execute: async ({ url }) =>
        actAndLook(await resolveContext(), async (desktop) => {
          const target = /^https?:\/\//i.test(url) ? url : `https://${url}`
          const chrome = [
            "google-chrome",
            "--no-first-run",
            "--no-default-browser-check",
            "--password-store=basic",
            "--start-maximized",
            "--autoplay-policy=no-user-gesture-required",
            // Hides the "Can't update Chrome" pop-up that covers the page.
            "--disable-component-update",
            `--simulate-outdated-no-au=${shellQuote("Tue, 31 Dec 2099 23:59:59 GMT")}`,
            shellQuote(target),
          ].join(" ")
          // In the background, so the call returns while Chrome keeps running.
          const handle = await desktop.commands.run(
            `${chrome} > /tmp/chrome.log 2>&1`,
            { background: true, envs: DESKTOP_ENV, timeoutMs: 0 }
          )
          // Detaching leaves Chrome running; it only stops its output stream.
          await handle.disconnect()
          // Pages take a moment to load; the screenshot should show it.
          await new Promise((resolve) => setTimeout(resolve, 3000))
          return { url: target }
        }),
      toModelOutput: actionForModel,
    }),

    viewScreen: tool({
      description:
        "Take a screenshot so you can see the screen yourself. The user does not see it. Use it to look before acting; mouse and keyboard tools already return a screenshot of their result.",
      inputSchema: z.object({}),
      execute: async () => screenshot(await resolveContext()),
      toModelOutput: screenForModel,
    }),

    showScreen: tool({
      description:
        "Put a screenshot of the screen in the chat for the user. Only call this when the user explicitly asked to see the screen or for a screenshot, and only once, as your last action. To look at the screen yourself, use viewScreen.",
      inputSchema: z.object({}),
      execute: async () => screenshot(await resolveContext()),
      toModelOutput: screenForModel,
    }),

    runOnline: tool({
      description:
        "Run code with full internet access on a separate, temporary online computer. Use it only when the code itself must reach the internet (calling an API, downloading data from a website, scraping, testing a live site), since your own computer can't reach most websites. It shares no files with your computer, has no screen, and resets after 10 minutes unused. For plain searches use webSearch, and to read a page use fetchPage.",
      inputSchema: z.object({
        language: z
          .enum(["python", "javascript", "bash"])
          .describe(
            "python and javascript run as code; bash runs as a shell command"
          ),
        code: z.string().min(1).describe("The code or command to run"),
        timeoutSeconds: z
          .number()
          .int()
          .min(1)
          .max(300)
          .optional()
          .describe("Stop after this many seconds (default 60)"),
      }),
      execute: async ({ language, code, timeoutSeconds }) =>
        onRunOnline({ language, code, timeoutSeconds: timeoutSeconds ?? 60 }),
    }),

    webSearch: tool({
      description:
        "Search the web and get a short answer with its sources. Runs outside your computer, so it works even though your computer can't reach most websites. Use it for anything current or that you need to look up.",
      inputSchema: z.object({
        query: z.string().min(1).max(300).describe("What to search for"),
      }),
      execute: async ({ query }) => {
        const context = await resolveContext()
        await assertWithinLimits(context.userId, "webSearches")
        const result = await searchWeb(query)
        void recordUsageSafely(context.userId, [
          {
            metric: "web_searches",
            quantity: 1,
            chatId: context.chatId,
            botId: context.botId,
          },
        ])
        return result
      },
    }),

    fetchPage: tool({
      description:
        "Read a web page as plain text, from outside your computer. Use it to read a search result or any link the user gives you; your computer's browser and shell can't load most websites.",
      inputSchema: z.object({
        url: z.string().min(1).describe("The full http(s) URL of the page"),
      }),
      execute: async ({ url }) => {
        const context = await resolveContext()
        await assertWithinLimits(context.userId, "pageFetches")
        const result = await fetchPage(url)
        void recordUsageSafely(context.userId, [
          {
            metric: "page_fetches",
            quantity: 1,
            chatId: context.chatId,
            botId: context.botId,
          },
        ])
        return result
      },
    }),

    remember: tool({
      description:
        "Save a note to your long-term memory (your MEMORY.md), kept across all your chats, private and group. Use it whenever the user tells you something worth remembering. One short fact per call.",
      inputSchema: z.object({
        note: z
          .string()
          .min(1)
          .max(500)
          .describe(
            "The fact, in a short sentence, e.g. 'Favourite language is Rust'"
          ),
      }),
      execute: async ({ note }) => {
        const sandbox = await getSandbox(await resolveSandboxId())
        await ensureMemoryFile(sandbox)
        const line = note.replace(/\s+/g, " ").trim()
        const result = await sandbox.process.executeCommand(
          `printf -- '- %s: %s\\n' "$(date +%F)" ${shellQuote(line)} >> ${MEMORY_FILE}`
        )
        if (result.exitCode) {
          throw new Error(`Couldn't write to memory: ${result.result}`)
        }
        return { saved: line }
      },
    }),

    recall: tool({
      description:
        "Read your long-term memory (your MEMORY.md): everything you saved in any of your chats. Use it before answering anything that may depend on an earlier conversation.",
      inputSchema: z.object({}),
      execute: async () => {
        const sandbox = await getSandbox(await resolveSandboxId())
        await ensureMemoryFile(sandbox)
        const buffer = await sandbox.fs.downloadFile(MEMORY_FILE)
        const { text, truncated } = clip(
          buffer.toString("utf8"),
          MAX_FILE_CHARS
        )
        return { memory: text.trim() || "(empty)", truncated }
      },
    }),

    handoff: tool({
      description:
        "Group chats only. Pass the user's current message to another bot in this group whose job fits it better than yours. Call it before doing any work on the request; that bot then answers the message itself. Use the bot id from the group member list.",
      inputSchema: z.object({
        botId: z
          .string()
          .min(1)
          .describe("Id of the bot to hand the message to"),
        reason: z
          .string()
          .min(1)
          .max(200)
          .describe(
            "A few words on why that bot fits better, shown to the user"
          ),
      }),
      execute: async ({ botId, reason }) => onHandoff({ botId, reason }),
      toModelOutput: ({ output }) => handoffForModel(output),
    }),
  }
}

export type ChatTools = ReturnType<typeof createSandboxTools>

/** Stamped on each reply, so a group chat shows which bot wrote it. */
export type ChatMessageMetadata = { botId?: string }

/** Custom parts a reply can carry, besides text and tools. */
export type ChatDataTypes = {
  /** The turn was refused: the user is out of allowance for this period. */
  usageLimit: { meter: Meter; message: string }
}

export type ChatUIMessage = UIMessage<
  ChatMessageMetadata,
  ChatDataTypes,
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

/** A turn can change hands this many times, so bots can't pass it around forever. */
export const MAX_HANDOFFS_PER_TURN = 2

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
 * - handoff is only offered in group chats, at most MAX_HANDOFFS_PER_TURN
 *   times a turn.
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
  isGroup,
}: {
  steps: ReadonlyArray<StepLike>
  names: string[]
  userText: string
  isGroup: boolean
}) {
  const hidden = new Set<string>()

  // Handoff only exists between bots of a group, and only a few times a turn.
  const handoffs = steps
    .flatMap((step) => step.toolCalls)
    .filter((call) => call.toolName === "handoff").length
  if (!isGroup || handoffs >= MAX_HANDOFFS_PER_TURN) {
    hidden.add("handoff")
  }

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

/**
 * Tools to call instead when the model calls one that activeToolsAfter hid
 * for this step. showScreen is hidden unless the user asked to see the
 * screen, but the model sometimes calls it anyway; looking at the screen
 * privately with viewScreen keeps the turn going without posting a
 * screenshot the user did not ask for.
 */
const HIDDEN_TOOL_FALLBACKS: Record<string, string> = {
  showScreen: "viewScreen",
}

/**
 * Repairs a call to a tool that exists but is not on offer this step, so the
 * stream doesn't fail with NoSuchToolError. Returns null (the SDK then raises
 * the original error, which is still reported) for anything it can't repair.
 */
export function repairHiddenToolCall<
  T extends { toolName: string; input: string },
>({
  toolCall,
  error,
  userText,
}: {
  toolCall: T
  error: unknown
  userText: string
}): T | null {
  if (!NoSuchToolError.isInstance(error)) {
    return null
  }
  const fallback = HIDDEN_TOOL_FALLBACKS[toolCall.toolName]
  // The fallback may be hidden too (e.g. after two look-only steps).
  if (!fallback || (error.availableTools && !error.availableTools.includes(fallback))) {
    return null
  }
  console.warn("Repaired call to hidden tool", {
    toolName: toolCall.toolName,
    replacement: fallback,
    availableTools: error.availableTools,
    userText: userText.slice(0, 200),
  })
  return { ...toolCall, toolName: fallback, input: "{}" }
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
