import type { TranscriptScope, TranscriptStorage } from "@trigger.dev/sdk/ai"
import type { UIMessage } from "ai"
import { eq } from "drizzle-orm"

import { db } from "@/db"
import { chatTranscripts } from "@/db/schema"

/**
 * Keeps a chat's transcript in Postgres, one row per chat id.
 *
 * The agent hands us the whole conversation after every change, so this is a
 * document store: write `transcript` as-is, read it back on the next boot.
 */
export const chatTranscriptStorage: TranscriptStorage = {
  async load<TUIMessage extends UIMessage = UIMessage>({
    chatId,
  }: TranscriptScope) {
    const row = await db.query.chatTranscripts.findFirst({
      where: eq(chatTranscripts.chatId, chatId),
    })

    if (!row) {
      return { messages: [] as TUIMessage[], state: null }
    }

    return {
      messages: row.messages as TUIMessage[],
      state: row.state ?? null,
      cursors: row.cursors ?? undefined,
    }
  },

  async save({ chatId }, changeset) {
    const messages = changeset.transcript.entries.map((entry) => entry.message)
    const state = changeset.transcript.state ?? null
    const cursors = changeset.cursors ?? null

    await db
      .insert(chatTranscripts)
      .values({ chatId, messages, state, cursors })
      .onConflictDoUpdate({
        target: chatTranscripts.chatId,
        set: { messages, state, cursors, updatedAt: new Date() },
      })
  },
}
