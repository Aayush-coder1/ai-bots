import Link from "next/link"

import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm font-medium text-brand">404</p>
      <h1 className="text-3xl font-semibold tracking-tight">
        This page doesn&apos;t exist
      </h1>
      <p className="max-w-md text-muted-foreground">
        The link may be old, or the page may have moved.
      </p>
      <Button render={<Link href="/" />} nativeButton={false}>
        Back to ai-bots
      </Button>
    </div>
  )
}
