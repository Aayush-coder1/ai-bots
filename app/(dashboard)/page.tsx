import { auth } from "@clerk/nextjs/server"
import {
  BrainIcon,
  GlobeIcon,
  MonitorIcon,
  TerminalIcon,
  UsersIcon,
} from "lucide-react"
import { nanoid } from "nanoid"

import { BotDialog } from "@/components/bot-dialog"
import { ChatAvatar } from "@/components/chat-avatar"
import { SidebarTrigger } from "@/components/ui/sidebar"

const CAPABILITIES = [
  {
    icon: MonitorIcon,
    title: "Its own computer",
    description: "A live desktop you can watch, or take over, as it works.",
  },
  {
    icon: TerminalIcon,
    title: "Terminal and code",
    description: "Writes files and runs commands in an isolated sandbox.",
  },
  {
    icon: GlobeIcon,
    title: "The open web",
    description: "Searches, reads pages, and cites where it found things.",
  },
  {
    icon: BrainIcon,
    title: "Long-term memory",
    description: "Remembers what you teach it, separately for each bot.",
  },
  {
    icon: UsersIcon,
    title: "Group chats",
    description:
      "Put bots in a room; they @mention and hand off to each other.",
  },
] as const

export default async function Page() {
  await auth.protect()

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
      <SidebarTrigger className="absolute top-3 left-3 md:hidden" />
      {/* A soft brand glow behind the hero; decorative only. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(60%_60%_at_50%_0%,color-mix(in_oklch,var(--brand)_14%,transparent),transparent)]"
      />
      <div className="relative mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-10 px-6 py-16 text-center">
        <div className="flex flex-col items-center gap-5">
          <div className="rounded-2xl bg-card p-2.5 shadow-sm ring-1 ring-border">
            <ChatAvatar seed={nanoid()} animated className="size-16" />
          </div>
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              Agents with their own computers
            </h1>
            <p className="mx-auto max-w-lg text-base text-balance text-muted-foreground">
              Every bot gets a personality, a memory, a face, and a real
              sandboxed desktop. Spin one up and give it a job.
            </p>
          </div>
          <BotDialog />
        </div>
        <ul className="grid w-full gap-3 text-left sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map((capability) => (
            <li
              key={capability.title}
              className="flex flex-col gap-1.5 rounded-xl border bg-card/60 p-4 shadow-xs backdrop-blur-sm"
            >
              <span className="flex size-8 items-center justify-center rounded-lg bg-brand/10 text-brand ring-1 ring-brand/20">
                <capability.icon className="size-4" />
              </span>
              <span className="mt-1 text-sm font-medium">
                {capability.title}
              </span>
              <span className="text-xs text-muted-foreground">
                {capability.description}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
