import { createClerkClient } from "@clerk/backend"
import { and, eq, gte, lt, sql } from "drizzle-orm"
import { nanoid } from "nanoid"

import { db } from "@/db"
import { type UsageMetric, usageEvents } from "@/db/schema"
import { PAID_PLAN } from "@/lib/billing"
import {
  formatQuantity,
  formatTimeUntil,
  METER_ORDER,
  METERS,
  type Meter,
  PLAN_LIMITS,
  type PlanKey,
  type UsageSummary,
} from "@/lib/usage-limits"

// The usage ledger and its limits. Shared by the Next.js server (desktop
// panel, usage page) and the Trigger.dev worker (the agent and its tools), so
// it uses @clerk/backend directly rather than the Next.js-only helpers.

export type BillingPeriod = {
  plan: PlanKey
  start: Date
  end: Date
}

/** Thrown when a user has used up a meter for this billing period. */
export class UsageLimitError extends Error {
  name = "UsageLimitError"

  constructor(
    readonly meter: Meter,
    readonly plan: PlanKey,
    readonly resetsAt: Date
  ) {
    super(limitMessage(meter, plan, resetsAt))
  }
}

export function isUsageLimitError(error: unknown): error is UsageLimitError {
  return error instanceof Error && error.name === "UsageLimitError"
}

function limitMessage(meter: Meter, plan: PlanKey, resetsAt: Date) {
  const { label, unit } = METERS[meter]
  if (plan === "free") {
    return `${label} are part of the paid plan. Upgrade to continue.`
  }
  const limit = formatQuantity(unit, PLAN_LIMITS[plan][meter])
  const date = resetsAt.toLocaleDateString("en", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
  return `You've used all ${limit} of your ${label.toLowerCase()} for this billing period. It resets in ${formatTimeUntil(resetsAt)} (${date}). Upgrade your plan or wait for the reset to continue.`
}

let clerk: ReturnType<typeof createClerkClient> | undefined
function clerkClient() {
  clerk ??= createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY })
  return clerk
}

/** The current calendar month in UTC: the period for anyone without a paid cycle. */
function calendarMonth(now: Date) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  return { start, end }
}

async function fetchBillingPeriod(userId: string): Promise<BillingPeriod> {
  const now = new Date()
  try {
    const subscription =
      await clerkClient().billing.getUserBillingSubscription(userId)
    const item = subscription.subscriptionItems.find(
      (candidate) =>
        candidate.plan?.slug === PAID_PLAN &&
        (candidate.status === "active" || candidate.status === "past_due")
    )
    if (item) {
      const start = new Date(item.periodStart)
      // A cycle with no end yet (e.g. a trial) is treated as a month long.
      const end = item.periodEnd
        ? new Date(item.periodEnd)
        : new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000)
      return { plan: "pro", start, end }
    }
    return { plan: "free", ...calendarMonth(now) }
  } catch (error) {
    const status = (error as { status?: number }).status
    if (status === 404) {
      return { plan: "free", ...calendarMonth(now) }
    }
    // Clerk unreachable: don't lock a paying user out over it. The Next.js
    // feature gates (has({ feature })) still keep free users away from bots.
    console.error(`Couldn't load the billing period of ${userId}`, error)
    return { plan: "pro", ...calendarMonth(now) }
  }
}

// Plans change rarely; the cycle is cached briefly and refreshed once it ends.
const PERIOD_TTL_MS = 5 * 60 * 1000
const periods = new Map<
  string,
  { period: Promise<BillingPeriod>; fetchedAt: number }
>()

/** The user's plan and current billing cycle. */
export async function getBillingPeriod(userId: string) {
  const cached = periods.get(userId)
  if (cached && Date.now() - cached.fetchedAt < PERIOD_TTL_MS) {
    const period = await cached.period
    if (period.end.getTime() > Date.now()) {
      return period
    }
  }
  const period = fetchBillingPeriod(userId)
  periods.set(userId, { period, fetchedAt: Date.now() })
  period.catch(() => periods.delete(userId))
  return period
}

/** Forgets a cached cycle, e.g. right after the user changes plan. */
export function forgetBillingPeriod(userId: string) {
  periods.delete(userId)
}

export type UsageEntry = {
  metric: UsageMetric
  quantity: number
  chatId?: string
  botId?: string
  resourceId?: string
}

