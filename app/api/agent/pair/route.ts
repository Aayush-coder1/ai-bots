import { z } from "zod"

import { completePairing } from "@/lib/devices"

// Called once by the local agent (public/agent.mjs) with the code the user
// copied from the Your PC page. No Clerk session: the code is the proof.
const bodySchema = z.object({
  code: z.string().min(6).max(20),
  name: z.string().max(100).optional(),
  platform: z.string().max(100).optional(),
  folder: z.string().max(500).optional(),
})

export async function POST(request: Request) {
  const body = bodySchema.safeParse(await request.json().catch(() => null))
  if (!body.success) {
    return Response.json({ error: "Invalid request" }, { status: 400 })
  }
  const paired = await completePairing(body.data)
  if (!paired) {
    return Response.json(
      { error: "That code is wrong or has expired. Create a new one." },
      { status: 401 }
    )
  }
  return Response.json({
    token: paired.token,
    deviceId: paired.device.id,
    name: paired.device.name,
  })
}
