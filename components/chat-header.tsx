"use client"

import { DownloadIcon } from "lucide-react"
import { useState } from "react"

import { exportChatMarkdown } from "@/actions/export"
import { BotDialog } from "@/components/bot-dialog"
import { DesktopToggle } from "@/components/desktop-panel"
import { GroupChatAvatar } from "@/components/group-chat-avatar"
import { GroupChatDialog } from "@/components/group-chat-dialog"
import { Button } from "@/components/ui/button"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { chatName } from "@/lib/chat-name"
import type { Bot } from "@/db/schema"
import type { ChatWithBot } from "@/queries"

/** Downloads the chat's saved transcript as a Markdown file. */
function ExportButton({ chatId }: { chatId: string }) {
  const [exporting, setExporting] = useState(false)

  async function handleExport() {
    setExporting(true)
    try {
      const result = await exportChatMarkdown(chatId)
      if (!result.ok) {
        throw new Error(result.reason)
      }
      const url = URL.createObjectURL(
        new Blob([result.markdown], { type: "text/markdown;charset=utf-8" })
      )
      const link = document.createElement("a")
      link.href = url
      link.download = result.filename
      link.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.add({
        type: "error",
        title: "Couldn't export the chat",
        description: "Please try again in a moment.",
      })
    } finally {
      setExporting(false)
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Export chat as Markdown"
            disabled={exporting}
            onClick={handleExport}
          />
        }
      >
        {exporting ? <Spinner /> : <DownloadIcon />}
      </TooltipTrigger>
      <TooltipContent>Export as Markdown</TooltipContent>
    </Tooltip>
  )
}

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
  const seeds = chat.bot
    ? [chat.bot.avatar]
    : chat.bots.map((bot) => bot.avatar)
  const subtitle = chat.bot ? chat.bot.job : `${chat.bots.length} bots`

  return (
    <>
      <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b bg-background/80 px-2 backdrop-blur supports-backdrop-filter:bg-background/60">
        <div className="flex min-w-0 items-center gap-1">
          <SidebarTrigger className="md:hidden" />
          <Button
            variant="ghost"
            className="h-auto min-w-0 gap-2.5 px-2 py-1"
            aria-label={`Edit ${name}`}
            onClick={() => setEditOpen(true)}
          >
            <GroupChatAvatar
              seeds={seeds}
              fallbackSeed={chat.id}
              className="size-7 shrink-0"
            />
            <span className="flex min-w-0 flex-col items-start leading-tight">
              <span className="truncate text-sm font-semibold tracking-tight">
                {name}
              </span>
              <span className="truncate text-xs font-normal text-muted-foreground">
                {subtitle}
              </span>
            </span>
          </Button>
        </div>
        <div className="mr-2 flex items-center gap-1">
          <ExportButton chatId={chat.id} />
          {/* Only a direct chat's bot has a desktop to show. */}
          {chat.kind === "direct" ? <DesktopToggle /> : null}
        </div>
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
