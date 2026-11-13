import { and, asc, desc, eq, gte, isNotNull } from "drizzle-orm"
import { formatDistanceToNowStrict } from "date-fns"
import {
  ArrowRightIcon,
  BotIcon,
  CalendarClockIcon,
  CheckCircle2Icon,
  CircleAlertIcon,
  LaptopIcon,
} from "lucide-react"
import Link from "next/link"

import { BotDialog } from "@/components/bot-dialog"
import { ChatAvatar } from "@/components/chat-avatar"
import { PcApprovals } from "@/components/pc-approvals"
import { Badge } from "@/components/ui/badge"
import { db } from "@/db"
import { automationRuns, automations } from "@/db/schema"
import { getActiveDevices, isOnline } from "@/lib/devices"
import { describeSchedule } from "@/lib/schedule"
import { getUsageSummary } from "@/lib/usage"
import { formatQuantity, METERS, USAGE_PATH } from "@/lib/usage-limits"
import { cn } from "@/lib/utils"
import { getChats } from "@/queries"

function Panel({
  title,
  href,
  linkLabel,
  children,
  className,
}: {
  title: string
  href?: string
  linkLabel?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        "flex flex-col gap-3 rounded-xl border bg-card p-4",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium">{title}</h2>
        {href ? (
          <Link
            href={href}
            className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {linkLabel ?? "View all"}
            <ArrowRightIcon className="size-3" />
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  )
}

function Stat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number
  hint: string
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border bg-card p-4">
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </span>
      <span className="text-2xl font-semibold tracking-tight tabular-nums">
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </div>
  )
}

