import type { Bot, Chat } from "@/db/schema"

/** A direct chat is named after its bot; a group chat has its own name. */
export function chatName(chat: {
  kind: Chat["kind"]
  name: string | null
  bot: Bot | null
}) {
  if (chat.kind === "group") {
    return chat.name ?? "Group chat"
  }
  return chat.bot?.name ?? chat.name ?? "New chat"
}
