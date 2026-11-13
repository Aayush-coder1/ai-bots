import Link from "next/link"

import { GITHUB_URL } from "@/lib/github"

const LINKS = [
  { href: "/welcome#pricing", label: "Pricing" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
] as const

/** The footer of the public pages. */
export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm text-muted-foreground">
        <span>ai-bots · built by Aayush Wanve</span>
        <nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-foreground"
          >
            GitHub
          </a>
          <a
            href="https://x.com/aayucooldev"
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-foreground"
          >
            X
          </a>
        </nav>
      </div>
    </footer>
  )
}
