"use server"

import { auth } from "@clerk/nextjs/server"
import { and, asc, eq, gt, isNull, lt } from "drizzle-orm"
import * as Sentry from "@sentry/nextjs"
import { revalidatePath } from "next/cache"

import { db } from "@/db"
import { deviceJobs, devices } from "@/db/schema"
import { FEATURES, upgradeRequired } from "@/lib/billing"
import { hasFeatures } from "@/lib/billing-server"
import {
  APPROVAL_MS,
  createPairing,
  KEEP_OPTIONS,
  type KeepOption,
} from "@/lib/devices"

const PC_PATH = "/pc"

/** A one-time code the user types into the agent on their computer. */
export async function createPairingCode(keep: KeepOption = "forever") {
  if (!KEEP_OPTIONS.some((option) => option.value === keep)) {
    throw new Error("Invalid input")
  }
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
    const code = await createPairing(userId, keep)
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

export type PendingApproval = {
  id: string
  kind: "run" | "open"
  /** The command, or the link or file to open. */
  detail: string
  cwd: string | null
  bot: string
  device: string
  deviceId: string
}

/** Commands waiting for the user's OK, optionally only those of one chat. */
export async function getPendingApprovals(
  chatId?: string
): Promise<PendingApproval[]> {
  const { userId } = await auth()
  if (!userId) {
    return []
  }
  const rows = await db
    .select({ job: deviceJobs, deviceName: devices.name })
    .from(deviceJobs)
    .innerJoin(devices, eq(deviceJobs.deviceId, devices.id))
    .where(
      and(
        eq(deviceJobs.userId, userId),
        eq(deviceJobs.status, "awaiting_approval"),
        gt(deviceJobs.createdAt, new Date(Date.now() - APPROVAL_MS)),
        chatId ? eq(deviceJobs.chatId, chatId) : undefined
      )
    )
    .orderBy(asc(deviceJobs.createdAt))
    .limit(10)

  return rows.map(({ job, deviceName }) => ({
    id: job.id,
    kind: job.kind === "open" ? "open" : "run",
    detail: String(
      (job.kind === "open" ? job.input.target : job.input.command) ?? ""
    ),
    cwd: typeof job.input.cwd === "string" ? job.input.cwd : null,
    bot: job.botName ?? "A bot",
    device: deviceName,
    deviceId: job.deviceId,
  }))
}

/**
 * The user's answer to a waiting command. "always" also turns asking off for
 * that device, the same switch as on the Your PC page.
 */
export async function resolveApproval(
  jobId: string,
  decision: "approve" | "deny" | "always"
) {
  const { userId } = await auth()
  if (!userId) {
    throw new Error("Unauthorized")
  }
  if (!["approve", "deny", "always"].includes(decision)) {
    throw new Error("Invalid input")
  }
  const [job] = await db
    .update(deviceJobs)
    .set(
      decision === "deny"
        ? { status: "denied", finishedAt: new Date() }
        : // The agent's pick-up window starts now, not when the bot asked.
          { status: "pending", createdAt: new Date() }
    )
    .where(
      and(
        eq(deviceJobs.id, jobId),
        eq(deviceJobs.userId, userId),
        eq(deviceJobs.status, "awaiting_approval")
      )
    )
    .returning({ deviceId: deviceJobs.deviceId })
  if (job && decision === "always") {
    await db
      .update(devices)
      .set({ autoApprove: true })
      .where(and(eq(devices.id, job.deviceId), eq(devices.userId, userId)))
    revalidatePath(PC_PATH)
  }
  return { ok: !!job }
}

/** Whether commands on this device run without asking first. */
export async function setDeviceAutoApprove(deviceId: string, enabled: boolean) {
  const { userId } = await auth()
  if (!userId) {
    throw new Error("Unauthorized")
  }
  await db
    .update(devices)
    .set({ autoApprove: enabled === true })
    .where(and(eq(devices.id, deviceId), eq(devices.userId, userId)))
  Sentry.logger.info("PC auto-approve changed", { deviceId, enabled })
  revalidatePath(PC_PATH)
}
