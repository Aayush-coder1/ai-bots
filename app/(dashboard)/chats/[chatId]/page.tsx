import { auth } from "@clerk/nextjs/server"
import { notFound } from "next/navigation"

import { Chat } from "@/components/chat"
import { ChatHeader } from "@/components/chat-header"
import { chatTranscriptStorage } from "@/lib/chat-transcript-storage"
import { getChat } from "@/queries"
import type { ChatUIMessage } from "@/trigger/tools"

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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ChatHeader chat={chat} />
      <Chat chatId={chat.id} initialMessages={messages} />
    </div>
  )
}