/** Adds rows to the ledger, charged to the user's current cycle. */
export async function recordUsage(userId: string, entries: UsageEntry[]) {
  const rows = entries.filter(
    (entry) => Number.isFinite(entry.quantity) && entry.quantity > 0
  )
  if (rows.length === 0) {
    return
  }
  const period = await getBillingPeriod(userId)
  await db.insert(usageEvents).values(
    rows.map((entry) => ({
      ...entry,
      quantity: Math.round(entry.quantity),
      userId,
      periodStart: period.start,
      periodEnd: period.end,
    }))
  )
}

/**
 * Metering must never break the thing being metered: a failed write is
 * logged, and the user's request goes on.
 */
export function recordUsageSafely(userId: string, entries: UsageEntry[]) {
  return recordUsage(userId, entries).catch((error) =>
    console.error(`Failed to record usage for ${userId}`, error)
  )
}

/**
 * Charges a sandbox's running time so far: the seconds since it started,
 * minus what the ledger already holds for it. Safe to call from any process
 * as often as needed; the difference is computed in one statement.
 */
export async function recordRunningTime({
  userId,
  metric,
  resourceId,
  startedAt,
  chatId,
  botId,
}: {
  userId: string
  metric: Extract<UsageMetric, `${string}_seconds`>
  resourceId: string
  startedAt: Date
  chatId?: string
  botId?: string
}) {
  const period = await getBillingPeriod(userId)
  const elapsed = Math.floor((Date.now() - startedAt.getTime()) / 1000)
  if (elapsed <= 0) {
    return
  }
  // Small differences are left for the next call, so frequent touches don't
  // fill the ledger with one-second rows.
  await db.execute(sql`
    insert into ${usageEvents} (id, user_id, metric, quantity, period_start, period_end, resource_id, chat_id, bot_id)
    select ${nanoid()}, ${userId}, ${metric}, ${elapsed} - coalesce(sum(${usageEvents.quantity}), 0),
      ${period.start}, ${period.end}, ${resourceId}, ${chatId ?? null}, ${botId ?? null}
    from ${usageEvents}
    where ${usageEvents.resourceId} = ${resourceId} and ${usageEvents.metric} = ${metric}
    having ${elapsed} - coalesce(sum(${usageEvents.quantity}), 0) >= 15
  `)
}

export function recordRunningTimeSafely(
  input: Parameters<typeof recordRunningTime>[0]
) {
  return recordRunningTime(input).catch((error) =>
    console.error(`Failed to record running time for ${input.userId}`, error)
  )
}

/** Totals per ledger metric in the user's current cycle. */
async function metricTotals(userId: string, period: BillingPeriod) {
  const rows = await db
    .select({
      metric: usageEvents.metric,
      total: sql<string>`coalesce(sum(${usageEvents.quantity}), 0)`,
    })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.userId, userId),
        gte(usageEvents.createdAt, period.start),
        lt(usageEvents.createdAt, period.end)
      )
    )
    .groupBy(usageEvents.metric)

  const totals: Partial<Record<UsageMetric, number>> = {}
  for (const row of rows) {
    totals[row.metric] = Number(row.total)
  }
  return totals
}

function meterTotal(
  meter: Meter,
  totals: Partial<Record<UsageMetric, number>>
) {
  return METERS[meter].metrics.reduce(
    (sum, metric) => sum + (totals[metric] ?? 0),
    0
  )
}

/** The user's usage, limits and cycle, for the usage page. */
export async function getUsageSummary(userId: string): Promise<UsageSummary> {
  const period = await getBillingPeriod(userId)
  const totals = await metricTotals(userId, period)
  const limits = PLAN_LIMITS[period.plan]
  return {
    plan: period.plan,
    periodStart: period.start.toISOString(),
    periodEnd: period.end.toISOString(),
    meters: METER_ORDER.map((meter) => ({
      meter,
      used: meterTotal(meter, totals),
      limit: limits[meter],
    })),
    metrics: totals,
  }
}

/**
 * Throws a UsageLimitError when any of `meters` is used up this cycle. The
 * gate before anything billable starts: an AI turn, a search, a sandbox.
 * A check can let one last request slightly past the limit; it never lets
 * a user keep going once over it.
 */
export async function assertWithinLimits(userId: string, ...meters: Meter[]) {
  const period = await getBillingPeriod(userId)
  const totals = await metricTotals(userId, period)
  for (const meter of meters) {
    if (meterTotal(meter, totals) >= PLAN_LIMITS[period.plan][meter]) {
      throw new UsageLimitError(meter, period.plan, period.end)
    }
  }
}
