"use client"

import { Show, useSession } from "@clerk/nextjs"
import {
  CheckoutButton,
  SubscriptionDetailsButton,
} from "@clerk/nextjs/experimental"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"

/**
 * Plans live in the session token, which only changes when the session
 * reloads. Reload it right away so has() (and every paywall) sees the new
 * plan without waiting for the next token refresh.
 */
function useAfterPlanChange() {
  const { session } = useSession()
  const router = useRouter()

  return async (returnTo?: string) => {
    await session?.reload()
    if (returnTo) {
      router.push(returnTo)
    }
    router.refresh()
  }
}

/** Opens Clerk's checkout for the paid plan, then goes back to `returnTo`. */
export function SubscribeButton({
  planId,
  returnTo,
}: {
  planId: string
  returnTo: string
}) {
  const afterPlanChange = useAfterPlanChange()

  return (
    <Show when="signed-in">
      <CheckoutButton
        planId={planId}
        planPeriod="month"
        for="user"
        onSubscriptionComplete={() => afterPlanChange(returnTo)}
      >
        <Button className="w-full">Subscribe</Button>
      </CheckoutButton>
    </Show>
  )
}

/** Opens Clerk's subscription details, where the plan can be cancelled. */
export function ManageSubscriptionButton() {
  const afterPlanChange = useAfterPlanChange()

  return (
    <Show when="signed-in">
      <SubscriptionDetailsButton
        for="user"
        onSubscriptionCancel={() => afterPlanChange()}
      >
        <Button variant="outline" className="w-full">
          Manage subscription
        </Button>
      </SubscriptionDetailsButton>
    </Show>
  )
}
