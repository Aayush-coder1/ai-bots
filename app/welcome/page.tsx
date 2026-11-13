import { auth } from "@clerk/nextjs/server"
import {
  ArrowRightIcon,
  BotIcon,
  CheckIcon,
  ShieldCheckIcon,
} from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

import { GithubStar } from "@/components/github-star"
import { SiteFooter } from "@/components/site-footer"
import { Button } from "@/components/ui/button"
import { getPaidPlan } from "@/lib/billing-server"
import { FAQ, planAllowances, TIME_MATH, USE_CASES } from "@/lib/value"

export const metadata: Metadata = {
  title: { absolute: "ai-bots: AI bots that do your recurring work for you" },
  alternates: { canonical: "/welcome" },
  description:
    "Give a bot a task and a schedule. It researches, watches prices and competitors, finds leads and jobs, and can even work on your own computer, while you do something else.",
}

const SAFETY = [
  {
    title: "One folder, nothing else",
    text: "A bot can read and write only inside the folder you pick. Everything else on your computer is out of reach.",
  },
  {
    title: "You approve every command",
    text: "Each command appears in the app with Allow and Don't allow before it runs. Admin commands and password files are blocked outright.",
  },
  {
    title: "Off in one click",
    text: "Close the connector window or press Disconnect and access ends at once. You can also set it to end by itself after an hour or a day.",
  },
] as const

const STEPS = [
  {
    title: "Create a bot",
    text: "Pick a job (research, lead finder, job hunter, PC assistant) and it gets its own cloud computer and memory.",
  },
  {
    title: "Give it a task and a schedule",
    text: "Start from a template, choose every hour, day or week, and where the result should go.",
  },
  {
    title: "Read the result",
    text: "In the app, or in Discord, Slack or Telegram. The bot remembers last time and reports only what is new.",
  },
] as const

