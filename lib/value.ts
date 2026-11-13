import { formatQuantity, METERS, PLAN_LIMITS } from "@/lib/usage-limits"
import { MAX_AUTOMATIONS } from "@/lib/schedule"

// What the paid plan is for, in the user's terms: the jobs it takes off their
// hands. Shared by the public welcome page and the pricing page, so the two
// never promise different things.

export const USE_CASES = [
  {
    title: "A briefing waiting for you every morning",
    before: "Opening ten tabs to see what changed overnight.",
    after:
      "A bot searches, reads the pages and sends five linked bullet points to your Discord, Slack or Telegram before you wake up.",
  },
  {
    title: "Leads and job openings, found for you",
    before: "An hour of searching and copy-pasting into a spreadsheet.",
    after:
      "A bot finds new matches on a schedule, skips the ones it already showed you, and hands you a CSV to download.",
  },
  {
    title: "Prices and competitors, watched",
    before: "Remembering to check the same pages again and again.",
    after:
      "A bot checks them daily, remembers the last state, and only tells you what changed.",
  },
  {
    title: "Chores on your own computer",
    before: "Running the same checks in every project folder by hand.",
    after:
      "A bot works in the one folder you share: project health checks, folder reports, notes saved straight to your disk. You click Allow before any command runs.",
  },
] as const

/** The allowance of the paid plan, straight from the limits the app enforces. */
export function planAllowances() {
  const pro = PLAN_LIMITS.pro
  return [
    "Bots with their own cloud computer and long-term memory",
    `Up to ${MAX_AUTOMATIONS} scheduled automations (hourly, daily or weekly)`,
    "Results sent to Discord, Slack or Telegram",
    "Connect up to 5 of your own devices (Mac, Windows, Linux, Android)",
    "Group chats where bots hand work to each other",
    `${formatQuantity(METERS.aiTokens.unit, pro.aiTokens)} AI tokens a month`,
    `${formatQuantity(METERS.e2bSeconds.unit, pro.e2bSeconds)} of live desktop and online code runs`,
    `${formatQuantity(METERS.daytonaSeconds.unit, pro.daytonaSeconds)} of terminal time`,
    `${formatQuantity(METERS.webSearches.unit, pro.webSearches)} web searches and ${formatQuantity(METERS.pageFetches.unit, pro.pageFetches)} pages read`,
  ]
}

export const FAQ = [
  {
    q: "How is this different from a chatbot?",
    a: "A chatbot answers when you ask. These bots work when you are not there: on a schedule, on their own computers, and (if you connect it) on yours. You get results, not a conversation to manage.",
  },
  {
    q: "Is it safe to connect my computer?",
    a: "Bots can only touch the one folder you choose. Every command shows up in the app and waits for your Allow. Risky commands (admin rights, disk wipes, password files) are blocked outright, and you can disconnect a device in one click.",
  },
  {
    q: "What happens when I use up an allowance?",
    a: "Bots stop using that one thing until your billing period resets. Nothing is charged on top, ever. The Usage page shows where you stand.",
  },
  {
    q: "Can I cancel?",
    a: "Yes, any time, from Manage subscription on this page. You keep the plan until the end of the period you paid for.",
  },
] as const

/** Shown beside the price: what a small daily chore adds up to. */
export const TIME_MATH =
  "A check that takes you 15 minutes a day is about 7 hours a month. One automation takes it over completely."
