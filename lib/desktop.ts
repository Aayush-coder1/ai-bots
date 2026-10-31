import { Sandbox as Desktop } from "@e2b/desktop"

// The bot's screen: an E2B desktop with the open internet, so websites like
// YouTube load and the user watches it live in the desktop panel. Daytona
// stays the bot's own computer for its shell, files and memory, but its
// network is limited on lower tiers, so a browser there can't reach most
// sites.
//
// Both the Next.js server (the panel) and the Trigger.dev worker (the bot's
// mouse and keyboard) need the same desktop, and they don't share memory, so
// each desktop is tagged with the bot's Daytona sandbox id and found again by
// that tag.

export type { Desktop }

export const SCREEN = { width: 1024, height: 768 }

export const DESKTOP_VNC_PORT = 6080
export const DESKTOP_AUDIO_PORT = 6090
export const DESKTOP_AUDIO_PATH = "/stream.mp3"

// E2B's free plan stops a sandbox after an hour at most; each use pushes the
// shutdown back by this much, so an idle desktop doesn't burn credit.
const IDLE_TIMEOUT_MS = 20 * 60 * 1000
const RECHECK_AFTER_MS = 60 * 1000
const TAG = "desktopFor"

const PULSE_SOCKET = "/tmp/pulse/native"

// Sound: PulseAudio with a null sink that every app plays into; ffmpeg
// encodes its monitor to MP3 over HTTP, which the panel plays beside the VNC
// view. ffmpeg's server takes one listener and exits, so it loops.
const AUDIO_SCRIPT = `#!/bin/bash
mkdir -p /tmp/pulse ~/.config/pulse
echo "default-server = unix:${PULSE_SOCKET}" > ~/.config/pulse/client.conf
pulseaudio --daemonize=yes --exit-idle-time=-1 --disallow-exit \\
  -n --load="module-native-protocol-unix socket=${PULSE_SOCKET} auth-anonymous=1" \\
  --load="module-null-sink sink_name=bot_output" --load="module-always-sink"
sleep 1
export PULSE_SERVER=unix:${PULSE_SOCKET}
pactl set-default-sink bot_output
while true; do
  ffmpeg -hide_banner -loglevel error -f pulse -i bot_output.monitor \\
    -ac 2 -ar 44100 -c:a libmp3lame -b:a 128k -flush_packets 1 \\
    -f mp3 -content_type audio/mpeg -listen 1 http://0.0.0.0:${DESKTOP_AUDIO_PORT}${DESKTOP_AUDIO_PATH}
  sleep 0.5
done
`

/** Environment for apps started on the desktop, so their sound streams. */
export const DESKTOP_ENV = {
  DISPLAY: ":0",
  PULSE_SERVER: `unix:${PULSE_SOCKET}`,
}

/** Thrown when E2B isn't set up, so callers can say so plainly. */
export class DesktopUnavailable extends Error {
  name = "DesktopUnavailable"
}

