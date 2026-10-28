import { auth } from "@clerk/nextjs/server";
import { nanoid } from "nanoid";

import { BotDialog } from "@/components/bot-dialog";
import { ChatAvatar } from "@/components/chat-avatar";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export default async function Page() {
  await auth.protect();

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyMedia>
            <ChatAvatar seed={nanoid()} className="size-16" />
          </EmptyMedia>
          <EmptyTitle className="text-2xl">Meet your first bot</EmptyTitle>
          <EmptyDescription className="text-base">
            Every bot gets its own personality, memory, and face. Spin one up
            and start the conversation.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <BotDialog />
        </EmptyContent>
      </Empty>
    </div>
  );
}
