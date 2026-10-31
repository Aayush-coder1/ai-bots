import { google } from "@ai-sdk/google"
import { APICallError, wrapLanguageModel } from "ai"

import { keepLatestScreenshots } from "@/trigger/tools"

type GoogleModel = ReturnType<typeof google>

// The free Gemini tier regularly answers 503 (overloaded) or 429 (per-model
// quota), and which model is affected changes from hour to hour. Models are
// tried in order, so the fastest reliable one goes first. Override with a
// comma-separated GOOGLE_MODEL, e.g. "gemini-3.6-flash,gemini-3.5-flash".
const MODEL_IDS = (
  process.env.GOOGLE_MODEL ??
  "gemini-3.5-flash-lite,gemini-3.6-flash,gemini-3.5-flash,gemini-3.1-flash-lite"
)
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean)

// A refused model is skipped for this long. Free-tier quotas are per minute,
// and a computer-use turn calls the model once per step, so retrying the same
// model on every step would add a failed request to each one.
const COOLDOWN_MS = 60_000
const coolingUntil = new Map<string, number>()

// Overload, quota and "model not available" errors are worth another model.
// A bad request would fail the same way everywhere, so it is thrown as is.
function shouldFallBack(error: unknown) {
  if (!APICallError.isInstance(error)) {
    return false
  }

  const status = error.statusCode ?? 0
  return error.isRetryable || status === 404 || status === 429 || status >= 500
}

async function withFallback<T>(
  models: GoogleModel[],
  call: (model: GoogleModel) => PromiseLike<T>,
  abortSignal: AbortSignal | undefined
) {
  const now = Date.now()
  const ready = models.filter((m) => (coolingUntil.get(m.modelId) ?? 0) <= now)
  // When every model is cooling down, try them all rather than fail outright.
  const candidates = ready.length > 0 ? ready : models

  let lastError: unknown

  for (const [index, model] of candidates.entries()) {
    if (index > 0 && (abortSignal?.aborted || !shouldFallBack(lastError))) {
      break
    }

    try {
      const result = await call(model)
      coolingUntil.delete(model.modelId)
      return result
    } catch (error) {
      lastError = error
      if (shouldFallBack(error)) {
        coolingUntil.set(model.modelId, Date.now() + COOLDOWN_MS)
        console.warn(
          `Model ${model.modelId} refused the request, skipping it for a minute`,
          {
            status: APICallError.isInstance(error)
              ? error.statusCode
              : undefined,
          }
        )
      }
    }
  }

  throw lastError
}

/**
 * A Gemini model that moves on to the next configured model when Google
 * refuses the request. Failures happen before any token streams (the HTTP
 * status is checked first), so a fallback never mixes two models' output.
 */
export function chatModel() {
  const models = MODEL_IDS.map((id) => google(id))

  return wrapLanguageModel({
    model: models[0],
    middleware: {
      // Screenshots pile up step after step within a turn. Trimming them here,
      // at the provider call, leaves the step history the SDK keeps untouched;
      // returning trimmed messages from prepareStep would replace it.
      transformParams: async ({ params }) => ({
        ...params,
        prompt: keepLatestScreenshots(params.prompt),
      }),
      wrapStream: ({ params }) =>
        withFallback(
          models,
          (model) => model.doStream(params),
          params.abortSignal
        ),
      wrapGenerate: ({ params }) =>
        withFallback(
          models,
          (model) => model.doGenerate(params),
          params.abortSignal
        ),
    },
  })
}
