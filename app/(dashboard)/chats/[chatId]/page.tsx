import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";

import { getChat } from "@/queries";
import { Chat } from "@/components/chat";
import { ChatHeader } from "@/components/chat-header";

export default async function ChatPage(props: PageProps<"/chats/[chatId]">) {
  await auth.protect();
  const { chatId } = await props.params;
  const chat = await getChat(chatId);

  if (!chat) {
    notFound();
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ChatHeader chat={chat} />
      <Chat />
    </div>
  );
}
