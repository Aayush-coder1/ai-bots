import { BotIcon } from "lucide-react"
import Link from "next/link"

import { SiteFooter } from "@/components/site-footer"

export type LegalSection = { title: string; body: string[] }

/** The shared layout of the privacy and terms pages. */
export function LegalPage({
  title,
  updated,
  intro,
  sections,
}: {
  title: string
  updated: string
  intro: string
  sections: LegalSection[]
}) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="mx-auto flex w-full max-w-3xl items-center px-6 py-5">
        <Link
          href="/welcome"
          className="flex items-center gap-2 text-sm font-semibold"
        >
          <span className="flex size-7 items-center justify-center rounded-lg bg-brand text-brand-foreground">
            <BotIcon className="size-4" />
          </span>
          ai-bots
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 pt-8 pb-20">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">
            Last updated {updated}
          </p>
          <p className="text-muted-foreground">{intro}</p>
        </div>
        {sections.map((section) => (
          <section key={section.title} className="flex flex-col gap-2">
            <h2 className="text-lg font-medium">{section.title}</h2>
            {section.body.map((paragraph) => (
              <p
                key={paragraph}
                className="text-sm leading-relaxed text-muted-foreground"
              >
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </main>
      <SiteFooter />
    </div>
  )
}
