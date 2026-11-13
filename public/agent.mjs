#!/usr/bin/env node
// ai-bots local agent: lets YOUR bots work on YOUR computer, on your terms.
//
//   node agent.mjs --code ABCD-2345            first run: pair with your account
//   node agent.mjs                             later runs: reuse the saved token
//
// Options:
//   --folder <path>   the only folder bots can read and write (default ~/ai-bots-workspace)
//   --yes             don't ask before each command (dangerous ones stay blocked)
//   --server <url>    your ai-bots address (default below)
//   --name <name>     how this computer is shown on the Your PC page
//   --logout          forget the saved token on this computer
//
// What it can do: run a shell command (in the shared folder), read, write and
// list files inside the shared folder, and open a link or a file from that
// folder. Nothing else. Every command and every "open" asks you first unless
// you start it with --yes. Stop it any time with Ctrl+C, or disconnect the
// computer on the Your PC page. No dependencies; needs Node.js 18 or newer.
//
// Scheduled automations you set to run on this computer use the same rules:
// with nobody at the keyboard a command waits for your answer and is skipped,
// so start with --yes if you want them to run commands while you are away.
//
// Android phone: install the Termux app, run `pkg install nodejs`, then use
// the same two commands there.

import { spawn } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import readline from "node:readline"

const DEFAULT_SERVER = "https://ai-bots-six.vercel.app"
const CONFIG_PATH = path.join(os.homedir(), ".ai-bots-agent.json")
const MAX_OUTPUT = 20_000
const MAX_READ = 100_000
const MAX_WRITE = 2_000_000
const APPROVAL_MS = 110_000

// ---- arguments -------------------------------------------------------------

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith("--")) continue
    const key = arg.slice(2)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith("--")) {
      args[key] = true
    } else {
      args[key] = next
      i++
    }
  }
  return args
}

const args = parseArgs(process.argv.slice(2))

if (args.help) {
  console.log(
    "Usage: node agent.mjs [--code CODE] [--folder PATH] [--yes] [--server URL] [--name NAME] [--logout]"
  )
  process.exit(0)
}

const dim = (text) => `\x1b[2m${text}\x1b[0m`
const bold = (text) => `\x1b[1m${text}\x1b[0m`
const yellow = (text) => `\x1b[33m${text}\x1b[0m`
const red = (text) => `\x1b[31m${text}\x1b[0m`
const green = (text) => `\x1b[32m${text}\x1b[0m`

async function readConfig() {
  try {
    return JSON.parse(await fs.readFile(CONFIG_PATH, "utf8"))
  } catch {
    return {}
  }
}

async function writeConfig(config) {
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), {
    mode: 0o600,
  })
  // An existing file keeps its old mode; tighten it either way.
  await fs.chmod(CONFIG_PATH, 0o600).catch(() => {})
}

// ---- the shared folder -----------------------------------------------------

function expandHome(value) {
  return value.startsWith("~")
    ? path.join(os.homedir(), value.slice(1))
    : value
}

/** The real path of the deepest part of `target` that exists. */
async function realExisting(target) {
  let current = target
  const missing = []
  for (;;) {
    try {
      const real = await fs.realpath(current)
      return path.join(real, ...missing.reverse())
    } catch {
      const parent = path.dirname(current)
      if (parent === current) return target
      missing.push(path.basename(current))
      current = parent
    }
  }
}

/** An absolute path inside the shared folder, or an error. Follows symlinks. */
async function insideFolder(root, requested) {
  const raw = expandHome(String(requested ?? "."))
  const target = path.resolve(root, raw)
  const real = await realExisting(target)
  const relative = path.relative(root, real)
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(
      `"${requested}" is outside the shared folder (${root}). Bots can only touch files inside it.`
    )
  }
  return real
}

// ---- safety ----------------------------------------------------------------

