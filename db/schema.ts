import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { nanoid } from "nanoid";
import { z } from "zod";

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
  (table) => [index("bots_user_id_idx").on(table.userId)],
);

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
});

export type InsertBotInput = z.input<typeof insertBotSchema>;
export type Bot = typeof bots.$inferSelect;
