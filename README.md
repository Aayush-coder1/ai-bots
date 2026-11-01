# ai-bots

**AI agents with their own computers.** Every bot has a personality, a long-term memory, a face, and a real sandboxed machine: a terminal, a file system, the open web and a live desktop you can watch and take over. Put several bots in a group chat and they `@mention` and hand work off to each other.

Built as a production-style SaaS: auth, a paid plan, metered usage with limits, background agents and full observability. Everything runs on free tiers.

---

## Features

| | |
| --- | --- |
| **Agentic chat** | Streaming replies with every tool call rendered inline: terminal output, file trees, code, web sources. |
| **Live desktop + Watch Mode** | Each direct chat has a resizable desktop panel (noVNC). When the bot starts using its computer, the panel opens by itself and shows a pulsing *Live* indicator. Click the screen to take control fullscreen. Desktop audio streams in the browser too. |
| **Sandboxes** | Daytona for the bot's persistent machine (bash, files), E2B Desktop for the live screen, E2B Code Interpreter for code that needs the open internet. |
| **Web tools** | Server-side search and page fetching, with SSRF guards (DNS checks, redirect and size limits). |
| **Per-bot memory** | `remember` / `recall` tools give each bot its own durable notes about you. |
| **Group chats** | Pick who answers each turn or `@mention` a bot; bots can hand off a turn to the bot that fits it best. |
| **Starter prompts** | One-click first messages in an empty chat that show the desktop, code, web and memory tools. |
| **Transcript export** | Download any chat as Markdown. The server action only returns chats owned by the signed-in user. |
| **Billing and usage** | Clerk Billing plans gate features; an append-only usage ledger meters tokens, sandbox seconds, searches and fetches against per-plan limits. |
| **Observability** | Sentry errors, tracing, session replay (text and inputs masked) and structured logs across Next.js and Trigger.dev workers. |

---

## Architecture

