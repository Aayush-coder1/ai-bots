import type { UIMessage } from "ai"

// Only these screenshots appear in the chat, so only they are worth keeping.
const SHOWN_TOOLS = new Set(["tool-showScreen"])

type ScreenLike = { image: string; omitted?: boolean }

function withoutImage<T extends ScreenLike>(screen: T): T {
  return screen.image ? { ...screen, image: "", omitted: true } : screen
}

function isScreen(value: unknown): value is ScreenLike {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ScreenLike).image === "string"
  )
}

/**
 * Removes the image data from screenshots the user never sees (viewScreen and
 * the result shot of every mouse or keyboard action) before a transcript is
 * stored. They are large, only the newest one matters to the agent, and
 * keeping them would make every page load and save carry megabytes.
 */
export function stripHiddenScreenshots<T extends UIMessage>(
  messages: T[]
): T[] {
  return messages.map((message) => ({
    ...message,
    parts: message.parts.map((part) => {
      if (
        !part.type.startsWith("tool-") ||
        SHOWN_TOOLS.has(part.type) ||
        !("output" in part) ||
        typeof part.output !== "object" ||
        part.output === null
      ) {
        return part
      }

      const output = part.output as Record<string, unknown>

      if (isScreen(output)) {
        return { ...part, output: withoutImage(output) }
      }
      if (isScreen(output.screen)) {
        return {
          ...part,
          output: { ...output, screen: withoutImage(output.screen) },
        }
      }
      return part
    }),
  }))
}