function apiKey() {
  const key = process.env.E2B_API_KEY?.trim().replace(/^["']|["']$/g, "")
  if (!key) {
    throw new DesktopUnavailable(
      "The desktop isn't configured (E2B_API_KEY is not set)."
    )
  }
  return key
}

type Entry = { desktop: Promise<Desktop>; checkedAt: number }
const entries = new Map<string, Entry>()

async function running(owner: string) {
  const paginator = Desktop.list({
    apiKey: apiKey(),
    query: { metadata: { [TAG]: owner }, state: ["running"] },
  })
  const items = paginator.hasNext ? await paginator.nextItems() : []
  // Oldest first: if two processes raced to create one, both settle on it.
  return items.sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())
}

async function setUp(desktop: Desktop) {
  // The live view (noVNC on DESKTOP_VNC_PORT).
  await desktop.stream.start().catch((error: Error) => {
    if (!/already running/i.test(error.message)) throw error
  })

  await desktop.files.write("/tmp/bot-audio.sh", AUDIO_SCRIPT)
  // In the background: it runs for as long as the desktop does.
  await desktop.commands
    .run("bash /tmp/bot-audio.sh > /tmp/bot-audio.log 2>&1", {
      background: true,
      timeoutMs: 0,
    })
    // Detaching leaves it running; it only stops the output stream to us.
    .then((handle) => handle.disconnect())
    .catch((error) =>
      console.error("Failed to start the desktop's sound", error)
    )
}

async function connect(owner: string) {
  const key = apiKey()
  const [existing] = await running(owner)

  if (existing) {
    const desktop = await Desktop.connect(existing.sandboxId, {
      apiKey: key,
      timeoutMs: IDLE_TIMEOUT_MS,
    })
    // A desktop made by another process may not have its stream up yet.
    const vnc = await desktop.commands
      .run("pgrep -x x11vnc", { timeoutMs: 10_000 })
      .catch(() => null)
    if (!vnc) await setUp(desktop)
    return desktop
  }

  const desktop = await Desktop.create({
    apiKey: key,
    resolution: [SCREEN.width, SCREEN.height],
    timeoutMs: IDLE_TIMEOUT_MS,
    allowInternetAccess: true,
    // The panel shows the desktop in an iframe, which can't send E2B's
    // traffic token, so its URLs must accept plain requests. The sandbox id
    // in the host name is random, so the URL isn't guessable.
    network: { allowPublicTraffic: true },
    metadata: { [TAG]: owner },
  })

  // Lost a race with another process? Use the older one and drop ours.
  const [oldest] = await running(owner)
  if (oldest && oldest.sandboxId !== desktop.sandboxId) {
    await desktop.kill().catch(() => {})
    return connect(owner)
  }

  await setUp(desktop)
  return desktop
}

/**
 * The live desktop for a bot, keyed by its Daytona sandbox id: reused while
 * it runs, created (with its stream and sound) when it doesn't.
 */
export async function getLiveDesktop(owner: string): Promise<Desktop> {
  const entry = entries.get(owner)

  if (entry) {
    if (Date.now() - entry.checkedAt < RECHECK_AFTER_MS) {
      return entry.desktop
    }
    try {
      const desktop = await entry.desktop
      // Pushes the shutdown back; fails once the desktop has gone.
      await desktop.setTimeout(IDLE_TIMEOUT_MS)
      entry.checkedAt = Date.now()
      return desktop
    } catch {
      entries.delete(owner)
    }
  }

  const desktop = connect(owner)
  entries.set(owner, { desktop, checkedAt: Date.now() })
  // A failed start must not stick, or every later call fails with it.
  desktop.catch(() => entries.delete(owner))
  return desktop
}

/** Runs a shell command on the desktop and returns its output, never throwing on exit codes. */
export async function desktopRun(
  desktop: Desktop,
  command: string,
  timeoutMs = 30_000
) {
  try {
    const result = await desktop.commands.run(command, {
      timeoutMs,
      envs: DESKTOP_ENV,
    })
    return { exitCode: result.exitCode, output: result.stdout + result.stderr }
  } catch (error) {
    const failed = error as Partial<{
      exitCode: number
      stdout: string
      stderr: string
    }>
    if (typeof failed.exitCode === "number") {
      return {
        exitCode: failed.exitCode,
        output: `${failed.stdout ?? ""}${failed.stderr ?? ""}`,
      }
    }
    throw error
  }
}

/** The panel's view: noVNC on the desktop's public host. */
export function liveDesktopUrls(desktop: Desktop) {
  const viewer = new URL(
    `https://${desktop.getHost(DESKTOP_VNC_PORT)}/vnc.html`
  )
  viewer.searchParams.set("autoconnect", "true")
  viewer.searchParams.set("reconnect", "true")
  viewer.searchParams.set("reconnect_delay", "2000")
  viewer.searchParams.set("resize", "scale")
  return {
    url: viewer.toString(),
    audioUrl: `https://${desktop.getHost(DESKTOP_AUDIO_PORT)}${DESKTOP_AUDIO_PATH}`,
  }
}

/** How long the panel can trust a URL before asking again (which also keeps the desktop alive). */
export const LIVE_URL_LIFETIME_MS = IDLE_TIMEOUT_MS
