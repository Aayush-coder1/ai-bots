import { Daytona } from "@daytona/sdk"

let client: Daytona | undefined

// Lazily constructed so the SDK only reads its environment configuration when a
// bot actually needs a sandbox.
export function getDaytona() {
  // Next.js loads `.env.local` into `process.env`, so the SDK sees the endpoint
  // in both places and refuses to guess where it came from. Naming it here says
  // which one we mean; without it bot creation throws before any request.
  client ??= new Daytona({
    apiUrl: process.env.DAYTONA_API_URL,
    target: process.env.DAYTONA_TARGET,
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
