import { createHash, randomBytes, randomInt } from "node:crypto"

import { and, asc, desc, eq, gt, isNotNull, isNull, or, sql } from "drizzle-orm"

import { db } from "@/db"
import {
  type Device,
  type DeviceJob,
  type DeviceJobKind,
  deviceJobs,
  devices,
} from "@/db/schema"
import { KEEP_OPTIONS, type KeepOption } from "@/lib/device-options"

// "Your PC": the server side of the local agent (public/agent.mjs). Shared by
// the Next.js routes the agent calls and the Trigger.dev worker whose tools
// queue jobs for it.

/** A pairing code is good for this long. */
export const PAIR_CODE_TTL_MS = 10 * 60 * 1000
/** A device that polled within this window counts as online. */
export const ONLINE_WINDOW_MS = 45 * 1000
/** A job nobody picked up in this time is dropped, never run late. */
export const JOB_PICKUP_MS = 60 * 1000
/** How long the user gets to approve a job in the agent's terminal. */
export const APPROVAL_MS = 120 * 1000
export const MAX_DEVICES = 5

export { KEEP_OPTIONS, type KeepOption }

/** Not revoked, paired, and its chosen time not yet up. */
function activeDevice(userId: string) {
  return and(
    eq(devices.userId, userId),
    isNull(devices.revokedAt),
    isNotNull(devices.tokenHash),
    or(isNull(devices.expiresAt), gt(devices.expiresAt, new Date()))
  )
}

// No 0/O or 1/I, so a code read off the screen can't be mistyped.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

/** "K7M2-9QXA": shown once in the browser, typed into the agent. */
export function newPairCode() {
  const chars = Array.from(
    { length: 8 },
    () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  ).join("")
  return `${chars.slice(0, 4)}-${chars.slice(4)}`
}

export function normalizePairCode(code: string) {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "")
}

export function isOnline(
  device: Pick<Device, "lastSeenAt" | "revokedAt" | "expiresAt">
) {
  return (
    !device.revokedAt &&
    (!device.expiresAt || device.expiresAt.getTime() > Date.now()) &&
    !!device.lastSeenAt &&
    Date.now() - device.lastSeenAt.getTime() < ONLINE_WINDOW_MS
  )
}

/** Starts a pairing: an unpaired device row holding the code's hash. */
export async function createPairing(
  userId: string,
  keep: KeepOption = "forever"
) {
  const paired = await getActiveDevices(userId)
  if (paired.length >= MAX_DEVICES) {
    throw new Error(
      `You can connect up to ${MAX_DEVICES} devices. Disconnect one first.`
    )
  }
  const option = KEEP_OPTIONS.find((candidate) => candidate.value === keep)
  const code = newPairCode()
  await db.insert(devices).values({
    userId,
    pairCodeHash: sha256(normalizePairCode(code)),
    pairExpiresAt: new Date(Date.now() + PAIR_CODE_TTL_MS),
    keepSeconds: option?.seconds ?? null,
  })
  return code
}

/** Trades a valid pairing code for the agent's token. The code works once. */
export async function completePairing(input: {
  code: string
  name?: string
  platform?: string
  folder?: string
}) {
  const hash = sha256(normalizePairCode(input.code))
  const token = randomBytes(32).toString("base64url")
  const [device] = await db
    .update(devices)
    .set({
      tokenHash: sha256(token),
      pairCodeHash: null,
      pairExpiresAt: null,
      name: input.name?.slice(0, 60) || "My PC",
      platform: input.platform?.slice(0, 40) ?? null,
      folder: input.folder?.slice(0, 300) ?? null,
      lastSeenAt: new Date(),
      // The clock on the chosen connection time starts when it pairs.
      expiresAt: sql`case when ${devices.keepSeconds} is null then null else now() + ${devices.keepSeconds} * interval '1 second' end`,
    })
    .where(
      and(
        eq(devices.pairCodeHash, hash),
        isNull(devices.tokenHash),
        isNull(devices.revokedAt),
        gt(devices.pairExpiresAt, new Date())
      )
    )
    .returning()
  return device ? { token, device } : null
}

/** The device behind an agent's `Authorization: Bearer` header, if valid. */
export async function deviceFromRequest(request: Request) {
  const header = request.headers.get("authorization") ?? ""
  const token = /^Bearer\s+(.+)$/i.exec(header)?.[1]?.trim()
  if (!token || token.length < 20) {
    return null
  }
  const device = await db.query.devices.findFirst({
    where: and(
      eq(devices.tokenHash, sha256(token)),
      isNull(devices.revokedAt),
      or(isNull(devices.expiresAt), gt(devices.expiresAt, new Date()))
    ),
  })
  return device ?? null
}

/** Marks the device as seen, at most every ten seconds to spare the database. */
export async function touchDevice(device: Device, folder?: string) {
  const stale =
    !device.lastSeenAt || Date.now() - device.lastSeenAt.getTime() > 10_000
  const folderChanged = !!folder && folder !== device.folder
  if (stale || folderChanged) {
    await db
      .update(devices)
      .set({
        lastSeenAt: new Date(),
        ...(folderChanged ? { folder: folder.slice(0, 300) } : {}),
      })
      .where(eq(devices.id, device.id))
  }
}

/** Hands the agent its oldest waiting job, marking it as running. */
export async function claimNextJob(deviceId: string) {
  const next = await db.query.deviceJobs.findFirst({
    where: and(
      eq(deviceJobs.deviceId, deviceId),
      eq(deviceJobs.status, "pending"),
      gt(deviceJobs.createdAt, new Date(Date.now() - JOB_PICKUP_MS))
    ),
    orderBy: asc(deviceJobs.createdAt),
  })
  if (!next) {
    return null
  }
  // Only if it is still pending, so a job is never handed out twice.
  const [claimed] = await db
    .update(deviceJobs)
    .set({ status: "running", claimedAt: new Date() })
    .where(and(eq(deviceJobs.id, next.id), eq(deviceJobs.status, "pending")))
    .returning()
  return claimed ?? null
}

