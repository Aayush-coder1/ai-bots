import * as Sentry from "@sentry/node"

// Sentry for Trigger.dev workers. Same privacy settings as the Next.js app:
// no user info, no AI prompts/replies.
export function ensureSentry(environment?: { type: string; slug: string }) {
  if (!process.env.SENTRY_DSN || Sentry.isInitialized()) return

  const isProduction = environment
    ? environment.type === "PRODUCTION"
    : process.env.NODE_ENV === "production"

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: environment?.slug ?? (isProduction ? "prod" : "dev"),
    // Default integrations hook global handlers that clash with Trigger.dev's own runtime.
    defaultIntegrations: false,
    // Trace every run in development, 10% in production to save Sentry quota.
    tracesSampleRate: isProduction ? 0.1 : 1.0,
    dataCollection: {
      userInfo: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      httpBodies: [],
      httpHeaders: { deny: ["forwarded", "-ip", "remote-", "via", "-user"] },
      cookies: { deny: ["forwarded", "-ip", "remote-", "via", "-user"] },
      urlQueryParams: { deny: ["forwarded", "-ip", "remote-", "via", "-user"] },
    },
  })
}

// Report an error and wait for it to send: workers can be suspended right after.
export async function captureTriggerError(
  error: unknown,
  tags: Record<string, string> = {},
  extra: Record<string, unknown> = {}
) {
  ensureSentry()
  Sentry.captureException(error, { tags, extra })
  await Sentry.flush(2000)
}

// Wraps a run function so anything it throws reaches Sentry, then rethrows
// so Trigger.dev handles the failure as before. The arguments (which hold
// user messages) are not sent.
export function withSentry<A extends unknown[], R>(
  task: string,
  fn: (...args: A) => Promise<R>
): (...args: A) => Promise<R> {
  return async (...args) => {
    try {
      return await fn(...args)
    } catch (error) {
      await captureTriggerError(error, { task })
      throw error
    }
  }
}
