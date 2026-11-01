import { notFound } from "next/navigation"

/**
 * Sentry's setup check page deliberately throws errors. It is for verifying
 * the integration locally, so in production it is a 404 rather than a public
 * button that floods the Sentry quota.
 */
export default function SentryExampleLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  if (process.env.NODE_ENV === "production") {
    notFound()
  }
  return children
}
