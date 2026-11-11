"use client"

import { formatDistanceToNowStrict } from "date-fns"
import { CheckIcon, CopyIcon, LaptopIcon, PlusIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState, useTransition } from "react"

import { createPairingCode, disconnectDevice } from "@/actions/device"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { useBillingGate } from "@/hooks/use-billing-gate"

export type PcDevice = {
  id: string
  name: string
  platform: string | null
  folder: string | null
  online: boolean
  lastSeenAt: string | null
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
      const result = await createPairingCode()
      if (result.ok) {
        // The commands below point the agent at this very site.
        setOrigin(window.location.origin)
        setCode(result.code)
      } else if (result.reason === "upgrade-required") {
        paywall("Connecting your PC is part of the paid plan.")
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

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Connect a computer</CardTitle>
          <CardDescription>
            Takes a minute. You need Node.js 18 or newer on that computer.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {code && !justPaired ? (
            <>
              <CopyBlock
                label="1. Download the agent (one small file you can read first)"
                text={`curl -fsSL ${origin}/agent.mjs -o ai-bots-agent.mjs`}
              />
              <CopyBlock
                label="2. Start it. Change --folder to the folder your bots may work in"
                text={`node ai-bots-agent.mjs --code ${code} --server ${origin} --folder ~/ai-bots-workspace`}
              />
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
              <Button
                type="button"
                className="w-fit"
                disabled={isCreating}
                onClick={create}
              >
                {isCreating ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <PlusIcon data-icon="inline-start" />
                )}
                {devices.length > 0
                  ? "Connect another computer"
                  : "Create pairing code"}
              </Button>
            </>
          )}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Connected computers</CardTitle>
          <CardDescription>
            Next time, just run <code>node ai-bots-agent.mjs</code> again: it
            remembers the pairing.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {devices.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No computer connected yet.
            </p>
          ) : (
            devices.map((device) => (
              <div
                key={device.id}
                className="flex items-center gap-3 rounded-lg border p-3"
              >
                <LaptopIcon className="size-5 shrink-0 text-muted-foreground" />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{device.name}</span>
                    <Badge variant={device.online ? "default" : "secondary"}>
                      {device.online ? "Online" : "Offline"}
                    </Badge>
                  </div>
                  <span className="truncate text-xs text-muted-foreground">
                    {device.folder ?? "No folder reported"}
                    {device.platform ? ` · ${device.platform}` : ""}
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
            ))
          )}
        </CardContent>
      </Card>
    </>
  )
}
