"use client"

import {
  MonitorIcon,
  RefreshCwIcon,
  Volume2Icon,
  VolumeXIcon,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react"
import type { ComponentProps, ReactNode } from "react"
import { createPortal } from "react-dom"
import { usePanelRef } from "react-resizable-panels"

import { type DesktopUrlResult, getDesktopUrl } from "@/actions/desktop"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ResizableHandle, ResizablePanel } from "@/components/ui/resizable"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { toast } from "@/components/ui/toast"
import { Toggle } from "@/components/ui/toggle"
import { useBillingGate } from "@/hooks/use-billing-gate"
import { PAYWALL, pricingHref } from "@/lib/billing"
import { USAGE_PATH } from "@/lib/usage-limits"
import { cn } from "@/lib/utils"

type DesktopFailure = Extract<DesktopUrlResult, { ok: false }>["reason"]

type DesktopState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; src: string; audioSrc: string }
  | { status: "error"; reason: DesktopFailure; message?: string }

const FAILURE_MESSAGES: Record<DesktopFailure, string> = {
  unauthorized: "Sign in again to see the desktop.",
  "upgrade-required": "The desktop is part of the paid plan.",
  "no-sandbox": "This bot doesn't have a sandbox.",
  "not-configured": "The desktop isn't configured on this server.",
  failed: "Couldn't start the desktop.",
  "usage-limit": "You've used up your online computer hours for now.",
}

// Signed URLs expire; noVNC's reconnects need a valid one, so it is replaced
// this long before it runs out.
const REFRESH_BEFORE_EXPIRY_MS = 10 * 60 * 1000

type SoundState = "off" | "connecting" | "on"

// How long the audio stream may take to start before giving up.
const SOUND_TIMEOUT_MS = 10_000

type DesktopContextValue = {
  botName: string
  open: boolean
  toggle: () => void
  panelRef: ReturnType<typeof usePanelRef>
  onPanelResize: (percentage: number) => void
  fullscreen: boolean
  setFullscreen: (fullscreen: boolean) => void
  desktop: DesktopState
  reload: () => void
  /** Whether the desktop's sound is playing in this browser. */
  sound: SoundState
  toggleSound: () => void
  setPanelSlot: (element: HTMLElement | null) => void
  setDialogSlot: (element: HTMLElement | null) => void
}

const DesktopContext = createContext<DesktopContextValue | null>(null)

// Width the panel opens at the first time; afterwards it reopens at whatever
// width it was last dragged to.
const INITIAL_SIZE = "45%"

export function useDesktopPanel() {
  const context = useContext(DesktopContext)
  if (!context) {
    throw new Error("useDesktopPanel must be used within DesktopPanelProvider")
  }
  return context
}

/**
 * Owns the bot's desktop for this chat page: the side panel's open state,
 * the fullscreen dialog, and the one VNC viewer both of them show.
 */
