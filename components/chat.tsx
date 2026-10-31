"use client"

import { useChat } from "@ai-sdk/react"
import { useTriggerChatTransport } from "@trigger.dev/sdk/chat/react"
import type { BundledLanguage } from "shiki"

import { mintChatAccessToken, startChatSession } from "@/actions/chat"
import { CodeBlock } from "@/components/ai-elements/code-block"
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
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
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input"
import { Shimmer } from "@/components/ai-elements/shimmer"
import { Terminal } from "@/components/ai-elements/terminal"
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool"
import type { chatAgent } from "@/trigger/chat"
import type { ChatUIMessage } from "@/trigger/tools"

type Part = ChatUIMessage["parts"][number]
type ToolPart = Extract<Part, { type: `tool-${string}` }>
type PartOf<T extends ToolPart["type"]> = Extract<ToolPart, { type: T }>

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

function isToolPart(part: Part): part is ToolPart {
  return part.type.startsWith("tool-")
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
    case "tool-viewScreen":
      return "Looked at the screen"
    case "tool-showScreen":
      return "Took a screenshot"
  }
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
    // The agent's own screenshots stay out of the chat.
    case "tool-viewScreen":
    case "tool-showScreen":
      return null
    default:
      return <ToolInput input={part.input} />
  }
}

function ToolCall({ part }: { part: ToolPart }) {
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

export function Chat({
  chatId,
  initialMessages,
}: {
  chatId: string
  initialMessages: ChatUIMessage[]
}) {
  const transport = useTriggerChatTransport<typeof chatAgent>({
    task: "chat",
    accessToken: ({ chatId }) => mintChatAccessToken(chatId),
    startSession: ({ chatId, clientData }) =>
      startChatSession({ chatId, clientData }),
  })

  const { messages, sendMessage, status, stop, error } = useChat<ChatUIMessage>(
    {
      id: chatId,
      messages: initialMessages,
      transport,
    }
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Conversation>
        <ConversationContent>
          {messages.length === 0 ? (
            <ConversationEmptyState
              title="Start the conversation"
              description="Send a message to kick things off."
            />
          ) : (
            messages.map((message) => (
              <Message from={message.role} key={message.id}>
                <MessageContent>
                  {message.parts.map((part, index) => {
                    const key = `${message.id}-${index}`

                    if (part.type === "text") {
                      return (
                        <MessageResponse key={key}>{part.text}</MessageResponse>
                      )
                    }

                    if (isToolPart(part)) {
                      return <ToolCall key={key} part={part} />
                    }

                    return null
                  })}
                </MessageContent>
              </Message>
            ))
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="border-t p-4">
        {error ? (
          <p className="mb-2 text-sm text-destructive">
            Something went wrong. Try again.
          </p>
        ) : null}
        <PromptInput
          onSubmit={({ text }) => {
            if (!text.trim()) {
              return
            }

            sendMessage({ text })
          }}
        >
          <PromptInputBody>
            <PromptInputTextarea placeholder="Send a message..." />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools />
            <PromptInputSubmit status={status} onStop={stop} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  )
}
