<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Git

- Never create branches, worktrees, or commits automatically. Only do so when the user explicitly asks for that specific action in the current request.
- Leave changes uncommitted in the working tree on the current branch and let the user decide when and how to commit.

## Database

- Only ever apply schema changes with `npm run db:push`. Never run migrations (`drizzle-kit migrate` / `generate` output) and never create a `drizzle/` migrations folder — this project is push-only.
- This is a development project: no backwards compatibility, data is worthless. Prefer data loss — never backfill, migrate, or preserve existing rows, and never spend effort keeping old data working. Every schema change means a clean slate: drop/recreate tables as needed rather than preserving anything.
