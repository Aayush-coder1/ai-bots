import { GITHUB_REPO } from "@/lib/github"

// The repo's star count for the star button. GitHub allows 60 anonymous
// requests an hour per IP, so the number is kept for an hour, both here and
// at the CDN; a failed lookup just means the button shows no number.
const TTL_MS = 60 * 60 * 1000
let cached: { stars: number | null; at: number } | undefined

export async function GET() {
  if (!cached || Date.now() - cached.at > TTL_MS) {
    let stars: number | null = cached?.stars ?? null
    try {
      const response = await fetch(
        `https://api.github.com/repos/${GITHUB_REPO}`,
        {
          headers: { accept: "application/vnd.github+json" },
          cache: "no-store",
          signal: AbortSignal.timeout(4000),
        }
      )
      if (response.ok) {
        const data = (await response.json()) as { stargazers_count?: number }
        stars = data.stargazers_count ?? null
      }
    } catch {
      // Keep the last known number.
    }
    cached = { stars, at: Date.now() }
  }
  return Response.json(
    { stars: cached.stars },
    { headers: { "cache-control": "public, s-maxage=3600, max-age=600" } }
  )
}