/** A result's first line or two, without Markdown marks. */
function snippet(text: string | null) {
  return (text ?? "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#*_`>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180)
}

/**
 * The home page once a user has bots: what their bots did, what is coming
 * up, and anything that needs them. Every number is read from the database;
 * nothing here is estimated.
 */
export async function Overview({ userId }: { userId: string }) {
  const monthStart = new Date()
  monthStart.setUTCDate(1)
  monthStart.setUTCHours(0, 0, 0, 0)

  const [chats, userAutomations, recentRuns, runsDone, devices, usage] =
    await Promise.all([
      getChats(),
      db.query.automations.findMany({
        where: eq(automations.userId, userId),
        orderBy: asc(automations.nextRunAt),
        with: { bot: true },
      }),
      db.query.automationRuns.findMany({
        where: eq(automationRuns.userId, userId),
        orderBy: desc(automationRuns.startedAt),
        limit: 6,
        with: { automation: { with: { bot: true } } },
      }),
      db.$count(
        automationRuns,
        and(
          eq(automationRuns.userId, userId),
          eq(automationRuns.status, "done"),
          gte(automationRuns.startedAt, monthStart),
          isNotNull(automationRuns.output)
        )
      ),
      getActiveDevices(userId),
      getUsageSummary(userId),
    ])

  const botChats = chats.filter((chat) => chat.kind === "direct" && chat.bot)
  const active = userAutomations.filter((item) => item.enabled)
  const paused = userAutomations.filter((item) => !item.enabled)
  const upcoming = active.filter((item) => item.nextRunAt).slice(0, 4)
  const online = devices.filter(isOnline)
  const usedUp = usage.meters.filter(
    (meter) => meter.limit > 0 && meter.used >= meter.limit
  )
  // The meters closest to their limit are the ones worth showing.
  const meters = usage.meters
    .filter((meter) => meter.limit > 0)
    .sort((a, b) => b.used / b.limit - a.used / a.limit)
    .slice(0, 3)

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-semibold tracking-tight">Overview</h1>
            <p className="text-muted-foreground">
              What your bots did, what is coming up, and anything that needs
              you.
            </p>
          </div>
          <BotDialog />
        </div>

        <PcApprovals active={online.length > 0} intervalMs={5000} />

        {paused.length > 0 || usedUp.length > 0 ? (
          <div className="flex flex-col gap-2">
            {paused.length > 0 ? (
              <Link
                href="/automations"
                className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm transition-colors hover:bg-amber-500/10"
              >
                <CircleAlertIcon className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <span className="flex-1">
                  {paused.length === 1
                    ? `"${paused[0].name}" is paused.`
                    : `${paused.length} automations are paused.`}{" "}
                  Switch them back on when you&apos;re ready.
                </span>
                <ArrowRightIcon className="size-3.5 shrink-0" />
              </Link>
            ) : null}
            {usedUp.length > 0 ? (
              <Link
                href={USAGE_PATH}
                className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm transition-colors hover:bg-destructive/10"
              >
                <CircleAlertIcon className="size-4 shrink-0 text-destructive" />
                <span className="flex-1">
                  You&apos;ve used all of your{" "}
                  {usedUp
                    .map((meter) => METERS[meter.meter].label.toLowerCase())
                    .join(" and ")}{" "}
                  for this period.
                </span>
                <ArrowRightIcon className="size-3.5 shrink-0" />
              </Link>
            ) : null}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            icon={CheckCircle2Icon}
            label="Jobs done"
            value={runsDone}
            hint="scheduled runs this month"
          />
          <Stat
            icon={CalendarClockIcon}
            label="Automations"
            value={active.length}
            hint={
              paused.length > 0 ? `running, ${paused.length} paused` : "running"
            }
          />
          <Stat
            icon={BotIcon}
            label="Bots"
            value={botChats.length}
            hint="each with its own computer"
          />
          <Stat
            icon={LaptopIcon}
            label="Your devices"
            value={online.length}
            hint={`online of ${devices.length} connected`}
          />
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <Panel
            title="Latest results"
            href="/automations"
            className="lg:col-span-2"
          >
            {recentRuns.length === 0 ? (
              <div className="flex flex-col items-start gap-2 py-4">
                <p className="text-sm text-muted-foreground">
                  No scheduled runs yet. Give a bot a recurring job (a morning
                  briefing, a price watch, a job search) and its results will
                  show up here.
                </p>
                <Link
                  href="/automations"
                  className="text-sm text-brand underline-offset-4 hover:underline"
                >
                  Create an automation
                </Link>
              </div>
            ) : (
              <ul className="flex flex-col divide-y">
                {recentRuns.map((run) => (
                  <li key={run.id}>
                    <Link
                      href="/automations"
                      className="flex items-start gap-3 py-2.5 transition-colors hover:bg-muted/40"
                    >
                      <ChatAvatar
                        seed={run.automation.bot.avatar}
                        className="mt-0.5 size-7 shrink-0"
                      />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">
                            {run.automation.name}
                          </span>
                          {run.status === "error" ? (
                            <Badge variant="destructive">Failed</Badge>
                          ) : run.status === "running" ? (
                            <Badge variant="secondary">Running</Badge>
                          ) : null}
                          <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                            {formatDistanceToNowStrict(run.startedAt)} ago
                          </span>
                        </span>
                        <span className="line-clamp-2 text-xs text-muted-foreground">
                          {snippet(run.output ?? run.error) || "Working on it…"}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <div className="flex flex-col gap-3">
            <Panel title="Coming up" href="/automations" linkLabel="Manage">
              {upcoming.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing scheduled.
                </p>
              ) : (
                <ul className="flex flex-col gap-2.5">
                  {upcoming.map((item) => (
                    <li key={item.id} className="flex items-center gap-2.5">
                      <ChatAvatar
                        seed={item.bot.avatar}
                        className="size-6 shrink-0"
                      />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm">{item.name}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {describeSchedule(item)}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        in {formatDistanceToNowStrict(item.nextRunAt!)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="This period" href={USAGE_PATH} linkLabel="Usage">
              <ul className="flex flex-col gap-3">
                {meters.map((meter) => {
                  const info = METERS[meter.meter]
                  const share = Math.min(1, meter.used / meter.limit)
                  return (
                    <li key={meter.meter} className="flex flex-col gap-1">
                      <span className="flex items-center justify-between text-xs">
                        <span>{info.label}</span>
                        <span className="text-muted-foreground tabular-nums">
                          {formatQuantity(info.unit, meter.used)} of{" "}
                          {formatQuantity(info.unit, meter.limit)}
                        </span>
                      </span>
                      <span
                        className="h-1.5 overflow-hidden rounded-full bg-muted"
                        role="progressbar"
                        aria-label={info.label}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(share * 100)}
                      >
                        <span
                          className={cn(
                            "block h-full rounded-full",
                            share >= 1
                              ? "bg-destructive"
                              : share >= 0.8
                                ? "bg-amber-500"
                                : "bg-brand"
                          )}
                          style={{ width: `${Math.max(2, share * 100)}%` }}
                        />
                      </span>
                    </li>
                  )
                })}
                {meters.length === 0 ? (
                  <li className="text-sm text-muted-foreground">
                    Your plan has no allowance yet.
                  </li>
                ) : null}
              </ul>
            </Panel>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <Panel title="Your bots" className="lg:col-span-2">
            <ul className="grid gap-2 sm:grid-cols-2">
              {botChats.map((chat) => (
                <li key={chat.id}>
                  <Link
                    href={`/chats/${chat.id}`}
                    className="flex items-center gap-2.5 rounded-lg border p-2.5 transition-colors hover:bg-muted/40"
                  >
                    <ChatAvatar
                      seed={chat.bot!.avatar}
                      className="size-8 shrink-0"
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium">
                        {chat.bot!.name}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {chat.bot!.job}
                      </span>
                    </span>
                    <ArrowRightIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Your devices" href="/pc" linkLabel="Manage">
            {devices.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                None connected. Connect a computer to let bots work on your own
                files, with your approval.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {devices.slice(0, 4).map((device) => (
                  <li key={device.id} className="flex items-center gap-2">
                    <span
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        isOnline(device)
                          ? "bg-emerald-500"
                          : "bg-muted-foreground/40"
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {device.name}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {isOnline(device) ? "Online" : "Offline"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}
