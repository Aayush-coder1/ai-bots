import type { Metadata } from "next"
import { auth } from "@clerk/nextjs/server"
import { CheckIcon, TriangleAlertIcon } from "lucide-react"
import Link from "next/link"

import {
  ManageSubscriptionButton,
  SubscribeButton,
} from "@/components/pricing-buttons"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { PAID_PLAN, safeReturnTo } from "@/lib/billing"
import { getPaidPlan } from "@/lib/billing-server"
import { FAQ, planAllowances, TIME_MATH, USE_CASES } from "@/lib/value"

function FeatureList({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-2 text-sm">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2">
          <CheckIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

export const metadata: Metadata = { title: "Pricing" }

// Reached from the upgrade toast, not from the sidebar.
export default async function PricingPage(props: PageProps<"/pricing">) {
  const { has } = await auth.protect()
  const returnTo = safeReturnTo((await props.searchParams).return_to)
  const plan = await getPaidPlan()
  const isSubscribed = has({ plan: PAID_PLAN })

  return (
    // The dashboard is pinned to the viewport, so this page scrolls itself.
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-12">
        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-balance">
            Let bots do your recurring work
          </h1>
          <p className="text-balance text-muted-foreground">
            One plan unlocks everything: bots with their own computers,
            scheduled automations, and work on your own devices. {TIME_MATH}
          </p>
        </div>

        {plan ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Free</CardTitle>
                <CardDescription>
                  <span className="text-2xl font-semibold text-foreground">
                    $0
                  </span>{" "}
                  / month
                </CardDescription>
                {!isSubscribed ? (
                  <CardAction>
                    <Badge variant="secondary">Current plan</Badge>
                  </CardAction>
                ) : null}
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Look around and see how it works. Bots, automations and
                  connecting your own devices need the paid plan, because every
                  bot runs on a real computer that costs money to keep on.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{plan.name}</CardTitle>
                <CardDescription>
                  <span className="text-2xl font-semibold text-foreground">
                    {plan.monthlyPrice}
                  </span>{" "}
                  / month
                </CardDescription>
                {isSubscribed ? (
                  <CardAction>
                    <Badge>Active</Badge>
                  </CardAction>
                ) : null}
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {plan.description ? (
                  <p className="text-sm text-muted-foreground">
                    {plan.description}
                  </p>
                ) : null}
                <FeatureList items={planAllowances()} />
              </CardContent>
              <CardFooter className="flex flex-col gap-2">
                {isSubscribed ? (
                  <>
                    <Button
                      className="w-full"
                      render={<Link href={returnTo} />}
                      nativeButton={false}
                    >
                      {returnTo === "/" ? "Go to your bots" : "Continue"}
                    </Button>
                    <ManageSubscriptionButton />
                  </>
                ) : (
                  <SubscribeButton planId={plan.id} returnTo={returnTo} />
                )}
              </CardFooter>
            </Card>
          </div>
        ) : null}

        <div className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold tracking-tight">
            What it takes off your hands
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {USE_CASES.map((useCase) => (
              <div
                key={useCase.title}
                className="flex flex-col gap-2 rounded-xl border bg-card p-4"
              >
                <h3 className="text-sm font-medium">{useCase.title}</h3>
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Before: </span>
                  {useCase.before}
                </p>
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Now: </span>
                  {useCase.after}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold tracking-tight">Questions</h2>
          <dl className="grid gap-4 md:grid-cols-2">
            {FAQ.map((item) => (
              <div key={item.q} className="flex flex-col gap-1">
                <dt className="text-sm font-medium">{item.q}</dt>
                <dd className="text-sm text-muted-foreground">{item.a}</dd>
              </div>
            ))}
          </dl>
        </div>

        {plan ? null : (
          <Alert>
            <TriangleAlertIcon />
            <AlertTitle>Plans aren&apos;t available right now</AlertTitle>
            <AlertDescription>
              Please try again in a little while.
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  )
}
