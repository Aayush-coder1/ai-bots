import { z } from "zod"

import { deviceFromRequest, finishJob } from "@/lib/devices"

// The local agent reports what a job did (or that the user said no).
const bodySchema = z.object({
  jobId: z.string().min(1).max(64),
  status: z.enum(["done", "error", "denied"]),
  output: z.record(z.string(), z.unknown()).default({}),
})

export async function POST(request: Request) {
  const device = await deviceFromRequest(request)
  if (!device) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }
  const body = bodySchema.safeParse(await request.json().catch(() => null))
  if (!body.success) {
    return Response.json({ error: "Invalid request" }, { status: 400 })
  }
  const saved = await finishJob(
    device.id,
    body.data.jobId,
    body.data.status,
    body.data.output
  )
  return Response.json({ ok: saved })
}
