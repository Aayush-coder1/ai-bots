import { auth } from "@clerk/nextjs/server"
import { desc, eq } from "drizzle-orm"

import { Automations } from "@/components/automations"
import { db } from "@/db"
import { automationRuns, automations } from "@/db/schema"
import { describeSchedule } from "@/lib/schedule"
import { getBots } from "@/queries"

// Reached from the sidebar. Tasks a bot does on a schedule, with the result
// kept here and optionally sent to Discord, Slack or Telegram.
export default async function AutomationsPage() {
  const { userId } = await auth.protect()
  const [rows, bots] = await Promise.all([
    db.query.automations.findMany({
      where: eq(automations.userId, userId),
      orderBy: desc(automations.createdAt),
      with: {
        bot: true,
        runs: { orderBy: desc(automationRuns.startedAt), limit: 3 },
      },
    }),
    getBots(),
  ])

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-12">
        <Automations
          bots={bots.map((bot) => ({
            id: bot.id,
            name: bot.name,
            avatar: bot.avatar,
          }))}
          automations={rows.map((row) => ({
            id: row.id,
            name: row.name,
            prompt: row.prompt,
            enabled: row.enabled,
            schedule: describeSchedule(row),
            timezone: row.timezone,
            nextRunAt: row.nextRunAt?.toISOString() ?? null,
            // The URL carries the webhook's secret: only its host is shown.
            deliversTo: row.webhookUrl
              ? new URL(row.webhookUrl).hostname
              : null,
            bot: { name: row.bot.name, avatar: row.bot.avatar },
            runs: row.runs.map((run) => ({
              id: run.id,
              status: run.status,
              output: run.output,
              error: run.error,
              delivered: run.delivered,
              startedAt: run.startedAt.toISOString(),
            })),
          }))}
        />
      </div>
    </div>
  )
}
