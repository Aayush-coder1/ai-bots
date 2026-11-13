import { auth } from "@clerk/nextjs/server"
import {
  BotIcon,
  CalendarClockIcon,
  GaugeIcon,
  LaptopIcon,
  LifeBuoyIcon,
  ShieldCheckIcon,
} from "lucide-react"
import Link from "next/link"

import { GITHUB_URL } from "@/lib/github"

const SECTIONS = [
  {
    icon: BotIcon,
    title: "1. Create a bot and talk to it",
    steps: [
      "Press + at the top of the sidebar and choose Create new bot. Pick a job, a name and how it should work.",
      "Every bot gets its own cloud computer, a live screen you can watch, and a memory that lasts across chats.",
      'Ask in plain words: "research X and give me 5 bullets with links", "write and run a script that…", "open this site and tell me what it says".',
      "When the result is a file (a report, a CSV), the bot puts a Download button in the chat.",
      "Put two or more bots in a group chat and @mention the one you want. They hand work to each other when another bot fits better.",
    ],
  },
  {
    icon: CalendarClockIcon,
    title: "2. Put work on a schedule (Automations)",
    href: "/automations",
    steps: [
      "Open Automations, press New automation and start from a template: morning briefing, job hunter, price watcher, competitor watch, lead finder, repo digest.",
      "Replace anything in [BRACKETS], choose every hour, day or week, and the time in your own time zone.",
      "Optional: paste a Discord, Slack or Telegram webhook to get each result there as well.",
      "Press Run now to try it straight away. Results appear on the card; click one to read it in full.",
      'The bot remembers what it reported last time, so "what\'s new" tasks only tell you the difference.',
      "An automation that fails 3 times in a row pauses itself, so it never wastes your allowance. Fix the task and switch it back on.",
    ],
  },
  {
    icon: LaptopIcon,
    title: "3. Let bots work on your own computer (Your PC)",
    href: "/pc",
    steps: [
      "Open Your PC, choose the one folder bots may work in and how long the computer stays connected, then press Create pairing code.",
      "Download the connector for your system and double-click it. Nothing to type. A window stays open while bots can reach the computer; close it to stop them.",
      'In a chat, ask for something on your computer: "list my shared folder", "run the tests in my project", "save this as notes.md on my PC".',
      'Connect more than one device and a bot can work across them: "copy report.md from my laptop to my desktop".',
      "In an automation, set Where it runs to your device to have scheduled work happen on your own files.",
    ],
  },
  {
    icon: ShieldCheckIcon,
    title: "4. Approving what bots do on your computer",
    steps: [
      "Reading and writing files inside the shared folder happens without asking. Nothing outside that folder can be touched.",
      "Running a command or opening a link always asks first: an Allow bar appears above the message box (and on the Your PC page for scheduled runs).",
      "Allow once runs it. Don't allow stops it and the bot won't retry. Always allow turns asking off for that device.",
      'You can change that any time with the "Run commands without asking me" switch on the Your PC page. Keep it off unless an automation must run while you are away.',
      "Commands that need admin rights, wipe disks or read password files are blocked no matter what.",
    ],
  },
  {
    icon: GaugeIcon,
    title: "5. Your plan and usage",
    href: "/usage",
    steps: [
      "The Usage page (in the menu on your name, bottom left) shows what your bots used this period and when it resets.",
      "When one allowance runs out, bots stop using that one thing until the reset. You are never charged extra.",
      "Manage or cancel your subscription from the Pricing page.",
    ],
  },
  {
    icon: LifeBuoyIcon,
    title: "If something isn't working",
    steps: [
      '"Your PC is not connected": the connector window was closed or the computer is asleep. Double-click the connector file again.',
      "A command never ran: it waited two minutes for your Allow and was skipped. Ask again and press Allow, or switch asking off for that device.",
      "The bot is slow or says it couldn't reply: the AI model was busy. Send the message again after a few seconds.",
      "An automation says the device was not connected: the computer must be on with the connector running at the scheduled time.",
      "Access ended: the time you chose when connecting is up. Create a new pairing code.",
    ],
  },
] as const

// Reached from the sidebar: a plain walkthrough of everything the app does.
export default async function GuidePage() {
  await auth.protect()

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-12">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            How it works
          </h1>
          <p className="text-muted-foreground">
            ai-bots gives you AI workers with their own computers. You hand them
            a job once; they do it on a schedule, in the cloud or on your own
            machine, and bring you the result.
          </p>
        </div>

        {SECTIONS.map((section) => (
          <section
            key={section.title}
            className="flex flex-col gap-3 rounded-xl border bg-card p-5"
          >
            <div className="flex items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand ring-1 ring-brand/20">
                <section.icon className="size-4" />
              </span>
              <h2 className="flex-1 font-medium">{section.title}</h2>
              {"href" in section ? (
                <Link
                  href={section.href}
                  className="text-sm text-brand underline-offset-4 hover:underline"
                >
                  Open
                </Link>
              ) : null}
            </div>
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-muted-foreground">
              {section.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>
          </section>
        ))}

        <p className="text-sm text-muted-foreground">
          Found a bug or want a feature?{" "}
          <a
            href={`${GITHUB_URL}/issues`}
            target="_blank"
            rel="noreferrer"
            className="text-brand underline-offset-4 hover:underline"
          >
            Open an issue on GitHub
          </a>
          .
        </p>
      </div>
    </div>
  )
}
