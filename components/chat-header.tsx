"use client"

import { MonitorIcon } from "lucide-react"
import { useState } from "react"

import type { ChatWithBot } from "@/queries"
import { BotDialog } from "@/components/bot-dialog"
import { ChatAvatar } from "@/components/chat-avatar"
import { Button } from "@/components/ui/button"
import { Toggle } from "@/components/ui/toggle"
import { useDesktopPanel } from "@/components/desktop-panel"

export function ChatHeader({ chat }: { chat: ChatWithBot }) {
  const name = chat.bot?.name ?? chat.name ?? "New chat"
  const [editOpen, setEditOpen] = useState(false)
  const { open: desktopOpen, toggle: toggleDesktop } = useDesktopPanel()

  return (
    <>
      <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b px-2">
        {chat.bot ? (
          <Button
            variant="ghost"
            className="h-auto min-w-0 gap-2 px-2 py-1"
            aria-label={`Edit ${name}`}
            onClick={() => setEditOpen(true)}
          >
            <ChatAvatar seed={chat.bot.avatar} className="size-6 shrink-0" />
            <span className="truncate text-sm font-semibold">{name}</span>
          </Button>
        ) : (
          <div className="flex min-w-0 items-center gap-2 px-2 py-1">
            <ChatAvatar seed={chat.id} className="size-6 shrink-0" />
            <h1 className="truncate text-sm font-semibold">{name}</h1>
          </div>
        )}
        <Toggle
          size="sm"
          className="mr-2"
          aria-label={desktopOpen ? "Hide desktop" : "Show desktop"}
          pressed={desktopOpen}
          onPressedChange={toggleDesktop}
        >
          <MonitorIcon />
        </Toggle>
      </header>
      <BotDialog
        bot={chat.bot}
        open={editOpen}
        onOpenChange={setEditOpen}
        trigger={null}
      />
    </>
  )
}
