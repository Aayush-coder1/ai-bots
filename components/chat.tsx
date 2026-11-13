"use client"

import { useChat } from "@ai-sdk/react"
import { useTriggerChatTransport } from "@trigger.dev/sdk/chat/react"
import {
  BrainIcon,
  CodeIcon,
  DownloadIcon,
  GaugeIcon,
  GlobeIcon,
  MonitorIcon,
  UsersIcon,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import type { BundledLanguage } from "shiki"

import { mintChatAccessToken, startChatSession } from "@/actions/chat"
import { downloadSharedFile } from "@/actions/files"
import { ChatAvatar } from "@/components/chat-avatar"
import { useOptionalDesktopPanel } from "@/components/desktop-panel"
import { GroupChatAvatar } from "@/components/group-chat-avatar"
import { CodeBlock } from "@/components/ai-elements/code-block"
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation"
import {
  FileTree,
  FileTreeFile,
  FileTreeFolder,
} from "@/components/ai-elements/file-tree"
import { Image } from "@/components/ai-elements/image"
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message"
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputProvider,
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputController,
} from "@/components/ai-elements/prompt-input"
import { Shimmer } from "@/components/ai-elements/shimmer"
import { Terminal } from "@/components/ai-elements/terminal"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import {
  formatMention,
  mentionedBot,
  mentionQueryAt,
  withoutFirstMention,
} from "@/lib/mentions"
import { cn } from "@/lib/utils"
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool"
import type { Bot, ChatKind } from "@/db/schema"
import { useBillingGate } from "@/hooks/use-billing-gate"
import { FEATURES, PAYWALL, pricingHref, UPGRADE_REQUIRED } from "@/lib/billing"
import { USAGE_PATH } from "@/lib/usage-limits"
import type { chatAgent } from "@/trigger/chat"
import type { ChatUIMessage } from "@/trigger/tools"

type Part = ChatUIMessage["parts"][number]
type ToolPart = Extract<Part, { type: `tool-${string}` }>
type PartOf<T extends ToolPart["type"]> = Extract<ToolPart, { type: T }>

// Tools that drive the bot's live desktop. While a reply uses one, the
// desktop panel opens by itself (Watch Mode) and shows a live indicator.
const DESKTOP_TOOLS = new Set<string>([
  "tool-mouseClick",
  "tool-mouseMove",
  "tool-mouseScroll",
  "tool-keyboardType",
  "tool-keyboardPress",
  "tool-openWebsite",
  "tool-viewScreen",
  "tool-showScreen",
])

// One-click first messages that show off what a bot can do.
const STARTERS = [
  {
    icon: MonitorIcon,
    label: "Browse the web live",
    prompt:
      "Open news.ycombinator.com on your computer and tell me the top 3 stories.",
  },
  {
    icon: CodeIcon,
    label: "Write and run code",
    prompt:
      "Write a Python script that prints the first 20 prime numbers, run it, and show me the output.",
  },
  {
    icon: GlobeIcon,
    label: "Research a topic",
    prompt:
      "Search the web for the latest Next.js release and summarize what's new in 5 bullets.",
  },
  {
    icon: BrainIcon,
    label: "Teach it about you",
    prompt: "Remember that I prefer concise answers with code examples.",
  },
] as const

const GROUP_STARTER = {
  icon: UsersIcon,
  label: "Meet the team",
  prompt:
    "Introduce yourself in one line, and tell me which bot in this group I should ask for what.",
}

