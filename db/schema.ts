import { relations } from "drizzle-orm"
import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core"
import type { UIMessage } from "ai"
import { createInsertSchema } from "drizzle-zod"
import { nanoid } from "nanoid"
import { z } from "zod"

export const bots = pgTable(
  "bots",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    avatar: text("avatar")
      .notNull()
      .$defaultFn(() => nanoid()),
    job: text("job").notNull(),
    instructions: text("instructions"),
    sandboxId: text("sandbox_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("bots_user_id_idx").on(table.userId)]
)

export const chatKind = pgEnum("chat_kind", ["direct", "group"])

export const chats = pgTable(
  "chats",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    userId: text("user_id").notNull(),
    kind: chatKind("kind").notNull().default("direct"),
    name: text("name"),
    lastMessagePreview: text("last_message_preview"),
    lastMessageAt: timestamp("last_message_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("chats_user_id_idx").on(table.userId)]
)

export const chatMembers = pgTable(
  "chat_members",
  {
    chatId: text("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    botId: text("bot_id")
      .notNull()
      .references(() => bots.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.chatId, table.botId] }),
    index("chat_members_bot_id_idx").on(table.botId),
  ]
)

export const chatTranscripts = pgTable("chat_transcripts", {
  chatId: text("chat_id")
    .primaryKey()
    .references(() => chats.id, { onDelete: "cascade" }),
  messages: jsonb("messages").$type<UIMessage[]>().notNull().default([]),
  state: jsonb("state"),
  cursors: jsonb("cursors").$type<{
    lastOutEventId?: string
    lastInEventId?: string
  }>(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export const botsRelations = relations(bots, ({ many }) => ({
  memberships: many(chatMembers),
}))

export const chatsRelations = relations(chats, ({ many }) => ({
  members: many(chatMembers),
}))

export const chatMembersRelations = relations(chatMembers, ({ one }) => ({
  chat: one(chats, {
    fields: [chatMembers.chatId],
    references: [chats.id],
  }),
  bot: one(bots, {
    fields: [chatMembers.botId],
    references: [bots.id],
  }),
}))

export const insertBotSchema = createInsertSchema(bots, {
  name: z.string().min(1, "Name is required").max(50),
  avatar: z.string().min(1, "Face is required").max(100),
  job: z.string().min(1, "Job is required").max(100),
  instructions: z.string().max(2000).optional(),
}).omit({
  id: true,
  userId: true,
  sandboxId: true,
  createdAt: true,
})

export const insertGroupChatSchema = z.object({
  name: z.string().min(1, "Name is required").max(50),
  botIds: z.array(z.string()).min(2, "Pick at least two bots"),
})

export type InsertBotInput = z.input<typeof insertBotSchema>
export type InsertGroupChatInput = z.input<typeof insertGroupChatSchema>
export type Bot = typeof bots.$inferSelect
export type Chat = typeof chats.$inferSelect
export type ChatKind = Chat["kind"]
export type ChatMember = typeof chatMembers.$inferSelect
