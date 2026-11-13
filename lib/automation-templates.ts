import type { AutomationFrequency } from "@/db/schema"

// Ready-made scheduled tasks. Picking one fills the form; every word stays
// editable. Each is written so the bot can do it with search, page reading
// and its memory, with nobody there to answer questions.

export type AutomationTemplate = {
  label: string
  name: string
  prompt: string
  frequency: AutomationFrequency
  time: string
  /** Works on the user's own device, so it needs one connected. */
  needsPc?: boolean
}

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    label: "Morning briefing",
    name: "Morning briefing",
    frequency: "daily",
    time: "08:00",
    prompt:
      "Find today's 5 most important stories about AI and developer tools. For each: one line on what happened, one line on why it matters to a working developer, and the link. Skip anything you already reported in an earlier run.",
  },
  {
    label: "Job hunter",
    name: "New job matches",
    frequency: "daily",
    time: "09:00",
    prompt:
      "Search for remote or India-based software engineering internships and junior roles (React, Next.js, Node.js) posted in the last 24 hours. List up to 8 new ones I haven't seen before: role, company, location, the link, and one line on why it fits. Remember the ones you list so you never repeat them.",
  },
  {
    label: "Price watcher",
    name: "Price watch",
    frequency: "daily",
    time: "10:00",
    prompt:
      "Check the current price of [PRODUCT] at [LINK]. Compare it with the price you remembered last time. Tell me the price, the change since the last check, and say clearly if it is below [TARGET PRICE]. Then remember today's price.",
  },
  {
    label: "Competitor watch",
    name: "Competitor watch",
    frequency: "weekly",
    time: "09:00",
    prompt:
      "Check these sites for anything new since your last run: [SITE 1], [SITE 2]. Look at their homepage, pricing page, changelog and blog. Report only what changed: new features, price changes, new posts, each with a link. Remember what you saw so next week you report only the difference.",
  },
  {
    label: "Lead finder",
    name: "Fresh leads",
    frequency: "weekly",
    time: "10:00",
    prompt:
      "Find 10 [TYPE OF BUSINESS] in [CITY] that could use [MY SERVICE]. For each give the name, website, a public contact page or email if the site lists one, and one specific observation I could mention when reaching out. Only use information the business published itself. Don't repeat businesses from earlier runs.",
  },
  {
    label: "Repo digest",
    name: "GitHub repo digest",
    frequency: "weekly",
    time: "18:00",
    prompt:
      "Summarize the last week of activity on the GitHub repository [OWNER/REPO]: releases, merged pull requests worth knowing about, and notable new issues. Keep it to what a user of the project would care about, with links.",
  },
  {
    label: "Project health (PC)",
    name: "Project health check",
    frequency: "daily",
    time: "09:30",
    needsPc: true,
    prompt:
      "On my device, in the shared folder, run `git status --short` and `git log --oneline -5`, and if there is a package.json also run `npm outdated`. Change nothing. Report: uncommitted files, the last 5 commits, and the outdated packages that have a major update, with one line on what to do about each.",
  },
  {
    label: "Folder report (PC)",
    name: "Shared folder report",
    frequency: "weekly",
    time: "18:00",
    needsPc: true,
    prompt:
      "On my device, list the shared folder. Don't move or delete anything. Report what is in it grouped by kind (documents, images, code, archives, other), the 10 largest files, and files that look like duplicates by name. Then write the same report to a file called folder-report.md in the shared folder.",
  },
  {
    label: "Daily notes to PC",
    name: "Daily briefing saved to my PC",
    frequency: "daily",
    time: "08:00",
    needsPc: true,
    prompt:
      "Find today's 5 most important stories about [TOPIC], each with one line on why it matters and its link. Then save the briefing on my device as briefings/[TODAY'S DATE].md inside the shared folder, and give me the same text as your reply.",
  },
]
