"use client" // Error boundaries must be Client Components

import * as Sentry from "@sentry/nextjs"
import { RotateCcwIcon, TriangleAlertIcon } from "lucide-react"
import Link from "next/link"
import { useEffect } from "react"

import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

/**
 * Catches a crash in a dashboard page (a chat, usage, pricing) so the
 * sidebar stays up and the user can retry or move on, instead of the whole
 * app falling through to the global error page. Reported to Sentry.
 */
export default function DashboardError({
  error,
  retry,
}: {
  error: unknown
  retry: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <TriangleAlertIcon />
          </EmptyMedia>
          <EmptyTitle>Something went wrong</EmptyTitle>
          <EmptyDescription>
            This page hit an unexpected error. It&apos;s been reported, and your
            chats are safe.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="flex-row justify-center gap-2">
          <Button onClick={() => retry()}>
            <RotateCcwIcon data-icon="inline-start" />
            Try again
          </Button>
          <Button
            variant="outline"
            render={<Link href="/" />}
            nativeButton={false}
          >
            Go home
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  )
}