```mermaid
%%{init: {
  "theme": "base",
  "flowchart": { "curve": "basis", "nodeSpacing": 38, "rankSpacing": 70, "padding": 14, "htmlLabels": true },
  "themeVariables": {
    "fontFamily": "Inter, ui-sans-serif, system-ui, sans-serif",
    "fontSize": "14px",
    "background": "#0b0b10",
    "primaryColor": "#18181b",
    "primaryTextColor": "#f4f4f5",
    "primaryBorderColor": "#6366f1",
    "lineColor": "#818cf8",
    "clusterBkg": "#111118",
    "clusterBorder": "#3f3f46",
    "edgeLabelBackground": "#0b0b10",
    "titleColor": "#c7d2fe"
  }
}}%%
flowchart LR
    subgraph CL["🌐 Client & Edge"]
        UI["<b>Next.js UI</b><br/><span>React 19 · Tailwind v4</span>"]
        CH["<b>useChat</b><br/><span>AI SDK transport</span>"]
        VNC["<b>Live Desktop</b><br/><span>noVNC + audio</span>"]
    end

    subgraph CP["⚡ Next.js Control Plane · Vercel"]
        MW["<b>Clerk Middleware</b><br/><span>proxy.ts</span>"]
        SA["<b>Server Actions</b><br/><span>bots · chats · desktop · export</span>"]
        RSC["<b>Server Components</b><br/><span>user-scoped queries</span>"]
    end

    subgraph BG["⚙️ Background Workers · Trigger.dev v3"]
        AG["<b>chat.agent</b><br/><span>stateless turn loop</span>"]
        TL["<b>Tool Layer</b><br/><span>bash · files · desktop · web · memory</span>"]
        LLM["<b>Gemini</b><br/><span>Google Generative AI</span>"]
    end

    subgraph SB["🧪 Sandboxes & Infrastructure"]
        DY["<b>Daytona</b><br/><span>persistent machine</span>"]
        ED["<b>E2B Desktop</b><br/><span>live screen</span>"]
        EC["<b>E2B Interpreter</b><br/><span>internet code</span>"]
    end

    subgraph DT["🔒 Secure Data & Observability"]
        CK["<b>Clerk</b><br/><span>auth · billing</span>"]
        DB[("<b>Neon Postgres</b><br/><span>Drizzle ORM</span>")]
        SN["<b>Sentry</b><br/><span>errors · replay · logs</span>"]
    end

    UI ==>|request| MW
    MW ==> SA
    UI --> RSC
    RSC -->|read| DB
    SA -->|auth + plan| CK
    SA ==>|scoped token| AG
    CH <==>|realtime stream| AG
    AG <-->|prompt| LLM
    AG ==> TL
    TL --> DY
    TL --> ED
    TL --> EC
    AG -->|transcripts · usage| DB
    SA -->|signed URL| ED
    VNC -.->|view| ED
    UI -.->|telemetry| SN
    SA -.-> SN
    AG -.-> SN

    classDef client fill:#1e1b4b,stroke:#818cf8,stroke-width:1.5px,color:#e0e7ff,rx:10,ry:10
    classDef control fill:#18181b,stroke:#6366f1,stroke-width:1.5px,color:#f4f4f5,rx:10,ry:10
    classDef worker fill:#2e1065,stroke:#a78bfa,stroke-width:1.5px,color:#ede9fe,rx:10,ry:10
    classDef sandbox fill:#0f172a,stroke:#38bdf8,stroke-width:1.5px,color:#e0f2fe,rx:10,ry:10
    classDef data fill:#052e2b,stroke:#34d399,stroke-width:1.5px,color:#d1fae5,rx:10,ry:10
    classDef obs fill:#2a1215,stroke:#fb7185,stroke-width:1.5px,color:#ffe4e6,rx:10,ry:10

    class UI,CH,VNC client
    class MW,SA,RSC control
    class AG,TL,LLM worker
    class DY,ED,EC sandbox
    class CK,DB data
    class SN obs

    style CL fill:#0f0f1a,stroke:#4f46e5,stroke-width:1px,color:#c7d2fe,rx:14,ry:14
    style CP fill:#111114,stroke:#52525b,stroke-width:1px,color:#e4e4e7,rx:14,ry:14
    style BG fill:#140b24,stroke:#7c3aed,stroke-width:1px,color:#ddd6fe,rx:14,ry:14
    style SB fill:#0a1120,stroke:#0284c7,stroke-width:1px,color:#bae6fd,rx:14,ry:14
    style DT fill:#071a17,stroke:#059669,stroke-width:1px,color:#a7f3d0,rx:14,ry:14

    linkStyle default stroke:#818cf8,stroke-width:1.6px
    linkStyle 15,16,17 stroke:#fb7185,stroke-width:1.2px,stroke-dasharray:4 4
```

> **Legend** — <kbd>indigo</kbd> client · <kbd>zinc</kbd> control plane · <kbd>violet</kbd> workers · <kbd>sky</kbd> sandboxes · <kbd>emerald</kbd> data · <kbd>rose ┄</kbd> telemetry to Sentry

### Request lifecycle (one chat turn)

1. **Browser → Server Action.** `startChatSession` / `mintChatAccessToken` check the Clerk session and the plan (`bots` + `sandboxes`), and check that the chat belongs to the user. They then return a Trigger.dev public token scoped to that one chat session.
2. **Browser ⇄ Trigger.dev.** `useChat` streams through the Trigger chat transport straight to the worker, so a long agent turn never holds a Vercel function open.
3. **Agent run.** `chat.agent` loads the transcript from Postgres, builds the bot's system prompt (persona, memory, group context) and runs Gemini through the AI SDK with the tools turned on for that bot.
4. **Tools.** Commands and files go to the bot's Daytona sandbox, the desktop is driven over E2B Desktop, internet-enabled code runs in E2B Code Interpreter, and web search/fetch runs on the worker itself.
5. **Persist and meter.** The transcript is saved per chat. Every billable unit (tokens, sandbox seconds, searches, fetches) is appended to `usage_events`, and limits are checked before the next unit is spent.
6. **Live view.** `getDesktopUrl` returns a short-lived signed noVNC URL for the bot's desktop. The panel refreshes it before it expires and opens by itself while the bot uses the computer.