export function DesktopPanelProvider({
  chatId,
  botName,
  children,
}: {
  chatId: string
  botName: string
  children: ReactNode
}) {
  const panelRef = usePanelRef()
  const [open, setOpen] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [desktop, setDesktop] = useState<DesktopState>({ status: "idle" })
  const [panelSlot, setPanelSlot] = useState<HTMLElement | null>(null)
  const [dialogSlot, setDialogSlot] = useState<HTMLElement | null>(null)
  const lastSize = useRef<string>(INITIAL_SIZE)

  // Starting the sandbox and desktop takes a few seconds, so it only happens
  // the first time the panel opens, not on every chat page view.
  const refreshTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const audioRef = useRef<HTMLAudioElement>(null)
  const [sound, setSound] = useState<SoundState>("off")
  const soundTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const { paywall } = useBillingGate()

  const reload = useCallback(() => {
    clearTimeout(refreshTimer.current)
    setDesktop((current) =>
      // A refresh keeps the current viewer up until the new URL arrives.
      current.status === "ready" ? current : { status: "loading" }
    )

    const load = () => {
      getDesktopUrl(chatId)
        .then((result) => {
          if (!result.ok) {
            if (result.reason === "upgrade-required") {
              // Shows the upgrade toast with its link to the pricing page.
              paywall(PAYWALL.desktop)
            }
            setDesktop({
              status: "error",
              reason: result.reason,
              message: "message" in result ? result.message : undefined,
            })
            return
          }
          setDesktop({
            status: "ready",
            src: result.url,
            audioSrc: result.audioUrl,
          })
          refreshTimer.current = setTimeout(
            load,
            Math.max(
              result.expiresAt - Date.now() - REFRESH_BEFORE_EXPIRY_MS,
              0
            )
          )
        })
        // The action itself failed to run (network, timeout).
        .catch(() => setDesktop({ status: "error", reason: "failed" }))
    }

    load()
  }, [chatId, paywall])

  useEffect(() => () => clearTimeout(refreshTimer.current), [])

  const started = useRef(false)

  const onPanelResize = useCallback(
    (percentage: number) => {
      setOpen(percentage > 0)
      if (percentage > 0) {
        lastSize.current = `${percentage}%`
        if (!started.current) {
          started.current = true
          reload()
        }
      }
    },
    [reload]
  )

  const toggle = useCallback(() => {
    const panel = panelRef.current
    if (!panel) {
      return
    }
    if (panel.isCollapsed()) {
      panel.resize(lastSize.current)
    } else {
      panel.collapse()
    }
  }, [panelRef])

  const audioSrc = desktop.status === "ready" ? desktop.audioSrc : null

  const stopSound = useCallback(() => {
    clearTimeout(soundTimer.current)
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.removeAttribute("src")
      audio.load()
    }
    setSound("off")
  }, [])

  // Browsers only play sound after a click, so it starts off. Turning it on
  // connects to the live stream from now (a fresh URL each time, so nothing
  // stale is replayed); turning it off disconnects, which frees the stream
  // for the next listen. A click while connecting cancels, so a second click
  // never opens a second connection the stream can't serve.
  const toggleSound = useCallback(() => {
    const audio = audioRef.current
    if (!audio || !audioSrc) {
      return
    }
    if (sound !== "off") {
      stopSound()
      return
    }

    const url = new URL(audioSrc)
    url.searchParams.set("t", String(Date.now()))
    audio.src = url.toString()
    setSound("connecting")

    // A stream that never starts would leave the button spinning.
    soundTimer.current = setTimeout(() => {
      stopSound()
      toast.add({
        type: "error",
        title: "Couldn't play the sound",
        description: "The desktop's audio didn't start. Try again.",
      })
    }, SOUND_TIMEOUT_MS)

    audio.play().catch(() => stopSound())
  }, [audioSrc, sound, stopSound])

  // No timer left running after the panel unmounts, e.g. leaving the chat.
  useEffect(() => () => clearTimeout(soundTimer.current), [])

  return (
    <DesktopContext.Provider
      value={{
        botName,
        open,
        toggle,
        panelRef,
        onPanelResize,
        fullscreen,
        setFullscreen,
        desktop,
        reload,
        sound,
        toggleSound,
        setPanelSlot,
        setDialogSlot,
      }}
    >
      {children}
      {/* One audio element for the panel and the dialog, like the viewer.
          If the stream drops (the sandbox stopped), sound turns off. */}
      <audio
        ref={audioRef}
        preload="none"
        // Sound counts as on once audio is actually playing.
        onPlaying={() => {
          clearTimeout(soundTimer.current)
          setSound("on")
        }}
        // Only an error while connected or connecting turns it off; clearing
        // the source on purpose also raises one.
        onError={() =>
          setSound((current) => (current === "off" ? current : "off"))
        }
        onEnded={() => setSound("off")}
      />
      {desktop.status === "ready" ? (
        <DesktopViewer
          src={desktop.src}
          title={`${botName}'s screen`}
          slot={fullscreen ? dialogSlot : open ? panelSlot : null}
          interactive={fullscreen}
        />
      ) : null}
    </DesktopContext.Provider>
  )
}