// The public front door. Signed-in users go straight to their bots.
export default async function WelcomePage() {
  const { userId } = await auth()
  if (userId) {
    redirect("/")
  }
  const plan = await getPaidPlan()

  return (
    <div className="relative min-h-svh">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-[radial-gradient(60%_60%_at_50%_0%,color-mix(in_oklch,var(--brand)_16%,transparent),transparent)]"
      />
      <header className="relative mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <span className="flex size-7 items-center justify-center rounded-lg bg-brand text-brand-foreground">
            <BotIcon className="size-4" />
          </span>
          ai-bots
        </span>
        <nav className="flex items-center gap-1 sm:gap-2">
          <a
            href="#how"
            className="hidden px-2 text-sm text-muted-foreground transition-colors hover:text-foreground sm:block"
          >
            How it works
          </a>
          <a
            href="#pricing"
            className="hidden px-2 text-sm text-muted-foreground transition-colors hover:text-foreground sm:block"
          >
            Pricing
          </a>
          <GithubStar />
          <Button
            variant="ghost"
            size="sm"
            render={<Link href="/sign-in" />}
            nativeButton={false}
          >
            Sign in
          </Button>
          <Button
            size="sm"
            render={<Link href="/sign-up" />}
            nativeButton={false}
          >
            Get started
          </Button>
        </nav>
      </header>

      <main className="relative mx-auto flex w-full max-w-5xl flex-col gap-20 px-6 pt-12 pb-24">
        <section className="flex flex-col items-center gap-6 text-center">
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Hand your recurring work to AI bots that have their own computers
          </h1>
          <p className="max-w-2xl text-lg text-balance text-muted-foreground">
            Give a bot a task and a schedule. It researches, watches prices and
            competitors, finds leads and jobs, and can work on your own computer
            too, while you do something else.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button
              size="lg"
              render={<Link href="/sign-up" />}
              nativeButton={false}
            >
              Create your first bot
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              render={<a href="#pricing" />}
              nativeButton={false}
            >
              See the plan
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">{TIME_MATH}</p>
        </section>

        {/* What a result looks like. Labelled as an example: it is not a
            customer's data. */}
        <section
          aria-label="Example of an automation result"
          className="mx-auto flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl border bg-card shadow-lg shadow-brand/5"
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-5 py-3">
            <span className="flex size-7 items-center justify-center rounded-lg bg-brand/10 text-brand">
              <BotIcon className="size-4" />
            </span>
            <span className="text-sm font-medium">Competitor watch</span>
            <span className="text-xs text-muted-foreground">
              Every Monday at 09:00 · sent to Slack
            </span>
            <span className="ml-auto rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
              Example
            </span>
          </div>
          <div className="flex flex-col gap-3 px-5 py-4 text-left text-sm">
            <p className="font-medium">3 changes since last week</p>
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-muted-foreground">
              <li>
                <span className="text-foreground">Pricing page:</span> the
                Starter plan went from $12 to $15 a month.
              </li>
              <li>
                <span className="text-foreground">Changelog:</span> a new
                export-to-CSV feature shipped on Thursday.
              </li>
              <li>
                <span className="text-foreground">Blog:</span> one new post,
                announcing a partner integration.
              </li>
            </ul>
            <p className="text-xs text-muted-foreground">
              Nothing else changed. Next check: Monday 09:00.
            </p>
          </div>
        </section>

        <section className="flex flex-col gap-6">
          <h2 className="text-2xl font-semibold tracking-tight">
            What it takes off your hands
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {USE_CASES.map((useCase) => (
              <div
                key={useCase.title}
                className="flex flex-col gap-3 rounded-xl border bg-card p-5"
              >
                <h3 className="font-medium">{useCase.title}</h3>
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
        </section>

        <section id="how" className="flex scroll-mt-8 flex-col gap-6">
          <h2 className="text-2xl font-semibold tracking-tight">
            How it works
          </h2>
          <ol className="grid gap-4 sm:grid-cols-3">
            {STEPS.map((step, index) => (
              <li
                key={step.title}
                className="flex flex-col gap-2 rounded-xl border bg-card p-5"
              >
                <span className="flex size-7 items-center justify-center rounded-full bg-brand/10 text-sm font-semibold text-brand">
                  {index + 1}
                </span>
                <h3 className="font-medium">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="flex flex-col gap-6">
          <h2 className="text-2xl font-semibold tracking-tight">
            Your computer, your rules
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {SAFETY.map((item) => (
              <div
                key={item.title}
                className="flex flex-col gap-2 rounded-xl border bg-card p-5"
              >
                <ShieldCheckIcon className="size-5 text-brand" />
                <h3 className="font-medium">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="pricing" className="flex scroll-mt-8 flex-col gap-6">
          <h2 className="text-2xl font-semibold tracking-tight">
            One plan, everything included
          </h2>
          <div className="flex flex-col gap-6 rounded-2xl border bg-card p-6 sm:flex-row sm:items-start sm:justify-between">
            <ul className="grid flex-1 gap-2 text-sm sm:grid-cols-2">
              {planAllowances().map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckIcon className="mt-0.5 size-4 shrink-0 text-brand" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <div className="flex shrink-0 flex-col gap-3 sm:w-56 sm:items-end sm:text-right">
              {plan?.monthlyPrice ? (
                <p>
                  <span className="text-4xl font-semibold">
                    {plan.monthlyPrice}
                  </span>
                  <span className="text-muted-foreground"> / month</span>
                </p>
              ) : null}
              <p className="text-sm text-muted-foreground">
                Cancel any time. No charges beyond the plan.
              </p>
              <Button
                className="w-full"
                render={<Link href="/sign-up" />}
                nativeButton={false}
              >
                Get started
              </Button>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-6">
          <h2 className="text-2xl font-semibold tracking-tight">Questions</h2>
          <dl className="grid gap-4 sm:grid-cols-2">
            {FAQ.map((item) => (
              <div key={item.q} className="flex flex-col gap-1.5">
                <dt className="font-medium">{item.q}</dt>
                <dd className="text-sm text-muted-foreground">{item.a}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="flex flex-col items-center gap-4 rounded-2xl border bg-card px-6 py-12 text-center">
          <h2 className="max-w-xl text-2xl font-semibold tracking-tight text-balance">
            Pick one thing you check every day, and stop checking it
          </h2>
          <p className="max-w-lg text-muted-foreground">
            Set it up once in a couple of minutes. Your bot takes it from there.
          </p>
          <Button
            size="lg"
            render={<Link href="/sign-up" />}
            nativeButton={false}
          >
            Create your first bot
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