### Isolation

Every query and action is scoped by Clerk `userId` (`queries.ts`, `actions/*`). Trigger.dev tokens are scoped to one chat session. Desktop URLs are only issued for a sandbox that belongs to a bot the user owns.

---

## Tech stack

| Layer | Technology |
| --- | --- |
| Framework | **Next.js 16** (App Router, Server Actions, Turbopack), **React 19** |
| Auth & billing | **Clerk** (`@clerk/nextjs`, Clerk Billing plans and features) |
| Database | **Neon Postgres** (serverless driver) + **Drizzle ORM** / drizzle-kit (push-only), drizzle-zod |
| UI | **Tailwind CSS v4**, **shadcn/ui** (Base UI primitives), AI Elements, lucide icons, DiceBear avatars |
| AI | **Vercel AI SDK** (`ai`, `@ai-sdk/react`), **Google Generative AI** (`@ai-sdk/google`, Gemini) |
| Background agents | **Trigger.dev v3** (`chat.agent`, realtime chat transport) |
| Sandboxes | **E2B** (Desktop + Code Interpreter), **Daytona** |
| Observability | **Sentry** (`@sentry/nextjs`, `@sentry/node` in workers): errors, tracing, replay, logs |
| Hosting | **Vercel** (web), Trigger.dev Cloud (workers) |

### Free-tier notes

- Sentry samples 10% of traces and sessions in production and every session that has an error. Replays mask all text and inputs.
- E2B sandboxes shut down after idling, and Daytona auto-stops idle sandboxes, so nothing runs (or bills) unattended.
- Long agent turns run on Trigger.dev, not Vercel functions, so they stay within Vercel Hobby timeouts.
- Sentry's example page and API route return 404 in production, so the error quota can't be burned by visitors.

---

## Project structure

```
app/                  Routes: (dashboard) home, chats/[chatId], usage, pricing; error + not-found boundaries
actions/              Server Actions: bot, chat, group-chat, desktop, export
components/           App components (chat, sidebar, desktop panel, dialogs)
  ui/  ai-elements/   Vendored shadcn + AI Elements (kept as upstream ships them)
db/                   Drizzle schema + client
lib/                  Billing, usage ledger and limits, sandboxes, desktop, memory, Sentry helpers
trigger/              Trigger.dev tasks: chat agent, tools, model, web, E2B
queries.ts            User-scoped reads for server components
```

---

## Getting started

```bash
npm install
# create .env.local with the variables below
npm run db:push              # apply the Drizzle schema to Neon (push-only, no migrations)
npx trigger.dev dev          # terminal 1: run the agent worker locally
npm run dev                  # terminal 2: http://localhost:3000
```

### Environment variables

| Variable | Where it's used |
| --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_SIGN_IN_URL`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | Clerk auth |
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | Neon Postgres |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini (Trigger.dev worker) |
| `TRIGGER_SECRET_KEY` | `tr_dev_…` locally, `tr_prod_…` on Vercel. Never mix them |
| `DAYTONA_API_KEY`, `DAYTONA_API_URL` | Daytona sandboxes |
| `E2B_API_KEY` | E2B Desktop and Code Interpreter |
| `SENTRY_DSN` (+ `SENTRY_AUTH_TOKEN` in `.env.sentry-build-plugin`) | Sentry runtime + source map upload |

Worker env vars are read from where the task runs: `.env.local` for `trigger dev`, and the Trigger.dev dashboard for deployed tasks. Vercel env vars don't reach the workers.

### Scripts

| Command | |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (Next core-web-vitals + TypeScript) |
| `npm run format` | Prettier + Tailwind class sorting |
| `npm run db:push` / `db:studio` | Drizzle schema push / studio |
| `npx trigger.dev deploy` | Deploy the agent worker |
