import type { UsageMetric } from "@/db/schema"

// What each plan allows per billing period. Safe to import in the browser:
// the usage page shows these, and the server enforces them (lib/usage.ts).

/** A meter is what a limit applies to: one or more ledger metrics summed. */
export type Meter =
  "aiTokens" | "e2bSeconds" | "daytonaSeconds" | "webSearches" | "pageFetches"

export type MeterInfo = {
  label: string
  /** What it covers, in a few words. */
  description: string
  metrics: UsageMetric[]
  unit: "tokens" | "seconds" | "count"
}

export const METERS: Record<Meter, MeterInfo> = {
  aiTokens: {
    label: "AI tokens",
    description: "What your bots read and write, input and output together",
    metrics: ["ai_input_tokens", "ai_output_tokens"],
    unit: "tokens",
  },
  e2bSeconds: {
    label: "Online computer hours",
    description: "Live desktop, browsing and sound, and online code runs",
    metrics: ["e2b_desktop_seconds", "e2b_code_seconds"],
    unit: "seconds",
  },
  daytonaSeconds: {
    label: "Terminal hours",
    description: "Commands your bots run in their own sandboxes",
    metrics: ["daytona_seconds"],
    unit: "seconds",
  },
  webSearches: {
    label: "Web searches",
    description: "Searches your bots run",
    metrics: ["web_searches"],
    unit: "count",
  },
  pageFetches: {
    label: "Pages read",
    description: "Web pages your bots fetch and read",
    metrics: ["page_fetches"],
    unit: "count",
  },
}

export const METER_ORDER: Meter[] = [
  "aiTokens",
  "e2bSeconds",
  "daytonaSeconds",
  "webSearches",
  "pageFetches",
]

export type PlanKey = "free" | "pro"

const HOUR = 60 * 60

/** Allowance per billing period. The free plan can't use bots at all. */
export const PLAN_LIMITS: Record<PlanKey, Record<Meter, number>> = {
  free: {
    aiTokens: 0,
    e2bSeconds: 0,
    daytonaSeconds: 0,
    webSearches: 0,
    pageFetches: 0,
  },
  pro: {
    aiTokens: 5_000_000,
    e2bSeconds: 20 * HOUR,
    daytonaSeconds: 30 * HOUR,
    webSearches: 500,
    pageFetches: 2_000,
  },
}

export type MeterUsage = {
  meter: Meter
  used: number
  limit: number
}

/** A user's usage this billing period, as the usage page shows it. */
export type UsageSummary = {
  plan: PlanKey
  periodStart: string
  periodEnd: string
  meters: MeterUsage[]
  /** Raw totals per ledger metric, for the breakdowns. */
  metrics: Partial<Record<UsageMetric, number>>
}

/** A quantity in the meter's unit, e.g. "1.2M", "3h 20m", "42". */
export function formatQuantity(unit: MeterInfo["unit"], value: number) {
  if (unit === "seconds") {
    const minutes = Math.floor(value / 60)
    const hours = Math.floor(minutes / 60)
    if (hours > 0) {
      return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`
    }
    return minutes > 0 ? `${minutes}m` : `${Math.floor(value)}s`
  }
  return new Intl.NumberFormat("en", {
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value)
}

/** "3 days", "5 hours", "12 minutes": the coarse time until a date. */
export function formatTimeUntil(date: Date, now = new Date()) {
  const ms = Math.max(0, date.getTime() - now.getTime())
  const minutes = Math.ceil(ms / 60_000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  if (days >= 1) return `${days} day${days === 1 ? "" : "s"}`
  if (hours >= 1) return `${hours} hour${hours === 1 ? "" : "s"}`
  return `${minutes} minute${minutes === 1 ? "" : "s"}`
}

export const USAGE_PATH = "/usage"
