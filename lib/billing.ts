// Billing features, as created in Clerk Dashboard → Billing → Plans. The paid
// plan includes all of them; the free plan includes none, so everything
// billable is blocked until the user subscribes.

/** The paid plan's slug in Clerk. */
export const PAID_PLAN = "pro"

export const FEATURES = {
  /** Creating bots and chatting with them (direct and group chats). */
  bots: "bots",
  /** Creating sandboxes, connecting to their desktops, and the agent's tools. */
  sandboxes: "sandboxes",
} as const

export type Feature = (typeof FEATURES)[keyof typeof FEATURES]

/** Where the upgrade toast sends people. Deliberately not in the sidebar. */
export const PRICING_PATH = "/pricing"

/** Message for an action blocked on the free plan. */
export const UPGRADE_REQUIRED = "Upgrade to a paid plan to use this feature."

/** What a server action returns when the user's plan doesn't allow it. */
export type UpgradeRequired = { ok: false; reason: "upgrade-required" }

export const upgradeRequired: UpgradeRequired = {
  ok: false,
  reason: "upgrade-required",
}

/** Paywall toast descriptions, one per thing that can be blocked. */
export const PAYWALL = {
  bots: "Bots are part of the paid plan.",
  groupChats: "Group chats are part of the paid plan.",
  chatting: "Chatting with bots is part of the paid plan.",
  desktop: "Sandboxes are part of the paid plan.",
} as const

/**
 * Where to go back to after subscribing: a path inside this app taken from
 * the pricing page's `return_to`, or the home page. Anything else (another
 * site, the pricing page itself) is ignored, so the link can't be abused.
 */
export function safeReturnTo(value: string | string[] | undefined) {
  const path = Array.isArray(value) ? value[0] : value
  if (
    !path ||
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.startsWith("/\\") ||
    path.startsWith(PRICING_PATH)
  ) {
    return "/"
  }
  return path
}

/** The pricing page, remembering where to come back to. */
export function pricingHref(returnTo: string) {
  return `${PRICING_PATH}?${new URLSearchParams({ return_to: returnTo })}`
}
