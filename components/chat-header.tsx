"use client"

import { useState } from "react"

import { BotDialog } from "@/components/bot-dialog"
import { DesktopToggle } from "@/components/desktop-panel"
import { GroupChatAvatar } from "@/components/group-chat-avatar"
import { GroupChatDialog } from "@/components/group-chat-dialog"
import { Button } from "@/components/ui/button"
import { chatName } from "@/lib/chat-name"
import type { Bot } from "@/db/schema"
import type { ChatWithBot } from "@/queries"

export function ChatHeader({
  chat,
  allBots,
}: {
  chat: ChatWithBot
  /** Every bot the user has: the members a group can be edited to. */
  allBots: Bot[]
}) {
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
          <Button
            variant="ghost"
            className="h-auto min-w-0 gap-2 px-2 py-1"
            aria-label={`Edit ${name}`}
            onClick={() => setEditOpen(true)}
          >
            <GroupChatAvatar
              seeds={chat.bots.map((bot) => bot.avatar)}
              fallbackSeed={chat.id}
              className="size-6 shrink-0"
            />
            <span className="truncate text-sm font-semibold">{name}</span>
          </Button>
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
      ) : (
        <GroupChatDialog
          bots={allBots}
          group={chat}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      )}
    </>
  )
}