/**
 * The single VNC iframe. Moving an iframe in the DOM reloads it and drops the
 * VNC connection, so it stays mounted in one place, a fixed layer on the
 * body, and is laid over whichever slot is showing it: the panel preview or
 * the dialog. With no slot it is hidden but stays connected.
 */
function DesktopViewer({
  src,
  title,
  slot,
  interactive,
}: {
  src: string
  title: string
  slot: HTMLElement | null
  interactive: boolean
}) {
  const layerRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLIFrameElement>(null)

  // Follow the slot every frame: panels resize while dragged, the sidebar
  // moves the page, and the dialog animates in. Writing styles directly
  // keeps this out of React renders.
  useEffect(() => {
    let frame = 0
    let last = ""

    const follow = () => {
      const layer = layerRef.current
      const rect = slot?.getBoundingClientRect()
      const visible = !!rect && rect.width > 0 && rect.height > 0
      const next = visible
        ? `${rect.left},${rect.top},${rect.width},${rect.height}`
        : "hidden"

      if (layer && next !== last) {
        last = next
        layer.style.visibility = visible ? "visible" : "hidden"
        if (rect && visible) {
          layer.style.transform = `translate(${rect.left}px, ${rect.top}px)`
          layer.style.width = `${rect.width}px`
          layer.style.height = `${rect.height}px`
        }
      }

      frame = requestAnimationFrame(follow)
    }

    follow()
    return () => cancelAnimationFrame(frame)
  }, [slot])

  // Typing should reach the desktop as soon as it is fullscreen.
  useEffect(() => {
    if (interactive) {
      const id = setTimeout(() => frameRef.current?.focus(), 150)
      return () => clearTimeout(id)
    }
  }, [interactive])

  return createPortal(
    <div
      ref={layerRef}
      // Above the dialog's overlay and popup (z-50) while fullscreen; in the
      // panel it stays in normal paint order so menus and dialogs cover it.
      className={cn(
        "invisible fixed top-0 left-0 overflow-hidden rounded-lg bg-black",
        interactive ? "z-[60]" : "pointer-events-none"
      )}
    >
      <iframe
        ref={frameRef}
        src={src}
        title={title}
        className="size-full border-0"
        allow="clipboard-read; clipboard-write"
        // In the panel the preview is a picture: clicks go to the button
        // under it, which opens the dialog, and it stays out of tab order.
        tabIndex={interactive ? 0 : -1}
        aria-hidden={!interactive}
      />
    </div>,
    document.body
  )
}

function DesktopStatus() {
  const { desktop, reload } = useDesktopPanel()
  const pathname = usePathname()

  if (desktop.status === "error") {
    return (
      <div className="flex size-full flex-col items-center justify-center gap-2 p-4 text-center">
        <p className="text-sm text-muted-foreground">
          {desktop.message ?? FAILURE_MESSAGES[desktop.reason]}
        </p>
        {desktop.reason === "usage-limit" ? (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              render={<Link href={USAGE_PATH} />}
              nativeButton={false}
            >
              See usage
            </Button>
            <Button
              variant="outline"
              size="sm"
              render={<Link href={pricingHref(pathname)} />}
              nativeButton={false}
            >
              See plans
            </Button>
          </div>
        ) : desktop.reason === "upgrade-required" ? (
          <Button
            variant="outline"
            size="sm"
            render={<Link href={pricingHref(pathname)} />}
            nativeButton={false}
          >
            See plans
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={reload}>
            Try again
          </Button>
        )}
      </div>
    )
  }

  if (desktop.status !== "ready") {
    return <Skeleton className="size-full" />
  }

  return null
}

/**
 * The right-hand panel with a live preview of the bot's screen. It starts
 * collapsed; the header button expands it, and dragging the handle below its
 * minimum size collapses it again. Clicking the preview opens it fullscreen.
 */
