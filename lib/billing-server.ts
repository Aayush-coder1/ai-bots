import { auth, clerkClient } from "@clerk/nextjs/server"
import { cache } from "react"

import { type Feature, PAID_PLAN, UPGRADE_REQUIRED } from "@/lib/billing"

/** Whether the signed-in user's plan includes every one of `features`. */
export async function hasFeatures(...features: Feature[]) {
  const { has } = await auth()
  return features.every((feature) => has({ feature }))
}

/**
 * Throws unless the signed-in user's plan includes every one of `features`.
 * The server-side gate: the client checks too, to show the upgrade toast,
 * but only this check can't be skipped.
 */
export async function requireFeatures(...features: Feature[]) {
  if (!(await hasFeatures(...features))) {
    throw new Error(UPGRADE_REQUIRED)
  }
}

export type PaidPlan = {
  /** Clerk's plan id, which the checkout needs. */
  id: string
  name: string
  description: string | null
  /** e.g. "$20.00" */
  monthlyPrice: string
  features: string[]
}

/**
 * The paid plan as it is configured in Clerk, looked up by its slug so the
 * page needs no hard-coded plan id. Null when the plan doesn't exist yet in
 * this Clerk instance. Cached for the rest of the request.
 */
export const getPaidPlan = cache(async (): Promise<PaidPlan | null> => {
  try {
    const client = await clerkClient()
    const { data } = await client.billing.getPlanList({ payerType: "user" })
    const plan = data.find((candidate) => candidate.slug === PAID_PLAN)
    if (!plan) {
      return null
    }
    return {
      id: plan.id,
      name: plan.name,
      description: plan.description,
      monthlyPrice: plan.fee
        ? `${plan.fee.currencySymbol}${plan.fee.amountFormatted}`
        : "",
      features: plan.features.map((feature) => feature.name),
    }
  } catch (error) {
    console.error("Failed to load the paid plan from Clerk", error)
    return null
  }
})
