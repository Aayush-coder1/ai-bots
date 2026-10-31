import { Daytona } from "@daytona/sdk"

let client: Daytona | undefined

/** Thrown when the Daytona environment variables are missing or malformed. */
export class DaytonaConfigError extends Error {
  name = "DaytonaConfigError"
}

// Values pasted into a dashboard often carry quotes or stray whitespace, and
// a proxy URL may come with a trailing slash; none of that should break the SDK.
function readEnv(name: string) {
  const value = process.env[name]?.trim().replace(/^["']|["']$/g, "")
  return value ? value : undefined
}

function readApiUrl() {
  const raw = readEnv("DAYTONA_API_URL")
  if (!raw) {
    return undefined // the SDK falls back to Daytona's hosted API
  }
  try {
    const url = new URL(raw)
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error()
    }
    return url.toString().replace(/\/$/, "")
  } catch {
    throw new DaytonaConfigError("DAYTONA_API_URL is not a valid http(s) URL")
  }
}

// Lazily constructed so the SDK only reads its environment configuration when a
// bot actually needs a sandbox. Server-only: the key never reaches the browser.
export function getDaytona() {
  if (client) {
    return client
  }

  const apiKey = readEnv("DAYTONA_API_KEY")
  if (!apiKey) {
    throw new DaytonaConfigError("DAYTONA_API_KEY is not set")
  }

  // Next.js loads `.env.local` into `process.env`, so the SDK sees the endpoint
  // in both places and refuses to guess where it came from. Naming it here says
  // which one we mean; without it bot creation throws before any request.
  client = new Daytona({
    apiKey,
    apiUrl: readApiUrl(),
    target: readEnv("DAYTONA_TARGET"),
  })
  return client
}

// The bot row is already gone by the time this runs, so a failed sandbox
// delete is logged instead of surfacing as a failed bot deletion.
export async function deleteSandbox(sandboxId: string) {
  try {
    const sandbox = await getDaytona().get(sandboxId)
    await sandbox.delete()
  } catch (error) {
    console.error(`Failed to delete Daytona sandbox ${sandboxId}`, error)
  }
}
