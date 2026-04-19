# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

For organisational context (companies, people, products, systems, conventions), see `../claude-agents/`.
For full architecture details, see `PROJECT_CONTEXT.md` in this directory.

## Project Overview

ReCivis is the Civil Survey Applications (CSA) partner portal — a full-stack Next.js application for resellers to manage invoices, accounts, contacts, licences, assets, leads, and coupons. Integrates with Zoho CRM (.com.au) for all business data.

## Build & Run

```bash
npm install
npm run dev              # Dev server (Turbopack)
npm run build            # Production build
npm start                # Start production server
npm run lint             # ESLint
npm test                 # Vitest (run once)
npm run test:watch       # Vitest (watch mode)
```

## Architecture

- **Next.js 16** App Router with Turbopack
- **React 19**, TypeScript 5, Tailwind CSS 4, Framer Motion
- **PostgreSQL** for auth, RBAC, audit log (Railway-hosted)
- **Redis** for optional caching (app works without it)
- **Zoho CRM** via two methods:
  - **MCP** (Model Context Protocol) — most CRUD operations
  - **REST API** (Deluge functions via API key) — advanced ops like lead conversion, renewal generation
- **Zustand** for client state with localStorage persistence

### Directory Layout

```
src/
├── app/           — API routes + pages (App Router)
├── components/    — React components, views, layouts
├── lib/           — Utils, types, auth, cache, validation
└── __tests__/     — Vitest test suites
```

### RBAC

5-tier user roles: Admin, IBM, Manager, Standard, Viewer. Reseller role caps: internal, distributor, reseller, restricted. Per-reseller permission overrides supported.

## Deployment

Railway — auto-deploys on push to `master` branch. Production URL: `https://recivis-production.up.railway.app`

## Environment

Requires `.env.local` (not checked in). Minimum required:
- `DATABASE_URL` — PostgreSQL (must use **public** hostname for local dev, not Railway-internal)
- `ZOHO_MCP_URL` — MCP endpoint (key rotates periodically)
- `ZOHO_API_KEY` — Zoho API key for Deluge function calls

## Critical Notes

- **No Zoho sandbox** — local dev reads/writes production CRM data
- **Zoho endpoints** — always `.com.au`, never `.com`
- **MCP tool names** — camelCase (e.g. `ZohoCRM_searchRecords` not `ZohoCRM_Search_Records`)

## Orchestrator integration (2026-04-19)

This repo is part of the [SYS-DEV-CSAOrchestrator](../../Civil-Survey-Solutions/SYS-DEV-CSAOrchestrator) agent toolkit. Sessions invoked as the `recivis` agent run with the same conventions as the other CSA project agents.

### Branches + push policy

- `master` — production. **Auto-deploys to Railway on push.** Pushes to master are an explicit user-only decision; no agent (including the orchestrator) pushes to master without ack.
- `development` — agent working branch. Autonomous commits + pushes are allowed under the workspace [Code Change Policy](../../Civil-Survey-Solutions/SYS-DEV-CSAOrchestrator/CLAUDE.md) extension granted 2026-04-19. Same guardrails as `SYS-DEV-CSAOrchestrator`: no force ops, propose-before-write for high-risk work (dependency adds/removes/upgrades, schema-breaking changes, deletion of tracked files, anything that affects deployments), commit hygiene matches Jaycob's house style.
- Merging `development` into `master` triggers production deploy; that is always the user's call.

### Agent-state file

Live state for the `recivis` agent lives at `<runtime-state-root>/agent-states/recivis.md` (default `%USERPROFILE%/.csa-orchestrator/agent-states/recivis.md`). Agents read it on startup, update it at every milestone, and append session-end notes for the next session to resume from.

### Security rulesets that apply

- Standard web-app security hygiene (no specific binding ruleset for Next.js / React in `claude-agents/security/` yet).
- For any PowerShell tooling added to this repo (deploy scripts, local helpers): the PS rules apply -- `Joshuaboak/claude-agents/security/powershell-modern-rules.md` and `powershell-bitdefender-rules.md`.

### Durable logging discipline

For any non-trivial session: maintain a TaskList (`TaskCreate`/`TaskUpdate`), append to a session log under `<runtime-state-root>/planning/sessions/YYYY-MM-DD-<topic>.md`, and update the agent-state file at every milestone with ISO timestamps.

### Launcher

```powershell
pwsh -NoProfile -File "C:\Users\<user>\source\repos\Civil-Survey-Solutions\SYS-DEV-CSAOrchestrator\scripts\Launch-Agent.ps1" -Agent recivis -NewWindow
```

The launcher checks out the right working directory, themes the wt tab as an Agent tier (green), registers the window in the tiling layout, and hands `claude` the standard agent-startup prompt with `recivis`-specific placeholders resolved.
