"use client"

import { formatDistanceToNowStrict } from "date-fns"
import {
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  LaptopIcon,
  PlusIcon,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState, useTransition } from "react"

import {
  createPairingCode,
  disconnectDevice,
  setDeviceAutoApprove,
} from "@/actions/device"
import { PcApprovals } from "@/components/pc-approvals"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useBillingGate } from "@/hooks/use-billing-gate"
import { KEEP_OPTIONS, type KeepOption } from "@/lib/device-options"

export type PcDevice = {
  id: string
  name: string
  platform: string | null
  folder: string | null
  online: boolean
  lastSeenAt: string | null
  /** When its access ends by itself; null means until disconnected. */
  expiresAt: string | null
  accessEnded: boolean
  /** Commands run on it without asking first. */
  autoApprove: boolean
}

function CopyBlock({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3">
        <code className="min-w-0 flex-1 font-mono text-xs break-all whitespace-pre-wrap">
          {text}
        </code>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Copy: ${label}`}
          onClick={async () => {
            await navigator.clipboard.writeText(text)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </Button>
      </div>
    </div>
  )
}

export function PcDevices({ devices }: { devices: PcDevice[] }) {
  const router = useRouter()
  const { paywall } = useBillingGate()
  const [code, setCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isCreating, startCreating] = useTransition()
  const [removing, setRemoving] = useState<string | null>(null)
  const [origin, setOrigin] = useState("")
  const [keep, setKeep] = useState<KeepOption>("forever")
  const [folder, setFolder] = useState("~/ai-bots-workspace")
  // The same pattern the launcher route enforces.
  const folderOk = /^[A-Za-z0-9 _.~/\\:-]{1,200}$/.test(folder)
  const launcherHref = (os: "mac" | "windows" | "linux") =>
    `/api/agent/launcher?${new URLSearchParams({ os, code: code ?? "", folder })}`
  const [knownCount] = useState(devices.length)

  // Keeps the online badges current, and notices the new computer as soon as
  // its agent pairs.
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), code ? 3000 : 15000)
    return () => clearInterval(timer)
  }, [router, code])

  const justPaired = code !== null && devices.length > knownCount

  function create() {
    setError(null)
    startCreating(async () => {
      const result = await createPairingCode(keep)
      if (result.ok) {
        // The commands below point the agent at this very site.
        setOrigin(window.location.origin)
        setCode(result.code)
      } else if (result.reason === "upgrade-required") {
        paywall("Connecting your own devices is part of the paid plan.")
      } else {
        setError(result.message)
      }
    })
  }

  async function remove(id: string) {
    setRemoving(id)
    try {
      await disconnectDevice(id)
      router.refresh()
    } finally {
      setRemoving(null)
    }
  }

  async function toggleAutoApprove(id: string, enabled: boolean) {
    await setDeviceAutoApprove(id, enabled)
    router.refresh()
  }

  const anyOnline = devices.some((device) => device.online)

  return (
    <>
      {/* Commands from scheduled runs, or from a chat in another tab. */}
      <PcApprovals active={anyOnline} intervalMs={4000} />
      <Card>
        <CardHeader>
          <CardTitle>Connect a device</CardTitle>
          <CardDescription>
            Takes a minute, with nothing to type: download a small file and
            double-click it. Works on Mac, Windows and Linux (it needs Node.js
            and offers to fetch it if missing) and on Android through Termux.
            iPhones can&apos;t run it.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {code && !justPaired ? (
            <>
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">
                  1. Download the connector for this computer
                </span>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    render={<a href={launcherHref("mac")} download />}
                    nativeButton={false}
                  >
                    <DownloadIcon data-icon="inline-start" />
                    Mac
                  </Button>
                  <Button
                    size="sm"
                    render={<a href={launcherHref("windows")} download />}
                    nativeButton={false}
                  >
                    <DownloadIcon data-icon="inline-start" />
                    Windows
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    render={<a href={launcherHref("linux")} download />}
                    nativeButton={false}
                  >
                    <DownloadIcon data-icon="inline-start" />
                    Linux
                  </Button>
                </div>
              </div>
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
                <p>
                  <strong>
                    Heads up: your computer will probably warn you before
                    opening this file. That is expected and it is safe to
                    continue.
                  </strong>{" "}
                  Windows and macOS show a warning for any small file that
                  doesn&apos;t come from an app store. The connector is a short
                  script you can open in a text editor and read first.
                </p>
                <ul className="mt-2 flex list-disc flex-col gap-1 pl-4 text-muted-foreground">
                  <li>
                    <strong className="text-foreground">Windows</strong> says
                    &quot;Windows protected your PC&quot;: click{" "}
                    <strong className="text-foreground">More info</strong>, then{" "}
                    <strong className="text-foreground">Run anyway</strong>.
                  </li>
                  <li>
                    <strong className="text-foreground">Mac</strong> says it
                    &quot;cannot be opened&quot; or &quot;could not verify&quot;
                    the file: open{" "}
                    <strong className="text-foreground">
                      System Settings → Privacy &amp; Security
                    </strong>
                    , scroll down and click{" "}
                    <strong className="text-foreground">Open Anyway</strong>.
                  </li>
                  <li>
                    Don&apos;t want to click through a warning? Use the terminal
                    option below instead. It does exactly the same thing.
                  </li>
                </ul>
              </div>
              <div className="flex flex-col gap-1 text-sm">
                <span className="font-medium">2. Double-click it</span>
                <ul className="flex list-disc flex-col gap-1 pl-4 text-muted-foreground">
                  <li>
                    <span className="text-foreground">Windows:</span> open{" "}
                    <code>ai-bots-connect.bat</code>.
                  </li>
                  <li>
                    <span className="text-foreground">Mac:</span> open the
                    downloaded zip, then double-click{" "}
                    <code>ai-bots-connect.command</code>.
                  </li>
                  <li>
                    A window opens and stays open while your bots can reach this
                    computer. Close it to stop them. To reconnect later,
                    double-click the same file again.
                  </li>
                </ul>
              </div>
              <div className="flex flex-col gap-2 border-t pt-4">
                <span className="text-sm font-medium">
                  Or use a terminal instead (also for Android)
                </span>
                <span className="text-xs text-muted-foreground">
                  Open Terminal (Mac, Linux), Command Prompt (Windows) or Termux
                  (Android, after <code>pkg install nodejs</code>), paste this
                  one line and press Enter. No security warning this way. You
                  need Node.js 18 or newer.
                </span>
                <CopyBlock
                  label="One line to paste"
                  text={`curl -fsSL ${origin}/agent.mjs -o ai-bots-agent.mjs && node ai-bots-agent.mjs --code ${code} --server ${origin} --folder "${folder}"`}
                />
                <span className="text-xs text-muted-foreground">
                  To reconnect later this way, run{" "}
                  <code>node ai-bots-agent.mjs</code> in the same place.
                </span>
              </div>
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner />
                Waiting for your computer. The code works once and expires in 10
                minutes.
              </p>
            </>
          ) : (
            <>
              {justPaired ? (
                <p className="text-sm text-emerald-600 dark:text-emerald-400">
                  Connected. Open a chat and ask a bot to do something on your
                  PC, for example &quot;list the files in my shared
                  folder&quot;.
                </p>
              ) : null}
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">
                  Keep it connected for
                </span>
                <ToggleGroup
                  variant="outline"
                  size="sm"
                  spacing={2}
                  value={[keep]}
                  onValueChange={(v) => {
                    const next = KEEP_OPTIONS.find((o) => o.value === v[0])
                    if (next) {
                      setKeep(next.value)
                    }
                  }}
                  className="flex flex-wrap"
                >
                  {KEEP_OPTIONS.map((option) => (
                    <ToggleGroupItem
                      key={option.value}
                      value={option.value}
                      className="rounded-full"
                    >
                      {option.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <span className="text-xs text-muted-foreground">
                  After that its access ends by itself and you pair it again.
                  You can disconnect it sooner at any time.
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="pc-folder" className="text-sm font-medium">
                  Folder your bots may work in
                </label>
                <Input
                  id="pc-folder"
                  value={folder}
                  onChange={(event) => setFolder(event.target.value)}
                  autoComplete="off"
                  aria-invalid={!folderOk}
                  className="max-w-md font-mono text-xs"
                />
                <span
                  className={
                    folderOk
                      ? "text-xs text-muted-foreground"
                      : "text-xs text-destructive"
                  }
                >
                  {folderOk
                    ? "Bots can read and write only inside this folder. It is created if it doesn't exist. ~ means your home folder."
                    : "Use only letters, numbers, spaces and . _ - ~ / \\ :"}
                </span>
              </div>
              <Button
                type="button"
                className="w-fit"
                disabled={isCreating || !folderOk}
                onClick={create}
              >
                {isCreating ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <PlusIcon data-icon="inline-start" />
                )}
                {devices.length > 0
                  ? "Connect another device"
                  : "Create pairing code"}
              </Button>
            </>
          )}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Connected devices</CardTitle>
          <CardDescription>
            To reconnect a computer later, double-click its connector file
            again: it remembers the pairing.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {devices.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No device connected yet.
            </p>
          ) : (
            devices.map((device) => (
              <div
                key={device.id}
                className="flex flex-col gap-3 rounded-lg border p-3"
              >
                <div className="flex items-center gap-3">
                  <LaptopIcon className="size-5 shrink-0 text-muted-foreground" />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">
                        {device.name}
                      </span>
                      <Badge variant={device.online ? "default" : "secondary"}>
                        {device.online
                          ? "Online"
                          : device.accessEnded
                            ? "Access ended"
                            : "Offline"}
                      </Badge>
                    </div>
                    <span className="truncate text-xs text-muted-foreground">
                      {device.folder ?? "No folder reported"}
                      {device.platform ? ` · ${device.platform}` : ""}
                      {device.expiresAt && !device.accessEnded
                        ? ` · access ends in ${formatDistanceToNowStrict(new Date(device.expiresAt))}`
                        : ""}
                      {!device.online && device.lastSeenAt
                        ? ` · last seen ${formatDistanceToNowStrict(new Date(device.lastSeenAt))} ago`
                        : ""}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={removing === device.id}
                    onClick={() => remove(device.id)}
                  >
                    {removing === device.id ? (
                      <Spinner data-icon="inline-start" />
                    ) : null}
                    Disconnect
                  </Button>
                </div>
                <label className="flex items-start gap-3 border-t pt-3 text-sm">
                  <Switch
                    className="mt-0.5"
                    checked={device.autoApprove}
                    onCheckedChange={(checked) =>
                      toggleAutoApprove(device.id, checked)
                    }
                  />
                  <span className="flex flex-col gap-0.5">
                    <span className="font-medium">
                      Run commands without asking me
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {device.autoApprove
                        ? "On: bots and scheduled automations run commands here straight away. Risky commands stay blocked, but share only a folder you can afford to lose."
                        : "Off: every command waits for your Allow. Turn on for automations that must run while you are away."}
                    </span>
                  </span>
                </label>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </>
  )
}
