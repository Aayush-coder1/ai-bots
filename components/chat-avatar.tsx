import { Avatar, Style } from "@dicebear/core"
import definition from "@dicebear/styles/gaze.json"
import Image from "next/image"

type ChatAvatarProps = {
  seed: string
  animated?: boolean
  className?: string
  style?: React.CSSProperties
}

const avatarStyle = new Style(definition)

export function ChatAvatar({
  seed,
  animated = false,
  className,
  style,
}: ChatAvatarProps) {
  const svg = new Avatar(avatarStyle, {
    seed,
    ...(animated ? { tags: ["animation"] } : {}),
  }).toString()

  return (
    <Image
      src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`}
      alt={`Avatar for ${seed}`}
      width={32}
      height={32}
      className={className}
      style={style}
      unoptimized
    />
  )
}
