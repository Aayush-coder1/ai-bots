import { ChatAvatar } from "@/components/chat-avatar"
import { cn } from "@/lib/utils"

// Where each avatar sits inside the square, as fractions of its side, for
// one to three avatars and for the 2x2 grid (three avatars plus a count).
// Each entry is [left, top, size].
const LAYOUTS: Record<
  number,
  ReadonlyArray<readonly [number, number, number]>
> = {
  1: [[0, 0, 1]],
  // Side by side, overlapping in the middle. The faces have empty space
  // around them inside their images, so the images overlap by about a third
  // for the faces themselves to overlap.
  2: [
    [0, 0.17, 0.66],
    [0.34, 0.17, 0.66],
  ],
  // A triangle: one on top, two below.
  3: [
    [0.24, 0, 0.52],
    [0, 0.48, 0.52],
    [0.48, 0.48, 0.52],
  ],
  // A 2x2 grid.
  4: [
    [0, 0, 0.5],
    [0.5, 0, 0.5],
    [0, 0.5, 0.5],
    [0.5, 0.5, 0.5],
  ],
}

const MAX_VISIBLE = 3

function position([left, top, size]: readonly [number, number, number]) {
  return {
    left: `${left * 100}%`,
    top: `${top * 100}%`,
    width: `${size * 100}%`,
    height: `${size * 100}%`,
  }
}

/**
 * The avatar of a chat: one face for a direct chat, or up to three faces of
 * a group with the rest counted. It fills exactly the box `className` gives
 * it, so it takes the same space as a single ChatAvatar of that size.
 */
export function GroupChatAvatar({
  seeds,
  fallbackSeed,
  className,
}: {
  seeds: string[]
  /** Shown when the chat has no bots (for example after they were deleted). */
  fallbackSeed: string
  className?: string
}) {
  const faces = seeds.length > 0 ? seeds : [fallbackSeed]

  if (faces.length === 1) {
    return <ChatAvatar seed={faces[0]} className={className} />
  }

  const visible = faces.slice(0, MAX_VISIBLE)
  const hidden = faces.length - visible.length
  const slots = LAYOUTS[hidden > 0 ? 4 : visible.length]

  return (
    <span
      className={cn("@container relative inline-block shrink-0", className)}
      aria-hidden
    >
      {visible.map((seed, index) => (
        <ChatAvatar
          key={`${seed}-${index}`}
          seed={seed}
          // No background or ring: each face is its own shape, and a backdrop
          // shows up as a dark outline around it.
          className="absolute"
          style={position(slots[index])}
        />
      ))}
      {hidden > 0 ? (
        <span
          className="absolute flex items-center justify-center rounded-full bg-muted text-[22cqw] leading-none font-medium text-muted-foreground"
          style={position(slots[MAX_VISIBLE])}
        >
          +{hidden}
        </span>
      ) : null}
    </span>
  )
}
