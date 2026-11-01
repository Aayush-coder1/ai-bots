import { captureTriggerError, ensureSentry } from "./lib/sentry-trigger"
import { defineConfig } from "@trigger.dev/sdk"

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
    ensureSentry(ctx.environment)
  },

  // Runs when a task has failed and won't be retried. Payload is deliberately not
  // attached, since it can contain user messages and AI prompts.
  onFailure: async ({ error, ctx }) => {
    ensureSentry(ctx.environment)
    await captureTriggerError(
      error,
      { task: ctx.task.id, environment: ctx.environment.type },
      {
        runId: ctx.run.id,
        attempt: ctx.attempt.number,
        machine: ctx.machine?.name,
      }
    )
  },
})