// Refused even with --yes. This is a seat belt, not a sandbox: the real
// protection is that you see and approve each command.
const BLOCKED = [
  [/\bsudo\b|\bsu\s+-|\bdoas\b/i, "runs as administrator"],
  [/\brm\s+(-[a-z]*\s+)*(-[a-z]*[rf][a-z]*\s+)+(\/|~|\$HOME|\*)\s*($|[;&|])/i, "deletes a whole drive or home folder"],
  [/\b(mkfs|fdisk|diskutil\s+erase|format\s+[a-z]:)/i, "formats a disk"],
  [/\bdd\b[^|;]*\bof=\/dev\//i, "writes straight to a disk"],
  [/\b(shutdown|reboot|halt|poweroff)\b/i, "turns the computer off"],
  [/:\(\)\s*\{.*\};\s*:/, "is a fork bomb"],
  [/\b(curl|wget)\b[^|;]*\|\s*(sudo\s+)?(ba|z|k)?sh\b/i, "pipes a download into a shell"],
  [/(\.ssh|\.aws|\.gnupg|\.kube|\.docker\/config|\.netrc|\.npmrc|id_rsa|id_ed25519)\b/i, "touches credentials"],
  [/\b(security\s+(find|dump)-|keychain|secret-tool|cmdkey)\b/i, "reads saved passwords"],
  [/(Login Data|Cookies|logins\.json|key4\.db)\b/i, "reads browser passwords or cookies"],
  [/\.ai-bots-agent\.json/i, "reads this agent's own token"],
  [/\b(crontab|launchctl|systemctl\s+(enable|disable)|schtasks|reg\s+add)\b/i, "installs something that keeps running"],
  [/\bchmod\s+(-[a-z]+\s+)*777\s+(\/|~)/i, "opens up permissions on everything"],
]

function blockedReason(command) {
  for (const [pattern, reason] of BLOCKED) {
    if (pattern.test(command)) return reason
  }
  return null
}

// Secrets in your shell's environment are not passed on to commands.
function safeEnv() {
  const env = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (/(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|AUTH|COOKIE|SESSION)/i.test(key)) {
      continue
    }
    env[key] = value
  }
  return env
}

let rl
const alwaysAllow = new Set()

function ask(question, ms) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) return resolve("")
    rl ??= readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })
    const timer = setTimeout(() => {
      process.stdout.write("\n")
      resolve("")
    }, ms)
    rl.question(question, (answer) => {
      clearTimeout(timer)
      resolve(answer.trim().toLowerCase())
    })
  })
}

/** Whether you allow this action. `kind` groups "always" answers. */
async function approve(kind, bot, summary, autoApprove) {
  console.log(`\n${yellow("?")} ${bold(bot)} wants to ${summary}`)
  if (autoApprove || alwaysAllow.has(kind)) {
    console.log(dim("  allowed automatically"))
    return true
  }
  if (!process.stdin.isTTY) {
    console.log(red("  refused: no terminal to ask you in (start with --yes to allow)"))
    return false
  }
  const answer = await ask(
    `  Allow? ${bold("y")}es / ${bold("n")}o / ${bold("a")}lways until I quit: `,
    APPROVAL_MS
  )
  if (answer === "a" || answer === "always") {
    alwaysAllow.add(kind)
    return true
  }
  return answer === "y" || answer === "yes"
}

function clip(text, max = MAX_OUTPUT) {
  return text.length > max
    ? `...[${text.length - max} earlier characters cut]\n${text.slice(-max)}`
    : text
}

// ---- jobs ------------------------------------------------------------------

function runCommand(command, cwd, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      env: safeEnv(),
      windowsHide: true,
    })
    let output = ""
    const add = (chunk) => {
      output += chunk.toString()
      if (output.length > MAX_OUTPUT * 4) output = output.slice(-MAX_OUTPUT * 2)
    }
    child.stdout.on("data", add)
    child.stderr.on("data", add)
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill("SIGKILL")
    }, timeoutMs)
    child.on("error", (error) => {
      clearTimeout(timer)
      resolve({ exitCode: null, output: String(error.message), timedOut })
    })
    child.on("close", (exitCode) => {
      clearTimeout(timer)
      resolve({ exitCode, output: clip(output), timedOut })
    })
  })
}

// Android, inside the Termux app: the one way to run this agent on a phone.
const IS_TERMUX = !!process.env.TERMUX_VERSION

