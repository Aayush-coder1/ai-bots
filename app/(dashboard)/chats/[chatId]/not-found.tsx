import { MessageSquareOffIcon } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

/** A chat id that doesn't exist or belongs to someone else. */
export default function ChatNotFound() {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MessageSquareOffIcon />
          </EmptyMedia>
          <EmptyTitle>Chat not found</EmptyTitle>
          <EmptyDescription>
            It may have been deleted, or the link is wrong.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button render={<Link href="/" />} nativeButton={false}>
            Back to home
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  )
}
