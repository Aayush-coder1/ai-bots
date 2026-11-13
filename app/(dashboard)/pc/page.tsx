import { auth } from "@clerk/nextjs/server"
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm"
import { ShieldCheckIcon } from "lucide-react"

import { PcDevices } from "@/components/pc-devices"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { db } from "@/db"
import { devices } from "@/db/schema"
import { isOnline } from "@/lib/devices"

// Reached from the sidebar. Lets bots work on the user's own computer through
// a small agent the user runs there (public/agent.mjs).
export default async function PcPage() {
  const { userId } = await auth.protect()
  const rows = await db.query.devices.findMany({
    where: and(
      eq(devices.userId, userId),
      isNull(devices.revokedAt),
      isNotNull(devices.tokenHash)
    ),
    orderBy: desc(devices.createdAt),
  })

  const now = new Date()

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-12">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">Your PC</h1>
          <p className="text-muted-foreground">
            Let your bots work on your own devices, not only on their cloud
            computer: run a command in your project, tidy a folder, write a
            file, open a link in your real browser. Connect more than one and a
            bot can work across them, for example take a file from your laptop
            and use it on your desktop.
          </p>
        </div>

        <Alert>
          <ShieldCheckIcon />
          <AlertTitle>You stay in control</AlertTitle>
          <AlertDescription>
            <ul className="flex list-disc flex-col gap-1 pl-4">
              <li>
                Bots can only read and write inside the one folder you share.
              </li>
              <li>
                You see every command in your terminal and approve it before it
                runs.
              </li>
              <li>
                It only works while the agent is running. Press Ctrl+C to stop
                it, or disconnect the computer here.
              </li>
            </ul>
          </AlertDescription>
        </Alert>

        <PcDevices
          devices={rows.map((device) => ({
            id: device.id,
            name: device.name,
            platform: device.platform,
            folder: device.folder,
            online: isOnline(device),
            expiresAt: device.expiresAt?.toISOString() ?? null,
            accessEnded: !!device.expiresAt && device.expiresAt <= now,
            lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
          }))}
        />
      </div>
    </div>
  )
}
