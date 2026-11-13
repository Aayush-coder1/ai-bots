import { auth } from "@clerk/nextjs/server"

import { zipSingleFile } from "@/lib/zip"

// A double-clickable file that downloads the agent and starts it with the
// pairing code already filled in, so the user types nothing. The values end
// up inside a shell script, so both are checked against strict patterns
// (no quotes, no shell characters) before they are used.
const CODE = /^[A-Za-z0-9]{4}-?[A-Za-z0-9]{4}$/
const FOLDER = /^[A-Za-z0-9 _.~/\\:-]{1,200}$/

const NODE_DOWNLOAD = "https://nodejs.org/en/download"

function macScript(origin: string, code: string, folder: string) {
  return `#!/bin/bash
# ai-bots: connects this computer to your account. Safe to read before running.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1
clear
if ! command -v node >/dev/null 2>&1; then
  echo "ai-bots needs Node.js, which is not installed yet."
  echo "Opening the download page. Install it, then double-click this file again."
  open '${NODE_DOWNLOAD}' 2>/dev/null || xdg-open '${NODE_DOWNLOAD}' 2>/dev/null
  read -r -p "Press Enter to close."
  exit 1
fi
mkdir -p "$HOME/.ai-bots"
if ! curl -fsSL '${origin}/agent.mjs' -o "$HOME/.ai-bots/agent.mjs"; then
  echo "Could not download the agent. Check your internet connection and try again."
  read -r -p "Press Enter to close."
  exit 1
fi
node "$HOME/.ai-bots/agent.mjs" --code '${code}' --server '${origin}' --folder '${folder}'
read -r -p "The agent stopped. Press Enter to close."
`
}

function windowsScript(origin: string, code: string, folder: string) {
  return [
    "@echo off",
    "title ai-bots agent",
    "rem ai-bots: connects this computer to your account. Safe to read before running.",
    "where node >nul 2>nul",
    "if errorlevel 1 (",
    "  echo ai-bots needs Node.js, which is not installed yet.",
    "  echo Opening the download page. Install it, then double-click this file again.",
    `  start "" "${NODE_DOWNLOAD}"`,
    "  pause",
    "  exit /b 1",
    ")",
    'if not exist "%USERPROFILE%\\.ai-bots" mkdir "%USERPROFILE%\\.ai-bots"',
    `curl -fsSL "${origin}/agent.mjs" -o "%USERPROFILE%\\.ai-bots\\agent.mjs"`,
    "if errorlevel 1 (",
    "  echo Could not download the agent. Check your internet connection and try again.",
    "  pause",
    "  exit /b 1",
    ")",
    `node "%USERPROFILE%\\.ai-bots\\agent.mjs" --code ${code} --server "${origin}" --folder "${folder}"`,
    "echo The agent stopped.",
    "pause",
    "",
  ].join("\r\n")
}

export async function GET(request: Request) {
  const { userId } = await auth()
  if (!userId) {
    return new Response("Unauthorized", { status: 401 })
  }
  const url = new URL(request.url)
  const os = url.searchParams.get("os")
  const code = url.searchParams.get("code") ?? ""
  const folder = url.searchParams.get("folder") || "~/ai-bots-workspace"
  if (!CODE.test(code) || !FOLDER.test(folder)) {
    return new Response(
      "The folder can only contain letters, numbers, spaces and . _ - ~ / \\ :",
      { status: 400 }
    )
  }
  const origin = url.origin

  if (os === "windows") {
    return new Response(windowsScript(origin, code, folder), {
      headers: {
        "content-type": "application/octet-stream",
        "content-disposition": 'attachment; filename="ai-bots-connect.bat"',
        "cache-control": "no-store",
      },
    })
  }
  if (os === "mac" || os === "linux") {
    const name = os === "mac" ? "ai-bots-connect.command" : "ai-bots-connect.sh"
    const zip = zipSingleFile(name, macScript(origin, code, folder), 0o755)
    return new Response(new Uint8Array(zip), {
      headers: {
        "content-type": "application/zip",
        "content-disposition": 'attachment; filename="ai-bots-connect.zip"',
        "cache-control": "no-store",
      },
    })
  }
  return new Response("Unknown system", { status: 400 })
}