const MAX_RESULT_CHARS = 60_000

/** Stores what the agent reports for a job it was running. */
export async function finishJob(
  deviceId: string,
  jobId: string,
  status: "done" | "error" | "denied",
  output: Record<string, unknown>
) {
  // The output comes from the user's machine: cap it before it is stored.
  const json = JSON.stringify(output)
  const safe =
    json.length > MAX_RESULT_CHARS
      ? { error: "The result was too large to send back." }
      : output
  const [job] = await db
    .update(deviceJobs)
    .set({ status, output: safe, finishedAt: new Date() })
    .where(
      and(
        eq(deviceJobs.id, jobId),
        eq(deviceJobs.deviceId, deviceId),
        eq(deviceJobs.status, "running")
      )
    )
    .returning({ id: deviceJobs.id })
  return !!job
}

/** Every device the user has connected and not disconnected, newest first. */
export function getActiveDevices(userId: string) {
  return db.query.devices.findMany({
    where: activeDevice(userId),
    orderBy: desc(devices.lastSeenAt),
  })
}

/** The user's devices whose agent is running right now, most recent first. */
export async function getOnlineDevices(userId: string) {
  return (await getActiveDevices(userId)).filter(isOnline)
}

/** Whether any of the user's devices is online. */
export async function getOnlineDevice(userId: string) {
  return (await getOnlineDevices(userId))[0] ?? null
}

/**
 * Picks the device a job goes to: the one the bot named, else the preferred
 * one (an automation's own device), else the most recently active.
 */
function pickDevice(
  online: Device[],
  wanted: { name?: string; id?: string }
): { device: Device } | { error: string } {
  const names = online.map((device) => `"${device.name}"`).join(", ")
  if (online.length === 0) {
    return {
      error:
        "None of the user's devices is connected. Ask them to open the Your PC page and start the agent on their computer, then try again.",
    }
  }
  const name = wanted.name?.trim().toLowerCase()
  if (name) {
    const exact = online.filter((device) => device.name.toLowerCase() === name)
    const partial = online.filter((device) =>
      device.name.toLowerCase().includes(name)
    )
    const match = exact.length === 1 ? exact : partial
    if (match.length === 1) {
      return { device: match[0] }
    }
    return {
      error:
        match.length > 1
          ? `More than one connected device matches "${wanted.name}". Use the exact name: ${names}.`
          : `No connected device is called "${wanted.name}". Connected right now: ${names}.`,
    }
  }
  if (wanted.id) {
    const preferred = online.find((device) => device.id === wanted.id)
    if (!preferred) {
      return {
        error:
          "The device this task is meant to run on is not connected right now.",
      }
    }
    return { device: preferred }
  }
  return { device: online[0] }
}

export type PcJobResult =
  | { ok: true; device: string; output: Record<string, unknown> }
  | { ok: false; error: string }

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Queues a job for the user's PC and waits for the agent's answer. Never
 * throws for an offline PC or a refusal: the bot gets a result it can explain.
 */
export async function runPcJob(input: {
  userId: string
  botId: string
  botName: string
  chatId: string
  kind: DeviceJobKind
  input: Record<string, unknown>
  /** How long the job itself may run on the PC. */
  timeoutMs?: number
  /** The device the bot named, when the user has several. */
  deviceName?: string
  /** The device to use when the bot names none. */
  deviceId?: string
}): Promise<PcJobResult> {
  const picked = pickDevice(await getOnlineDevices(input.userId), {
    name: input.deviceName,
    id: input.deviceId,
  })
  if ("error" in picked) {
    return { ok: false, error: picked.error }
  }
  const { device } = picked

  const [job] = await db
    .insert(deviceJobs)
    .values({
      deviceId: device.id,
      userId: input.userId,
      botId: input.botId,
      botName: input.botName,
      chatId: input.chatId,
      kind: input.kind,
      input: input.input,
    })
    .returning()

  const deadline =
    Date.now() + JOB_PICKUP_MS + APPROVAL_MS + (input.timeoutMs ?? 30_000)
  let current: DeviceJob = job
  while (Date.now() < deadline) {
    await sleep(current.status === "pending" ? 700 : 1000)
    const row = await db.query.deviceJobs.findFirst({
      where: eq(deviceJobs.id, job.id),
    })
    if (!row) {
      break
    }
    current = row
    if (current.status === "done") {
      return { ok: true, device: device.name, output: current.output ?? {} }
    }
    if (current.status === "denied") {
      return {
        ok: false,
        error:
          "The user declined this action on their PC. Don't retry it; ask them what they'd like instead.",
      }
    }
    if (current.status === "error") {
      const message = (current.output as { error?: string } | null)?.error
      return { ok: false, error: message ?? "The action failed on the PC." }
    }
    if (
      current.status === "pending" &&
      Date.now() - job.createdAt.getTime() > JOB_PICKUP_MS
    ) {
      break
    }
  }

  // Never leave a job behind that could still run after the bot moved on.
  await db
    .update(deviceJobs)
    .set({
      status: "error",
      output: { error: "Timed out" },
      finishedAt: new Date(),
    })
    .where(and(eq(deviceJobs.id, job.id), eq(deviceJobs.status, "pending")))
  return {
    ok: false,
    error:
      current.status === "pending"
        ? "The PC didn't pick the job up in time. The agent may have stopped."
        : "The PC didn't answer in time. The user may not have approved it in the agent's terminal.",
  }
}
