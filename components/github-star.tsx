"use client"

import { StarIcon } from "lucide-react"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"

import { GITHUB_URL } from "@/lib/github"
import { cn } from "@/lib/utils"

// One lookup per page load, shared by every button on the page.
let starsRequest: Promise<number | null> | undefined

function loadStars() {
  starsRequest ??= fetch("/api/github-stars")
    .then((response) => (response.ok ? response.json() : { stars: null }))
    .then((data: { stars: number | null }) => data.stars)
    .catch(() => null)
  return starsRequest
}

/**
 * "Star on GitHub": opens the repo, where one click stars it. With
 * `floating`, it sits in the top right corner of every dashboard page except
 * chats, whose header carries its own.
 */
export function GithubStar({ floating = false }: { floating?: boolean }) {
  const pathname = usePathname()
  const [stars, setStars] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    void loadStars().then((count) => {
      if (alive) {
        setStars(count)
      }
    })
    return () => {
      alive = false
    }
  }, [])

  if (floating && pathname.startsWith("/chats/")) {
    return null
  }

  return (
    <a
      href={GITHUB_URL}
      target="_blank"
      rel="noreferrer"
      aria-label="Star ai-bots on GitHub"
      className={cn(
        "group inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border bg-background/80 px-2.5 text-xs font-medium text-muted-foreground backdrop-blur transition-colors hover:border-amber-400/60 hover:text-foreground",
        floating && "absolute top-3 right-3 z-10"
      )}
    >
      <StarIcon className="size-3.5 transition-colors group-hover:fill-amber-400 group-hover:text-amber-400" />
      <span>Star</span>
      {stars !== null ? (
        <span className="border-l pl-1.5 tabular-nums">
          {new Intl.NumberFormat("en", { notation: "compact" }).format(stars)}
        </span>
      ) : null}
    </a>
  )
}
