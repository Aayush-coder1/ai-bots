/** The public address of the app, for links in metadata, the sitemap and robots. */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_APP_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000")
).replace(/\/+$/, "")

export const SITE_NAME = "ai-bots"
export const SITE_TAGLINE =
  "AI bots with their own computers that do your recurring work"
export const SITE_DESCRIPTION =
  "Give a bot a task and a schedule. It researches, watches prices and competitors, finds leads and jobs, and can work on your own computer, while you do something else."