/** The empty chat: who you're talking to and a few things to try. */
function ChatWelcome({
  bots,
  isGroup,
  onPick,
}: {
  bots: Bot[]
  isGroup: boolean
  onPick: (prompt: string) => void
}) {
  const bot = isGroup ? undefined : bots[0]
  const starters = isGroup ? [GROUP_STARTER, ...STARTERS.slice(1)] : STARTERS

  return (
    <div className="mx-auto flex size-full max-w-2xl flex-col items-center justify-center gap-8 px-4 py-12 text-center">
      <div className="flex flex-col items-center gap-4">
        <div className="rounded-2xl bg-card p-2 shadow-sm ring-1 ring-border">
          <GroupChatAvatar
            seeds={bots.map((member) => member.avatar)}
            fallbackSeed={bot?.id ?? "group"}
            className="size-14"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <h2 className="text-xl font-semibold tracking-tight">
            {bot ? `Chat with ${bot.name}` : "Your team is ready"}
          </h2>
          <p className="text-sm text-balance text-muted-foreground">
            {bot
              ? `${bot.job}. It has its own computer, a terminal and the open web.`
              : `${bots.map((member) => member.name).join(", ")}. Type @ to pick who answers.`}
          </p>
        </div>
      </div>
      <div className="grid w-full gap-2 sm:grid-cols-2">
        {starters.map((starter) => (
          <button
            key={starter.label}
            type="button"
            onClick={() => onPick(starter.prompt)}
            className="group flex flex-col gap-1.5 rounded-xl border bg-card p-3.5 text-left shadow-xs transition-all duration-200 outline-none hover:-translate-y-px hover:border-brand/40 hover:shadow-[0_8px_24px_-12px_var(--brand)] focus-visible:ring-2 focus-visible:ring-ring active:translate-y-0"
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <starter.icon className="size-4 text-muted-foreground transition-colors group-hover:text-brand" />
              {starter.label}
            </span>
            <span className="line-clamp-2 text-xs text-muted-foreground">
              {starter.prompt}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

// `Image` renders from base64; the byte array it also types is unused.
const NO_BYTES = new Uint8Array(0)

const LANGUAGES: Record<string, BundledLanguage> = {
  css: "css",
  go: "go",
  html: "html",
  js: "javascript",
  json: "json",
  jsx: "jsx",
  md: "markdown",
  py: "python",
  rs: "rust",
  sh: "bash",
  sql: "sql",
  toml: "toml",
  ts: "typescript",
  tsx: "tsx",
  yaml: "yaml",
  yml: "yaml",
}

function languageFor(path: string): BundledLanguage {
  const extension = path.split(".").pop()?.toLowerCase() ?? ""
  return LANGUAGES[extension] ?? "log"
}

function shorten(text: string, max = 60) {
  const line = text.split("\n")[0]
  return line.length > max || text.includes("\n")
    ? `${line.slice(0, max)}…`
    : line
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

function isToolPart(part: Part): part is ToolPart {
  return part.type.startsWith("tool-")
}

/** Index of the first part where the message changed hands, or -1. */
function firstHandoffIndex(parts: Part[]) {
  return parts.findIndex(
    (part) =>
      part.type === "tool-handoff" &&
      part.state === "output-available" &&
      part.output.ok
  )
}

/** The bot that ended up answering after the last handoff, if any. */
function handedOffTo(parts: Part[]) {
  for (const part of [...parts].reverse()) {
    if (
      part.type === "tool-handoff" &&
      part.state === "output-available" &&
      part.output.ok
    ) {
      return part.output.toBotId
    }
  }
  return undefined
}

// What each action says in its header, in plain words, once its input is known.
function toolTitle(part: ToolPart): string {
  switch (part.type) {
    case "tool-bash":
      return part.input?.command
        ? `Ran ${shorten(part.input.command)}`
        : "Running a command"
    case "tool-readFile":
      return part.input?.path ? `Read ${part.input.path}` : "Reading a file"
    case "tool-writeFile":
      return part.input?.path ? `Wrote ${part.input.path}` : "Writing a file"
    case "tool-listFiles":
      return `Listed ${part.input?.path ?? "home folder"}`
    case "tool-mouseClick":
      return part.input?.x !== undefined
        ? `${part.input.double ? "Double-clicked" : "Clicked"} at ${part.input.x}, ${part.input.y}`
        : "Clicking"
    case "tool-mouseMove":
      return part.input?.x !== undefined
        ? `Moved the mouse to ${part.input.x}, ${part.input.y}`
        : "Moving the mouse"
    case "tool-mouseScroll":
      return part.input?.direction
        ? `Scrolled ${part.input.direction}`
        : "Scrolling"
    case "tool-keyboardType":
      return part.input?.text
        ? `Typed "${shorten(part.input.text, 40)}"`
        : "Typing"
    case "tool-keyboardPress":
      return part.input?.key
        ? `Pressed ${[...(part.input.modifiers ?? []), part.input.key].join("+")}`
        : "Pressing a key"
    case "tool-openWebsite":
      return part.input?.url
        ? `Opened ${shorten(hostOf(part.input.url), 50)}`
        : "Opening a website"
    case "tool-viewScreen":
      return "Looked at the screen"
    case "tool-showScreen":
      return "Took a screenshot"
    case "tool-handoff":
      return "Handed off"
    case "tool-remember":
      return part.input?.note
        ? `Remembered "${shorten(part.input.note, 50)}"`
        : "Remembering"
    case "tool-recall":
      return "Checked memory"
    case "tool-runOnline":
      return part.input?.code
        ? `Ran online (${part.input.language ?? "code"}): ${shorten(part.input.code)}`
        : "Running online"
    case "tool-webSearch":
      return part.input?.query
        ? `Searched the web for "${shorten(part.input.query, 50)}"`
        : "Searching the web"
    case "tool-fetchPage":
      return part.input?.url
        ? `Read ${shorten(hostOf(part.input.url), 50)}`
        : "Reading a page"
    case "tool-shareFile":
      return part.input?.path ? `Shared ${part.input.path}` : "Sharing a file"
    case "tool-pcRun":
      return part.input?.command
        ? `${pcVerb(part, "Ran")} on ${pcName(part)}: ${shorten(part.input.command)}`
        : "Running a command on your PC"
    case "tool-pcReadFile":
      return part.input?.path
        ? `Read ${part.input.path} on ${pcName(part)}`
        : "Reading a file on your PC"
    case "tool-pcWriteFile":
      return part.input?.path
        ? `Wrote ${part.input.path} on ${pcName(part)}`
        : "Writing a file on your PC"
    case "tool-pcListFiles":
      return `Listed ${part.input?.path ?? "the shared folder"} on ${pcName(part)}`
    case "tool-pcOpen":
      return part.input?.target
        ? `${pcVerb(part, "Opened")} ${shorten(part.input.target, 50)} on ${pcName(part)}`
        : "Opening something on your PC"
    case "tool-listPcs":
      return "Checked your connected devices"
  }
}

// Which of the user's devices an action ran on: the one that answered, else
// the one the bot asked for.
function pcName(part: PcPart) {
  if (part.state === "output-available" && part.output.ok) {
    return part.output.device
  }
  return part.input?.device ?? "your PC"
}

type PcPart = Extract<ToolPart, { type: `tool-pc${string}` }>

// A PC action waits for the user's OK in the agent's terminal, and may be
// refused: the header says which of those it is.
function pcVerb(part: PcPart, done: string) {
  if (part.state === "input-available" || part.state === "input-streaming") {
    return "Waiting for your OK to run"
  }
  if (part.state === "output-available" && !part.output.ok) {
    return "Couldn't finish"
  }
  return done
}

/** What a PC action reported back: its output, or why it didn't happen. */
function PcResult({ part }: { part: PcPart }) {
  if (part.state !== "output-available") {
    return (
      <p className="text-sm text-muted-foreground">
        Check the agent&apos;s terminal on your computer: it may be asking you
        to allow this.
      </p>
    )
  }
  if (!part.output.ok) {
    return <p className="text-sm text-destructive">{part.output.error}</p>
  }
  const output = part.output.output as {
    output?: string
    exitCode?: number | null
    content?: string
    path?: string
    opened?: string
    entries?: Array<{ name: string; isDir: boolean }>
  }
  if (part.type === "tool-pcRun") {
    return (
      <Terminal
        output={[
          `$ ${part.input.command}`,
          output.output,
          output.exitCode ? `[exit code ${output.exitCode}]` : undefined,
        ]
          .filter(Boolean)
          .join("\n")}
      />
    )
  }
  if (part.type === "tool-pcReadFile" && output.content !== undefined) {
    return (
      <CodeBlock
        code={output.content}
        language={languageFor(output.path ?? part.input.path)}
      />
    )
  }
  if (part.type === "tool-pcWriteFile") {
    return (
      <CodeBlock
        code={part.input.content}
        language={languageFor(part.input.path)}
      />
    )
  }
  if (part.type === "tool-pcListFiles" && output.entries) {
    return (
      <p className="font-mono text-xs whitespace-pre-wrap text-muted-foreground">
        {output.entries
          .map((entry) => `${entry.name}${entry.isDir ? "/" : ""}`)
          .join("\n") || "(empty)"}
      </p>
    )
  }
  return (
    <p className="text-sm text-muted-foreground">
      {output.opened ? `Opened ${output.opened}` : "Done."}
    </p>
  )
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** A file the bot handed over: one click saves it from the bot's sandbox. */
function SharedFile({
  part,
  chatId,
}: {
  part: PartOf<"tool-shareFile">
  chatId: string
}) {
  const [busy, setBusy] = useState(false)

  if (part.state === "input-streaming" || part.state === "input-available") {
    return <Shimmer>Preparing a file…</Shimmer>
  }
  if (part.state !== "output-available" || !part.output.ok) {
    return null
  }
  const file = part.output

  async function download() {
    setBusy(true)
    try {
      const result = await downloadSharedFile(chatId, file.path)
      if (!result.ok) {
        toast.add({
          type: "error",
          title: "Couldn't download the file",
          description:
            result.reason === "not-found"
              ? "The bot's computer no longer has it. Ask the bot to make it again."
              : result.reason === "too-large"
                ? "The file is over the 3 MB limit."
                : "Please try again.",
        })
        return
      }
      const bytes = Uint8Array.from(atob(result.base64), (c) => c.charCodeAt(0))
      const url = URL.createObjectURL(new Blob([bytes]))
      const link = document.createElement("a")
      link.href = url
      link.download = result.name
      link.click()
      URL.revokeObjectURL(url)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border bg-muted/30 p-3">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium">
          {file.title ?? file.name}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {file.name} · {formatBytes(file.size)}
        </span>
      </div>
      <Button type="button" size="sm" disabled={busy} onClick={download}>
        {busy ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <DownloadIcon data-icon="inline-start" />
        )}
        Download
      </Button>
    </div>
  )
}

function BashOutput({ part }: { part: PartOf<"tool-bash"> }) {
  if (!part.input?.command) {
    return null
  }

  const output = part.output
  const status =
    output && output.exitCode !== 0 && output.exitCode !== null
      ? `\n[exit code ${output.exitCode}]`
      : ""

  return (
    <Terminal
      output={`$ ${part.input.command}\n${output?.output ?? ""}${status}`}
      isStreaming={part.state === "input-available"}
    />
  )
}

function FileList({ part }: { part: PartOf<"tool-listFiles"> }) {
  if (!part.output) {
    return null
  }

  const { path, entries, total } = part.output

  return (
    <div className="flex flex-col gap-2">
      <FileTree>
        {entries.map((entry) =>
          entry.isDir ? (
            <FileTreeFolder
              key={entry.name}
              path={`${path}/${entry.name}`}
              name={entry.name}
            />
          ) : (
            <FileTreeFile
              key={entry.name}
              path={`${path}/${entry.name}`}
              name={entry.name}
            />
          )
        )}
      </FileTree>
      {total > entries.length ? (
        <p className="text-xs text-muted-foreground">
          Showing {entries.length} of {total} entries
        </p>
      ) : null}
    </div>
  )
}

// The body of an expanded tool call: the most readable view of what it did.
function ToolDetails({ part }: { part: ToolPart }) {
  switch (part.type) {
    case "tool-bash":
      return <BashOutput part={part} />
    case "tool-readFile":
      return part.output ? (
        <CodeBlock
          code={part.output.content}
          language={languageFor(part.output.path)}
        />
      ) : null
    case "tool-writeFile":
      return part.input?.content !== undefined && part.input.path ? (
        <CodeBlock
          code={part.input.content}
          language={languageFor(part.input.path)}
        />
      ) : null
    case "tool-listFiles":
      return <FileList part={part} />
    case "tool-runOnline":
      return part.input?.code ? (
        <Terminal
          output={[
            `$ ${part.input.code}`,
            part.output?.stdout,
            part.output?.stderr,
            part.output?.result,
            part.output?.error,
            part.output &&
            part.output.exitCode !== 0 &&
            part.output.exitCode !== null
              ? `[exit code ${part.output.exitCode}]`
              : undefined,
          ]
            .filter(Boolean)
            .join("\n")}
          isStreaming={part.state === "input-available"}
        />
      ) : null
    case "tool-webSearch":
      return part.output ? (
        <div className="flex flex-col gap-2 text-sm">
          {part.output.summary ? <p>{part.output.summary}</p> : null}
          <ul className="flex flex-col gap-1">
            {part.output.sources.map((source) => (
              <li key={source.url} className="truncate">
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2"
                >
                  {source.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null
    case "tool-fetchPage":
      return part.output ? (
        <p className="line-clamp-6 text-sm whitespace-pre-wrap text-muted-foreground">
          {part.output.text}
        </p>
      ) : null
    case "tool-recall":
      return part.output ? (
        <CodeBlock code={part.output.memory} language="markdown" />
      ) : null
    // The agent's own screenshots stay out of the chat.
    case "tool-viewScreen":
    case "tool-showScreen":
      return null
    case "tool-pcRun":
    case "tool-pcReadFile":
    case "tool-pcWriteFile":
    case "tool-pcListFiles":
    case "tool-pcOpen":
      return <PcResult part={part} />
    case "tool-listPcs":
      return part.output ? (
        <ul className="flex flex-col gap-1 text-sm">
          {part.output.devices.length === 0 ? (
            <li className="text-muted-foreground">No device is connected.</li>
          ) : (
            part.output.devices.map((entry) => (
              <li key={entry.name} className="truncate">
                <span className="font-medium">{entry.name}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · {entry.system} · {entry.sharedFolder}
                </span>
              </li>
            ))
          )}
        </ul>
      ) : null
    default:
      return <ToolInput input={part.input} />
  }
}

/** In place of a reply the user's allowance didn't cover. */
function UsageLimitNotice({ message }: { message: string }) {
  const pathname = usePathname()
  return (
    <Alert>
      <GaugeIcon />
      <AlertTitle>Usage limit reached</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <p>{message}</p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            render={<Link href={USAGE_PATH} />}
            nativeButton={false}
          >
            See usage
          </Button>
          <Button
            size="sm"
            render={<Link href={pricingHref(pathname)} />}
            nativeButton={false}
          >
            See plans
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  )
}

/** A badge in the reply where one bot passed the message to another. */
function HandoffBadge({
  part,
  botsById,
}: {
  part: PartOf<"tool-handoff">
  botsById: Map<string, Bot>
}) {
  if (part.state === "input-streaming" || part.state === "input-available") {
    return <Shimmer>Handing off…</Shimmer>
  }

  const output = part.state === "output-available" ? part.output : undefined
  if (!output?.ok) {
    // The bot carries on answering itself; nothing happened worth showing.
    return null
  }

  const target = botsById.get(output.toBotId)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="secondary" className="gap-1.5 rounded-full pl-1">
        <ChatAvatar
          seed={target?.avatar ?? output.toBotId}
          className="size-4 shrink-0"
        />
        Handed off to {output.toBotName}
      </Badge>
      {output.reason ? (
        <span className="text-xs text-muted-foreground">{output.reason}</span>
      ) : null}
    </div>
  )
}

function ToolCall({
  part,
  botsById,
  chatId,
}: {
  part: ToolPart
  botsById: Map<string, Bot>
  chatId: string
}) {
  if (part.type === "tool-handoff") {
    return <HandoffBadge part={part} botsById={botsById} />
  }

  // A shared file that exists is a download card; a failed one falls through
  // to the ordinary tool row, which shows why.
  if (
    part.type === "tool-shareFile" &&
    !(part.state === "output-available" && !part.output.ok) &&
    part.state !== "output-error"
  ) {
    return <SharedFile part={part} chatId={chatId} />
  }

  if (part.type === "tool-showScreen") {
    if (part.state === "output-available") {
      return (
        <Image
          base64={part.output.image}
          mediaType={part.output.mediaType}
          uint8Array={NO_BYTES}
          alt="Screenshot of the bot's screen"
          className="w-full border"
        />
      )
    }

    if (part.state !== "output-error") {
      return <Shimmer>Taking a screenshot…</Shimmer>
    }
  }

  return (
    <Tool>
      <ToolHeader type={part.type} state={part.state} title={toolTitle(part)} />
      <ToolContent>
        <ToolDetails part={part} />
        {part.state === "output-error" ? (
          <ToolOutput output={undefined} errorText={part.errorText} />
        ) : null}
      </ToolContent>
    </Tool>
  )
}

function BotLabel({ bot }: { bot: Bot }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <ChatAvatar seed={bot.avatar} className="size-5 shrink-0" />
      <span className="truncate">{bot.name}</span>
    </span>
  )
}

/** Picks which bot in a group chat answers the next message. */
function BotPicker({
  bots,
  value,
  onChange,
}: {
  bots: Bot[]
  value: string
  onChange: (botId: string) => void
}) {
  const byId = new Map(bots.map((bot) => [bot.id, bot]))

  return (
    <PromptInputSelect
      value={value}
      onValueChange={(next) => {
        // The ai-elements wrapper drops Base UI's value generic.
        if (typeof next === "string" && next) {
          onChange(next)
        }
      }}
    >
      <PromptInputSelectTrigger aria-label="Bot to reply">
        <PromptInputSelectValue>
          {(botId: string) => {
            const bot = byId.get(botId)
            return bot ? <BotLabel bot={bot} /> : null
          }}
        </PromptInputSelectValue>
      </PromptInputSelectTrigger>
      <PromptInputSelectContent>
        {bots.map((bot) => (
          <PromptInputSelectItem key={bot.id} value={bot.id}>
            <BotLabel bot={bot} />
          </PromptInputSelectItem>
        ))}
      </PromptInputSelectContent>
    </PromptInputSelect>
  )
}

/** A bot tag in a user message, sitting on the first line like an @handle. */
function MentionBadge({ bot }: { bot: Bot }) {
  return (
    <Badge
      variant="secondary"
      className="relative -top-px mr-1.5 max-w-40 gap-1 rounded-full pl-0.5 align-middle"
    >
      <ChatAvatar seed={bot.avatar} className="size-4 shrink-0" />
      <span className="truncate">{bot.name}</span>
    </Badge>
  )
}

/**
 * The text of a user message in a group chat. A message addressed to a bot
 * opens with that bot's badge in place of its "@[Name]" tag.
 */
function UserMessageText({ text, bot }: { text: string; bot?: Bot }) {
  if (!bot) {
    return <MessageResponse>{text}</MessageResponse>
  }

  return (
    <p className="text-sm break-words whitespace-pre-wrap">
      <MentionBadge bot={bot} />
      {withoutFirstMention(text)}
    </p>
  )
}

/**
 * The composer's textarea in a group chat: typing "@" lists the group's bots,
 * and picking one writes "@[Name]" and makes that bot the recipient. Focus
 * stays in the textarea; arrows move through the list, Enter or Tab picks,
 * Escape closes it.
 */
function MentionTextarea({
  bots,
  onPick,
}: {
  bots: Bot[]
  onPick: (botId: string) => void
}) {
  const { textInput } = usePromptInputController()
  const ref = useRef<HTMLTextAreaElement>(null)
  const [mention, setMention] = useState<{
    start: number
    query: string
  } | null>(null)
  const [active, setActive] = useState(0)
  // Where the input box is on screen; the list is drawn just above it.
  const [anchor, setAnchor] = useState<DOMRect | null>(null)

  const options = mention
    ? bots.filter((bot) =>
        bot.name.toLowerCase().includes(mention.query.toLowerCase())
      )
    : []
  const open = options.length > 0

  function inputBox(element: HTMLTextAreaElement) {
    return (
      element.closest<HTMLElement>("[data-slot=input-group]") ?? element
    ).getBoundingClientRect()
  }

  function track(element: HTMLTextAreaElement) {
    setAnchor(inputBox(element))
    const next = mentionQueryAt(
      element.value,
      element.selectionStart ?? element.value.length
    )
    setMention((current) => {
      if (current?.start !== next?.start || current?.query !== next?.query) {
        setActive(0)
      }
      return next
    })
  }

  function pick(bot: Bot) {
    const element = ref.current
    if (!mention || !element) {
      return
    }
    const value = textInput.value
    const caret = element.selectionStart ?? value.length
    const before = value.slice(0, mention.start)
    const insert = `${formatMention(bot.name)} `
    textInput.setInput(before + insert + value.slice(caret))
    setMention(null)
    onPick(bot.id)

    requestAnimationFrame(() => {
      const position = before.length + insert.length
      element.focus()
      element.setSelectionRange(position, position)
    })
  }

  // Keep the list on the input box when the window or the panels resize.
  useEffect(() => {
    if (!open) {
      return
    }
    const follow = () => {
      if (ref.current) {
        setAnchor(inputBox(ref.current))
      }
    }
    window.addEventListener("resize", follow)
    window.addEventListener("scroll", follow, true)
    return () => {
      window.removeEventListener("resize", follow)
      window.removeEventListener("scroll", follow, true)
    }
  }, [open])

  return (
    <>
      {/* In a portal: PromptInput's input group clips its overflow, which cut
          off a list drawn inside it. Fixed to the box, 8px above its top edge. */}
      {open && anchor
        ? createPortal(
            <div
              id="mention-list"
              role="listbox"
              aria-label="Bots in this group"
              className="fixed z-50 flex w-64 flex-col gap-0.5 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
              style={{
                left: anchor.left,
                bottom: window.innerHeight - anchor.top + 8,
              }}
            >
              {options.map((bot, index) => (
                <button
                  key={bot.id}
                  id={`mention-${bot.id}`}
                  type="button"
                  role="option"
                  aria-selected={index === active}
                  className={cn(
                    "flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none",
                    index === active && "bg-accent text-accent-foreground"
                  )}
                  // Keeps focus (and the caret) in the textarea.
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => pick(bot)}
                >
                  <ChatAvatar seed={bot.avatar} className="size-5 shrink-0" />
                  <span className="truncate">{bot.name}</span>
                  <span className="ml-auto truncate text-xs text-muted-foreground">
                    {bot.job}
                  </span>
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
      <PromptInputTextarea
        ref={ref}
        placeholder="Send a message... Type @ to tag a bot"
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? "mention-list" : undefined}
        aria-activedescendant={
          open ? `mention-${options[active]?.id}` : undefined
        }
        onChange={(event) => track(event.currentTarget)}
        onSelect={(event) => track(event.currentTarget)}
        onBlur={() => setMention(null)}
        onKeyDown={(event) => {
          if (!open) {
            return
          }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault()
            const step = event.key === "ArrowDown" ? 1 : -1
            setActive(
              (index) => (index + step + options.length) % options.length
            )
          } else if (event.key === "Enter" || event.key === "Tab") {
            // Picks the bot instead of sending the message.
            event.preventDefault()
            pick(options[active])
          } else if (event.key === "Escape") {
            event.preventDefault()
            setMention(null)
          }
        }}
      />
    </>
  )
}

export function Chat({
  chatId,
  kind,
  bots,
  initialMessages,
}: {
  chatId: string
  kind: ChatKind
  bots: Bot[]
  initialMessages: ChatUIMessage[]
}) {
  const isGroup = kind === "group"
  const { gate } = useBillingGate()
  const [pickedBotId, setBotId] = useState(bots[0]?.id ?? "")
  const botsById = new Map(bots.map((bot) => [bot.id, bot]))
  // If the picked bot was removed from the group, fall back to the first one.
  const botId = botsById.has(pickedBotId) ? pickedBotId : (bots[0]?.id ?? "")

  // The bot a user message was addressed to, if it was tagged: the id sent
  // with it, or failing that the "@[Name]" in its text.
  function taggedBot(message: ChatUIMessage, text: string) {
    const name = mentionedBot(text, bots, message.metadata?.botId)
    return name
      ? (botsById.get(message.metadata?.botId ?? "") ?? name)
      : undefined
  }

  const transport = useTriggerChatTransport<typeof chatAgent>({
    task: "chat",
    accessToken: ({ chatId }) => mintChatAccessToken(chatId),
    startSession: ({ chatId, clientData }) =>
      startChatSession({ chatId, clientData }),
    // Rides along with every message; the agent answers as this bot. The
    // transport picks up a new value without being recreated.
    clientData: { botId },
  })

  const { messages, sendMessage, status, stop } = useChat<ChatUIMessage>({
    id: chatId,
    messages: initialMessages,
    transport,
    // A failed reply pops up as a toast (bottom right) rather than red text.
    // The message is already safe to show: the agent's onError replaces
    // provider internals with a friendly line.
    onError: (error) => {
      toast.add({
        type: "error",
        title: "The bot couldn't reply",
        description: error.message || "Something went wrong. Please try again.",
      })
    },
    // After a handoff the next message goes to the bot that took over, so
    // the conversation carries on with it.
    onFinish: ({ message }) => {
      const target = handedOffTo(message.parts)
      if (isGroup && target && botsById.has(target)) {
        setBotId(target)
      }
    },
  })

  // Watch Mode: tell the desktop panel (direct chats only) while this reply
  // is driving the bot's computer.
  const setLive = useOptionalDesktopPanel()?.setLive
  const lastMessage = messages.at(-1)
  const usingComputer =
    (status === "streaming" || status === "submitted") &&
    lastMessage?.role === "assistant" &&
    lastMessage.parts.some((part) => DESKTOP_TOOLS.has(part.type))
  useEffect(() => {
    setLive?.(usingComputer)
  }, [setLive, usingComputer])

  /** Sends a message; false when the paywall stopped it. */
  function send(text: string) {
    // Chatting runs the bot and its sandbox, both on the paid plan.
    if (!gate([FEATURES.bots, FEATURES.sandboxes], PAYWALL.chatting)) {
      return false
    }

    if (!isGroup) {
      sendMessage({ text })
      return true
    }

    // A tag in the text names the recipient; otherwise the picker does.
    const target = mentionedBot(text, bots, botId)?.id ?? botId
    setBotId(target)
    // On the message, so its badge survives a reload, and as per-message
    // transport metadata, so this turn goes to that bot even before the
    // picker's new value reaches the transport.
    sendMessage(
      { text, metadata: { botId: target } },
      { metadata: { botId: target } }
    )
    return true
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Conversation>
        <ConversationContent className="mx-auto w-full max-w-3xl">
          {messages.length === 0 ? (
            <ChatWelcome
              bots={bots}
              isGroup={isGroup}
              onPick={(prompt) => {
                if (status === "ready" || status === "error") {
                  send(prompt)
                }
              }}
            />
          ) : (
            messages.map((message) => {
              // In a group chat each reply names the bot that wrote it.
              const firstTextIndex = message.parts.findIndex(
                (part) => part.type === "text"
              )
              const author =
                isGroup && message.role === "assistant"
                  ? botsById.get(message.metadata?.botId ?? "")
                  : undefined

              return (
                <Message from={message.role} key={message.id}>
                  <MessageContent>
                    {author ? (
                      <span className="text-xs font-medium text-muted-foreground">
                        <BotLabel bot={author} />
                      </span>
                    ) : null}
                    {message.parts.map((part, index) => {
                      const key = `${message.id}-${index}`

                      // A bot that hands off should say nothing first. If a
                      // model writes a line anyway ("I'm Ada, but..."), it is
                      // left out: the message belongs to the bot it went to.
                      if (
                        part.type === "text" &&
                        index < firstHandoffIndex(message.parts)
                      ) {
                        return null
                      }

                      if (part.type === "text") {
                        if (isGroup && message.role === "user") {
                          return (
                            <UserMessageText
                              key={key}
                              text={part.text}
                              bot={
                                index === firstTextIndex
                                  ? taggedBot(message, part.text)
                                  : undefined
                              }
                            />
                          )
                        }
                        return (
                          <MessageResponse key={key}>
                            {part.text}
                          </MessageResponse>
                        )
                      }

                      if (isToolPart(part)) {
                        return (
                          <ToolCall
                            key={key}
                            part={part}
                            botsById={botsById}
                            chatId={chatId}
                          />
                        )
                      }

                      if (part.type === "data-usageLimit") {
                        return (
                          <UsageLimitNotice
                            key={key}
                            message={part.data.message}
                          />
                        )
                      }

                      return null
                    })}
                  </MessageContent>
                </Message>
              )
            })
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="px-4 pt-2 pb-4">
        <PromptInputProvider>
          <PromptInput
            className="mx-auto w-full max-w-3xl rounded-2xl shadow-sm transition-shadow focus-within:shadow-[0_0_0_1px_var(--brand),0_8px_32px_-12px_var(--brand)] [&_[data-slot=input-group]]:rounded-2xl"
            onSubmit={({ text }) => {
              if (!text.trim()) {
                return
              }

              // Throwing keeps the text in the composer for after upgrading.
              if (!send(text)) {
                throw new Error(UPGRADE_REQUIRED)
              }
            }}
          >
            <PromptInputBody>
              {isGroup ? (
                <MentionTextarea bots={bots} onPick={setBotId} />
              ) : (
                <PromptInputTextarea placeholder="Send a message..." />
              )}
            </PromptInputBody>
            <PromptInputFooter>
              <PromptInputTools>
                {isGroup && bots.length > 0 ? (
                  <BotPicker bots={bots} value={botId} onChange={setBotId} />
                ) : null}
              </PromptInputTools>
              <PromptInputSubmit status={status} onStop={stop} />
            </PromptInputFooter>
          </PromptInput>
          <p className="mx-auto mt-2 max-w-3xl text-center text-[11px] text-muted-foreground/80">
            Bots run on real sandboxes and can make mistakes. Check important
            results.
          </p>
        </PromptInputProvider>
      </div>
    </div>
  )
}
