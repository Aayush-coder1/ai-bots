import { auth } from "@clerk/nextjs/server"
import { GaugeIcon } from "lucide-react"
import Link from "next/link"

import { ResetCountdown, UsageMeters } from "@/components/usage-meters"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { pricingHref } from "@/lib/billing"
import { getUsageSummary } from "@/lib/usage"
import { USAGE_PATH } from "@/lib/usage-limits"

// Reached from the user menu (components/app-sidebar.tsx).
export default async function UsagePage() {
  const { userId } = await auth.protect()
  const summary = await getUsageSummary(userId)
  const start = new Date(summary.periodStart)
  const end = new Date(summary.periodEnd)
  const dateFormat: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }
  const usedUp = summary.meters.filter(
    (meter) => meter.limit > 0 && meter.used >= meter.limit
  )

  return (
    // The dashboard is pinned to the viewport, so this page scrolls itself.
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-12">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">Usage</h1>
            <Badge variant="secondary">
              {summary.plan === "pro" ? "Pro" : "Free"}
            </Badge>
          </div>
          <p className="text-muted-foreground">
            What your bots have used this billing period, from{" "}
            {start.toLocaleDateString("en", dateFormat)} to{" "}
            {end.toLocaleDateString("en", dateFormat)} (UTC).
          </p>
        </div>

        {summary.plan === "free" ? (
          <Alert>
            <GaugeIcon />
            <AlertTitle>Bots are part of the paid plan</AlertTitle>
            <AlertDescription className="flex flex-col gap-3">
              <p>Subscribe to get an allowance for every meter below.</p>
              <Button
                size="sm"
                className="w-fit"
                render={<Link href={pricingHref(USAGE_PATH)} />}
                nativeButton={false}
              >
                See plans
              </Button>
            </AlertDescription>
          </Alert>
        ) : usedUp.length > 0 ? (
          <Alert variant="destructive">
            <GaugeIcon />
            <AlertTitle>Some allowances are used up</AlertTitle>
            <AlertDescription>
              Bots can&apos;t use them again until the period resets.
            </AlertDescription>
          </Alert>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Resets in</CardTitle>
            <CardDescription>
              Every allowance starts over on{" "}
              {end.toLocaleString("en", {
                ...dateFormat,
                hour: "numeric",
                minute: "2-digit",
              })}{" "}
              UTC.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResetCountdown periodEnd={summary.periodEnd} />
          </CardContent>
        </Card>

        <UsageMeters summary={summary} />
      </div>
    </div>
  )
}
