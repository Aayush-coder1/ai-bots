import * as Sentry from "@sentry/node";
import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  project: "proj_bqyttuybyhmuuetwzyld",
  runtime: "node-24",
  logLevel: "log",
  // The max compute seconds a task is allowed to run. If the task run exceeds this duration, it will be stopped.
  // You can override this on an individual task.
  // See https://trigger.dev/docs/runs/max-duration
  maxDuration: 3600,
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
  dirs: ["./trigger"],

  // Runs before each task attempt in the worker: start Sentry once per process.
  init: async ({ ctx }) => {
    if (!process.env.SENTRY_DSN || Sentry.isInitialized()) return;

    const isProduction = ctx.environment.type === "PRODUCTION";

    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: ctx.environment.slug,
      // Default integrations hook global handlers that clash with Trigger.dev's own runtime.
      defaultIntegrations: false,
      // Trace every run in development, 10% in production to save Sentry quota.
      tracesSampleRate: isProduction ? 0.1 : 1.0,

      // Same privacy settings as the Next.js app: no user info, no AI prompts/replies.
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
    });
  },

  // Runs when a task has failed and won't be retried. Payload is deliberately not
  // attached, since it can contain user messages and AI prompts.
  onFailure: async ({ error, ctx }) => {
    Sentry.captureException(error, {
      tags: {
        task: ctx.task.id,
        environment: ctx.environment.type,
      },
      extra: {
        runId: ctx.run.id,
        attempt: ctx.attempt.number,
        machine: ctx.machine?.name,
      },
    });
    await Sentry.flush(2000);
  },
});
