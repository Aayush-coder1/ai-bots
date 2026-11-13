import type { MetadataRoute } from "next"

import { SITE_URL } from "@/lib/site"

// Only the public pages are worth indexing; everything else needs a sign-in.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/welcome", "/privacy", "/terms"],
      disallow: ["/api/", "/chats/", "/automations", "/pc", "/usage"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
