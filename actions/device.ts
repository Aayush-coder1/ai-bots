"use server"

import { auth } from "@clerk/nextjs/server"
import { and, eq, isNull, lt } from "drizzle-orm"
import * as Sentry from "@sentry/nextjs"
import { revalidatePath } from "next/cache"

import { db } from "@/db"
import { devices } from "@/db/schema"
import { FEATURES, upgradeRequired } from "@/lib/billing"
import { hasFeatures } from "@/lib/billing-server"
import { createPairing } from "@/lib/devices"

const PC_PATH = "/pc"

/** A one-time code the user types into the agent on their computer. */
export async function createPairingCode() {
  const { userId } = await auth()
  if (!userId) {
    throw new Error("Unauthorized")
  }
  if (!(await hasFeatures(FEATURES.bots))) {
    return upgradeRequired
  }

  // Codes nobody used are swept up whenever a new one is made.
  await db
    .delete(devices)
    .where(
      and(
        eq(devices.userId, userId),
        isNull(devices.tokenHash),
        lt(devices.pairExpiresAt, new Date())
      )
    )

  try {
    const code = await createPairing(userId)
    Sentry.logger.info("PC pairing code created", { userId })
    return { ok: true as const, code }
  } catch (error) {
    // Returned, not thrown: production Next.js hides thrown messages.
    return {
      ok: false as const,
      reason: "error" as const,
      message:
        error instanceof Error ? error.message : "Could not create a code",
    }
  }
}

/** Cuts a computer off: its token stops working at the agent's next request. */
export async function disconnectDevice(deviceId: string) {
  const { userId } = await auth()
  if (!userId) {
    throw new Error("Unauthorized")
  }
  await db
    .update(devices)
    .set({ revokedAt: new Date(), tokenHash: null })
    .where(and(eq(devices.id, deviceId), eq(devices.userId, userId)))
  Sentry.logger.info("PC disconnected", { userId, deviceId })
  revalidatePath(PC_PATH)
}
