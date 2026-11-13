"use client"

import { ShieldQuestionIcon } from "lucide-react"
import { useCallback, useEffect, useState } from "react"

import {
  getPendingApprovals,
  type PendingApproval,
  resolveApproval,
} from "@/actions/device"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

/**
 * Commands a bot wants to run on one of the user's devices, each with Allow
 * and Don't allow. Checks for new ones while `active`; pass a chat to show
 * only that chat's.
 */
export function PcApprovals({
  chatId,
  active,
  intervalMs = 2000,
}: {
  chatId?: string
  active: boolean
  intervalMs?: number
}) {
  const [items, setItems] = useState<PendingApproval[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setItems(await getPendingApprovals(chatId))
    } catch {
      // A missed check is retried on the next tick.
    }
  }, [chatId])

  useEffect(() => {
    if (!active) {
      return
    }
    const first = setTimeout(load, 300)
    const timer = setInterval(load, intervalMs)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
    }
  }, [active, intervalMs, load])

  async function answer(id: string, decision: "approve" | "deny" | "always") {
    setBusy(id)
    try {
      await resolveApproval(id, decision)
      setItems((current) => current.filter((item) => item.id !== id))
    } finally {
      setBusy(null)
    }
  }

  if (!active || items.length === 0) {
    return null
  }

  return (
    <div className="flex flex-col gap-2" role="alert">
      {items.map((item) => (
        <div
          key={item.id}
          className="flex flex-col gap-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3"
        >
          <div className="flex items-start gap-2">
            <ShieldQuestionIcon className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <p className="text-sm">
                <span className="font-medium">{item.bot}</span> wants to{" "}
                {item.kind === "open" ? "open this" : "run this command"} on{" "}
                <span className="font-medium">{item.device}</span>
                {item.cwd && item.cwd !== "." ? ` (in ${item.cwd})` : ""}:
              </p>
              <code className="rounded-md bg-muted px-2 py-1.5 font-mono text-xs break-all whitespace-pre-wrap">
                {item.detail}
              </code>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={busy !== null}
              onClick={() => answer(item.id, "approve")}
            >
              {busy === item.id ? <Spinner data-icon="inline-start" /> : null}
              Allow once
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() => answer(item.id, "deny")}
            >
              Don&apos;t allow
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy !== null}
              onClick={() => answer(item.id, "always")}
            >
              Always allow on {item.device}
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}
