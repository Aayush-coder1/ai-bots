"use client"

import { useState } from "react"

import { BotDialog } from "@/components/bot-dialog"
import { DesktopToggle } from "@/components/desktop-panel"
import { GroupChatAvatar } from "@/components/group-chat-avatar"
import { Button } from "@/components/ui/button"
import { chatName } from "@/lib/chat-name"
import type { ChatWithBot } from "@/queries"

export function ChatHeader({ chat }: { chat: ChatWithBot }) {
  const name = chatName(chat)
  const [editOpen, setEditOpen] = useState(false)

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
            <GroupChatAvatar
              seeds={[chat.bot.avatar]}
              fallbackSeed={chat.id}
              className="size-6 shrink-0"
            />
            <span className="truncate text-sm font-semibold">{name}</span>
          </Button>
        ) : (
          <div className="flex min-w-0 items-center gap-2 px-2 py-1">
            <GroupChatAvatar
              seeds={chat.bots.map((bot) => bot.avatar)}
              fallbackSeed={chat.id}
              className="size-6 shrink-0"
            />
            <h1 className="truncate text-sm font-semibold">{name}</h1>
          </div>
        )}
        {/* Only a direct chat's bot has a desktop to show. */}
        {chat.kind === "direct" ? <DesktopToggle className="mr-2" /> : null}
      </header>
      {chat.bot ? (
        <BotDialog
          bot={chat.bot}
          open={editOpen}
          onOpenChange={setEditOpen}
          trigger={null}
        />
      ) : null}
    </>
  )
}
