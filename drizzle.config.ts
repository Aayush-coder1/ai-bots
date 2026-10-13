import { defineConfig } from "drizzle-kit";


process.loadEnvFile(".env.local");


export default defineConfig({
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  casing: "snake_case",
  dbCredentials: {
    url: process.env.DATABASE_URL_UNPOOLED!,
  },
});
