# Partner Portal (`recivis`) — Current State

**Snapshot taken:** 2026-08-12
**Against commit:** `211834f` on `master` (local and `origin/master` aligned; `origin/development` is 5 commits behind at `7865247`)
**Local path:** `C:\Users\JoshuaBoak\Desktop\Claude Master\Projects\Partner Portal`
**Origin:** `https://github.com/Joshuaboak/recivis.git`
**Live:** `https://recivis-production.up.railway.app` (Railway project `reasonable-celebration`) — running `211834f`

This document is a functional survey of the codebase, written to be read at the start of a future session instead of re-reading 28,141 lines. It was produced by parallel agents, each reading one disjoint slice of the repo in full, plus a live read of the Railway deployment.

**Revision note.** The first pass was taken against `0f84c28`, then refreshed against `7865247`. Five further commits have landed — `24b19d7` (Zoho MCP path variables), `fd51770` (SPA view-switching replaced with real App Router routing), `35abf9d` (unsaved-work protection), `d9c4efb` (coupon edit route), `211834f` (edit routes for every record, plus the self-aborting list fetches) — and this revision brings the document to `211834f`. Sections 0, 2, 8, 9, 10 and 11 were re-analysed against the new HEAD; §1 gained a subsection on what the routing migration added and had its staleness table re-checked; §12 is **new** (the unsaved-work system), which pushed the old §12 and §13 to **§13** and **§14**. Sections 3–7 carry dated update notes where these commits touched them.

**Two things to hold in mind while reading.** First, the routing migration invalidated the single largest structural claim in every previous revision of this document: there is now a real router. Anything you remember about `currentView` is gone. Second, of the work in these five commits, only login has been exercised against production. The edit forms and the whole unsaved-work system are verified by `tsc --noEmit`, `next build` and inspection — **not** by anyone using them. Treat §12 and the edit routes in §8–§10 as "built and shipped, not yet proven".

Scope note: this is a **functionality** audit. Security weaknesses are recorded where they were unavoidable to describe behaviour (missing authorisation, unvalidated bodies), but they were not hunted for and are not prioritised. That is deliberate and deferred.

---

## 0. Executive summary

### What the product is

A partner/reseller portal for **Civil Survey Applications**. Resellers log in and manage their own book of business: accounts, leads, orders (invoices), coupons, software assets and licence keys, plus reports and an AI assistant. Internal admins see everything and additionally manage resellers, users and permissions. npm package name is `recivis`; the UI brands itself "Partner Portal".

### Architecture in one pass

- **Next.js 16.1.6** (exact pin), App Router with **real route segments** since `fd51770`, React, Tailwind, TypeScript, Zustand for the little client state that is left, Framer Motion for transitions, Vitest 4.1.0 for tests.
- **URLs are the navigation model.** 24 portal routes under a `(portal)` route group plus `/login`, all declared once in `src/lib/routes.ts`; `src/middleware.ts` is a cookie-presence gate at the edge; `(portal)/layout.tsx` is the authenticated shell. Deep links, browser Back/Forward and refresh-to-current-page all work.
- **Zoho CRM is the system of record** for business data — accounts, contacts, leads, invoices, coupons, assets. Reached through a Zoho MCP endpoint (`ZOHO_MCP_URL` + `ZOHO_API_KEY`), not a classic OAuth SDK.
- **A large amount of business logic lives inside Zoho as Deluge functions**, not in this repo. Renewal invoice generation (`generaterenewalinvoicesforassets`), licence-key operations against QLM (`qlminterfaceloadkeydetails`, `qlminterfacereleaselicense`) and key emails (`sendkeyemail`) are all Zoho-side. The Next.js routes are thin callers that extract an id from the Deluge output. **Reading this repo alone will not tell you what those functions do.**
- **PostgreSQL** holds what Zoho doesn't: portal users, password hashes, sessions/reset tokens, reseller records and per-reseller payment-method flags.
- **Redis** is provisioned and wired via `REDIS_URL`.
- **AI** is OpenRouter (`OPENROUTER_API_KEY`) driving a tool-calling assistant that can read and create portal data.
- **Email** is Gmail API via a Google service account (`GOOGLE_SERVICE_ACCOUNT_KEY`, `GMAIL_SENDER`, `GMAIL_BCC`).

### The eleven things worth knowing before touching anything

1. **The router is real now — forget everything about `currentView`.** `fd51770` replaced SPA view-switching with 24 App Router segments under `src/app/(portal)/` plus `src/app/login/page.tsx`. `src/lib/routes.ts` is the single source of truth (a 24-entry `ROUTES` table plus `matchRoute`/`getRouteTitle`/`getRouteId`/`buildPath`) and nothing else may hardcode a portal path. `src/middleware.ts` bounces cookie-less browsers to `/login?next=…`. `AppShell.tsx` and `src/app/page.tsx` were **deleted**. Zustand `persist` is gone with them — it, not any `window` access, was why the app had needed `ssr:false`; `user` now rehydrates from `GET /api/auth`, and `store.ts` is down from 149 lines to 93 holding only `user`, `messages`, `sidebarOpen`, `newInvoiceContext`, `isLoading`, `pendingPOFile`. See §11.

2. **Because Back works, Back can now destroy work — and the App Router cannot stop it.** `popstate` fires after the history entry has already changed, and the sentinel-history workaround was rejected on purpose. So `35abf9d` split protection in two: create views **persist** to localStorage (`useDraft`, 24h TTL, never rehydrated silently) and detail/edit surfaces **guard** (`UnsavedChangesProvider` + `useGuardedRouter` + `GuardedLink`). The accepted limit is stated plainly: **browser Back on a guarded surface still loses that batch edit** — a line-item set, an address block. §12 documents the whole system, its API, and which surface gets which treatment.

3. **Coupon usage caps are not enforced.** Nothing in the app decrements `Remaining_Uses`; verified against live data — of six coupons, none has `Remaining < Total` and five have no allowance at all — so the `<= 0` rejection in `POST /api/coupons/validate` **cannot currently trigger**. `d9c4efb` stopped the full-form coupon save rewriting `Remaining_Uses` to equal `Total_Usage_Allowance` on every save (it is now re-seeded only when the allowance itself changes). That fixes a counter-reset bug; it is **not** the same as enforcing the cap. Enforcement means decrementing at payment, Zoho-side where it can be atomic, and is explicitly out of scope so far. See §6, §9.

4. **Write routes still report success without checking the result.** `POST /api/invoices`, `PATCH /api/assets`, `POST /api/renewals`, `POST /api/send-keys` and part of `POST /api/coupons` return `success: true` without inspecting the Zoho/Deluge response code. Several GETs return `200` with `null` or `[]` where `404`/`500` belongs. There is a client-side instance too: `ResellerManagementView`'s `saveReseller` awaits its PATCH and never reads `res.ok` (`ResellerManagementView.tsx:740-742`), then reloads and navigates as though it worked. Treat green UI as unproven. See §6. *(One prior instance is gone: `Currency` is no longer silently dropped from an invoice PATCH — see 5.)*

5. **Currency on an order is editable again, deliberately.** `211834f` restored `Currency` to the `PATCH /api/invoices/[id]` allow-list (`src/app/api/invoices/[id]/route.ts:106-111`), reversing `dab7c76`. The reasoning is recorded in the commit and in the route comment: currency is *seeded* from the Reseller record at creation but an order can legitimately be raised in another currency, and the previous behaviour — accept the field, drop it, return success — was the worst of the three options. Note what this does **not** do: line-item amounts are not converted when the currency changes (`InvoiceDetailView.tsx:426-429` says so). `updateInvoiceSchema` in `src/lib/validation.ts` is still dead code with no route importing it, and `validation.test.ts` still asserts a currency update is accepted — that assertion now happens to agree with the route, by coincidence rather than by coupling. See §6, §9, §13.

6. **Every record now has two editing mechanisms, from one field list.** Each of the five detail views serves both `/<record>/[id]` and `/<record>/[id]/edit` from one component off a `mode: 'view' | 'edit'` prop, so edit state lives in the URL and survives refresh, links and Back. Inline per-field editing (`InlineEditField`) remains on the view route. The full form's field list and permission gates are **derived from what the inline fields already declared** — `LeadDetailView.tsx:91-105` is the clearest example, an explicit `LEAD_FIELDS` table carrying the same `gate` as the inline field — so the two cannot drift, and fields outside a route's PATCH allow-list are rendered read-only rather than offered as inputs. See §8, §9, §10.

7. **The Invoices → Orders rename is still only partly done.** The UI says Order and the **URLs** now say `/orders` too, while components, types, API routes and Zoho modules still say Invoice: `/orders/[id]` renders `InvoiceDetailView` and PATCHes `/api/invoices/[id]`. That split is deliberate and documented in the route files themselves. It also still leaks into data — `CreateInvoiceView` writes `Subject = "{account} - Order - {date}"` into the Zoho record. §9 carries a table of where the vocabulary splits; read it before grepping for either word.

8. **Payments have no server-side listener.** Stripe payment links are produced Zoho-side; there is no Stripe SDK, no Stripe key among the 10 variables on the deployed service, and **no webhook**. `Payment_Status` changes are noticed only by a 5-second browser poll that dies with the tab. Post-payment licence-key delivery fires inside Zoho — the portal's success popup only claims it happened. See §6, §9, §14.

9. **Test coverage is 3 files / 33 tests over 28,141 lines.** The suite is green (`3 passed`, `33 passed`) but imports exactly three source modules — `cache.ts` (75), `constants.ts` (88), `validation.ts` (70) — **233 lines of 28,141, or 0.83%**, across 3 of 133 files. No API route tests, no component tests (the config is `environment: 'node'` with no `setupFiles`, so it physically cannot render one), no integration tests against Zoho, Postgres, Stripe or QLM. Nothing in the last five commits is covered: not the routing migration, not the middleware, not `routes.ts`, not the unsaved-work system, not one of the five edit forms. The lint baseline is **33 errors / 56 warnings** and predates this work. See §13.

10. **Almost none of the recent work has been exercised at runtime.** Login *is* confirmed working in production since the routing migration. Everything else in `35abf9d`, `d9c4efb` and `211834f` — five edit forms, the draft persistence, the discard modal, the guarded links — was verified by `tsc --noEmit`, `next build` and code inspection only. `35abf9d` also records that the two agents implementing the persist and guard slices were killed mid-run by a spend limit and filed no reports, so their work was reviewed by inspection rather than by their own account. Expect to find runtime defects here; they have not been looked for.

11. **Dead and half-built code persists, and the new work added one orphan.** `src/lib/useBeforeUnload.ts` (30 lines) has **zero callers** — the hard-exit warning it implements is not actually wired up anywhere, so refresh and tab-close do not prompt. Still present from before: `SKUBuilder` fires `fetch('/api/invoices')` on mount and discards the result, its `version` state is never set so the SKU version is the literal `'26'` (duplicated in `CreateEvaluationModal`), and `buildSKU()` has zero callers; `InvoiceHeader`'s **Approve** and **Send Order** buttons have no `onClick`; `UserMenu`'s `AddUserModal` is unreachable; Dashboard's six "Learn more" buttons are empty handlers; `/api/logs` has no UI caller and no admin gate; `/api/reports` accepts a `region` param that only varies the cache key. Contact search results and evaluation notifications still have no destination — now because their href builders return `null` (`SearchModal.tsx:33-48`, `NotificationBell.tsx:26-37`). See §6, §7, §8, §9, §11, §12.

### How to use this document

| If you're about to… | Read |
|---|---|
| Set up, build or deploy | §1, §14 |
| Add or change a route, or work out what URL something lives at | §11.1, §1.10 |
| Touch auth, sessions, roles or permissions | §2, §4 |
| Touch Zoho, Postgres schema, AI tools or exports | §3 |
| Change an API endpoint | §4 (identity), §5 (CRM), §6 (commerce), §7 (support) |
| Change a screen | §8 (dashboard/accounts/leads), §9 (orders/coupons), §10 (partners/login/reports) |
| Add or change an edit form | §8–§10 for the view, §12 for the dirty-tracking contract |
| Use or extend inline editing | §11.2 (`InlineEditField` API reference) |
| Touch anything that can hold unsaved user input | §12 — read it before writing a form |
| Add navigation, the shell, or a shared component | §11 |
| Add tests, or find out what changed recently | §13 |
| Work on the deployment | §14 |

Every section carries `file:line` references, accurate as of `211834f`. Re-verify after pulling.

---


---

## 1. Stack, Tooling and Deploy Configuration

Repo root: `C:\Users\JoshuaBoak\Desktop\Claude Master\Projects\Partner Portal`. HEAD = `211834f`. Package name is `recivis`, version `0.1.0`, `private: true`. Nothing in `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `vitest.config.ts`, `Dockerfile`, `railway.toml` or `.env.example` changed between `7865247` and `211834f` — §1.1 through §1.8 are unchanged and were re-verified rather than rewritten. What did change is the shape of `src/`, which is §1.10.

### 1.1 Framework, language, styling

| Item | Value | Source |
|---|---|---|
| Framework | Next.js `16.1.6` (App Router) | `package.json:20` |
| React | `19.2.3` / `react-dom` `19.2.3` | `package.json:22-23` |
| Build output | `output: "standalone"` — the only setting in the Next config | `next.config.ts:3-5` |
| TypeScript | `^5`, `strict: true`, `noEmit: true`, `target: ES2017`, `module: esnext`, `moduleResolution: bundler`, `isolatedModules: true`, `jsx: react-jsx`, `incremental: true`, `skipLibCheck: true`, `allowJs: true` | `tsconfig.json:2-24` |
| Path alias | `@/*` → `./src/*` (mirrored in Vitest) | `tsconfig.json:21-23`, `vitest.config.ts:9-13` |
| Styling | Tailwind CSS `^4` via `@tailwindcss/postcss` — PostCSS config contains that single plugin and nothing else | `postcss.config.mjs:1-7` |
| Animation | `framer-motion` `^12.36.0` | `package.json:15` |
| Lint | ESLint `^9` flat config: `eslint-config-next/core-web-vitals` + `eslint-config-next/typescript`, then a `globalIgnores` block re-declaring the eslint-config-next defaults (`.next/**`, `out/**`, `build/**`, `next-env.d.ts`) | `eslint.config.mjs:1-18` |
| Test | Vitest `^4.1.0`, `environment: 'node'`, `globals: true` | `vitest.config.ts:4-8` |

Turbopack note: `CLAUDE.md:16` and `README.md:58` both describe dev as "Turbopack", but `package.json:6` is a bare `next dev` with no `--turbopack` flag — Next 16 uses Turbopack for dev by default, so the docs are describing the default rather than an explicit flag.

### 1.2 Runtime dependencies, grouped by purpose

| Purpose | Package | Version |
|---|---|---|
| Framework / UI | `next` | `16.1.6` |
| | `react` | `19.2.3` |
| | `react-dom` | `19.2.3` |
| | `framer-motion` | `^12.36.0` |
| | `lucide-react` | `^0.577.0` |
| Client state | `zustand` | `^5.0.12` |
| Data stores | `pg` (PostgreSQL) | `^8.20.0` |
| | `ioredis` (Redis) | `^5.10.0` |
| Auth | `bcryptjs` (password hashing) | `^3.0.3` |
| | `jsonwebtoken` (JWT) | `^9.0.3` |
| Google / email | `googleapis` (Gmail send) | `^171.4.0` |
| Validation | `zod` | `^4.3.6` |
| Export | `xlsx` (SheetJS) | `^0.18.5` |

Dev dependencies: `@tailwindcss/postcss` `^4`, `tailwindcss` `^4`, `typescript` `^5`, `eslint` `^9`, `eslint-config-next` `16.1.6`, `vitest` `^4.1.0`, `@testing-library/react` `^16.3.2`, `@testing-library/jest-dom` `^6.9.1`, and `@types/*` for `bcryptjs` `^2.4.6`, `jsonwebtoken` `^9.0.10`, `node` `^20`, `pg` `^8.18.0`, `react` `^19`, `react-dom` `^19`.

Note: `@testing-library/react` and `jest-dom` are installed but `vitest.config.ts` sets `environment: 'node'` with no jsdom/happy-dom dependency and no `setupFiles` — as configured, DOM-rendering tests cannot run.

### 1.3 npm scripts (complete — `package.json:5-12`)

| Script | Command | Notes |
|---|---|---|
| `dev` | `next dev` | Dev server (Turbopack by default in Next 16) |
| `build` | `next build` | Emits `.next/standalone` because of `output: "standalone"` |
| `start` | `next start` | Production server |
| `lint` | `eslint` | Bare invocation; picks up `eslint.config.mjs` |
| `test` | `vitest run` | Single pass |
| `test:watch` | `vitest` | Watch mode |

There is no `typecheck` script — `tsc --noEmit` is only reachable via `next build`.

### 1.4 Build and deploy configuration — and what actually governs production

Two files in the repo declare a build, **and the live Railway service is configured for the RAILPACK builder, so neither is necessarily governing the running deployment.**

**`railway.toml`** (9 lines) declares:
- `[build] builder = "DOCKERFILE"`, `dockerfilePath = "Dockerfile"`
- `[deploy] healthcheckPath = "/"`, `healthcheckTimeout = 30`, `restartPolicyType = "ON_FAILURE"`, `restartPolicyMaxRetries = 3`

Because the service is set to RAILPACK, the `[build]` half of this file is contradicted by the live service configuration. Treat `railway.toml`'s builder declaration as aspirational/stale, not as a description of production. (The `[deploy]` half — healthcheck and restart policy — is builder-independent and may still apply, but that should be confirmed against the service settings rather than assumed from this file.)

**`Dockerfile`** (37 lines) — a three-stage `node:20-alpine` build:
- `deps`: `npm ci --only=production`
- `builder`: `npm ci` then `npm run build`
- `runner`: `NODE_ENV=production`, `NEXT_TELEMETRY_DISABLED=1`, creates `nodejs`/`nextjs` (gid/uid 1001), copies `public`, `.next/standalone`, `.next/static`, runs as `nextjs`, `EXPOSE 3000`, `PORT=3000`, `HOSTNAME="0.0.0.0"`, `CMD ["node", "server.js"]`

Under RAILPACK this Dockerfile is not built. Consequences to keep in mind when reasoning about production:
- The `ENV NODE_ENV=production` line does **not** apply. In practice `next start` sets `NODE_ENV=production` in its own process, which is what `getJwtSecret()` keys off (see section 2) — but the guarantee comes from Next, not from this Dockerfile.
- The `deps` stage runs `npm ci --only=production` and its output is never copied into `runner`, so that stage is dead even under a Docker build.
- The non-root `nextjs` user, the standalone-copy layout, and `NEXT_TELEMETRY_DISABLED` are all Dockerfile-only guarantees that do not carry over to Railpack.

`next.config.ts`'s `output: "standalone"` was chosen for the Dockerfile's `.next/standalone` copy. Railpack does not need it, but it is harmless.

Deploy trigger, per `CLAUDE.md:49-51` and `README.md:171-180`: Railway auto-deploys on push to `master`; production URL `https://recivis-production.up.railway.app`. `CLAUDE.md:70-74` adds that `development` is the agent working branch and that merging `development` → `master` (i.e. triggering a production deploy) is always the user's call.

### 1.5 Environment variable contract

`.env.example` is **new in this merge** (commit `83f5017`, "Checked in an .env.example for the 11 required / optional env vars"). It declares 10 live variables plus one commented-out entry (`NODE_ENV`), which is where the "11" comes from. Header comments: copy to `.env.local`, never commit `.env.local`, secrets belong in Railway for production.

| Variable | `.env.example` section | Purpose (per file comments) | Set in production? |
|---|---|---|---|
| `DATABASE_URL` | Required | PostgreSQL connection string. Local dev against Railway Postgres must use the **public** hostname — the Railway-internal one only resolves inside the Railway network (`.env.example:7-10`) | Yes |
| `ZOHO_MCP_URL` | Required | Zoho MCP endpoint; embeds an API key that rotates periodically, pulled from the operator's password store (`.env.example:12-14`) | Yes |
| `ZOHO_API_KEY` | Required | Zoho REST `zapikey` for Deluge calls — lead conversion, renewal generation, coupon writes, password resets (`.env.example:16-18`) | Yes |
| `JWT_SECRET` | Required | JWT signing secret. Comment states `getJwtSecret()` fails loudly in production if unset; dev falls back to a placeholder (`.env.example:20-22`) | Yes |
| `OPENROUTER_API_KEY` | Required | OpenRouter key for AI chat + file-parsing endpoints (`.env.example:24-25`) | Yes |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Required | Google service-account JSON for the Gmail send flow; raw JSON or base64 (`.env.example:27-29`) | Yes |
| `GMAIL_SENDER` | Required | Primary `From:` address for Gmail sends (`.env.example:31-32`) | Yes |
| `GMAIL_BCC` | Required | Audit BCC — every outbound email is BCC'd here (`.env.example:34-35`) | Yes |
| `NEXT_PUBLIC_APP_URL` | Required | Public base URL for generated email links (password reset etc.); in production this is the Railway deploy URL (`.env.example:37-39`) | Yes |
| `REDIS_URL` | **Optional** | Redis cache. App starts cleanly without it — the cache layer returns nulls when Redis is unreachable (`.env.example:43-45`) | Yes |
| `NODE_ENV` | Optional, **commented out** | Toggles SSL `rejectUnauthorized` on the pg pool and other prod-only safeguards. Next.js sets it automatically for build/start; leave unset locally (`.env.example:47-50`) | Not in the 10-var list |

**Cross-check against the 10 variables set on the deployed service** (`DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `ZOHO_API_KEY`, `ZOHO_MCP_URL`, `OPENROUTER_API_KEY`, `GOOGLE_SERVICE_ACCOUNT_KEY`, `GMAIL_SENDER`, `GMAIL_BCC`, `NEXT_PUBLIC_APP_URL`):

- **Declared in `.env.example` but NOT set in production:** none of the 10 live entries. The only unmatched entry is `NODE_ENV`, which `.env.example` ships commented out by design; under RAILPACK it is not set by the (unused) Dockerfile, so production relies on `next start` setting `NODE_ENV=production` itself. Since `JWT_SECRET` *is* set in production, the `getJwtSecret()` production guard is not load-bearing today — but it would silently degrade to the dev fallback if `JWT_SECRET` were ever removed *and* `NODE_ENV` were not `production` at runtime.
- **Set in production but omitted from `.env.example`:** none.
- The one genuine mismatch of *classification*: `REDIS_URL` sits under "Optional" in `.env.example` but is provisioned in production. Not a defect — just means the documented "app works without Redis" path is not the deployed path.

Net: the `.env.example` contract and the deployed variable set are in exact agreement across all 10 live variables. This is the first commit at which such a check is even possible.

### 1.6 `CLAUDE.md` — what it instructs agents to do in this repo

`CLAUDE.md` is **new in this merge** (95 lines; scaffolded in `4394d52`, "Adopted the Orchestrator agent-controlled posture and scaffolded the recivis CLAUDE.md"). It matters for every future session in this repo. Contents:

- **Pointers** (`:5-6`): organisational context lives in `../claude-agents/`; full architecture in `PROJECT_CONTEXT.md`.
- **Project overview** (`:10`): ReCivis is the CSA partner portal; resellers manage invoices, accounts, contacts, licences, assets, leads, coupons; all business data via Zoho CRM `.com.au`.
- **Build & run + architecture summary** (`:12-47`): the six npm scripts; Next 16 / React 19 / TS 5 / Tailwind 4 / Framer Motion; Postgres for auth, RBAC, audit log; Redis optional; Zoho via MCP *and* REST (Deluge via API key) for advanced ops; Zustand with localStorage persistence; the `src/{app,components,lib,__tests__}` layout; 5-tier user roles (Admin, IBM, Manager, Standard, Viewer) and 4 reseller role caps (internal, distributor, reseller, restricted) with per-reseller overrides.
- **Environment minimum** (`:53-58`): `DATABASE_URL`, `ZOHO_MCP_URL`, `ZOHO_API_KEY` in `.env.local`.
- **Critical notes** (`:60-64`): no Zoho sandbox — local dev reads/writes **production** CRM data; Zoho endpoints are always `.com.au`, never `.com`; MCP tool names are camelCase (`ZohoCRM_searchRecords`, not `ZohoCRM_Search_Records`).
- **Orchestrator integration, dated 2026-04-19** (`:66-95`) — the operationally binding part:
  - The repo is part of the `SYS-DEV-CSAOrchestrator` agent toolkit; sessions run as the `recivis` agent.
  - **Branch/push policy**: `master` is production and auto-deploys to Railway; **pushes to master are an explicit user-only decision — no agent, including the orchestrator, pushes to master without ack.** `development` is the agent working branch where autonomous commits and pushes are allowed under a Code Change Policy extension granted 2026-04-19. Guardrails: no force ops; propose-before-write for high-risk work (dependency add/remove/upgrade, schema-breaking changes, deleting tracked files, anything affecting deployments); commit hygiene matches Jaycob's house style. Merging `development` → `master` is always the user's call.
  - **Agent-state file**: live state at `<runtime-state-root>/agent-states/recivis.md` (default `%USERPROFILE%/.csa-orchestrator/agent-states/recivis.md`) — read on startup, updated at every milestone, session-end notes appended.
  - **Security rulesets**: standard web-app hygiene (no binding Next/React ruleset in `claude-agents/security/` yet); any PowerShell tooling added here is bound by `Joshuaboak/claude-agents/security/powershell-modern-rules.md` and `powershell-bitdefender-rules.md`.
  - **Durable logging discipline**: for any non-trivial session — maintain a TaskList (`TaskCreate`/`TaskUpdate`), append to `<runtime-state-root>/planning/sessions/YYYY-MM-DD-<topic>.md`, update the agent-state file at every milestone with ISO timestamps.
  - **Launcher**: `pwsh -NoProfile -File "...\SYS-DEV-CSAOrchestrator\scripts\Launch-Agent.ps1" -Agent recivis -NewWindow` — checks out the working directory, themes the terminal tab green (Agent tier), registers the window in the tiling layout, and hands `claude` the standard agent-startup prompt.

The commit-message style visible across the 17 merged commits (past-tense imperative subject, e.g. "Refused the dev JWT fallback when NODE_ENV is production", plus a why-focused body) is the "Jaycob's house style" that `CLAUDE.md:73` refers to.

### 1.7 `.gitignore` — the new agent-scratch block

`.gitignore` is 72 lines. Lines 1-53 are the standard Next.js template plus project-specific entries: `.env*` with a `!.env.example` un-ignore (line 34-35, which is what lets the new `.env.example` be tracked), `.mcp-tokens.json`, `.recivis-logs.json`, `next-env.d.ts`, and Claude Code per-user runtime artefacts (`.claude/settings.local.json`, `.claude/*.local.json`, `.claude/scheduled_tasks.lock`).

Lines 55-72 were added by `7865247`, headed `# --- Agent scratch markers (Phase 2 sweep 2026-04-25) ---`. The stated rationale: transient files agents drop during long-running work — phase-ready markers, propose/implementation/review sentinels, runtime-launch helpers — are not part of any build, test, or release artefact, and are ignored at repo level so they stop cluttering `git status` on every session, consistently across the CSA repo fleet. Patterns covered:

`.PHASE-*`, `.PROPOSAL-*`, `.IMPLEMENTATION-*`, `.DESIGN-*`, `.REVIEW-*`, `.RUNTIME-*`, `.SESSION-*`, `.SCOPE-*`, `.ALL-*`, `.REVISED`, `.ZITADEL-*`, `.tmp-*.ps1`, `.tmp-*.txt`

All are dot-prefixed and repo-root-anchored by convention only (no leading `/`), so they match at any depth.

### 1.8 New documents recorded but out of scope

Two files arrived in this merge and are noted here for existence only — their contents and recommendations are deliberately not summarised, because the current owner has decided **not** to follow this prior contributor's review and plan:

| File | Size | Nature |
|---|---|---|
| `docs/codebase-review-2026-04-19.md` | 30,877 bytes | Prior contributor's codebase review (landed in `88a684f`, "Documented the codebase review + carry-over handoff") |
| `planning/development-plan-2026-04-19.md` | 15,630 bytes | Prior contributor's continued-development plan (landed in `29af1b1`, "Landed the post-consolidation continued-development plan") |

Do not treat either as a live roadmap.

### 1.9 Are README.md and PROJECT_CONTEXT.md stale relative to the merged code?

**Yes — both.** `PROJECT_CONTEXT.md` carries `**Last updated: 2026-03-22**` (`PROJECT_CONTEXT.md:6`), which predates every commit in this merge (2026-04-19 → 2026-04-25). `README.md` carries no date but is stale on the same axes.

Concrete divergences:

| Claim | Where | Now |
|---|---|---|
| `JWT_SECRET` is **Optional**, default `recivis-dev-secret-change-in-production` | `PROJECT_CONTEXT.md:118` | False in production. `1c8e9f0` makes `getJwtSecret()` throw when `NODE_ENV=production` and the var is unset. `.env.example` correctly lists it as Required. |
| `JWT_SECRET` under "# Optional" in the sample env block | `README.md:97-98` | Same problem. |
| `GMAIL_BCC` | Absent from both | Declared Required in `.env.example:35` and set in production. |
| Env var tables generally | `PROJECT_CONTEXT.md:104-124`, `README.md:91-103` | Both predate `.env.example`; neither mentions the file exists. `.env.example` is now the authoritative contract. |
| `GMAIL_SENDER` default `auth@civilsurveyapplications.com.au` | `PROJECT_CONTEXT.md:123` | `.env.example` gives no default — it is Required. |
| Local path `C:\Users\JoshuaBoak\Desktop\recivis` | `PROJECT_CONTEXT.md:14` | Repo now lives at `...\Desktop\Claude Master\Projects\Partner Portal`. |
| Branch: `master` (single-branch model) | `PROJECT_CONTEXT.md:16` | `CLAUDE.md:70-74` establishes `development` as the agent working branch with a master push embargo. Neither README nor PROJECT_CONTEXT mentions `development` or `CLAUDE.md`. |
| Deployment "Railway (Docker)" / Dockerfile-driven | `README.md:69`, `railway.toml:2` | Live service is on **RAILPACK**; the Docker path is not what builds production. |
| "Invoices" terminology throughout | `README.md:18-27`, `PROJECT_CONTEXT.md` passim | `dab7c76` completed an Invoices → **Orders** visual rename. `export-lists.ts` now writes an `Orders` sheet and `Orders Export - ....xlsx` (`src/lib/export-lists.ts:241-244`) while the docs still say Invoices. Internals (Zoho module, route names) are still `Invoices`, so the split is UI-vs-internal and the docs describe neither cleanly. |
| "24 API route files" | `README.md:156` | 33 `route.ts` files under `src/app/api`. |
| "15 page-level components" | `README.md:158` | 19 files in `src/components/views`. |
| "5 InvoiceDetail sub-components" | `README.md:160` | 7 files in `src/components/invoice`. |
| "16 utility modules" | `README.md:162` | **Now 20** in `src/lib` — `routes.ts`, `useDraft.ts`, `useGuardedRouter.ts`, `useBeforeUnload.ts` were added by `fd51770`/`35abf9d`. (This row read "still 16 — accurate" at the previous revision.) |
| "Zustand for client state with localStorage persistence" | `CLAUDE.md:41`, `PROJECT_CONTEXT.md` passim | **False since `fd51770`.** `persist` was removed; the `recivis-token` cookie is the only session and `user` rehydrates from `GET /api/auth`. The one deliberate storage use left is the chat transcript in **session**Storage plus `useDraft`'s form drafts in localStorage — see §12. `CLAUDE.md` is otherwise the accurate meta-document; this line is now its one wrong claim. |
| Single-route SPA, no routing | both, passim | **False since `fd51770`.** 24 portal route segments plus `/login`, a `(portal)` route group and `src/middleware.ts`. See §11.1. |
| "33 tests" across 3 files | `README.md:163,187`, `PROJECT_CONTEXT.md:538` | 3 test files still, count not re-verified here. |
| File-structure listing | `PROJECT_CONTEXT.md:345-447` | Omits `InlineEditField.tsx` (added `757552f`), `CreateEvaluationModal` (touched `cc46146`), and the new root/`docs`/`planning` files (`CLAUDE.md`, `.env.example`, `docs/`, `planning/`). |
| Detail views described as modal/form editing | `PROJECT_CONTEXT.md:386-404` | `b6efc75` migrated five detail views to **inline per-field editing** via the new `InlineEditField` component. |

`CLAUDE.md` is *almost* the one accurate meta-document at HEAD — the localStorage-persistence line above is now wrong, and it points readers at `PROJECT_CONTEXT.md` (`CLAUDE.md:6`) for "full architecture details", i.e. it forwards to a stale file. `CLAUDE.md:55-58` also states a 3-variable environment minimum, which is a deliberate subset, not a contradiction of `.env.example`'s 10.

### 1.10 What the routing migration changed in the tree

`src/` is now **133** `.ts`/`.tsx` files and **28,141** lines (was 97 files / 24,788 at `7865247`). Almost all of the growth is the route segments, the unsaved-work primitives, and five edit forms.

**Deleted.** `src/components/layout/AppShell.tsx` (234 lines) and `src/app/page.tsx`. Nothing replaced `AppShell` one-for-one: its responsibilities were split between `(portal)/layout.tsx` (shell, header, session rehydrate, Ctrl+K), `(portal)/template.tsx` (the per-route fade that used to be an `AnimatePresence` crossfade), `(portal)/loading.tsx` + `BrandSplash.tsx` (the splash), `SessionExpiryWatcher.tsx` (the 401 fetch interceptor) and `Sidebar.tsx` (active state, now derived from `usePathname()`).

**Added — infrastructure.**

| File | Lines | What it is |
|---|---|---|
| `src/lib/routes.ts` | 119 | The URL table and its helpers. Single source of truth. See §11.1. |
| `src/middleware.ts` | 49 | Edge cookie-presence gate. See §11.1. |
| `src/app/(portal)/layout.tsx` | 107 | The authenticated shell. |
| `src/app/(portal)/template.tsx` | 25 | 150 ms per-route mount fade. |
| `src/app/(portal)/loading.tsx` | 5 | Renders `BrandSplash`. |
| `src/app/login/page.tsx` | 71 | Login screen, outside the `(portal)` group. |
| `src/components/layout/BrandSplash.tsx` | 23 | Full-screen brand mark (lifted out of the old `page.tsx`). |
| `src/components/layout/SessionExpiryWatcher.tsx` | 50 | Wraps `window.fetch`, watches for 401 on `/api/`. |
| `src/components/UnsavedChangesProvider.tsx` | 258 | Dirty registry + discard modal. §12. |
| `src/components/GuardedLink.tsx` | 67 | `next/link` that asks first. §12. |
| `src/components/DraftRestoreBar.tsx` | 93 | The restore prompt. §12. |
| `src/lib/useDraft.ts` | 196 | Debounced localStorage drafts. §12. |
| `src/lib/useGuardedRouter.ts` | 50 | `useRouter` that asks first. §12. |
| `src/lib/useBeforeUnload.ts` | 30 | Hard-exit warning. **Zero callers.** §12. |

**Added — 24 route segments plus `/login`.** Every page file is 5–32 lines: a `Metadata` export whose title comes from `getRouteTitle(...)`, an `await params` / `await searchParams` unwrap where needed, and one view component. They hold no logic. The complete mapping of URL → component lives in §11.1; the file layout mirrors it exactly:

```
src/app/(portal)/
  dashboard/page.tsx                    leads/page.tsx
  leads/new/page.tsx                    leads/[id]/page.tsx
  leads/[id]/edit/page.tsx              accounts/page.tsx
  accounts/new/page.tsx                 accounts/[id]/page.tsx
  accounts/[id]/edit/page.tsx           orders/page.tsx
  orders/new/page.tsx                   orders/[id]/page.tsx
  orders/[id]/edit/page.tsx             order-assistant/page.tsx
  coupons/page.tsx                      coupons/new/page.tsx
  coupons/[id]/page.tsx                 coupons/[id]/edit/page.tsx
  reports/page.tsx                      reports/dashboard/page.tsx
  partners/page.tsx                     partners/[id]/page.tsx
  partners/[id]/edit/page.tsx           partner-resources/page.tsx
  layout.tsx  template.tsx  loading.tsx
src/app/login/page.tsx
```

`src/app/layout.tsx` (25 lines) is still a bare `<html lang="en"><body>` with the app-level `Metadata` — title "Partner Portal — Civil Survey Applications", plus a `/favicon.svg` icon declaration. There is still no `error.tsx` and no `not-found.tsx` anywhere.

**Build shape.** `fd51770` records `npm run build` producing "20 routes, 45/45 static pages"; `211834f` records the five edit routes present in the manifest. One route is no longer static: `/accounts` reads `?notice=` as a server prop, so it is server-rendered on demand.


---

## 2. Core Library Layer

Repo root: `C:\Users\JoshuaBoak\Desktop\Claude Master\Projects\Partner Portal`. All paths below are relative to `src/`. Product name in code is **ReCivis**. Files covered, with line counts at `211834f`: `lib/auth.ts` (482), `lib/api-auth.ts` (191), `lib/api-response.ts` (20), `lib/env.ts` (27), `lib/logger.ts` (145), `lib/constants.ts` (88), `lib/cache.ts` (75), `lib/validation.ts` (70), `lib/types.ts` (189), `lib/store.ts` (93).

**Update 2026-08-12.** Two things in this layer moved. `auth.ts` grew from 445 to 482 lines when `fd51770` extracted the user projection so that `GET /api/auth` returns the same `User` shape as `POST` (§2.2), and `store.ts` **shrank from 150 lines to 93** when the same commit deleted the navigation state and Zustand `persist` (§2.5 — rewritten, not annotated). Every line reference in §2.2 has shifted accordingly and has been re-verified. `src/lib/` also gained four modules that are documented elsewhere rather than here: `routes.ts` in §11.1, and `useDraft.ts` / `useGuardedRouter.ts` / `useBeforeUnload.ts` in §12.

### 2.1 Auth model overview

Stack: PostgreSQL (via `lib/db.ts`, `query`/`initDB`), bcryptjs (12 salt rounds, `SALT_ROUNDS` `auth.ts:24`), `jsonwebtoken` HS256, HTTP-only cookie named **`recivis-token`**, `googleapis` Gmail API for reset mail.

Session mechanism:
- Login: `POST /api/auth` → `authenticateUser(email, password)` (`auth.ts:105`) returns `{ token, user }`. The API route (not in this layer) sets the `recivis-token` cookie; documented in the `api-auth.ts:1-16` header comment.
- JWT payload: `{ userId, email, userRole }`, `expiresIn: '24h'` (`auth.ts:127-130`). Signed with `JWT_SECRET` env var, fallback literal `'recivis-dev-secret-change-in-production'` (`auth.ts:24`).
- No server-side session store, no refresh token, no revocation list. Logout = clearing the cookie in the route layer; nothing in this lib layer implements logout.
- **The cookie is now the only session.** `fd51770` removed the Zustand `persist` wrapper, so there is no `recivis-storage` key in `localStorage` and no client-side copy of `user` that survives a reload. `(portal)/layout.tsx:39-47` calls `GET /api/auth` once on mount and drops the result into the store; until it resolves the layout renders `<BrandSplash/>`. `GET /api/auth` (`src/app/api/auth/route.ts:29-41`) is `requireAuth` → `getUserById(userId)` → the same `User` projection `POST` returns, so permissions are recomputed from the database on every page load rather than trusted from a stale snapshot. The reason for the change was hydration, not security: `persist` rehydrated synchronously at module-eval time, so the server rendered `null` and the client rendered a user — which is what had forced the whole app behind `ssr:false`.
- 401 handling lives in `SessionExpiryWatcher.tsx:25-47`, which monkey-patches `window.fetch` and, on a 401 from a URL starting `/api/`, waits 3 s then clears the user and `router.replace`s to `/login?expired=1`. It is mounted by the portal layout only, so a failed sign-in on `/login` cannot be mistaken for an expired session.

Roles vocabulary — three tiers (`auth.ts:1-14`):
1. **`reseller_roles`** — org-level caps. Seeded values: `internal`, `distributor`, `reseller`, `restricted` (`auth.ts:254-260`).
2. **`user_roles`** — per-user caps. Seeded values: `admin`, `ibm`, `manager`, `standard`, `viewer` (`auth.ts:267-274`).
3. **Effective** = `user_role AND reseller_role`, except system admins.

`isSystemAdmin` is exactly `user_role_name === 'admin' || 'ibm'` (`auth.ts:116`, `api-auth.ts:95`, `isAdmin()` `api-auth.ts:180`). System admins bypass the intersection and get `true` for every flag plus `maxEvaluationsPerAccount: -1`.

Per-reseller overrides: `resellers.perm_*` columns (aliased `ro_*`) take precedence over `reseller_roles.can_*` (aliased `rr_*`) via `ro ?? rr ?? false` (`auth.ts:118-129`, `api-auth.ts:99-110`).

### 2.2 `lib/auth.ts` — function inventory

| Function | Line | Notes |
|---|---|---|
| `ensureDB()` (private) | 29 | Module-level `dbInitialized` boolean guards a single `initDB()` per process. |
| `createUser(email, password, name, resellerId?, userRoleId?)` | 40 | **Upsert**, not insert: `ON CONFLICT (email) DO UPDATE` overwrites `password_hash`, `name`, `reseller_id`, `user_role_id`. Email lowercased+trimmed. Returns `{ id, email }`. Called from `api/users/route.ts` and `seedAdminUsers`. |
| `USER_PROJECTION_SQL` (private const) | 72 | **New in `fd51770`.** The ~40-column `SELECT` across `users`/`user_roles`/`resellers`/`reseller_roles`, extracted so lookup-by-email and lookup-by-id cannot drift. Callers append their own `WHERE`. |
| `authenticateUser(email, password)` | 105 | `USER_PROJECTION_SQL WHERE u.email = $1`; rejects on unknown email, `!is_active`, or bcrypt mismatch (returns `null` in all three cases — no distinction). Updates `users.last_login`, then `buildUserFromRow`, then signs the JWT (`:127-130`). |
| `getUserById(userId)` | 143 | **New in `fd51770`.** `USER_PROJECTION_SQL WHERE u.id = $1 AND u.is_active = true` → `buildUserFromRow`. This is what `GET /api/auth` calls to rehydrate the client store, which is why a session refresh now picks up server-side permission changes. |
| `buildUserFromRow(row)` (private) | 156 | **New in `fd51770`.** The permission intersection (`:160-188`) and `allowedResellerIds` expansion (`:193-205`) that both lookups share. |
| `verifyToken(token)` | 237 | **Dead code** — no callers anywhere in `src/` (only its own definition). Returns a minimal `User` (`email`, `name`, `role`, `resellerId`) with **no** `permissions`, from its own hand-written query rather than `USER_PROJECTION_SQL`. `api-auth.getAuthUser()` superseded it. |
| `auditLog(userId, email, action, details?, ipAddress?)` | 264 | Inserts into `audit_log`. Called from `api/auth/route.ts`, `api/users/route.ts`, `api/users/[id]/route.ts`, and internally on reset. Action strings seen here: `password_reset_requested`, `password_reset_completed`. |
| `seedAdminUsers()` | 286 | Idempotent seed, guarded by `COUNT(*) === 0` per table. Called from `api/auth/route.ts` and `api/setup/route.ts`. Seeds reseller_roles, user_roles, the `csa-internal` reseller, then two admin users with **hardcoded plaintext passwords** (`auth.ts:334-335`): `joshua.boak@civilsurveysolutions.com.au` / `CSA-Admin-2026!` (admin) and `andrew.english@civilsurveyapplications.com.au` / `CSA-IBM-2026!` (ibm). |
| `requestPasswordReset(email)` | 352 | 32-byte random token; **SHA-256 hash stored** in `password_reset_tokens.token`, plain token emailed. 1-hour expiry. Marks prior unused tokens `used = true`. Always returns `true` (does not reveal whether the email exists). Reset link: `${NEXT_PUBLIC_APP_URL}?reset=<token>` — query param on the app root. **Still lands on `/`**, which `middleware.ts:31-33` now special-cases: an unauthenticated `/` is redirected to `/login` *with its query string intact* rather than through `?next=`, precisely so this link keeps working. |
| `resetPassword(token, newPassword)` | 382 | Hashes incoming token, looks up unused token for an active user, checks expiry (marks expired token used), rehashes password, marks token used, audit-logs. Returns `{ success, error? }`. **No password strength check here** — `resetPasswordSchema` (min 8) lives in `validation.ts` and is applied by the route. |
| `sendResetEmail()` (private) | 418 | Gmail API via Google service account JWT with domain-wide delegation (`subject: GMAIL_SENDER`, scope `gmail.send`). If `GOOGLE_SERVICE_ACCOUNT_KEY` is unset, or on any send error, it `console.log`s the reset URL instead. BCCs `GMAIL_BCC` (default `it@civilsurveysolutions.com.au`). Inline HTML template, CSA branding (`#0077B7`, `#0A4C6E`). |

`allowedResellerIds` derivation (`auth.ts:193-205`, mirrored `api-auth.ts:129-141`): `undefined`/`[]` for system admins (meaning "no filter, see all"); otherwise `[own reseller_id]` plus, when `canViewChildRecords`, every `resellers.id WHERE distributor_id = own AND is_active`. One extra query per authentication when the flag is set — and now also per `getUserById`, i.e. per page load.

Selected-but-unused SQL alias: `r.id AS reseller_zoho_id` (`auth.ts:80`) is never read from the row.

### 2.3 `lib/api-auth.ts` — route guards

`AuthUser` interface (`api-auth.ts:29-38`): `userId: number`, `email`, `name`, `role: string`, `resellerId: string | null`, `resellerRegion: string | null`, `permissions: UserPermissions`, `allowedResellerIds: string[]`.

- `getAuthUser(request)` `:45` — reads `request.cookies.get('recivis-token')`, `jwt.verify`, then re-queries the full permission join by `decoded.userId` (fresh permissions on every request; the JWT itself carries no permissions). Returns `null` on missing cookie, verify failure, inactive/missing user, or any thrown error (bare `catch { return null }` at `:153`). `role` defaults to `'standard'` when `user_role_id` is null (note: `auth.ts:172` defaults the same field to `'reseller'` — inconsistent defaults between the two modules).
- `requireAuth(request)` `:161` — returns `AuthUser | NextResponse` (401 `{ error: 'Authentication required' }`). **The dominant guard**: used by 29 API route files (every route under `app/api/` except `auth/forgot-password` and `auth/reset-password`). Callers must narrow with an `instanceof NextResponse` check.
- `requireRole(user, ...roles)` `:172` — returns 403 `{ error: 'Insufficient permissions' }` or `null`. **Never called** anywhere; routes use `isAdmin()` plus `permissions.*` flags instead.
- `isAdmin(user)` `:180` — `role === 'admin' || 'ibm'`. Used in 20 route files.
- `canManageReseller(user, resellerId)` `:187` — admins always true; otherwise membership in `allowedResellerIds`, false when that list is empty. Used only in `api/accounts/[id]/route.ts` and `api/invoices/[id]/route.ts`.

`JWT_SECRET` handling (`api-auth.ts:23-26`, `:46`): warns at import if unset, then silently falls back to the same dev secret string as `auth.ts`, so a missing secret does not fail closed.

**Duplication**: `api-auth.ts:95-141` is a near-verbatim copy of `auth.ts:116-161` (permission intersection, `ro ?? rr` merge, child-reseller expansion). Two places to edit for any permission change.

### 2.4 Permission vocabulary and what it gates

`UserPermissions` (`types.ts:18-32`) — 12 booleans plus one number:

| Flag | Composition | Gates (per seed descriptions) |
|---|---|---|
| `canCreateInvoices` | `ur_create && rr_create` | Invoice creation |
| `canApproveInvoices` | `ur_approve && rr_approve` | Invoice approval (only `admin`/`ibm` user_roles and `internal` reseller_role have it seeded) |
| `canSendInvoices` | `ur_send && rr_send` | Sending invoices to customers |
| `canViewAllRecords` | reseller tier only (`rrAll`) | Cross-org visibility; not user-role gated |
| `canViewChildRecords` | reseller tier only (`rrChild`) | Distributor → child reseller visibility; drives `allowedResellerIds` |
| `canModifyPrices` | `ur_price && rr_price` | Price overrides (denied for `restricted` reseller_role) |
| `canUploadPO` | `ur_po && rr_po` | Purchase-order attachment |
| `canManageUsers` | `ur_users` only — **not** intersected with any reseller flag (`auth.ts:139`) | User admin; `admin` and `manager` user_roles |
| `canViewReports` | `ur_reports && rr_reports` | Reports views |
| `canExportData` | `ur_export && rr_export` | Export endpoints |
| `canCreateEvaluations` | `ur_eval && rr_eval` | Evaluation/trial licences |
| `maxEvaluationsPerAccount` | `-1` for admins; else `rrMaxEval` if both eval flags true, else `0` | Seeded caps: internal `-1`, distributor `3`, reseller `2`, restricted `0`. `-1` = unlimited, `0` = disabled (`types.ts:30`) |
| `canExtendEvaluations` | `ur_extend_eval && rr_extend_eval` | Extending an existing evaluation |

Seeded reseller_roles (`auth.ts:256-259`): `internal` all-true/`-1`; `distributor` create+send+child+price+po+reports+export+eval(3), no approve/view-all/extend; `reseller` create+po+reports+eval(2) only; `restricted` create+po+reports, no price/export/eval.
Seeded user_roles (`auth.ts:269-273`): `admin` all-true; `ibm` all-true except `can_manage_users`; `manager` create/send/price/po/manage_users/reports/export/eval; `standard` create/po/reports/eval; `viewer` reports only.

### 2.5 `lib/store.ts` — client state (Zustand)

**Rewritten 2026-08-12.** `fd51770` cut this file from 150 lines to **93** and removed the `persist` middleware entirely: `useAppStore = create<AppState>()((set) => ({...}))` (`store.ts:62`). There is no store name, no `partialize`, and **nothing is written to localStorage by the store** (`store.ts:9-12`).

What is left is the six pieces of genuinely global client state:

| Slice | Members | Notes |
|---|---|---|
| Auth | `user: User \| null`, `setUser` | `:63-64`. Rehydrated from `GET /api/auth` by the portal layout on every mount. The doc comment at `:31` still says "Persisted to localStorage" — that comment is stale; the code above it is not. |
| Chat | `messages: ChatMessage[]`, `addMessage`, `updateMessage(id, partial)`, `clearMessages` | `:66-79`. `addMessage` trims to the last `CHAT_MESSAGE_LIMIT` (= 25) via `messages.slice(-25)`. |
| Layout | `sidebarOpen: boolean` (default `true`), `setSidebarOpen` | `:81-82`. |
| Create-order prefill | `newInvoiceContext: Record<string, unknown> \| null`, `setNewInvoiceContext` | `:90-91`. Still the only channel by which "New Order" learns which account/contact/reseller it is for — and still in-memory, which is why a cold hit on `/orders/new` has to redirect (§9.3). |
| Global UI | `isLoading`, `setIsLoading` | `:84-85`. |
| Staged PO | `pendingPOFile: { fileName; base64 } \| null`, `setPendingPOFile` | `:87-88`. Deliberately never persisted anywhere — base64 file bodies stay out of storage (§12). |

**What was deleted, so you do not go looking for it:** `currentView` and `setCurrentView` (the 19-member union that used to be the router), all five `selected*Id` fields (`selectedResellerId`, `selectedCouponId`, `selectedLeadId`, `selectedAccountId`, `selectedInvoiceId`), `selectedLeadSource`, and `invoiceReturnView`. Detail views take their record id as a **prop from the server page** instead, and "which module is this lead in" travels as `?source=` on the URL. Back-navigation targets are now just paths.

**One deliberate, narrow persistence exception, documented in the file header (`store.ts:14-22`) so it does not get "fixed" back:** `ChatInterface` persists the chat transcript to **sessionStorage** under `recivis:session:chat`. That narrowly reverses an earlier decision not to persist chat. The reasoning: a transcript is 5–30 minutes of work and browser Back cannot be intercepted, but a transcript can also contain a customer's purchase-order contents — so session scope is the middle path. It survives in-app Back, route changes and a reload in the same tab, then dies with the tab, and never reaches disk. It is never written to localStorage. The persistence itself lives in `ChatInterface.tsx`, not here; the store stays plain in-memory state.

### 2.6 `lib/types.ts` — exported types

All 15 exports, in file order:

1. `UserPermissions` `:18` — see 2.4.
2. `Reseller` `:37` — `id`, `name`, `email?`, `region?`, `currency?`, `partnerCategory?`, `directCustomerContact?: boolean`, `distributorId?`, `resellerRoleName?`. Synced from the Zoho CRM Resellers module.
3. `User` `:54` — `email`, `name`, `reseller?: Reseller`, `userRoleName?`, `userRoleDisplayName?`, `resellerRoleName?`, `allowedResellerIds?: string[]`, `permissions?: UserPermissions`, plus explicitly-labelled legacy-compat fields for the AI system prompt: `role?`, `resellerId?`, `resellerName?`, `region?`. Note almost everything is optional, so a `User` from `verifyToken` and one from `authenticateUser` are the same type with wildly different completeness.
4. `ChatMessage` `:73` — `id`, `role: 'user'|'assistant'|'system'`, `apiContent?` (what is sent to the API, may differ from display, e.g. PO data), `content`, `timestamp: Date`, `components?: MessageComponent[]`, `isStreaming?`. `timestamp: Date` + localStorage is a latent hydration issue, though only `user` is persisted so it does not bite today.
5. `MessageComponent` `:84` — discriminated union: `table|invoice-summary|sku-builder|options|confirmation|link` with payloads `TableData|InvoiceSummary|SKUBuilderState|OptionSet|ConfirmationData|LinkData`. Imported by `components/chat/ChatInterface.tsx` and `ChatMessage.tsx`.
6. `TableData` `:93` — `headers: string[]`, `rows: (string|number)[][]`, `selectable?`, `onSelect?: string`.
7. `InvoiceSummary` `:101` — `account`, `contact`, `reseller`, `region`, `currency`, `invoiceDate`, `dueDate`, `lineItems: LineItemSummary[]`, `subtotal: number`, `invoiceId?`, `invoiceUrl?`.
8. `LineItemSummary` `:116` — `product`, `quantity`, `startDate`, `endDate`, `unitPrice`, `total`.
9. `SKUBuilderState` `:126` — `step: number`, `product?`, `userType?`, `licensing?`, `model?`, `sku?`.
10. `OptionSet` `:136` — `question`, `options: { label; value }[]`, `allowCustom?`.
11. `ConfirmationData` `:143` — `message`, `confirmLabel?`, `cancelLabel?`.
12. `LinkData` `:150` — `label`, `url`, `icon?`.
13. `ZohoRecord` `:159` — `{ id: string; [key: string]: unknown }`. The universal CRM record shape. **Not imported anywhere outside `types.ts`** — the Zoho layer and routes use inline `Record<string, unknown>` instead.
14. `ZohoSearchResult` `:165` — `{ data: ZohoRecord[]; info?: { per_page, count, page, more_records } }`. No importers.
15. `ConversationContext` `:181` — `phase: 'identify'|'build'|'confirm'|'post'|'report'`, `account?`, `contact?`, `reseller?: ZohoRecord`, `lineItems?: unknown[]`, `invoiceId?`, `invoiceType?: 'new'|'renewal'`. Documents the intended invoice-assistant state machine but has **no importers** — the phase machine is not wired up.

Unused outside `types.ts` (types only, so zero runtime cost, but they mark unfinished feature surface): `TableData`, `InvoiceSummary`, `LineItemSummary`, `SKUBuilderState`, `OptionSet`, `ConfirmationData`, `LinkData`, `ZohoRecord`, `ZohoSearchResult`, `ConversationContext`. The chat components import only the `MessageComponent` union, so the arm payloads are reached structurally, never by name.

### 2.7 `lib/cache.ts` — Redis layer

- Client: `ioredis`, lazily constructed singleton (`getRedis()` `:14`) from `REDIS_URL`; `maxRetriesPerRequest: 1`, `connectTimeout: 3000`, `lazyConnect: true`, and an `error` handler that deliberately swallows everything (`:22`). If `REDIS_URL` is unset, every function is a graceful no-op — the app runs uncached.
- Key namespace: all keys are prefixed `recivis:` inside the module (`:34`, `:48`, `:61`, `:72`), so callers pass unprefixed keys.
- API: `cacheGet<T>(key)` (JSON.parse, `null` on miss/error), `cacheSet(key, value, ttlSeconds = 300)` (`SET ... EX`), `cacheDel(key)`, `cacheInvalidatePattern(pattern)` (`KEYS recivis:<pattern>` then `DEL ...keys`). Every function is wrapped in a swallow-all `try/catch`.
- Actual usage (6 route files):
  - `api/currencies/route.ts` — key `currencies:rates`, TTL **3600s**.
  - `api/products/route.ts` — computed `cacheKey`, TTL **600s**.
  - `api/reports/route.ts` — computed `cacheKey`, TTL **600s**.
  - `api/resellers/route.ts` — computed `cacheKey`, TTL **300s**; invalidates `resellers:*` on write.
  - `api/coupons/route.ts` — computed `cacheKey`, TTL **120s**; invalidates `coupons:*` on write.
  - `api/coupons/[id]/route.ts` — invalidates `coupons:*` on write.
- Invalidation is pattern-based only (`resellers:*`, `coupons:*`). `cacheDel` has **no callers**. `notifications` (TTL 180s) and `products`/`reports`/`currencies` have no invalidation path at all — they expire by TTL only.
- `KEYS` is O(N) over the whole keyspace and blocks Redis; fine at this scale, worth noting if the keyspace grows or the instance is shared.

### 2.8 `lib/logger.ts` — logging

- `LogEntry` (`:25`): `timestamp` (ISO string), `level: 'info'|'warn'|'error'|'debug'`, `category: 'api'|'mcp'|'ai'|'tool'|'auth'|'file'`, `message`, `data?: Record<string, unknown>`, `durationMs?`.
- `log(level, category, message, data?, durationMs?)` `:101` — pushes to an in-memory array, increments `pendingWrites`, schedules a flush, and always mirrors to console (`console.error`/`warn`/`log` with a `[CATEGORY]` prefix; the info path truncates `JSON.stringify(data)` to 200 chars, `:129`). Imported by **28 API route files** — this is the project's standard logging entry point.
- `getLogs(count = 50, category?)` `:133` and `clearLogs()` `:141` — used only by `app/api/logs/route.ts` (an in-app log viewer).
- Persistence: `.recivis-logs.json` at `process.cwd()` (`:16`). Debounced async writer — flush every `FLUSH_INTERVAL_MS = 2000` or immediately once `pendingWrites >= FLUSH_THRESHOLD = 50` (`scheduleFlush` `:85`, `flushToDisk` `:63`); `writing` guard prevents overlapping writes; write errors are swallowed. Array trimmed to `MAX_ENTRIES = 500` before each write.
- On import, the module does a **synchronous** `fs.existsSync` + `readFileSync` + `JSON.parse` of the log file at module scope (`:49-56`), silently resetting to `[]` on any failure.
- **Nothing goes anywhere durable.** The JSON file lives in the container filesystem (Railway deploy target per `NEXT_PUBLIC_APP_URL`), so logs are lost on redeploy/restart, and each server instance keeps its own independent 500-entry array and its own file — `/api/logs` shows only whatever instance served that request. There is no external sink (no stdout-structured shipping, no APM, no DB table). `audit_log` in Postgres (via `auth.auditLog`) is the only durable trail, and it only records auth/user-management events.

### 2.9 `lib/validation.ts` — Zod schemas

Six schemas plus one helper:

| Export | Line | Shape | Used by |
|---|---|---|---|
| `createUserSchema` | 9 | `email` (email format), `password` (min 8), `name` (min 1), `resellerId?`, `userRoleName?` | `api/users/route.ts` |
| `updateUserSchema` | 18 | `name?` (min 1), `is_active?`, `user_role_name?`, `reseller_id?` (snake_case, unlike the create schema) | `api/users/[id]/route.ts` |
| `resetPasswordSchema` | 26 | `password` (min 8) | `api/users/[id]/route.ts` |
| `createContactSchema` | 31 | `First_Name`, `Last_Name` (min 1), `Email?` (email), `Phone?`, `Title?`, `Account_Name?: { id }` — Zoho field names | `api/contacts/route.ts` |
| `createAccountSchema` | 41 | `Account_Name` (min 1), `Billing_Country?`, `Reseller?: { id }` | **no callers** |
| `updateInvoiceSchema` | 48 | `Invoice_Date?`, `Due_Date?`, `Currency?`, `Purchase_Order?`, `Reseller_Direct_Purchase?: boolean`, `Invoiced_Items?: Record<string,unknown>[]` | **no callers** |
| `validateBody(schema, body)` | 61 | Returns `{ success: true, data }` or `{ success: false, error }` using **only the first issue's message** (`result.error.issues[0]`, with a Zod-v4 comment at `:65`) | `api/contacts/route.ts`, `api/users/route.ts`, `api/users/[id]/route.ts` |

Coverage gaps: password policy is length-only (min 8, no complexity); dates are plain `z.string()` with no format check; `Invoiced_Items` entries are unvalidated; nothing validates invoice creation, coupons, leads, evaluations, or chat payloads — those routes accept unvalidated bodies. Only 3 of ~30 route files call `validateBody`.

### 2.10 `lib/api-response.ts` and `lib/env.ts` — both unused

`api-response.ts` (21 lines) exports `apiError(message, status = 400)` → `{ success: false, error }` and `apiSuccess(data = {})` → `{ success: true, ...data }`. Its own docstring says *"Usage (in future API routes)"* (`:7`) — and that is accurate: **zero call sites**. Routes hand-roll `NextResponse.json(...)`, and `api-auth.ts` returns its own `{ error }` (no `success` field) shapes, so the intended convention is not actually in force anywhere.

`env.ts` (19 lines) exports `getZohoApiKey()` (throws if `ZOHO_API_KEY` unset), `getZohoTokenUrl()` (builds the hardcoded `zohoapis.com.au/crm/v7/functions/getresellerzohotoken/...` URL with `arguments={"resellerName":"Civil Survey Applications"}`), and `getJwtSecret()` (`JWT_SECRET` with the same dev-secret fallback). **All three have zero call sites.** `auth.ts:23`, `api-auth.ts:23`, and `cache.ts:10` read `process.env` directly at module scope; `zoho.ts` does not import `getZohoApiKey`. So the "fail loudly if required vars are missing" intent in the file header is not realised — the live code paths fail soft.

### 2.11 `lib/constants.ts`

| Export | Line | Value | Used by |
|---|---|---|---|
| `CSA_INTERNAL_ID` | 13 | `'csa-internal'` (Postgres reseller id for CSA staff) | `api/resellers/route.ts`, `api/resellers/[id]/route.ts` |
| `CSA_ZOHO_ID` | 16 | `'55779000000560184'` | `api/resellers/route.ts`, `api/resellers/[id]/route.ts` |
| `CSA_ORG_ID` | 19 | `'7002802215'` | **no callers** |
| `CRM_BASE_URL` | 22 | `https://crm.zoho.com.au/crm/org7002802215` | **no callers** (CRM deep links are built inline elsewhere) |
| `REGION_LABELS` | 29 | `AU/EU/NA/AS/NZ/WW/AF` → display names | 7 view components (`AccountsView`, `LeadsView`, `DraftInvoicesView`, `CouponDetailView`, `CreateCouponView`, `ReportsDashboardView`, `ResellerManagementView`) |
| `CURRENCIES` | 44 | `['AUD','USD','EUR','INR','GBP','NZD'] as const` | 5 view components |
| `PARTNER_CATEGORIES` | 47 | `Reseller, Distributor, Distributor/Reseller, Affiliate, Platinum Partner` | `ResellerManagementView` |
| `MAX_ZOHO_PAGES` | 63 | `10` (≈2000 records at 200/page) | `lib/zoho.ts` |
| `ITEMS_PER_PAGE` | 69 | `{ leads:50, accounts:50, invoices:50, assets:20, contacts:10, users:10, coupons:20, resellers:24 }` | **no callers** — the doc comment claiming it is "used by frontend components and API routes" is stale; page sizes are hardcoded at each call site |
| `CHAT_MESSAGE_LIMIT` | 88 | `25` | `lib/store.ts` |

Note `REGION_LABELS` uses two-letter codes (`AU`, `NZ`), while the seeded CSA reseller and `authenticateUser` carry `region = 'ANZ'` (`auth.ts:284`) — `'ANZ'` has no entry in the map.

### 2.12 Environment variables read in this layer

| Var | Read at | Behaviour if missing |
|---|---|---|
| `JWT_SECRET` | `auth.ts:23`, `api-auth.ts:23`/`:46`, `env.ts:17` | Falls back to `'recivis-dev-secret-change-in-production'`; `api-auth` logs a warning at import but still proceeds |
| `NEXT_PUBLIC_APP_URL` | `auth.ts:330` | Defaults to `https://recivis-production.up.railway.app` |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | `auth.ts:381` | Reset email skipped; URL logged to console instead |
| `GMAIL_SENDER` | `auth.ts:382` | Defaults `auth@civilsurveyapplications.com.au` |
| `GMAIL_BCC` | `auth.ts:399` | Defaults `it@civilsurveysolutions.com.au` |
| `REDIS_URL` | `cache.ts:10` | Caching becomes a silent no-op |
| `ZOHO_API_KEY` | `env.ts:6` (unused path) | Would throw — but nothing calls it |

Pattern: direct `process.env.X` at module scope with `||` defaults. No central validation, no startup assertion, no typed env object. `env.ts` was the attempt at one and is bypassed.

### 2.13 Incomplete / dead / duplicated — consolidated

Dead exports (zero call sites in `src/`, excluding `__tests__`):
- `auth.verifyToken` (`auth.ts:199`) — superseded by `api-auth.getAuthUser`.
- `api-response.apiError`, `api-response.apiSuccess` — entire file unused; docstring admits it is aspirational.
- `env.getZohoApiKey`, `env.getZohoTokenUrl`, `env.getJwtSecret` — entire file unused.
- `api-auth.requireRole` (`:172`).
- `cache.cacheDel` (`:57`).
- `constants.ITEMS_PER_PAGE`, `constants.CSA_ORG_ID`, `constants.CRM_BASE_URL`.
- `validation.createAccountSchema`, `validation.updateInvoiceSchema`.
- Types with no importers: `ConversationContext`, `ZohoRecord`, `ZohoSearchResult`, `TableData`, `InvoiceSummary`, `LineItemSummary`, `SKUBuilderState`, `OptionSet`, `ConfirmationData`, `LinkData`.
- Unused SQL alias `reseller_zoho_id` (`auth.ts:80`).
- **New 2026-08-12:** `useBeforeUnload` (`lib/useBeforeUnload.ts:18`) — the whole 30-line module has zero importers. `35abf9d` lists it as delivered infrastructure ("`useBeforeUnload` — refresh and tab close"), and it is correct code, but nothing calls it, so **refresh and tab-close do not warn about unsaved work anywhere in the app**. Wiring it up is a one-line change per surface; see §12.4.

Duplication / divergence risk:
- The 40-line permission-derivation block exists twice (`auth.ts:160-205`, now inside `buildUserFromRow`, vs `api-auth.ts:95-141`). `fd51770` de-duplicated the *SQL* behind `USER_PROJECTION_SQL` but only within `auth.ts` — `api-auth.ts` still has its own copy of both the query and the intersection.
- The dev JWT secret literal exists three times (`auth.ts:24`, `api-auth.ts:46`, `env.ts:16`).
- Default role when `user_role_id` is null differs: `'reseller'` (`auth.ts:216`, `:251`) vs `'standard'` (`api-auth.ts:147`).
- Two response-shape conventions coexist: `{ success, error }` (`api-response.ts`, `validateBody`) and bare `{ error }` (`api-auth.ts:164`, `:174`).
- *Resolved:* the duplicated 19-literal `currentView` union is gone with the field itself. `routes.ts` replaced it with one `as const satisfies readonly RouteDef[]` table and a `LegacyViewId` type derived from it (`routes.ts:54-57`), so the view-id vocabulary is now written once. Note the name: `legacyViewId` is a migration bridge, and `routes.ts:10-13` says Phase B is meant to drop it.

Notable functional gaps (not security-hardening notes, just unfinished mechanics):
- No logout / token-revocation primitive in this layer; a stolen or stale JWT stays valid for its full 24h since only `is_active` is rechecked.
- No refresh flow — sessions hard-expire at 24h with no renewal path.
- `ConversationContext` implies an invoice-assistant phase machine (`identify → build → confirm → post → report`) that is never instantiated.
- `SKUBuilderState`/`OptionSet`/`ConfirmationData` chat component payloads are declared but never constructed by name — the rich-component chat surface is partially built.
- `createUser` is an upsert, so "create user" on an existing email silently resets that user's password, name, reseller, and role.
- `seedAdminUsers` embeds two production passwords in source (`auth.ts:296-297`) and re-runs on every `/api/auth` and `/api/setup` hit (cheap: three `COUNT(*)` queries, but it is on the login path).
- `validateBody` surfaces only the first Zod issue, so multi-field form errors arrive one at a time.
- Logging has no durable sink; `/api/logs` is per-instance and per-deploy.
- `authenticateUser` returns `null` identically for unknown email, inactive user, and wrong password — callers cannot distinguish "account disabled" from "wrong password" for the UI.

### PATCH for section 2 — src/lib/env.ts

`src/lib/env.ts` is 27 lines and exports three helpers, all of which read `process.env` at call time (no module-level capture, so a var set after import is still picked up).

`getZohoApiKey()` (`src/lib/env.ts:5-9`) returns `process.env.ZOHO_API_KEY` and throws `'ZOHO_API_KEY environment variable is not set'` when it is absent — unconditional, in every environment. `getZohoTokenUrl()` (`:11-14`) calls it and interpolates the key into a fixed `https://www.zohoapis.com.au/crm/v7/functions/getresellerzohotoken/actions/execute` URL with `auth_type=apikey`, `zapikey=<key>`, and a URL-encoded `arguments` payload hard-coding `{"resellerName":"Civil Survey Applications"}`. Both were unchanged by this merge.

`getJwtSecret()` (`:18-27`) is the file's one behavioural change (commit `1c8e9f0`, "Refused the dev JWT fallback when NODE_ENV is production"). Current behaviour, precisely:

1. Read `process.env.JWT_SECRET`.
2. If it is set (non-empty), return it. This is the only path in which the caller gets a real secret, and it is identical in dev and production.
3. If it is falsy **and** `process.env.NODE_ENV === 'production'`, throw `Error('JWT_SECRET environment variable is not set — refusing to start in production with the dev fallback key')`.
4. If it is falsy and `NODE_ENV` is anything else — `'development'`, `'test'`, or unset — return the module constant `DEV_JWT_SECRET_FALLBACK = 'recivis-dev-secret-change-in-production'` (`:16`).

The dev fallback was not removed; it was fenced. A fresh clone with no `.env.local` still signs and verifies tokens with the literal `'recivis-dev-secret-change-in-production'`, so the local workflow is untouched — and the string remains in the shipped bundle, so it must be treated as public. What changed is that the same code path can no longer be reached in production: previously the function was a single `return process.env.JWT_SECRET || 'recivis-dev-secret-change-in-production'`, which meant a Railway deploy missing `JWT_SECRET` would come up healthy and sign session cookies with a guessable, forgeable key. Now that configuration crashes at the first call site instead, with a message naming the missing variable.

Three properties worth stating plainly, because they define the edges of the guarantee:

- **The check keys off `NODE_ENV`, not off deployment.** The refusal only fires when `NODE_ENV === 'production'` exactly. A production host running with `NODE_ENV` unset or set to anything else would silently get the fallback key. In practice `next start` sets `NODE_ENV=production` in its own process, which is what makes this hold on Railway; the `ENV NODE_ENV=production` line in the `Dockerfile` does **not** contribute, because the live service builds with RAILPACK rather than the Dockerfile. The guard therefore rests on Next's behaviour, not on repo config.
- **It is lazy, not a startup gate.** Despite the message's "refusing to start" wording, nothing calls this at boot — the throw happens on the first `getJwtSecret()` invocation, i.e. at the first login or token verification. The observable failure is a request-time 500, not a failed deploy or failed healthcheck.
- **It is currently inert in production.** `JWT_SECRET` is set on the deployed service, so step 2 always wins there. The guard is insurance against the variable being removed, not something exercised today.

No call sites changed; the exported signature is still `(): string`.



---

## 3. Integrations: Zoho CRM, PostgreSQL, AI, Exports

### 3.1 Zoho CRM — transport and auth

The portal does **not** talk to the Zoho REST API directly for reads/writes. It talks to a **Zoho-hosted MCP (Model Context Protocol) server** over JSON-RPC 2.0 via HTTP POST, and that MCP server fronts Zoho CRM API v8-era endpoints (tool names are `ZohoCRM_*`). The only direct REST call in the codebase is the renewal Deluge function (see 3.4).

- Endpoint (`src/lib/zoho-mcp-auth.ts:11-12`): `process.env.ZOHO_MCP_URL` with a **hardcoded production fallback**
  `https://recivis-7006508204.zohomcp.com.au/mcp/5c9afad5b4454d6f85f133157f17601e/message`
  The path segment `5c9afad5...` is the embedded API key — auth is "preauthorized URL", no OAuth, no token exchange, no refresh.
- `isAuthenticated()` (`zoho-mcp-auth.ts:20-22`) is a hardcoded `return true`. `getAccessToken()` (`:25-27`) is a hardcoded `return null`. Both are vestigial shims left over from an OAuth-shaped interface — they add nothing beyond satisfying callers that expect an auth module. **The whole file is 27 lines and contains no logic.**
- Region: `.com.au` (Australian Zoho DC) throughout, both for MCP host and the REST function call.

**MCP session lifecycle** (`src/lib/zoho.ts`):
- Module-level singletons `sessionId`, `initialized`, `initPromise` (`zoho.ts:25-27`) — **one MCP session per Node process**, shared across all concurrent HTTP requests to the Next.js server. There is no per-user or per-request isolation of the Zoho session.
- `mcpRequest()` (`zoho.ts:34-104`): builds `{jsonrpc:'2.0', method, params, id: Date.now()}`. `id` is `Date.now()`, so two calls in the same millisecond collide — harmless only because responses are read synchronously per-fetch, never correlated by id.
- `Accept: application/json, text/event-stream` (`:51`). Session id is captured from the `Mcp-Session-Id` response header and echoed on subsequent requests (`:54-68`).
- Handshake `ensureInitialized()` (`zoho.ts:110-131`): `initialize` with `protocolVersion: '2025-03-26'`, empty `capabilities`, `clientInfo: {name:'recivis', version:'1.0.0'}`, then a fire-and-forget `notifications/initialized`. `initPromise` de-dupes concurrent init; on failure it is nulled so the next caller retries.
- `callMcpTool(toolName, args)` (`zoho.ts:137-159`): calls `tools/call`. On **any** error it logs a warn, calls `resetSession()`, re-initializes, and retries **exactly once**. A second failure propagates.

**SSE / error-handling ordering bug** (`zoho.ts:72-96`): the `text/event-stream` branch runs **before** the `if (!res.ok)` check. It concatenates only the *last* `data: ` line of the stream and parses it. So (a) multi-chunk SSE payloads split across `data:` lines are dropped except the last, and (b) a non-2xx response that Zoho returns with an SSE content-type is treated as a normal result — if it has no `error` key it silently returns `null`/undefined instead of throwing.

**No rate-limit handling of any kind.** No 429 detection, no `Retry-After`, no backoff, no jitter, no concurrency limiter, no request budget. The only resilience is the single blind retry in `callMcpTool`. Zoho's per-day API credit limits and per-minute concurrency limits are entirely unguarded.

### 3.2 Zoho modules, tools and field mappings

`executeZohoTool(name, args)` (`zoho.ts:269-355`) is a thin façade mapping 7 friendly names onto MCP tool names + the MCP `path_variables` / `query_params` / `body` envelope:

| Friendly name | MCP tool | Envelope | Notes |
|---|---|---|---|
| `search_records` | `ZohoCRM_searchRecords` | `path_variables.module`; `query_params`: criteria, email, phone, word, fields, page, sort_by, sort_order | `zoho.ts:274-289`. Only sets keys that are truthy. **Never sets `per_page`** — relies on Zoho's default. |
| `get_record` | `ZohoCRM_getRecord` | `path_variables.{module, recordID}` | `zoho.ts:291-298`. No `fields` support — always full record. |
| `get_related_records` | `ZohoCRM_getRelatedRecords` | `path_variables.{parentRecordModule, parentRecord, relatedList}`, optional `query_params.fields` | `zoho.ts:300-312`. No pagination — single page only. |
| `create_records` | `ZohoCRM_createRecords` | `path_variables.module`; `body.{data, trigger}` | `zoho.ts:314-322`. `trigger` defaults to `['workflow']`. |
| `update_records` | `ZohoCRM_updateRecords` | `path_variables.module`; `body.{data, trigger}` | `zoho.ts:324-332`. `trigger` defaults to `[]` (workflows off unless caller opts in). |
| `get_variables` | `ZohoCRM_getVariables` | `{}` | `zoho.ts:334-336`. Used to read `Latest_Product_Version`. |
| `call_renewal_function` | *(none — direct REST)* | — | `zoho.ts:338-350`. See 3.4. |
| *(bypass)* | `ZohoCRM_getRecords` | called directly by `getAllRecordPages` | `zoho.ts:245-248` — this browse path skips `executeZohoTool` entirely, an inconsistency in the abstraction. |

Unknown names return `{ error: 'Unknown tool: <name>' }` as a **resolved value**, not a thrown error (`zoho.ts:352-353`) — callers that don't inspect the shape will treat a typo'd tool name as success.

**Modules touched** (from `ai-tools.ts:217-245` field reference, the authoritative mapping since the AI drives most calls):
- **Contacts** — First_Name, Last_Name, Full_Name, Email, Account_Name (lookup), Title, Phone, Record_Status__s
- **Accounts** — Account_Name, Email_Domain, Billing_Street/City/State/Code/Country, Reseller (lookup→Resellers), Primary_Contact, Secondary_Contact, Owner, Record_Status__s
- **Resellers** (custom module) — Name, Email, Region, Currency, Partner_Category, Direct_Customer_Contact, Distributor (self-lookup), Record_Status__s
- **Products** — id, Product_Name, Product_Code (SKU), Unit_Price, Product_Active, Record_Status__s
- **Invoices** — Subject, Account_Name, Contact_Name, Invoice_Date, Due_Date, Status (Draft/Approved/Sent), Invoice_Type, Reseller, Reseller_Region, Reseller_Direct_Purchase, Currency, Grand_Total, Send_Invoice, Don_t_Make_Keys, Automatically_Send_Email, Purchase_Order, Billing_*, Owner, Invoiced_Items[], Record_Status__s. Export code also reads `Reference_Number` (`export-account.ts:163`, `export-lists.ts:177`) which is **absent from the AI's field reference**.
- **Assets1** (custom module) — Name, Product, Status (Active/Archived), Start_Date, Renewal_Date, Quantity, Serial_Key, Account, Reseller, Upgraded_To_Key, Renewal_Invoice_Generated, Not_Renewing_Asset, Record_Status__s
- **Org Variables** — `Latest_Product_Version`
- **Leads / Prospects** — exported by `exportLeadsList` (`export-lists.ts:250-308`) with fields leadStatus, productInterest, leadSource, evaluations[], but **no Leads module appears in `toolDefinitions` or the AI field reference** — that data path is fetched elsewhere (API routes), not through the AI tool layer.

**Line-item mapping** (`Invoiced_Items`, `ai-tools.ts:230-236`): `Product_Name` must be `{"id": <product record id>}`, plus Quantity, List_Price, Start_Date, Renewal_Date, `Contract_Term_Years` (0 when custom price/no dates, 1 when standard price + dates), `Asset_Code` = matching Assets1 record id for renewals. `Owner` is passed as `{"id": ...}` taken from the Account.

**Known Zoho constraint encoded in the prompt** (`ai-tools.ts:219`): `Record_Status__s` cannot appear in search criteria, so every search must request it in `fields` and filter `=== 'Trash'` post-fetch. That post-fetch filter is duplicated in the export path (`export-lists.ts:101`).

**Pagination helpers**:
- `searchAllPages(module, criteria, fields, sortOrder, maxPages=MAX_ZOHO_PAGES)` (`zoho.ts:198-228`) — loops pages, appends `parsed.data`, stops on `!moreRecords`. **`catch { break }` swallows every error** (`:221-224`) and treats it as "end of results", with the comment claiming Zoho errors on zero matches. A transient 429/500 mid-pagination therefore returns a silently truncated result set with no signal to the caller.
- `getAllRecordPages(module, fields, sortBy='Modified_Time', sortOrder='desc', maxPages)` (`zoho.ts:234-260`) — same shape, sets `per_page: 200` explicitly, same silent `catch { break }`.
- Both bounded by `MAX_ZOHO_PAGES` from `./constants`; comments assert this is 2000 records at 200/page (i.e. 10 pages), but `searchAllPages` never sends `per_page`, so the "2000 records" claim only holds if Zoho's search default happens to be 200.
- `parseMcpResult(result)` (`zoho.ts:175-192`) walks `result.content[].text`, `JSON.parse`s the first parseable one, returns `{data, moreRecords: info.more_records, page: info.page}`. A parse failure is swallowed (`catch { /* skip */ }`) and the function returns `{data: [], moreRecords: false, page: 1}` — indistinguishable from a genuinely empty result.

### 3.3 PostgreSQL layer

- Client: **`pg`** (node-postgres), `Pool` (`db.ts:17-24`). `connectionString: process.env.DATABASE_URL`, `max: 10`, `idleTimeoutMillis: 30000`, `ssl: {rejectUnauthorized:false}` only when `NODE_ENV === 'production'` (undefined otherwise). Default-exported pool plus a `query(text, params)` passthrough helper (`db.ts:223-226`).
- **Schema lives in code, not in migration files.** `initDB()` (`db.ts:40-218`) executes one giant idempotent DDL string (`CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS` + `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`) guarded by a module-level `dbInitialized` boolean so it runs once per server process. There is no migration tool, no version table, no down-migrations, and **no way to alter or drop an existing column** — the `ALTER TABLE` block at `db.ts:193-212` is the de-facto migration log, appended to over time.
- `db.ts` itself performs **no application reads or writes** — only DDL. All SELECT/INSERT/UPDATE traffic lives in the API routes (out of scope here), so the schema below is reconstructed from the DDL, which is authoritative for column names and types.

#### Reconstructed schema

| Table | Column | Type / default | Notes |
|---|---|---|---|
| `reseller_roles` | id | SERIAL PK | org-level permission caps |
| | name | VARCHAR(50) UNIQUE NOT NULL | |
| | display_name | VARCHAR(100) NOT NULL | |
| | description | TEXT | |
| | can_create_invoices, can_approve_invoices, can_send_invoices, can_view_all_records, can_view_child_records, can_modify_prices, can_upload_po, can_view_reports, can_export_data, can_create_evaluations, can_extend_evaluations | BOOLEAN DEFAULT false | `db.ts:56-67`, 208-210 |
| | max_evaluations_per_account | INTEGER DEFAULT 0 | |
| | is_system_role | BOOLEAN DEFAULT false | |
| | created_at, updated_at | TIMESTAMP DEFAULT NOW() | |
| `resellers` | id | VARCHAR(50) PK | **= Zoho record ID** (not a serial) |
| | name | VARCHAR(255) NOT NULL | |
| | email | VARCHAR(255) | |
| | region | VARCHAR(10) | mirrors Zoho `Region` |
| | currency | VARCHAR(10) | mirrors Zoho `Currency` |
| | partner_category | VARCHAR(50) | mirrors Zoho `Partner_Category` |
| | direct_customer_contact | BOOLEAN DEFAULT false | mirrors Zoho `Direct_Customer_Contact` |
| | distributor_id | VARCHAR(50) → resellers(id) | self-referential hierarchy; mirrors Zoho `Distributor` |
| | reseller_role_id | INTEGER → reseller_roles(id) | portal-only |
| | zoho_record_status | VARCHAR(50) DEFAULT 'Available' | mirrors `Record_Status__s` |
| | is_active | BOOLEAN DEFAULT true | portal-only |
| | synced_at | TIMESTAMP | last Zoho sync |
| | created_at, updated_at | TIMESTAMP DEFAULT NOW() | |
| | perm_create_invoices, perm_approve_invoices, perm_send_invoices, perm_view_all_records, perm_view_child_records, perm_modify_prices, perm_upload_po, perm_view_reports, perm_export_data, perm_create_evaluations, perm_extend_evaluations | BOOLEAN (**nullable, no default**) | per-reseller override: NULL = inherit role, true/false = override (`db.ts:193-204`) |
| | perm_max_evaluations_per_account | INTEGER (nullable) | numeric override |
| | pay_on_card | BOOLEAN DEFAULT false | `db.ts:205` — the one non-`perm_` late addition |
| `user_roles` | id | SERIAL PK | per-user permission level |
| | name | VARCHAR(50) UNIQUE NOT NULL | |
| | display_name | VARCHAR(100) NOT NULL | |
| | description | TEXT | |
| | can_create_invoices, can_approve_invoices, can_send_invoices, can_modify_prices, can_upload_po, can_view_reports, can_export_data, can_create_evaluations, can_extend_evaluations, can_manage_users | BOOLEAN DEFAULT false | `db.ts:104-113`, 211-212 |
| | is_system_role | BOOLEAN DEFAULT false | |
| | created_at, updated_at | TIMESTAMP DEFAULT NOW() | |
| `users` | id | SERIAL PK | |
| | email | VARCHAR(255) UNIQUE NOT NULL | |
| | password_hash | VARCHAR(255) NOT NULL | |
| | name | VARCHAR(255) NOT NULL | |
| | reseller_id | VARCHAR(50) → resellers(id) | nullable |
| | user_role_id | INTEGER → user_roles(id) | nullable |
| | is_active | BOOLEAN DEFAULT true | |
| | created_at, updated_at | TIMESTAMP DEFAULT NOW() | |
| | last_login | TIMESTAMP | |
| `audit_log` | id | SERIAL PK | |
| | user_id | INTEGER → users(id) | nullable (failed logins have no user) |
| | email | VARCHAR(255) | denormalised so the row survives user deletion |
| | action | VARCHAR(100) NOT NULL | |
| | details | TEXT | free-form |
| | ip_address | VARCHAR(45) | IPv6-width |
| | created_at | TIMESTAMP DEFAULT NOW() | |
| `password_reset_tokens` | id | SERIAL PK | |
| | user_id | INTEGER → users(id) NOT NULL | |
| | token | VARCHAR(255) UNIQUE NOT NULL | SHA-256 hash per header comment (`db.ts:10`) |
| | expires_at | TIMESTAMP NOT NULL | |
| | used | BOOLEAN DEFAULT false | |
| | created_at | TIMESTAMP DEFAULT NOW() | |
| `notification_dismissals` | id | SERIAL PK | `db.ts:178-184` |
| | user_id | INTEGER → users(id) NOT NULL | |
| | notification_key | VARCHAR(150) NOT NULL | opaque key; UNIQUE(user_id, notification_key) |
| | created_at | TIMESTAMP DEFAULT NOW() | rows >30 days old ignored **in application code only** — no TTL, no cleanup job in this file |

Indexes (`db.ts:162-171`, 186-187): `idx_resellers_distributor`, `idx_resellers_role`, `idx_users_email`, `idx_users_reseller`, `idx_users_role`, `idx_audit_log_user`, `idx_audit_log_created`, `idx_audit_log_email`, `idx_reset_tokens_token`, `idx_password_reset_user`, `idx_notif_dismiss_user`, `idx_notif_dismiss_created`. `idx_users_email` is redundant with the UNIQUE constraint on `users.email`; same for `idx_reset_tokens_token` vs `token UNIQUE`.

No `updated_at` triggers exist — every `updated_at` must be set by hand in application SQL or it stays at insert time.

### 3.4 Zoho vs Postgres — where each concept lives

**Zoho CRM only:** Accounts, Contacts, Products (SKU catalogue + Unit_Price), Invoices + Invoiced_Items line items, Assets1 (licences, serial keys, renewal dates), Leads/Prospects, org variables (`Latest_Product_Version`), licence-key generation, invoice email dispatch. The portal holds **no** local copy of any of these — every account/invoice/asset view is a live Zoho read.

**Postgres only:** portal user accounts and password hashes, the whole three-tier permission model (`reseller_roles` ∧ `user_roles`, with per-reseller `perm_*` overrides), audit log, password-reset tokens, notification dismissals, `pay_on_card`.

**Split across both — `resellers` is the one genuinely duplicated concept.** Zoho's Resellers module is master for identity and commercial attributes; `resellers` in Postgres caches `name, email, region, currency, partner_category, direct_customer_contact, distributor_id, zoho_record_status` keyed by the Zoho record id, stamped with `synced_at`. Consequences:
- `region` and `currency` exist in two systems. The invoice flow reads them **from Zoho** at invoice-build time (`ai-tools.ts:299`, 386) while access control and list filtering read the Postgres copy — a stale sync produces a reseller who filters one way and invoices another.
- The distributor hierarchy is duplicated: Zoho `Distributor` lookup vs Postgres `distributor_id` self-FK. Allowed-reseller-ID computation for Distributor-level users walks the Postgres tree, but the enforcement described to the AI (`ai-tools.ts:192-206`) compares against Zoho's `Reseller` field on each record.
- `is_active` (Postgres) and `zoho_record_status`/`Record_Status__s` (Zoho) are two independent liveness flags for the same org.
- No sync code is present in any of these six files — `synced_at` is written by something outside this layer.

**Renewal invoicing is deliberately *not* done through MCP** (`zoho.ts:338-350`): `call_renewal_function` POSTs to
`https://www.zohoapis.com.au/crm/v2/functions/generaterenewalinvoicesforassets/actions/execute?auth_type=apikey&zapikey=<ZOHO_API_KEY>&arguments=<urlencoded JSON>`
with `{buttonPusher: 'claude', assetIDString}` where `assetIDString` is the selected Assets1 ids joined by `'|||'` (Deluge multi-value convention). So invoice *creation for renewals* happens inside a Deluge function in Zoho, not in this codebase — the portal only picks the asset ids. Notable: **CRM API v2** (everything else is v8-era MCP tooling), a second credential (`ZOHO_API_KEY`, the only env var checked with a thrown error at `:344`), a hardcoded function name, a hardcoded `buttonPusher: 'claude'` audit string, and `res.json()` returned raw with no status check and no error handling.

### 3.5 AI tooling (`ai-tools.ts`)

**Provider/model:** the file itself names no model and imports no SDK. It exports (a) `toolDefinitions` in **Anthropic Messages API tool shape** (`name`, `description`, `input_schema` with `type: 'object' as const`, `required[]`) and (b) `getSystemPrompt()`. The concrete model id and the `messages.create` loop live in the chat API route (not in this layer). The `as const` on `input_schema.type` is the tell that these objects are typed against `@anthropic-ai/sdk`'s `Tool`.

**Tools defined** (7, mirroring `executeZohoTool` 1:1 — `ai-tools.ts:2-162`):
1. `search_records` (`:3-45`) — module + one of criteria/email/word (+ `phone` is accepted by `executeZohoTool` at `zoho.ts:282` but **not declared in the schema**, so the model can never use it), fields, sort_by, sort_order enum asc|desc, page. Required: `module`.
2. `get_record` (`:46-63`) — module + record_id.
3. `get_related_records` (`:64-89`) — parent_module, parent_id, related_list, fields. Doc'd examples: Accounts→Contacts, Accounts→Assets.
4. `create_records` (`:90-113`) — module, records[], trigger[] (default `["workflow"]`).
5. `update_records` (`:114-137`) — module, records[] each with `id`, trigger[].
6. `get_variables` (`:138-146`) — no args; documented purpose is fetching `Latest_Product_Version`.
7. `call_renewal_function` (`:147-161`) — asset_ids[].

**Tool result feedback:** not implemented here. This file only *declares* tools; the route executes them via `executeZohoTool` and feeds results back as `tool_result` blocks. Note the result-shape mismatch: `executeZohoTool` returns the **raw MCP envelope** (`{content:[{text: "<json string>"}]}`), and `parseMcpResult` — the helper that unwraps it — is exported for callers but is *not* applied inside `executeZohoTool`. So whatever the route hands back to the model is either the raw nested envelope or route-side-parsed; the abstraction stops one layer short.

**System prompt** (`ai-tools.ts:179-417`, ~240 lines) — the real business logic of the app lives in this string:
- `getSystemPrompt()` (`:164-177`) interpolates `{TODAY_AU}`, `{TODAY_ISO}`, `{PLUS30_AU}`, `{PLUS30_ISO}` computed from server `new Date()` — **server-local timezone, not Australia/Sydney**, so date boundaries drift if the host is UTC.
- Hardcoded: org id `org7002802215` and CRM link template (`:184`, 212), the four product families CSD/CSP/STR/CEZ (`:304-310`), the full SKU grammar `{PRODUCT}-{USERTYPE}-{LICENSING}-COM-1YR-{MODEL}-{REGION}` (`:322-324`), CC recipients "Geo Sales Manager" and **"Andrew English" by name** (`:349-350`), AS-region restrictions (`:390-393`), the greeting string (`:253`).
- Encodes RBAC a second time in prose (`:189-206`) — Admin/IBM full, Distributor limited to allowed reseller ids, Reseller to its own — with an explicit note that "the server will also enforce them". The Postgres permission model is thus mirrored into an LLM prompt; the two can drift.
- Six flow phases: identify account/contact → build new-product invoice → renewal invoice → PO/send/approve → reporting → PO upload processing. Note the numbering glitch: reporting is "Phase 5" (`:357`) and PO upload is titled "PO Upload Processing (Phase 6)" (`:395`) but sits after it as a top-level section, i.e. the phase sequence isn't actually linear.
- Safety invariants stated in caps: invoices always created `Status=Draft`, `Send_Invoice=false` (`:388`); never display `Record_Status__s='Trash'` (`:209`); never guess field names (`:210`).
- UI coupling baked into the prompt: numbered lists render as clickable buttons (`:302`), a numbered 6-field list renders as an editable form (`:274-290`), a PO-number mention makes the UI show a drag-drop zone (`:343`). The renderer's contract is expressed only as prose instructions to the model.
- Prompt-level error handling: "if you get *can't add inactive product*, retry silently up to 2 times" (`:413`) — a Zoho flakiness workaround pushed into the model rather than into `callMcpTool`.
- Repeated instructions to hide reasoning from the user (`:214`, 334, 364, 368) — filtering of NFR/Educational/Evaluation/Home Use products and Trash records must happen silently.

### 3.6 Exports

Two client-side modules, both using **SheetJS (`xlsx`)** and both writing files straight to the user's disk via `XLSX.writeFile` in the browser. **Format: XLSX only** — no CSV, no PDF, no server-side generation, no streaming. Every export builds a full array-of-arrays in memory then serialises.

**`export-account.ts`** — single-account detail exports:
- `exportFullAccount(account, contacts, invoices, activeAssets, archivedAssets, primaryContactId?, secondaryContactId?)` (`:44-103`) → workbook `"{Account} - Full Export.xlsx"` with sheets Summary / Contacts / Orders / Active Assets / (Archived Assets only if non-empty). Summary is a hand-built label:value AoA (`:62-82`) pulling Account_Name, Email_Domain, Billing_Country, Reseller.name, Owner.name (labelled "CSA Sales Rep"), Primary/Secondary contact names, street/city/state/code, then counts.
- `exportContacts` (`:108-112`), `exportInvoices` (`:117-121`), `exportAssets` (`:126-133`) — single-section variants reusing the same three sheet builders.
- `addContactsSheet` (`:137-158`): Name, Email, Phone, Title, Role — Role derived by comparing `c.id` to the passed primary/secondary ids.
- `addInvoicesSheet` (`:160-199`): Order # (`Reference_Number`), Subject, Date, Type, Status, Currency, Total; then **totals grouped by currency** (`:173-181`) rather than one summed total — correct for a multi-currency reseller base. Numeric coercion is done by poking `cell.t = 'n'` on column 6 (`:189-196`).
- `addAssetsSheet` (`:201-223`): Product (from `Product.name`, falling back to `Name`), Qty, Start/Renewal date, Serial Key, Status, plus Total Assets and Total Quantity.
- Dates rendered DD/MM/YYYY via a local `formatDate` (`:19-23`) — **duplicated verbatim** in `export-lists.ts:22-26`.

**`export-lists.ts`** — list-view exports:
- `exportAccountsList(accounts, filters?, onProgress?)` (`:34-159`) → `"Accounts Export - YYYY-MM-DD.xlsx"`, sheets Accounts / Contacts / Assets. The Accounts sheet prepends a filter-context block (Search/Region/Reseller) above the header row for auditability, and computes the freeze row from `filterLines.length` (`:70-72`).
  - **Fan-out fetch**: for each account it calls `GET /api/accounts/{id}` in **parallel batches of 5** (`BATCH_SIZE = 5`, `:85-140`), awaiting each batch before the next, calling `onProgress(current, total)` per batch. So an N-account export issues N HTTP requests from the browser, each of which triggers its own Zoho reads server-side. A 500-account export is 500 sequentially-batched round trips with no cancellation and no timeout.
  - Filtering inside the loop: contacts with `Record_Status__s === 'Trash'` skipped (`:101`); assets filtered to `data.activeAssets` with product-name substring exclusion of `nfr` / `educational` / `home use` (`:117`). **`evaluation` is excluded in the AI prompt (`ai-tools.ts:334`, 367) but not here** — the export and the chat disagree on what counts as a real asset.
  - `catch { /* skip failed accounts */ }` (`:128`) — a failed account silently contributes zero rows; the user gets a short spreadsheet with no warning.
- `exportInvoicesList(invoices, filters?)` (`:165-245`) → `"Orders Export - {status|All} - YYYY-MM-DD.xlsx"`. Columns Order #, Subject, Account, Date, Type, Status, Currency, Total, Reseller; totals grouped by currency (`:189-196`) plus a count-by-`Invoice_Type` breakdown (`:199-203`, 222). Synchronous, no fetching.
- `exportLeadsList(leads, filters?)` (`:250-308`) → `"Leads Export - YYYY-MM-DD.xlsx"`. This is the only export with a **typed** input (an inline object type, `:251-255`) rather than `any[]`/`Record<string, unknown>`; the shape is already-flattened view-model data (`_source: 'lead' | 'prospect'`, `evaluations: string[]`), meaning the Leads path normalises server-side while Accounts/Invoices pass raw Zoho records through.

### 3.7 Incomplete, stubbed, hardcoded, or half-built

**Hardcoded values / secrets in source**
- Live production MCP URL **including the embedded API key** as a source-code fallback (`zoho-mcp-auth.ts:11-12`).
- Zoho org id `org7002802215` and `crm.zoho.com.au` link template in the prompt (`ai-tools.ts:184`, 212).
- Deluge function name `generaterenewalinvoicesforassets` and `buttonPusher: 'claude'` (`zoho.ts:345-346`).
- Named individual "Andrew English" as a CC recipient (`ai-tools.ts:349-350`).
- MCP protocol version `'2025-03-26'` and `clientInfo` `recivis/1.0.0` (`zoho.ts:117-119`).

**Stubs / vestigial code**
- `isAuthenticated()` → `true`, `getAccessToken()` → `null` (`zoho-mcp-auth.ts:20-27`): an OAuth-shaped interface with no implementation behind it.
- `getCurrencySymbol()` (`export-account.ts:26-31`) is **defined and never called** — dead code; currency is emitted as a code, not a symbol.
- `styleSheet()` (`export-account.ts:34-39`) sets uniform `wch: 20` column widths, and **every one of its three callers immediately overwrites `ws['!cols']` on the next line** (`:155-156`, `:184-186`, `:219-220`) — the width half of the helper is dead, only the freeze half has effect.
- `ws['!freeze']` (`export-account.ts:38`, `export-lists.ts:72`, 228, 302): frozen panes are **not written by the community `xlsx` build**, so the "frozen headers" documented in both file headers are very likely a silent no-op in the produced workbooks.
- `phone` search parameter is handled in `executeZohoTool` (`zoho.ts:282`) but omitted from the tool schema (`ai-tools.ts:6-44`) — the model cannot reach it.
- `getAllRecordPages` bypasses `executeZohoTool` (`zoho.ts:245`), so browse-mode calls skip the mapping layer the rest of the codebase goes through.

**Half-built / risky paths**
- Zero rate-limit or backoff handling anywhere in the Zoho layer; the sole retry is one blind re-attempt after a session reset (`zoho.ts:147-158`).
- `catch { break }` in both paginators (`zoho.ts:221`, 254) converts transient Zoho failures into **silently truncated result sets** — this is the most likely source of "missing records" bugs in lists and reports.
- SSE branch evaluated before `res.ok` (`zoho.ts:75-96`), and only the last `data:` line retained — error responses with an event-stream content-type resolve as `null` instead of throwing.
- `executeZohoTool` default case returns an error **object** instead of throwing (`zoho.ts:352-353`).
- `call_renewal_function` returns `res.json()` with no `res.ok` check (`zoho.ts:348-349`) — a Zoho function failure surfaces as an unexpected payload shape rather than an error.
- JSON-RPC `id: Date.now()` (`zoho.ts:47`) is not collision-safe and is never used for response correlation.
- Single module-global MCP session shared across all concurrent requests (`zoho.ts:25-27`); a `resetSession()` triggered by one user's failed call invalidates the in-flight session for every other user.
- Schema evolution has no migration framework — `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` appended inline (`db.ts:193-212`), with no mechanism for renames, type changes, drops, or backfills.
- `notification_dismissals` rows are documented as "older than 30 days are automatically ignored" (`db.ts:175-176`) but nothing prunes them — unbounded growth.
- `pay_on_card` (`db.ts:205`) has no corresponding role-table column and no `perm_` sibling — it sits alone in the override block, suggesting a feature added mid-flight.
- Trash/NFR/Evaluation filtering rules are implemented in **three** independent places with **different** rule sets: the prompt (`ai-tools.ts:334`, 366-367 — excludes NFR, Educational, Evaluation, Home Use), the accounts export (`export-lists.ts:117` — excludes NFR, Educational, Home Use, **not** Evaluation), and post-fetch Trash filtering left to each caller. No shared predicate.
- `exportAccountsList` and `exportInvoicesList` take `any[]` with eslint-disable comments (`export-lists.ts:33`, 164) while `exportLeadsList` is properly typed — the list-export layer is half-migrated to typed view models.
- `formatDate` duplicated between the two export modules (`export-account.ts:19-23`, `export-lists.ts:22-26`).
- No TODO/FIXME/HACK comments exist in any of the six files; the incomplete work is all implicit.

### PATCH for section 3 — src/lib/export-lists.ts

`src/lib/export-lists.ts` is 308 lines and exports three client-side XLSX generators built on SheetJS (`import * as XLSX from 'xlsx'`). All three run in the browser, build an array-of-arrays sheet, and finish with `XLSX.writeFile(...)` using a `new Date().toISOString().slice(0, 10)` date stamp in the filename. A shared `formatDate` helper (`:22-26`) renders ISO strings as `DD/MM/YYYY` (Australian convention) and returns `''` for anything non-string or falsy. Every export prepends its active filter context as leading label/value rows, then a blank spacer, so the sheet is self-describing for audit.

- **`exportAccountsList(accounts, filters?, onProgress?)`** (`:33-159`, async) — builds three sheets. The `Accounts` sheet (`:41-73`) carries Account Name / Email Domain / Country / Reseller / Owner, a `Total Accounts` footer, fixed column widths, and a freeze pane computed from the filter-row offset. It then walks the account list in **parallel batches of 5** (`BATCH_SIZE`, `:85-140`), fetching `/api/accounts/${accId}` per account inside a `Promise.all`, to trade off export speed against browser/API concurrency limits; `onProgress?.(current, total)` fires once per batch. Per account it collects contacts (skipping `Record_Status__s === 'Trash'`) and active assets, filtering out any product whose lowercased name contains `nfr`, `educational`, or `home use`. A per-account `try { } catch { }` (`:128`) silently drops accounts whose fetch or parse fails, so a partial API outage yields a short export rather than an error. Results merge into the `Contacts` sheet (`:143-147`) and `Assets` sheet (`:150-155`, with `Total Assets` and a summed `Total Quantity`). Output: `Accounts Export - YYYY-MM-DD.xlsx`.
- **`exportInvoicesList(invoices, filters?)`** (`:164-245`, sync) — one sheet, and the sheet is named **`Orders`**, not Invoices (`:241`), with the file written as `Orders Export - <status|All> - YYYY-MM-DD.xlsx` (`:244`). This is the file-level footprint of the Invoices → Orders visual rename; the parameter, the Zoho field names it reads (`Reference_Number`, `Invoice_Date`, `Invoice_Type`, `Grand_Total`), and the `Order #` column header all still speak the internal `Invoice` vocabulary. Columns: Order # / Subject / Account / Date / Type / Status / Currency / Total / Reseller. Below the rows it emits one totals line **per currency** (`:189-196`, summing `Grand_Total` into `totalsByCurrency`, defaulting a missing currency to `AUD`), then `Total Orders` and an indented per-`Invoice_Type` count breakdown (`:199-203`, `:222`). Two loops (`:231-239`) force cell type `'n'` on column 7 across both the data rows and the totals rows so Excel treats amounts as numbers rather than text.
- **`exportLeadsList(leads, filters?)`** (`:250-308`, sync) — the one fully typed export; its `leads` parameter has an explicit inline element type rather than `any[]`. Twelve columns across leads and prospects, with `_source` driving both the `Type` cell (`Lead` vs `Prospect`) and a two-way split of the Product Interest / Evaluations columns (`:269-270`). Footer gives `Total` plus indented `Leads` and `Prospects` sub-counts. Output: `Leads Export - YYYY-MM-DD.xlsx`.

The merge's only change to this file was commit `dce38c4`, and it is purely a lint-correctness fix with **no runtime effect**. Both `exportAccountsList` and `exportInvoicesList` had an `// eslint-disable-next-line @typescript-eslint/no-explicit-any` sitting on the line immediately above `export function …`, while the `any[]` it was meant to cover was a line further down on the parameter itself. The directive therefore suppressed nothing: ESLint reported the `any[]` as a `no-explicit-any` error *and* the stray directive as an `Unused eslint-disable directive` warning — 2 errors + 2 warnings total. Moving each directive down onto the `accounts: any[]` (`:34-35`) and `invoices: any[]` (`:165-166`) lines makes it do what was intended. The `any` is retained deliberately: the commit frames it as tracked debt, greppable by the directive, to be removed once the Zoho return shapes are properly typed. Net effect on `npm run lint` is 2 errors and 2 warnings cleared.

### Update 2026-08-12 (`24b19d7`) — the MCP path variable is `recordId`, and why nothing noticed

Every `ZohoCRM_getRecord` call in the app was sending the path variable `recordID`. Zoho's tool schema requires `recordId`. `24b19d7` renamed it at all 7 call sites — `lib/zoho.ts:295` (inside `executeZohoTool`'s `get_record` branch), `api/contacts/route.ts`, `api/evaluations/route.ts`, `api/reports/route.ts` (×2) and `api/resellers/route.ts` (×2).

The failure mode is worth understanding, because it is a property of this transport layer and will recur:

1. Zoho answers a wrong path variable with the **plain-text** string `Mandatory path variable "recordId" is not present in tool body.`
2. It returns that with **HTTP 200** and **`isError: false`** at the tool level.
3. `parseMcpResult` (`zoho.ts:175-192`) walks `content[].text`, `JSON.parse` throws on that text, the `catch { /* skip */ }` swallows it, and the function falls through to its `return { data: [], moreRecords: false, page: 1 }` floor.
4. The route returns `200` with a `null` record. **Nothing reaches the logger.**

So every record detail view rendered "not found" while the API looked healthy. Two structural facts made a one-character typo invisible for months and are still true at HEAD: **nothing anywhere checks the MCP tool-level `isError` flag**, and `parseMcpResult`'s empty-result floor is indistinguishable from a genuine empty result. Add that to §3.1's list of transport weaknesses alongside the SSE ordering bug.

Left deliberately untouched: the 8 remaining `recordID` references in the codebase belong to the app's **own** `/api/attach-file` request-body contract, not to any Zoho path variable. Do not "fix" those.


---

## 4. API: Auth, Users, Resellers, Contacts

Ten route files covering session/credential handling, portal user CRUD, reseller (partner org) CRUD + portal registration, Zoho contact creation, and a DB bootstrap endpoint. Two backends are in play: **PostgreSQL** (users, resellers registry, roles, permission overrides, audit log) and **Zoho CRM via MCP** (`Resellers`, `Contacts`, `Accounts` modules). Auth is a JWT in an HTTP-only cookie named `recivis-token`; every protected handler starts with `requireAuth(request)` and treats a `NextResponse` return as the 401 short-circuit.

| Endpoint | Methods | Backend | Auth as coded | State |
|---|---|---|---|---|
| `/api/auth` | GET, POST | Postgres | GET: cookie JWT; POST: public | Complete (POST has a demo fallback path) |
| `/api/auth/logout` | POST | none | public | Complete |
| `/api/auth/forgot-password` | POST | Postgres (via `requestPasswordReset`) | public | Complete route; delivery unverified here |
| `/api/auth/reset-password` | POST | Postgres (via `resetPassword`) | public + token in body | Complete |
| `/api/users` | GET, POST | Postgres | `canManageUsers \|\| isAdmin` | Complete |
| `/api/users/[id]` | PATCH, PUT | Postgres | `canManageUsers \|\| isAdmin` | Complete; **no GET, no DELETE** |
| `/api/resellers` | GET, POST | Zoho + Postgres + Redis | GET: any authed user (**no scoping**); POST: admin only | GET complete but permission gap; POST complete |
| `/api/resellers/[id]` | GET, PATCH, POST | Zoho + Postgres | GET: admin or `allowedResellerIds`; PATCH/POST: admin | Complete; PATCH is a 3-mode overload; **no DELETE** |
| `/api/contacts` | POST | Zoho (+ Zoho account lookup) | authed; account-ownership check for non-admins | Partial — create only, `Title` accepted then dropped |
| `/api/setup` | GET | Postgres | **none** | Complete but unguarded bootstrap |

### `/api/auth` — login and session refresh

`src/app/api/auth/route.ts`

**GET** takes no input. Calls `requireAuth`; on failure returns `{ user: null }` with **401** (it deliberately rewrites the helper's 401 body rather than returning it). On success returns `{ user: AuthUser }` — the full object including freshly recomputed `permissions` and `allowedResellerIds`. Per the file header this is called on app mount so the localStorage-persisted user picks up server-side permission changes.

**POST** body `{ email, password }`. Steps:
1. Missing `email` → 400 `Email is required`.
2. `seedAdminUsers()` (idempotent seed of default roles + admin users) runs on every login attempt inside a try/catch.
3. **If seeding throws** (read: DB unavailable), it logs a warning and drops into a hardcoded fallback map — `joshua.boak@civilsurveysolutions.com.au` → Josh Boak/`admin`, `andrew.english@civilsurveyapplications.com.au` → Andrew English/`ibm`. A match returns `{ user: {email,name,role}, demo: true }` with **no JWT and no cookie**, so every subsequent protected call 401s. Non-matching email → 503 `Database not available`.
4. Missing `password` → 400 `Password is required`.
5. `authenticateUser(normalizedEmail, password)` (bcrypt compare). Null → `auditLog(null, email, 'login_failed', ...)`, warn log, 401 `Invalid email or password` (uniform message, no email-existence disclosure).
6. Success → `auditLog(..., 'login_success')`, response `{ user }`, and `recivis-token` cookie set: `httpOnly`, `secure` only when `NODE_ENV === 'production'`, `sameSite: 'lax'`, `path: '/'`, `maxAge` 86400 (comment says this matches JWT expiry).

Catch-all → 500 `Authentication failed. Please try again.`

### `/api/auth/logout`

`src/app/api/auth/logout/route.ts` — 13 lines. **POST**, no body, no auth check. Returns `{ success: true }` and overwrites `recivis-token` with an empty value at `maxAge: 0`. Purely cookie clearing; there is no server-side token revocation or blacklist, so a copied JWT stays valid until expiry.

### `/api/auth/forgot-password`

**POST** `{ email }`. Missing email → 400. Otherwise delegates entirely to `requestPasswordReset(email)` from `@/lib/auth`, logs `Password reset requested for ${email}`, and **always** returns 200 `{ message: 'If an account with that email exists, a reset link has been sent.' }` regardless of whether the account exists. Errors → 500 `Something went wrong. Please try again.` The route never inspects the return value of `requestPasswordReset`, so token generation/email dispatch behaviour lives in `src/lib/auth` (not documented here).

### `/api/auth/reset-password`

**POST** `{ token, password }`. Either missing → 400 `Token and new password are required`. `password.length < 8` → 400 `Password must be at least 8 characters` (hand-rolled, not Zod — the other write routes use Zod). Calls `resetPassword(token, password)`; `{ success: false }` → 400 with the library's `result.error` passed through verbatim. Success → 200 `{ message: 'Password has been reset. You can now log in.' }`. Errors → 500. Note the success log is deliberately identity-free (`'Password reset completed'`).

### `/api/users` — list and create

`src/app/api/users/route.ts`

Both methods gate on `requireAuth` then `!user.permissions.canManageUsers && !isAdmin(user)` → 403 `Forbidden`.

**GET** query params `resellerId`, `includeChildren=true`. Builds one SQL statement against Postgres joining `users` → `user_roles` → `resellers`, selecting `id, email, name, is_active, last_login, created_at, user_role, user_role_display, reseller_name, reseller_id`. Three shapes:
- no `resellerId` → all users;
- `resellerId` + `includeChildren` → `WHERE u.reseller_id = $1 OR u.reseller_id IN (SELECT id FROM resellers WHERE distributor_id = $1)` (distributor sees its children);
- `resellerId` alone → that reseller only.

Always `ORDER BY u.created_at DESC`. Returns `{ users: rows }`. Errors → 500 `Failed to load users`. The `resellerId` param is **not** cross-checked against `user.allowedResellerIds` — any user who passes the `canManageUsers` gate can list any reseller's users by passing its ID.

**POST** body validated by `createUserSchema`: `email` (email format), `password` (min 8), `name` (min 1), optional `resellerId`, optional `userRoleName`. Validation failure → 400 with the Zod message. Then, in order:
1. If `userRoleName` given, `SELECT id FROM user_roles WHERE name = $1`; no row → 400 `Unknown user role: X`.
2. If `resellerId` given, `SELECT id FROM resellers WHERE id = $1`; no row → 400 `Reseller not found: X`.
3. Duplicate email check on lowercased/trimmed email → **409** `A user with this email already exists`.
4. `createUser(email, password, name, resellerId || 'csa-internal', userRoleId)` — **`csa-internal` is the default reseller** when none supplied.
5. `auditLog(null, email, 'user_created', 'Created by admin. Role: ...')` and an info log.

Returns `{ success: true, user: { id, email, name, role: userRoleName || 'standard' } }`. Errors → 500, echoing `error.message` when it is an `Error`.

### `/api/users/[id]` — update and admin password reset

`src/app/api/users/[id]/route.ts`. `params` is a Promise (Next 15 style) and is awaited. Same `canManageUsers || isAdmin` gate on both methods. **No GET and no DELETE exist** — user deactivation is done via `PATCH { is_active: false }`.

**PATCH** body validated by `updateUserSchema`: optional `name`, `is_active`, `user_role_name`, `reseller_id`. Builds a dynamic `UPDATE users SET ...` with positional params from whichever fields are present:
- `name`, `is_active` → set directly;
- `user_role_name` → resolved to `user_role_id` via `user_roles`; **if the role name doesn't exist the clause is silently skipped** rather than erroring, so a typo'd role reports success with no change;
- `reseller_id` → set, coercing empty string to `NULL`.

Zero recognised fields → 400 `No fields to update`. Always appends `updated_at = NOW()`. After the write it re-selects the user's email purely to write `auditLog(parseInt(id), email, 'user_updated', 'Fields: ...')`. Returns `{ success: true }`; no updated row is echoed. Errors → 500 `Failed to update user`. No existence check on `id`, so updating a nonexistent user returns success with 0 rows affected.

**PUT** body validated by `resetPasswordSchema` (`password`, min 8). Hashes with `bcrypt.hash(password, 12)`, `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`, then audit-logs `password_reset_by_admin`. Returns `{ success: true }`. Errors → 500 `Failed to reset password`. This is the admin path; the token-based self-service path is `/api/auth/reset-password`.

### `/api/resellers` — list and create partner orgs

`src/app/api/resellers/route.ts`. **Resellers are Zoho-owned records**; Postgres holds only the portal-side registry (roles, permission overrides, `pay_on_card`, `distributor_id`).

**GET** query params `resellerId`, `includeChildren`. Flow:
1. `requireAuth`. `const user = authResult` is assigned but **never used** — there is no per-user scoping. The three access patterns described in the file header ("Admin: all / Distributor: own+children / Standard: own only") are driven purely by client-supplied query params, so any authenticated user can omit `resellerId` and receive the full reseller list.
2. Redis cache lookup on key `resellers:${resellerId || 'all'}:${includeChildren}`; a hit returns immediately.
3. Zoho fetch, requesting fields `Name,Region,Currency,Partner_Category,Distributor,Record_Status__s`:
   - `resellerId` + `includeChildren` → `Promise.all` of `ZohoCRM_getRecord` (own) and `ZohoCRM_searchRecords` with `criteria: (Distributor:equals:<id>)`, results concatenated (comment notes Zoho can't easily OR a lookup with `equals:id`);
   - `resellerId` alone → single `ZohoCRM_getRecord`;
   - neither → `ZohoCRM_getRecords` with `per_page: 200, sort_order: 'asc'` (**hard cap at 200 — no pagination**).
4. Every branch filters out `Record_Status__s === 'Trash'`, maps through the local `mapReseller` → `{ id, name (default 'Unknown'), region, currency, partner_category, distributor_id }`, then sorts by `name.localeCompare`.
5. Enrichment: one Postgres query `SELECT reseller_id, COUNT(*) FROM users WHERE is_active = true GROUP BY reseller_id`, and the `csa-internal` count is folded into the Zoho CSA ID (`55779000000560184`) before each reseller gets `user_count`. Wrapped in a bare `try {} catch { /* non-critical */ }`, so a DB outage silently yields no counts.
6. `cacheSet(key, { resellers }, 300)` — 5-minute TTL — then returns `{ resellers }`.

Errors → 500 with `error.message` echoed. Note `mapReseller` returns `currency` but the local type annotation on `resellers` omits it, and `user_count` is bolted on via a `Record<string, unknown>` cast.

**POST** admin-only (`isAdmin` → else 403). Body is **not validated** — the raw JSON object is passed straight through as a Zoho record: `executeZohoTool('create_records', { module: 'Resellers', records: [body], trigger: [] })`. `trigger: []` means Zoho workflows are suppressed (contrast with `/api/contacts`, which uses `trigger: ['workflow']`). On `code === 'SUCCESS'` it logs, calls `cacheInvalidatePattern('resellers:*')`, and returns `{ success: true, id }`. Non-success → 400 `{ success: false, error: 'Failed to create reseller', data }`. Errors → 500. Creating a reseller in Zoho does **not** create the Postgres row — that is a separate step (`POST /api/resellers/[id]`).

### `/api/resellers/[id]` — detail, update/sync/permissions, portal registration

`src/app/api/resellers/[id]/route.ts` (384 lines, the densest file in this group). Throughout, the CSA org has two identities that are mapped back and forth: `CSA_INTERNAL_ID = 'csa-internal'` (Postgres) and `CSA_ZOHO_ID = '55779000000560184'` (Zoho).

**GET** — the only route in this group with real row-level scoping. Non-admins must have the id (or its CSA-mapped equivalent) in `user.allowedResellerIds`, else 403 `Not authorized to view this reseller`. Then five reads:
1. Zoho `get_record` on `Resellers` using `zohoId` (`csa-internal` → CSA Zoho ID).
2. Postgres `resellers` LEFT JOIN `reseller_roles` over `IN (zohoId[, csa-internal])` `LIMIT 1` → `dbRecord`, which establishes `dbRegistered`.
3. Postgres `reseller_roles WHERE is_system_role = false ORDER BY id`, selecting all twelve permission columns — these feed the registration form's role picker.
4. If registered, a second query for the twelve `perm_*` override columns → `permissionOverrides` (nullable tri-state; `null` = inherit role default).
5. Postgres users for the reseller, joining `user_roles` and `resellers`; for CSA it queries both IDs. Note `userIds` starts as `[id]` and then *pushes both* CSA ids, so a CSA request produces a 3-element list with one duplicate — harmless for `IN`.

Response: `{ reseller, users, dbRegistered, dbRole: {name, display} | null, availableRoles, permissionOverrides, payOnCard }`. Errors → 500 `Failed to load reseller`. A Zoho miss yields `reseller: null` with a 200, not a 404.

**PATCH** — admin-only, and **overloaded into three modes selected by magic flags in the body**:

- `body._syncDistributor` → **Zoho → Postgres sync.** Re-fetches the Zoho record, then `UPDATE resellers SET region, currency, partner_category, name, email, updated_at` on the DB-side id. If Zoho has a `Distributor` whose id already exists in Postgres, sets `distributor_id`. Then backfills children: `ZohoCRM_searchRecords` `(Distributor:equals:<zohoId>)` and, for each, `UPDATE resellers SET distributor_id = <this> WHERE id = $2 AND distributor_id IS NULL` (only fills blanks, never overwrites). The child backfill is in a silent `catch {}`. Returns `{ success: true }`. Minor smell: `zohoId` is declared at the top of the try and **shadowed** by an identical `const zohoId` inside this branch (line 175 vs 139).
- `body._updatePermissions` → **Postgres-only permission override write.** Optional `reseller_role_id`, plus eleven `perm_*` booleans coerced by `toNullableBool` (anything not literally `true`/`false` becomes `null` = inherit). All eleven are written unconditionally on every call, so omitting a key **resets that override to null**. `perm_max_evaluations_per_account` is written as `Number(...)` or null. `pay_on_card` is written only when present and is flagged in a comment as portal-only with no Zoho equivalent. Targets the DB id (CSA Zoho id → `csa-internal`). Returns `{ success: true }`.
- otherwise → **Zoho update.** `executeZohoTool('update_records', { module: 'Resellers', records: [{ id: zohoId, ...body }], trigger: [] })`, returning `{ success: true, data }`. The parsed result is never checked for `code === 'SUCCESS'`, so a Zoho-side rejection still reports success. Body is unvalidated.

Errors → 500 `Failed to update reseller`.

**POST** — **registers an existing Zoho reseller into Postgres** (this is what makes `dbRegistered` true and what gives the org a `reseller_role`). Admin-only. Body: `{ name, email, region, currency, partner_category, direct_customer_contact, distributor_id, reseller_role_id, permissions }`, unvalidated except `reseller_role_id` required → else 400. Then:
1. Already in `resellers` → **409** `Reseller is already registered in the portal`.
2. If `distributor_id` given but not itself registered → 400 `Distributor must be registered in the portal first`.
3. One `INSERT INTO resellers (...22 columns...)` with `is_active = true`, the ten `perm_*` booleans via `toNullableBool`, and `perm_max_evaluations_per_account` as number-or-null. Note only ten `perm_` booleans are inserted here versus eleven in the PATCH permissions branch — `perm_send_invoices` etc. line up, but the insert list and the PATCH list were written separately and should be diffed if drift matters.
4. Info log with `by: user.email`.
5. Best-effort relationship fix-up in a `try/catch` that only warns: Zoho search for children (`Distributor:equals:<id>`) and `UPDATE ... WHERE distributor_id IS NULL` for each; and, if no `distributor_id` was supplied, re-fetch this record from Zoho and set `distributor_id` if the parent is already registered. The inline comment explains this exists because children are often registered before their distributor.

Returns `{ success: true }` (no created row echoed). Errors → 500 `Failed to register reseller`.

### `/api/contacts` — create Zoho contact

`src/app/api/contacts/route.ts`. **POST only.** Contacts are entirely a **Zoho CRM** concern; nothing is written to Postgres and there is no local contacts table involved.

Body validated by `createContactSchema`: `First_Name` (required), `Last_Name` (required), optional `Email` (email format), `Phone`, `Title`, `Account_Name: { id }`. Failure → 400.

Ownership check: when `Account_Name.id` is present **and** the caller is not admin **and** `allowedResellerIds.length > 0`, it fetches the account from Zoho requesting only the `Reseller` field and 403s `Cannot create contacts for this account` if the account's reseller is outside `allowedResellerIds`. Two gaps as coded: a user with an empty `allowedResellerIds` skips the check entirely, and an account whose `Reseller` is unset also passes.

It then rebuilds a whitelist payload — `First_Name`, `Last_Name`, plus `Email`/`Phone`/`Account_Name` only when truthy. **`Title` is validated but never copied into `contactData`, so it is silently dropped.** Create runs with `trigger: ['workflow']`, which the header notes is deliberate so Zoho workflows (e.g. email-domain extraction) fire.

Response: on `code === 'SUCCESS'`, `{ success: true, id: created.details.id }`; otherwise `{ success: true, data: parsed.data }` — **still `success: true` on a non-success Zoho code**, which is a real reporting bug for callers. Errors → 500 `Failed to create contact`.

Reading contacts is not here: `/api/search` searches the Zoho `Contacts` module, `/api/accounts/[id]` pulls contacts as a Zoho related list, and `/api/emails` iterates a Zoho account's Contacts. So contacts are read and written exclusively against Zoho.

### `/api/setup` — DB bootstrap

`src/app/api/setup/route.ts` — 20 lines. **GET only, no auth check of any kind, no params.** Calls `initDB()` (schema creation/migration) then `seedAdminUsers()`, returning `{ success: true, message: 'Database initialized and admin users seeded.' }` or 500 with the raw `error.message`. It is a one-time bootstrap hit manually after a fresh deploy to create tables and the seed admin accounts. Both operations are idempotent, so repeat calls are harmless — but the endpoint is publicly reachable and leaks raw DB error text on failure. `seedAdminUsers()` is also invoked on every `POST /api/auth`, so login effectively self-heals the seed; `initDB()` is additionally called inside `getAuthUser`.

### Summary

**What `/api/setup` is for.** A one-time, manually-triggered post-deploy bootstrap: `initDB()` + `seedAdminUsers()`. It is not wired into any UI flow and takes no input. Because `POST /api/auth` also calls `seedAdminUsers()` and `getAuthUser()` calls `initDB()`, the app largely bootstraps itself and `/api/setup` is a convenience/repair hatch rather than a required step.

**How users and resellers relate.** A `users` row (Postgres) has a `reseller_id` FK into `resellers` (Postgres) and a `user_role_id` into `user_roles`. A `resellers` row has a `reseller_role_id` into `reseller_roles` plus nullable per-org `perm_*` overrides, and a self-referential `distributor_id` giving a one-level distributor → child hierarchy. Effective permission is a three-layer AND/coalesce computed in `api-auth.ts`: per-reseller override `??` reseller-role default, ANDed with the user-role flag, with `admin`/`ibm` short-circuiting to true. `allowedResellerIds` is the user's own reseller plus, when `canViewChildRecords` holds, all active children — that is the scoping primitive the routes are supposed to use. Crucially the `resellers` **id is the Zoho record id**: the org is created in Zoho (`POST /api/resellers`), then separately "registered" into Postgres under the same id (`POST /api/resellers/[id]`). `dbRegistered: false` means a Zoho reseller exists that the portal doesn't yet know about. CSA itself is dual-identity — `csa-internal` in Postgres, `55779000000560184` in Zoho — and every route touching resellers hand-maps between the two. New users default to `csa-internal` when no reseller is passed.

**Do contacts come from Zoho.** Yes, exclusively. `POST /api/contacts` creates into the Zoho `Contacts` module with workflows triggered; reads happen via `/api/search`, the `/api/accounts/[id]` related list, and `/api/emails`. Nothing about contacts is persisted locally.

**Incomplete / notable as coded.** No literal `TODO`/`FIXME` markers anywhere in these ten files.
- **Hardcoded credentials-adjacent test data:** the two-entry `ADMIN_EMAILS` map inside `POST /api/auth` grants `admin`/`ibm` identity on email alone when the DB is down. It issues no JWT so the session is inert, but it is named production email addresses baked into a route.
- **Unused auth result:** `GET /api/resellers` binds `user` and never reads it — reseller list scoping is entirely client-driven via query params.
- **Unscoped `resellerId`:** `GET /api/users?resellerId=` is not checked against `allowedResellerIds`.
- **`/api/setup` is unauthenticated** and returns raw DB errors.
- **Silent successes:** `PATCH /api/users/[id]` skips an unknown `user_role_name` without erroring; `POST /api/contacts` returns `success: true` even when Zoho reports a non-SUCCESS code; the plain-update branch of `PATCH /api/resellers/[id]` never inspects the Zoho result.
- **Missing methods:** no `GET`/`DELETE` on `/api/users/[id]`, no `DELETE` on either resellers route, no `GET`/`PATCH`/`DELETE` on `/api/contacts`. Deactivation is `is_active = false` only.
- **Unvalidated bodies:** `POST /api/resellers`, and all three modes of `PATCH /api/resellers/[id]` plus `POST /api/resellers/[id]`, pass raw JSON to Zoho/SQL — inconsistent with the Zod-validated user and contact routes.
- **Overloaded PATCH:** `_syncDistributor` / `_updatePermissions` magic flags on `/api/resellers/[id]` do three unrelated jobs in one handler; `perm_*` columns are rewritten wholesale on every permissions call, so partial payloads reset overrides to `null`.
- **Zoho listing cap:** admin reseller listing is `per_page: 200` with no pagination.
- **Dropped field:** `Title` in `createContactSchema` never reaches Zoho.
- **Variable shadowing:** duplicate `const zohoId` in the `_syncDistributor` branch (lines 139 and 175).

### Update at `7865247` — variable-shadowing renames in three routes

Commits `6c0f8f0` (chat), `7568f9f` (emails) and `1e1352d` (attach-file) renamed local variables that shadowed the `module` global:

| Route | Old local | New local |
|---|---|---|
| `src/app/api/chat/route.ts` | `module` in `filterResultsForRBAC` | `moduleName` |
| `src/app/api/emails/route.ts` | `module` (two sites) | renamed |
| `src/app/api/attach-file/route.ts` | `module` | `moduleApi` |

**These are cosmetic — no behaviour, request shape, response shape or endpoint changed.** The Zoho attachment URL still resolves identically (`https://www.zohoapis.com.au/crm/v7/{module}/{recordID}/Attachments`, defaulting to `Invoices`). Everything sections 4, 6 and 7 say about these routes' behaviour remains accurate; only the identifier names in the source differ from any quoted snippet.

### Update 2026-08-12 — `GET /api/auth`'s projection changed, and two routes were fetching nothing

**`GET /api/auth` (`fd51770`).** This handler is now load-bearing in a way it was not before: with Zustand `persist` removed, it is the **only** way the client learns who it is, and it runs on every portal page load. Its shape changed to match. `src/app/api/auth/route.ts:29-41` is now `requireAuth(request)` → on `NextResponse`, return `{ user: null }` with **401** (it no longer 200s with a null user) → `getUserById(authResult.userId)` → `{ user }`. The point of the change is that `getUserById` runs the *same* `USER_PROJECTION_SQL` as login (§2.2), so a rehydrated session is byte-identical to a fresh one — previously the GET returned a thinner object than POST and the client papered over the difference with its localStorage copy. Consequence worth noting: permissions are recomputed from Postgres on every navigation to a fresh page load, so a permission change made in the admin UI now takes effect on the user's next reload rather than their next login.

**`recordId` (`24b19d7`).** Two routes in this section were sending the wrong MCP path variable and had been silently receiving nothing (see the §3 update note for the mechanism):

| Route | Call | Was |
|---|---|---|
| `api/contacts/route.ts:35-37` | `ZohoCRM_getRecord` on `Accounts`, fetching `Reseller` for the ownership check | `recordID` |
| `api/resellers/route.ts:54-56`, `:74-76` | `ZohoCRM_getRecord` on `Resellers` — own reseller, and the single-reseller branch | `recordID` |

The contacts case is the one with a security shape. `POST /api/contacts:33-45` validates account ownership for non-admins by reading the account's `Reseller`, and the guard is written `if (accReseller?.id && !user.allowedResellerIds.includes(accReseller.id)) → 403`. With the fetch returning nothing, `accParsed.data[0]` was `undefined`, `accReseller` was `null`, and the condition **short-circuited to false — the gate failed open** and every non-admin passed it. The same shape appears in `POST /api/evaluations:47-58` (§5). Both are now fetching real data, so the gates do what §4 and §5 have always described; the code was right, the data never arrived. Worth noting the pattern for future guards: `?.` on a value that may be missing for infrastructure reasons turns an authorisation check into a no-op silently.


---

## 5. API: Accounts, Leads, Evaluations, Products, Currencies

### Endpoint summary

| Route | Methods | Backend | Auth as coded | Completeness |
|---|---|---|---|---|
| `/api/accounts` | GET, POST | Zoho `Accounts` (MCP) | `requireAuth`; GET applies reseller RBAC; POST none beyond auth | GET complete; POST partial (no RBAC, no field allowlist) |
| `/api/accounts/[id]` | GET, PATCH | Zoho `Accounts` + related `Contacts`/`Assets`/`Invoices` | `requireAuth` + `canManageReseller` on both verbs | Complete |
| `/api/leads` | GET, POST | Zoho `Leads` + `Accounts` (Prospect) + `Assets1` | `requireAuth`; POST auto-assigns reseller for non-admins | GET partial (**no RBAC scoping**); POST complete |
| `/api/leads/[id]` | GET, PATCH, POST (convert) | Zoho MCP for GET/PATCH; **Zoho REST v7** for convert | `requireAuth`; PATCH gates `Reseller` field; POST admin-only | GET/POST complete; GET+PATCH have **no per-record RBAC** |
| `/api/evaluations` | POST | Zoho `Assets1` + Deluge `qlminterfacemasspushkeydetails` | `requireAuth` + `canCreateEvaluations` + `canExtendEvaluations` + `maxEvaluationsPerAccount` | Partial (2s sleep, best-effort ID extraction) |
| `/api/products` | GET | Zoho `Products` + Redis cache | `requireAuth` only | Complete but narrow (SKU-exact only) |
| `/api/currencies` | GET | Zoho `getCurrencies` + Redis cache | `requireAuth` only | Complete, with hardcoded fallback |

No route implements PUT or DELETE. `/api/products` and `/api/currencies` are GET-only; `/api/evaluations` is POST-only (no list/read/delete of evaluations).

### `/api/accounts` — list and create

`src/app/api/accounts/route.ts`

**GET.** Query params: `search` (string), `resellerId` (single Zoho reseller id), `resellerIds` (comma-separated). No page/limit params — the route always fetches *all* pages via `searchAllPages` / `getAllRecordPages`, capped at `MAX_ZOHO_PAGES = 10` × 200 = 2000 records. Response: `{ accounts: Record<string,unknown>[] }` — raw Zoho records, not remapped.

Field set requested: `Account_Name, Billing_Country, Reseller, Email_Domain, Owner, Account_Type, Created_Time, Record_Status__s`.

Steps:
1. `requireAuth`; 401 on failure.
2. Build `resellerCriteria` from `resellerId`, else `resellerIds` (single → `(Reseller:equals:id)`, multiple → OR-joined group).
3. RBAC override: if `!isAdmin(user)`, the caller-supplied criteria is **discarded** and replaced with the user's `allowedResellerIds`. Empty list short-circuits to `{ accounts: [] }` with 200.
4. Branch on four query shapes:
   - `search && resellerCriteria` → `searchAllPages('Accounts', '((Account_Name:starts_with:<search>)and<resellerCriteria>)', fields, 'desc')`
   - `search` only → direct `callMcpTool('ZohoCRM_searchRecords', { word: search, fields, page })` in a manual `for (page 1..10)` loop, breaking on `!moreRecords` or on any thrown error (`catch { break }`)
   - `resellerCriteria` only → `searchAllPages` with just the criteria
   - neither → `getAllRecordPages('Accounts', fields, 'Modified_Time', 'desc')`
5. Filter out `Record_Status__s === 'Trash'` and `Account_Type === 'Prospect'` (prospects live in the leads view instead).

Errors: single try/catch → `{ error: 'Failed to load accounts' }` 500. `search` is interpolated straight into the Zoho criteria string with no escaping.

**POST.** Body is the raw Zoho record object, passed through **unfiltered** as `records: [body]` to `executeZohoTool('create_records', { module: 'Accounts', trigger: [] })`. `trigger: []` deliberately suppresses Zoho workflows (header comment: workflows fire on the contact creation that follows). No RBAC check and no reseller auto-assignment (contrast with `/api/leads` POST, which does auto-assign). Success path returns `{ success: true, id }` from `details.id` when `code === 'SUCCESS'`; otherwise logs a warning and still returns `{ success: true, data: parsed.data }` — i.e. **a Zoho-level failure is reported to the client as success**. Catch → 500 `Failed to create account`. `const user = authResult` is assigned but unused in POST.

### `/api/accounts/[id]` — detail and update

`src/app/api/accounts/[id]/route.ts`

**GET.** Path param `id`. No query params. Four `executeZohoTool` calls in `Promise.all`:
- `get_record` on `Accounts`
- `get_related_records` → `Contacts` (`Full_Name, First_Name, Last_Name, Email, Phone, Title, Record_Status__s`)
- `get_related_records` → `Assets` (`Name, Product, Status, Start_Date, Renewal_Date, Quantity, Serial_Key, Reseller, Upgraded_To_Key, Upgraded_From_Key, Renewal_Invoice_Generated, Not_Renewing_Asset, Revoked, Revoked_Reason, Evaluation_License, Educational_License, Record_Status__s`)
- `get_related_records` → `Invoices` (`Subject, Reference_Number, Invoice_Date, Status, Grand_Total, Currency, Invoice_Type, Record_Status__s`)

A local `parseResult` helper duplicates `parseMcpResult`'s JSON-unwrapping (returns `parsed.data || []`, drops the `more_records` info — so related lists are single-page only).

RBAC: if an account was found and `!isAdmin(user)`, requires `account.Reseller.id` present and `canManageReseller(user, id)`; else 403 `This account is assigned to another reseller`. Note the check is guarded by `if (account && ...)` — a null account skips RBAC and returns `{ account: null, ... }` with 200.

Asset bucketing:
- Drop `Record_Status__s === 'Trash'` and any asset with `Upgraded_To_Key` set (superseded by an upgrade).
- `isEvalAsset`: `Evaluation_License === true`, **or** the product name / asset `Name` lowercased contains `"evaluation"` — a string heuristic, not a field check.
- `activeAssets` = `Status === 'Active'` && !eval; `evaluationAssets` = `Status === 'Active'` && eval; `archivedAssets` = `Status !== 'Active'` (mixes eval and non-eval).

Response: `{ account, contacts, evaluationAssets, activeAssets, archivedAssets, invoices }`. Catch → 500 `Failed to load account`.

**PATCH.** RBAC first: non-admins trigger an extra `get_record` on the account to read `Reseller.id`, then `canManageReseller`, else 403. Writable fields (each guarded by `!== undefined`): `Primary_Contact`, `Secondary_Contact` (coerced to `{ id }` or `null`), `Billing_Street`, `Billing_City`, `Billing_State`, `Billing_Code`, `Billing_Country`, `Reseller` (→ `{ id }` or `null`). Anything else in the body is ignored. Calls `update_records` with `trigger: []`. Returns `{ success: true, data: parsed.data }` unconditionally — the Zoho per-record `code` is never inspected, so failed updates return 200. Catch → 500.

Notable: a non-admin can PATCH `Reseller` to reassign the account away from themselves; only the *current* owner is checked, not the target.

### `/api/leads` — unified leads list and create

`src/app/api/leads/route.ts`

This route merges two different Zoho entities into one list: unconverted `Leads` records and `Accounts` where `Account_Type = 'Prospect'`.

**GET.** Query params: `search`, `resellerId`, `resellerIds`, `status`, `evaluation`. No pagination params; response is the full merged array `{ leads: UnifiedLead[] }`.

`UnifiedLead` shape (normalized, unlike `/api/accounts`): `{ id, _source: 'lead'|'prospect', name, contactName, email, phone, country, leadStatus, productInterest, leadSource, reseller: {name,id}|null, owner: {name}|null, evaluations: string[], createdTime }`.

Steps:
1. `requireAuth`.
2. Build `resellerCriteria` from `resellerId`/`resellerIds` exactly as in `/api/accounts` — but **there is no `isAdmin` override here**. `isAdmin` is imported and used only in POST. A non-admin GET returns leads/prospects for every reseller unless the client happens to pass a filter. This is the clearest RBAC gap in the set.
3. Fetch Zoho `Leads` (`LEAD_FIELDS = Company, Full_Name, First_Name, Last_Name, Email, Phone, Country, Lead_Status, Lead_Source, Product_Interest, Reseller, Owner, Created_Time, Record_Status__s, Converted__s`) via the same four-way branch as accounts (`starts_with` on `Company` when combined with reseller criteria; word-search loop when search-only). Wrapped in its own try/catch that logs `Leads fetch failed, continuing with prospects only` and proceeds with an empty array.
4. Filter leads: drop `Record_Status__s === 'Trash'` and any lead with `Converted__s` truthy.
5. Fetch prospect accounts (`PROSPECT_FIELDS = Account_Name, Billing_Country, Reseller, Email_Domain, Owner, Account_Type, Primary_Contact, Created_Time, Record_Status__s`) with criteria `(Account_Type:equals:Prospect)`, AND-ed with reseller criteria and/or `(Account_Name:starts_with:<search>)`. Own try/catch → warn and continue.
6. Evaluation enrichment for prospects: if any prospect ids exist, `searchAllPages('Assets1', '(Evaluation_License:equals:true)', 'Name,Product,Account,Evaluation_License,Record_Status__s')` — this pulls **every** evaluation asset org-wide (up to 2000) and then filters client-side by `prospectIds.includes(asset.Account.id)`. Each asset's product name goes through `categorizeEvalProduct`, a hardcoded substring matcher returning one of four buckets: `Civil Site Design Plus`, `Civil Site Design`, `Corridor EZ`, `Stringer` (order matters — "plus" is tested first); anything else → `null` and is dropped. Results accumulate into `evalMap: accountId → string[]`.
7. Normalize. Leads: `name` = `Company || Full_Name`, `evaluations` always `[]` (never populated for Leads-module records). Prospects: `leadStatus` hardcoded to `'Prospect'`, `email` filled from `Email_Domain` (a domain, not an address), `phone` hardcoded `''`, `productInterest`/`leadSource` hardcoded `''`, `contactName` from `Primary_Contact.name`.
8. Server-side post-filters on the merged array: `status` → exact `leadStatus` match; `evaluation` → `has-evaluation` / `no-evaluation` / a specific product name, each written as `l._source === 'lead' || <predicate>` so **Leads-module records always pass the evaluation filter** regardless of value.
9. Sort by `createdTime` descending.

The header comment claims a "region" filter is supported; no `region` param is read.

Errors: outer catch → 500 `Failed to load leads`. Because both fetches are individually caught, a total Zoho outage yields `{ leads: [] }` with 200.

**POST.** Body fields are allowlisted: `First_Name, Last_Name, Email, Phone, Mobile, Company, Website, Lead_Status, Industry, Product_Interest, Country, Street, City, State, Zip_Code, Lead_Source, Job_Title3, Description`. `Reseller` becomes `{ id: body.Reseller }` if supplied; otherwise for non-admins with a `user.resellerId` it auto-assigns to their own reseller. A non-admin *can* still pass an arbitrary `body.Reseller` and it is accepted unvalidated. No required-field validation (Zoho enforces `Last_Name`/`Company` itself). Calls `create_records` on `Leads` with `trigger: ['workflow']` — unlike accounts, lead workflows do fire. Same success-masking pattern: non-`SUCCESS` results still return `{ success: true, data }` 200. Catch → 500.

### `/api/leads/[id]` — detail, update, convert

`src/app/api/leads/[id]/route.ts`

**GET** `?source=lead|prospect` (default `lead`).
- `source=prospect`: same four-call `Promise.all` as `/api/accounts/[id]`, with a slightly smaller Assets field list (no `Upgraded_From_Key`, `Renewal_Invoice_Generated`, `Not_Renewing_Asset`, `Revoked*`). Asset bucketing differs from `/api/accounts/[id]`: `evaluationAssets` = strictly `Evaluation_License === true` (no name heuristic); `otherAssets` = not eval and no `Upgraded_To_Key`; then split by `Status === 'Active'`. Response `{ source:'prospect', account, contacts, evaluationAssets, activeAssets, archivedAssets, invoices }`.
- `source=lead`: single `get_record` on `Leads`, no related records. Response `{ source:'lead', lead }`.
- **No RBAC beyond `requireAuth`** — `isAdmin`/`canManageReseller` are not applied, so any authenticated user can read any lead or prospect account by id. The `parseResult` helper is defined twice inside this one function (once per branch), a third and fourth copy of the same logic.
- Catch → 500 `Failed to load lead`.

**PATCH.** Allowlisted direct fields: `First_Name, Last_Name, Email, Phone, Mobile, Company, Website, Lead_Status, Industry, Product_Interest, Country, Street, City, State, Zip_Code, Description, Job_Title3` (note: no `Lead_Source`, which POST does accept). `Reseller` is gated: requires `isAdmin(user) || user.permissions.canViewChildRecords`, else 403 `Insufficient permissions to change reseller`. `update_records` on `Leads` with `trigger: []`. Returns `{ success: true, data }` without checking per-record codes. No check that the lead belongs to the caller's reseller — only the `Reseller` field write is gated, not the record itself. Only handles `source=lead`; there is no PATCH path for prospect accounts (callers must use `/api/accounts/[id]`).

**POST — lead conversion.** Admin-only: `!isAdmin(user)` → 403 `Only administrators can convert leads`. This is the only route in the set that bypasses MCP and talks to the Zoho REST API directly.

Steps:
1. Parse body with `.catch(() => ({}))`; optional `overwrite` (default `false`), `notify_lead_owner` (default `true`), `notify_new_entity_owner` (default `true`).
2. Call `callMcpTool('ZohoCRM_getLeadConversionOptions', { path_variables: { leadId: id } })` and JSON-parse into `conversionOptions`. **`conversionOptions` is then never used** — dead code; failures only log a warning.
3. `getAccessToken()`: module-level `cachedToken` (1-hour TTL, 60s skew) populated by POSTing to a hardcoded Deluge function URL — `https://www.zohoapis.com.au/crm/v7/functions/getresellerzohotoken/actions/execute?auth_type=apikey&zapikey=$ZOHO_API_KEY&arguments={"resellerName":"Civil Survey Applications"}`. The reseller name and the `.com.au` datacentre are hardcoded. Token is read from `data.details.output` and rejected if it starts with `ERROR`. Comment notes this is the same pattern as `attach-file`, i.e. duplicated token logic.
4. `POST https://www.zohoapis.com.au/crm/v7/Leads/{id}/actions/convert` with `{ data: [{ overwrite, notify_lead_owner, notify_new_entity_owner }] }`. `Accounts`/`Contacts`/`Deals` target ids are deliberately omitted so Zoho creates fresh records from lead data. The doc comment says the call uses `trigger: ['workflow']`, but **no `trigger` key is actually sent** — workflow firing is left to Zoho's default.
5. Response handling: non-JSON body → 502 `Unexpected response from Zoho (HTTP n)`. `!res.ok` → clears `cachedToken` on 401, then 502 with `data.data[0].message || data.message || data.data[0].details.expected_data_type || 'Zoho API error: n'` plus raw `details`. Success → `{ success: true, accountId: result.Accounts, contactId: result.Contacts, data }`. `Deals` from the conversion result is ignored.
6. Catch → 500 with the raw error message.

### `/api/evaluations` — create an evaluation licence

`src/app/api/evaluations/route.ts`. POST only.

Body: `{ accountId, productId, quantity, endDate }` — all four required, else 400.

Permission and validation chain:
1. `requireAuth`.
2. `user.permissions.canCreateEvaluations` else 403.
3. `daysDiff = ceil((endDate - today) / 1 day)`; `> 30 && !canExtendEvaluations` → 403; `< 1` → 400 `End date must be in the future`. The 30-day cap is hardcoded in the route.
4. Account ownership: only when `!isAdmin(user) && allowedResellerIds.length > 0` — reads `Accounts.Reseller` via `ZohoCRM_getRecord` and 403s if the id isn't in `allowedResellerIds`. A non-admin with an *empty* `allowedResellerIds` skips this check entirely.
5. Quota: if `maxEvaluationsPerAccount !== -1` (−1 = unlimited, admins), fetches related `Assets1` (`fields: id,Evaluation_License`, `page 1`, `per_page 200` — single page only) and counts `Evaluation_License === true`; `>= max` → 403 with the limit in the message.

Creation flow:
1. Insert a placeholder into `Assets1` via `create_records` with `trigger: []`: `{ Name: 'placeholder', Account: {id}, Product: {id}, Serial_Key: String(Date.now()), Quantity: Number(quantity), Status: 'Active', Start_Date: today, Renewal_Date: endDate }`. Dates formatted `YYYY-MM-DD` via `toISOString().slice(0,10)` (UTC — can be off by a day for AEST callers). Field-name gotchas are called out in comments: `Name` not `Asset_Name`, `Renewal_Date` not `End_Date`. `Evaluation_License` is **not** set here — the Deluge function is expected to set it.
2. Unlike the other write routes, this one *does* check `created.code !== 'SUCCESS'` and returns 500 with the Zoho message.
3. `await new Promise(r => setTimeout(r, 2000))` — a hardcoded 2-second sleep "to wait for Zoho to fully commit the record". No retry or verification.
4. `POST https://www.zohoapis.com.au/crm/v7/functions/qlminterfacemasspushkeydetails/actions/execute?...&arguments={"assetID":<placeholderId>}` using `ZOHO_API_KEY` (missing key → 500). Hardcoded `.com.au` datacentre again.
5. The QLM response is **never checked for success** — no `qlmRes.ok` test. It is logged, then `details.output` is optimistically JSON-parsed for `assetId` or `id`; on any failure `finalAssetId` stays as the placeholder id.
6. Returns `{ success: true, id: finalAssetId }`.

Catch → 500 `Failed to create evaluation`. Partial-failure states are possible: the placeholder asset is left in Zoho if QLM fails, with no compensating delete.

### `/api/products` — SKU lookup

`src/app/api/products/route.ts`. GET only. Query param `sku` is **required** (400 `sku parameter required`), and the lookup is exact-match: `search_records` on `Products` with `criteria: (Product_Code:equals:<sku>)`, fields `id, Product_Name, Product_Code, Unit_Price, Product_Active`. There is no browse/list-all, no name search, and no pagination.

Redis cache via `cacheGet`/`cacheSet` on key `products:<sku>` with a 600s TTL, checked before Zoho and written after. Results are filtered to `Product_Active !== false` (so records missing the field are kept). Response `{ products }`.

Error handling swallows everything: a bare `catch { return NextResponse.json({ products: [] }) }` — no logging, and a Zoho outage is indistinguishable from an unknown SKU. `const user = authResult` is unused.

### `/api/currencies` — exchange rates

`src/app/api/currencies/route.ts`. GET only, no params. Redis key `currencies:rates`, 3600s TTL, checked before Zoho.

Calls `callMcpTool('ZohoCRM_getCurrencies', {})` and hand-parses the MCP envelope (not `parseMcpResult`, since the payload is `parsed.currencies` rather than `parsed.data` — it tries both). Maps to `CurrencyRate { code, symbol, rate, name }` from `iso_code || ISO_code`, `symbol || '$'`, `Number(exchange_rate) || 1`, `name || currency_name`, filtering `is_active !== false`. If `AUD` is absent it is unshifted in at rate 1 (AUD is the home currency, so all rates are relative to it).

On any exception the route returns a **hardcoded fallback table** — AUD 1, USD 0.65, EUR 0.60, GBP 0.52, NZD 1.10, INR 54 — which is not cached and is silently stale. Errors are not logged.

### Cross-cutting: how the CRM surface actually behaves

**Lead lifecycle as implemented.** Two parallel notions of "lead" coexist. (a) A true Zoho `Leads` record: created by `POST /api/leads` with workflows enabled and reseller auto-assigned; edited via `PATCH /api/leads/[id]`; converted by `POST /api/leads/[id]`, which is admin-only and calls Zoho's native `actions/convert` to spawn an Account + Contact, returning their ids. Converted leads then disappear from the list because GET filters on `Converted__s`. (b) A "prospect": an `Accounts` record with `Account_Type = 'Prospect'`. Prospects are surfaced in the leads list with `leadStatus: 'Prospect'`, and are excluded from `/api/accounts` GET. **Nothing in these routes creates a prospect or promotes one to a customer account** — there is no `Account_Type` write path anywhere in this file set (`/api/accounts/[id]` PATCH does not allow `Account_Type`). Prospect creation and graduation happen outside these routes (Zoho workflows, or another part of the app). So the lifecycle is: lead → convert → account (native Zoho), with the prospect track being read-only from the portal's perspective apart from evaluation creation.

**Reseller scoping.** Scoping is expressed as Zoho search criteria on the `Reseller` lookup field, built from `user.allowedResellerIds` (computed in `api-auth` as the user's own `reseller_id` plus, when `canViewChildRecords`, the ids of active child resellers where `distributor_id = reseller_id`). Enforcement is inconsistent across the surface:
- `/api/accounts` GET — enforced, and client-supplied `resellerId`/`resellerIds` are overridden for non-admins.
- `/api/accounts/[id]` GET and PATCH — enforced per record via `canManageReseller`.
- `/api/leads` GET — **not enforced**; the reseller filter is purely client-driven.
- `/api/leads/[id]` GET and PATCH — **not enforced** per record; PATCH only gates writing the `Reseller` field.
- `/api/evaluations` — enforced, but skipped when `allowedResellerIds` is empty.
- `/api/products`, `/api/currencies` — no scoping needed (org-global reference data).

Admins (`role === 'admin' || 'ibm'`) bypass all of it.

**What an "evaluation" is.** A time-limited licence, modelled as a Zoho `Assets1` record attached to an Account with `Evaluation_License = true`, a `Product`, `Quantity`, `Start_Date = today` and `Renewal_Date = endDate` (the expiry). The portal creates a placeholder asset then delegates real key generation to the QLM Deluge function `qlminterfacemasspushkeydetails`, which replaces the placeholder. Default entitlement is 30 days; `canExtendEvaluations` allows longer; `maxEvaluationsPerAccount` caps how many per account (−1 unlimited). Detection of an existing evaluation is inconsistent: `/api/accounts/[id]` treats an asset as an evaluation if `Evaluation_License === true` **or** its product/asset name contains "evaluation", while `/api/leads/[id]` and `/api/evaluations` use only the boolean field, and `/api/leads` further buckets product names into four hardcoded families.

**Where products and currencies come from.** Both are Zoho CRM org data, read-only through the portal and Redis-cached. Products come from the Zoho `Products` module, addressable only by exact `Product_Code` (SKU), 10-minute TTL — the SKU string is constructed by callers, not discovered here. Currencies come from Zoho's org currency settings (`ZohoCRM_getCurrencies`), 1-hour TTL, expressed as `exchange_rate` relative to the AUD home currency, with a hardcoded six-currency fallback if Zoho is unreachable.

### Incomplete / hardcoded / notable

- **Success masking.** `/api/accounts` POST, `/api/accounts/[id]` PATCH, `/api/leads` POST, `/api/leads/[id]` PATCH all return `{ success: true }` with HTTP 200 even when Zoho reports a per-record failure. Only `/api/evaluations` checks `code === 'SUCCESS'`.
- **Dead code.** `ZohoCRM_getLeadConversionOptions` is fetched in the convert handler and never read. `const user = authResult` is unused in `/api/accounts` POST and `/api/products` GET.
- **Doc/code drift.** Convert handler's comment claims `trigger: ['workflow']`; the payload sends no `trigger`. `/api/leads` header comment advertises a "region" filter that doesn't exist.
- **Hardcoded values.** `.com.au` Zoho datacentre in two places (`leads/[id]`, `evaluations`); `resellerName: "Civil Survey Applications"` in the token URL; the 30-day evaluation cap; the 2000-record page ceiling (`MAX_ZOHO_PAGES = 10` × 200); the 2000 ms commit sleep in `/api/evaluations`; the four evaluation product families in `categorizeEvalProduct`; the six-currency fallback rate table.
- **Unchecked external call.** `/api/evaluations` never inspects `qlmRes.ok`; a QLM failure returns 200 with the placeholder asset id, leaving an orphaned `Assets1` record.
- **Duplicated MCP parsing.** A local `parseResult` clone of `parseMcpResult` appears four times across `accounts/[id]` (×1) and `leads/[id]` (×2, in one function), plus a bespoke parser in `currencies`.
- **Unescaped criteria interpolation.** `search`, `resellerId`, and `resellerIds` are concatenated directly into Zoho criteria strings in both list routes.
- **Related-list pagination.** All `get_related_records` calls read one page only (contacts, assets, invoices), so accounts with more than a page of assets or invoices are silently truncated.

### Update 2026-08-12 (`24b19d7`) — `maxEvaluationsPerAccount` was never actually enforced

`/api/evaluations` had **three** wrong MCP path variables plus a wrong list name on its `ZohoCRM_getRelatedRecords` call, and one wrong path variable on its `getRecord` call. Corrected:

| Call | Was | Now |
|---|---|---|
| `getRecord` on `Accounts` (ownership check, `:47-50`) | `recordID` | `recordId` |
| `getRelatedRecords` (`:63-73`) | `module` / `recordID` / `relatedModule` | `parentRecordModule` / `parentRecord` / `relatedList` |
| …and its list argument | `'Assets1'` (the *module* name) | `'Assets'` (the *relation* name) |

Both mattered, in different ways.

The ownership check failed open, exactly as in `/api/contacts` — see the §4 update note.

The cap check failed **silently open in the other direction**: `:78-86` counts existing evaluation assets and rejects when `evalCount >= maxEvals`. With the related-list call returning `[]`, `evalCount` was always `0`, so `evalCount >= maxEvals` was false for every non-zero cap and **the per-account evaluation limit has never fired in production**. Read §2.4's `maxEvaluationsPerAccount` row (internal `-1`, distributor `3`, reseller `2`, restricted `0`) as describing intent that only started being applied on 2026-08-11. Note the `0` case: a `restricted` reseller was gated correctly by accident, because `0 >= 0` is true.

Verified against the live MCP endpoint at the time of the fix: `relatedList: 'Assets'` returns rows; `'Assets1'` errors with *"the relation name given seems to be invalid"*. Zoho's related-list API takes the **relation** name, which is not the module name — a distinction worth remembering, because §3.2's module table lists `Assets1` and that is correct for `getRecords`/`create_records` on the same data.
- **Org-wide asset scan.** `/api/leads` fetches every `Evaluation_License = true` asset in the org (up to 2000) to enrich prospects, then filters in memory.
- **Timezone.** Evaluation `Start_Date`/`Renewal_Date` use `toISOString().slice(0,10)` (UTC), which can shift dates by a day for AEST users.
- **No delete/deactivate paths.** No route here can trash an account, lead, or evaluation, and there is no GET for evaluations.


---

## 6. API: Invoices, Coupons, Renewals, Assets, Licence Keys

### Endpoint summary

| Route | Methods | Backend | Auth / permission as coded | Completeness |
|---|---|---|---|---|
| `/api/invoices` | GET, POST | Zoho MCP (`search_records` via `searchAllPages`, `create_records`) | `requireAuth`; GET forces reseller filter for non-admins; POST needs `permissions.canCreateInvoices \|\| isAdmin` + reseller ownership | Complete |
| `/api/invoices/[id]` | GET, PATCH | Zoho MCP (`get_record`, `update_records`) | `requireAuth` + `canManageReseller` on the invoice's `Reseller`; `Status:'Approved'` needs `canApproveInvoices`; `Send_Invoice` check present but mis-nested (see below) | Complete with a permission gap |
| `/api/coupons` | GET, POST | GET: Zoho MCP `getRecords` + Redis cache. POST: Zoho **REST v7** `POST /crm/v7/Coupons` + Deluge `create_coupon_product` | `requireAuth`; POST `isAdmin` only | Complete |
| `/api/coupons/[id]` | GET, PATCH | GET: Zoho MCP `get_record`. PATCH: Zoho REST v7 `PUT /crm/v7/Coupons` | `requireAuth` + restriction check on GET; PATCH `isAdmin` only | Complete; PATCH has no field whitelist |
| `/api/coupons/validate` | POST | Zoho MCP `search_records` (1 page) | `requireAuth` only (any role) | Complete except product restrictions unenforced |
| `/api/renewals` | POST | Zoho **REST v2** Deluge `generaterenewalinvoicesforassets` (via `executeZohoTool('call_renewal_function')`) | `requireAuth` + `canCreateInvoices \|\| isAdmin`; **no reseller/asset ownership check** | Functional, thin: never reports Deluge-side failure |
| `/api/assets` | GET, POST, PATCH, PUT | GET/PATCH: Zoho MCP on module `Assets1`. POST/PUT: Deluge `qlminterfaceloadkeydetails` / `qlminterfacereleaselicense` | `requireAuth` only — `user` is bound then never used in all four handlers; no reseller scoping, no permission flags | Complete but unguarded |
| `/api/send-keys` | POST | Deluge `sendkeyemail` | `requireAuth`; blocks `role === 'viewer'` only | Complete |

No route in this set uses the zod layer. `updateInvoiceSchema` exists in `src/lib/validation.ts:48` (Invoice_Date, Due_Date, Currency, Purchase_Order, Reseller_Direct_Purchase, Invoiced_Items) and is **imported nowhere** — the invoice PATCH does its own inline field whitelist instead. There are no `TODO`/`FIXME`/stub markers anywhere in `src/app/api`.

### `/api/invoices` (`src/app/api/invoices/route.ts`)

**GET** `?status=Draft&resellerId=<id>&resellerIds=<id,id,…>`

1. `requireAuth`; `status` defaults to `'Draft'`.
2. Builds a Zoho COQL-ish criteria string by hand: `(Status:equals:<status>)`, optionally `and(Reseller:equals:<id>)`, or an `or`-chain of `(Reseller:equals:<id>)` for `resellerIds`.
3. RBAC: if `!isAdmin(user)` the criteria is **rebuilt from `user.allowedResellerIds`**, discarding any client-supplied reseller filter; empty `allowedResellerIds` short-circuits to `{ invoices: [] }` (200).
4. `searchAllPages('Invoices', criteria, fields, 'desc')` — auto-paginates to `MAX_ZOHO_PAGES` (2000 records at 200/page, `src/lib/zoho.ts:198`).
5. Filters out `Record_Status__s === 'Trash'` in JS (Zoho search returns trashed rows).

Fields requested: `Subject, Reference_Number, Account_Name, Invoice_Date, Due_Date, Status, Grand_Total, Currency, Invoice_Type, Reseller, Record_Status__s`.
Response `{ invoices: Record<string,unknown>[] }`; failure logs and returns `{ error: 'Failed to load invoices' }` 500.

Caller: `DraftInvoicesView` — status dropdown is fixed to **Draft / Approved / Sent**; admins may add `resellerIds` for a whole region, distributors get all child reseller ids, single resellers get `resellerId`.

**POST** — body is passed through to Zoho verbatim (no schema validation).

1. `canCreateInvoices || isAdmin`, else 403.
2. Non-admins: `body.Reseller?.id || body.Reseller` must be in `allowedResellerIds`, else 403 `'You cannot create invoices for accounts assigned to another reseller'`. Note the check is skipped entirely when the body carries no `Reseller`.
3. `executeZohoTool('create_records', { module:'Invoices', records:[body], trigger:['workflow'] })` — the `workflow` trigger is what fires Zoho-side auto-numbering, Stripe link generation and notification workflows.
4. On `code === 'SUCCESS'` returns `{ success: true, id }`. Otherwise it logs a warning and **still returns `{ success: true, data }` with 200** — a Zoho validation failure reaches the client as a success with no `id`. `CreateInvoiceView` only branches on `data.id`, so failures silently leave the user on the create page.

Create payload shape from `CreateInvoiceView.tsx:171`: `Subject` (`"{Account} - Order - DD/MM/YYYY"`), `Account_Name:{id}`, `Invoice_Date`, `Due_Date`, `Status:'Draft'`, `Invoice_Type:'New Product'`, `Currency`, `Reseller_Region` (AU/NZ collapsed to `ANZ`), `Send_Invoice:false`, `Don_t_Make_Keys:false`, `Automatically_Send_Email:false`, `Invoiced_Items[]`, plus optional `Contact_Name`, `Reseller`, `Owner`, `Billing_Country`.

### `/api/invoices/[id]` (`src/app/api/invoices/[id]/route.ts`)

**GET**

1. `executeZohoTool('get_record', { module:'Invoices', record_id:id })`.
2. Parses with a **local inline `parseResult`** helper (lines 36–49) rather than the shared `parseMcpResult` — duplicated logic in the same file that imports `parseMcpResult` for PATCH.
3. RBAC: non-admin must satisfy `canManageReseller(user, invoice.Reseller.id)`; missing reseller id also 403 `'This invoice belongs to another reseller'`.
4. Line items come from `invoice.Invoiced_Items` (the file's own docstring says `Product_Details` — stale comment).
5. Response `{ invoice, lineItems }`. A missing record returns `{ invoice: null, lineItems: [] }` with **200, never 404**.

**PATCH**

1. Non-admins trigger an extra `get_record` first purely for the ownership check (two Zoho round-trips per update).
2. Whitelist copied into `updateData` (`{ id }` plus): `Invoice_Date`, `Due_Date`, `Currency`, `Invoiced_Items`, `Reseller_Direct_Purchase`, `Purchase_Order`, `Status`, `Send_Invoice`. Anything else in the body is dropped. Truthiness guards mean `Invoice_Date: ''` or `Currency: ''` cannot be cleared; `Reseller_Direct_Purchase` and `Purchase_Order` use `!== undefined` so they can be set false/empty.
3. Status gating (lines 112–121):
   - `Status === 'Approved'` requires `canApproveInvoices || isAdmin` → 403.
   - `Send_Invoice` requires `canSendInvoices || isAdmin` → 403 — **but this check sits inside the `if (body.Status)` block**, while `Send_Invoice` is copied to `updateData` unconditionally at line 121. A PATCH of `{ Send_Invoice: true }` with no `Status` (exactly what the "Pay Later" button sends, `OrderActions.tsx:179`) skips the permission check. The UI hides the button without `canSend`, so the gap is API-only.
4. `update_records` with `trigger:['workflow']`.
5. Returns `{ success: true }` on `code === 'SUCCESS'` **and also on any non-success result** (line 138, commented "Zoho sometimes returns data differently"). Only a thrown exception yields 500. Callers therefore cannot detect a rejected update.

### `/api/coupons` (`src/app/api/coupons/route.ts`)

**GET**

1. Redis key `coupons:all`, TTL 120 s (`cacheGet`/`cacheSet`).
2. On miss: `getAllRecordPages('Coupons', FIELDS, 'Created_Time', 'desc')` (browse mode, not search), then drops `Record_Status__s === 'Trash'`.
3. Admin/IBM get the full list; everyone else goes through `filterCouponsForUser` — drops a coupon when `Region_Restrictions` is set and `user.resellerRegion` is not in `Regions`, or `Partner_Restrictions` is set and `user.resellerId` is not in `Partners[].id`. Restrictions with an empty value list are treated as unrestricted.
4. Errors are swallowed: logs then returns `{ coupons: [] }` with **200** — the UI cannot distinguish "no coupons" from "Zoho down".

**POST** (admin/IBM only) — two-step, and deliberately not MCP because the MCP key lacks Coupons write scope:

1. `getAccessToken()` → `POST` to Deluge function `getresellerzohotoken` with `arguments={"resellerName":"Civil Survey Applications"}` **hardcoded and URL-encoded inline** (`getTokenUrl`, line 51); token cached in a module-level variable for 1 h minus a 60 s buffer. The same 20-line token helper is duplicated verbatim in `coupons/[id]/route.ts:35-53`.
2. `POST https://www.zohoapis.com.au/crm/v7/Coupons` with `{ data:[body], trigger: [] }` — no Zoho workflows fire for coupon creation.
3. If no `data[0].code === 'SUCCESS'` → `{ success:false, error:'Failed to create coupon', data }` 400.
4. `POST` Deluge `create_coupon_product` with `{ couponId }` — creates the Products record later used as the negative line item. **The function's result is logged but never inspected**, so a coupon can be created with no discount product and the API still reports success.
5. `cacheInvalidatePattern('coupons:*')`, then `{ success:true, id, productResult }`.

All Zoho REST URLs in this set are hardcoded to the AU data centre (`zohoapis.com.au`); `ZOHO_API_KEY` is passed as the `zapikey` query parameter.

### `/api/coupons/[id]` (`src/app/api/coupons/[id]/route.ts`)

- **GET**: MCP `get_record` on `Coupons` (reads are authorised). Non-admins are refused with 403 when `userCanAccessCoupon` fails — same region/partner logic as the list filter, duplicated as a second copy of the predicate. Missing record → `{ coupon: null }` 200.
- **PATCH**: admin/IBM only. REST `PUT /crm/v7/Coupons` with `{ data:[{ id, ...body }], trigger: [] }`. **No field whitelist** — any writable Coupons field, including `Remaining_Uses`, `Status` and `Discount_Product`, can be set from the client. Non-`SUCCESS` → 400 with Zoho's message; success → `cacheInvalidatePattern('coupons:*')` and `{ success:true, data }`.

### `/api/coupons/validate` (`src/app/api/coupons/validate/route.ts`)

`POST { code, invoiceType, subtotal }`. The docstring also lists `resellerRegion, resellerId` in the body, but the handler ignores them and reads `user.resellerRegion` / `user.resellerId` from the auth context (line 19–21 comment: "never trust client-provided values").

Lookup: `searchAllPages('Coupons', '(Name:equals:<code>)', fields, 'desc', 1)` — `Name` is the coupon code; `maxPages` pinned to 1. Zoho search errors are swallowed into "not found".

Checks, in order, each returning `{ valid:false, error, coupon }` at **HTTP 200**:

1. Not found → `'Coupon code not found'` (no `coupon` in payload).
2. `Status !== 'Active'` → `` `Coupon is ${Status}` ``.
3. `Coupon_Start_Date` in the future / `Coupon_End_Date` in the past. `now` is local midnight (`setHours(0,0,0,0)`), compared against `new Date(dateString)` — server timezone dependent.
4. `Total_Usage_Allowance` set and `Remaining_Uses <= 0` → `'Coupon has no remaining uses'`.
5. `Region_Restrictions` and the caller has a region → `Regions` array, or a `;`-delimited string, must include it.
6. `Partner_Restrictions` and the caller has a reseller → `Partners[].id` must include it.
7. `Order_Type_Restrictions` and `invoiceType` supplied → `Order_Type` (array or `;`-string) must include it.
8. `Usage_Restrictions` and `subtotal !== undefined` → `Minimum_Order_Value` / `Maximum_Order_Value` bounds, error text hardcodes a `$` sign regardless of currency.

Discount computation: `'Percentage Based'` → `subtotal * Discount_Percentage / 100`; `'Fixed Amount'` → `Discount_Amount` as-is (no FX conversion even though the coupon carries its own `Currency`). Any other `Discount_Type` yields `0` and still returns `valid: true`.

Success payload: `{ valid:true, coupon, discountProductId, discountProductName, discountAmount }`.

**Unenforced:** `Product_Restrictions` / `Allowed_Products` are fetched in the field list but never checked — a product-restricted coupon validates against any invoice.

### `/api/renewals` (`src/app/api/renewals/route.ts`)

`POST { asset_ids: string[] }`, requires `canCreateInvoices || isAdmin`; empty array → 400 `'No assets selected'`.

Delegates to `executeZohoTool('call_renewal_function', { asset_ids })`, which (`src/lib/zoho.ts:338-350`) bypasses MCP and calls the Deluge function `generaterenewalinvoicesforassets` on the **v2** REST endpoint with `arguments={ buttonPusher: 'claude', assetIDString }`, where `assetIDString` is the ids joined by `|||`. `buttonPusher: 'claude'` is hardcoded — the acting portal user is not passed through.

Response parsing is defensive across three Deluge output shapes: `JSON.parse(details.output).invoiceIDList[0]`, then `invoiceId` / `invoice_id` / `id`, then a regex scan of `details.userMessage[]` for the first 15+ digit run. Always returns `{ success:true, invoiceId, raw }` — `invoiceId` is `null` when nothing matched, and the Deluge `status` field is never checked, so a Zoho-side failure is reported as success.

### `/api/assets` (`src/app/api/assets/route.ts`)

Module is `Assets1` — Zoho reserves `Assets`, so CSA's custom module carries the `1` suffix.

- **GET `?id=`** → MCP `get_record` on `Assets1`; missing `id` → 400; `{ asset }` or 500.
- **POST `{ assetId }`** → Deluge `qlminterfaceloadkeydetails` with `{ assetID }`. Parses the **last** `details.userMessage` entry as JSON into `keyDetails`; separately regex-scans `details.output` for `<message>…</message>` when it contains `<error>`/`<message>` and surfaces it as `activationError`. Returns `{ keyDetails, activationError }` — both may be `null`, always 200.
- **PATCH `{ assetId, Renewal_Date?, Status? }`** → `update_records` on `Assets1` with `trigger:['workflow']`; returns `{ success:true, data }` **without checking the result code**.
- **PUT `{ assetId }`** → Deluge `qlminterfacereleaselicense`; `message` is `details.output` verbatim or the default `'Licence released'`; returns `{ success:true, message, raw }` regardless of what QLM said.

All four handlers assign `const user = authResult` and never read it: no permission flags, and **no check that the asset belongs to the caller's reseller or account**. `send-keys` is the only licence-adjacent route with a role check.

Caller: `AssetDetailModal` — loads asset + QLM key details on open, edits `Renewal_Date` and auto-sets `Status: 'Active'` when the new date is in the future (`AssetDetailModal.tsx:117`), and releases activations for device transfers.

### `/api/send-keys` (`src/app/api/send-keys/route.ts`)

`POST { assetIds: string[], sendToCustomer: boolean }`. Rejects `role === 'viewer'` with 403; every other authenticated role may send. Validates that `assetIds` is a non-empty array and `sendToCustomer` is a boolean (400 each), and that `ZOHO_API_KEY` is present (500).

Calls Deluge `sendkeyemail` with `{ crmAPIRequest:'', invoiceID:'', assetIDString: assetIds.join('|||'), sendToCustomer }`. `sendToCustomer === true` routes to the account's primary contact, `false` to the reseller. `invoiceID` is always empty — invoice-triggered key delivery is a separate Zoho-side path, not this route. Logs asset count, direction and actor email, then returns `{ success:true, result }` whatever the Deluge outcome. Called from `AccountDetailView.sendKeys()` and `LeadDetailView` (evaluation keys).

### Flow: order/invoice lifecycle

States live in Zoho on two independent fields:

- **`Status`** — portal only ever reads/writes `Draft`, `Approved`, `Sent` (the `DraftInvoicesView` filter, `InvoiceHeader` badge colours, and `OrderActions` visibility all assume exactly these three).
- **`Payment_Status`** — Stripe-derived, written outside the portal. UI recognises `paid`/`succeeded` (green), `pending`/`processing` (amber), `failed`/`cancelled` (red), anything else grey.

Supporting fields: `Send_Invoice` (bool — the "send it" trigger), `Reseller_Direct_Purchase` (bool — recipient + pricing mode), `Purchase_Order`, `Reference_Number` (Zoho auto-number), `Sub_Total` / `Grand_Total`, `Record_Status__s` (`'Trash'`), `Don_t_Make_Keys`, `Automatically_Send_Email`, `Invoice_Type` (`New Product` / `Renewal`).

Transitions as coded:

1. **Draft created** — `POST /api/invoices` with `Status:'Draft'`, `Send_Invoice:false`. Also created by the renewals Deluge function (`Invoice_Type:'Renewal'`) and by the AI chat tool path (`src/lib/ai-tools.ts` insists on Draft + `Send_Invoice:false`).
2. **Edited** — `PATCH` dates/currency/`Invoiced_Items`. `InvoiceDetailView` gates editing on `role ∈ {admin,ibm} && Status === 'Draft'`; the API does not enforce the Draft-only rule.
3. **Sent for payment ("Pay Later")** — `PATCH { Send_Invoice: true }`. The portal never writes `Status:'Sent'`; the Draft→Sent move is a Zoho workflow reacting to `Send_Invoice`.
4. **Approved ("Place Order", account terms)** — `PATCH { Status:'Approved' }`. `OrderActions` requires a PO number *and* an attached PO file before allowing it (`hasPONumber`/`hasPOFile`); neither is validated server-side.
5. **Paid** — `Payment_Status` flips Zoho-side after Stripe. Portal reads it in the invoice detail panel, in `OrderActions` polling, in `/api/notifications` ("Invoice Paid" for anything modified in the last 30 days) and in `/api/reports`.

Once `Status` is `Approved` or `Sent`, `InvoicePayment` renders the Stripe link as "Locked (Order {status})" rather than a clickable link, and `OrderActions` disappears for any status other than Draft/Sent.

### Flow: Stripe payment link and payment detection

There is **no Stripe SDK dependency, no Stripe key, and no webhook route** in this codebase (`package.json` has no `stripe`; `src/app/api` has no `webhooks`/`stripe` directory). Everything Stripe-facing is generated in Zoho and read back through `/api/invoices/[id]`.

- **Link generation** — a Zoho workflow (fired by the `trigger:['workflow']` on create/update) writes `Stripe_Payment_Link`, `Stripe_Total` (string), `Stripe_Transaction_Fee` and `Grand_Total_with_Stripe_Fee` onto the invoice. Because generation is asynchronous, `InvoiceDetailView` sets `paymentRefreshing` and re-fetches the invoice **once after a hardcoded 6000 ms** following `saveEdits()` (line 224) and following `toggleDirectPurchase()` (line 468); `InvoicePayment` shows "Generating payment details…" during that window. If the workflow takes longer than 6 s the link simply appears stale until the next manual reload.
- **Where the link is stored** — only on the Zoho invoice record (`Stripe_Payment_Link`). Nothing is persisted in Postgres and nothing is cached.
- **Pay Now** (`OrderActions.tsx:126`) — after a two-step confirm dialog it re-fetches `GET /api/invoices/[id]` to read the *freshest* `Stripe_Payment_Link` rather than trusting the loaded record; if absent it errors with `'Payment link not yet generated. Please save the order first.'`. Otherwise `window.open(link, '_blank')` and polling starts.
- **Payment completion detection is client-side polling only.** `startPaymentPolling` calls `GET /api/invoices/[id]` every 5000 ms and stops when `Payment_Status` lowercases to `paid` or `succeeded`, then shows a "Payment Complete!" modal naming the recipient ("The licence keys and a copy of the order have been sent to …") and calls `onRefresh()`. A `window.focus` listener re-arms polling when the user comes back from the Stripe tab. Consequences as written: the poll has **no timeout and no attempt cap**, it only clears on success or component unmount, fetch errors are swallowed to keep polling, and closing the tab or navigating away loses the completion signal entirely — the paid state is then only visible via the notification feed on next load. Licence-key delivery on payment happens Zoho-side; the portal merely asserts it in the popup text.

### Flow: "Pay on Card" vs "Pay on Account"

Two flags, two different systems of record, resolved per-invoice from the invoice's reseller:

| Portal label | Stored as | Read via | Unlocks |
|---|---|---|---|
| Pay on Card | PostgreSQL `resellers.pay_on_card` (`BOOLEAN DEFAULT false`, added by an `ALTER TABLE … ADD COLUMN IF NOT EXISTS` migration in `src/lib/db.ts:205`) | `GET /api/resellers/[id]` → `payOnCard` | **Pay Now** + **Pay Later** buttons |
| Pay on Account | Zoho Resellers field `Can_Purchase_on_Credit` | `GET /api/resellers/[id]` → `reseller.Can_Purchase_on_Credit` | **Place Order** (requires PO number + PO file) |

`InvoiceDetailView.tsx:112-116` wires them up — and the local variable names are inverted relative to their meaning: `canPurchaseOnCredit = payOnCard` (card) and `canPurchaseOnAccount = Can_Purchase_on_Credit` (account terms). `OrderActions` renders nothing unless `Status ∈ {Draft, Sent}` and at least one flag is true; card buttons additionally need `canSend`, Place Order needs `canApprove`. Both flags are edited from the same permissions modal in `ResellerManagementView` (keys `_pay_on_card` / `_pay_on_account`), which fans out to two writes: `pay_on_card` into Postgres via `PATCH /api/resellers/[id]` permission overrides, and `Can_Purchase_on_Credit` into Zoho via the same route.

Separately, `Reseller_Direct_Purchase` (on the invoice, toggled by `InvoiceSendTo`) decides **who the order goes to and at what price**: `true` → invoice addressed to the reseller and every non-coupon line item repriced to `fullPrice * (100 - Reseller_Sale) / 100`; `false` → addressed to the customer's contact at full list price. The toggle sends `Reseller_Direct_Purchase` plus a rebuilt `Invoiced_Items` array in one PATCH, sets `Contract_Term_Years: 0` on every touched line to signal custom pricing to Zoho, and leaves negative (coupon) lines untouched. Full list prices are reverse-computed on load and held in `originalListPrices` so the toggle is reversible.

### Flow: coupon model

Zoho module `Coupons`. `Name` is the redeemable code (uppercased client-side before validation); `Coupon_Name` is the human label.

- **Discount types** — `Discount_Type ∈ { 'Percentage Based' → Discount_Percentage, 'Fixed Amount' → Discount_Amount }`, plus a `Currency` that is recorded but never used in the calculation.
- **Restriction pairs** — each is a boolean toggle plus a value list, and an enabled toggle with an empty list is a no-op: `Region_Restrictions`/`Regions`, `Partner_Restrictions`/`Partners` (reseller lookups), `Product_Restrictions`/`Allowed_Products` (**never enforced**), `Order_Type_Restrictions`/`Order_Type`, `Usage_Restrictions`/`Minimum_Order_Value`+`Maximum_Order_Value`.
- **Window and quota** — `Coupon_Start_Date`, `Coupon_End_Date`, `Total_Usage_Allowance`, `Remaining_Uses` (set equal to the allowance at creation, `CreateCouponView.tsx:110-113`), `Status` (`Active` required to validate).
- **`Discount_Product`** — lookup to the Products record created by the `create_coupon_product` Deluge function; this is what gets added to the invoice.

**Redemption path** (`InvoiceDetailView.applyCoupon`, line 344): `POST /api/coupons/validate` with `{ code, invoiceType, subtotal: invoice.Sub_Total }` → on `valid` and non-null `discountProductId`, append `{ Product_Name:{ id, name }, Quantity:1, List_Price: -Math.abs(discountAmount), Contract_Term_Years:0 }` to the existing `Invoiced_Items` and `PATCH /api/invoices/[id]`. If the coupon has no discount product the UI errors with `'Coupon has no discount product configured'`.

**Redemption is not recorded anywhere.** No code path decrements `Remaining_Uses`, and there is no coupon↔invoice join record — the only writes to `Remaining_Uses` are the initial value at creation and an admin's manual edit in `CouponDetailView`. Nothing prevents applying the same coupon repeatedly to one invoice or across many invoices; the `Remaining_Uses <= 0` check in `validate` can only ever fire off an externally maintained value.

### Flow: renewals

Trigger is manual, from the account screen: `AccountDetailView` lists active + archived assets with checkboxes, and "Generate Renewal" posts the selected ids to `/api/renewals`.

Eligibility is decided **entirely client-side** (`getIneligibleReason`, line 151): assets with `Upgraded_To_Key`, `Revoked`, `Evaluation_License`, `Educational_License`, product names containing `evaluation` / `educational` / `nfr`, or `home use` (unless "civil site design plus") are blocked with a reason string. The API applies none of these rules — a direct POST can renew anything.

The Deluge function `generaterenewalinvoicesforassets` owns all the actual renewal logic: pricing, dates, `Invoice_Type: 'Renewal'`, and the invoice record itself. The route only extracts an invoice id from its output. On success the client navigates straight to `invoice-detail` for the new invoice; when `invoiceId` is `null` it falls back to reloading the account so the invoice list picks up whatever was created. `Invoice_Type === 'Renewal'` then drives renewal-specific rendering (`isRenewal` in `InvoiceDetailView`).

### Flow: software assets and licence-key delivery

Assets live in Zoho module `Assets1` and are surfaced per-account (`/api/accounts/[id]` returns `activeAssets`, `evaluationAssets`, archived assets). Licence state itself lives in QLM, reached only through Deluge functions:

1. **Inspect** — `POST /api/assets { assetId }` → `qlminterfaceloadkeydetails` returns activation details as JSON in the final `userMessage`; activation problems come back as XML in `output` and are surfaced as `activationError`.
2. **Extend / reactivate** — `PATCH /api/assets` sets `Renewal_Date`, and the client adds `Status:'Active'` when the new date is in the future.
3. **Release** — `PUT /api/assets` → `qlminterfacereleaselicense`, used to free an activation for a device transfer.
4. **Deliver keys** — `POST /api/send-keys { assetIds, sendToCustomer }` → `sendkeyemail`, either to the account's primary contact or to the reseller. Called from the account asset list and from `LeadDetailView` for evaluation keys. Post-payment key delivery is *not* this route: it is triggered inside Zoho (the portal's payment popup only claims it happened).

### Incomplete / rough edges

**Missing pieces**
- No Stripe webhook or any server-side payment listener; `Payment_Status` transitions are observed only by a browser poll that dies with the tab.
- No coupon redemption bookkeeping: `Remaining_Uses` is never decremented, no usage log, no per-invoice uniqueness.
- `Product_Restrictions` / `Allowed_Products` on coupons are stored and displayed but never validated.
- `updateInvoiceSchema` in `src/lib/validation.ts` is dead code; invoices, coupons, renewals, assets and send-keys all accept unvalidated bodies (contacts/users routes do use zod).
- No `DELETE` anywhere in this set — invoices and coupons can only be trashed inside Zoho (`Record_Status__s` is filtered client-side).
- `/api/assets` has no authorisation beyond "is logged in": `user` is destructured and unused in all four handlers, so any authenticated user can read, repriced-renew, or release any asset by id.
- `/api/renewals` performs no ownership check on the submitted asset ids, and the client-side renewal-eligibility rules have no server counterpart.
- The invoice PATCH `Send_Invoice` permission check is unreachable for the "Pay Later" payload shape (no `Status` in the body).

**Success-masking**
- `POST /api/invoices`, `PATCH /api/invoices/[id]`, `PATCH /api/assets`, `POST /api/renewals`, `POST /api/send-keys` and the `create_coupon_product` step of `POST /api/coupons` all return `success: true` without verifying (or in some cases without even inspecting) the Zoho/Deluge result code.
- `GET /api/coupons` returns `{ coupons: [] }` 200 on backend failure; `/api/coupons/validate` returns 200 for every failure mode including internal errors.
- `GET /api/invoices/[id]` and `GET /api/coupons/[id]` return `null` records with 200 instead of 404.

**Hardcoded values**
- `resellerName: "Civil Survey Applications"` baked into the coupon OAuth-token URL in both `coupons/route.ts:51` and `coupons/[id]/route.ts:38`.
- `buttonPusher: 'claude'` in the renewal Deluge call (`src/lib/zoho.ts:346`) — the real actor is not recorded.
- AU data centre host `https://www.zohoapis.com.au` in five places; renewals uses `/crm/v2/` while everything else uses `/crm/v7/`.
- 6000 ms delayed refetch for Stripe link generation; 5000 ms payment poll interval; 120 s coupon cache TTL; 1 h OAuth token TTL.
- `'$'` hardcoded in coupon min/max order-value error messages regardless of the coupon's `Currency`.

**Duplication**
- The `getTokenUrl` + `cachedToken` + `getAccessToken` trio is copy-pasted between the two coupon routes (each with its own independent in-process token cache).
- The coupon region/partner restriction predicate exists twice (`filterCouponsForUser` in the list route, `userCanAccessCoupon` in the detail route) and a third time as inline checks in `validate`.
- `invoices/[id]/route.ts` defines a local MCP result parser alongside its import of the shared `parseMcpResult`.

### Update at `7865247` — Currency was locked on invoice PATCH *(superseded — see the 2026-08-12 note below)*

> **This subsection is historical.** `211834f` reversed the lock. Read it for the reasoning that was in play
> at `7865247`, then read "Update 2026-08-12 (`211834f`) — the Currency lock has been reversed" further down
> for the current behaviour. Nothing in the two paragraphs below describes HEAD.

Merged commit `dab7c76` removed Currency from the accepted-field allowlist in `PATCH /api/invoices/[id]`. The line

```ts
if (body.Currency) updateData.Currency = body.Currency;
```

was replaced by a comment: *"Currency is sourced from the Reseller record — not user-editable here."* A `Currency` value in the request body is now silently ignored — it is not rejected with an error, it simply never reaches `updateData`, so the caller still receives a success response while the field is untouched. No Zoho-side migration was done; existing invoices keep whatever Currency they already carry.

Two consequences for future sessions:

1. **`updateInvoiceSchema` in `src/lib/validation.ts` still declares Currency as an updatable field, and `validation.test.ts` still asserts that it accepts one.** The schema is dead code — nothing in the invoice routes calls it — so the test passes while asserting the opposite of the route's actual behaviour. Anyone wiring that schema up to the route would silently re-open Currency editing. Fix the schema and the test together, or delete both.
2. Currency now has exactly one source of truth: the Reseller record. Any UI that appears to offer a currency choice on an invoice is either display-only or writing nothing.

The commit message for `dab7c76` records the author's own verification at that point: `npm run build` PASS, `npm test` 33/33 PASS, `npm run lint` 39 errors / 64 warnings — described as equal to the pre-existing baseline, i.e. the lint debt predates this work and was not introduced by it.

### Update 2026-08-12 (`211834f`) — the Currency lock has been reversed

**Everything above about the Currency lock describes a state that no longer exists.** `211834f` put the line back:

```ts
// Currency is seeded from the Reseller record when an order is created, but it
// stays editable afterwards: an order can legitimately be raised in a currency
// other than its partner's default. Removed from this allow-list in dab7c76 and
// deliberately restored — dropping it silently was worse than either choice,
// because the request still returned success and the edit vanished without a word.
if (body.Currency) updateData.Currency = body.Currency;
```

`src/app/api/invoices/[id]/route.ts:106-111`. The reasoning, recorded in the commit: currency is *seeded* from the Reseller record at creation, not owned by it, and there are legitimate orders in another currency. Of the three available options — accept it, reject it with an error, or accept-and-drop — accept-and-drop was the worst, because the caller got `{ success: true }` and the edit disappeared without a word.

What this changes in the surrounding narrative:

- The current PATCH allow-list is `Invoice_Date`, `Due_Date`, **`Currency`**, `Invoiced_Items`, `Reseller_Direct_Purchase`, `Purchase_Order`, and `Status`/`Send_Invoice` on their own paths. Everything else in a request body is still dropped silently.
- The §0 "silently dropped" instance is gone. The general finding — write routes returning success without checking the Zoho result — is unaffected and still applies to `POST /api/invoices`, `PATCH /api/assets`, `POST /api/renewals`, `POST /api/send-keys` and part of `POST /api/coupons`.
- `updateInvoiceSchema` is still dead code with no route importing it, and `validation.test.ts`'s `accepts currency update` still passes. It now happens to agree with the route — but by coincidence, not by coupling. Point 1 above still stands: wire that schema up and you change behaviour. See §13.
- **Amounts are not converted.** `InvoiceDetailView.tsx:426-429` states it explicitly: only the currency code changes, line-item numbers stay as they are. Changing an order from AUD to USD reprices nothing.
- Currency no longer has one source of truth. It is seeded from the Reseller at creation (`CreateInvoiceView`), editable on the order afterwards, and `CouponDetailView`'s full-form save still writes `Currency` on every save (§9.6).

### Update 2026-08-12 (`d9c4efb`) — coupon `Remaining_Uses` is no longer clobbered

The full-form coupon save used to write `Remaining_Uses = Total_Usage_Allowance` unconditionally, so editing a description or a date reset the consumption counter. `CouponDetailView.tsx:238-248` now writes `Total_Usage_Allowance` on every save but re-seeds `Remaining_Uses` **only when the allowance itself changed**:

```ts
data.Total_Usage_Allowance = allowance;
if (coupon && coupon.Total_Usage_Allowance !== allowance) {
  data.Remaining_Uses = allowance;
}
```

**This does not make usage caps enforced, and the distinction matters.** Nothing in the application decrements `Remaining_Uses` — not `POST /api/coupons/validate`, not the invoice PATCH that appends the discount line item, not any Zoho-side function this repo can see. Verified against live data at the time of the change: of six coupons, **none** has `Remaining < Total`, and five have no allowance at all. The `<= 0` rejection in `/api/coupons/validate` therefore **cannot currently trigger**. Enforcing caps means decrementing at payment time, Zoho-side where it can be atomic, and is explicitly out of scope so far. What changed is only that the edit path has stopped making the counter worse.

## 7. API: Chat, Search, Reports, Logs, Notifications, Email, Files

### Endpoint summary

| Route | Methods | Auth as coded | Backend(s) | Response | State |
|---|---|---|---|---|---|
| `/api/chat` | POST | `requireAuth`; per-tool RBAC for non-admins | OpenRouter (Claude Opus 4.6) + Zoho MCP | `text/event-stream` SSE (`status`/`done`/`error`) | Complete |
| `/api/search` | GET | `requireAuth`; `Resellers` module admin/ibm-only | Zoho MCP `searchRecords` ×5 parallel | JSON `{results, query}` | Complete, page-1 only |
| `/api/reports` | GET | `requireAuth`; non-admin scoped to own resellers | Zoho MCP (paged) + Redis cache | JSON `{months, totals}` | Complete; `region` param dead |
| `/api/logs` | GET, DELETE | `requireAuth` only — **no role gate on DELETE** | In-process log buffer (`src/lib/logger.ts`) | JSON `{logs,total}` / `{cleared:true}` | Complete, ungated |
| `/api/notifications` | GET, POST | `requireAuth`; admins see all resellers | Zoho MCP + Redis (180s) + Postgres | JSON `{notifications,unreadCount}` / `{success}` | Complete |
| `/api/emails` | GET | `requireAuth` + **`isAdmin` 403 gate** | Zoho MCP `getEmails`/`getSpecificEmail`/`getAttachmentById` | JSON (4 shapes by query param) | Partial — attachment download broken |
| `/api/attach-file` | POST | `requireAuth` only | Zoho Deluge token fn + Zoho CRM v7 REST | JSON `{success,data}` | Complete |
| `/api/parse-file` | POST | `requireAuth` only | OpenRouter (Gemini 3.1 Flash vision) | JSON `{type:'text',content,fileName}` | Complete; free-text output |

No route in this set implements PUT/PATCH. `/api/logs` is the only one with DELETE. Every route obtains the user via `requireAuth(request)`, which returns a `NextResponse` on failure — the `instanceof NextResponse` early-return is the uniform pattern.

### `/api/chat` — AI chat (`src/app/api/chat/route.ts`, 358 lines)

**POST only.** Request body `{ messages }` — an OpenAI-format message array. `ChatInterface.tsx:83` also sends a `user` field; the route ignores it and rebuilds user context from server-side auth (explicit comment at line 167: "never trust client-provided user data").

Step by step:
1. `requireAuth`, then open a `ReadableStream`; all work happens inside `start(controller)`.
2. `sendEvent(type, data)` writes `data: {json}\n\n` frames. Response headers: `text/event-stream`, `no-cache`, `keep-alive`.
3. Logs the request (first 100 chars of last user message, message count, role).
4. Missing `OPENROUTER_API_KEY` → `error` event, stream closed (HTTP is still 200 — errors are in-band, never status codes).
5. Builds a system message = `getSystemPrompt()` + an appended `## Current User` block (email, name, role, resellerId, allowedResellerIds, and the four invoice permission booleans).
6. Agent loop, `maxIterations = 15`: POST to `https://openrouter.ai/api/v1/chat/completions` with `model: 'anthropic/claude-opus-4.6:exacto'`, `max_tokens: 4096`, `temperature: 0.2`, headers `HTTP-Referer` (`NEXT_PUBLIC_APP_URL` or `https://recivis.up.railway.app`) and `X-Title: ReCivis`.
7. Non-2xx from OpenRouter → `error` event `AI service error: {status}`, close. No `choices[0]` → `error: 'No response from AI'`.
8. No `tool_calls` on the assistant message → `done` event carrying the full `content`, close.
9. With tool calls: pushes the assistant message, emits a `status` event from the `TOOL_STATUS` map (suffixed `(N operations)` when >1), then runs all tool calls through `Promise.all`.
10. Loop exhaustion → `done` with the literal string `'Reached the maximum number of operations. Please try again.'`.
11. Any thrown error → `error` event with the message.

**Streaming behaviour — not token streaming.** The transport is SSE, but each OpenRouter call is a plain buffered `await response.json()`. Only three event types ever cross the wire: `status` (progress text), `done` (whole final message at once), `error`. The client (`ChatInterface.tsx:166-180`) matches exactly those three; `isStreaming` is a spinner flag, not incremental text.

**Tools the model can call** — 7, from `toolDefinitions` in `src/lib/ai-tools.ts`, converted to OpenAI function shape by `convertTools()`: `search_records`, `get_record`, `get_related_records`, `create_records`, `update_records`, `get_variables`, `call_renewal_function`. All dispatch through `executeZohoTool(name, args)`.

**Conversation state** is entirely client-side and stateless server-side. The client posts the full history each turn; the server builds `conversationMessages = [systemMessage, ...messages]` per request and discards it when the stream closes. Nothing is persisted — no DB table, no Redis key.

**RBAC (two layers, non-admins only).**
- Pre-execution `enforceToolRBAC` (line 24): silently appends `,Reseller` to `args.fields` for `search_records` on Accounts so the post-filter has the field to work with; blocks `create_records` on Invoices whose `Reseller.id` is outside `allowedResellerIds`; blocks `update_records` setting `Status === 'Approved'` without `canApproveInvoices` or `Send_Invoice === true` without `canSendInvoices`. A block returns a `role: 'tool'` message containing `{error}` — the model sees the refusal as a tool result and continues.
- Post-execution `filterResultsForRBAC` (line 63): only for `module === 'Accounts'` and only `search_records`/`get_record`. Parses each `content[].text`, drops records whose `Reseller.id` is not allowed — **including records with no reseller set at all** (line 89). If everything was filtered, injects `parsed.message` explaining the accounts belong to other resellers, so the model can explain rather than hallucinate. Applied only when `allowedResellerIds.length > 0`.

**Error handling inside tool execution:** `NOT_AUTHENTICATED` → `{error: 'Zoho CRM is not connected.'}`. An error message containing `'session'` triggers `resetSession()` and exactly one retry. Anything else is wrapped as `{error: message}`. Every branch returns a tool result rather than aborting the loop.

### `/api/search` — global search (`src/app/api/search/route.ts`, 248 lines)

**GET only.** `?q=` (required, min 2 chars — shorter returns `{results: []}` with 200), `?modules=` comma-separated allow-list filter.

**Fan-out, not federated.** Up to five independent `ZohoCRM_searchRecords` calls fired via `Promise.all`, one per module, each with its own hand-picked `fields` string and `page: 1`. Per-module failures are swallowed by `searchModule`'s `catch { return [] }`, so a partial outage degrades silently. Only Zoho is searched — no Postgres, no Redis, no cache layer at all. **`page: 1` is hardcoded**, so results are capped at one Zoho page per module regardless of match count.

`ALL_MODULES = ['Accounts','Leads','Prospects','Contacts','Invoices','Resellers']`, but `Accounts` and `Prospects` are the *same* Zoho module — one Accounts query is issued when either is requested (`needAccounts`), then split in JS by `Account_Type === 'Prospect'`. `Resellers` is stripped from the module list for non-admins before any query runs.

Normalisation into `{id, module, title, subtitle, meta}`, with `Record_Status__s === 'Trash'` excluded everywhere:
- Accounts / Prospects: title = `Account_Name`, subtitle = `Email_Domain` ?? `Billing_Country`, meta = reseller name.
- Leads: also skips `Converted__s`; title = `Company` ?? `Full_Name`, meta = `Lead_Status`.
- Contacts: filtered indirectly — builds `allowedAccountIds` from the *already-fetched* Accounts result set, then drops contacts whose parent account isn't in it, plus all orphaned contacts (`!account?.id`). Because the account set is only page 1 of a keyword search, a legitimately-owned contact can be dropped when its parent account didn't match the same keyword.
- Invoices: currency symbol via inline ternary (`AUD`→`$`, `EUR`→`€`, `GBP`→`£`, else `$`), meta = `"{Status} {symbol}{total.toFixed(2)}"`.
- Resellers: no reseller filter applied (already admin-gated).

Errors: any throw outside `searchModule` → `500 {error: 'Search failed'}` after logging.

### `/api/reports` — monthly reporting (`src/app/api/reports/route.ts`, 404 lines)

**GET only.** `?months=` (default 13), `?resellerId=`, `?region=`.

**Metrics, all computed in JavaScript.** Nothing is aggregated in SQL and nothing uses a Zoho aggregate/COQL query — the route pulls whole record sets and reduces them in-process. Per month: `accounts`, `leads`, `prospects`, `invoiceCount`, plus `byCurrency[cur] = {revenue, csaProfit, distributorOwed, resellerOwed}`, plus full drill-down arrays (`invoices`, `accountItems`, `leadItems`, `prospectItems`). `totals` re-reduces the months, with `byCurrency` summed across all of them.

Flow:
1. Scope resolution: explicit `resellerId` wins; else non-admins get `allowedResellerIds` (falling back to `[resellerId]`); a non-admin with neither gets an early `{months: [], totals: {}}`.
2. Cache: `reports:v4:{ids|all}:{region}:{months}` via `cacheGet`; on hit, returns immediately. On success, `cacheSet(..., 600)` — 10 minutes.
3. Builds `monthSlots` backwards from today as `YYYY-MM` strings.
4. Three fetches in parallel, each with `.catch(() => [])` and a warn log, so a failed module silently reports as zero: Accounts, Leads, Invoices. Scoped requests use `searchAllPages` with criteria built by `buildResellerCriteria` (`(Reseller:equals:id)` joined by `or`); unscoped admin requests use `getAllRecordPages` sorted by `Created_Time` (Invoices by `Modified_Time`).
5. Accounts are split in JS into non-prospects vs `Account_Type === 'Prospect'`.
6. **N+1 reseller lookups:** collects distinct `Reseller.id` from the invoice set and issues one `ZohoCRM_getRecord` per reseller (parallel), reading `Name`, `Reseller_Sale` (percentage) and `Distributor`; then a second parallel wave of `getRecord` calls for each distinct distributor to read its `Reseller_Sale`. Both waves swallow errors per-record (`catch { }`), so a missing reseller silently yields 0%.
7. Bucketing: accounts/leads/prospects by `Created_Time`; leads also skip `Converted__s`. Records outside the month window are dropped because `monthMap.get()` misses.
8. Invoices: **only `Status === 'Approved'` counts**, bucketed by `Invoice_Date`. Revenue = `Grand_Total` as invoiced. Three payout branches:
   - CSA-owned (`resellerId` empty, or the name matches the hardcoded `CSA_RESELLER_NAMES` list — `civil survey applications` + `llc`/`india`/`europe` variants, lowercased/trimmed): `csaProfit = revenue`, both payouts 0.
   - `Reseller_Direct_Purchase` truthy: grosses the discounted total back up to list (`grandTotal / ((100 - resellerPct)/100)`) and takes `(distroPct - resellerPct)%` of that as `distributorOwed`; `resellerOwed = 0`; `csaProfit = revenue - distributorOwed`. Guarded by `distroPct > 0 && resellerPct < 100`.
   - Customer direct: `distributorOwed = revenue * (distroPct - resellerPct)/100` (0 when no distributor), `resellerOwed = revenue * resellerPct/100`, `csaProfit = revenue - both`.
   All money is rounded to 2dp at the row level, again per-month per-currency, and again on the grand totals.

**Incomplete:** `region` is read at line 96 and used *only* as a cache-key component (line 113) — it never reaches any query or filter, so `?region=AU` returns unfiltered data under a distinct cache key. The `CSA_RESELLER_NAMES` list is a hardcoded string array. Errors → `500 {error: 'Failed to generate reports'}`.

### `/api/logs` — log viewer (`src/app/api/logs/route.ts`, 25 lines)

**GET** `?count=` (default 50) `?category=` → `{logs, total}` from `getLogs(count, category)`, which filters the in-memory array by exact `category` then returns `slice(-count)` (most recent N). **DELETE** → `clearLogs()`, `{cleared: true}`.

Backend is `src/lib/logger.ts`: a module-level `logs: LogEntry[]` capped at `MAX_ENTRIES = 500`, mirrored to `.recivis-logs.json` in `process.cwd()` and reloaded on startup. Not a database — the buffer is per-process, so on multi-instance or serverless deployments each instance shows only its own logs.

**Incomplete / notable:** both handlers assign `const user = authResult` and never use it — any authenticated user, at any role, can read every log line (which include tool args and 500-char result previews) and can wipe the buffer. There is no `isAdmin` gate, no `requireRole`, and no confirmation on DELETE. Neither handler has a try/catch — an exception surfaces as a framework 500. Nothing in `src/` fetches `/api/logs`; it has no UI caller.

### `/api/notifications` — poll-based notifications (`src/app/api/notifications/route.ts`, 262 lines)

**GET** and **POST**.

**How notifications are created:** they are *derived on read*, never written. `fetchNotificationsFromZoho` runs three parallel Zoho queries (each `.catch(() => [])`, `page` arg `1`) and synthesises records:
1. Leads → `{key: 'lead-{id}', type: 'lead', title: 'New Lead Assigned'}`, skipping trash and converted.
2. Accounts where `Account_Type = Prospect` → `{key: 'eval-{id}', type: 'evaluation', title: 'Evaluation Started'}`.
3. Invoices where `Status` is `Approved` or `Sent` → `Payment_Status` of `paid`/`succeeded` (lowercased) yields `key: 'inv-{id}-paid'`, title `'Invoice Paid'`; otherwise `key: 'inv-{id}-approved'`, title `'Invoice {status}'`. Message is `"{Reference_Number} — {account name}"`.

All three drop anything older than 30 days (leads/prospects by `Created_Time`, invoices by `Modified_Time`). Prospect notifications are **merged into** a lead notification when names match case-insensitively — the lead's title is rewritten to `'New Lead — Evaluation Started'` rather than emitting two entries. Sorted by timestamp descending, capped at 50. (The `leadKeys` Set at line 91 is computed and never used — dead code; the match uses `notifications.find` instead.)

**Read/unread tracking is dismissal-only.** There is no read state — `unreadCount` is simply `visible.length`. Dismissals live in Postgres `notification_dismissals (user_id, notification_key, created_at)`. GET selects keys dismissed within 30 days, filters them out of the cached set, then fires a fire-and-forget `DELETE ... WHERE created_at < NOW() - INTERVAL '30 days'` (`.catch(() => {})`) on every request. POST accepts `{action:'dismiss', key}` or `{action:'dismiss-all', keys:[...]}`; both use `INSERT ... ON CONFLICT (user_id, notification_key) DO UPDATE SET created_at = NOW()`. `dismiss-all` loops sequentially, one round-trip per key. Anything else → `400 {error:'Invalid action'}`.

**Caching / polling:** the Zoho-derived set is cached in Redis under `notifications:{sorted ids}` or `notifications:all` for **180 s**. Dismissal filtering happens after the cache read, so it is always per-user. `NotificationBell.tsx:44` polls `GET /api/notifications` every **180000 ms (3 min)**, matching the TTL. Both handlers call `initDB()` first. GET swallows all errors into `200 {notifications: [], unreadCount: 0}` — failures are invisible to the client; POST returns `500 {error:'Failed'}`.

### `/api/emails` — email history (`src/app/api/emails/route.ts`, 152 lines)

**GET only. Admin/IBM only** — the sole route in this set with an explicit `403 {error:'Insufficient permissions'}` for non-admins. Requires `module` plus one of `recordId`/`recordIds`, else `400`. Four modes, dispatched by which params are present:

1. `attachmentId` + `recordId` → `ZohoCRM_getAttachmentById`, returned as `{attachment: result}` — the raw MCP envelope, unwrapped.
2. `messageId` + `recordId` → `ZohoCRM_getSpecificEmail` → `{email}` (first element of `parsed.Emails`). `code === 'NO_PERMISSION'` or `status === 'error'` in the body → `200 {email: null, error: 'permission denied: {msg}'}`; a thrown error mentioning permission → `200 {email: null, error: 'permission denied: IMAP email'}`; other throws rethrow to the outer handler.
3. `recordIds` (comma-separated) → parallel `getEmails` per id, merged, **deduplicated by `message_id`**, sorted by `time` descending → `{emails, info:{count}}`. This is the Accounts path: Zoho ties emails to Contacts, so the caller (`EmailHistory.tsx:51`) passes the account's contact ids.
4. `recordId` alone → `{emails, info:{count}}` for that record.

Outer catch → `500 {error: 'Failed to load emails'}`. `fetchEmailsForRecord` swallows per-record failures as `[]`.

**Which provider sends, and where sent mail is recorded — nothing here.** This route is read-only; there is no POST and no send path. Repo-wide there is no `nodemailer`/`resend`/`sendgrid`/SMTP dependency. Outbound mail happens in three other places entirely: (a) password reset via the **Gmail API with a Google service account** (`googleapis`, `gmail.send` scope, `src/lib/auth.ts:377-441`); (b) licence keys via the **Zoho Deluge function `sendkeyemail`** (`/api/send-keys`); (c) invoice delivery by **Zoho CRM workflow**, triggered by setting `Send_Invoice = true` (`/api/invoices/[id]` and the AI `update_records` tool). Sent mail is therefore recorded wherever Zoho/Gmail records it — this route reads Zoho's copy back; nothing is logged to Postgres.

**Templates:** none exist in the codebase. `grep` for `template` across `src/lib` and `src/app/api` returns nothing; the password-reset body is inline in `src/lib/auth.ts`, and the licence-key and invoice bodies live inside Zoho.

**Partial:** mode 1 is broken as consumed. It returns `{attachment: <MCP JSON envelope>}` with `Content-Type: application/json`, but `EmailDetailModal.tsx:162` uses the same URL as an `<a href>` download link — the browser gets a JSON blob, not the file. Compare `/api/attach-file`, which does handle binary properly on the upload side.

### `/api/attach-file` — upload to Zoho (`src/app/api/attach-file/route.ts`, 120 lines)

**POST only.** Body `{recordID, fileName, base64, moduleName?}` — JSON with the file base64-encoded, not `multipart/form-data`. Missing `recordID`/`fileName`/`base64` → `400`. `moduleName` defaults to `'Invoices'`.

Steps:
1. `getAccessToken()` — module-level `cachedToken` reused while `Date.now() < expiresAt - 60000`; otherwise POSTs the Zoho Deluge function `getresellerzohotoken` at `zohoapis.com.au/crm/v7/functions/.../execute?auth_type=apikey&zapikey={ZOHO_API_KEY}`. **`resellerName` is hardcoded to `Civil Survey Applications`** in the URL-encoded arguments. Reads `data.details.output`; a missing token or one starting with `ERROR` throws. Expiry is assumed at a flat 1 hour, not read from Zoho.
2. Decodes base64 → `Buffer` → `Blob`, appends to `FormData` as `file` with `fileName`.
3. POSTs `multipart/form-data` to `https://www.zohoapis.com.au/crm/v7/{module}/{recordID}/Attachments` with `Authorization: Zoho-oauthtoken {token}`.

Error handling: non-JSON response body → `502 {error: 'Unexpected response from Zoho (HTTP {status})'}`. Non-OK JSON → `502 {error: data.message || 'Zoho API error: {status}'}`, and on `401` the module token cache is cleared so the next attempt re-fetches (no automatic retry — the user must retry). Otherwise `{success: true, data}`. Outer catch → `500` with the error message.

**File types / storage:** no server-side validation of type or size at all — anything base64-encodable is forwarded. The accepted set is enforced only by client `accept` attributes: `.pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx` (`POAttachment.tsx:116`, `InvoicePurchaseOrder.tsx:109`). Files are stored **in Zoho CRM as record attachments** — there is no S3/blob store and nothing touches Postgres. Callers: `ChatInterface.tsx:109`, `POAttachment.tsx:57`, `InvoiceDetailView.tsx:316`. `const user` is assigned and unused beyond the auth gate — any authenticated user can attach to any record id in any module, with no reseller-ownership check.

### `/api/parse-file` — document extraction (`src/app/api/parse-file/route.ts`, 113 lines)

**POST only.** Body `{base64, mediaType, fileName}`; missing `base64` → `400`; missing `OPENROUTER_API_KEY` → `500 {error:'API key not configured'}`.

Builds `data:{mediaType};base64,{base64}` and POSTs one non-streaming OpenRouter request as `VISION_MODEL = 'google/gemini-3.1-flash-image-preview'`, `max_tokens: 4096`, `temperature: 0.1`, same `HTTP-Referer`/`X-Title` headers as `/api/chat`. The message is a single user turn with an `image_url` part followed by the text prompt. PDFs are handed to the model through the same `image_url` channel as images (comment at line 49: "works for both images and PDFs").

**What parsing extracts** — `EXTRACTION_PROMPT` (line 7) asks for purchase-order data as *structured text*, not JSON: company/account name, contact name/email/phone, billing address, PO number, currency; per line item description, quantity, unit price, total price and licence-type hints (perpetual/subscription/maintenance/single/multi user/cloud); plus any dates, special notes, and whether the document looks like a NEW purchase or a RENEWAL.

Returns `{type: 'text', content: extractedText, fileName}`. Upstream non-OK → `502 {error: 'Vision model error: {status}'}`; empty extraction → `422 {error: 'No text could be extracted from the document'}`; outer catch → `500`. This route uses `console.error`, not the `log()` helper used everywhere else.

**Storage: none.** The upload is never written to disk, Postgres, Redis or Zoho — only the extracted text is returned. Sole caller is `ChatInterface.tsx:206`, which feeds `content` straight into the next `/api/chat` turn as text, so the LLM downstream must re-parse the free-form output. Accepted types come only from the client `accept` (`.pdf,.png,.jpg,.jpeg,.webp` in `InvoiceView.tsx:105`); no server-side type or size check. `const user` is unused beyond the auth gate.

### Cross-cutting gaps

- **Two different AI providers, both via OpenRouter:** `anthropic/claude-opus-4.6:exacto` for chat, `google/gemini-3.1-flash-image-preview` for document vision. Both model ids are hardcoded string literals, not env-configurable.
- **`/api/chat` never streams tokens** despite the SSE transport; the whole answer lands in one `done` event.
- **`/api/logs` DELETE has no role gate** — any authenticated user can wipe the log buffer and read all logged tool args/result previews.
- **`?region=` on `/api/reports` is dead**, affecting only the cache key.
- **`page: 1` hardcoded** in `/api/search`'s `searchModule` and passed as the page arg in `/api/notifications`' three queries — results are single-page.
- **`/api/emails` attachment mode returns JSON where the UI expects a file download.**
- **No size/type validation** on `/api/attach-file` or `/api/parse-file`; base64-in-JSON bodies inflate payloads ~33%.
- **Hardcoded values:** `CSA_RESELLER_NAMES` array, `resellerName=Civil Survey Applications` in the token URL, `maxIterations = 15`, 500-entry log cap, 30-day notification/dismissal windows, 50-notification cap, 600 s report TTL, 180 s notification TTL, the fallback `https://recivis.up.railway.app` referer.
- **Silent degradation is the norm:** `/api/search`, `/api/reports` and `/api/notifications` all convert backend failures into empty arrays or zeros rather than error statuses, so partial data is indistinguishable from real emptiness. `/api/notifications` GET returns 200-with-empty on *any* exception.
- **Unused `const user`** in `/api/logs` (both handlers), `/api/attach-file` and `/api/parse-file` — authentication without authorisation.
- No TODO/FIXME comments and no placeholder/stub handlers in any of the eight files; the incompleteness is in unwired parameters and missing authorisation, not unimplemented functions.

### Update 2026-08-12 (`24b19d7`) — `/api/reports` was reporting without reseller data

`/api/reports` makes two batches of `ZohoCRM_getRecord` calls to enrich the report with partner data, and both were sending `recordID` instead of `recordId` (see the §3 update note for why that returns `200` with nothing):

- `:162-181` — per reseller id in the invoice set, reads `Name`, `Reseller_Sale` (the commission percentage) and `Distributor`, populating `resellerMap`.
- `:186-200` — per distributor id discovered above, reads `Reseller_Sale` and back-fills `distributorPercentage` on every reseller under it.

Both are wrapped in `if (rec) { … }` inside a `try { } catch { /* skip */ }`, so the failure was total and silent: `resellerMap` stayed empty, every reseller name resolved to blank and every commission percentage to `0`. Any margin or commission figure the reports dashboard has shown until 2026-08-11 was computed from zeros. `?region=` remains dead — that is a separate, unrelated gap and this commit did not touch it.

This is the third instance of the same one-character bug in this document (§3 transport, §4 contacts/resellers, §5 evaluations, §7 reports). If you are auditing anything that reads a single Zoho record, check the path variable name first.


---

## 8. UI: Dashboard, Accounts and Leads Views

**Re-analysed at HEAD `211834f`.** Seven files under `src/components/views/`, all seven touched since the
last revision. Every line reference below has been re-verified against the current files — the routing
migration moved most of them, and the two detail views grew by ~370 lines each.

Three things changed across the whole section and are not repeated per view:

1. **Navigation is links.** `setCurrentView` / `setSelected*Id` no longer exist. Every record name is a
   real `<Link href={buildPath(...)}>`, so middle-click, ctrl-click and "copy link address" work.
   Table rows keep an `onClick` alongside the link for the whole-row target; each view defines the same
   3-line `openRow(e, href)` helper, which bails when `(e.target as HTMLElement).closest('a, button')`
   matches so a click on an inner control does not double-fire.
2. **Detail views take their id as a prop** from the server page, plus an optional `mode: 'view' | 'edit'`.
3. **Anything that can hold unsaved input is registered** with the dirty registry — create views also
   persist a draft. §12 is the contract; the per-view notes below say which treatment each surface got.

### DashboardView (`src/components/views/DashboardView.tsx`, 286 lines)

Landing page after login. Greeting + 6 feature cards + a "Recent Accounts" table.

**Shows / does**
- Greeting at `:149-151` — "Good {morning|afternoon|evening}, {first name}", time band computed from
  `new Date().getHours()` in `timeOfDay()` `:122-127` (`<12` morning, `<17` afternoon, else evening).
- Feature card grid `:155-203`, driven by the module-level `featureCards` const `:39-88`. Six cards,
  each `{id, label, description, icon, color, view}` where `view` is a `legacyViewId`. Card → route:
  `Leads→/leads`, `Accounts→/accounts`, `Orders→/orders`, `Reports Dashboard→/reports/dashboard`,
  `Order Assistant→/order-assistant`, `Reports Assistant→/reports`. The card labelled "Orders" points at
  the *list* and "Order Assistant" at the chat — the split is intentional.
- The card body is now a `<Link href={buildPath(card.view)}>` `:171-172` with `onClick={clearMessages}`,
  replacing the old `handleAction` → `setCurrentView` handler. `buildPath` is called with the card's
  `view` string, so a typo in `featureCards` throws at render rather than silently rendering nothing.
- Recent Accounts table `:231-278`. Columns unchanged: Account (name + `Email_Domain` sub-line),
  Country (`MapPin` icon), Reseller, trailing `ExternalLink` icon cell. Row click →
  `openRow(e, buildPath('account-detail', acc.id))` `:248`; `openRow` is `:132-135`.
- "View All" `:217-218` → `<Link href={buildPath('accounts')}>`.

**API calls**
- Mount only: `GET /api/accounts?` (note the trailing bare `?`) at `:115`. Response `data.accounts` is
  `.slice(0, 8)` client-side. No search, no filters, no abort guard — no user-driven refetch here.

**State**
- `recentAccounts: RecentAccount[]` (interface `:31-37`), `loadingAccounts: boolean`. Store slices
  consumed: `user`, `clearMessages` — the two navigation setters are gone.

**Loading / empty / error**
- Loading: centred spinner `:226-229`. Empty: "No accounts found" `:280`.
- Error: `.catch(() => setRecentAccounts([]))` — a failed fetch is indistinguishable from an empty
  result. No error UI.

**Role gating** — none. Every card and the table render for all roles.

**Unsaved work** — nothing to protect; this view holds no input.

**Still incomplete (RE-VERIFIED — STILL TRUE at `211834f`)**
- The "Learn more" button `:186-192` still has an empty inline handler containing the literal comment
  `{/* TODO: navigate to guide */}` at `:189`. It is inside the `featureCards.map`, so it renders
  6 times — six dead buttons from one dead handler. Fully styled (hover colour, `BookOpen` icon), so it
  reads as live. The routing migration converted the *card* to a link and left this button alone.

### AccountsView (`src/components/views/AccountsView.tsx`, 427 lines)

Browse/search customer accounts. Docblock `:1-17`. Now takes one prop: `{ notice }: { notice?: string }`
(`:50`), fed from `?notice=` by the server page — which is why `/accounts` is the one route that is
server-rendered on demand rather than static.

**Shows / does**
- Notice banner `:222-238`, rendered when `notice && !dismissedNotice`. This is where a cold
  `/orders/new` with no `newInvoiceContext` lands (§9.3): the order route redirects here carrying an
  explanation rather than dead-ending. Dismissing it sets local state *and* `router.replace(buildPath('accounts'))`
  `:232` so the query param does not survive a reload.
- Header + Export button `:241-266`; search input `:268-278`; region `<select>` `:280-296`;
  reseller `<select>` `:297-329`.
- Table `:349-406`. Columns: Account (name + `Email_Domain`), Reseller, CSA Sales Rep (`Owner.name`),
  Country (`Billing_Country` as plain text), Created (dd/mm/yyyy, inline IIFE), trailing `ExternalLink`
  cell. The Created `<th>` `:356-364` is the sort toggle.
- Account name is a `<Link href={buildPath('account-detail', acc.id)}>` `:378`; the row carries
  `onClick={(e) => openRow(e, buildPath('account-detail', acc.id))}` `:374`, with `openRow` at `:214-217`.
- Pagination rendered twice: top `:339-343` (whenever there are rows) and bottom `:408-412` (only when
  `sortedAccounts.length > pageSize`). Both use `../Pagination`. `pageSize = 50` `:64`.

**API calls**
- `GET /api/resellers` (or `?resellerId=<id>&includeChildren=true` for non-admins) on mount, guarded by
  `canFilterReseller` `:87-101`.
- `GET /api/accounts?<params>` from `fetchAccounts` `:164-181`. Params: `search` (debounced) plus the
  pre-resolved `resellerScope` string.
- Export is client-side via `exportAccountsList` `:250`; it takes a progress callback that writes
  `"{current}/{total} accounts"` into `exportProgress`.

**Fetch model — rewritten in `211834f`. Read this before touching the effects.**

This view previously **aborted its own first request on every page load**, and the fix is subtle enough
to be worth stating precisely.

- *The bug.* `fetchAccounts` depended on the `resellers` array. The reseller fetch rebuilt that array,
  which gave the `useCallback` a new identity, which re-ran the effect, whose cleanup aborted the
  in-flight account request. Production logs showed it as repeated **HTTP 499** on `/api/leads`
  (the same bug lived in `LeadsView`).
- *Why it was not merely wasted work.* For an admin the aborted and replacement requests are
  byte-identical. For a distributor they are not: the first goes out as `resellerId=77` and the
  replacement as `resellerIds=77,78`. The aborted request had been asking the **wrong question** —
  so had it won the race, the user would have seen an under-scoped list.
- *The fix, in two coordinated parts.* (a) Reseller scoping is resolved by a `useMemo` into a query
  **string**, `resellerScope` `:140-161`, and `fetchAccounts` depends on that string `:181` rather than
  on the array. A new array identity can now only change the callback when it actually changes the
  query. (b) A `resellersReady` gate `:76` — initialised to `!canFilterReseller`, so users who never
  load a reseller list start open — holds the record fetch until the reseller round trip settles
  (`:183-188`).
- *A ref was considered and rejected.* Holding the reseller list in a ref removes the abort but also
  removes the legitimate refetch, which would leave a distributor's first under-scoped result on
  screen, uncorrected.
- *`loading` now starts `true`* (`:55`), or the view flashes "no accounts found" during the reseller
  round trip.
- *Measured outcome*, modelled against React's hook semantics with the real dep arrays: admin and
  distributor page loads go from **2 requests / 1 abort to 1 / 0**.

**Race-condition hardening (`2d4fba4`) — intact, and still the reason the aborts exist at all**
- The bug it fixed: search was debounced only. A fast paste burst put several `GET /api/accounts`
  requests in flight; whichever *resolved* last wrote to state, not whichever was *dispatched* last.
- Mechanism, unchanged: `fetchAccounts` takes `(signal: AbortSignal)` `:164`; the effect `:183-188`
  constructs a fresh `new AbortController()` per run and returns `() => controller.abort()`, so React's
  cleanup-before-rerun ordering cancels the previous request; `signal` is threaded into `fetch` `:172`;
  and a two-layer response guard — `if (signal.aborted) return;` before `setAccounts` `:175`, and
  `if (err.name === 'AbortError') return;` in `.catch` `:179` — stops an abort clearing the list or
  flipping `loading` off.
- The 400 ms debounce `:79-82` is unchanged and still the first line of defence. The paste race still
  aborts every stale request; only the self-inflicted first abort is gone.

**State** — `notice` (prop), `dismissedNotice`, `accounts`, `loading` (starts `true`),
`search`/`searchDebounced`, `resellers`, `resellersReady`, `selectedReseller`, `selectedRegion`,
`currentPage`, `sortDir` (`'desc'` default), `exporting`, `exportProgress`. Derived: `regions` `:105-108`,
`filteredResellers` `:111-116`, `ownReseller`/`childResellers` `:127-134`, `resellerScope` `:140-161`,
`sortedAccounts` `:191-198`, `totalPages`/`safePage`/`paginatedAccounts` `:200-202`. Page clamped by
effect `:204-207`; reset to 1 on filter change `:209`.

**Loading / empty / error**
- Loading: spinner + "Loading accounts..." `:331-337`.
- Empty: `Building2` icon + `No accounts matching "<search>"` or `No accounts found` `:415-423`.
- Error: `.catch` sets `accounts` to `[]` — same silent-failure shape as elsewhere. No error UI.

**Role gating**
- `isAdmin = role admin|ibm` `:69`; `hasChildResellers = permissions.canViewChildRecords` `:70`;
  `canFilterReseller = isAdmin || hasChildResellers` `:71`.
- Region select: admin/ibm only, and only when `regions.length > 1` `:280`.
- Reseller select: `canFilterReseller` and `filteredResellers.length > 1` `:298`. Admins get
  "All Resellers"; distributors get "All (My Network)" / "<own> (Mine)" / children.
- Export button: `user.permissions.canExportData` `:245`.

**Unsaved work** — none registered. The only inputs are filters, which lose nothing.

**Still incomplete**
- `MapPin` imported `:24`, never used (RE-VERIFIED — STILL TRUE). The Country cell renders bare text;
  only DashboardView uses the pin.
- No create-account entry point on this screen (RE-VERIFIED — STILL TRUE). `/accounts/new` is reachable
  from the sidebar submenu, not from here.

### AccountDetailView (`src/components/views/AccountDetailView.tsx`, 1480 lines)

Full account profile. Serves **two routes**: `/accounts/[id]` and `/accounts/[id]/edit`. Signature
(`:55-63`):

```tsx
export default function AccountDetailView({
  accountId,
  mode = 'view',
}: { accountId: string; mode?: 'view' | 'edit' })
```

`const editing = mode === 'edit'` (`:113`). There is **no** `useState` for edit mode — the URL is the
state, which is what makes the form linkable, refresh-stable and exitable with Back.

**Section map — navigate by these line ranges**

| # | Section | Lines |
|---|---------|-------|
| 1 | Imports (incl. `buildPath`, `useGuardedRouter`, `useUnsavedChanges`, `GuardedLink`, `InlineEditField`) | 21-41 |
| 2 | Dirty-scope ids: `SCOPE_ADDRESS`, `SCOPE_NEW_CONTACT`, `SCOPE_EDIT` | 50-53 |
| 3 | Props + state block | 55-128 |
| 4 | Role flags `isAdmin` / `hasChildResellers` / `canEditReseller` | 108-110 |
| 5 | Edit-mode state: `editing`, `pristine` ref, `saving`, `saveError`, seven `form*` fields | 113-128 |
| 6 | `saveFields` — optimistic PATCH helper used by the inline fields | 130-152 |
| 7 | Mount fetch `GET /api/accounts/[id]` | 154-169 |
| 8 | `goBack`, `openRow` | 171-179 |
| 9 | `handleAddContact` | 181-204 |
| 10 | Asset selection + renewal eligibility (`toggleAsset`, `isEligibleForRenewal`, `getIneligibleReason`, `allAssetIds`, `renewalBlocked`, `toggleAllAssets`) | 206-256 |
| 11 | `generateRenewal` | 257-282 |
| 12 | `sendKeys` | 283-309 |
| 13 | `setContactRole` | 311-335 |
| 14 | `fetchResellerOptions` + eager-load effect | 337-353 |
| 15 | `startEditAddress` / `saveAddress` (legacy composite address form) + its dirty scopes | 354-410 |
| 16 | **Full-form edit machinery**: `savedFormValues`, `formState`, populate effect, pristine effect, dirty effect, `handleEdit` / `handleCancel` / `handleSave` | 412-518 |
| 17 | `crmLink` + loading / not-found early returns | 520-540 |
| 18 | Derived: `reseller`/`owner`/`primary`/`secondary`, `sortedContacts`, contact pagination, `formatDate` | 542-566 |
| 19 | **Render — EDIT MODE** (`if (editing) { … }`) | 570-756 |
| 20 | **Render — VIEW MODE** header (back, title, Export All, Open in CRM) | 758-786 |
| 21 | Info card grid inside `<InlineEditFieldProvider>` — includes the address composite | 788-868 |
| 22 | Contacts section (+ add-contact form, role buttons, pagination) | 870-1014 |
| 23 | Orders section (+ "New Product Order") | 1016-1103 |
| 24 | `<EmailHistory module="Contacts" contactIds=…>` | 1105-1107 |
| 25 | Evaluations section | 1109-1163 |
| 26 | Active Assets (+ renewal / send-keys action bar) | 1165-1280 |
| 27 | Archived Assets (only when non-empty) | 1282-1354 |
| 28 | `AssetDetailModal` / `CreateEvaluationModal` / send-keys dialog / send-keys toast | 1356-1466 |
| 29 | Local `InfoCard` component | 1470-1480 |

**Two editing mechanisms, one field list — the pattern all five detail views now follow**

*Inline, per field (view route).* Unchanged from `b6efc75` and still the primary path. Wrap a region in
`<InlineEditFieldProvider>` (`:789` opening, `:868` closing — a mutual-exclusion coordinator: one field
edits at a time and a *dirty* field blocks opening another, shaking instead). Define one
`saveFields(apiChanges, localChanges?)` per view — here `:134-152` — as an **optimistic** writer:
snapshot `previous = account`, merge `localChanges ?? apiChanges` into local state immediately `:140`,
`PATCH /api/accounts/{accountId}` `:142-147`, and on non-ok or throw restore `previous` and **re-throw**
`:148-151`. The re-throw is load-bearing: `InlineEditField` catches it to roll back its editor state and
play the red-flash/shake. Do not swallow it. The `apiChanges` / `localChanges` split exists for lookups —
Zoho wants a bare string id, the UI needs `{id, name}` to render. Full `InlineEditField` props contract
is in §11.2.

Exactly one field is inline-editable here:
- **Reseller** `:793-813`: `type="lookup"`, `fieldId="reseller"`, `value={reseller?.id || ''}`,
  `displayValue={reseller?.name || '—'}`, options from `resellerOptions` with a leading `— None —`,
  `canEdit={canEditReseller}`, `onOpenEdit={fetchResellerOptions}` (re-fetches on open so a freshly
  created reseller appears), `onSave` dispatching
  `saveFields({ Reseller: v || null }, { Reseller: {id, name} | null })`.
- Read-only local `InfoCard`s (`:1470-1480`) for Country `:791`, CSA Sales Rep `:814`, Primary Contact
  `:815`, Secondary Contact `:816`, Email Domain `:817`.
- **Address is still the exception and still not migrated** `:819-867`. Composite over 5 Zoho fields,
  keeping the old pattern: click → `startEditAddress()` `:354-364` seeds `editAddress` → a 5-input
  inline form with its own Save/X → `saveAddress()` `:366-390` PATCHes all five keys then **refetches
  the whole account** (not optimistic). Gated on `isAdmin` only `:847`, unlike the reseller field's
  `canEditReseller`.

*Full form (`/accounts/[id]/edit`), new in `211834f`.* Render block `:570-756`. Four moving parts, and
the same four appear in all five detail views:

1. **`savedFormValues`** `:413-421` — a memo of the account's current value for every field the form can
   write, in a stable order. This is the diff baseline for the save.
2. **Populate from an effect, not a click handler** `:432-447`. Arriving straight at `/edit` means the
   record is still in flight, so population is keyed on `populatedFor.current !== accountId` and runs
   whenever `account` lands. `pristine.current` is reset to `null` at the same time.
3. **Dirty means *changed*, not *open*** — `formState` is a `JSON.stringify` of every form field in a
   stable order `:423-426`; `pristine.current` is captured on the render *after* the populate effect's
   batched updates land `:450-455`; and the registry only sees dirty when
   `pristine.current !== null && formState !== pristine.current` `:458-463`. Opening `/edit` and pressing
   Cancel is silent. Without this every Cancel would have prompted, and a guard that cries wolf gets
   ignored.
4. **Save sends only what changed, and clears its scope before navigating** `:472-518`. Each field is
   compared against `savedFormValues`; an empty `changes` object short-circuits to `handleCancel()` with
   no request at all `:493-497`; on success it reloads the account, sets `pristine.current = null`,
   calls `registerDirty(SCOPE_EDIT, false)` and *then* pushes back to the detail route `:511-515` — in
   that order, or the guard would prompt about work it just wrote.

**The form's field list is derived from the inline fields, not re-invented.** Fields outside
`PATCH /api/accounts/[id]`'s allow-list are rendered as read-only boxes rather than offered as inputs —
`Account_Name` and `Country` at `:617-630`, with the reason in a comment. Gating matches the inline path
exactly: address inputs behind `isAdmin` `:677` (read-only address block otherwise), Reseller behind
`canEditReseller` `:632` (read-only name otherwise), Primary/Secondary Contact selects ungated, matching
the ungated role buttons in the contacts table. `handleSave` re-checks the same gates before including a
field `:479-490`, so a client-side DOM edit cannot smuggle one through. One nice touch: clearing the
reseller shows "Saving now removes the reseller from this account." `:669`.

**API calls**
- Mount / `accountId` change: `GET /api/accounts/{id}` `:157` — one response populates `account`,
  `contacts`, `evaluationAssets`, `activeAssets`, `archivedAssets`, `invoices`.
- Mount: `GET /api/resellers` (or the `includeChildren` variant) via `fetchResellerOptions` `:337-349`,
  only if `canEditReseller`; also re-fired on `onOpenEdit` and on the edit form's reseller `onFocus` `:642`.
- Inline field save: `PATCH /api/accounts/{id}` `:142`. Full-form save: the same endpoint `:500-504`,
  then a reload `:507`.
- Address save: `PATCH /api/accounts/{id}` then full reload.
- Add contact: `POST /api/contacts` `:186` then a contacts reload `:194`.
- Set primary/secondary contact: `PATCH /api/accounts/{id}` `:311-335`.
- Generate renewal: `POST /api/renewals` `{asset_ids}` `:264`. On an `invoiceId` in the response it
  `router.push(buildPath('invoice-detail', data.invoiceId))` `:268` — the old
  `invoiceReturnView='account-detail'` handshake is gone; the order page just goes back to `/orders`.
- Send keys: `POST /api/send-keys` `{assetIds, sendToCustomer}` `:292`.
- Modal callbacks re-`GET /api/accounts/{id}`: `AssetDetailModal.onAssetUpdated` `:1358`,
  `CreateEvaluationModal.onSuccess` `:1379`.
- Exports are client-side: `exportFullAccount` / `exportContacts` / `exportInvoices` / `exportAssets`
  from `@/lib/export-account` (`:770`, `:879`, `:1025`, `:1174`).

**Renewal eligibility** `:214-236` — a paired predicate/reason function. Ineligible when
`Upgraded_To_Key` is set, `Revoked`, evaluation licence, educational licence, product name contains
`nfr`, or contains `home use` without `civil site design plus`. Selected-but-ineligible assets set
`renewalBlocked` `:246`, which disables the Generate button and shows a hover tooltip listing the
deduped `renewalBlockReasons` `:247`.

**Assets UX detail** — the header "select all" checkbox `:1225` compares `selectedAssets.size` against
`allAssetIds.length`, and `allAssetIds` is **active + archived combined** `:239`, so it only reads as
checked when the archived table's rows are also selected. Archived has its own select-all `:1295-1300`.
Both tables paginate at `assetPageSize = 20`.

**Loading / empty / error**
- Full-page spinner while `loading` `:522-529`; "Account not found" + back link `:531-540`.
- Per-section empty copy: "No contacts found" `:1012`, "No orders found" `:1101`, "No evaluations"
  `:1161`, "No active assets" `:1278`. Archived section hidden entirely when empty.
- Errors: every fetch `.catch`es to a no-op or `/* handled by UI */` with no UI. The exceptions are the
  send-keys toast `:1449-1462` and — new — the edit form's `saveError` banner `:604-608`, the first
  in-place save-failure message this view has had.

**Role gating**
- Export All / per-section export icons: `permissions.canExportData` `:768`, `:878`, `:1024`, `:1173`.
- Reseller (inline and form): `canEditReseller` = admin/ibm **or** `canViewChildRecords` `:110`.
- Address (inline and form): `isAdmin` only.
- "Create Evaluation": `permissions.canCreateEvaluations` `:1116`; `canExtend` passed as
  `permissions.canExtendEvaluations` `:1382`.
- Add Contact, contact role buttons, renewal generation and send-keys are **ungated** — any role
  reaching this view can invoke them. The edit form inherits that: its contact-role selects are ungated.

**Unsaved work — three scopes** (`:50-53`, and see §12):

| Scope id | Dirty when | Label |
|---|---|---|
| `account-detail:address` | the composite address form is open and differs from the record `:404` | "the billing address" |
| `account-detail:new-contact` | the add-contact form has any non-empty field `:405` | "the new contact" |
| `account-detail:edit` | the full form differs from its post-populate snapshot `:461` | "this account" |

Plus every `InlineEditField` registers its own scope automatically (§12.2). All three clear on unmount
`:407-409`, `:462`. Navigation out of this view goes through `useGuardedRouter` `:64`, so `goBack` and the
row links prompt; the order links in the invoices table are `GuardedLink`s `:1067`.

**Still incomplete**
- Docblock `:5` still claims editable billing address *and* reseller assignment as one feature; they are
  two mechanisms with two different permission gates, and now also two paths each (inline and form).
- `contactPage` clamping is computed inline `:561` rather than via an effect, unlike the list views.
- The renewal navigation drops the user on `/orders/[id]` with no memory of where they came from; Back
  works, but the in-app back button on the order page goes to `/orders`, not to the account.

### CreateAccountView (`src/components/views/CreateAccountView.tsx`, 606 lines)

Create an account plus its primary contact. Route `/accounts/new`. Grew by ~97 lines in `35abf9d`,
entirely draft persistence; the create flow itself is unchanged.

**Shows / does** — single scrolling form, no wizard steps despite the docblock's "three-step creation
flow" (`:4-7` describes the *submit* sequence, not a stepped UI). Sections: draft-restore bar `:368-377`,
header with the Create button `:379-393`, validation banner `:395-401`, duplicate warning `:403-448`,
"Account Details" `:450-561` (name, country, reseller, street/city/state/postcode), "Primary Contact"
`:563-601` (first, last, email, phone, title).
- Country: search-as-you-type input backed by the 190-entry `COUNTRIES` const `:47`, results capped at
  20 `:480`, dropdown closed on blur after a 200 ms timeout `:474`.
- Reseller: searchable input for `canPickReseller` users `:494-534`; otherwise a read-only box showing
  `user.resellerName`.

**Submit flow** `handleSave` `:281-290` → `checkDuplicates()` → if any match, render the warning and
stop; else `createAccount()`. `createAccount` `:292-356` is strictly sequential:
1. `POST /api/accounts` with `Account_Name`, `Billing_Country`, `Reseller: {id}` + optional address
   fields. Bails silently if no `id` comes back.
2. `POST /api/contacts` with the contact fields + `Account_Name: {id: accountId}`.
3. `PATCH /api/accounts/{accountId}` `{Primary_Contact: contactId}` (only if step 2 returned an id).
4. `clear()` the draft `:349`, `registerDirty('create-account', false)` `:350`, then
   `router.push(buildPath('account-detail', accountId))` `:353` — in that order, so the guard never
   prompts about work that was just created.

**Duplicate detection (real, unlike CreateLeadView)** `:231-279` — fires two parallel
`GET /api/accounts?search=…` calls: one on the trimmed account name, one on the email domain
(`email.split('@')[1]`), each `.slice(0, 5)`, then dedupes by `id`. Matches render as clickable cards
that navigate straight to the existing account; "Create Anyway" `:443` calls `createAccount()` directly,
bypassing the check.

**State** — 12 form fields + `resellers`, `saving`, `checkingDuplicates`, `duplicates`,
`showDuplicateWarning`, `attempted`. `isValid` `:185` requires name, country, reseller, first, last,
email; `attempted` drives red borders on the offending inputs.

**Unsaved work — persisted, not guarded** (see §12.3). This is one of the four create views that
survive browser Back:
- `useDraft<AccountDraft>('accounts:new', isDirty ? draft : EMPTY_ACCOUNT_DRAFT)` `:205`. The
  conditional second argument is the idiom: handing the hook the empty constant while the form is
  pristine is what stops an untouched form ever reaching localStorage. `isDirty` `:199-204` is an
  explicit OR across the fields, deliberately excluding the auto-selected reseller.
- `DraftRestoreBar` `:371` renders only when `pendingDraft` is non-null; `restoreDraft` `:213-229`
  applies the returned object field by field. **Nothing is ever rehydrated silently.**
- It *also* registers `create-account` with the dirty registry `:208-211`, so in-app navigation prompts
  as well. Both mechanisms, because a draft protects against Back and a prompt protects against a
  mis-click.

**Role gating**
- `isViewer` (`role === 'viewer'`) short-circuits the whole view with "You do not have permission to
  create accounts." `:358-364`.
- `canPickReseller = isAdmin || canViewChildRecords` `:151`. Non-pickers get their own `user.resellerId`
  auto-selected.

**Loading / empty / error**
- `saving` swaps the button to a spinner + "Creating..." `:391`.
- `checkingDuplicates` is set/cleared but **never read in the render** — dead state; the duplicate check
  has no visible progress indicator.
- `createAccount`'s `catch { /* handled */ }` shows nothing. A failed account or contact POST leaves the
  user on the form with no message — and, now, with their draft still in localStorage, which is at least
  a recovery path.

**Still incomplete**
- `checkingDuplicates` — set, never rendered (see above).
- The step-2/3 failure paths are unreported: if contact creation fails, the account is created and
  orphaned without a primary contact, and the view still navigates away and clears the draft.

### LeadsView (`src/components/views/LeadsView.tsx`, 506 lines)

Unified list of Zoho **Leads** and **Prospects** (accounts with type=Prospect). No docblock —
unlike AccountsView, this file starts straight at `'use client'`.

**Shows / does**
- Header `:237-267` with per-source count chips (`{n} Leads` / `{n} Prospects`, computed `:231-232`)
  and an Export button.
- Filter row 1 `:269-314`: search, Lead Status select (from `LEAD_STATUSES` `:40-44`, 10 values),
  Evaluation select (`has-evaluation` / `no-evaluation` / one of `EVAL_PRODUCTS` `:45`).
- Filter row 2 `:316-368`, only for `canFilterReseller`: region (admin, `regions.length > 1`) and reseller.
- Table `:388-485`. Columns: Name (source icon — `UserSearch` accent for leads, `Building2` purple for
  prospects — plus name and email), Reseller, Lead Source, Status (coloured badge via `STATUS_COLORS`
  `:47-58`), Evaluations (prospect-only chips with `Civil Site Design→CSD`, `Corridor EZ→CEZ`
  abbreviation; leads show an em-dash), Product of Interest, Country, Created (dd/mm/yyyy, sortable
  header `:398-406`), `ExternalLink` cell.
- Row key is `${lead._source}-${lead.id}` `:413` — ids can collide across the two Zoho modules.
- **Navigation carries the source in the URL now.** `leadHref(lead)` `:219-220` builds
  `` `${buildPath('lead-detail', lead.id)}?source=${lead._source}` ``. The name cell is a `<Link>` `:420`
  and the row calls `openRow(e, leadHref(lead))` `:416`. The old `setSelectedLeadSource` store hand-off is
  gone — `?source=` replaced it, which is what makes a lead deep link work at all. A cold link without
  the param still recovers: `LeadDetailView` infers the source from the fetched record.

**API calls**
- `GET /api/resellers` on mount when `canFilterReseller` `:95-110`.
- `GET /api/leads?<params>` per `fetchLeads` `:170-189`. Params: `search`, `status`, `evaluation`, plus
  the pre-resolved `resellerScope` string.
- Export: `exportLeadsList` `:255` — takes `sortedLeads` (all pages) and the active filter set. Unlike
  AccountsView's export there is no progress callback and no `exporting` state, so the button gives no
  feedback.

**Fetch model — same rewrite as AccountsView (`211834f`)**

Identical bug, identical fix, applied in the same commit and worth reading once in the AccountsView entry
above rather than twice. In this file: `resellerScope` memo `:147-167`, `fetchLeads` depending on the
string `:189`, `resellersReady` gate `:84` and `:191-196`, `loading` starting `true` `:64`. This is the
view whose HTTP 499s in the production logs surfaced the problem.

**Race-condition hardening (`2d4fba4`)** — intact, mechanism identical to AccountsView: `fetchLeads` takes
`(signal: AbortSignal)` `:170`; the effect news up an `AbortController` per run and aborts in cleanup;
`signal` threaded to `fetch`; `signal.aborted` early-return before `setLeads`; `AbortError` swallowed in
`.catch`. Same 400 ms debounce `:87-90`.

**State** — `leads`, `loading` (starts `true`), `search`/`searchDebounced`, `resellers`, `resellersReady`,
`selectedReseller`, `selectedRegion`, `selectedStatus`, `selectedEval`, `currentPage`, `sortDir`. Derived
`sortedLeads` `:199-206`, pagination `:208-210` at `pageSize = 50`, page clamp `:212-215`, reset-to-1 on
any filter change `:216`. The row shape is `UnifiedLead` `:13-28` — a flattened, camelCase projection the
API produces for both modules (`_source`, `name`, `contactName`, `email`, `phone`, `country`,
`leadStatus`, `productInterest`, `leadSource`, `reseller`, `owner`, `evaluations[]`, `createdTime`).

**Loading / empty / error** — spinner + "Loading leads..." `:370-376`; `UserSearch` icon +
`No leads matching "<search>"` / `No leads found` `:494-502`; errors collapse to an empty list.

**Role gating** — `isAdmin` / `hasChildResellers` / `canFilterReseller` `:77-79`, same semantics as
AccountsView. Region select admin-only; reseller select needs `canFilterReseller` and `>1` option.
Export needs `permissions.canExportData` `:253`.

**Unsaved work** — none registered; filters only.

**Still incomplete (RE-VERIFIED at `211834f`)**
- Dead imports, all four still present and all four confirmed unused as JSX: `AnimatePresence` `:6`, and
  `MapPin`, `User`, `Beaker` from the lucide import `:7`. (`UserSearch` and `Building2` *are* used — do not
  confuse `UserSearch` with `User` when grepping; a bare `grep User` hits both.)
- No docblock, unlike its sibling `AccountsView` — the file starts straight at `'use client'`.
- The previously-recorded dead `setSelectedAccountId` destructure is **gone**, along with the store field
  itself. That finding is resolved, not merely moved.

### LeadDetailView (`src/components/views/LeadDetailView.tsx`, 1398 lines)

Now **three** render trees in one file: the lead branch, the prospect branch, and a shared full-form
edit mode. Serves `/leads/[id]` and `/leads/[id]/edit`, both carrying `?source=`. Signature `:128-138`:

```tsx
export default function LeadDetailView({
  leadId,
  source: sourceProp,
  mode = 'view',
}: { leadId: string; source?: 'lead' | 'prospect'; mode?: 'view' | 'edit' })
```

`source` is **optional on purpose**. A link that knows which Zoho module the record lives in passes it;
a bookmark or pasted URL does not, and the view then infers it from the record it fetches. This is one of
the two deep-link edge cases `fd51770` handled rather than dead-ending.

**Prospects stay under `/leads` even though Zoho stores them as Accounts.** That is a deliberate
information-architecture decision recorded in `211834f`: partners think of prospects as leads. Only the
*save target* varies by record type — a prospect edit PATCHes `/api/accounts/{id}`, a lead PATCHes
`/api/leads/{id}` (`:378`).

**Section map — know which of the three trees you are in**

| # | Section | Lines |
|---|---------|-------|
| 1 | Imports; `ResellerOption`; consts `LEAD_STATUSES`, `INDUSTRIES`, `PRODUCTS_OF_INTEREST`, `STATUS_COLORS` | 1-58 |
| 2 | `SCOPE_EDIT`; `EditableField` interface; `SECTIONS`; **`LEAD_FIELDS`** (12); **`PROSPECT_FIELDS`** (1); form class helpers | 60-120 |
| 3 | Props + state | 128-205 |
| 4 | `fetchResellerOptions` + eager-load effect | 209-224 |
| 5 | `saveFields` — optimistic PATCH helper for the inline fields | 230-248 |
| 6 | Mount fetch `GET /api/leads/[id]?source=…`; branch-populates state | 250-286 |
| 7 | **Full-form edit machinery**: `recordValue`, `populateForm`, `populateKey`, populate effect, `formState`, pristine effect, dirty effect, `detailPath`/`editPath`, `handleSave` | 288-400 |
| 8 | `goBack`, `openRow`, `handleConvert`, `crmLink`, `formatDate`, `sendKeys` | 401-480 |
| 9 | **=== EDIT MODE (`/leads/[id]/edit`) ===** | 482-619 |
| 10 | **=== LEAD VIEW ===** guard + not-found | 621-630 |
| 11 | Lead header (back, title, "Lead" badge + hover explainer, Convert button, Open in CRM) | 631-690 |
| 12 | Convert confirm modal + convert result banner | 691-810 |
| 13 | Lead info grid inside `<InlineEditFieldProvider>` — 12 editable fields | 815-892 |
| 14 | Description block; `<EmailHistory module="Leads">` | 894-906 |
| 15 | **=== PROSPECT VIEW ===** not-found guard | 912-920 |
| 16 | Prospect header + info grid — **plain `InfoCard`s, nothing inline-editable** | 940-982 |
| 17 | Evaluations section (+ Create Evaluation) | 984-1040 |
| 18 | Contacts section (read-only, no add/role controls) | 1042-1092 |
| 19 | `<EmailHistory module="Accounts">` | 1094 |
| 20 | Orders section (+ "New Product Order") | 1096-1171 |
| 21 | Assets section (+ send-keys bar), only when `activeAssets.length > 0` | 1173-1264 |
| 22 | `AssetDetailModal` / `CreateEvaluationModal` / send-keys dialog / send-keys toast | 1266-1383 |
| 23 | Local `InfoCard` component | 1387-1398 |

**Inline editing (view route) — the pattern at scale**

Same contract as AccountDetailView (provider → `saveFields` → `InlineEditField`), but with 12 editable
fields instead of 1. `saveFields` `:230-248` snapshots `previous = lead`, merges optimistically, PATCHes
`/api/leads/{leadId}`, and restores-and-re-throws on failure. The provider wraps only the lead-branch
grid (`:815` open, `:892` close).

Editable fields, all `canEdit={isAdmin}` unless noted:

| `fieldId` | Label | `type` | Zoho key PATCHed | Line |
|-----------|-------|--------|------------------|------|
| `company` | Company | text | `Company` | 817 |
| `first_name` | First Name | text | `First_Name` | 821 |
| `last_name` | Last Name | text | `Last_Name` | 825 |
| `job_title` | Job Title | text | `Job_Title3` | 829 |
| `email` | Email | email | `Email` | 833 |
| `phone` | Phone | tel | `Phone` | 837 |
| `mobile` | Mobile | tel | `Mobile` | 841 |
| `website` | Website | url | `Website` | 845 |
| `industry` | Industry | select (`INDUSTRIES`) | `Industry` | 851 |
| `lead_status` | Status | select (`LEAD_STATUSES`) | `Lead_Status` | 856 |
| `product_interest` | Products of Interest | select (`PRODUCTS_OF_INTEREST`) | `Product_Interest` | 866 |
| `reseller` | Reseller | lookup | `Reseller` | 873 |

Conventions to copy when extending:
- Every `onSave` writes `v || null` so clearing a field sends an explicit null, not `''`.
- Every `select`/`lookup` prepends `{ value: '', label: '— None —' }` to its options.
- `lead_status` demonstrates `displayValue`: the read-only card renders the coloured `STATUS_COLORS`
  badge while the editor still works on the raw string value.
- `reseller` is the only field using `canEdit={canEditReseller}` (admin/ibm **or** `canViewChildRecords`),
  the only one using `onOpenEdit={fetchResellerOptions}` `:879`, and the only one using the
  `apiChanges`/`localChanges` split.
- Read-only leftovers in the same grid, as plain `InfoCard`s: Country `:849`, Lead Source `:871`,
  CSA Sales Rep `:889`, Created `:890`.

**Full-form editing (`/leads/[id]/edit`) — and the declarative field table that makes it safe**

This is the clearest example in the codebase of how the two editing mechanisms are kept from drifting, and
worth reading before you write the sixth one. Rather than hand-rolling a second form, the file declares
its writable fields **once**, as data (`:64-115`):

```ts
interface EditableField {
  name: string;                    // Zoho api name; doubles as PATCH key and form state key
  label: string;
  section: (typeof SECTIONS)[number]['id'];
  input: 'text' | 'email' | 'tel' | 'select' | 'lookup';
  options?: readonly string[];
  required?: true;
  gate: 'admin' | 'reseller';      // mirrors the canEdit prop on this field's InlineEditField
}
```

`LEAD_FIELDS` `:91-105` holds the 12 entries — same api names, same input types, same gates as the inline
fields above — and the comment states the rule explicitly: fields the view shows read-only (Country,
Lead_Source, Owner, Created) stay out **even where the route would accept them**, because a form that
writes what the inline path refuses is a permissions hole.

`PROSPECT_FIELDS` `:113-115` is a single entry, `Reseller`. That is not an oversight: the only field
either detail view lets a user edit inline on a prospect record is its reseller; a prospect's own columns
(billing address, contacts) belong to `/accounts/[id]/edit`.

The four-part populate/dirty/save machinery matches AccountDetailView, with two lead-specific wrinkles:
- **`populateKey` is `` `${leadId}:${source}` `` ** `:307`. The two Zoho modules share almost no api
  names, so a form populated as a lead holds fields an Account does not have. Keying only on the id would
  let a *resolved* source keep the wrong module's values.
- `formState` `:321-324` iterates the active `fields` array rather than a fixed tuple, so adding a field
  to `LEAD_FIELDS` extends the dirty comparison automatically.
- `handleSave` `:370-400` diffs each field against `recordValue(editRecord, f)`, sends `value || null`
  (matching the inline `v || null` convention), short-circuits on an empty diff, and switches the endpoint
  on `source` `:378`. `missingRequired` `:349` blocks the save and drives red borders via `attempted`.

**API calls**
- Mount / id-or-source change: `GET /api/leads/{leadId}?source={source}` `:250-286`. The response's own
  `data.source` wins over the prop, which is the inference path for a cold deep link, and drives which
  state block is filled: prospect → `account` + `contacts` + `evaluationAssets` + `activeAssets` +
  `archivedAssets` + `invoices`; lead → `lead` only.
- Inline field save: `PATCH /api/leads/{id}` `:230-248`. Full-form save: the same, or
  `PATCH /api/accounts/{id}` for a prospect `:378`.
- Convert: `POST /api/leads/{id}` with an **empty JSON body** `:411-444`. Success → `{success, accountId}`
  renders the green banner with a "View Account" `GuardedLink` `:792`.
- Reseller options: `GET /api/resellers` (or `includeChildren` variant) `:209-220`, eager on mount
  `:222-224` and again on `onOpenEdit`.
- Send keys: `POST /api/send-keys` `:446-480`.
- Modal reloads re-`GET /api/leads/{id}?source=…`: `AssetDetailModal.onAssetUpdated` `:1276`,
  `CreateEvaluationModal.onSuccess`. Both only re-apply state when `data.source === 'prospect'`.
- Order creation seeds `setNewInvoiceContext` from the prospect account `:1104` then
  `router.push(buildPath('create-invoice'))` `:1113`.

**Modals / child components** — `AssetDetailModal`, `CreateEvaluationModal`, `EmailHistory`
(module `Leads` on the lead branch, `Accounts` on the prospect branch), `Pagination`,
`InlineEditField` + `InlineEditFieldProvider`, plus the in-file convert-confirm modal,
send-keys confirm dialog and send-keys toast.

**Loading / empty / error** — one shared full-page spinner `:475-479`; three branch-specific not-found
screens: the edit route's `{source === 'prospect' ? 'Prospect' : 'Lead'} not found` `:490`, "Lead not
found" `:626`, "Prospect not found" `:916`. Section empties: "No evaluation licences" `:1038`, "No contacts
found" `:1090`, "No orders yet" `:1169`. Two real error surfaces now: the convert banner `:807` rendering
`convertResult.error`, and the edit form's `saveError` (set from `data.error` when the PATCH returns one,
`:394` — the only detail view that surfaces the API's own message rather than a generic string). Every
other `.catch` is silent.

**Role gating**
- Convert to Prospect: `isAdmin && !convertResult?.success` `:660`, with sub-copy "To create evaluations,
  convert this lead to a prospect first" `:674`.
- All 11 non-lookup fields (inline **and** form): `isAdmin`, via `gate: 'admin'` in `LEAD_FIELDS`.
  Reseller: `canEditReseller`, via `gate: 'reseller'`. One table, both mechanisms.
- Create Evaluation (prospect branch): `permissions.canCreateEvaluations` `:990`; `canExtend` from
  `permissions.canExtendEvaluations` `:1294`.
- Send keys and New Product Order are ungated.

**Unsaved work — one scope** (see §12). `lead-detail:edit` `:61`, dirty only when the full form differs
from its post-populate snapshot `:335-339`, labelled `'this prospect'` or `'this lead'` depending on
`source`. The view registers **no scope of its own beyond that**: its only other unsaved state is an
in-flight inline edit, and `InlineEditField` registers itself (§12.2). `useGuardedRouter` `:141` means
`goBack`, the convert flow's links and the order rows all prompt when something is dirty.

**Still incomplete**
- `archivedAssets` state `:151` is populated in three places (`:271`, `:1280`, `:1305`) and **never
  rendered** — the prospect branch has no archived-assets table (AccountDetailView does). Dead state
  carrying a live fetch cost. Unchanged.
- `InfoCard`'s `badge?: React.ReactNode` prop `:1387` still has no call site anywhere in the file —
  superseded by `InlineEditField`'s `displayValue`, but left behind.
- `X` from lucide `:7` **is now used** — the edit form's Cancel button `:568`. That dead-import finding is
  resolved.
- No docblock, unlike `AccountDetailView`.
- The prospect asset table recomputes select-all against `activeAssets` only, so it cannot select archived
  assets — consistent with them not being displayed, but it means send-keys can never reach an archived
  asset from this view.

### CreateLeadView (`src/components/views/CreateLeadView.tsx`, 495 lines)

Create a Zoho Lead. Route `/leads/new`. Grew by ~105 lines in `35abf9d` — draft persistence only.

**Shows / does** — single form, three cards: draft-restore bar `:294-301`, "Contact Information" `:306-346`
(first, last, email, phone, mobile, job title), "Company Details" `:348-400` (company, website, industry,
country), "Lead Details" `:402-470` (lead status, product interest, lead source, reseller, notes). Error
banner; Cancel → `router.push(buildPath('leads'))` `:481` and Create Lead `:485`.
- Country picker: searchable input over the `COUNTRIES` const `:40`, filtered by `filteredCountries`
  `:222-226`, list capped at 30, closed on blur after 200 ms.
- Reseller: searchable input for `canSelectReseller`; otherwise a disabled input showing
  `user.resellerName || 'Auto-assigned'`.
- Its own picklist consts still differ from LeadDetailView's: `LEAD_STATUSES` here is 6 entries `:62`
  (vs 9 there), `PRODUCT_INTERESTS` 7 `:67` (vs 9 `PRODUCTS_OF_INTEREST`), `INDUSTRIES` 9 `:77` (vs 18).
  Creating then editing a lead can therefore offer different option sets. `LEAD_SOURCES` `:82` exists only
  here — LeadDetailView renders Lead Source read-only in both its view and edit modes.

**Submit** `handleSubmit` `:238-286` — builds a body with `Last_Name`, `Company`, `Lead_Status` always,
then conditionally appends each trimmed optional field, adds `payload.Reseller = selectedReseller` when
permitted, and `POST`s to `/api/leads`. On `data.id`: `clear()` the draft `:276`,
`registerDirty('create-lead', false)` `:277`, then
``router.push(`${buildPath('lead-detail', data.id)}?source=lead`)`` `:278` — note it passes `?source=lead`
explicitly rather than making the detail view infer it. On error: `setError`.
`canSubmit = lastName.trim() && company.trim()` `:236` — only two required fields, and there is still no
red-border/`attempted` treatment like CreateAccountView has; the button is simply disabled.

**API calls** — `GET /api/resellers` on mount when `canSelectReseller` `:215-220`; `POST /api/leads` on
submit. Nothing else.

**Role gating** — `canSelectReseller = isAdmin || permissions.canViewChildRecords` `:169` controls only
the reseller widget. Unlike `CreateAccountView` there is **no viewer lock-out**; a `viewer` reaching this
route gets a fully functional create form.

**Unsaved work — persisted, not guarded** (see §12.3). `useDraft<LeadDraft>('leads:new', isDirty ? draft :
EMPTY_LEAD_DRAFT)` `:186`, with `isDirty` computed as a whole-object comparison against the empty constant
`:183` (simpler than CreateAccountView's field-by-field OR, because nothing here is auto-populated).
`DraftRestoreBar` `:296`, `restoreDraft` `:194-213`, and a `create-lead` registry scope `:189-192`.
Also uses `useGuardedRouter` `:139`, so Cancel prompts.

**Still incomplete**
- **Docblock line 6 claims "Duplicate detection by email before creation" — still false** (RE-VERIFIED).
  There is no duplicate check anywhere in this file: no pre-submit search, no `duplicates` state, no
  warning UI. `CreateAccountView:231-279` is the only place that logic exists. Implement it or delete the
  claim.
- `ExternalLink` imported `:28`, still never used — a leftover from copying `CreateAccountView`, where it
  renders inside the duplicate-match cards.
- No `attempted`-style validation feedback: a user who leaves Company blank gets a disabled button with no
  explanation of which field is missing.


---

## 9. UI: Orders/Invoices and Coupons Views

All paths relative to repo root. **Re-analysed at HEAD `211834f`.** Four commits drive the current state of
this section: `b6efc75` (detail views migrated to per-field inline editing), `dab7c76` (trailing
"Invoices → Orders" string rename), `fd51770` (real routes — `/orders`, `/orders/new`, `/orders/[id]`,
`/order-assistant`, `/coupons*`), and `211834f` + `d9c4efb` (full-form edit routes for orders and coupons,
plus the restored `Currency` allow-list entry).

**The vocabulary split, since it bites hardest here.** URLs and UI copy say **order**; components, API
routes, types and Zoho modules say **invoice**:

| Layer | Says |
|---|---|
| URL | `/orders`, `/orders/new`, `/orders/[id]`, `/orders/[id]/edit`, `/order-assistant` |
| `routes.ts` `legacyViewId` | `draft-invoices`, `create-invoice`, `invoice-detail`, `invoice-edit`, `invoice` |
| Component | `DraftInvoicesView`, `CreateInvoiceView`, `InvoiceDetailView`, `InvoiceView` |
| API | `/api/invoices`, `/api/invoices/[id]` |
| Zoho | `Invoices` module, `Invoice_Date`, `Invoiced_Items`, `Invoice_Type` |
| Header / body copy | "Existing Orders", "New Order", "Order", "Order Assistant" |

`orders/[id]/edit/page.tsx:15` states it outright: *"The UI says 'order'; the component, API route and Zoho
fields say 'invoice'."* Treat it as permanent, not as a migration in progress.

### 9.1 InvoiceView (`src/components/views/InvoiceView.tsx`, 153 lines)

Chat-first entry point for creating an order — despite the name it renders no invoice list or record.

- **Screen**: a persistent PO drop zone pinned at the top (`InvoiceView.tsx:84-141`), and below it a full-height `ChatInterface` (`:145-149`) seeded with `initialMessage="New product or renewal? Give me an email address, contact name or account name and I'll get started."` and two quick actions — `New Product` → sends "New product invoice", `Renewal` → sends "Renewal invoice" (`:76-79`). Note the quick-action *messages* still say "invoice" while the labels do not.
- **PO upload**: drag/drop or click-to-browse, accepts `.pdf,.png,.jpg,.jpeg,.webp` (`:105`). `processFile` (`:44-69`) reads the file as a data URL, strips the `data:` prefix to base64, stores it in Zustand via `setPendingPOFile({ fileName, base64 })` for later attachment to the created invoice, then dispatches a `recivis-send-file` `CustomEvent` on `window` carrying `{ fileName, base64, mediaType, isPdf }` — ChatInterface listens for it. No component-level upload endpoint is called here.
- **API calls**: none directly. All network traffic is inside `ChatInterface`.
- **States**: `dragOver` (border/background swap), `uploadedFile` (name + MB size, green success styling, hard-coded "— Processing..." copy at `:117` that never advances), `X` button clears the file and resets the `<input>` (`:71-74`). There is no error state and no way to know whether the chat consumed the file.
- **Roles**: none. The view is not role-gated at all.

### 9.2 InvoiceDetailView (`src/components/views/InvoiceDetailView.tsx`, 1211 lines)

Orchestrator for one order, serving **both** `/orders/[id]` and `/orders/[id]/edit`. Signature `:116-124`:
`{ invoiceId, mode = 'view' }`, with `const formEditing = mode === 'edit'` at `:166`. Holds all shared state
and delegates rendering to `src/components/invoice/*`: `InvoiceHeader`, `InvoicePurchaseOrder`,
`InvoiceSendTo`, `InvoicePayment`, `InvoiceLineItems`, `OrderActions`, `InvoiceCoupon`, plus the
`SKUBuilder` modal.

**Load** (`:187-244`): on `invoiceId` change, `GET /api/invoices/{id}` → `{ invoice, lineItems }`. If
`invoice.Reseller.id` exists it chains `GET /api/resellers/{resellerId}` and derives:
- `resellerPercentage` ← `reseller.Reseller_Sale` `:151`
- `canPurchaseOnAccount` ← `reseller.Can_Purchase_on_Credit` (Zoho flag → drives **Place Order**) `:155`
- `canPurchaseOnCredit` ← `rData.payOnCard` (PostgreSQL flag → drives **Pay Now / Pay Later**) `:156`. The
  two names are crossed relative to what they gate; an in-file comment acknowledges it.
- `originalListPrices` `:152`: full list price per line-item id. If `Reseller_Direct_Purchase` is already
  true the stored prices are *discounted*, so it reverse-calculates `price / ((100 - pct) / 100)` rounded to
  cents.

**Three editing mechanisms now coexist on this page.** Know which one you are changing.

1. **Per-field inline editing** for the metadata cards, on the view route. The info-card grid is wrapped in
   `<InlineEditFieldProvider>` (`:969`, closes `:1026`). Two fields are inline-editable:
   `fieldId="invoice_date"` label **Order Date**, `type="date"`, saving `{ Invoice_Date: v || null }`
   (`:989`), and `fieldId="due_date"` (`:1000`) saving `{ Due_Date: v || null }`. Both are gated
   `canEdit && !editing`. Everything else in the grid is a read-only `InfoCard`
   (Account/Contact/Reseller/Owner/Billing Country); Account is now a `GuardedLink` to
   `buildPath('account-detail', account.id)` `:972-973` rather than a button. Saves go through `saveFields`
   — optimistic merge, `PATCH /api/invoices/{id}` with just those keys, restore-and-**re-throw** on failure,
   which is what makes `InlineEditField` revert, red-flash and shake. No refetch on success, so
   server-derived fields (totals, Stripe link) do not update after an inline save.
2. **Batch edit mode for line items only**, retained because it is a single multi-row save and still lives
   in local state. `editing` boolean + `editLineItems` working copy `:134`. `enterEditMode` `:324-331`
   clones `lineItems` stamping `_originalPrice` on each; the entry point is the **Edit Line Items** button
   above the table when `canEdit && !editing` `:1066`. `cancelEdit` discards. While `editing` is true both
   inline fields are locked and `OrderActions` is unmounted.
3. **The full edit form at `/orders/[id]/edit`**, new in `211834f`. Render block `:785-945`. Same
   four-part machinery as the other detail views (`formState` `:274-276`, dirty effect `:279-284`, populate
   effect `:290-307`, pristine effect `:309-314`, `saveForm` `:410-467`). Five things worth knowing:
   - The header **Edit** button now navigates rather than setting state:
     `onEdit={() => router.push(buildPath('invoice-edit', invoiceId))}` `:963`.
   - It writes **Currency** `:426-429`, which is why `211834f` had to restore `Currency` to the PATCH
     allow-list. The comment there is explicit that **line-item amounts are not converted** — only the
     currency code changes.
   - Line items reuse `InvoiceLineItems` and the same `buildInvoicedItemsPayload` batch path `:84`, so the
     form and the inline batch edit produce identical request bodies. `lineItemFingerprint` `:71` is what
     lets the dirty check compare a row set cheaply.
   - **A cleared date blocks the save rather than being silently dropped.** `clearedDate` `:400-401`:
     because the route only writes a date when the value is truthy, an existing date *cannot* be cleared
     through the API — so the form refuses to submit rather than let the clear vanish. This is the same
     "never silently drop an edit" principle that drove the Currency reversal.
   - Fields outside the allow-list, or outside the user's gates, render as `ReadOnlyField` `:1188` rather
     than as inputs: Order Date/Due Date when `!canEdit` `:851-852`, Purchase Order when `!canEditPO`
     `:864`, Status when `!canEditStatus` `:881`, Currency when `!canEdit` `:902`. If *nothing* is editable
     the form says so — `nothingEditable` `:786`.

**`saveEdits`** (`:334-392`, the batch line-item path) builds `body.Invoiced_Items` only:
- deleted existing rows → `{ id, _delete: true }`; deleted new rows dropped (`:174-179`)
- `Product_Name: { id }` sent **only for new rows** (`:187`)
- `Contract_Term_Years = priceChanged ? 0 : (li.Contract_Term_Years ?? 1)` — 0 is the sentinel telling the Zoho workflow the price is custom (`:190`)
- optional passthrough of `Start_Date`, `Renewal_Date`, `Description`, `Asset_Code`, `Align_to`
Then `PATCH /api/invoices/{id}`, refetch, exit edit mode, and schedule a **second refetch 6 s later** with `paymentRefreshing=true` so the Stripe link generated by the Zoho workflow lands (`:214-224`). Failures are swallowed (`catch { /* handled by UI */ }`) with no user-visible error.

**Permissions / gating**: `isEditor = role admin|ibm` `:179`; `canEdit = isEditor && invoice?.Status === 'Draft'` `:180`; **`canEditPO = invoice?.Status === 'Draft'`** `:183` (status-gated only, no role check — matching the inline PO editor, which is also ungated); **`canEditStatus = isEditor || permissions.canApproveInvoices`** `:185`. `canApplyCoupon = status === 'Draft' && (admin || ibm || permissions.canModifyPrices)` `:772`. `isRenewal = Invoice_Type === 'Renewal'` — passed to `InvoiceLineItems`, which then blocks product and quantity edits but still allows price and dates (`InvoiceLineItems.tsx:57-60`). `saveForm` re-checks each of the three gates before including a field `:416-437`, so the form cannot write past them.

**Line items and totals**: the client does **not** compute totals. `Sub_Total`, `Discount`, `Tax`, `Grand_Total` are read straight off the Zoho record and rendered in the totals card (`:735-753`); Discount is rendered negated, Discount/Tax rows only appear when `> 0`. Per-line `Net_Total` also comes from Zoho, so during edit mode the Total column is stale until save. Reseller-pricing tooltips reverse-derive list price as `unitPrice / ((100 - pct) / 100)` on hover (`InvoiceLineItems.tsx:166-170`, `:207-211`).

**Send-to toggle** (`toggleDirectPurchase`, `:425-491`): sets `Reseller_Direct_Purchase` and, when `resellerPercentage != null`, rewrites every line item's price in the same PATCH — `true` → `fullPrice * (100 - pct) / 100`, `false` → restore `originalListPrices[id]`. Coupon lines (negative `List_Price`) are passed through as bare `{ id }` (`:436-441`). Every rewritten row gets `Contract_Term_Years = 0`. Same 6 s delayed refetch afterwards.

**Purchase order** (`savePO` `:303-318`, `handleFileUpload` `:320-350`): PO number PATCHes `{ Purchase_Order }` then refetches; the file goes to `POST /api/attach-file` with `{ recordID, fileName, base64, moduleName: 'Invoices' }` and sets `uploadResult` to `"<name> attached"` or `"Upload failed"`.

**Coupon** (`applyCoupon`, `:356-419`): `POST /api/coupons/validate` with `{ code (uppercased), invoiceType, subtotal }`. On `data.valid` and a present `data.discountProductId`, it appends a synthetic line item `{ Product_Name: {id,name}, Quantity: 1, List_Price: -|discountAmount|, Contract_Term_Years: 0 }` to the existing items and PATCHes `Invoiced_Items`, then refetches and shows "Coupon X applied". Errors surface inline ("Invalid coupon", "Coupon has no discount product configured", "Failed to apply coupon to invoice"). There is no way to remove an applied coupon from this UI.

**Payment UI**:
- `InvoicePayment` (rendered `:670-674`) shows Stripe Payment Link, Stripe Total (`Stripe_Total`, falling back to `Grand_Total_with_Stripe_Fee`, with a "Includes $X Stripe fee" sub-line) and a colour-coded `Payment_Status` badge that reads **Awaiting Payment** when blank. The whole card is hidden when there is no payment info and no refresh in flight. When `status` is `Approved` or `Sent` the link is replaced by a `Lock` icon and "Locked (Order {status})". While the parent's `paymentRefreshing` is true it renders "Generating payment details..." instead of the grid.
- `OrderActions` (rendered `:702-721`, only when `!editing`) returns `null` unless `status` is `Draft` or `Sent` **and** at least one payment flag is on. Buttons: **Pay Later** + **Pay Now** when `canPurchaseOnCredit && canSend`; **Place Order** when `canPurchaseOnAccount && canApprove`. `canSend`/`canApprove` come from `user.permissions.canSendInvoices` / `canApproveInvoices` (`:709-710`).
- **Pay Now** flow: two-step confirm dialog (step 1 explains the Stripe tab, step 2 is a generic "Are you sure? This action cannot be undone"), then it **refetches the invoice** to get a fresh `Stripe_Payment_Link` rather than trusting the loaded record; if absent it errors "Payment link not yet generated. Please save the order first." Otherwise `window.open(link, '_blank')` and polling starts.
- **5 s poll**: `setInterval(checkPayment, 5000)` re-GETs `/api/invoices/{id}` and lower-cases `Payment_Status`; on `paid` or `succeeded` it clears the interval, shows a success popup — "The licence keys and a copy of the order have been sent to {reseller name | contact name}" — and calls the parent's `onRefresh` (which re-fetches invoice + line items, `:713-719`). The poll never times out and has no attempt cap; it only stops on success or unmount.
- **Window-refocus resume**: a `window` `focus` listener restarts polling if a payment tab was opened (`paymentWindowRef`) and no interval is currently live; cleanup removes the listener and clears the interval on unmount.
- **Pay Later** PATCHes `{ Send_Invoice: true }`; **Place Order** PATCHes `{ Status: 'Approved' }` but first hard-blocks on `hasPONumber` and `hasPOFile` with inline errors. `hasPOFile` is `!!uploadResult || !!invoice.Purchase_Order_Attachment` (`:712`) — so it passes on a file uploaded this session even if the attach silently failed server-side.

**Loading / empty**: full-page spinner while `loading`; when the fetch yields no invoice it renders **"Order
not found"** with a "Go back" link `:753`. `goBack` `:717-719` is now unconditionally
`router.push(buildPath('draft-invoices'))` — the `invoiceReturnView` handshake is gone with the store field,
so arriving here from an account detail page and pressing the in-app back button lands you on `/orders`, not
back on the account. Browser Back does the right thing; the in-app button does not.

**Unsaved work — four scopes** (`:51-55`, see §12), the most of any view:

| Scope id | Dirty when | Label |
|---|---|---|
| `invoice-detail:line-items` | the batch edit's working copy differs from `lineItems` `:259` | "the order line items" |
| `invoice-detail:purchase-order` | the inline PO editor is open and changed `:260` | "the purchase order number" |
| `invoice-detail:coupon` | a coupon code has been typed but not applied `:261` | "the coupon code" |
| `invoice-detail:edit` | the full form differs from its post-populate snapshot `:281` | "this order" |

Plus each `InlineEditField`'s own scope. All four clear on unmount `:262-266`, `:283`, and each clears
explicitly after its own successful save (`:356`, `:456`, `:534`, `:631`). **This is the view where the
accepted limitation bites hardest**: browser Back out of a batch line-item edit loses that edit — see §12.5.

**Still incomplete**: `InvoiceHeader`'s **Approve** and **Send Order** buttons still have no `onClick` at all
— they render for Draft invoices when the user has the matching permission and do nothing
(`src/components/invoice/InvoiceHeader.tsx:137-148`). The real approve/send path is `OrderActions`. Every
`catch` in the payment and coupon paths is still silent; the edit form is the one place that now surfaces a
save failure, via `formError` `:463`.

### 9.3 CreateInvoiceView (`src/components/views/CreateInvoiceView.tsx`, 544 lines)

Builds a new **New Product** order from `newInvoiceContext`. Route `/orders/new`.

**A cold deep link cannot work here, and the view handles that rather than dead-ending.** `newInvoiceContext`
is in-memory Zustand state (§2.5) set by whichever view launched the order, so hitting `/orders/new` directly
— bookmark, refresh, pasted URL — finds it empty. `fd51770` made that case redirect to `/accounts` carrying
a `?notice=`, which `AccountsView` renders as a banner explaining why (§8, AccountsView). This is one of the
two deep-link edge cases the migration explicitly recovered from. If you ever want `/orders/new` to be
linkable, the fix is to put the account id in the URL, not to restore a store field.

- **Load**: if `newInvoiceContext.reseller.id` exists, `GET /api/resellers/{id}` seeds `currency` ←
  `reseller.Currency`, `resellerRegion` ← `reseller.Region`, `resellerPercentage` ← `reseller.Reseller_Sale`
  (`:120-133`).
- **Editable fields**: `Order Date` and `Due Date` via local `EditDateCard` components, and a **fully
  editable Currency `<select>`** over `['AUD','USD','EUR','GBP','INR','NZD']`. Account/Contact/Reseller/
  Owner/Billing Country are read-only `InfoCard`s. This view predates `InlineEditField` and still does not
  use it — the third editing paradigm in the section.
- **Line items**: rows start `{ Product_Name: null, Quantity: 1, List_Price: 0, Start_Date: today,
  Renewal_Date: today+364d, Contract_Term_Years: 1, _unitPrice: 0 }`. Product selection opens `SKUBuilder`
  scoped to `resellerRegion`; on select the price is auto-discounted `unitPrice * (100 - pct) / 100` when
  `resellerPercentage != null`, with the undiscounted figure kept in `_unitPrice`. Qty (digits only), price
  (decimal), Start and Renewal dates are all editable per row; a hover tooltip on the Total cell shows
  `List: $X − pct% commission` whenever the current price differs from `_unitPrice`.
- **Totals**: computed client-side, subtotal only — `Σ Quantity × List_Price`. No tax or discount modelling.
- **Create** (`createInvoice`): `POST /api/invoices` with `Subject = "{account.name} - Order - {dd/mm/yyyy}"`
  — the rename is written into the Zoho record itself — `Status: 'Draft'`, `Invoice_Type: 'New Product'`,
  `Currency`, `Reseller_Region` mapped through `REGION_MAP` (`AU`/`NZ` → `ANZ`), `Send_Invoice: false`,
  `Don_t_Make_Keys: false`, `Automatically_Send_Email: false`, and `Invoiced_Items` where
  `Contract_Term_Years` is `0` when `List_Price !== _unitPrice` else `1` — meaning a reseller discount alone
  flips it to 0. On `data.id` it clears the draft, clears the dirty scope `:266`, then pushes to
  `/orders/{id}`; on any other response it just clears `saving` with **no error message shown**.
- **Button gating**: "Create Order" disabled while `saving`, or when there are no line items, or any row
  lacks a product.
- **Unsaved work — persisted, and keyed per account** (§12.3). `useDraft<InvoiceDraft>(draftKey, …)` `:111`
  where `draftKey = ` `` `orders:new:${account?.id || 'none'}` `` `:98`, so two half-built orders for
  different accounts cannot overwrite each other. `isDirty` `:113` is
  `lineItems.length > 0 || invoiceDate !== today || dueDate !== plus30` — deliberately **excluding
  currency**, because the reseller fetch overwrites it and a form nobody touched must not leave a draft
  behind. The draft carries `{ invoiceDate, dueDate, currency, lineItems }` `:56-61`; the staged PO file is
  never persisted. A `create-invoice` registry scope `:115-117` covers in-app navigation as well, and the
  view uses `useGuardedRouter` `:77`.

### 9.4 DraftInvoicesView (`src/components/views/DraftInvoicesView.tsx`, 471 lines)

The order list, at `/orders`. Heading is **"Existing Orders"** `:244` despite the file name.

- **Data**: `GET /api/invoices?status=…[&resellerId=|&resellerIds=]` via `fetchInvoices` `:134-164`; the whole
  matching set is loaded and every other operation is client-side. Reseller options come from
  `GET /api/resellers` (admins) or `GET /api/resellers?resellerId={id}&includeChildren=true` (distributors),
  guarded by `canFilterReseller = isAdmin || permissions.canViewChildRecords` `:82-99`.
- **Note it did *not* get the `resellerScope` / `resellersReady` treatment** that `AccountsView` and
  `LeadsView` received in `211834f` (§8). `fetchInvoices` is a `useCallback` with no `AbortSignal` and no
  gate `:134`, `:166-167`. It does not have the self-aborting bug — nothing aborts here at all — but it also
  has no paste-race protection, because its search is client-side over an already-loaded set. If you ever
  move search server-side, this is the file that needs the AccountsView pattern applied.
- **Filters**: search across `Reference_Number`, `Subject`, `Account_Name.name`; Status
  `Draft|Approved|Sent` (server-side, refetches); Type `New Product|Renewal|Co-Term|Add To Contract`
  (client-side); Region select (admin/ibm only, ≥2 regions) translated into a `resellerIds` list; Reseller
  select `:323` (labels differ for admin — "All Resellers" — vs distributor — "All (My Network)" plus a
  "(Mine)" suffix on the own-reseller row). Region changes clear a now-invisible reseller selection.
- **Sort**: `SortHeader` on Order # `:376`, Order Date `:379`, Due Date `:380`, Total `:381`; component at
  `:445`. `Reference_Number` sorts numerically after stripping non-digits. Default is unsorted; the first
  click on a column sets `desc`.
- **Pagination**: 50/page `:77`, `Pagination` rendered above the table always `:366` and below only when
  `total > pageSize` `:424`; page clamped to range and reset to 1 on any filter/search/sort change.
- **Export**: `exportInvoicesList(processedInvoices, { status, type, region, reseller, search })` behind
  `user.permissions.canExportData` and a non-empty result set `:245-247`.
- **Navigation**: the order number is a `<Link href={buildPath('invoice-detail', inv.id)}>` `:396-397`; the
  row has the usual `openRow` companion handler. The `invoiceReturnView` store write is gone.
- **States**: spinner with the label **"Loading invoices..."** `:359` — a surviving pre-rename string, still
  the most visible one left; empty state says `No orders matching "X"` `:434` or `No {status} orders found`.
- **Currency symbols** are hand-rolled per row and only cover AUD/EUR/GBP, falling back to `$` — NZD and INR
  both render as `$` here, unlike `getCurrencySymbol` in the detail/create views.
- **Unsaved work**: none. Filters only.

### 9.5 CouponsView (`src/components/views/CouponsView.tsx`, 215 lines)

Coupon browser, at `/coupons`. `GET /api/coupons` once on mount, everything else client-side.

- **Table**: Code (`Name`, mono, accent), Name (`Coupon_Name`), Discount (`{pct}%` for `Percentage Based`,
  `{symbol}{amount}` for `Fixed Amount`, `—` otherwise), Status badge (Active green / Draft amber / other
  grey), Valid `dd/mm/yyyy – dd/mm/yyyy`, Uses `Remaining/Total`, Products (`Allowed_Products` joined, or
  "All") `:195`.
- **Filters**: free-text search over `Name` + `Coupon_Name`; Status select `Active|Draft|Expired`.
  Pagination 20/page `:50`, reset to page 1 on filter change.
- **Roles**: the **Create Coupon** button is a `<Link href={buildPath('create-coupon')}>` `:94-95` rendered
  only for `admin`/`ibm`. Coupon code is a `<Link href={buildPath('coupon-detail', c.id)}>` `:167-168`.
- **States**: spinner "Loading coupons..." `:134`; empty state `No coupons matching "X"` / "No coupons found"
  `:208`. Fetch failure is indistinguishable from an empty list (`.catch(() => setCoupons([]))`).
- The `Coupon` interface types `Allowed_Products` as `string` `:40` but the render guards for `Array.isArray`
  `:195` — Zoho returns both shapes.
- **The Uses column is where the unenforced cap is visible.** `Remaining/Total` is rendered faithfully;
  nothing decrements `Remaining_Uses`, so in live data it always equals `Total` (or both are blank). See the
  §6 update note.
- **Unsaved work**: none.

### 9.6 CouponDetailView (`src/components/views/CouponDetailView.tsx`, 862 lines)

**This is the reference implementation for the two-mechanism editing pattern** — `d9c4efb` converted it first
precisely because it was the only view that already *had* a full form to convert, so the others needed forms
written rather than moved. Read this entry before adding a sixth edit route.

Serves `/coupons/[id]` and `/coupons/[id]/edit`. Signature `:44-52`: `{ couponId, mode = 'view' }`, with
`const editing = mode === 'edit'` at `:61`.

**What `d9c4efb` actually changed.** Edit mode used to be a local `useState` flag. Consequences of that,
all now fixed: the form could not be linked to, a refresh dropped back to read mode, and Back left the record
entirely rather than leaving edit mode. `handleEdit` `:206-208` is now
`router.push(buildPath('coupon-edit', couponId))` and `handleCancel` `:210-213` pushes back to
`buildPath('coupon-detail', couponId)`.

**Read-only mode** `:575-818` is wrapped in `<InlineEditFieldProvider>` (`:575`). Six cards are click-to-edit,
all gated on `isAdminUser = role admin|ibm` `:56`:

| fieldId | Label | type | PATCH payload |
|---|---|---|---|
| `discount_type` `:622` | Discount Type | `select` (Percentage Based / Fixed Amount) | `{ Discount_Type }` |
| `discount_value` `:636` | Percentage *or* Amount, switching on current `Discount_Type` | `number` | `{ Discount_Percentage }` or `{ Discount_Amount }`; throws `Invalid number` on `NaN` before saving |
| `currency` `:660` | Currency | `select` (AUD/USD/EUR/INR) | `{ Currency }` |
| `start_date` `:671` | Start Date | `date` | `{ Coupon_Start_Date: v \|\| null }` |
| `end_date` `:682` | End Date | `date` | `{ Coupon_End_Date: v \|\| null }` |
| `total_uses` `:693` | Total Uses | `number` | `{ Total_Usage_Allowance: n, Remaining_Uses: n }` — **the inline path still resets remaining uses when the total changes** `:706-707`, which is correct behaviour (a new allowance implies a new balance) and is exactly what the full form now also does, conditionally |

Non-editable in read-only mode: the coupon `Name`/code and `Coupon_Name` (header only),
`Coupon_Description`, `Status` (badge only), `Discount Product` (plain `InfoCard`), and **all five
restriction blocks** — Regions, Partners, Products, Order Types, Order Value — which render as static chip
lists with "All regions"/"All partners"/"All products"/"All order types" fallbacks.

`saveFields` `:298-320` mirrors the invoice one but takes an optional second `localChanges` argument for
fields whose local shape differs from the API shape (lookups); none of the six current fields use it.
Optimistic merge → `PATCH /api/coupons/{id}` → restore + re-throw on failure. No refetch after a successful
inline save.

**Full-form mode** `:336-570` remains the *only* way to change the code, name, description, status, and any
restriction. Entered from the header **Edit** button or the **Edit Restrictions** button beside the
Restrictions heading `:598`, `:720` — both now navigate to `/coupons/[id]/edit`. Populate/dirty/save
machinery as described in §8 (AccountDetailView) with `populateForm` at `:142-186` and the populate effect at
`:188-196`. `handleSave` `:218-296` validates `isValid = code && name && discountType && (pct|amount)`
`:215-216`, shows a red banner + red input borders when `attempted && !isValid` `:382`, then PATCHes the
**full** payload — including explicit `null`s to clear `Regions` / `Allowed_Products` / `Partners` /
`Order_Type` / min/max order value when their toggle is off — refetches, clears the dirty scope, and pushes
back to the detail route `:283-288`.

**`Remaining_Uses` — what changed and what did not** `:236-248`:

```ts
data.Total_Usage_Allowance = allowance;
// Remaining_Uses is deliberately NOT written here. Editing an unrelated
// field (a description, a date) must not reset the consumption counter.
if (coupon && coupon.Total_Usage_Allowance !== allowance) {
  data.Remaining_Uses = allowance;
}
```

Before `d9c4efb` this was unconditional, so editing a description reset the counter. Now it re-seeds only
when the allowance itself changes. **This does not make the cap enforced** — nothing decrements
`Remaining_Uses` anywhere in the app, and the `<= 0` rejection in `/api/coupons/validate` cannot currently
fire. See the §6 update note for the live-data verification and why enforcement belongs Zoho-side.

**Still true of the two paths coexisting:** the full save always writes `Currency` and `Status`, so a form
opened before an inline currency edit will overwrite that edit on save. Nothing detects the conflict.

**Unsaved work — one scope** (§12). `coupon-detail:edit` `:42`, dirty only when the 22-field `formState`
`:114-127` differs from the post-populate snapshot `:130-134`, labelled "this coupon". Uses
`useGuardedRouter` `:54`. The commit message states the design rule that came out of building this one
first: *"Edit mode registers unsaved work only when the form differs from a snapshot taken once the record
has populated. Opening /edit and pressing Cancel is silent; a real change prompts. Without that, every Cancel
would have prompted, and a guard that cries wolf gets ignored."*

- **Other API calls**: `GET /api/coupons/{id}` on mount (`:75-83`); `GET /api/resellers` lazily, only once `partnerRestrictions` is toggled on and only if not already loaded (`:86-92`). Server side, `PATCH /api/coupons/[id]` is admin-only (`403` otherwise) and passes the request body straight through to Zoho v7 with no field allow-list.
- **Zoho multi-select normalisation**: `toArray()` accepts arrays or `;`-delimited strings (`:32-36`).
- **Misc**: "Open in CRM" deep-links to `https://crm.zoho.com.au/crm/org7002802215/tab/Coupons/{id}` (`:251`). Loading spinner; "Coupon not found" + back link (`:268-275`). All catch blocks are silent — a failed full-page save leaves the user in the form with no message.

### 9.7 CreateCouponView (`src/components/views/CreateCouponView.tsx`, 513 lines)

Admin-only creation form at `/coupons/new`; non-admins get a plain sentence instead of the form. Same layout
CouponDetailView's edit mode reproduces. Grew by ~130 lines in `35abf9d` — draft persistence only.

- **Sections**: draft-restore bar `:274`, Coupon Details (code auto-uppercased on keystroke, name, optional
  description), Discount, Validity, Restrictions.
- **Discount**: type `Percentage Based | Fixed Amount`; the numeric field swaps between "Percentage *" and
  "Amount *" and strips everything but digits and `.`; Currency select over `['AUD','USD','EUR','INR']` —
  note this is a **different** currency list from CreateInvoiceView's six.
- **Validity**: Status `Draft | Active` (no "Expired" option even though CouponsView filters on it), Start
  Date, End Date, Total Uses (digits only, placeholder "Unlimited").
- **Restrictions** — five `RestrictionToggle` switches that reveal their controls when enabled: Region (chips
  over `AU/EU/NA/AS/NZ/WW`), Partner (searchable reseller list, selected partners become removable chips;
  resellers lazy-fetched from `GET /api/resellers` on first toggle-on), Product (hard-coded list
  `Civil Site Design`, `Civil Site Design Plus`, `Stringer`, `CorridorEZ`), Order Type
  (`New Product`, `Renewal`), Order Value (min/max numeric).
- **Save** `handleSave`: `POST /api/coupons`. Unlike the detail-view form it only sets keys that have values —
  it never writes `null` to clear a field, which is fine on create. `Total_Usage_Allowance` **and**
  `Remaining_Uses` are both seeded from Total Uses; this is the only place `Remaining_Uses` is ever written
  with intent, and after that nothing in the app changes it. On `result.id` it `clear()`s the draft `:258`,
  clears the dirty scope `:259`, then pushes to `/coupons/{id}` `:260`; otherwise it silently stops
  (`catch { /* handled */ }`), leaving the button re-enabled with no feedback.
- **Validation**: `isValid` requires code, name, type and the matching discount value; the Save button is
  **not** disabled when invalid (only while `saving`) — clicking sets `attempted` and surfaces the banner and
  red borders.
- Header copy still reads "Create a discount coupon for **invoices**" — one of the rename's surviving leaks.
- **Unsaved work — persisted, not guarded** (§12.3).
  `useDraft<CouponDraft>('coupons:new', isDirty ? draft : EMPTY_COUPON_DRAFT)` `:147`, plus a
  `create-coupon` registry scope `:151-153`.

### 9.8 Currency on an order — reversed at `211834f`, and the test that is now accidentally right

**The Currency lock described in every previous revision of this document no longer exists.** `dab7c76`
removed `Currency` from the invoice PATCH allow-list; `211834f` put it back, deliberately, and the reasoning
is worth carrying forward because it is a general principle this codebase now follows:

> Of the three options — accept the field, reject it with an error, or accept-and-drop — accept-and-drop was
> the worst, because the request still returned `{ success: true }` and the edit vanished without a word.

Current state, precisely:

1. **Server-side.** `src/app/api/invoices/[id]/route.ts:106-111` writes `Currency` when truthy, with a
   five-line comment recording both the reversal and why. Allow-list at HEAD: `Invoice_Date`, `Due_Date`,
   **`Currency`**, `Invoiced_Items`, `Reseller_Direct_Purchase`, `Purchase_Order`, plus `Status` and
   `Send_Invoice` on their own permission-checked paths.
2. **UI-side.** `/orders/[id]/edit` offers a Currency `<select>` when `canEdit`, and a `ReadOnlyField`
   otherwise (`InvoiceDetailView.tsx:902`). The *inline* path on the view route still does **not** offer
   currency — it is one of the read-only `InfoCard`s. So currency is editable through the form and not
   through the inline cards, which is the one place the two mechanisms deliberately differ.
3. **Amounts are not converted.** `InvoiceDetailView.tsx:426-429`: only the currency code changes; line-item
   numbers are untouched. Changing AUD → USD on an order does not reprice it.
4. **Creation is unchanged.** `CreateInvoiceView` still has a free `<select>` over six currencies and
   `POST /api/invoices` accepts it. Currency is seeded from the Reseller record there, not imposed by it.
5. **Coupon currency** remains editable both inline and via the form (§9.6), and the coupon form still writes
   it on every save.

**The schema is still dead code, and that has not changed.** `src/lib/validation.ts:48-55` declares
`updateInvoiceSchema` with `Currency: z.string().optional()`, and `src/__tests__/validation.test.ts` has a
passing test named `'accepts currency update'`. Nothing imports the schema — `grep -rn "updateInvoiceSchema"
src/app/` returns nothing, and the route hand-writes `if (body.X)` checks. So:

- The test now *agrees* with the route's behaviour, by coincidence rather than by coupling. It was wrong
  before and is right now, without anyone touching it. That is not a test doing its job.
- If the intent is one source of truth, the follow-up is to wire `validateBody(updateInvoiceSchema, body)`
  into the route and keep the schema in step with the allow-list — not to delete either half. Note the schema
  is *missing* `Status` and `Send_Invoice`, so wiring it up as-is would silently break both.

### 9.9 Orders vs Invoices — where the vocabulary actually splits

`dab7c76`'s message claims the rename is "finished". It is finished **for the surfaces it enumerated**; it is a user-visible string rename only, and the code layer is untouched by design. Several user-visible strings in these views also still say "invoice".

| Layer | Says **Order** | Still says **Invoice** |
|---|---|---|
| **URLs** (new) | `/orders`, `/orders/new`, `/orders/[id]`, `/orders/[id]/edit`, `/order-assistant` | — |
| `legacyViewId` keys in `src/lib/routes.ts:39-43` | — | `'draft-invoices'`, `'create-invoice'`, `'invoice-detail'`, `'invoice-edit'`, `'invoice'` — the Zustand `currentView` union is gone but its *vocabulary* survives as the `buildPath` key, so `buildPath('invoice-detail', id)` returns `/orders/{id}` |
| API routes | — | `/api/invoices`, `/api/invoices/[id]` |
| Component files | `src/components/invoice/OrderActions.tsx` | `InvoiceView`, `InvoiceDetailView`, `CreateInvoiceView`, `DraftInvoicesView`, and `src/components/invoice/Invoice*.tsx` |
| Zoho module / fields | — | module `Invoices`; `Invoice_Date`, `Due_Date`, `Invoice_Type`, `Invoiced_Items`, `Send_Invoice`, `Reference_Number` |
| CRM deep link | — | `…/tab/Invoices/{id}` (`InvoiceHeader.tsx:78`) |
| Permissions | — | `canApproveInvoices`, `canSendInvoices` (`InvoiceDetailView.tsx:709-710`) |
| List page | heading "Existing Orders" (`DraftInvoicesView.tsx:244`); columns "Order #", "Order Date"; search placeholder "Search by order #, subject, or account..."; empty states "No orders matching…", "No {status} orders found" | spinner label **"Loading invoices..."** (`DraftInvoicesView.tsx:359`) |
| Detail page | "Order Number" badge, "Send Order" button, `Order {id}` title fallback (`InvoiceHeader.tsx:92,146,171`); "Order Date" card; "Order not found" (`InvoiceDetailView.tsx:753`); "Edit Order" (`:793`); "Order and Licence Keys will be sent to" (`InvoiceSendTo.tsx:36`); "Locked (Order {status})" (`InvoicePayment.tsx:62`); all of `OrderActions` | — |
| Create page | "New Order" badge, "Create Order" button, "Order Date" label | — |
| Data written to Zoho | `Subject` is composed as `"{account} - Order - {date}"` in `CreateInvoiceView` — the rename leaks into stored records, so old and new orders have different Subject vocabulary | — |
| Chat entry | quick-action **labels** "New Product" / "Renewal" | quick-action **messages** sent to the assistant: `'New product invoice'`, `'Renewal invoice'` (`InvoiceView.tsx:77-78`) |
| Coupon pages | — | "Create a discount coupon for **invoices**" (`CreateCouponView`); `/api/coupons/validate` takes an `invoiceType` argument |
| Route file comments | — | each `orders/**/page.tsx` imports `InvoiceDetailView` / `CreateInvoiceView` / `DraftInvoicesView` and says so in a comment |

Practical rule for future sessions: **URLs and UI copy = "Order", everything a developer types = "Invoice".**
When adding user-facing text to these views use "order"; when touching routes, props, `legacyViewId` keys or
Zoho fields keep "invoice". The known stragglers in this section's scope are `DraftInvoicesView.tsx:359`
("Loading invoices...") and `CreateCouponView`'s header copy, plus the chat quick-action messages.

### 9.10 Known-incomplete items in this section

- `InvoiceHeader` **Approve** and **Send Order** buttons have no handlers (`InvoiceHeader.tsx:137-148`) — pure decoration; `OrderActions` does the real work.
- `InvoiceView`'s uploaded-file card is permanently stuck on "— Processing..." (`InvoiceView.tsx:117`) with no success or failure transition.
- Most network failures in InvoiceDetailView, CouponDetailView, CreateCouponView and CreateInvoiceView are still caught and discarded. The **exception** is the new edit forms, which each surface a save error (`InvoiceDetailView`'s `formError`, `CouponDetailView`'s `attempted` banner) — so the same view can now report a failed form save and silently swallow a failed inline save.
- `OrderActions`' payment poll has no timeout, backoff or attempt cap — it runs every 5 s indefinitely while the page is mounted. `211834f` explicitly left the Pay Now flow, its poll and its refocus handler untouched.
- After an inline save neither detail view refetches, so Zoho-derived fields (totals, `Remaining_Uses`, Stripe link) stay stale until a manual reload. The **form** save does refetch, so the two paths leave the page in different states.
- `CreateCouponView`'s Save button stays enabled when the form is invalid; validation is post-hoc via `attempted`.
- Status option lists disagree: coupons can only be created/edited as `Draft`/`Active`, but CouponsView filters on `Expired`.
- Currency symbol mapping is duplicated across `InvoiceDetailView`, `CreateInvoiceView` and `InvoicePayment.tsx:20`, plus a fourth inline variant in `DraftInvoicesView` that silently maps NZD and INR to `$`.
- `InvoiceDetailView`'s in-app back button always returns to `/orders`, even when the user arrived from an account or a lead — the `invoiceReturnView` store field that used to carry that context was deleted and nothing replaced it. Browser Back is correct; the button is not.
- **Three editing paradigms coexist in this section**: inline per-field (`InlineEditField`), URL-driven full forms (`/orders/[id]/edit`, `/coupons/[id]/edit`), and local-state batch edit (`InvoiceDetailView`'s line items). Plus `CreateInvoiceView`'s bespoke `EditDateCard`, which is a fourth if you are counting components rather than paradigms.


---

## 10. UI: Reseller Management, Login, Reports, Partner Resources

### 10.1 ResellerManagementView

`src/components/views/ResellerManagementView.tsx` — **1617 lines, still the largest file in the repo.**
Gained +144 net in `b6efc75` (inline editing), +110 in `35abf9d` (six dirty scopes), +72 in `fd51770`
(routing) and +184 in `211834f` (the edit route replacing the legacy modal).

**It now serves three routes from one component**, which is why the default export is barely more than a
dispatcher:

| URL | Rendered by | Via |
|---|---|---|
| `/partners` | `ResellerListView` | no `resellerId` prop |
| `/partners/[id]` | `ResellerDetailView` with `mode="view"` | `resellerId` prop |
| `/partners/[id]/edit` | `ResellerDetailView` with `mode="edit"` | `resellerId` + `mode` props |

**Module structure.** One file, five components plus two hooks:

| Component / hook | Lines | Role |
|---|---|---|
| `ResellerManagementView` (default export) | 106–145 | Dispatcher — picks list vs detail, applies the non-admin redirects |
| `partnerFormValues(r)` | 167–189 | Maps a Zoho record to the full form's value object |
| `useDirtyScope(scopeId, isDirty, label)` | 191–201 | Registers/clears one unsaved-work scope. Six call sites. §12 |
| `useFormSnapshot(isOpen, value)` | 203–212 | Returns "changed since this form opened". Used by the modals |
| `ResellerListView` | 214–373 | Grid of partner cards + Add Partner modal |
| `PartnerFormFields` | 375–551 | Shared full-form field set (create modal + the `/edit` route) |
| `ResellerDetailView` | 553–1492 | Detail screen — the bulk of the file |
| `PermissionToggles` | 1494–1605 | Tri-state permission grid, reused twice |
| `InfoCard` | 1610–1617 | Read-only card primitive |

**Top-level dispatch and gating** (`106–145`). Props are `{ resellerId?, mode = 'view' }`. `isAdmin = role
=== 'admin' || 'ibm'`; `isManager = permissions.canManageUsers`; `hasChildResellers =
permissions.canViewChildRecords`. Two redirects, both `router.replace` so Back cannot trap the user in a
loop:
- `:128` — a non-admin without child resellers landing on `/partners` is replaced into
  `buildPath('reseller-detail', ownResellerId)`; they never see the grid.
- `:134-136` — **a non-admin on `/partners/[id]/edit` is bounced to the detail route**, either for the
  requested partner if they may view it or for their own otherwise. So a partner cannot open another
  partner's edit form by typing the URL. `ResellerDetailView` additionally computes
  `editing = mode === 'edit' && isAdmin` `:574`, so the form stays off screen even during the render before
  the redirect lands.
- If neither `isManager` nor `isAdmin`: the flat message "You do not have permission to manage partners."

The detail mode's stacked sections in DOM order: header bar → DB-registration banner → registration form →
role badge + permissions block → info-card grid *or* the full edit form → Users table → three modals.

#### 10.1.1 Grid mode — `ResellerListView` (214–373)

Local state: `resellers`, `allResellers` (same payload, kept separately for the distributor lookup),
`loading`, `search`, `regionFilter`, `currentPage` (pageSize 24 `:226`), `showCreate`, `newP` (create form
values), `creating`, `createError`.

- **Fetch**: `GET /api/resellers` for admins; non-admins get
  `GET /api/resellers?resellerId=<id>&includeChildren=true`. On error the list is set to `[]`.
- **Filtering** is client-side over the fetched array — region equality then case-insensitive name substring.
  `useEffect(() => { setCurrentPage(1); }, [search, regionFilter])` at `:262` is still the
  `react-hooks/set-state-in-effect` lint error introduced by `b6efc75` and still in the 33-error baseline.
- **UI**: search box, region `<select>` shown only when `isAdmin && regions.length > 1`, `Pagination` above
  the grid `:319`, then 1/2/3-col cards. Each card is a `MotionLink` — a `motion.create(Link)` wrapper —
  pointing at `buildPath('reseller-detail', r.id)` `:322`, so partner cards are real links now.
- **Empty state** `:340`: `No partners matching "<search>"` or `No partners found`. **Loading**: spinner +
  "Loading partners..." `:315`.
- **Add Partner** button renders for `isAdmin` only `:290`. Opens a full-screen modal `:350` with
  `PartnerFormFields`, a scroll region capped at `65vh`, and `createReseller` `:264-283`: coerces
  `Reseller_Sale` / `Distributor_Percentage_Rate` via `parseFloat`, wraps `Distributor` as `{ id }`,
  `POST /api/resellers`, and on `result.id` pushes to `buildPath('reseller-detail', result.id)` `:276`.
  Only validation is a non-empty trimmed `Name`, which also gates the submit button `:359`. **The
  post-create redirect is deliberately not guarded** — the scope is already clean by then.

#### 10.1.2 `PartnerFormFields` (375–551) — used by the create modal and the `/edit` route

Five labelled groups:

1. **Partner Details** — `Name` (required), `Region` (select, `REGIONS`), `Currency` (select, `CURRENCIES` = AUD/USD/EUR/INR/GBP/NZD), `Partner_Category` (select, `PARTNER_CATEGORIES` = Reseller / Distributor / Distributor/Reseller / Affiliate / Platinum Partner), `Distributor` (type-ahead over `allResellers` filtered to `partner_category.includes('Distributor')`, with a "None" option; `320–338`).
2. **Primary Contact** — `Reseller_First_Name`, `Reseller_Last_Name`, `Email`.
3. **Address** — `Street_Address`, `City`, `State`, `Post_Code`, `Country`.
4. **Commercial** — `Reseller_Sale` (%), `Distributor_Percentage_Rate` (%), both stripped to `[\d.]` on input; `Additional_Tax_Infromation` `:509` (the misspelling is the Zoho field name — do not correct it).
5. **Settings** — `Direct_Customer_Contact` as a two-button toggle ("Direct to Customer" / "Via Reseller", `:527`), and `Can_Purchase_on_Credit` as a checkbox labelled **"Pay on Account"** `:537`.

No per-field validation beyond the numeric character stripping; no email format check. `partnerFormValues(r)`
`:167-189` is the single mapping from a Zoho record to this form's value object — `211834f` extracted it so
the create modal and the `/edit` route seed identically. (A duplicate `EMPTY_PARTNER` and an unused
`SCOPE_CREATE_PARTNER` left behind by the agents that built the guard slice were removed in `35abf9d`.)

#### 10.1.3 Detail mode — `ResellerDetailView` (553–1492)

Props `{ resellerId, mode }`. `editing = mode === 'edit' && isAdmin` `:574`.

**State shape** (`566–619`), grouped:

- Record: `reseller` (untyped `Record<string, any>`), `users: UserRecord[]`, `allResellers`, `loading`.
- Full-form edit: `editFields`, `savingReseller`, plus `populatedFor` and `pristine` refs `:579-583`.
  **There is no `editingReseller` boolean any more** — the URL is the state.
- Users: `showAddUser` + `addName`/`addEmail`/`addPassword`/`addRole`/`addError`/`addingUser`;
  `editingUser`/`editUserName`/`editUserRole`/`savingUser`; `resetUserId`/`newPassword`/`resettingPw`/
  `resetMsg`; `userSearch`, `userPage` (page size 10).
- Portal registration: `dbRegistered`, `dbRole`, `availableResellerRoles: RoleWithPerms[]`,
  `showRegisterForm`, `registerFields` `:607`, `registering`, `registerError`, `registerPermissions`,
  `registerMaxEvals`.
- Permissions: `permissionOverrides`, `payOnCard`, `editingPermissions` `:616`, `editPerms`, `editMaxEvals`,
  `savingPerms`.

**`loadData()`** `:690-707` fires on mount and after every mutation. Two parallel fetches:
`GET /api/resellers/{id}` and `GET /api/resellers`. From the first it lifts `reseller`, `users`,
`dbRegistered`, `dbRole`, `availableRoles`, `permissionOverrides`, `payOnCard`. Still wrapped in a bare
`catch {}` — a failed load leaves `reseller` null and renders "Partner not found" `:826`, with nothing
distinguishing the two.

**Loading state**: full-height spinner. **Not-found state**: "Partner not found" + a "Go back" link `:826`.

**Header** `:832-900`: back button — `goBack` `:709-712` pushes `/dashboard` for non-admins without child
resellers, else `/partners` — then name + `region • category` subtitle, then:
- **Sync** — `isAdmin && dbRegistered` only. `PATCH /api/resellers/{id}` with `{ _syncDistributor: true }`
  `:882`, then `loadData()`. Errors swallowed by `catch {}`.
- **Edit** `:892` — `isAdmin && !editing`. Now
  `startEditReseller() → router.push(buildPath('reseller-edit-route', resellerId))` `:722-725`. Note the
  `legacyViewId` is `reseller-edit-route`, not `reseller-edit` — that string is taken by the *modal-era*
  dirty scope id, and the route table uses the suffixed name to avoid the collision.
- **Save / Cancel** in edit mode `:845`, `cancelEditReseller` `:727` pushing back to the detail route.
- **Open in CRM** — hard-coded `https://crm.zoho.com.au/crm/org7002802215/tab/Resellers/{id}` `:714`,
  `:896`, new tab.

**DB-registration banner + form** (`:903-1082`, admin-only). When `dbRegistered === false` a warning banner
explains the partner exists in Zoho but not in the portal DB. "Register Partner" `:931` seeds
`registerFields` from the Zoho record `:923` and opens the form: `name` (required) `:945`, `email` `:950`,
**Permission Preset** (required, a `<select>` over `availableResellerRoles`) `:955`, `region` `:972`,
`currency` `:980`, `partner_category` `:989`, `direct_customer_contact` checkbox `:1001`. Choosing a preset
resets every override in `registerPermissions` to `null` `:960` and reveals `PermissionToggles` `:1009-1035`
with `roleDefaults` computed from the chosen role row `:1018-1023`. Submit `:1043-1077` validates name +
preset, builds a payload of **only non-null overrides** `:1049-1053`, appends
`max_evaluations_per_account` if set, and `POST /api/resellers/{id}` with
`{...registerFields, reseller_role_id: parseInt(...), distributor_id: ... || null, permissions }`
`:1057-1062` — which writes a row into the PostgreSQL `resellers` table. Note `registerFields.distributor_id`
is seeded from the Zoho record `:923` but has **no input in the form**, so it can only ever be submitted at
its seeded value.

**Registered badge + permission display** (`:1085-1256`). When `dbRegistered && dbRole`: a green "Registered"
chip, the preset display name, and (admin, not editing) an **Edit Permissions** button `:1110`. Not editing →
a read-only grid of all 11 `PERMISSION_DEFS` `:75` showing effective value (`override ?? roleDefault`) with an
orange bullet marking overrides, plus two extra read-only chips: **Pay on Card** (from `payOnCard`) and
**Pay on Account** (from `reseller.Can_Purchase_on_Credit`) `:1247`.

**"Edit Permissions" form** (`:1116-1215`) — the important one for write-path tracing, and **still a modal,
deliberately**. `211834f` moved the partner *record* form to a route and explicitly kept the user modals and
the permission matrix as modals: they are not records with URLs.

- Opening it `:1089-1112` pre-fills `editPerms` from `permissionOverrides`, mapping UI key `can_x` → DB
  column `perm_x` (`'perm_' + key.replace('can_','')`), and `editMaxEvals` from
  `perm_max_evaluations_per_account`. It then sets two pseudo-keys: `_pay_on_card` from `payOnCard` and
  `_pay_on_account` from `reseller?.Can_Purchase_on_Credit` `:1105`.
- The 11 real permissions render through `PermissionToggles` `:1494` — tri-state, cycling
  `null (use preset default) → override → back to null`, with `max_evaluations_per_account` exposed as a
  number input + "Unlimited" (`-1`) checkbox + "Reset" when an override is present.
- **Payment Methods** block — two plain boolean buttons, *not* tri-state, keyed `_pay_on_card` ("Allow
  payment via credit card (Pay Now / Pay Later)") and `_pay_on_account` ("Allow placing orders on account
  terms (requires PO)").
- **Save** fires **two sequential PATCHes to the same endpoint**:
  1. `PATCH /api/resellers/{id}` with `{ _updatePermissions: true, permissions: {...} }` `:1194`. Keys
     beginning `_` are stripped from the payload first, then `pay_on_card` is re-added explicitly from
     `_pay_on_card`. → **PostgreSQL**: the route's `_updatePermissions` branch writes the `perm_*` columns
     and `pay_on_card`, which its own comment calls "portal-only (no Zoho equivalent)".
  2. `PATCH /api/resellers/{id}` with `{ Can_Purchase_on_Credit: !!editPerms['_pay_on_account'] }`
     `:1199-1202`. The generic PATCH branch spreads the body straight into a Zoho `updateRecords` call →
     **Zoho CRM**.

  So: **Pay on Card → Postgres (`resellers.pay_on_card`). Pay on Account → Zoho
  (`Can_Purchase_on_Credit`).** Both writes are inside one `try/catch {}` with no error surfaced; a failed
  second call silently leaves Postgres and Zoho out of sync, and `savingPerms` still resets. There is no
  per-write result check.

  The same `Can_Purchase_on_Credit` value is editable from a *second* place — the "Pay on Account" checkbox
  in `PartnerFormFields` `:537`, now reached via `/partners/[id]/edit`. Two UIs, one Zoho field.

**Info-card grid vs the full edit form.** `editing` → `PartnerFormFields` + Cancel / Save, where
`saveReseller()` `:729-752` parses the two percentages (deleting the key when blank), normalises
`Distributor` to `{id}` or `null`, PATCHes, reloads, clears the `reseller-edit` scope and pushes back to the
detail route. **It never checks `res.ok`** `:740-742` — a bare `await fetch(...)` with no result inspection,
inside a `try { } catch {}` `:750`, then it navigates as though the save worked. That is the client-side twin of the §6 "success without checking"
finding and is the one place in the five new edit forms where a failed save is invisible; the other four all
surface an error.

Otherwise the grid renders inside `<InlineEditFieldProvider>` `:1259` — the part `b6efc75` rewrote.

#### 10.1.4 The inline card grid (`b6efc75`), re-anchored at `211834f`

Before `b6efc75` the grid was eleven `<InfoCard>`s — pure read-only; the only way to change anything was the
header Pencil → full form. Ten of those cards are now click-to-edit, starting at `:1259`
(`<InlineEditFieldProvider>`), and two stay composite:

| Card | fieldId | Line | type | Writes |
|---|---|---|---|---|
| Primary Contact | — | 1264 | composite `<div>` | `onClick={isAdmin ? startEditReseller : undefined}` → navigates to `/partners/[id]/edit` |
| Email | `email` | 1271 | `email` | `{ Email: v \|\| null }` |
| Region | `region` | 1275 | `select` (REGIONS) | `{ Region: v }` |
| Currency | `currency` | 1283 | `select` (CURRENCIES) | `{ Currency: v }` |
| Partner Category | `partner_category` | 1289 | `select` | `{ Partner_Category: v }` |
| Distributor | `distributor` | 1295 | `lookup` | api `{ Distributor: {id} \| null }`, local `{ Distributor: {id,name} }` |
| Reseller Percentage | `reseller_sale` | 1315 | `number` | `{ Reseller_Sale: parseFloat }`, throws on NaN |
| Distributor Percentage | `distributor_percentage` | — | `number` | `{ Distributor_Percentage_Rate: parseFloat }`, throws on NaN |
| Tax Information | `tax_info` | 1335 | `text` | `{ Additional_Tax_Infromation: v \|\| null }` |
| Customer Communication | `customer_comm` | 1340 | `select` true/false | `{ Direct_Customer_Contact: v === 'true' }` |
| Address | — | 1352 | composite `<div>` | → `startEditReseller` |
| CSA Account Manager / Portal Users | — | — | `InfoCard` | read-only |

Every editable card is gated by `canEdit={isAdmin}`; managers see the same grid with no edit affordances.

**The inline edit flow**: click a card → it swaps to an inline editor (one field at a time, coordinated by the
provider) → confirm → `onSave` calls `saveFields` `:759-777`: snapshot `reseller`, apply
`localChanges ?? apiChanges` optimistically, `PATCH apiChanges` to `/api/resellers/{id}`, and on non-`res.ok`
or throw restore the snapshot and re-throw so `InlineEditField` can flash, shake and revert. **This is the
only save path in the file that checks `res.ok`** — `saveReseller`, `saveUser`, `toggleActive` and Sync all
do not. No `loadData()` refetch afterwards; the grid trusts the optimistic merge.

One field needs the `apiChanges`/`localChanges` split: Distributor (Zoho wants `{id}`, the card displays
`.name`). It also passes `onOpenEdit={loadData}` `:1305` so the option list refreshes when the dropdown
opens — the heaviest `onOpenEdit` in the codebase, since `loadData` is two full fetches.

Three previously-conditional cards are always rendered now — Distributor, Distributor Percentage and Tax
Information used to be hidden when empty; as `InlineEditField`s they render with an em-dash so they can be
filled in. **Address is still conditional on `Street_Address || City`** `:1352`, so a partner with a
completely empty address has no way to add one from the detail grid. That is less of a trap than it was: the
full form is now a linkable route (`/partners/[id]/edit`), admin-only.

#### 10.1.5 User management (table `:1360-1415`, modals `:1417-1490`)

Table columns: Name, Email, Role (colour-coded badge — admin red, ibm purple, manager accent, else muted),
Status (Active/Inactive), Last Login (`dd/mm/yyyy` or "Never"), Actions. Inactive rows render at
`opacity-50`. Client-side search over name+email, `Pagination` at 10/page. Empty state: "No matching users" /
"No users yet" `:1412`.

**These stayed modals on purpose.** `211834f` moved the partner record's form to a route and explicitly kept
the user modals and the permission matrix as modals — they edit rows and settings, not records with URLs.

- **Add User** (`addUser` `:780-792`, modal `:1417-1440`) — Name, Email, Password ("Min 8 characters"
  placeholder, **not enforced client-side**), Role select `:1434`. `POST /api/users` with
  `{name, email, password, userRoleName, resellerId}`. Surfaces `data.error`. The Add User button `:1372` has
  **no permission gate** — it renders for any user who reached the detail view.
- **Edit User** (`saveUser` `:794-800`) — name + role only. `PATCH /api/users/{id}` with
  `{name, user_role_name}`.
- **Toggle active** (`toggleActive` `:802-805`) — `PATCH /api/users/{id}` `{is_active: !u.is_active}`. No
  confirmation dialog.
- **Reset password** (`resetPassword` `:807-…`) — `PUT /api/users/{id}` `{password}`. Button disabled under 8
  chars (this one *is* enforced). Success message auto-dismisses after 1.5 s.

Role options come from `availableRoles` `:563`: admins get all five (`ALL_ROLES` `:61`); everyone else is
capped to `MANAGER_ROLES` = viewer/standard/manager `:68`.

#### 10.1.6 Unsaved work — six scopes, the most in the app

`35abf9d` gave this file its own `useDirtyScope` helper `:191-201` and a `useFormSnapshot` helper `:203-212`,
then registered every form that can hold input (see §12):

| Scope id | Registered at | Dirty when | Label |
|---|---|---|---|
| `reseller-edit` | 632–636 | the `/edit` route's form differs from its post-populate snapshot | "this partner" |
| `reseller-add-user` | 637–641 | any of name / email / password is non-empty `:638` | "this new user" |
| `reseller-edit-user` | 643–647 | `useFormSnapshot` says the prefilled name/role changed | "this user" |
| `reseller-reset-password` | 648–652 | a password has been typed `:650` | "this password reset" |
| `reseller-register` | 653–662 | any register field, permission override or max-evals value is set | "this partner registration" |
| `reseller-permissions` | 664–668 | `useFormSnapshot` says the permission matrix changed | "these partner permissions" |

Two design notes recorded in the source and worth keeping:
- **Prefilled forms compare against a snapshot taken when they open**, so merely *opening* one does not
  prompt. `useFormSnapshot(isOpen, value)` `:203-212` exists for exactly that.
- **The `/edit` route cannot use `useFormSnapshot`** `:625-630`: `editing` is true before the record has
  loaded, so a snapshot taken on open would capture an empty form and every populated field would read as
  the user's typing. The `pristine` ref set once population lands is used instead — the same pattern as the
  other four detail views.
- Every scope clears on unmount as well as on save. A scope stranded dirty would block *all* later
  navigation, which is worse than no guard at all.
- Password values are guarded but **never persisted anywhere** — no `useDraft` on this file, by design.

#### 10.1.7 Incomplete / rough edges

- `registerFields.distributor_id` is submitted `:1060` but has no form control; it can only ever go up at its
  seeded value `:923`.
- The two-PATCH permission save has no per-call error handling; a partial failure desyncs Postgres and Zoho
  silently `:1194`, `:1199`.
- **`saveReseller` never checks `res.ok`** `:740-742` — see §10.1.3. `saveUser`, `toggleActive`, `addUser`
  (partially) and the Sync button are the same.
- Numerous `catch {}` blocks swallow errors with no user feedback, including `loadData` `:705` and
  `saveReseller` `:750`.
- `PermissionToggles` takes `maxEvalsValue`/`onMaxEvalsChange` as optional `:1505-1507`, and the max-evals row
  only renders when *both* `evalEnabled` and `onMaxEvalsChange` are truthy.
- `useEffect(() => { if (resellerId) loadData(); }, [resellerId])` `:670` omits `loadData` from deps — one of
  the `react-hooks/exhaustive-deps` warnings in the baseline.
- `reseller` is `Record<string, any>` throughout, with `eslint-disable` lines for it.
- The file's header docblock `:1-40` was updated in `211834f` to describe the three routes (`:20` documents
  "Edit mode (reseller selected, mode=\"edit\")"), so unlike most docblocks in this codebase it is current.

---

### 10.2 LoginView

`src/components/views/LoginView.tsx` — 443 lines. **The component is essentially unchanged; what changed is
where it lives.** It is now rendered by `src/app/login/page.tsx` (§11.1), which sits **outside** the
`(portal)` route group. That placement is deliberate: the portal shell — and in particular
`SessionExpiryWatcher`'s 401 fetch interceptor — never mounts here, so a failed sign-in returning 401 cannot
be mistaken for an expired session and bounce the user mid-login.

**One component, three states.** `type View = 'login' | 'forgot' | 'reset'` `:25` held in a single `view`
state — there are still no route-level views for forgot/reset, so those two are the one part of the app that
is still SPA-style. Sign-in success is signalled by `setUser` landing in the store; the page wrapper watches
for that and `router.replace`s to `?next=` or `/dashboard`.

State: `email`, `password`, `newPassword`, `confirmPassword`, `resetToken`, `error`, `success`, `loading`.

**Reset-token entry** `:39-47`: on mount it reads `?reset=<token>` from `window.location.search`; if present it
stores the token, switches to `reset`, and scrubs the URL via
`window.history.replaceState({}, '', LOGIN_PATH)` `:46` — note it now scrubs to **`/login`** (imported from
`routes.ts`) rather than the hardcoded `'/'` it used before. That closes the loop with `middleware.ts:31-33`,
which forwards an unauthenticated `/` **with its query string intact** precisely so the emailed
`${NEXT_PUBLIC_APP_URL}?reset=<token>` link still lands here. The reset link itself was not changed; the
middleware special-case is what keeps it working.

| State | Fields | Posts to | Body | Success |
|---|---|---|---|---|
| `login` | Email, Password | `POST /api/auth` | `{email: trimmed, password}` | `setUser(data.user)` — JWT arrives as an HTTP-only cookie set by the route |
| `forgot` | Email | `POST /api/auth/forgot-password` | `{email: trimmed}` | shows `data.message` inline |
| `reset` | New Password, Confirm Password | `POST /api/auth/reset-password` | `{token: resetToken, password: newPassword}` | shows `data.message`, then auto-returns to `login` after 2s and clears both password fields (`141–146`) |

**Validation.** Login: submit disabled unless both fields non-empty; no email-format check beyond `type="email"`. Forgot: disabled unless email non-empty. Reset: client-side checks that the two passwords match and that length ≥ 8 (`112–120`) before firing; the submit button is only disabled on emptiness. All three catch network failure as "Unable to connect. Please try again." and surface `data.error` for non-OK responses.

**Chrome**: SVG grid background at 3% opacity, two animated gradient rules top and bottom, logo + "Civil Survey Applications / Partner Portal" header, a bordered card, and a copyright line using `new Date().getFullYear()`. Error blocks are red left-bordered; success blocks green with a check. Navigation between states is via "Forgot your password?" (`276–281`) and "Back to Sign In" links, each of which clears `error` and `success`.

No signup path, no SSO, no "remember me", no resend-link affordance.

---

### 10.3 ReportsView

`src/components/views/ReportsView.tsx` — 20 lines. **Live, not dead, and not a wrapper for `ReportsDashboardView`.** It is a thin configuration wrapper around the AI chat component: it renders `<ChatInterface>` with an `initialMessage`, a `placeholder`, and three `quickActions` (`6–10`) — "Expiring Assets (30 days)", "Approved Orders", "Draft Orders" — each of which sends a canned natural-language message into the chat.

**The two views are siblings, not competitors, and each now has its own URL.** `/reports` renders
`ReportsView` (route title "AI Reports", `routes.ts:48`) and `/reports/dashboard` renders
`ReportsDashboardView` ("Reports Dashboard", `routes.ts:49`). Both page files are 11 lines. There is no
`dynamic()` code-splitting any more — that was an `AppShell` concern, and App Router route segments are split
per route by the framework.

**What the sidebar links to** (`Sidebar.tsx:281-306`): "Reports" is a parent `GuardedLink` pointing at
`PATHS.reportsDashboard` `:284`, so clicking the parent — collapsed or expanded — lands on
`/reports/dashboard`; the dashboard is the default. The submenu holds **"Dashboard" → `/reports/dashboard`**
and **"AI Assistant" → `/reports`**. So `ReportsView` is still reachable only via the submenu's "AI
Assistant" item — but now also by typing the URL, which was previously impossible.

**Verdict:** ReportsView is 20 lines because that's all a `ChatInterface` preset needs. It is not superseded — the two coexist as "Reports → Dashboard" (structured) and "Reports → AI Assistant" (conversational).

**The 6-line change** was `dab7c76` (the Invoices→Orders visual rename), purely cosmetic: two `quickActions` labels "Approved Invoices"/"Draft Invoices" → "Approved Orders"/"Draft Orders", and the placeholder "Ask about expiring assets, invoices, or accounts…" → "…orders, or accounts…". The `message` payloads sent to the AI still say "invoices" — deliberately, since the underlying Zoho module is unchanged.

---

### 10.4 ReportsDashboardView

`src/components/views/ReportsDashboardView.tsx` — 551 lines. The structured reporting screen. Only its
navigation changed: every drill-table row identifier is now a `<Link>` built from `buildPath` —
`account-detail` `:355`, `lead-detail` with `?source=lead` `:377` or `?source=prospect` `:385`, and
`invoice-detail` `:423`. The `invoiceReturnView` / `selectedLeadSource` store writes are gone, so a drill-down
is a plain link that middle-clicks and copies like any other.

**Its numbers were wrong until 2026-08-11.** `/api/reports` was silently failing to fetch any reseller or
distributor record (see the §7 update note), so every `Reseller_Sale` percentage resolved to `0`. That means
CSA Profit, Distributor Owed, Reseller Owed, "Your Earnings" and "Your Commission" — the entire revenue tab
below the Revenue figure itself — were computed from zeros. The view code was correct throughout; only its
input was empty.

**Data model** (`11–25`): `MonthReport` per month — counts (`accounts`, `leads`, `prospects`, `invoiceCount`), a `byCurrency` totals map (`revenue`, `csaProfit`, `distributorOwed`, `resellerOwed`), plus the raw drill-down arrays `invoices`, `accountItems`, `leadItems`, `prospectItems`.

**Fetches**:
- `GET /api/resellers` — admin/IBM only, populates the partner filter (`55`).
- `GET /api/currencies` — always, populates FX rates for AUD conversion (`56`).
- `GET /api/reports?months=<n>[&region=][&resellerId=]` — refetched on any change to `monthCount`, `selectedRegion`, `selectedReseller` (`60–70`).

**State**: `data`, `loading`, `tab`, `selectedMonths: Set<string>`, `monthCount` (starts 13, "Load More" adds 12 at a time, `277`), `drillMonth`, `resellers`, `selectedRegion`, `selectedReseller`, `rates`, `viewCurrency`.

**Currency handling.** `viewCurrency` initialises to the user's own `reseller.currency` for non-admins, else `'ALL'` (`46–48`); an effect falls back to `'ALL'` if that currency isn't present in the returned data (`99–103`). `'ALL'` converts every currency into AUD via `toAud` (`79–82`). The currency switcher shows only on the overview and revenue tabs, and only when more than one currency exists (`259`).

**Four tabs** (`31`): `overview | accounts | leads | revenue`.

- **Overview** — four clickable KPI cards (New Accounts → accounts tab, New Leads → leads, Approved Orders → revenue, Revenue → revenue), each with a month-over-month growth chip. Admin/IBM additionally get CSA Profit / Distributor Owed / Reseller Owed metric cards (`305–311`). Under `'ALL'` with >1 currency, a per-currency breakdown grid whose tiles switch `viewCurrency` (`314–328`). Then three `BarChart`s: revenue, new accounts, new leads+prospects.
- **Accounts** — summary card, bar chart, and a `DrillTable` whose account names link to `/accounts/{id}` `:355`.
- **Leads** — Leads and Prospects summary cards, bar chart, drill table mixing both with a type badge; names link to `/leads/{id}?source=lead` `:377` or `?source=prospect` `:385`, which is how the lead/prospect distinction survives the click.
- **Revenue** — Approved Orders count, Revenue, CSA Profit (admin only), and a fourth card whose label and value are role-dependent: "Your Earnings" (distributor, `distributorOwed`), "Partner Owed" (admin, distributor+reseller), or "Your Commission". Drill table columns also vary by role — admins get CSA Profit / Distro Owed / Reseller Owed, distributors get "Your Earnings", others "Your Commission". The order reference links to `/orders/{id}` `:423`.

**Month picker** (`272–289`): a horizontally scrolling strip of month chips; multi-select filters the aggregation, "Clear" resets, the current month is visually distinguished.

**Export** (`177–208`): the button renders only when `user.permissions.canExportData` (`239`). It exports the **current tab** to CSV client-side via a Blob + synthetic anchor click — no server round-trip. Filename is suffixed with the selected months joined by `_`, or `all`.

**Role gating summary**: `isAdminUser = admin || ibm` controls the region and partner filters, the profit/owed metric cards, and the extra revenue columns. `isDistributor = permissions.canViewChildRecords` controls the "Your Earnings" framing. `canExportData` controls the export button.

**Loading / empty**: spinner + "Generating reports…" (`211`); "No report data available" when `data` or `aggregated` is null (`214`). Both `/api/resellers` and `/api/currencies` failures are swallowed silently.

**Rough edges**: `DrillTable` accepts an `isCurrency` prop that no call site passes (`513`); `SummaryCard` accepts `prev`/`curr` growth props that no call site passes (`443`); `renderRows(m)` is invoked twice per expanded month — once to render, once to test length (`537`); `data.totals` is typed `Record<string, unknown>` and never read.

---

### 10.5 PartnerResourcesView

`src/components/views/PartnerResourcesView.tsx` — 165 lines. Unchanged in this merge.

Purely presentational — **no API calls, no state, no props, no gating**. A `resources` array (`18–70`) of three hard-coded entries, each rendered as a `motion.a` card that opens an external URL in a new tab (`target="_blank" rel="noopener noreferrer"`):

| Card | Links to | Listed items |
|---|---|---|
| Marketing Resources | `https://drive.google.com/drive/folders/1XBqoxK5CVGAbUZBQBIXdYeqJrTFgtTzy` | brochures/datasheets, co-branded email templates, social assets, logo + brand guidelines |
| YouTube Product Guides | `https://www.youtube.com/@CivilSurveyApplications/featured` | getting-started tutorials, feature deep-dives, workflow demos, webinar recordings |
| Support | `https://helpdesk.civilsurveyapplications.com/` | knowledge base, submit a ticket, technical docs, release notes |

Each card carries an accent bar, an icon tile, a title with a hover arrow, a description, a bullet list, and an "Explore ↗" CTA. Layout is a 1/3-column responsive grid with a Framer Motion stagger container (`72–80`) and a `whileHover={{ y: -4 }}` lift. Page footer copy: "Need something specific? Contact your CSA Account Manager for assistance." (`160`).

The bullet items are **descriptive labels only** — they are not individually linked; the whole card is one link. Nothing is downloaded from the portal itself; every asset lives behind an external service.


---

## 11. App Shell, Routing and Shared Components

**Re-analysed at HEAD `211834f`.** §11.1 and §11.3–§11.5 were rewritten from source; the previous revision
documented a single-route SPA that no longer exists.

### 11.1 Routing model — rewritten in `fd51770`, extended in `d9c4efb` / `211834f`

There is a real router. Everything a previous revision of this document said about `currentView` is void.

**`src/lib/routes.ts` (119 lines) is the single source of truth.** Its header states the contract: nothing
else may hardcode a portal path. Pages take their title from `getRouteTitle`, the header resolves its title
from `usePathname()`, middleware redirects using `LOGIN_PATH` / `DEFAULT_PORTAL_PATH`, and every navigation
builds its URL with `buildPath`.

```ts
export interface RouteDef {
  path: string;          // URL pattern; a `[id]` segment matches any single non-empty segment
  legacyViewId: string;  // the old `currentView` id this route replaces
  title: string;         // shown in the app header and used as the document title
  needsId: boolean;      // true when `path` contains an `[id]` segment
}
export const ROUTES = [ … ] as const satisfies readonly RouteDef[];
```

The 24-entry table (`routes.ts:29-54`), in file order:

| Path | `legacyViewId` | Title | Component |
|---|---|---|---|
| `/dashboard` | `dashboard` | Dashboard | `DashboardView` |
| `/leads` | `leads` | Leads | `LeadsView` |
| `/leads/new` | `create-lead` | Create Lead | `CreateLeadView` |
| `/leads/[id]` | `lead-detail` | Lead | `LeadDetailView` |
| `/leads/[id]/edit` | `lead-edit` | Edit Lead | `LeadDetailView` (`mode="edit"`) |
| `/accounts` | `accounts` | Accounts | `AccountsView` |
| `/accounts/new` | `create-account` | Create Account | `CreateAccountView` |
| `/accounts/[id]` | `account-detail` | Account | `AccountDetailView` |
| `/accounts/[id]/edit` | `account-edit` | Edit Account | `AccountDetailView` (`mode="edit"`) |
| `/orders` | `draft-invoices` | Existing Orders | `DraftInvoicesView` |
| `/orders/new` | `create-invoice` | New Order | `CreateInvoiceView` |
| `/orders/[id]` | `invoice-detail` | Order | `InvoiceDetailView` |
| `/orders/[id]/edit` | `invoice-edit` | Edit Order | `InvoiceDetailView` (`mode="edit"`) |
| `/order-assistant` | `invoice` | Order Assistant | `InvoiceView` |
| `/coupons` | `coupons` | Coupons | `CouponsView` |
| `/coupons/new` | `create-coupon` | Create Coupon | `CreateCouponView` |
| `/coupons/[id]` | `coupon-detail` | Coupon | `CouponDetailView` |
| `/coupons/[id]/edit` | `coupon-edit` | Edit Coupon | `CouponDetailView` (`mode="edit"`) |
| `/reports` | `reports` | AI Reports | `ReportsView` |
| `/reports/dashboard` | `reports-dashboard` | Reports Dashboard | `ReportsDashboardView` |
| `/partners` | `resellers` | Partners | `ResellerManagementView` |
| `/partners/[id]` | `reseller-detail` | Partner | `ResellerManagementView` (`resellerId`) |
| `/partners/[id]/edit` | `reseller-edit-route` | Edit Partner | `ResellerManagementView` (`mode="edit"`) |
| `/partner-resources` | `partner-resources` | Partner Resources | `PartnerResourcesView` |

Plus `LOGIN_PATH = '/login'` `:60` and `DEFAULT_PORTAL_PATH = '/dashboard'` `:63`, both outside the table.

**Two naming traps in that table.**
- `legacyViewId` keeps the *old* vocabulary, so `buildPath('draft-invoices')` returns `/orders` and
  `buildPath('invoice-detail', id)` returns `/orders/{id}`. `routes.ts:10-13` says this exists so the
  migration could map both ways, and that "Phase B removes `currentView`; at that point `legacyViewId` can be
  dropped from this table." `currentView` is already gone — so this is now a bridge to nothing, kept because
  65 call sites use it as the `buildPath` key. Renaming it is a mechanical but wide change.
- The partner edit route's id is **`reseller-edit-route`**, not `reseller-edit`. `reseller-edit` is the dirty
  *scope* id used by `ResellerManagementView`'s unsaved-work registration (§10.1.6), and the suffix avoids the
  collision.

**Four helpers, all pure** (`routes.ts:69-119`):

| Function | Behaviour |
|---|---|
| `normalize(pathname)` (private, `:69`) | Strips one trailing slash so `/leads/` and `/leads` resolve identically |
| `matchRoute(pathname)` `:78` | Exact match first, then dynamic. **Static wins over dynamic**, so `/leads/new` can never match `/leads/[id]` |
| `getRouteTitle(pathname)` `:96` | `matchRoute(…)?.title` else `'Partner Portal'` |
| `getRouteId(pathname)` `:101` | The record id embedded in a concrete path, or `null` for routes without one |
| `buildPath(legacyViewId, id?)` `:113` | **Throws** on an unknown view id or a missing id for a detail route — deliberately, because both are caller bugs rather than runtime conditions |

`buildPath` throwing is worth internalising: a typo in a nav target is a render-time crash, not a silent
no-op. That is why `DashboardView`'s `featureCards` const can carry `view` strings safely.

**`src/middleware.ts` (49 lines) is the session gate.** It checks only that the `recivis-token` cookie is
**present** — it never verifies the JWT, because verification needs the database (permissions are read
per-request in `api-auth.ts`) and the real enforcement point is `requireAuth` on every API route. Its own
header says so: middleware exists to keep unauthenticated browsers off portal URLs, not to authorise
anything. Behaviour:

| Request | Result |
|---|---|
| `/login` with a cookie | 307 → `/dashboard` `:22` |
| `/login` without | pass through `:24` |
| `/` without a cookie | 307 → `/login` **with the original query string intact** `:32` — this is what keeps the emailed `?reset=<token>` link working |
| any other path without a cookie | 307 → `/login?next=<encodeURIComponent(pathname+search)>` `:33` |
| `/` with a cookie | 307 → `/dashboard` `:38` |
| anything else with a cookie | pass through `:41` |

Matcher `:46-48` excludes `api/`, `_next/static`, `_next/image`, `favicon.ico` and a list of static file
extensions. **Note `/api/**` is excluded**, so an unauthenticated API call gets `requireAuth`'s 401, not a
redirect — which is what `SessionExpiryWatcher` keys off.

**`?next=` is validated client-side, not in middleware.** `login/page.tsx:24-27` — `safeNext` accepts only a
value starting with a single `/`, so `?next=//evil.com` and absolute URLs fall back to `/dashboard`.

**What each layer of the tree does now:**

- `src/app/layout.tsx` (25 lines) — bare `<html lang="en"><body>`, app-level `Metadata`, no providers. The
  brand font still arrives via a CSS `@import` in `globals.css:1`, not `next/font`.
- `src/app/(portal)/layout.tsx` (107 lines) — the authenticated shell. Renders
  `<UnsavedChangesProvider>` → sidebar + header + `SessionExpiryWatcher` + `SearchModal`. Rehydrates the
  session with one `GET /api/auth` on mount `:39-47`; renders `<BrandSplash/>` until it resolves `:66`; and
  `router.replace(LOGIN_PATH)` if it resolves to no user `:50-52`. Header title is
  `getRouteTitle(pathname)` `:77` — view ids no longer decide what the header says. Ctrl/Cmd+K opens search
  `:55-64`.
- `src/app/(portal)/template.tsx` (25 lines) — a 150 ms opacity fade. A *template* remounts on every
  navigation, which is what makes the enter animation replay. **There is no exit animation**: App Router never
  holds the old and new trees in one render, so the previous `AnimatePresence mode="popLayout"` crossfade
  could not survive the migration. Do not try to reinstate it.
- `src/app/(portal)/loading.tsx` (5 lines) — renders `BrandSplash`.
- `src/components/layout/BrandSplash.tsx` (23 lines) — logo via `next/image` with `priority`, three pulsing
  squares. Used by `loading.tsx`, by the portal layout while the session resolves, and as the login page's
  `Suspense` fallback.
- `src/components/layout/SessionExpiryWatcher.tsx` (50 lines) — wraps `window.fetch` once per user
  (`interceptorInstalled` ref), and on a 401 from a URL starting `/api/` waits **3 s** then `setUser(null)` and
  `router.replace('/login?expired=1')`. The delay is deliberate: it lets the failing screen settle so the user
  sees what failed. Cleanup restores the original `fetch`. The URL check reads `args[0]` as a string or a
  `Request` `:33`, so a `URL` object argument would stringify to `''` and be skipped — unchanged from the
  `AppShell` version.
- `src/app/login/page.tsx` (71 lines) — **outside** the `(portal)` group on purpose, so the 401 interceptor
  never mounts there and a failed sign-in cannot be read as an expired session. Wrapped in `Suspense` because
  it calls `useSearchParams`. Honours `?next=` and `?expired=1`.

**Still absent:** no `error.tsx`, no `not-found.tsx`, no `global-error.tsx` anywhere. An unhandled render
error in a route segment gets Next's default boundary, and an unmatched URL gets Next's default 404 — which
means the `getRouteTitle` fallback `'Partner Portal'` is effectively unreachable through normal navigation.

**Two deep-link edge cases recover rather than dead-end**, both worth preserving if you touch them:
`/leads/[id]` infers lead-vs-prospect from the fetched record when `?source=` is absent (§8), and a cold
`/orders/new` with no `newInvoiceContext` redirects to `/accounts` carrying a `?notice=` that `AccountsView`
renders (§9.3).

**Redirects that must not be re-enterable use `router.replace`**, not `push`: logout
(`UserMenu.tsx:92`), the non-admin partner bounce (`ResellerManagementView.tsx:128`, `:136`), the
session-expiry redirect, and the portal layout's no-user redirect. Otherwise Back would trap the user in a
loop.

---

### 11.2 `InlineEditField` — `src/components/InlineEditField.tsx`, 556 lines

**Update 2026-08-12.** The file grew by 14 lines in `35abf9d` and everything below remains accurate except the
export line numbers, which shifted by +2: `InlineEditFieldProvider` `:57`, `useInlineEditContext` (private)
`:99`, `InlineEditFieldType` `:111`, `InlineEditSelectOption` `:123`, `InlineEditFieldProps` `:128`,
`InlineEditField` `:159`, `renderEditor` `:383`, `ToggleEditor` `:465`, `LookupEditor` `:488`.

The 14 new lines are the one behavioural change, and they matter for §12: **every field now mirrors its dirty
flag into the app-wide unsaved-changes registry** (`:217-227`):

```ts
const unsavedChanges = useOptionalUnsavedChanges();
const unsavedScopeId = `inline-edit:${useId()}`;
useEffect(() => {
  if (!unsavedChanges) return;
  unsavedChanges.registerDirty(unsavedScopeId, isDirty, label);
  return () => unsavedChanges.registerDirty(unsavedScopeId, false);
}, [unsavedChanges, unsavedScopeId, isDirty, label]);
```

Three things to understand about those lines:
- The scope id is keyed on **`useId()`**, not on `fieldId`. `fieldId` is only unique *within a provider*, and
  two providers on one page would collide in a registry that is app-wide.
- It uses **`useOptionalUnsavedChanges`**, the non-throwing variant, so the component still works rendered
  outside the portal layout (tests, one-off renders). `useUnsavedChanges` throws.
- The `label` prop doubles as the modal copy, which is why field labels read naturally in a sentence
  ("You have unsaved changes to the billing address").

Net effect: wiring a view's fields up to `InlineEditField` gives it navigation guarding **for free**. That is
why `35abf9d` could cover four detail views' inline editing with one change, and why `LeadDetailView` needs no
scope of its own for its inline state.

Landed alone by design (commit message: "so history bisects cleanly if a consumer view breaks later"); the five detail views were wired up in the next commit, `b6efc75`. This is the replacement for the old "Pencil icon → modal / separate edit mode" pattern.

#### Exports

| Export | Kind | Location |
|---|---|---|
| `InlineEditFieldProvider` | component | `InlineEditField.tsx:55` |
| `InlineEditField` | component | `:157` |
| `InlineEditFieldType` | type alias | `:109` |
| `InlineEditSelectOption` | interface | `:121` |
| `InlineEditFieldProps` | interface | `:126` |

`ToggleEditor` (`:451`), `LookupEditor` (`:474`) and `renderEditor` (`:369`) are module-private.

#### Provider — `InlineEditFieldProvider`

Props: `{ children: ReactNode }` only. Supplies `InlineEditContextValue` (`:40-51`):

- `editingFieldId: string | null` — the single field currently in edit mode (state, drives re-render).
- `requestEdit(fieldId): boolean` — grant/deny. Returns `true` if the same field is already editing; returns `false` and bumps `shakeNonce` if a *different* field is open **and dirty**; otherwise takes over the slot and returns `true`.
- `releaseEdit(fieldId)` — no-op unless `fieldId` is the current holder; clears both the id and the dirty flag.
- `markDirty(fieldId, dirty)` — writes `dirtyRef` only if `fieldId` holds the slot.
- `shakeNonce: number` — monotonically increasing counter; broadcast "shake whoever is editing".

Implementation detail worth knowing before extending: the provider keeps *two* mirrors of the editing id — `editingFieldId` (state, `:56`) and `editingRef` (`:57`) — plus `dirtyRef` (`:58`). The refs exist so `requestEdit` can make its decision synchronously inside a click handler without a stale-closure read. `useInlineEditContext` (`:97`) throws `'InlineEditField must be used within an <InlineEditFieldProvider>'` if the provider is missing, so every field must be inside one.

Scope rule: single-active-field is enforced *per provider*. Two providers on one page give two independently-editable fields. `fieldId` only needs to be unique within its provider.

#### Field props (`InlineEditFieldProps`, `:126-155`)

| Prop | Type | Required | Notes |
|---|---|---|---|
| `fieldId` | `string` | yes | Unique within the provider. |
| `label` | `string` | yes | Rendered uppercase/muted above the value (`:303-306`). |
| `icon` | `ReactNode` | no | Sits left of the label. |
| `value` | `string` | yes | **Always a string.** date → `YYYY-MM-DD`; select → option value; toggle → `'true'`/`'false'`; lookup → the selected option's id. |
| `displayValue` | `ReactNode` | no | Read-mode override (formatted date, status badge, …). Falls back to `value`, then to an em-dash (`:348`). |
| `type` | `InlineEditFieldType` | yes | See below. |
| `options` | `InlineEditSelectOption[]` | for `select`/`lookup` | `{ value, label }`. |
| `placeholder` | `string` | no | Text inputs and the lookup search box. |
| `canEdit` | `boolean` | yes | `false` ⇒ inert cell: no pointer cursor, no hover border, click handler returns early (`:244`). |
| `onSave` | `(newValue: string) => Promise<void>` | yes | Must apply the optimistic update in the parent and **throw** on failure. |
| `onOpenEdit` | `() => void` | no | Fired once on the transition *into* edit mode — used to refresh lookup options. |
| `className` | `string` | no | Appended to the wrapper card classes. |

#### Field types (`InlineEditFieldType`, `:109-119`) — ten supported

Dispatched in `renderEditor` (`:369-445`):

- **`textarea`** (`:371`) — 3-row `<textarea>`, `resize-none`. Enter inserts a newline here (excluded from the Enter-confirms rule).
- **`select`** (`:384`) — native `<select>` with `appearance-none` plus an absolutely-positioned `ChevronDown` (12px) chevron. Options come from `options`.
- **`toggle`** (`:402` → `ToggleEditor` `:451`) — 48×24 pill with a sliding 20px knob, `aria-pressed={enabled}`, `autoFocus`. Value is the literal string `'true'` / `'false'`. Clicking flips it (which makes the field dirty); it does **not** auto-save.
- **`lookup`** (`:405` → `LookupEditor` `:474`) — searchable list. Details below.
- **default branch** (`:416`) covers **`text`, `number`, `date`, `email`, `tel`, `url`**, mapping to `<input type>` `text | text | date | email | tel | url`. `number` gets `inputMode="decimal"` and its `onChange` strips everything except digits, `.` and `-` (`:433`) — it stays an `<input type="text">`, so no browser spinners and no locale parsing.

**`LookupEditor` specifics** (`:474-542`): a text search box above a `max-h-[160px]` scrolling option list. The search box is seeded with the currently-selected option's label (`:492`) and `onFocus` calls `e.target.select()` so the first keystroke replaces the seed. A one-shot `seededRef` effect (`:496-502`) re-seeds if the selected option arrives after mount (async option loads) but only while the user has not typed. Filtering is a case-insensitive `includes` and is skipped while `search === selected.label` so the full list shows on open (`:504-506`). Empty result renders "No matches". Clicking an option sets the value and the search text but **does not save** — confirmation is still via tick/Enter.

#### Edit lifecycle

1. **Enter edit** — click on the card calls `handleClick` (`:243`): bails if `!canEdit` or already editing, else `requestEdit(fieldId)`.
2. **On becoming active** (`:194-206`) — snapshot `initialValueRef.current = value`, reset `editValue`, fire `onOpenEdit?.()`, then `setTimeout(…, 0)` to focus `inputRef` after the editor mounts. Deliberately keyed on `isEditing` only (with an `eslint-disable-next-line react-hooks/exhaustive-deps` at `:205`) so `onOpenEdit` fires once per open, not on every keystroke.
3. **Dirty tracking** — `isDirty = isEditing && editValue !== initialValueRef.current` (`:183`), pushed to the provider on every change (`:209-213`). There is **no validation layer**: any string the editor produces is considered savable. Only the `number` character filter and the native `date`/`email`/`url` input types constrain input. Required-ness, ranges and formats are the parent's problem inside `onSave`.
4. **Confirm** — `handleConfirm` (`:248`): if not dirty, just `releaseEdit` and stop. Otherwise `setSaving(true)`, `await onSave(editValue)`, then `releaseEdit`.
5. **Optimistic update** — the component itself does *not* mutate parent data. The contract is that `onSave` applies the change to parent state immediately (before/while awaiting the network) and re-throws on failure. All five consumers implement this identically, e.g. `AccountDetailView.tsx:90-108` `saveFields()`: capture `previous`, `setAccount(prev => ({...prev, ...changes}))`, `PATCH`, and on a non-`ok` response or throw, `setAccount(previous)` then `throw err`.
6. **Rollback / error** (`:258-263`) — on a thrown `onSave`: local `editValue` reverts to `initialValueRef.current`, the field exits edit mode, `errorFlash` goes true for 1200 ms (red background + border, faded via a 700 ms `transition-colors`), and a shake animation runs. `finally` clears `saving`.
7. **Revert** — `handleRevert` (`:269`) restores `initialValueRef.current` and exits without calling `onSave`.
8. **External value sync** (`:186-190`) — while *not* editing, `editValue` follows the `value` prop, so a parent refetch is reflected immediately; while editing, the user's draft is protected.

#### Keyboard

`handleKeyDown` (`:274-283`), attached to the input/textarea/select/toggle:
- **Enter** (any type except `textarea`) — `preventDefault`; confirm if dirty, otherwise exit cleanly.
- **Escape** — `preventDefault`; revert and exit.
- **Tab** is not intercepted; native focus movement applies. Note the commit message claims "Tab moves to next field", but there is no Tab handling in the code — moving focus away does not commit; the click-outside path is what commits/blocks.

#### Blocking, shake, and click-outside

- **Click outside while clean** — `releaseEdit`, field closes (`:223`).
- **Click outside while dirty** — stays open and shakes: `controls.start({ x: [0,-8,8,-8,8,0], duration 0.4 })` (`:221`). Listener is `mousedown` on `document`, installed only while editing (`:216-228`).
- **Clicking a different field while the current one is dirty** — the provider denies the request and bumps `shakeNonce`; the dirty field's nonce effect (`:232-241`) fires the same shake. The new field does **not** open.
- The tick/cross buttons and the toggle/lookup buttons all `stopPropagation` on both `onMouseDown` and `onClick` so they are not treated as outside-clicks (`:326-327`, `:335-336`, `:456-457`, `:527-528`).

#### Visual / loading / a11y affordances

- Wrapper is a `motion.div` (framer-motion `useAnimation` controls) — `border rounded-xl px-4 py-3 transition-colors duration-700` (`:301`).
- Background state machine (`:287-291`): error → `bg-error/15 border-error/40`; editing → `bg-success/10 border-success/40`; idle → `bg-surface border-border-subtle`. `cursorClass` adds `cursor-pointer hover:border-csa-accent/40` only when `canEdit && !isEditing` (`:293-294`).
- Confirm/revert buttons only render when dirty (`:323`), 28×28, `title="Confirm (Enter)"` / `title="Revert (Escape)"`. While saving, the tick swaps to a spinning `Loader2` and both buttons are `disabled` with `opacity-40`.
- Read mode is a `<p className="text-sm text-text-primary truncate">` — long values are visually truncated with no tooltip.
- **Accessibility gaps to be aware of when extending:** the wrapper is a plain `div` with an `onClick` — no `role="button"`, no `tabIndex`, no `onKeyDown`, so a field cannot be opened from the keyboard at all. There are no `aria-label`/`aria-labelledby` links between the label text and the input, no `aria-invalid`/`aria-live` on the error flash (the red flash and shake are the only failure signal), and no `aria-busy` while saving. `ToggleEditor` is the only element carrying ARIA (`aria-pressed`). The shake animation is not gated on `prefers-reduced-motion`.

#### Persistence

`InlineEditField` performs **no network I/O**. It calls `onSave` and interprets a thrown error as failure. Each consumer supplies the endpoint:

| View | Endpoint | Handler |
|---|---|---|
| `AccountDetailView.tsx` | `PATCH /api/accounts/{id}` | `saveFields` `:90` |
| `LeadDetailView.tsx` | `PATCH /api/leads/{id}` | `saveFields` `:123` |
| `CouponDetailView.tsx` | `PATCH /api/coupons/{id}` | `saveFields` `:225` |
| `InvoiceDetailView.tsx` | `PATCH /api/invoices/{id}` | `saveFields` `:233` |
| `ResellerManagementView.tsx` | `PATCH /api/resellers/{id}` | `saveFields` `:587` |

`saveFields(apiChanges, localChanges?)` takes an optional second argument so the optimistic local shape can differ from the API payload (e.g. writing a lookup id to the API while storing `{ id, name }` locally). Every save is a single-field `PATCH`; there is no batching or debouncing — each confirmed field is one request.

---

### 11.3 The shell — `src/app/(portal)/layout.tsx` (107 lines), replacing `AppShell`

**`src/components/layout/AppShell.tsx` was deleted** in `fd51770`. Its 234 lines are gone, not moved: the
responsibilities were redistributed, and there is no longer any single component that "is the app".

| `AppShell` did | Now done by |
|---|---|
| Auth gate rendering `<LoginView/>` inline | `middleware.ts` + `/login` as a real route; the layout renders `<BrandSplash/>` while resolving and `router.replace`s to `/login` if there is no user |
| 401 fetch interceptor + session-expired toast | `SessionExpiryWatcher.tsx` + `/login?expired=1` |
| Permission refresh on mount | the layout's own `GET /api/auth` `:39-47` — now load-bearing, since nothing is persisted |
| `VIEW_TITLES` map → header text | `getRouteTitle(pathname)` `:77`, from `routes.ts` |
| `ViewComponent` object literal → component | 24 route segment files |
| 18 `next/dynamic` imports + `ViewLoader` | framework-level per-route code splitting; `loading.tsx` is the boundary |
| `AnimatePresence mode="popLayout"` crossfade | `template.tsx`'s enter-only fade — the crossfade is **not recoverable**, see §11.1 |
| Ctrl/Cmd+K → `SearchModal` | the layout `:55-64`, unchanged in behaviour |

What the layout renders, outside in (`:68-106`): `<UnsavedChangesProvider>` → `div.flex.h-screen` →
`<SessionExpiryWatcher/>` + `<Sidebar/>` + `<main>` → a 64 px header (`h-16 border-b-4`) with
`getRouteTitle(pathname)`, a divider, the "Civil Survey Applications Partner Portal" caption, the Search
button (with its `Ctrl K` `kbd`) and `<NotificationBell/>` → `{children}` → the `AnimatePresence`-wrapped
`SearchModal`.

**`UnsavedChangesProvider` is the outermost wrapper**, so the discard modal it renders sits above everything
including the app's other modals (its own `z-[60]` vs their `z-50`). See §12.

### 11.4 `Sidebar` — `src/components/layout/Sidebar.tsx` (434 lines)

Animated collapsible rail: `motion.aside` width 260 ↔ 72 px `:87-91`, toggled by a circular button pinned at
`-right-3 top-20` `:380-383`. Reads only `{ sidebarOpen, setSidebarOpen, clearMessages }` from the store
`:68` — the navigation state came out.

**Every item is a real link, built from a module-level `PATHS` const** `:47-59`, which is itself built from
`buildPath` at module scope. So a bad view id crashes at import, not on click.

| Entry | Icon | Parent links to | Submenu |
|---|---|---|---|
| Dashboard | `LayoutDashboard` | `/dashboard` `:114` | — |
| Leads | `UserSearch` | `/leads` | Browse Leads → `/leads` `:162`; Create Lead → `/leads/new` `:163` |
| Accounts | `Building2` | `/accounts` | Browse Accounts → `/accounts` `:216`; Create Account → `/accounts/new` `:217` |
| **Orders** | `FilePlus` | `/orders` | Browse Orders → `/orders` `:271`; Order Assistant → `/order-assistant` `:272` |
| Reports | `BarChart3` | `/reports/dashboard` `:284` | Dashboard → `/reports/dashboard` `:308`; AI Assistant → `/reports` `:309` |
| Coupons | `Ticket` | `/coupons` `:319` | — |
| Partners | `Users` | `/partners` | Manage Partners → `/partners` `:350`; Partner Resources → `/partner-resources` `:351` |

- **Active state is derived from the URL**, via a 3-line `inSection(pathname, base)` helper `:62-64` that
  matches `pathname === base || pathname.startsWith(base + '/')`. `isLeadActive` `:71`, `isAccountActive`
  `:72`, `isInvoiceActive` `:73` (`/orders` **or** `/order-assistant`). **This fixes two old defects at
  once**: `create-invoice` used to be in no active-state check at all, and a cold deep link could not light
  up its parent. Now `/accounts/<id>/edit` highlights Accounts on the first paint, because the check is a
  prefix test rather than an id list.
- **Submenus initialise open when their section is active** `:75-81` — `useState(isLeadActive)` and friends,
  so a deep link arrives with the right submenu already expanded. They are plain `useState`, so a user's
  manual collapse survives navigation within the section.
- Each active section renders a `motion.div` accent bar with a distinct `layoutId` (`nav-indicator` `:406`,
  `-lead` `:138`, `-acc` `:191`, `-inv` `:245`, `-reports` `:297`, `-partner` `:339`) so the bar animates
  within a section but not across sections.
- **`handleNavClick(href)`** `:83-85` calls `clearMessages()` when `href !== pathname`. This is why the AI
  chat transcript resets on navigation — though as of `35abf9d` the transcript is also written to
  sessionStorage, so it is offered back rather than lost (§12.3).
- **Items are `GuardedLink`, not `Link`** `:118`, `:172`, `:226`, `:284`, `:326`, `:396`, `:423`. A plain
  left-click asks before discarding unsaved work elsewhere in the app; middle-click, ctrl/cmd-click and "copy
  link address" are deliberately untouched (§12.2).
- **No role-based hiding in the sidebar.** Every nav item renders for every user; access control happens
  inside the views and API routes. The only role-driven UI in the shell is `SearchModal`'s Resellers filter
  pill and `EmailHistory`'s admin gate.
- CRM status block `:364-370` is **still hardcoded** — a green tick and "CRM Connected", with no health check
  behind it.
- The logo `:97` is **still a raw `<img src="/logo.svg">`**, so `@next/next/no-img-element` still fires here.
  `62d7628` converted the loading logo (now `BrandSplash`, which does use `next/image`) and left this one.
- **The drifted local `type ViewId` is gone**, along with the store union it duplicated. `NavItem` `:392` and
  `SubNavItem` `:421` take an `href: string` instead. That maintenance trap is resolved.

### 11.5 `UserMenu` — `src/components/layout/UserMenu.tsx` (456 lines)

Two things in one file: the sidebar-footer account button, and an `AddUserModal`.

- **Menu**: avatar tile + name + role (collapsed hides the text). Opens a popover above the button showing
  `user.name`, `user.email`, a role badge (`userRoleDisplayName || role`) and `resellerName`. Outside-click
  closes it.
- The popover contains exactly **one** action: **Sign Out** `:92-96` — `POST /api/auth/logout` (errors
  swallowed), `setUser(null)`, then `router.replace(LOGIN_PATH)`. The explicit `replace` is new: previously
  clearing the store was enough because `AppShell` re-rendered `<LoginView/>`; now the navigation has to be
  performed, and `replace` rather than `push` so Back cannot re-enter the authenticated tree.
- **`AddUserModal` is still unreachable.** `showAddUser` `:41` is only ever set to `false` (via `onClose`);
  nothing calls `setShowAddUser(true)` and no "Add User" button is rendered. `canManageUsers` `:44` is
  computed and never read. So the entire modal — ~320 lines including the reseller typeahead and role radio
  list — remains dead UI. Note the *reachable* Add User flow lives in `ResellerManagementView` (§10.1.5);
  this is a second, orphaned implementation of the same form.
- For reference, were it reachable: `ALL_ROLES` (`:24-30`) lists viewer/standard/manager/ibm/admin with descriptions; managers may only assign `MANAGER_ROLES = ['standard','manager','viewer']` (`:33`, `:154-156`); reseller reassignment requires admin/ibm, or manager-of-a-Distributor (`:148-159`); the reseller list is loaded from `/api/resellers` with `resellerId`/`includeChildren` narrowing by role (`:162-191`); submit `POST /api/users` with `{ name, email, password, userRoleName, resellerId }` defaulting to `'csa-internal'` (`:208-218`), showing a success message for 1.5 s before closing.

---

### 11.6 Shared components

#### `SearchModal` — `src/components/SearchModal.tsx` (296 lines)
Global Ctrl+K palette, rendered by the portal layout. Props: `{ onClose }`.
- Searches `GET /api/search?q=&modules=`. Minimum 2 characters; **Enter triggers the search** — there is no
  as-you-type debounce.
- Modules: Accounts, Prospects, Leads, Contacts, Invoices (labelled "Order"), Resellers (labelled "Partner").
  Non-admin users lose the Resellers pill, though the module is not stripped from result grouping.
- **Race hardening (`2d4fba4`)**: an `abortRef` `AbortController` aborted before each new search, `signal` on
  the fetch, `.then` bailing on `controller.signal.aborted`, `.catch` ignoring `AbortError`, and an unmount
  effect aborting any in-flight request. Unchanged.
- Changing the module pill re-runs the search if one has already been performed.
- Results are grouped by module in `MODULE_FILTER_ORDER`, capped at 10 rows per group with a "+N more" line.
- **Navigation is now a pure function plus a link.** `resultHref(result)` `:33-48` returns
  `buildPath('account-detail', id)`, `` `${buildPath('lead-detail', id)}?source=lead` ``, the `?source=prospect`
  variant, `buildPath('invoice-detail', id)`, `buildPath('reseller-detail', id)` — or **`null`** in the
  `default` branch. A row with an href renders a `<GuardedLink>` `:258`; a row without one renders a plain
  `<button onClick={onClose}>` `:265`. `handleNavigate` is gone; all the store writes went with it.
- **Contacts results still go nowhere** — they now fall into `resultHref`'s `default: return null`, so the row
  is a button that closes the modal. Same behaviour as the old empty `case 'Contacts'`, expressed more
  legibly, and still a dead end for the user.

#### `NotificationBell` — `src/components/NotificationBell.tsx` (225 lines)
Header bell, rendered by the portal layout. No props.
- `GET /api/notifications` on mount and every 180 000 ms `:55-60`; errors silent.
- Badge shows `unreadCount`, capped at `9+`.
- Dismiss: optimistic list/count update then `POST /api/notifications` with `{ action: 'dismiss', key }`;
  Clear All sends `{ action: 'dismiss-all', keys }`.
- Types `lead | evaluation | invoice` map to `UserSearch`/`Beaker`/`FileText` icons.
- **Same href-or-nothing shape as `SearchModal`.** `notificationHref(n)` `:26-37` handles `Leads` →
  `?source=lead`, `Prospects` → `?source=prospect`, `Invoices` → `/orders/{id}`, and returns `null` otherwise.
  The body is a `<GuardedLink>` when an href exists `:198`. `handleNavigate(n)` `:76-80` now only dismisses and
  closes the panel — *"the link itself does the navigating"*.
- **Evaluation notifications still have no destination.** `type: 'evaluation'` exists and renders its own
  icon, but no `recordModule` case produces an href, so clicking one dismisses it and stays put.
- Relative timestamps via `formatTimeAgo`.

#### `Pagination` — `src/components/Pagination.tsx` (81 lines)
Pure presentational. Props `{ currentPage, totalItems, pageSize, onPageChange }`. Returns `null` when `totalItems <= pageSize` (`:24`). Renders "start–end of total" plus a sliding window (first, current±1, last) with ellipses (`:29-39`) and prev/next chevrons. Used by `CouponsView`, `DraftInvoicesView`, `ResellerManagementView`, `LeadDetailView`, `LeadsView`, `AccountDetailView`, `AccountsView`, and `EmailHistory`.

#### `AssetDetailModal` — `src/components/AssetDetailModal.tsx` (372 lines)
Props `{ assetId, assetData, onClose, onAssetUpdated? }`. Used by `AccountDetailView` and `LeadDetailView`.
- Loads in parallel: `GET /api/assets?id={assetId}` → the Zoho asset (falls back to the passed-in `assetData` on error), and `POST /api/assets` `{ assetId }` → QLM `keyDetails` + `activationError` (`:57-79`). Re-runs when `refreshKey` bumps.
- Renders asset fields (Status badge, Quantity, Start Date, Renewal Date, Upgraded To/From) and a QLM block (Licence Model, Version Activated, Available Seats, Activations, Created, Subscription Expiry, Computer Name, Path for on-premise, Registered To name/email, Created-by affiliate).
- Admin/IBM only (`isEditor`, `:41`): **edit renewal date** via `PATCH /api/assets` with `{ assetId, Renewal_Date }`, auto-adding `Status: 'Active'` if the new date is in the future (`:107-134`); and **Deactivate Licence** via `PUT /api/assets` behind a confirmation dialog (`:136-153`, `:331-357`).
- **Still uses the old pencil-icon inline pattern** for the renewal date (`:204-240`) — it was not migrated to `InlineEditField`.
- Escape closes; backdrop click closes.

#### `CreateEvaluationModal` — `src/components/CreateEvaluationModal.tsx` (257 lines)
Props `{ accountId, accountName, canExtend, onSuccess, onClose }`. Used by `AccountDetailView` and `LeadDetailView`.
- Evaluation SKU is fixed-shape: `{CODE}-SU-CB-EVA-1YR-SUB-WW`, with CSP special-cased to `CSP-26-SU-CB-EVA-1YR-SUB-WW` (`buildEvalSku`, `:32-35`). Note the same **hardcoded `26` version literal** as `SKUBuilder`.
- Selecting a product resolves the SKU through `GET /api/products?sku=` (`:76-103`), showing "Looking up product…" and then the resolved SKU.
- Quantity (min 1, max 99) and end date (default today + 30 days). When `canExtend` is false the date input's `max` is pinned to +30 days and a "Maximum 30 days" hint shows (`:62`, `:216-224`).
- Create → `POST /api/evaluations` `{ accountId, productId, quantity, endDate }`, then `onSuccess(data.id)` (`:105-134`).
- Commit `cc46146` removed a self-cancelling `useCallback(onClose, [onClose])`; the Escape effect now closes over `onClose` directly (`:69-73`). Behaviour unchanged.

#### `EmailHistory` — `src/components/EmailHistory.tsx` (240 lines)
Props `{ module, recordId?, contactIds? }`. Used by `AccountDetailView` (contact-id mode) and `LeadDetailView` (record mode).
- **Admin/IBM only** — returns `null` for everyone else (`:39`, `:69`), and the fetch effect early-returns for non-admins.
- Fetches `GET /api/emails?module=Contacts&recordIds=a,b,c` when `contactIds` is supplied, else `GET /api/emails?module={module}&recordId={id}` (`:48-56`).
- Table of 10 rows/page (`Pagination`): direction icon (sent vs received), subject with an `IMAP` badge when `Source === 'imap'`, from, to (+N), date, open/click tracking badges, paperclip, and an eye button. Row click and eye button both open `EmailDetailModal`.
- `getModalProps` (`:106-112`) rewrites the modal's module/recordId to `Contacts` + `contactIds[0]` in multi-contact mode, because Zoho's `getSpecificEmail` needs a record that owns the message.
- The effect's dep array uses `contactIds?.join(',')` (`:67`) — an expression dep that ESLint flags but which is what makes array-identity changes not refetch.

#### `EmailDetailModal` — `src/components/EmailDetailModal.tsx` (196 lines)
Props `{ module, recordId, messageId, previewSubject?, onClose }`. Rendered only by `EmailHistory`.
- `GET /api/emails?module=&recordId=&messageId=` (`:42`). A permission/`NO_PERMISSION` error is translated into the friendly "synced via IMAP and cannot be viewed from the portal" message (`:44-46`).
- Shows From/To/CC/Date, Sent/Opened/Clicked badges (with first/last timestamps in `title` tooltips), and attachment chips linking to `/api/emails?...&attachmentId=` in a new tab.
- HTML bodies render in an `<iframe srcDoc>` with `sandbox="allow-same-origin"`; plain text renders in a `<pre>` (`:177-189`).
- Dead imports: `ArrowDown`, `Clock` (`:4`).

#### `SKUBuilder` — `src/components/SKUBuilder.tsx` (251 lines)
Props `{ region, onSelect, onCancel }`. Used by `CreateInvoiceView` and `InvoiceDetailView` (line-item product picker).

**How a SKU is assembled.** A four-step modal wizard:
1. **Product** — `CSD`, `CSP`, `STR`, `CEZ` (`PRODUCTS`, `:32-37`).
2. **User Type** — `SU` / `MU`.
3. **Licensing** — depends on user type: `SU → CL | CB`, `MU → CL | OP` (`LICENSING`, `:44-53`).
4. **Model** — `INF` (perpetual) / `SUB` (subscription).

Selecting `CSP` forces `userType='SU'`, `licensing='CB'` and jumps straight to step 4 (`:100-110`); `goBack` from step 4 in CSP mode returns all the way to step 1 (`:159-167`). Region comes from the parent and is mapped through `REGION_MAP` (`AU|NZ → ANZ`, plus `AF/AS/EU/NA/WW` identity), falling back to the raw region string (`:61-63`, `:90`).

Final string, built inline in `selectModel` (`:130-136`):
- CSP: `CSP-{ver}-SU-CB-COM-1YR-{model}-{region}`
- everything else: `{product}-{userType}-{licensing}-COM-1YR-{model}-{region}`

Then `GET /api/products?sku=` and, on a hit, `onSelect({ id, name: Product_Name, sku: Product_Code, unitPrice: Unit_Price })` from the first result; on a miss, an inline "No product found for SKU: …" with a "Try different options" link back (`:138-157`).

**Old findings — re-checked at HEAD:**
- **Stray `fetch('/api/invoices')` on mount: STILL PRESENT.** `:83-88` — a bare mount effect that fires the invoices list endpoint, discards the result via `.catch(() => {})`, and carries the comments `// We'll use a simpler approach` and `// For now we'll hardcode or fetch later`. Untouched by the merge. It is a wasted request on every open of the picker.
- **Unset `version` state falling back to `'26'`: STILL PRESENT.** `version` is declared at `:73` and **never** written — no `setVersion` call exists in the file. Both `ver` sites (`:93`, `:132`) therefore always evaluate to the literal `'26'`. The same literal is duplicated in `CreateEvaluationModal.tsx:33`.
- **Dead `buildSKU()`: STILL PRESENT.** Defined at `:92-98`; a repo-wide grep for `buildSKU` returns only that definition. `selectModel` re-implements the identical logic inline, so the two can silently diverge.

The only change to this file in the merge was `9ab4d7f`, which removed a self-cancelling `useCallback(onCancel, [onCancel])` from the Escape-key effect. **None of the three old findings were fixed.**

---

### 11.7 Invoice sub-components — `src/components/invoice/`

All seven are presentational children of `InvoiceDetailView`, which owns every piece of state and passes handlers down. Only `OrderActions` and `InvoicePayment` fetch on their own.

- **`InvoiceHeader`** (175 lines) — back button, order-number badge, status + type badges, and the action row. `statusColor`/`typeColor` helpers at `:49-63`. Edit / Cancel / Save Changes are wired to parent handlers; the **Approve** and **Send Order** buttons (`:137-148`) render with permission gating (`canApproveInvoices` / `canSendInvoices`, or admin/ibm) but have **no `onClick` — they are inert placeholders**. Non-Draft invoices show a "Locked" pill instead. "Open in CRM" links to a hardcoded Zoho org URL, `https://crm.zoho.com.au/crm/org7002802215/tab/Invoices/{id}` (`:78`).
- **`InvoiceLineItems`** (248 lines) — the line-items table. Edit permissions derive from `editing` + `isRenewal` (`:57-60`): product and quantity are locked on renewals, price and dates are always editable in edit mode. Product cell opens `SKUBuilder` via `onOpenSkuBuilder(index)`. Reseller-pricing hover tooltips back-compute the list price from `resellerPercentage` (`:166-170`, `:207-211`). Add/remove rows only when `canEditProduct`.
- **`InvoiceCoupon`** (85 lines) — renders `null` unless `canApply`. Uppercasing code input + Apply button; Enter submits. All validation state (`couponValidating`, `couponError`, `couponApplied`) is passed in.
- **`InvoicePayment`** (120 lines) — reads Stripe fields off the invoice (`Stripe_Payment_Link`, `Payment_Status`, `Stripe_Total`, `Stripe_Transaction_Fee`, `Grand_Total_with_Stripe_Fee`, `Currency`). Renders `null` when there is no payment info and no refresh in flight. The payment link is **hidden behind a "Locked (Order {status})" label once status is Approved or Sent** (`:59-63`). Own currency-symbol map at `:20`.
- **`InvoicePurchaseOrder`** (142 lines) — PO number with a pencil→save/cancel inline edit (only while Draft) plus a file-upload label accepting `.pdf,.png,.jpg,.jpeg,.xlsx,.xls,.doc,.docx`. **Not migrated to `InlineEditField`.**
- **`InvoiceSendTo`** (88 lines) — two-button Reseller/Customer toggle over `Reseller_Direct_Purchase`, editable only while Draft. Heading reads "Order and Licence Keys will be sent to".
- **`OrderActions`** (394 lines) — the only invoice child with its own logic. Renders nothing unless status is `Draft` or `Sent` **and** at least one of `canPurchaseOnAccount` / `canPurchaseOnCredit` is set.
  - *Pay Later* (credit + `canSend`): `PATCH /api/invoices/{id}` `{ Send_Invoice: true }`.
  - *Pay Now* (credit + `canSend`): re-fetches `GET /api/invoices/{id}` to get the freshest `Stripe_Payment_Link`, `window.open`s it, then starts a 5 s poll of the same endpoint until `Payment_Status` is `paid`/`succeeded`, at which point it clears the interval, shows the "Payment Complete!" popup naming the recipient, and calls `onRefresh()` (`:75-98`, `:126-158`). A `window` `focus` listener restarts polling when the user returns from the payment tab (`:101-115`).
  - *Place Order* (account + `canApprove`): blocks unless both `hasPONumber` and `hasPOFile`, then `PATCH` `{ Status: 'Approved' }` (`:197-236`).
  - Every action goes through a **two-step confirmation** — the first confirm rewrites the dialog to "Are you sure? / This action cannot be undone." before actually running `onConfirm` (`:240-254`).
  - `getRecipientLabel` (`:64-72`) reads the SendTo toggle to name the reseller or contact in the dialog copy.

**Invoices → Orders rename — re-verified at `211834f`.** User-facing copy is consistent:
`src/app/layout.tsx:6` says "orders, licences, and account management"; **route titles** in `routes.ts` use
Order/Orders; `Sidebar` says "Orders", "Browse Orders", "Order Assistant"; `SearchModal` labels the Invoices
module "Order"; `InvoiceHeader` says "Order Number", "Send Order", `Order {id}`;
`InvoiceSendTo`/`InvoicePayment`/`OrderActions` all say order; `ChatMessage.tsx:148` and
`LineItemForm.tsx:51` say "Create Order". **The URLs now say order too** — that is the one layer `fd51770`
added to the "Order" side. What deliberately did **not** change: file and directory names
(`src/components/invoice/`, `Invoice*.tsx`, `InvoiceDetailView`), the `legacyViewId` keys in `routes.ts`
(`invoice`, `invoice-detail`, `invoice-edit`, `create-invoice`, `draft-invoices`), API routes
(`/api/invoices`), and the Zoho module name. The code vocabulary is still "invoice" while the URL and UI
vocabulary is "order"; expect that split to persist. Remaining internal-copy leaks: `POAttachment.tsx:74,126`
still tells the user "attached to invoice"/"Attaching to invoice", `ChatInterface.tsx:125` says "attached to
the invoice", and `DraftInvoicesView.tsx:359` still spins "Loading invoices...".

---

### 11.8 Chat sub-components — `src/components/chat/`

Used by `InvoiceView` ("Order Assistant") and `ReportsView` ("AI Assistant"), both of which render `<ChatInterface />` with their own greeting, placeholder and quick actions.

#### `ChatInterface` (424 lines)
Props `{ initialMessage?, placeholder?, quickActions? }` where a quick action is `{ label, icon: LucideIcon, message }`.
- Messages live in the Zustand store (`messages`, `addMessage`, `updateMessage`, `clearMessages`, `isLoading`), which is why `Sidebar.handleNavClick` can wipe the transcript on navigation.
- Sends `POST /api/chat` `{ messages, user }` and consumes an **SSE stream** (`fetchSSE`, `:138-188`): buffers on `\n\n`, parses `data: ` lines, and handles three event types — `status` (drives the live status caption next to the typing dots), `done` (final content, ends streaming), `error`. Malformed events are skipped silently.
- History sent to the API uses `m.apiContent || m.content` (`:80`), so a short visible label can stand in for a much longer payload.
- **File / PO flow** (`sendFileMessage`, `:198-263`): base64 + mediaType go to `POST /api/parse-file` first; the extracted text is wrapped into a long instruction ("look up the account in CRM, match contacts, identify the products, build the SKU(s), and create the invoice") stored as `apiContent`, while the user sees only `Uploaded: {file} — Processing purchase order...`.
- **Auto-attach** (`autoAttachPendingFile`, `:96-135`): after a `done` event, if the store holds a `pendingPOFile` and the response contains a `/Invoices/{id}` link plus one of "invoice created"/"created"/"success", it `POST`s `/api/attach-file` `{ recordID, fileName, base64, moduleName: 'Invoices' }` and appends a confirmation message. The pending file is cleared either way.
- Cross-component wiring is via **`window` CustomEvents**, not props: it listens for `recivis-send-message` (dispatched by `ChatMessage` option buttons) and `recivis-send-file` (dispatched by `InvoiceView`) (`:266-285`).
- Composer: auto-growing textarea (48→120 px), Enter sends / Shift+Enter newlines, send button, and a "New conversation" reset that clears messages and re-arms the greeting.
- `sendFileMessage`'s `isPdf` parameter is accepted and never used (`:198`); `fetchSSE`'s dep array omits `autoAttachPendingFile` (`:188`).

#### `ChatMessage` (587 lines) — the heaviest file in this section
A hand-rolled markdown renderer plus a set of heuristics that turn assistant prose into interactive UI.

- **`renderMarkdown`** (`:188-344`) handles tables, `##`/`###` headings, `>` blockquotes, `-`/`*` bullets, numbered lists, blank lines and paragraphs. **`renderInline`** (`:346-393`) handles `**bold**`, `[text](url)` (external, with an `ExternalLink` glyph) and `` `code` ``. No italics, no nested lists, no images, no fenced code blocks.
- **Tables** (`renderTable`, `:409-475`): parsed from pipe rows; ≥6 rows gets an "Export to Excel" button that dynamically imports `xlsx` and writes `recivis-export-YYYYMMDD-HHMM.xlsx` (`:395-407`). Tables with a Product column and 1–10 rows are treated as line-item tables and get a per-row trash button that sends `Remove line item {n}` back into the chat.
- **Numbered lists are triaged three ways** (`:268-325`): `parseFieldList` → render a `DataForm`; else `looksLikeOptions` (2–6 items, avg length ≤60, fewer than half look like field labels) → render clickable option buttons; else a plain ordered list.
- **`detectLineItemPrompt`** (`:93-141`) sniffs for quantity + start date + price in the text, regex-extracts defaults (quantity, dates in `DD/MM/YYYY`, currency symbol, price via four fallback patterns), and defaults end date to today + 364 days. On a hit it renders `LineItemForm`.
- **`detectPromptType`** (`:41-90`) inspects the last 300 characters for one of three shapes — `confirm_create`, `yes_no_proceed`, `yes_no` — and `getPromptButtons` (`:144-164`) maps those to a primary/secondary button pair ("Create Order"/"Add Line Item", "Yes, proceed"/"No", "Yes"/"No").
- **`detectInvoiceForAttachment`** (`:12-36`) requires both a `/Invoices/{id}` link and confirmation phrasing, and explicitly refuses to fire on "do you have a PO number?"; on a hit it renders `POAttachment`.
- Rendering (`:477-587`): user messages are right-aligned plain text in a bordered bubble; assistant messages get the markdown pipeline plus, conditionally, `LineItemForm` / prompt buttons / `POAttachment`; both get a localised `en-AU` timestamp. Streaming placeholders (`isStreaming && !content`) render `null` so the typing indicator in `ChatInterface` takes over.
- All interactions funnel through `handleOptionClick`, which dispatches the `recivis-send-message` CustomEvent (`:484-489`).
- `getPromptButtons` can emit `icon: 'edit'` in principle, and the render branch handles `'edit'` → `Pencil` (`:558`), but no current prompt type produces it — dead branch. `addMessage` is destructured at `:478` and never used.
- **This whole layer is string-matching on LLM output.** Any change to the assistant's phrasing silently disables the corresponding form or button. That is the single largest fragility in the chat UI.

#### `DataForm` (211 lines)
`{ fields, onSubmit, disabled? }` where a field is `{ label, cleanLabel, key, defaultValue, placeholder?, type: 'text'|'email'|'country', required }`.
- Renders a right-aligned label column plus inputs; country fields use `CountryInput` (`:45-91`), a prefix-match typeahead over a 190-entry `COUNTRIES` array capped at 8 suggestions, selected on `mousedown` so blur doesn't beat the click.
- Submit joins non-empty values as `"{cleanLabel}: {value}"` lines and hands the block to `onSubmit`, i.e. back into the chat as a user message.
- **`parseFieldList`** (`:158-211`) is the exported heuristic `ChatMessage` uses: it rejects lists that look like line items (≥3 items mentioning start/end date, custom price, quantity), requires ≥50% of items to match a field-name vocabulary and ≥2 items, then per item derives `rawLabel`/`cleanLabel`, infers type from the words "email"/"country", extracts pre-filled values from `(pre-filled: …)`/`(suggested: …)` or a trailing `: Value` starting with a capital, and marks everything required **except** a field mentioning "reseller" (which gets the placeholder "Defaults to Civil Survey Applications if left blank" and a forced-empty default).
- The `required` flag is displayed as a red asterisk but **not enforced** — submit only checks that at least one field is non-empty (`:102`).

#### `LineItemForm` (168 lines)
`{ defaults: { quantity, startDate, endDate, price, currency }, onSubmit, disabled? }`.
- Two-column grid: quantity (min 1), price (free text, labelled with the currency symbol), start and end dates. Dates are held in `DD/MM/YYYY` and converted for the native date input by `toIsoDate`/`toAuDate` (`:156-168`), with the AU-formatted string echoed beneath each input.
- Submit emits `Quantity: …` / `Start date: …` / `End date: …` and either `Custom price: …` (when changed) or `Price: default`, then swaps the form for a two-button follow-up: **Create Order** (sends "Create the invoice") and **Add Line Item** (sends "Add another line item") (`:42-63`).
- The X button dismisses the form permanently for that message and sends "Skip this line item".
- `disabled` is applied to the inputs and the submit button but **not** to the two post-submit buttons (`:46`, `:54`).

#### `POAttachment` (154 lines)
`{ invoiceId, onComplete }`. Drag-and-drop or click-to-browse zone accepting `.pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx`. Reads the file with `FileReader.readAsDataURL`, strips the data-URL prefix, and `POST`s `/api/attach-file` `{ recordID, fileName, base64, moduleName: 'Invoices' }` (`:44-80`). Success collapses to a green "{file} attached" row and calls `onComplete` with a chat message; a "Skip — no document to attach" link calls `onComplete('No PO document attached.')`. `handleDrop`/`handleFileSelect` list `[invoiceId]` as their `useCallback` dep but close over `uploadFile`, which is redefined each render — harmless here, but an eslint warning.

---

### 11.9 Styling system

- **Tailwind CSS v4** (`tailwindcss: ^4`, `@tailwindcss/postcss: ^4`). No `tailwind.config.*` file — configuration lives entirely in CSS.
- `src/app/globals.css` is 169 lines: `@import` of the Encode Sans Semi Condensed webfont from Google Fonts (`:1`, a render-blocking external request rather than `next/font`), `@import "tailwindcss"` (`:2`), then a single `@theme inline` block (`:4-37`) defining the design tokens.
- **Tokens** — brand: `csa-primary #0A4C6E`, `csa-accent #0077B7`, `csa-purple #5B52B7`, `csa-highlight #B1E0F1`, `csa-dark #042637`, `csa-deep #021A26`; greys `csa-grey-100..400`; semantic `surface #06293B`, `surface-raised #0A3A52`, `surface-overlay #0D4968`, `border #1A5A7A`, `border-subtle #0E3E58`, `text-primary #F0F7FA`, `text-secondary #8BB8CF`, `text-muted #5A8EA8`, `success #22C55E`, `warning #F59E0B`, `error #EF4444`. These are what every `bg-surface`, `text-text-muted`, `border-border-subtle` class in this section resolves to.
- Global rules: pointer cursor on all interactive selectors (`:44-47`), body font/background/antialiasing, custom 6px scrollbars, `::selection` in accent blue, and a 2px accent `:focus-visible` outline (`:80-83`).
- Keyframes/utilities: `fade-in`, `slide-in-left`, `slide-in-right`, `pulse-border`, `shimmer` + `.shimmer`, and `bounce-dot` + `.typing-dot` (used by the chat typing indicator). `pulse-border` is defined but unused. Bare-element `table`/`th`/`td`/`tr:hover` styling at `:142-163` is what makes the tables in `EmailHistory`, `InvoiceLineItems` and `ChatMessage` look consistent without per-cell classes. `.border-sharp` (`:166-169`) is defined and unused.
- **Dark-only.** Colours are hardcoded dark; there is no `prefers-color-scheme` handling, no theme toggle, no light variant.
- Motion is Framer Motion 12 throughout (`AnimatePresence`, `layoutId` shared-element accent bars, `useAnimation` for the inline-edit shake). Icons are `lucide-react`.

---

### 11.10 Incomplete / dead at HEAD (this section only)

| Item | Location | Note |
|---|---|---|
| `AddUserModal` unreachable | `UserMenu.tsx:38, 56-62` | `setShowAddUser(true)` is never called; ~320 lines of dead UI. `canManageUsers` (`:41`) computed, never read. |
| Approve / Send Order buttons inert | `InvoiceHeader.tsx:137-148` | Rendered and permission-gated but have no `onClick`. |
| Stray discarded fetch | `SKUBuilder.tsx:83-88` | `fetch('/api/invoices')` on mount, result thrown away; comments admit it is a placeholder. |
| `version` never set → literal `'26'` | `SKUBuilder.tsx:73, 93, 132` | No `setVersion` anywhere. Same magic `26` duplicated at `CreateEvaluationModal.tsx:33`. |
| Dead `buildSKU()` | `SKUBuilder.tsx:92-98` | Zero callers; `selectModel` duplicates the logic inline. |
| Contacts search result goes nowhere | `SearchModal.tsx:33-48` | `resultHref` returns `null` in its `default` branch; the row becomes a button that only closes the modal. Same dead end, new mechanism. |
| Evaluation notifications don't navigate | `NotificationBell.tsx:26-37` | `type: 'evaluation'` exists but no `recordModule` case produces an href. |
| Hardcoded "CRM Connected" | `Sidebar.tsx:364-370` | No health check behind the green tick. |
| **`useBeforeUnload` has zero callers** | `src/lib/useBeforeUnload.ts:18` | New at `35abf9d`. The whole 30-line module is unimported, so **refresh and tab-close do not warn about unsaved work anywhere**. See §12.4. |
| Hardcoded Zoho org id in CRM links | `InvoiceHeader.tsx:78`, `AccountDetailView.tsx:522`, `CouponDetailView.tsx:324`, `LeadDetailView.tsx:437-438`, `ResellerManagementView.tsx:714`, plus twice in the AI system prompt (`ai-tools.ts:184`, `:212`) | `org7002802215` written out **seven** times. `constants.CRM_BASE_URL` (`constants.ts:22`) exists for exactly this and still has zero callers (§2.11). |
| Unused imports | `NotificationBell.tsx:5` (`Trash2`, `ExternalLink`), `EmailDetailModal.tsx:4` (`ArrowDown`, `Clock`), `LeadsView.tsx:6-7` (`AnimatePresence`, `MapPin`, `User`, `Beaker`), `CreateLeadView.tsx:28` (`ExternalLink`) | |
| Unused props/vars | `ChatInterface.tsx` (`isPdf`), `ChatMessage.tsx:478` (`addMessage`), `ChatMessage.tsx:558` (`'edit'` icon branch unreachable), `LeadDetailView.tsx:1387` (`InfoCard`'s `badge?` prop) | |
| Unused CSS | `globals.css` `pulse-border` keyframes, `.border-sharp` | |
| `<img>` not migrated | `Sidebar.tsx:97` | Still a raw `<img src="/logo.svg">`. `BrandSplash` (which replaced the old loading logo) does use `next/image`. |
| Not migrated to `InlineEditField` | `AssetDetailModal.tsx:204-240` (renewal date), `InvoicePurchaseOrder.tsx:81-102` (PO number) | Both still use the pencil→save/cancel pattern the component was meant to replace. Neither is covered by the unsaved-work guard as a result — see §12.6. |
| "invoice" wording leaking into UI copy | `POAttachment.tsx:74,126`, `ChatInterface.tsx:125`, `DraftInvoicesView.tsx:359` | Missed by the Orders rename. |
| `required` not enforced | `DataForm.tsx:102, 117` | Asterisk is decorative; submit only needs one non-empty field. |
| Chat UI depends on LLM phrasing | `ChatMessage.tsx:12-164` | All forms/buttons are triggered by substring matches on assistant output. |
| No `error.tsx` / `not-found.tsx` | `src/app/**` | Every route falls back to Next's defaults; the `getRouteTitle` `'Partner Portal'` fallback is unreachable in practice. |
| *Resolved since the last revision* | — | The drifted duplicate `ViewId` in `Sidebar.tsx` is gone with the store union. `LeadsView`'s dead `setSelectedAccountId` destructure is gone. `LeadDetailView`'s unused `X` import is now used by the edit form's Cancel button. |


---

## 12. Unsaved Work: Drafts, Guards, and What Back Still Loses

**New section, added 2026-08-12.** The whole system landed in `35abf9d`, and the five edit routes in
`d9c4efb` / `211834f` are its largest consumers. Read this before writing any form in this app.

### 12.1 Why it exists, and the constraint that shaped it

The routing migration made browser Back functional, which **removed an accidental safety net**: Back used to
exit the app entirely, so nobody pressed it mid-form. Now they will.

The App Router gives no way to stop them. `router.events` / `routeChangeStart` do not exist; `beforeunload`
covers only hard exits; and **Back cannot be cancelled at all** — `popstate` fires *after* the history entry
has already changed. The sentinel-history workaround (pushing a dummy entry so `popstate` has something to
consume) was considered and **rejected on purpose**: it corrupts the history stack, breaks Forward, and
misbehaves with trackpad and mobile back gestures.

So protection is split in two, and which half a surface gets is a deliberate choice:

| | Mechanism | Survives browser Back? | Used by |
|---|---|---|---|
| **Persist** | `useDraft` → localStorage, 24 h TTL | **Yes** | the four create views |
| **Guard** | `UnsavedChangesProvider` + `useGuardedRouter` / `GuardedLink` → a modal | **No** — it can only ask before *in-app* navigation | the five detail views, every inline edit, the six partner modals |

The rule of thumb from the commit: *work that must survive Back is **persisted**; work that only needs a
second chance is **guarded**.*

### 12.2 The guard — `UnsavedChangesProvider` (`src/components/UnsavedChangesProvider.tsx`, 258 lines)

Mounted once, as the outermost element of the portal layout (`(portal)/layout.tsx:69`), so its modal sits
above every other modal in the app.

**The context API** (`:40-57`) is three functions:

| Member | Signature | Notes |
|---|---|---|
| `registerDirty` | `(scopeId: string, isDirty: boolean, label?: string) => void` | Declare whether a scope holds unsaved work. Pass `false` to clear — on unmount **and** after a successful save. `label` is the modal copy ("You have unsaved changes to *the billing address*"). **Stable across renders**, so it is safe in an effect dependency array. |
| `isAnythingDirty` | `() => boolean` | Reads a ref; does not re-render. |
| `confirmDiscard` | `() => Promise<boolean>` | Resolves `true` to proceed (discard), `false` to stay. **Resolves `true` immediately when nothing is dirty**, so callers never need to check first. |

Two hooks read it: **`useUnsavedChanges()`** `:66`, which **throws** if no provider is mounted (deliberate —
a silent no-op would mean dirty tracking quietly does nothing), and **`useOptionalUnsavedChanges()`** `:79`,
which returns `null` instead, for shared primitives that must work in isolation. `InlineEditField` uses the
optional variant; everything else uses the throwing one.

**Implementation notes that matter if you extend it:**
- The registry is a **`useRef(new Map<string, string | undefined>())`** `:88`, not state. Dirty flips must
  not re-render the whole portal shell, and `registerDirty` must keep a stable identity.
- The open prompt is split: `promptLabels` state drives the render, while the promise resolver lives in a ref
  `:92-93` so `confirmDiscard` stays stable.
- **A second `confirmDiscard` while a prompt is open supersedes the first**, and the superseded caller
  resolves `false` `:109` — it stays put rather than navigating unexpectedly.
- **Capture-phase click backstop** `:125-165`. Belt and braces for raw `<a href>` internal navigations that
  never went through `GuardedLink`. It runs before React's bubble-phase handlers, so cancelling here also
  cancels `next/link` (whose `onClick` early-returns when the event is already `defaultPrevented`).
  Deliberately exempt: non-primary buttons and any modifier key `:132`, `target` other than `_self`,
  `download`, cross-origin URLs (a hard exit — `beforeunload`'s job), same-document hash changes, and
  anything already tagged `data-guarded-link="true"` `:140` so a `GuardedLink` never double-prompts.
- **Escape keeps the work** `:168-178`, same as "Keep editing".
- The modal `:195-258` is the app's own, never `window.confirm` — the comment gives the reasons: unstylable,
  untestable, and it reads as a browser error. `z-[60]`, `role="alertdialog"`, `autoFocus` on **"Keep
  editing"** (the safe choice), and a **"Discard changes"** button styled with `bg-error/20`. With one dirty
  scope it names it; with several it says "in N places" and lists them.

**`useGuardedRouter`** (`src/lib/useGuardedRouter.ts`, 50 lines) is a drop-in for `next/navigation`'s
`useRouter` — swapping the import is the whole migration. `push`, `replace`, `back` and `forward` await
`confirmDiscard()` and no-op if the user stays; `refresh` and `prefetch` pass straight through because
neither leaves the view. Note `back`/`forward` guard only **programmatic** history moves; the browser's own
Back button is unreachable (§12.5).

**`GuardedLink`** (`src/components/GuardedLink.tsx`, 67 lines) takes exactly `next/link`'s props. It respects
the caller's own `onClick` and its `preventDefault` first `:35-36`, then bails when nothing is dirty. On a
plain left-click with unsaved work it prevents the default, asks, and navigates only on confirm — resolving
the absolute `href` *before* the async gap `:47`, since React may pool the event and the element could
unmount. Deliberately **not** guarded, because they leave the current work untouched: middle-click,
ctrl/cmd-click, shift-click, alt-click, "copy link address" and any other context-menu action,
`target="_blank"`, and `download` links.

### 12.3 The persistence — `useDraft` (`src/lib/useDraft.ts`, 196 lines)

This is the layer that actually solves browser Back.

```ts
const { pendingDraft, pendingDraftSavedAt, restore, discard, clear } = useDraft(key, value, opts?);
```

- Storage key is `` `recivis:draft:${key}` `` (`DRAFT_KEY_PREFIX` `:50`). Envelope is
  `{ v: 1, savedAt, value }` `:56-60`, so a future format change is detectable.
- **TTL 24 h** by default `:52`; an expired draft is deleted on read.
- **Debounced 500 ms** writes `:53`, `:159-166`.
- **Read once in a lazy initialiser, not an effect** `:143-145` — localStorage is synchronous, so there is
  nothing to wait for.
- Every localStorage access is wrapped in `try/catch` and degrades to a silent no-op. Private browsing,
  exhausted quota and disabled storage must never throw into a form someone is filling in.

**Two rules the hook enforces, both worth understanding before you use it:**

1. **HARD RULE: never persist secrets or file bodies** (`:9-15`). No passwords, tokens, API keys or base64
   file/image bodies in `value`. localStorage is plain text, readable by any script on the origin, **survives
   logout**, and is not covered by the session lifetime. Base64 bodies also blow the ~5 MB quota and fail the
   write silently. Strip those fields before handing the object over. This is why `pendingPOFile` is never
   drafted and why `ResellerManagementView` guards its password fields but drafts nothing.
2. **No silent rehydration** (`:16-22`). A found draft is never applied to your form for you; it comes back
   as `pendingDraft` so you render `<DraftRestoreBar>` and the user chooses. The reasoning: *a stale
   half-finished order that quietly reappears will get submitted by accident — that is worse than losing
   it.* Writes are also **suspended while a pending draft is unresolved** `:160`, so a pristine empty form
   cannot overwrite the draft the user is still deciding about.

**The `isDirty ? draft : EMPTY_*` idiom.** Every consumer passes a sentinel constant while the form is
pristine, so an untouched form never reaches localStorage. `baseline` `:149` is the serialised value the hook
saw at mount; writes only happen once `value` differs from it. `restore()` makes the restored value the new
baseline `:171` so it is not immediately rewritten; `clear()` makes whatever was just submitted the baseline
`:186` so a successful submit does not re-persist itself.

**`DraftRestoreBar`** (`src/components/DraftRestoreBar.tsx`, 93 lines) — amber `role="status"` banner reading
"You have an {label} from {relative time}." with **Restore** and **Discard**. `relativeTime` `:24-36` gives
"moments ago" / "14 minutes ago" / "3 hours ago" / "2 days ago", and a 30 s ticker forces a re-render so it
does not go stale while being read.

**Who persists what:**

| Surface | Draft key | `isDirty` test | Line |
|---|---|---|---|
| `CreateAccountView` | `accounts:new` | explicit OR across fields, excluding the auto-selected reseller | `:199-205` |
| `CreateLeadView` | `leads:new` | whole-object compare against `EMPTY_LEAD_DRAFT` | `:183-186` |
| `CreateCouponView` | `coupons:new` | whole-object compare | `:147` |
| `CreateInvoiceView` | `orders:new:{accountId\|none}` | line items present, or either date changed — **excludes currency**, which the reseller fetch overwrites | `:98`, `:111-113` |

The invoice key is scoped per account on purpose: two half-built orders for different accounts must not
overwrite each other.

**The chat transcript is the one exception, and it is sessionStorage.** `ChatInterface.tsx` persists the
conversation under `recivis:session:chat` rather than using `useDraft`, because the hook is localStorage-only.
It follows the same rules — no silent rehydration (the user gets a `DraftRestoreBar`), every access
`try/catch`'d. The scope choice is the point: a transcript can contain a customer's purchase-order contents,
so it must not outlive the tab or reach disk; but it is also 5–30 minutes of work and Back cannot be
intercepted. Session scope is the narrow middle — it survives in-app Back, route changes and a reload in the
same tab, then dies with the tab. `store.ts:14-22` records the reversal and its reasoning so it does not get
"fixed" back. The staged PO file (`pendingPOFile`) is never persisted; only the parsed text the assistant was
given (`apiContent`) is kept.

### 12.4 `useBeforeUnload` — shipped, and not wired up

`src/lib/useBeforeUnload.ts` (30 lines) implements the hard-exit warning: an effect that adds a
`beforeunload` listener while `isDirty`, calling `preventDefault()` and setting `returnValue = ''` (the
modern signal plus the legacy one). It does not try to set a custom message — browsers ignore it.

**It has zero callers.** `35abf9d` lists it as delivered infrastructure ("`useBeforeUnload` — refresh and tab
close") and the module is correct, but nothing imports it, so **refresh, tab close, typing a new URL and
following an external link do not warn about unsaved work anywhere in the app.** The provider's
capture-phase backstop explicitly treats cross-origin links as "a hard exit — `beforeunload` covers those"
(`UnsavedChangesProvider.tsx:151`), which is true of the design and not of the deployed code.

Wiring it up is one line per surface: `useBeforeUnload(isDirty)` in each create view, or once in
`UnsavedChangesProvider` driven off `dirtyScopes.current.size > 0` — though the latter needs a state mirror,
since the registry is a ref precisely to avoid re-rendering.

### 12.5 The accepted limitation — state it when someone asks

**Browser Back on a guarded surface still loses that batch edit.** A line-item set in
`InvoiceDetailView`, an address block in `AccountDetailView`, a half-filled permission matrix. The bound is
"a couple of minutes of re-entry", and the trade was made explicitly: blocking it would mean shipping the
history hack.

> *"If it proves painful the honest fix is to persist those surfaces too, not to fight the router."*
> — `35abf9d`

`InvoiceDetailView` is where this bites hardest, because its four scopes are all batch edits (§9.2).

### 12.6 Coverage map — which surfaces are protected, and which are not

| Surface | Protection | Scope id(s) |
|---|---|---|
| `CreateAccountView` | draft **+** guard | `create-account` |
| `CreateLeadView` | draft **+** guard | `create-lead` |
| `CreateCouponView` | draft **+** guard | `create-coupon` |
| `CreateInvoiceView` | draft **+** guard | `create-invoice` |
| `ChatInterface` | sessionStorage + restore bar | — (no registry scope) |
| `AccountDetailView` | guard | `account-detail:address`, `:new-contact`, `:edit` |
| `LeadDetailView` | guard | `lead-detail:edit` |
| `InvoiceDetailView` | guard | `invoice-detail:line-items`, `:purchase-order`, `:coupon`, `:edit` |
| `CouponDetailView` | guard | `coupon-detail:edit` |
| `ResellerManagementView` | guard | `reseller-edit`, `reseller-add-user`, `reseller-edit-user`, `reseller-reset-password`, `reseller-register`, `reseller-permissions` |
| Every `InlineEditField` | guard, automatic | `inline-edit:{useId()}` |
| **`AssetDetailModal`'s renewal-date edit** | **none** | — |
| **`InvoicePurchaseOrder`'s pencil edit** | **none** | — |
| **`UserMenu`'s `AddUserModal`** | none (unreachable anyway) | — |

The two genuine gaps are the two surfaces §11.10 already flags as "not migrated to `InlineEditField`". They
kept the old pencil→save/cancel pattern, and because the guard rides on `InlineEditField`, they are the only
reachable edit affordances in the app with no dirty tracking at all. Migrating them fixes both problems at
once.

### 12.7 Conventions to follow when adding a surface

1. **Choose persist or guard deliberately.** A create form that a user might spend minutes on → persist. An
   in-place edit of an existing record → guard.
2. **Dirty means *changed*, not *open*.** Snapshot after populating, compare against the snapshot. Every one
   of the five detail views does this with a `pristine` ref set on the render *after* the populate effect
   lands. A guard that prompts on every Cancel gets ignored.
3. **Clear the scope before navigating on save**, not after. `registerDirty(scope, false)` then
   `router.push(...)`, or the guard prompts about work it just wrote.
4. **Clear on unmount too.** A scope stranded dirty blocks *all* later navigation — worse than no guard.
5. **Never pass a password, token or base64 body to `useDraft`.**
6. **Use `useGuardedRouter` and `GuardedLink`** in any view that can hold input. The capture-phase backstop
   exists for the cases you forget, not as the intended path.
7. **Labels are sentence fragments.** `registerDirty(SCOPE, dirty, 'the billing address')` reads as "You have
   unsaved changes to the billing address."

### 12.8 Provenance caveat

`35abf9d`'s own message records that **the two agents implementing the persist and guard slices were killed
mid-run by a spend limit and filed no reports**, so their work was verified by inspection and by build rather
than by their own account. Orphaned scaffolding they left behind — a duplicate `EMPTY_PARTNER`, an unused
`SCOPE_CREATE_PARTNER`, an unused import — was removed. Nothing in this section has been exercised at runtime
by a human: there are no tests (§13), and the verification on record is `npm run build`, `npm test` 33/33 and
`npm run lint` at baseline. Treat the behaviour described here as *what the code says it does*.


---

## 13. Test Coverage and Development History

### Test Coverage

**Runner and configuration.** Vitest `4.1.0` (declared `^4.1.0` in `devDependencies`), invoked as `npm test` → `vitest run`; `npm run test:watch` → `vitest`. `vitest.config.ts` is 14 lines and declares only three things: `environment: 'node'`, `globals: true`, and a resolve alias mapping `@` → `./src`. There is no `include`/`exclude` override (so Vitest's default glob picks up `src/__tests__/*.test.ts`), no `setupFiles`, no coverage provider, and no coverage thresholds. Unchanged since the first revision of this document.

**The last five commits added zero tests.** Verified, not assumed:

```
$ git log --stat 7865247..HEAD -- 'src/__tests__/*' 'vitest.config.ts'
(no output)
```

Not one line of `src/__tests__/` or `vitest.config.ts` has been touched by the routing migration, the
unsaved-work system, or any of the five edit routes. Combined with the earlier finding that the 17 merged
April commits also added none, **the three test files predate `0f84c28` and have not changed since**.

**Actual suite result, run 2026-08-12 against `211834f`:**

```
> recivis@0.1.0 test
> vitest run

 RUN  v4.1.0 C:/Users/JoshuaBoak/Desktop/Claude Master/Projects/Partner Portal

 Test Files  3 passed (3)
      Tests  33 passed (33)
   Start at  09:29:01
   Duration  595ms (transform 182ms, setup 0ms, import 417ms, tests 30ms, environment 1ms)
```

**33/33 green.** The count has not moved since April.

**Lint, run in the same session:** `✖ 89 problems (33 errors, 56 warnings)`. That is exactly the baseline
`211834f`'s commit message records, and the debt predates all of this work — `fd51770` notes the
pre-existing baseline was **39 errors / 64 warnings** and that its own changes *reduced* it. The trajectory
across the five commits, from their verification blocks: 39/64 → 33/57 → 33/57 → 33/56. Nothing was added.
The one error worth knowing by name is `react-hooks/set-state-in-effect` at
`ResellerManagementView.tsx:262` (§10.1.1); the rest are largely `@typescript-eslint/no-explicit-any` on
Zoho return shapes and `react-hooks/exhaustive-deps` warnings.

**There is still no `typecheck` script** — `tsc --noEmit` is only reachable via `next build`. Both
`d9c4efb` and `211834f` record running it manually.

**What each file asserts.**

- `src/__tests__/cache.test.ts` (23 lines, 3 tests) — exercises `cacheGet`/`cacheSet`/`cacheDel` from `@/lib/cache` with no `REDIS_URL` set, asserting the graceful-degradation path only: `cacheGet` returns `null`, `cacheSet` and `cacheDel` resolve to `undefined` without throwing. There is no test of a *working* Redis path — serialization, TTL, key namespacing, and cache invalidation are entirely unexercised.
- `src/__tests__/constants.test.ts` (66 lines, 8 tests) — shape assertions over `@/lib/constants`: `CSA_INTERNAL_ID === 'csa-internal'`, `CSA_ZOHO_ID` matches `/^\d+$/`, `CRM_BASE_URL` contains `org` and `zoho.com.au`, `REGION_LABELS` has all seven region keys (AU/EU/NA/AS/NZ/WW/AF), `CURRENCIES` contains AUD/USD/EUR and has length ≥ 4, `PARTNER_CATEGORIES` contains Reseller/Distributor, `MAX_ZOHO_PAGES` is within 5–50, `ITEMS_PER_PAGE.{accounts,invoices,contacts}` are > 0, and `CHAT_MESSAGE_LIMIT === 25`. These are tautologies over literals — they detect an accidental deletion, not a logic defect. Note two of the constants they assert on (`CRM_BASE_URL`, `ITEMS_PER_PAGE`) have **zero callers in the app** (§2.11), so those tests guard code nothing uses.
- `src/__tests__/validation.test.ts` (191 lines, 22 tests) — the only file testing real behaviour. Drives `validateBody` against `createUserSchema` (6), `resetPasswordSchema` (3), `createContactSchema` (4), `createAccountSchema` (2), `updateInvoiceSchema` (4), `updateUserSchema` (3). Covers both accept and reject paths, including one error-message assertion (short password → error contains `'8 characters'`). **Two of the six schemas it tests have no callers anywhere** — `createAccountSchema` and `updateInvoiceSchema` (§2.9).

**The coverage gap, in numbers, recomputed at `211834f`.** `src/` holds **133** `.ts`/`.tsx` files totalling
**28,141 lines** (up from 97 / 24,788). The tests import exactly **three** source modules —
`src/lib/cache.ts` (75 lines), `src/lib/constants.ts` (88), `src/lib/validation.ts` (70) — **233 lines
total**. That is:

| Measure | Then (`7865247`) | Now (`211834f`) |
|---|---|---|
| Files imported by a test | 3 of 97 — 3.1% | **3 of 133 — 2.3%** |
| Lines in imported files | 233 of 24,788 — 0.94% | **233 of 28,141 — 0.83%** |

The ratio got worse because 3,353 lines were added and none were tested. True statement coverage is lower
still, since `cache.ts`'s Redis-connected branches are never entered.

Confirmed absent by enumeration, not assumption:

- **No API route tests.** 33 `route.ts` files under `src/app/api/` — zero appear in any test file. Nothing constructs a `Request`, exercises a handler, or asserts a status code.
- **No component tests.** **47** `.tsx` files under `src/components/` — zero imported. There is no `environment: 'jsdom'`, no `@testing-library/*` setup, and no `setupFiles`; the config physically cannot render a component as written, despite `@testing-library/react` and `jest-dom` being installed (§1.2).
- **No route-level tests.** The 24 route segment files, `middleware.ts` and `routes.ts` are all untested. `routes.ts` is the one new module that is *trivially* testable — pure functions, no I/O, no DOM: `matchRoute`, `getRouteTitle`, `getRouteId` and `buildPath` (including its two `throw` paths) would take about 30 lines and would be the highest-value test in the repo, because every navigation in the app goes through them.
- **No integration tests.** Nothing touches Zoho (MCP or REST/Deluge), PostgreSQL, Stripe, or QLM. No mocks, no fixtures, no MSW, no test containers. The only external dependency acknowledged anywhere is Redis, and only via its *absence*.
- **17 of 20** `src/lib/` modules are untested, including `db.ts`, `api-auth.ts`, `types.ts`, `export-lists.ts`, and all four modules added since April — `routes.ts`, `useDraft.ts`, `useGuardedRouter.ts`, `useBeforeUnload.ts`.

**The `Currency` assertion — now accidentally correct.** `validation.test.ts` asserts:

```ts
it('accepts currency update', () => {
  const result = validateBody(updateInvoiceSchema, {
    Currency: 'USD',
  });
  expect(result.success).toBe(true);
});
```

The previous revision of this document called this test "simultaneously passing and wrong-headed", because
`dab7c76` had removed `Currency` from the invoice PATCH allow-list while the schema and its test still
declared it updatable. **`211834f` restored the allow-list entry** (§9.8), so the assertion now agrees with
the route's behaviour.

**Nothing about the test changed.** It went from contradicting the implementation to matching it without
anyone touching it, because it was never coupled to the implementation in the first place:
`updateInvoiceSchema` (`src/lib/validation.ts:48-55`) has **no importers outside the test file** — grepping
`src/` returns one definition plus six hits in `validation.test.ts`. The invoice PATCH route validates
nothing through Zod; it hand-rolls `if (body.X)` checks.

That is the finding worth carrying forward: this suite contains an assertion that was wrong for four months,
stayed green throughout, and is now right by coincidence. It is a worked example of what 0.83% coverage
buys. Two related artefacts sit alongside it — the schema is **missing** `Status` and `Send_Invoice`, which
the route does accept, so wiring `validateBody` into the route as-is would silently break both; and the
route's docstring at `src/app/api/invoices/[id]/route.ts:5` reads *"Supports dates, currency, PO number,
direct…"*, which is once again accurate.

**Highest-risk untested areas**, reweighted for what the last five commits rewrote — none of which has a
single test:

1. **The routing layer** (`fd51770`) — `routes.ts`, `middleware.ts`, 24 route segments, and the `?source=` /
   `?notice=` / `?next=` / `?expired=` query contracts. `routes.ts` is pure and trivially testable and is not
   tested; `buildPath` **throws** on a bad view id, so an untested nav target is a crash rather than a
   degradation. `middleware.ts` gates every portal URL and its `/` special case is the only thing keeping the
   emailed password-reset link working — nothing pins that.
2. **The unsaved-work system** (`35abf9d`, §12) — a dirty registry, a promise-based modal, a capture-phase
   click interceptor, and localStorage persistence with a TTL. Its own commit records that the implementing
   agents died mid-run and filed no reports, so it was verified by inspection. `useDraft` in particular is
   testable in `environment: 'node'` with a `localStorage` stub, and `useBeforeUnload`'s zero-caller state
   (§12.4) is exactly the kind of thing one test would have caught.
3. **The five edit forms** (`d9c4efb`, `211834f`) — each diffs a form against a snapshot, gates fields on
   permissions, and PATCHes production Zoho with no sandbox. `ResellerManagementView`'s `saveReseller` does
   not check `res.ok`, which is a defect a single test would have surfaced.
4. **The self-aborting-fetch fix** (`211834f`) — the correctness argument is entirely about React hook
   identity and dep arrays, was validated by reasoning rather than execution, and the bug it fixed was
   invisible except in production 499 logs. This is precisely the class of defect a test reproduces and
   clicking does not.
5. **Inline per-field editing across 5 detail views** (`757552f` + `b6efc75`) — still the largest single
   behavioural surface, still zero component tests, and still the top churn files in the repo.
6. **RBAC across all 33 API routes** — 5 user roles × 4 reseller caps × per-reseller overrides.
   `src/lib/api-auth.ts` is untested. And as of `24b19d7` we know two of those gates had been **failing
   open** for months because of a wrong Zoho path variable (§4, §5) — a route test would have caught it
   instantly, and no amount of code review did.
7. **The Zoho MCP transport** (`zoho.ts`) — `parseMcpResult`'s empty-result floor is indistinguishable from a
   genuine empty result, nothing checks the tool-level `isError` flag, and the SSE branch runs before the
   `res.ok` check. Three separate ways for a failure to present as "no data", all untested.
8. **The production JWT fallback refusal** (`1c8e9f0`) — an authentication kill-switch gated on an
   environment variable, with no test pinning either branch.
9. **`src/lib/db.ts`** — PostgreSQL access for auth, RBAC and audit log, untested.

### Development History

**Project start and size.** First commit **2026-03-16**. Total **227** commits on `master`.

**Contributors.**

```
$ git shortlog -sn HEAD
   210  Joshua Boak     <joshua.boak@civilsurveysolutions.com.au>
    17  Jaycob Horvat   <jaycob.horvat@civilsurveysolutions.com.au>
```

Joshua Boak 210 (92.5%), Jaycob Horvat 17 (7.5%). The split is chronological rather than by subsystem: Joshua
authored every commit through `0f84c28` **and** the five most recent; Jaycob authored *exactly* the 17
commits merged in the April fast-forward. No overlap. The five 2026-08 commits carry
`Co-Authored-By: Claude Opus 5 (1M context)` trailers; the March ones carry `Claude Opus 4.6`.

**Commit cadence — the repo woke up.**

```
$ git log --format=%ad --date=short | sort | uniq -c
     14  2026-03-16
     34  2026-03-17
     17  2026-03-18
     77  2026-03-19   ← peak
     15  2026-03-20
     19  2026-03-22
     18  2026-03-23
      6  2026-03-24
      5  2026-03-25
     16  2026-04-19
      1  2026-04-25
      2  2026-08-11   ← new
      3  2026-08-12   ← new
```

**205 of 227 commits (90.3%) still landed in the 10-day window 2026-03-16 → 2026-03-25**, peaking at **77
commits on 2026-03-19** — 33.9% of the project's entire history in a single day. 2026-03-21 is a gap. After
2026-03-25 the repo went quiet for 25 days, produced 16 commits on 2026-04-19 and one on 2026-04-25, then went
quiet again for **3½ months** — and woke up on 2026-08-11 with five commits over two days that between them
replaced the navigation model, added an unsaved-work subsystem and gave every record an edit route.

**The recency statement in every previous revision of this document is now wrong and should not be repeated.**
It read "the code is ~3.5 months old; the deployment is newer than the work". That was true at `7865247`,
where the 2026-08-11 deploys were redeploys of April code. It is not true now: `24b19d7`, `fd51770`,
`35abf9d`, `d9c4efb` and `211834f` are new work authored on 2026-08-11 and 2026-08-12, and the live deployment
is that work. The **dormant-repo framing is void.**

**The five 2026-08 commits, in order.** These are unusually well documented — each message explains the
reasoning, the options rejected and the verification performed. Read them before changing anything they
touched; they are a better guide than this document to *why*.

| Commit | Date | What it did |
|---|---|---|
| `24b19d7` | 08-11 | Renamed the Zoho MCP path variable `recordID` → `recordId` at 7 `getRecord` call sites, and fixed three wrong path variables plus a wrong relation name on the evaluations route's `getRelatedRecords`. Every record detail view had been rendering "not found" while the API looked healthy; `maxEvaluationsPerAccount` had never been enforced. §3, §4, §5, §7. |
| `fd51770` | 08-11 | Replaced SPA view-switching with real App Router routing: 19 route segments plus `/login`, `routes.ts`, `middleware.ts`, the `(portal)` shell, `template.tsx`, `loading.tsx`, `BrandSplash`, `SessionExpiryWatcher`. Deleted `AppShell.tsx` and `src/app/page.tsx`, removed Zustand `persist`, restored server rendering, migrated all 65 navigation triggers. §11, §1.10, §2.5. |
| `35abf9d` | 08-12 | Unsaved-work protection now that Back works: `UnsavedChangesProvider`, `useGuardedRouter`, `GuardedLink`, `useBeforeUnload`, `useDraft`, `DraftRestoreBar`; drafts on the four create views, guards on the detail views, chat transcript in sessionStorage. §12. |
| `d9c4efb` | 08-12 | Made coupon full-form editing a real route (`/coupons/[id]/edit`) as the reference pattern, and stopped the coupon save clobbering `Remaining_Uses`. §9.6, §6. |
| `211834f` | 08-12 | Edit routes for accounts, leads, orders and partners; retired the legacy partner edit modal; restored `Currency` to the invoice PATCH allow-list; fixed the self-aborting fetch cycle in `LeadsView` / `AccountsView`. §8, §9, §10, §6. |

Two behavioural themes run through all five, and they are worth naming because they are now house style:

1. **Never drop an edit silently.** It drove the `Currency` reversal (accept-and-drop was judged worse than
   either accepting or rejecting), the `clearedDate` block on the order form, and the decision to render
   non-writable fields read-only rather than as inputs.
2. **Prefer persisting work over blocking the user.** It drove the whole persist/guard split, and the explicit
   refusal to ship the sentinel-history hack that would have let Back be cancelled.

**What the merged 17 commits did, as a themed group.** All 17 are Jaycob's, 16 dated 2026-04-19 and 1 dated 2026-04-25. They resolve as five themes:

- *Agent-posture and documentation* (4) — `4394d52` adopted the Orchestrator agent-controlled posture and scaffolded the `recivis` `CLAUDE.md`; `88a684f` documented the codebase review + carry-over handoff; `29af1b1` landed the post-consolidation continued-development plan; `7865247` (the 2026-04-25 outlier) added agent scratch markers to `.gitignore`. Four of seventeen commits are about how agents work on the repo, not about the product.
- *Feature work* (4) — `757552f` added the `InlineEditField` click-to-edit component; `b6efc75` migrated five detail views to inline per-field editing; `2d4fba4` hardened list/search fetches against racing paste-driven requests; `dab7c76` finished the Invoices → Orders visual rename and locked `Currency` on PATCH.
- *Security hardening* (1) — `1c8e9f0` refused the dev JWT fallback when `NODE_ENV` is production.
- *Lint and code-quality janitorial* (7) — `6c0f8f0`, `7568f9f`, `1e1352d` renamed shadowing module locals (chat RBAC filter, emails route, attach-file route); `dce38c4` moved `eslint-disable` directives onto the `any[]` parameter line; `62d7628` migrated the loading-logo `img` to `next/image`; `cc46146` and `9ab4d7f` dropped no-op `useCallback` wrappers.
- *Configuration* (1) — `83f5017` checked in an `.env.example` for the 11 required/optional env vars.

The group reads as a single consolidation session: absorb a review backlog, land four real behavioural changes, then sweep lint debt. Notably, `dab7c76`'s message records a verification block (`npm run build` PASS, `npm test` 33/33 PASS, `npm run lint` 39 errors / 64 warnings "equal to the…" baseline) — the lint debt was measured and knowingly left non-zero.

**Churn hotspots** (last 40 commits, by touch count, re-measured at `211834f`):

```
9  src/components/views/ResellerManagementView.tsx
8  src/components/views/InvoiceDetailView.tsx
8  src/components/views/AccountDetailView.tsx
6  src/components/views/LeadDetailView.tsx
6  src/components/views/CouponDetailView.tsx
6  src/app/api/evaluations/route.ts
4  src/components/views/CreateInvoiceView.tsx
4  src/components/SearchModal.tsx
3  src/lib/routes.ts
3  src/components/views/LeadsView.tsx
3  src/components/views/DraftInvoicesView.tsx
3  src/components/views/CreateCouponView.tsx
3  src/components/views/AccountsView.tsx
3  src/components/layout/Sidebar.tsx
3  src/components/layout/AppShell.tsx      ← now deleted
3  src/app/api/resellers/[id]/route.ts
```

**The five detail views are now the top five component files by churn**, up from four of the top five. Each has
been rewritten twice in four months — once by `b6efc75` (inline editing) and once by
`d9c4efb`/`211834f`/`35abf9d` (edit routes plus dirty scopes) — and **all five still have zero test
coverage**. That intersection, highest change rate meeting zero coverage, remains the single sharpest risk
signal in this section, and it got sharper rather than softer.

`src/lib/routes.ts` entering the hotspot list after three days of existence is worth noting for a different
reason: it is touched by every commit that adds a route, which is exactly the profile of a file that should
have tests.

**Branch topology — `origin/development` is now behind.**

```
$ git rev-parse HEAD master origin/master origin/development
211834f4de493eb2e591c98f8aeb15c9e9ccb40d   HEAD
211834f4de493eb2e591c98f8aeb15c9e9ccb40d   master
211834f4de493eb2e591c98f8aeb15c9e9ccb40d   origin/master
786524778ceff4006545d49f58b3d3664bd2357f   origin/development
```

```
$ git status -sb
## master...origin/master
?? current-state.md
```

`master` and `origin/master` are aligned at `211834f`, so the work **is** pushed and **is** deployed —
`git status` shows no ahead/behind marker. But `origin/development` still sits at `7865247`, **5 commits
behind**, which inverts the situation the previous revision described. Per `CLAUDE.md:70-74` `development` is
the agent working branch; anyone branching from it today would branch from pre-routing code and produce a
merge conflict across most of `src/`. **Fast-forwarding `origin/development` to `master` is an outstanding
housekeeping item** — and it is a push, so it is the user's call.

Working tree is clean apart from one untracked file, `current-state.md` (this document), which remains
deliberately untracked.

**Recency, stated honestly.** The last authored commit is `211834f`, dated **2026-08-12** — today. The
repository is **not** dormant; it is mid-stream in a burst of structural work. But the age profile is now
bimodal and worth holding separately:

- **90% of the codebase is five months old** (2026-03-16 → 2026-03-25) and has not been touched since, apart
  from having its navigation swapped underneath it.
- **The scaffolding it now runs on is two days old** and, apart from login, has not been used by anyone.

That combination is the honest risk statement: mature-but-unreviewed business logic sitting on brand-new,
unexercised infrastructure, with a 3-file / 33-test suite (0.83% of 28,141 lines) as the entire regression
safety net, against a system of record that has **no sandbox** — per `CLAUDE.md`, local dev reads and writes
production CRM data.

**What has and has not been exercised at runtime, precisely:**

| | Status |
|---|---|
| Login, session rehydrate, the 401 interceptor | **Confirmed working in production** since the routing migration |
| The 24 route segments, deep links, Back/Forward | Build-verified (45/45 static pages, all five edit routes in the manifest); not systematically clicked |
| The five edit forms | `tsc --noEmit` + `next build` + inspection only |
| The unsaved-work system (§12) | `tsc --noEmit` + `next build` + inspection only, and its implementing agents filed no reports |
| The self-aborting-fetch fix | Modelled against React hook semantics; not observed in production logs post-fix |
| `recordId` fixes | **Verified against the live MCP endpoint** at the time of the change |
| Coupon `Remaining_Uses` behaviour | **Verified against live data** (6 coupons) |


---

## 14. Live Railway Deployment State

Read directly from the Railway API on **2026-08-12** via the Railway MCP server. This is the deployed reality, which is not identical to what the repo config implies.

### Identifiers

| Thing | Value |
|---|---|
| Workspace | `joshuaboak's Projects` (personal) — `3c75a59e-ce2b-44d9-8fbb-dc344a54d5fc` |
| Project | `reasonable-celebration` — `65db1b94-7ee7-4e89-b9f5-5d3e5b278fe9` |
| Created | 2026-03-16 |
| Environments | `production` only — `887404b6-94a1-4e19-a59d-7bba151b17ae` |
| Railway account | `joshuaboak` / joshua.boak@civilsurveysolutions.com.au |

The project name is Railway's auto-generated one; nothing in the dashboard says "Partner Portal" or "recivis" at project level.

### Services

| Service | ID | Latest deployment | Status |
|---|---|---|---|
| `recivis` (the app) | `7f76841a-c48c-44c7-a88e-c4938ed00bef` | **2026-08-11 23:27:58 UTC → 23:29:05** | **SUCCESS** |
| `Postgres` | `ec01bfc2-5e5e-4957-800a-494647f56b70` | 2026-08-11 03:42:13 UTC | SUCCESS |
| `Redis` | `54dd44dc-5f86-4c9d-b68d-43d537613d1a` | 2026-08-11 03:42:17 UTC | SUCCESS |
| `postgres` (lowercase) | `5138de20-1365-4f73-b0c8-c1fc28b420d3` | **none — never deployed** | — |

**HEAD is live.** The active `recivis` deployment is commit **`211834f`**, branch `master`, built in
**67 seconds** and reported SUCCESS. That is 2026-08-12 09:29 AEST — i.e. the edit-routes commit reached
production within three minutes of being authored. There is no approval gate.

**The app service deployed six times in 20 hours on 2026-08-11–12**, one per push to `master`, each superseding
the last (`REMOVED` status on the previous):

| Deployment created (UTC) | Commit | Status now |
|---|---|---|
| 2026-08-11 03:42:27 | `0f84c28` | REMOVED |
| 2026-08-11 04:19:00 | `7865247` | REMOVED |
| 2026-08-11 04:53:27 | `24b19d7` | REMOVED |
| 2026-08-11 05:33:19 | `fd51770` | REMOVED |
| 2026-08-11 23:00:43 | `d9c4efb` | REMOVED |
| **2026-08-11 23:27:58** | **`211834f`** | **SUCCESS — live** |

Note `35abf9d` (the unsaved-work system) has **no deployment of its own**: `d9c4efb` landed close enough behind
it that Railway's build picked up the later commit. So the guard system reached production as part of the
coupon-route deploy.

**The "redeploys, not new work" characterisation in the previous revision no longer applies.** Every deployment
from `24b19d7` onward carries new code.

**The lowercase `postgres` service is still an empty duplicate with no deployment history.** `DATABASE_URL`
should be confirmed to point at the capitalised `Postgres` before anyone assumes the other one is live. Still a
candidate for deletion once confirmed unused.

`Postgres` and `Redis` have not been redeployed since 2026-08-11 03:42 and do not need to be — only the app
service tracks `master`.

### `recivis` service configuration

| Setting | Value |
|---|---|
| Source | GitHub repo `Joshuaboak/recivis`, branch `master` |
| Check suites | disabled (deploys don't wait on CI — and there is no CI) |
| Builder | **`RAILPACK`** |
| Runtime | V2, legacy stacker off, IPv6 egress off |
| Region / replicas | `us-east4-eqdc4a`, 1 replica |
| Service domain | `recivis-production.up.railway.app` (id `92a4e87f-88ec-42ff-9324-fa84b0c635be`, `targetPort` null) |
| Custom domains | none |

**Builder mismatch.** The repo contains both a `Dockerfile` and a `railway.toml`, but the service is configured for the RAILPACK builder. Whatever those two files declare (build command, start command, healthcheck, restart policy) is not necessarily governing the running deployment. Anyone changing build behaviour must first establish which path is actually in effect — changing the `Dockerfile` may have no effect at all.

**Single region, single replica, no healthcheck reported.** There is no redundancy and no automated recovery beyond Railway's default restart.

### Environment variables on `recivis`

Names only (values are secrets and were not retrieved):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection |
| `REDIS_URL` | Redis connection |
| `JWT_SECRET` | session/token signing |
| `ZOHO_API_KEY` | Zoho auth |
| `ZOHO_MCP_URL` | Zoho MCP endpoint the app calls |
| `OPENROUTER_API_KEY` | AI provider (OpenRouter) |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Gmail API service account |
| `GMAIL_SENDER` | outbound from-address |
| `GMAIL_BCC` | blind-copy address on outbound mail |
| `NEXT_PUBLIC_APP_URL` | public base URL, client-exposed |

**No Stripe variable exists.** This confirms from the deployment side what §6 finds in the code: the portal never calls Stripe directly. Payment links are minted Zoho-side and the portal only reads and polls them. Any plan to add a Stripe webhook starts from zero — no key, no endpoint, no secret.

**No email provider key beyond Google.** Outbound mail is entirely Gmail-via-service-account; there is no SendGrid/SES/Postmark fallback.

### Gaps between repo and deployment

| Repo says | Deployment says | Action needed |
|---|---|---|
| `Dockerfile` + `railway.toml` present | Builder is RAILPACK | Determine the effective build path before editing either |
| Recent commits implement Stripe "Pay Now" | No Stripe env var | Confirmed: Stripe is reached only through Zoho |
| Docs cite `recivis-production.up.railway.app` | Matches | — |
| One Postgres expected | Two Postgres services, one empty | Verify `DATABASE_URL` target, then remove the unused service |
| No CI in repo | Check suites disabled | Consistent; every push to `master` deploys unguarded |
| `master` is production; `development` is the agent branch (`CLAUDE.md:70-74`) | The service tracks `master` | `origin/development` is **5 commits behind** `master` (§13). Anyone working on `development` today branches from pre-routing code |
| 3 test files / 33 tests | No test gate on deploy | **A push to `master` reaches production in ~70 seconds with nothing between it and users** — no CI, no check suites, no approval, no staging environment. `211834f` was live three minutes after being authored |

### Operational access from a Claude session

The Railway CLI on this machine (v4.31.0, npm-installed at `~/AppData/Roaming/npm/railway`) **cannot authenticate** — it fails with `Cannot login in non-interactive mode` in every shell tried, including the user's own PowerShell, because the npm `.cmd` shim gives the Rust binary no TTY. Platform operations in this session therefore go through the **Railway MCP server** (`https://mcp.railway.com`), authenticated via `/mcp`.

MCP covers: project/service/environment discovery, deployment status and history, logs, metrics, variables, domains, service config, redeploys, feature flags, docs search. It does **not** cover `railway up` from a local directory, `railway run`, SSH into a service, or the database analysis scripts — those need a working CLI.

To fix the CLI later, either set `RAILWAY_API_TOKEN` (account token from `railway.com/account/tokens`) as a user environment variable, or replace the npm install with a native binary (`npm uninstall -g @railway/cli` then `winget install Railway.Railway`).


---

*Revised **2026-08-12** against HEAD `211834f`, after `24b19d7`, `fd51770`, `35abf9d`, `d9c4efb` and
`211834f`. Sections 0, 2, 8, 9, 10, 11 and 13 re-analysed from source; §1 gained §1.10 and had its staleness
table re-checked; §14 re-read from the Railway API. **§12 (Unsaved Work) is new**, which renumbered the
previous §12 → §13 and §13 → §14. Sections 3, 4, 5, 6 and 7 are preserved as written with dated update notes
appended where these five commits touched them.*

*Verified in this session, not carried forward: `npm test` → 3 files / 33 tests, all passing.
`npm run lint` → 89 problems (33 errors, 56 warnings). `src/` → 133 files / 28,141 lines. Railway service
`recivis` → SUCCESS on `211834f`, builder RAILPACK, 10 environment variables, no Stripe key.*
