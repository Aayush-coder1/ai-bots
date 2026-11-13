"use client"

import { formatDistanceToNowStrict } from "date-fns"
import {
  CheckIcon,
  ClockIcon,
  CopyIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

import {
  deleteAutomation,
  runAutomationNow,
  setAutomationEnabled,
} from "@/actions/automation"
import { MessageResponse } from "@/components/ai-elements/message"
import {
  AutomationDialog,
  type AutomationBot,
  type AutomationDevice,
  type EditableAutomation,
} from "@/components/automation-dialog"
import { ChatAvatar } from "@/components/chat-avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { toast } from "@/components/ui/toast"
import { useBillingGate } from "@/hooks/use-billing-gate"
import { FEATURES } from "@/lib/billing"

export type AutomationRunItem = {
  id: string
  status: "running" | "done" | "error"
  output: string | null
  error: string | null
  delivered: boolean | null
  startedAt: string
}

export type AutomationItem = {
  id: string
  name: string
  prompt: string
  enabled: boolean
  schedule: string
  timezone: string
  nextRunAt: string | null
  deliversTo: string | null
  /** The user's device it runs on; null for the bot's cloud computer. */
  runsOn: string | null
  bot: { name: string; avatar: string }
  runs: AutomationRunItem[]
  edit: EditableAutomation["edit"]
}

// A run still "running" after this long has crashed; stop waiting on it.
const STALE_RUN_MS = 12 * 60 * 1000

function isLive(run: AutomationRunItem) {
  return (
    run.status === "running" &&
    Date.now() - new Date(run.startedAt).getTime() < STALE_RUN_MS
  )
}

function RunRow({ run }: { run: AutomationRunItem }) {
  const [copied, setCopied] = useState(false)
  const when = `${formatDistanceToNowStrict(new Date(run.startedAt))} ago`

  if (run.status === "running") {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        {isLive(run) ? <Spinner /> : null}
        {isLive(run) ? "Running now…" : `Didn't finish (started ${when})`}
      </p>
    )
  }

  return (
    <Collapsible className="rounded-lg border">
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <Badge variant={run.status === "done" ? "secondary" : "destructive"}>
          {run.status === "done" ? "Done" : "Failed"}
        </Badge>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">
          {(run.output ?? run.error ?? "").replace(/[#*_`>\n]+/g, " ").trim()}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">{when}</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t px-3 py-3 text-sm">
        {run.status === "done" ? (
          <>
            <MessageResponse>{run.output ?? ""}</MessageResponse>
            <Button
              type="button"
              size="xs"
              variant="outline"
              className="mt-3"
              onClick={async () => {
                await navigator.clipboard.writeText(run.output ?? "")
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              }}
            >
              {copied ? (
                <CheckIcon data-icon="inline-start" />
              ) : (
                <CopyIcon data-icon="inline-start" />
              )}
              {copied ? "Copied" : "Copy result"}
            </Button>
          </>
        ) : (
          <p className="text-destructive">{run.error}</p>
        )}
        {run.delivered === false ? (
          <p className="mt-2 text-xs text-destructive">
            Couldn&apos;t send this to your webhook. Check that the URL is still
            valid.
          </p>
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  )
}

function AutomationCard({
  automation,
  onEdit,
}: {
  automation: AutomationItem
  onEdit: () => void
}) {
  const router = useRouter()
  const { paywall } = useBillingGate()
  const [busy, setBusy] = useState<"run" | "toggle" | "delete" | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const running = automation.runs.some(isLive)

  async function act(kind: "run" | "toggle" | "delete") {
    setBusy(kind)
    try {
      if (kind === "run") {
        const result = await runAutomationNow(automation.id)
        if (!result.ok) {
          if (result.reason === "upgrade-required") {
            paywall("Automations are part of the paid plan.")
          } else {
            toast.add({
              type: "error",
              title: "Couldn't start the run",
              description: result.message,
            })
          }
          return
        }
        toast.add({
          title: "Run started",
          description: "The result will show up here in a minute or two.",
        })
      } else if (kind === "toggle") {
        await setAutomationEnabled(automation.id, !automation.enabled)
      } else {
        await deleteAutomation(automation.id)
      }
      router.refresh()
    } catch {
      toast.add({ type: "error", title: "Something went wrong. Try again." })
    } finally {
      setBusy(null)
      setConfirmDelete(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <ChatAvatar
            seed={automation.bot.avatar}
            className="mt-0.5 size-8 shrink-0"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <CardTitle className="truncate">{automation.name}</CardTitle>
            <CardDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>{automation.bot.name}</span>
              <span aria-hidden>·</span>
              <span className="flex items-center gap-1">
                <ClockIcon className="size-3.5" />
                {automation.schedule} ({automation.timezone})
              </span>
              {automation.runsOn ? (
                <>
                  <span aria-hidden>·</span>
                  <span>runs on {automation.runsOn}</span>
                </>
              ) : null}
              {automation.deliversTo ? (
                <>
                  <span aria-hidden>·</span>
                  <span>sends to {automation.deliversTo}</span>
                </>
              ) : null}
            </CardDescription>
          </div>
          <Switch
            checked={automation.enabled}
            disabled={busy !== null}
            onCheckedChange={() => act("toggle")}
            aria-label={automation.enabled ? "Pause" : "Resume"}
          />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="line-clamp-3 text-sm whitespace-pre-wrap text-muted-foreground">
          {automation.prompt}
        </p>

        {automation.runs.length > 0 ? (
          <div className="flex flex-col gap-2">
            {automation.runs.map((run) => (
              <RunRow key={run.id} run={run} />
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy !== null || running}
            onClick={() => act("run")}
          >
            {busy === "run" ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <PlayIcon data-icon="inline-start" />
            )}
            Run now
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy !== null}
            onClick={onEdit}
          >
            <PencilIcon data-icon="inline-start" />
            Edit
          </Button>
          {confirmDelete ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={busy !== null}
                onClick={() => act("delete")}
              >
                {busy === "delete" ? (
                  <Spinner data-icon="inline-start" />
                ) : null}
                Delete for good
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy !== null}
                onClick={() => setConfirmDelete(false)}
              >
                Keep
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy !== null}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2Icon data-icon="inline-start" />
              Delete
            </Button>
          )}
          <span className="ml-auto text-xs text-muted-foreground">
            {!automation.enabled
              ? "Paused"
              : automation.nextRunAt
                ? `Next run in about ${formatDistanceToNowStrict(new Date(automation.nextRunAt))}`
                : null}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

export function Automations({
  automations,
  bots,
  devices,
}: {
  automations: AutomationItem[]
  bots: AutomationBot[]
  devices: AutomationDevice[]
}) {
  const router = useRouter()
  const { gate } = useBillingGate()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<AutomationItem | null>(null)
  const anyRunning = automations.some((a) => a.runs.some(isLive))

  // While a run is going, check for its result; otherwise just keep the
  // "next run in" times from going stale.
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), anyRunning ? 6000 : 60000)
    return () => clearInterval(timer)
  }, [router, anyRunning])

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">Automations</h1>
          <p className="max-w-xl text-muted-foreground">
            Give a bot a task and a schedule. It does the work on its own
            computer, or on your own connected device, while you&apos;re away
            and leaves the result here, or sends it to Discord, Slack or
            Telegram.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => {
            if (
              gate(
                [FEATURES.bots, FEATURES.sandboxes],
                "Automations are part of the paid plan."
              )
            ) {
              setDialogOpen(true)
            }
          }}
        >
          <PlusIcon data-icon="inline-start" />
          New automation
        </Button>
      </div>

      {automations.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Nothing scheduled yet</CardTitle>
            <CardDescription>
              Start from a template: a morning briefing, a job hunter, a price
              watcher, a competitor watch, a lead finder or a repo digest.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        automations.map((automation) => (
          <AutomationCard
            key={automation.id}
            automation={automation}
            onEdit={() => setEditing(automation)}
          />
        ))
      )}

      <AutomationDialog
        bots={bots}
        devices={devices}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
      <AutomationDialog
        bots={bots}
        devices={devices}
        automation={editing ?? undefined}
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null)
          }
        }}
      />
    </>
  )
}
