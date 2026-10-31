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

// Shown when Clerk's plan has no features listed, so the card is never empty.
const DEFAULT_FEATURES = [
  "Create bots and chat with them",
  "Group chats with handoffs between bots",
  "Each bot's own sandbox and live desktop",
]

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
          <h1 className="text-3xl font-semibold tracking-tight">
            Choose a plan
          </h1>
          <p className="text-muted-foreground">
            The paid plan unlocks everything: bots, group chats, and each
            bot&apos;s own sandbox.
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
                  Sign in and look around. Creating bots, chatting and sandboxes
                  need the paid plan.
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
                <FeatureList
                  items={
                    plan.features.length > 0 ? plan.features : DEFAULT_FEATURES
                  }
                />
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
        ) : (
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
