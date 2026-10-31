// Tagging a bot in a group chat message: "@[Ada] can you check this?".
// Shared by the composer, the message list and the agent, so all three read
// a tag the same way.

const MENTION = /@\[([^\]\n]+)\]/

/** How a tag is written into a message. */
export function formatMention(name: string) {
  return `@[${name}]`
}

/** The name in the first tag of a message, if it has one. */
export function firstMentionName(text: string) {
  return MENTION.exec(text)?.[1]?.trim()
}

/** The message with its first tag (and the space after it) taken out. */
export function withoutFirstMention(text: string) {
  return text.replace(/@\[[^\]\n]+\] ?/, "")
}

/**
 * The bot a message is addressed to: the first tag, matched by name. With
 * two bots of the same name, `preferredId` (the composer's pick) decides,
 * and without it the tag is ignored rather than guessed.
 */
export function mentionedBot<T extends { id: string; name: string }>(
  text: string,
  bots: T[],
  preferredId?: string
) {
  const name = firstMentionName(text)?.toLowerCase()
  if (!name) {
    return undefined
  }
  const matches = bots.filter((bot) => bot.name.toLowerCase() === name)
  if (matches.length === 1) {
    return matches[0]
  }
  return matches.find((bot) => bot.id === preferredId)
}

/**
 * An "@" being typed at the caret: where it starts and what follows it, or
 * null when the caret isn't in a tag-in-progress.
 */
export function mentionQueryAt(text: string, caret: number) {
  const match = /(^|\s)@([^\s@[\]]*)$/.exec(text.slice(0, caret))
  if (!match) {
    return null
  }
  return { start: caret - match[2].length - 1, query: match[2] }
}
