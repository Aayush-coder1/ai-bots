import { relations } from "drizzle-orm"
import {
  bigint,
  boolean,
  index,
  integer,
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

// Every billable thing a user's bots consume. Seconds are wall-clock time a
// sandbox ran (E2B) or a command ran (Daytona); tokens are as the AI provider
// reports them.
export const usageMetric = pgEnum("usage_metric", [
  "ai_input_tokens",
  "ai_output_tokens",
  "e2b_desktop_seconds",
  "e2b_code_seconds",
  "daytona_seconds",
  "web_searches",
  "page_fetches",
])

/**
 * The usage ledger: one row per metered event, never updated. A period's
 * usage is the sum of its rows, so concurrent writers (the Next.js server and
 * the Trigger.dev worker) never conflict. Each row carries the billing cycle
 * it was charged to.
 */
export const usageEvents = pgTable(
  "usage_events",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    /** The Clerk user who pays: the bots' owner. */
    userId: text("user_id").notNull(),
    metric: usageMetric("metric").notNull(),
    quantity: bigint("quantity", { mode: "number" }).notNull(),
    periodStart: timestamp("period_start").notNull(),
    periodEnd: timestamp("period_end").notNull(),
    /**
     * The sandbox a time-based row was measured on, so its running time is
     * charged once however many processes report it.
     */
    resourceId: text("resource_id"),
    chatId: text("chat_id"),
    botId: text("bot_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("usage_events_user_created_idx").on(table.userId, table.createdAt),
    index("usage_events_resource_idx").on(table.resourceId),
  ]
)

// ---------------------------------------------------------------------------
// Your PC: a small agent the user runs on their own computer. Bots queue jobs
// for it (run a command, read or write a file in the shared folder) and the
// agent picks them up, asks the user where needed, and reports back.
// ---------------------------------------------------------------------------

export const devices = pgTable(
  "devices",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    userId: text("user_id").notNull(),
    name: text("name").notNull().default("My PC"),
    platform: text("platform"),
    /** The folder on the PC the agent shares, as the agent reported it. */
    folder: text("folder"),
    /** SHA-256 of the one-time pairing code; cleared once the agent pairs. */
    pairCodeHash: text("pair_code_hash"),
    pairExpiresAt: timestamp("pair_expires_at"),
    /** How long the user chose to keep it connected; null means until they disconnect. */
    keepSeconds: integer("keep_seconds"),
    /** When its access ends by itself; set from keepSeconds when it pairs. */
    expiresAt: timestamp("expires_at"),
    /** SHA-256 of the agent's bearer token. The token itself is never stored. */
    tokenHash: text("token_hash"),
    lastSeenAt: timestamp("last_seen_at"),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("devices_user_id_idx").on(table.userId),
    index("devices_token_hash_idx").on(table.tokenHash),
    index("devices_pair_code_hash_idx").on(table.pairCodeHash),
  ]
)

export const deviceJobKind = pgEnum("device_job_kind", [
  "run",
  "read_file",
  "write_file",
  "list_files",
  "open",
])

export const deviceJobStatus = pgEnum("device_job_status", [
  "pending",
  "running",
  "done",
  "error",
  "denied",
])

export const deviceJobs = pgTable(
  "device_jobs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    deviceId: text("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    botId: text("bot_id"),
    /** Shown in the agent's approval prompt. */
    botName: text("bot_name"),
    chatId: text("chat_id"),
    kind: deviceJobKind("kind").notNull(),
    input: jsonb("input").$type<Record<string, unknown>>().notNull(),
    status: deviceJobStatus("status").notNull().default("pending"),
    output: jsonb("output").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    claimedAt: timestamp("claimed_at"),
    finishedAt: timestamp("finished_at"),
  },
  (table) => [
    index("device_jobs_device_status_idx").on(table.deviceId, table.status),
  ]
)

// ---------------------------------------------------------------------------
// Automations: a task a bot runs on a schedule, with the result kept in the
// run history and optionally sent to a chat webhook.
// ---------------------------------------------------------------------------

export const automationFrequency = pgEnum("automation_frequency", [
  "hourly",
  "daily",
  "weekly",
])

export const automationRunStatus = pgEnum("automation_run_status", [
  "running",
  "done",
  "error",
])