function openTarget(target) {
  const isUrl = /^https?:\/\//i.test(target)
  const [command, commandArgs] = IS_TERMUX
    ? [isUrl ? "termux-open-url" : "termux-open", [target]]
    : process.platform === "darwin"
      ? ["open", [target]]
      : process.platform === "win32"
        ? // Not `cmd /c start`: cmd would treat an & in a link as a command.
          ["explorer.exe", [target]]
        : ["xdg-open", [target]]
  // No shell: the target is passed as one argument, never interpreted.
  const child = spawn(command, commandArgs, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  })
  child.on("error", () => {})
  child.unref()
}

async function handleJob(job, root, autoApprove) {
  const input = job.input ?? {}
  const bot = job.bot ?? "A bot"

  switch (job.kind) {
    case "run": {
      const command = String(input.command ?? "").trim()
      if (!command) throw new Error("No command given")
      const reason = blockedReason(command)
      if (reason) {
        console.log(`\n${red("x")} Blocked a command from ${bot} (${reason}):\n  ${command}`)
        throw new Error(
          `This command is blocked on the user's PC because it ${reason}. Don't try another way around it.`
        )
      }
      const cwd = await insideFolder(root, input.cwd ?? ".")
      const ok = await approve(
        "run",
        bot,
        `run a command in ${cwd}:\n  ${bold(command)}`,
        autoApprove
      )
      if (!ok) return { status: "denied", output: {} }
      const seconds = Math.min(Math.max(Number(input.timeoutSeconds) || 60, 1), 600)
      const result = await runCommand(command, cwd, seconds * 1000)
      console.log(dim(`  exit code ${result.exitCode}${result.timedOut ? " (timed out)" : ""}`))
      return { status: "done", output: { ...result, cwd } }
    }

    case "read_file": {
      const file = await insideFolder(root, input.path)
      const stat = await fs.stat(file)
      if (!stat.isFile()) throw new Error(`${input.path} is not a file`)
      const handle = await fs.open(file, "r")
      try {
        const buffer = Buffer.alloc(Math.min(stat.size, MAX_READ))
        await handle.read(buffer, 0, buffer.length, 0)
        if (buffer.includes(0)) {
          throw new Error(`${input.path} is not a text file`)
        }
        console.log(dim(`\n- ${bot} read ${file}`))
        return {
          status: "done",
          output: {
            path: file,
            size: stat.size,
            content: buffer.toString("utf8"),
            truncated: stat.size > MAX_READ,
          },
        }
      } finally {
        await handle.close()
      }
    }

    case "write_file": {
      const file = await insideFolder(root, input.path)
      const content = String(input.content ?? "")
      if (content.length > MAX_WRITE) throw new Error("That file is too large")
      await fs.mkdir(path.dirname(file), { recursive: true })
      await fs.writeFile(file, content, "utf8")
      console.log(dim(`\n- ${bot} wrote ${file} (${Buffer.byteLength(content)} bytes)`))
      return {
        status: "done",
        output: { path: file, bytes: Buffer.byteLength(content) },
      }
    }

    case "list_files": {
      const folder = await insideFolder(root, input.path ?? ".")
      const entries = await fs.readdir(folder, { withFileTypes: true })
      const listed = await Promise.all(
        entries.slice(0, 500).map(async (entry) => {
          const stat = await fs
            .stat(path.join(folder, entry.name))
            .catch(() => null)
          return {
            name: entry.name,
            isDir: entry.isDirectory(),
            size: stat?.size ?? 0,
          }
        })
      )
      console.log(dim(`\n- ${bot} listed ${folder}`))
      return {
        status: "done",
        output: { path: folder, total: entries.length, entries: listed },
      }
    }

    case "open": {
      const raw = String(input.target ?? "").trim()
      let target
      if (/^https?:\/\//i.test(raw)) {
        target = new URL(raw).toString()
      } else {
        target = await insideFolder(root, raw)
        await fs.access(target)
      }
      const ok = await approve("open", bot, `open on this computer:\n  ${bold(target)}`, autoApprove)
      if (!ok) return { status: "denied", output: {} }
      openTarget(target)
      return { status: "done", output: { opened: target } }
    }

    default:
      throw new Error(`Unknown job kind: ${job.kind}`)
  }
}