export function DesktopPanel(
  props: Omit<
    ComponentProps<typeof ResizablePanel>,
    "panelRef" | "collapsible" | "onResize" | "children"
  >
) {
  const {
    botName,
    panelRef,
    onPanelResize,
    desktop,
    reload,
    setFullscreen,
    setPanelSlot,
  } = useDesktopPanel()

  return (
    <ResizablePanel
      defaultSize="0%"
      minSize="25%"
      maxSize="70%"
      collapsedSize="0%"
      {...props}
      // The panel holds a fixed preview, so it never needs to scroll.
      style={{ overflow: "hidden", ...props.style }}
      collapsible
      panelRef={panelRef}
      // Covers both the button and a drag, so the button never shows a stale state.
      onResize={(size) => onPanelResize(size.asPercentage)}
    >
      <div className="flex h-full flex-col gap-4 p-4">
        <div className="flex justify-end gap-1">
          <SoundToggle />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Reload screen"
            disabled={desktop.status === "loading"}
            onClick={reload}
          >
            {desktop.status === "loading" ? <Spinner /> : <RefreshCwIcon />}
          </Button>
        </div>
        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            ref={setPanelSlot}
            className="aspect-4/3 w-full overflow-hidden rounded-lg border bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
            aria-label={`Open ${botName}'s screen fullscreen`}
            disabled={desktop.status !== "ready"}
            onClick={() => setFullscreen(true)}
          >
            <DesktopStatus />
          </button>
          <p className="text-sm text-muted-foreground">
            {botName}&apos;s screen
          </p>
        </div>
      </div>
    </ResizablePanel>
  )
}

/** Turns the desktop's sound on or off in this browser. */
function SoundToggle() {
  const { desktop, sound, toggleSound } = useDesktopPanel()

  return (
    <Toggle
      size="sm"
      aria-label={
        sound === "off"
          ? "Play sound"
          : sound === "connecting"
            ? "Connecting sound, click to cancel"
            : "Mute sound"
      }
      pressed={sound !== "off"}
      disabled={desktop.status !== "ready"}
      onPressedChange={toggleSound}
    >
      {sound === "connecting" ? (
        <Spinner />
      ) : sound === "on" ? (
        <Volume2Icon />
      ) : (
        <VolumeXIcon />
      )}
    </Toggle>
  )
}

/** The chat header's button that shows and hides the desktop panel. */
export function DesktopToggle({ className }: { className?: string }) {
  const { open, toggle } = useDesktopPanel()

  return (
    <Toggle
      size="sm"
      className={className}
      aria-label={open ? "Hide desktop" : "Show desktop"}
      pressed={open}
      onPressedChange={toggle}
    >
      <MonitorIcon />
    </Toggle>
  )
}

/** The divider before the desktop panel, hidden while the panel is collapsed. */
export function DesktopPanelHandle({
  className,
  ...props
}: ComponentProps<typeof ResizableHandle>) {
  const { open } = useDesktopPanel()

  return (
    <ResizableHandle
      className={cn(!open && "hidden", className)}
      disabled={!open}
      {...props}
    />
  )
}

/**
 * The bot's screen, fullscreen and interactive. Keys and clicks belong to
 * the desktop, so only the close button closes it: Escape, outside clicks
 * and focus moving into the viewer (which sits outside the popup) are
 * ignored. Non-modal, because a modal dialog would block input to the viewer.
 */
export function DesktopDialog() {
  const { botName, fullscreen, setFullscreen, setDialogSlot } =
    useDesktopPanel()

  return (
    <Dialog
      open={fullscreen}
      modal={false}
      disablePointerDismissal
      onOpenChange={(next, details) => {
        if (!next && details.reason !== "close-press") {
          details.cancel()
          return
        }
        setFullscreen(next)
      }}
    >
      <DialogContent className="flex w-[min(calc(100vw-2rem),calc((100dvh-7rem)*4/3))] max-w-none flex-col sm:max-w-none">
        <DialogHeader className="flex-row items-center gap-2 pr-10">
          <DialogTitle className="flex-1">{botName}&apos;s screen</DialogTitle>
          <SoundToggle />
          <DialogDescription className="sr-only">
            Live view of {botName}&apos;s desktop. Keyboard and mouse input go
            to the desktop.
          </DialogDescription>
        </DialogHeader>
        <div
          ref={setDialogSlot}
          className="aspect-4/3 w-full rounded-lg bg-black"
        />
      </DialogContent>
    </Dialog>
  )
}
