@AGENTS.md

<!-- TRIGGER.DEV SKILLS START -->
## Trigger.dev agent skills

This project has Trigger.dev agent skills installed in `.claude/skills/`. Before writing or changing Trigger.dev code, load the most relevant skill:

- `trigger-authoring-tasks` — writing tasks in `trigger/` (task, schemaTask, ctx, retries, waits, queues, cron, `trigger.config.ts`)
- `trigger-authoring-chat-agent` — durable AI chat agents (`chat.agent`, server actions, `useTriggerChatTransport`)
- `trigger-chat-agent-advanced` — advanced chat: sessions, custom transports, steering, HITL, compaction, `mockChatAgent`
- `trigger-realtime-and-frontend` — realtime hooks and client-side triggering in React/Next.js
- `trigger-cost-savings` — auditing spend, right-sizing machines, reviewing runs via the Trigger.dev MCP tools

The full version-pinned references and docs ship inside `node_modules/@trigger.dev/sdk/` (`skills/` and `docs/`).
<!-- TRIGGER.DEV SKILLS END -->
