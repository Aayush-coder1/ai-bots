import { auth } from "@clerk/nextjs/server"
import { notFound } from "next/navigation"

import { Chat } from "@/components/chat"
import { ChatHeader } from "@/components/chat-header"
import {
  DesktopDialog,
  DesktopPanel,
  DesktopPanelHandle,
  DesktopPanelProvider,
} from "@/components/desktop-panel"
import { ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { chatTranscriptStorage } from "@/lib/chat-transcript-storage"
import { getChat } from "@/queries"
import type { ChatUIMessage } from "@/trigger/tools"

// Opening the desktop may have to start a stopped sandbox and its desktop,
// which can take longer than the default function timeout on Vercel.
export const maxDuration = 60

export default async function ChatPage(props: PageProps<"/chats/[chatId]">) {
  await auth.protect()
  const { chatId } = await props.params
  const chat = await getChat(chatId)

  if (!chat) {
    notFound()
  }

  const { messages } = await chatTranscriptStorage.load<ChatUIMessage>({
    chatId: chat.id,
    clientData: undefined,
  })

  const chatView = (
    <>
      <ChatHeader chat={chat} />
      <Chat
        chatId={chat.id}
        kind={chat.kind}
        bots={chat.bots}
        initialMessages={messages}
      />
    </>
  )

  // Group chats have no desktop: each turn is answered by a bot the user
  // picks, and there is no single sandbox to show.
  if (chat.kind === "group") {
    return <div className="flex min-h-0 flex-1 flex-col">{chatView}</div>
  }

  return (
    <DesktopPanelProvider chatId={chat.id} botName={chat.bot?.name ?? "Bot"}>
      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
        <ResizablePanel
          minSize="30%"
          className="flex min-h-0 flex-col"
          // Panels scroll by default; only the messages inside should.
          style={{ overflow: "hidden" }}
        >
          {chatView}
        </ResizablePanel>
        <DesktopPanelHandle />
        <DesktopPanel />
      </ResizablePanelGroup>
      <DesktopDialog />
    </DesktopPanelProvider>
  )
}