export const automations = pgTable(
  "automations",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    userId: text("user_id").notNull(),
    botId: text("bot_id")
      .notNull()
      .references(() => bots.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    prompt: text("prompt").notNull(),
    frequency: automationFrequency("frequency").notNull().default("daily"),
    /** Local time of day, minutes after midnight. Ignored for hourly. */
    minuteOfDay: integer("minute_of_day")
      .notNull()
      .default(8 * 60),
    /** 0 (Sunday) to 6 (Saturday). Only used for weekly. */
    dayOfWeek: integer("day_of_week").notNull().default(1),
    /** IANA time zone the schedule is written in. */
    timezone: text("timezone").notNull().default("UTC"),
    /**
     * The user's own device this runs on (lib/devices.ts); null means the
     * bot's cloud computer only.
     */
    deviceId: text("device_id").references(() => devices.id, {
      onDelete: "set null",
    }),
    /** Discord, Slack or Telegram webhook the result is also sent to. */
    webhookUrl: text("webhook_url"),
    enabled: boolean("enabled").notNull().default(true),
    nextRunAt: timestamp("next_run_at"),
    lastRunAt: timestamp("last_run_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("automations_user_id_idx").on(table.userId),
    index("automations_due_idx").on(table.enabled, table.nextRunAt),
  ]
)

export const automationRuns = pgTable(
  "automation_runs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    automationId: text("automation_id")
      .notNull()
      .references(() => automations.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    status: automationRunStatus("status").notNull().default("running"),
    /** The bot's final answer, as Markdown. */
    output: text("output"),
    error: text("error"),
    /** Whether the webhook accepted the result; null when there is none. */
    delivered: boolean("delivered"),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    finishedAt: timestamp("finished_at"),
  },
  (table) => [
    index("automation_runs_automation_idx").on(
      table.automationId,
      table.startedAt
    ),
  ]
)

export const automationsRelations = relations(automations, ({ one, many }) => ({
  bot: one(bots, { fields: [automations.botId], references: [bots.id] }),
  runs: many(automationRuns),
}))

export const automationRunsRelations = relations(automationRuns, ({ one }) => ({
  automation: one(automations, {
    fields: [automationRuns.automationId],
    references: [automations.id],
  }),
}))

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

/** Hosts a result may be sent to. Anything else is refused (lib/webhook.ts). */
export const WEBHOOK_HOSTS = [
  "discord.com",
  "discordapp.com",
  "hooks.slack.com",
  "api.telegram.org",
] as const

export function isAllowedWebhook(value: string) {
  try {
    const url = new URL(value)
    return (
      url.protocol === "https:" &&
      (WEBHOOK_HOSTS as readonly string[]).includes(url.hostname)
    )
  } catch {
    return false
  }
}

export const insertAutomationSchema = z.object({
  botId: z.string().min(1, "Pick a bot"),
  name: z.string().min(1, "Name is required").max(60),
  prompt: z
    .string()
    .min(10, "Describe the task in a sentence or two")
    .max(2000),
  frequency: z.enum(automationFrequency.enumValues),
  /** "HH:MM" in the user's time zone. */
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM"),
  dayOfWeek: z.number().int().min(0).max(6),
  timezone: z.string().min(1).max(64),
  /** A connected device to run on, or "" for the bot's cloud computer. */
  deviceId: z.string().max(64).optional(),
  webhookUrl: z
    .string()
    .max(500)
    .refine((value) => value === "" || isAllowedWebhook(value), {
      message: "Use a Discord, Slack or Telegram webhook URL",
    })
    .optional(),
})

export type InsertBotInput = z.input<typeof insertBotSchema>
export type InsertGroupChatInput = z.input<typeof insertGroupChatSchema>
export type Bot = typeof bots.$inferSelect
export type Chat = typeof chats.$inferSelect
export type ChatKind = Chat["kind"]
export type ChatMember = typeof chatMembers.$inferSelect
export type UsageMetric = (typeof usageMetric.enumValues)[number]
export type InsertAutomationInput = z.input<typeof insertAutomationSchema>
export type Device = typeof devices.$inferSelect
export type DeviceJob = typeof deviceJobs.$inferSelect
export type DeviceJobKind = DeviceJob["kind"]
export type Automation = typeof automations.$inferSelect
export type AutomationRun = typeof automationRuns.$inferSelect
export type AutomationFrequency = Automation["frequency"]
