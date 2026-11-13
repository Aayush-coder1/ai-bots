import { z } from "zod"

import { claimNextJob, deviceFromRequest, touchDevice } from "@/lib/devices"

// The local agent asks here for work every few seconds. Answers with at most
// one job, already marked as running.
const bodySchema = z.object({ folder: z.string().max(500).optional() })

export async function POST(request: Request) {
  const device = await deviceFromRequest(request)
  if (!device) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }
  const body = bodySchema.safeParse(await request.json().catch(() => ({})))
  await touchDevice(device, body.success ? body.data.folder : undefined)

  const job = await claimNextJob(device.id)
  return Response.json({
    job: job
      ? {
          id: job.id,
          kind: job.kind,
          input: job.input,
          bot: job.botName ?? "A bot",
          // Only approved (or auto-approved) work is ever handed out, so the
          // agent needn't ask again in its terminal.
          approved: true,
        }
      : null,
  })
}