// ---- talking to the server -------------------------------------------------

async function post(server, route, body, token) {
  const response = await fetch(`${server}/api/agent/${route}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  })
  const data = await response.json().catch(() => ({}))
  return { status: response.status, data }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function main() {
  if (Number(process.versions.node.split(".")[0]) < 18) {
    console.error("This agent needs Node.js 18 or newer.")
    process.exit(1)
  }

  if (args.logout) {
    await fs.rm(CONFIG_PATH, { force: true })
    console.log("Forgot this computer's token. Disconnect it on the Your PC page too.")
    return
  }

  const config = await readConfig()
  const server = String(args.server || process.env.AI_BOTS_SERVER || config.server || DEFAULT_SERVER).replace(/\/+$/, "")
  const isLocal = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(server)
  if (!server.startsWith("https://") && !isLocal) {
    console.error("The server address must start with https://")
    process.exit(1)
  }

  const folderArg = args.folder || config.folder || "~/ai-bots-workspace"
  const wanted = path.resolve(expandHome(String(folderArg)))
  if (wanted === path.parse(wanted).root || wanted === os.homedir()) {
    console.error(
      red("Refusing to share your whole home folder or drive.") +
        " Pick a specific folder with --folder, e.g. --folder ~/Projects/my-app"
    )
    process.exit(1)
  }
  await fs.mkdir(wanted, { recursive: true })
  const root = await fs.realpath(wanted)
  const name = String(args.name || config.name || os.hostname())
  const autoApprove = args.yes === true

  let token = config.token
  if (args.code) {
    const { status, data } = await post(server, "pair", {
      code: String(args.code),
      name,
      platform: IS_TERMUX ? "Android (Termux)" : `${os.type()} ${os.arch()}`,
      folder: root,
    })
    if (status !== 200 || !data.token) {
      console.error(red(data.error || `Pairing failed (${status}).`))
      process.exit(1)
    }
    token = data.token
    console.log(green("Paired with your ai-bots account."))
  }
  if (!token) {
    console.error(
      "Not paired yet. Open the Your PC page in ai-bots, create a code, then run:\n  node agent.mjs --code YOUR-CODE"
    )
    process.exit(1)
  }
  await writeConfig({ server, token, folder: root, name })

  console.log(`\n${bold("ai-bots agent")} is running on ${bold(name)}`)
  console.log(`  Shared folder: ${bold(root)}`)
  console.log(
    autoApprove
      ? yellow("  Commands run WITHOUT asking (--yes). Dangerous ones stay blocked.")
      : "  You'll be asked before every command and every link a bot opens."
  )
  console.log(dim("  Press Ctrl+C to stop.\n"))

  let lastJobAt = 0
  let failures = 0
  for (;;) {
    try {
      const { status, data } = await post(server, "poll", { folder: root }, token)
      if (status === 401) {
        console.error(red("\nThis device was disconnected, or the time you chose to keep it connected is up. Pair again with a new code."))
        process.exit(1)
      }
      if (status !== 200) throw new Error(`Server answered ${status}`)
      failures = 0

      if (data.job) {
        lastJobAt = Date.now()
        let result
        try {
          result = await handleJob(data.job, root, autoApprove)
        } catch (error) {
          result = { status: "error", output: { error: String(error?.message ?? error) } }
        }
        if (result.status === "denied") console.log(dim("  declined"))
        await post(server, "result", { jobId: data.job.id, ...result }, token).catch(() => {})
        continue
      }
    } catch (error) {
      failures += 1
      if (failures === 3) {
        console.log(dim(`Can't reach ${server} (${error?.message ?? error}). Retrying...`))
      }
    }
    // Quick while a bot is working, relaxed when nothing is happening.
    const active = Date.now() - lastJobAt < 60_000
    const backoff = Math.min(failures, 6) * 5000
    await sleep((active ? 1000 : 4000) + backoff)
  }
}

process.on("SIGINT", () => {
  console.log("\nStopped. Your bots can no longer reach this computer.")
  process.exit(0)
})

main().catch((error) => {
  console.error(red(String(error?.message ?? error)))
  process.exit(1)
})
