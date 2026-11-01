"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress"
import {
  formatQuantity,
  type MeterUsage,
  METERS,
  type UsageSummary,
} from "@/lib/usage-limits"
import { cn } from "@/lib/utils"

// The page's numbers come from the server; they're re-read this often while
// it's open, so a bot working in another tab shows up here.
const REFRESH_MS = 30_000

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}

function pad(value: number) {
  return String(value).padStart(2, "0")
}

/** Live time left until the billing period resets, to the second. */
export function ResetCountdown({ periodEnd }: { periodEnd: string }) {
  const router = useRouter()
  const now = useNow(1000)
  const end = new Date(periodEnd).getTime()
  const left = Math.max(0, end - now)
  const reset = left === 0

  // A new period has started: read the fresh (empty) totals.
  useEffect(() => {
    if (reset) {
      router.refresh()
    }
  }, [reset, router])

  // Keep the meters current while the page is open.
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), REFRESH_MS)
    return () => clearInterval(timer)
  }, [router])

  const seconds = Math.floor(left / 1000)
  const days = Math.floor(seconds / 86_400)
  const hours = Math.floor((seconds % 86_400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  const units = [
    { label: "days", value: String(days) },
    { label: "hours", value: pad(hours) },
    { label: "min", value: pad(minutes) },
    { label: "sec", value: pad(seconds % 60) },
  ]

  return (
    <div className="flex gap-4" role="timer" aria-live="off">
      {units.map((unit) => (
        <div key={unit.label} className="flex flex-col items-center">
          <span className="text-3xl font-semibold tabular-nums">
            {unit.value}
          </span>
          <span className="text-xs text-muted-foreground">{unit.label}</span>
        </div>
      ))}
    </div>
  )
}

type Breakdown = { label: string; value: number }

function MeterCard({
  usage,
  breakdown,
}: {
  usage: MeterUsage
  breakdown: Breakdown[]
}) {
  const info = METERS[usage.meter]
  const included = usage.limit > 0
  const percent = included ? Math.min(100, (usage.used / usage.limit) * 100) : 0
  const tone = percent >= 100 ? "full" : percent >= 80 ? "high" : "ok"

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{info.label}</CardTitle>
        <CardDescription>{info.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {included ? (
          <Progress
            value={percent}
            className={cn(
              tone === "full" &&
                "[&_[data-slot=progress-indicator]]:bg-destructive",
              tone === "high" &&
                "[&_[data-slot=progress-indicator]]:bg-amber-500"
            )}
          >
            <ProgressLabel className="tabular-nums">
              {formatQuantity(info.unit, usage.used)} of{" "}
              {formatQuantity(info.unit, usage.limit)}
            </ProgressLabel>
            <ProgressValue>{() => `${Math.floor(percent)}%`}</ProgressValue>
          </Progress>
        ) : (
          <p className="text-sm text-muted-foreground">
            Not included in your plan.
          </p>
        )}
        {breakdown.length > 1 ? (
          <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {breakdown.map((item) => (
              <div key={item.label} className="flex gap-1">
                <dt>{item.label}</dt>
                <dd className="text-foreground tabular-nums">
                  {formatQuantity(info.unit, item.value)}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </CardContent>
    </Card>
  )
}

const BREAKDOWN_LABELS: Record<string, string> = {
  ai_input_tokens: "Input",
  ai_output_tokens: "Output",
  e2b_desktop_seconds: "Desktop",
  e2b_code_seconds: "Code runs",
}

/** A meter per allowance, each with a bar showing how much is used. */
export function UsageMeters({ summary }: { summary: UsageSummary }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {summary.meters.map((usage) => (
        <MeterCard
          key={usage.meter}
          usage={usage}
          breakdown={METERS[usage.meter].metrics.map((metric) => ({
            label: BREAKDOWN_LABELS[metric] ?? metric,
            value: summary.metrics[metric] ?? 0,
          }))}
        />
      ))}
    </div>
  )
}
