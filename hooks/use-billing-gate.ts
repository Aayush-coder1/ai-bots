"use client"

import { useAuth } from "@clerk/nextjs"
import { usePathname, useRouter } from "next/navigation"
import { useCallback } from "react"

import { toast } from "@/components/ui/toast"
import { type Feature, pricingHref } from "@/lib/billing"

/**
 * The paywall: checks billable features before an action and, on the free
 * plan, shows the "Upgrade to continue" toast with a link to the pricing
 * page instead. `gate` returns whether the action may go ahead; `paywall`
 * shows the toast on its own, for when the server is the one that said no.
 * The server always checks again; this is for the message.
 */
export function useBillingGate() {
  const { has, isLoaded } = useAuth()
  const router = useRouter()
  // After subscribing, the pricing page sends the user back here.
  const pathname = usePathname()

  const paywall = useCallback(
    (description: string) => {
      toast.add({
        type: "error",
        title: "Upgrade to continue",
        description,
        actionProps: {
          children: "See plans",
          onClick: () => router.push(pricingHref(pathname)),
        },
      })
    },
    [router, pathname]
  )

  const gate = useCallback(
    (features: Feature[], description: string) => {
      // Until Clerk has loaded, let the server decide.
      if (!isLoaded || !has) {
        return true
      }
      if (features.every((feature) => has({ feature }))) {
        return true
      }
      paywall(description)
      return false
    },
    [has, isLoaded, paywall]
  )

  return { gate, paywall }
}
