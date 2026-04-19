# ReCivis codebase review — 2026-04-19

> Read-only audit produced under the Orchestrator directive
> `codebase-review.md`. No source files were modified by this review; the
> 16-file carry-over working tree is unchanged. Intended as a resumption
> snapshot for the next contributor (agent or human).

---

## 1. Snapshot

| Field | Value |
|---|---|
| Date | 2026-04-19 |
| Repository | `Joshuaboak/recivis` |
| Branch | `development` |
| Last commit | `4394d52` — "Adopted the Orchestrator agent-controlled posture and scaffolded the recivis CLAUDE.md" |
| Last commit date | 2026-04-19 |
| Previous substantive commit | `0f84c28` — "Pay Now: fetch latest Stripe link + poll for payment completion" (2026-03-25) |
| Total commits | 206 (single author: Joshua Boak) |
| First commit | 2026-03-16 |
| Working-tree state | **14 modified tracked files + 1 untracked** (`src/components/InlineEditField.tsx`) — 15 carry-over files total |
| Working-tree deltas | +620 / -533 across all carry-over |

### Untracked
- `src/components/InlineEditField.tsx` (new)

### Modified (staged/unstaged)
- `src/app/api/invoices/[id]/route.ts`
- `src/app/layout.tsx`
- `src/components/SearchModal.tsx`
- `src/components/chat/ChatMessage.tsx`
- `src/components/chat/LineItemForm.tsx`
- `src/components/views/AccountDetailView.tsx`
- `src/components/views/AccountsView.tsx`
- `src/components/views/CouponDetailView.tsx`
- `src/components/views/CreateInvoiceView.tsx`
- `src/components/views/DraftInvoicesView.tsx`
- `src/components/views/InvoiceDetailView.tsx`
- `src/components/views/LeadDetailView.tsx`
- `src/components/views/LeadsView.tsx`
- `src/components/views/ReportsView.tsx`
- `src/components/views/ResellerManagementView.tsx`

> The directive quoted "16 carry-over files" but the actual count is 15
> (14 modified + 1 untracked). The prior agent-state table also listed 15.
> Treat 15 as authoritative.

---

## 2. Architecture overview

### Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.1.6 (App Router, Turbopack) |
| Runtime | Node.js 20 (per Dockerfile) |
| UI | React 19.2.3, Tailwind CSS 4, Framer Motion 12, lucide-react icons |
| Language | TypeScript 5 (strict mode on, `@/*` → `./src/*`) |
| Data store | PostgreSQL via `pg` pool |
| Cache | Redis via `ioredis` — optional, app falls back cleanly if missing |
| Client state | Zustand 5 (single store in `src/lib/store.ts`, `user` persisted to `localStorage`) |
| Auth | bcryptjs (12 rounds) + jsonwebtoken, HTTP-only cookies |
| Zoho CRM | JSON-RPC over MCP endpoint + REST (Deluge functions) for advanced ops |
| AI | OpenRouter (used by `/api/chat` + `/api/parse-file`) |
| Spreadsheet parsing | xlsx 0.18.5 (see §5 — known no-fix vulns) |
| File/email | googleapis 171 (Gmail BCC + service-account integration) |
| Payments | Stripe — referenced via Zoho-stored fields (`Stripe_Payment_Link`, `Stripe_Transaction_Fee`). No direct Stripe SDK dependency |
| Tests | Vitest 4 (Node environment) |

### Directory layout (`src/`)

```
src/
├── __tests__/              (3 suites: cache, constants, validation)
├── app/
│   ├── globals.css
│   ├── layout.tsx          (root layout — title, metadata, fonts)
│   ├── page.tsx             (top-level page, renders AppShell)
│   └── api/                 (33 route.ts files — enumerated below)
├── components/
│   ├── AssetDetailModal.tsx
│   ├── CreateEvaluationModal.tsx
│   ├── EmailDetailModal.tsx
│   ├── EmailHistory.tsx
│   ├── InlineEditField.tsx  (NEW, carry-over)
│   ├── NotificationBell.tsx
│   ├── Pagination.tsx
│   ├── SKUBuilder.tsx
│   ├── SearchModal.tsx
│   ├── chat/                (ChatInterface, ChatMessage, DataForm, LineItemForm, POAttachment)
│   ├── invoice/             (InvoiceHeader, InvoiceLineItems, InvoiceSendTo, InvoiceCoupon,
│   │                         InvoicePayment, InvoicePurchaseOrder, OrderActions)
│   ├── layout/              (AppShell, Sidebar, UserMenu)
│   └── views/               (19 view components — Dashboard, Leads[List/Detail/Create],
│                             Accounts[List/Detail/Create], Invoice/Create/Draft/Detail,
│                             Coupons[List/Detail/Create], Reports[List/Dashboard],
│                             ResellerManagement, PartnerResources, Login)
└── lib/
    ├── ai-tools.ts          (tool definitions + system prompt for the AI chat)
    ├── api-auth.ts          (requireAuth / isAdmin helpers used by route handlers)
    ├── api-response.ts
    ├── auth.ts              (user CRUD, JWT, password reset)
    ├── cache.ts             (Redis get/set, graceful fallback)
    ├── constants.ts
    ├── db.ts                (pg Pool + idempotent schema init)
    ├── env.ts               (required-var fail-loud helpers)
    ├── export-account.ts
    ├── export-lists.ts
    ├── logger.ts
    ├── store.ts             (Zustand app state)
    ├── types.ts             (shared interfaces)
    ├── validation.ts
    ├── zoho-mcp-auth.ts
    └── zoho.ts              (MCP JSON-RPC client + tool dispatcher)
```

### API routes (33)

Grouped by module. All are dynamic (server-rendered on demand; none are
statically pre-rendered). All go through `requireAuth` / `isAdmin` gates
in `src/lib/api-auth.ts`.

| Module | Endpoints |
|---|---|
| Auth | `auth`, `auth/logout`, `auth/forgot-password`, `auth/reset-password` |
| Accounts | `accounts`, `accounts/[id]` |
| Leads | `leads`, `leads/[id]` |
| Invoices | `invoices`, `invoices/[id]` |
| Coupons | `coupons`, `coupons/[id]`, `coupons/validate` |
| Resellers | `resellers`, `resellers/[id]` |
| Users | `users`, `users/[id]` |
| Assets | `assets`, `evaluations`, `renewals` |
| Chat / AI | `chat`, `parse-file`, `attach-file`, `contacts`, `products`, `currencies` |
| Reports | `reports`, `search`, `emails`, `send-keys`, `notifications` |
| Misc | `logs`, `setup` |

### RBAC — 3-tier permission model

Defined in `src/lib/db.ts` (schema) and `src/lib/auth.ts` (effective
evaluation):

1. **Reseller roles** (org-level permission caps) — controls what a
   reseller org is allowed to do. 4-tier: internal / distributor /
   reseller / restricted (runtime tier names; see Zoho sync).
2. **User roles** (per-user within org) — 5-tier: admin / ibm / manager /
   standard / viewer.
3. **Per-reseller overrides** — `resellers.perm_*` columns (NULL =
   inherit from reseller_role default, otherwise explicit boolean
   override).

**Effective permission = `user_role AND reseller_role`** (overridden by
`resellers.perm_*` when non-NULL). System admins (`admin` / `ibm`
user_roles) bypass the intersection.

The full permission set tracked across all three tiers:
`can_create_invoices`, `can_approve_invoices`, `can_send_invoices`,
`can_view_all_records`, `can_view_child_records`, `can_modify_prices`,
`can_upload_po`, `can_view_reports`, `can_export_data`,
`can_create_evaluations`, `max_evaluations_per_account`,
`can_extend_evaluations`, `can_manage_users`, `pay_on_card`.

### Zoho CRM integration — dual path

- **MCP** (`src/lib/zoho.ts`) — JSON-RPC 2.0 over HTTP with optional SSE.
  Preauthorized endpoint URL (MCP URL embeds the API key). One module-
  level session per server process. Used for the bulk of CRUD
  operations via `executeZohoTool('search_records', …)` etc. Notably
  handles camelCase MCP tool names (`ZohoCRM_searchRecords`, not
  `ZohoCRM_Search_Records`).
- **REST API via Deluge functions** — used for advanced operations that
  aren't easily expressed through MCP: lead conversion, renewal
  generation, coupon writes, password-reset emails. Auth via
  `ZOHO_API_KEY` passed as a query parameter to
  `https://www.zohoapis.com.au/crm/v7/functions/...` endpoints.

All Zoho endpoints target **`.com.au`** (never `.com`) — this is enforced
by convention, not a central constant.

### Client state (Zustand)

`src/lib/store.ts` exposes a single `useAppStore` hook. Keys:

- `user` (persisted to localStorage)
- `messages` (AI chat, capped at `CHAT_MESSAGE_LIMIT`)
- `sidebarOpen`
- `currentView` + selected record IDs for each view
  (`selectedAccountId`, `selectedLeadId`, `selectedInvoiceId`,
  `selectedCouponId`, `selectedResellerId`)

Everything except `user` resets on page refresh — intentional, so stale
IDs don't survive.

---

## 3. Environment + deploy

### Required env vars (grep'd from `src/**/*.ts`)

| Variable | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | `src/lib/db.ts`, `src/lib/auth.ts` | PostgreSQL. **Must use public hostname for local dev** — Railway-internal hostname only resolves inside Railway. |
| `ZOHO_MCP_URL` | `src/lib/zoho-mcp-auth.ts` | MCP endpoint (key rotates periodically). |
| `ZOHO_API_KEY` | `src/lib/env.ts` | Zoho `zapikey` query param for REST Deluge functions. Hard-fails if missing. |
| `JWT_SECRET` | `src/lib/auth.ts`, `src/lib/env.ts` | Falls back to `'recivis-dev-secret-change-in-production'` (⚠ see §7). |
| `REDIS_URL` | `src/lib/cache.ts` | Optional. Missing → cache layer returns nulls silently. |
| `OPENROUTER_API_KEY` | `src/app/api/chat/route.ts`, `src/app/api/parse-file/route.ts` | OpenRouter for LLM calls. |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Gmail send flows | Service-account JSON (base64-encoded or raw). |
| `GMAIL_SENDER` | Gmail send flows | Primary sender address. |
| `GMAIL_BCC` | Gmail send flows | Audit BCC address. |
| `NEXT_PUBLIC_APP_URL` | Link generation | Public base URL for emailed links. |
| `NODE_ENV` | `src/lib/db.ts` | Gates `ssl: { rejectUnauthorized: false }` against non-local PG. |

No `.env.example` is checked in (just `.env.local`, correctly gitignored).
A freshly-cloned repo will fail at startup without a populated
`.env.local` — `src/lib/env.ts::getZohoApiKey()` throws if
`ZOHO_API_KEY` is missing.

### Deployment

- **Host:** Railway
- **Build:** `Dockerfile` multi-stage (deps → builder → runner), runs
  `npm ci && npm run build`, produces `.next/standalone` output.
- **Runtime:** `node server.js` in a minimal Alpine image as
  non-root user `nextjs` (UID 1001). `output: "standalone"` is set in
  `next.config.ts`.
- **Railway config:** `railway.toml` — `Dockerfile` builder, health
  check on `/` (30s timeout), restart `ON_FAILURE` × 3.
- **Trigger:** Auto-deploy on push to `master`.
- **Production URL:** `https://recivis-production.up.railway.app`

### Dev-vs-prod data posture — ⚠ CRITICAL

**There is no Zoho CRM sandbox.** Local development reads from and
writes to the production CSA Zoho CRM instance. The PostgreSQL DB is
shared with production too (Railway-hosted; local dev uses the public
hostname). Treat all local test actions as production actions. Feedback
memory `feedback_recivis_testing_safety.md` records this explicitly.

---

## 4. Build + test results

All commands run from repo root on `development`, 2026-04-19.

### `npm install`
```
up to date, audited 490 packages in 7s
164 packages are looking for funding
6 vulnerabilities (1 moderate, 5 high)
```
No lockfile or `package.json` changes after install (verified with
`git status`).

### `npm run build` — **PASS**
```
▲ Next.js 16.1.6 (Turbopack)
✓ Compiled successfully in 15.7s
✓ Generating static pages using 23 workers (31/31) in 518.4ms
```
31 pages: 2 static (`/`, `/_not-found`) + 29 dynamic
server-rendered (all under `/api`). No build warnings.

### `npm test` — **PASS**
```
Test Files  3 passed (3)
Tests       33 passed (33)
Duration    4.20s
```
Test suites: `cache.test.ts`, `constants.test.ts`,
`validation.test.ts`. Coverage is concentrated in `lib/` — there are no
component/view tests and no integration tests against the API routes.

### `npm run lint` — **FAIL (39 errors, 64 warnings)**

This is **pre-existing** — the lint gate has never been clean on this
branch. Headline issues:

- **`@next/next/no-assign-module-variable` (3 errors)**: `module = …`
  assignments inside `src/app/api/attach-file/route.ts`,
  `src/app/api/chat/route.ts`, `src/app/api/emails/route.ts`. Collides
  with Node's reserved `module` identifier — Next.js flags as a
  correctness bug.
- **`react-hooks/set-state-in-effect` (multiple errors)**: Several
  components call `setState` directly inside `useEffect` bodies
  (`AssetDetailModal.tsx:81`, `ResellerManagementView.tsx:161`, others).
  This causes cascading renders and is an upgrade artifact from the
  React 19 rule set.
- **`react-hooks/use-memo` (1 error)**:
  `CreateEvaluationModal.tsx:69` — `useCallback(onClose, …)` used with a
  bare identifier, rule wants an inline function expression.
- **`@typescript-eslint/no-explicit-any` (several errors)**:
  `src/lib/export-lists.ts` (2), `ResellerManagementView.tsx` (2+).
  Existing `eslint-disable-next-line` comments have gone stale and now
  trigger **`unused eslint-disable directive`** warnings (rule has
  tightened since they were written).
- **`@typescript-eslint/no-unused-vars` (~20 warnings)**: Many API
  route handlers destructure `user` from `requireAuth(request)` but
  don't use it. Cheap to clean up.
- **`@next/next/no-img-element` (1 warning)**: `src/app/page.tsx:10`
  uses `<img>` — should migrate to `next/image`.

Two of the lint errors are introduced by carry-over files
(`ResellerManagementView.tsx:161` set-state-in-effect — the
`setCurrentPage(1)` on filter change in the new ResellerManagement
pagination refactor; and the `<InlineEditField>` usage may surface a
hooks warning — **this is not a regression**, the error existed
pre-carry-over and the carry-over did not fix it).

### Summary table

| Gate | Result |
|---|---|
| `npm install` | Clean install, lockfile unchanged, 6 vulns in the tree |
| `npm run build` | ✅ Pass |
| `npm test` | ✅ 33/33 |
| `npm run lint` | ❌ 39 errors, 64 warnings (pre-existing) |
| `npm audit` | ⚠ 6 vulns (1 moderate, 5 high) — see §5 |

---

## 5. Dependency health (`npm audit`)

**6 vulnerabilities in the resolved tree: 1 moderate, 5 high.**

| Package | Severity | Advisory | Fix |
|---|---|---|---|
| `next` 16.1.6 | **high** | 6 advisories: request smuggling in rewrites (GHSA-ggv3-7p47-pfv8), image cache exhaustion (GHSA-3x4c-7xq6-9pq8), postponed resume DoS (GHSA-h27x-g6w4-24gq), null-origin CSRF bypass in Server Actions (GHSA-mq59-m269-xvcx), null-origin CSRF in dev HMR WS (GHSA-jcc7-9wpm-mj36), Server Components DoS (GHSA-q4gf-8mx6-v5v3) | `npm audit fix --force` installs 16.2.4 — minor bump, review needed |
| `xlsx` 0.18.5 | **high** | Prototype pollution (GHSA-4r6h-8v6p-xvw6), ReDoS (GHSA-5pgg-2g8v-p4x9) | **No fix available** — SheetJS has no patched release. Upstream has moved to CDN-only distribution. Needs manual mitigation or replacement. |
| `vite` 8.0.0–8.0.4 (transitive via `vitest`) | **high** | Path traversal in optimized deps `.map` handling (GHSA-4w7w-66w2-5vf9), `server.fs.deny` bypass (GHSA-v2wj-q39q-566r), arbitrary file read via dev WS (GHSA-p9ff-h696-f583) | `npm audit fix` |
| `picomatch` ≤ 2.3.1 / 4.0.0–4.0.3 | **high** | ReDoS via extglob quantifiers (GHSA-c2c7-rcm5-vvqj), POSIX class injection (GHSA-3v7f-55p6-f55p) | `npm audit fix` |
| `flatted` ≤ 3.4.1 | **high** | Prototype pollution via `parse()` (GHSA-rf6f-7fwh-wjgh) | `npm audit fix` |
| `brace-expansion` <1.1.13 / 4.0.0–5.0.5 | moderate | Zero-step sequence hang (GHSA-f886-m6hf-6m8v) | `npm audit fix` |

**Attack-surface note.** `xlsx` is used by `parse-file` endpoint logic
(spreadsheet parsing on user upload). The prototype-pollution vector is
the most concerning of the unfixable issues — any codepath that takes
parsed output and spreads it into an object literal is a potential
sink. Evaluate whether `parse-file` can be constrained to a minimal
subset of xlsx functionality, or migrated to a maintained alternative
(`exceljs`, SheetJS CDN build).

No fixes applied as part of this review (directive is read-only for
dependencies).

---

## 6. Carry-over feature work

### Apparent feature theme

The dominant thread across the carry-over is an **inline per-field
edit UX refactor** across all 5 detail views (Lead, Account, Coupon,
Invoice, Reseller). A new shared component —
`src/components/InlineEditField.tsx` — replaces the previous
"click-Pencil → dialog / full edit mode" pattern with click-to-edit
cards that save optimistically and roll back on error.

A secondary thread is **search UX hardening**: `SearchModal`,
`AccountsView`, and `LeadsView` all switched from naive `async/await`
fetchers to `AbortController`-guarded fetches so fast typing / paste
can't race stale responses over fresh ones.

A third small thread is the **Invoice → Order string rename** — a
cosmetic continuation of `7c5bf2d` "Rename Invoices → Orders (visual
only)" that updates 5 more surfaces (`layout.tsx`, `ChatMessage`,
`LineItemForm`, `CreateInvoiceView`, `DraftInvoicesView`,
`ReportsView`). User-facing strings only; data model is untouched.

A fourth single-line change is an **API hardening**:
`src/app/api/invoices/[id]/route.ts` PATCH now refuses to accept
`Currency` from the request body (comment: "Currency is sourced from the
Reseller record — not user-editable here"). Security-adjacent — closes a
small privilege-boundary issue where a reseller could override the
currency Zoho had assigned them.

### Per-file inventory

| File | Change | Depends on / touches |
|---|---|---|
| `src/components/InlineEditField.tsx` (**new**, 543 lines) | Provider + field component. Types: `text`, `textarea`, `number`, `date`, `select`, `email`, `tel`, `url`, `toggle`, `lookup`. Single-active-field invariant, shake-on-dirty UX, optimistic save via parent `onSave` throwing on error, escape-to-revert, enter-to-confirm. Uses `framer-motion` for shake animation. | `framer-motion`, `lucide-react`. Consumed by the 5 detail views below. |
| `src/components/views/LeadDetailView.tsx` (-347 net) | Removes `startEdit` / `saveField` / `editingField` / `editValue` scaffolding and the custom reseller-lookup UI. Adds `saveFields` optimistic-save helper. Wraps render in `<InlineEditFieldProvider>`. Eagerly fetches reseller options on mount via `fetchResellerOptions` useCallback. | `InlineEditField`, `/api/leads/[id]` PATCH, `/api/resellers` GET |
| `src/components/views/CouponDetailView.tsx` (+166/-… net) | Adds `saveFields` helper + wraps read-only mode in `<InlineEditFieldProvider>`. Full-edit mode (`startEdit`) remains for multi-field edits. Retains existing RBAC from `8ddc0a7` (region/partner filter). | `InlineEditField`, `/api/coupons/[id]` PATCH |
| `src/components/views/AccountDetailView.tsx` (-164 net) | Drops `editingReseller` / `resellerSearch` / `savingReseller` locals. Adds `saveFields` optimistic-save helper with `apiChanges` + `localChanges` shape split (for lookup fields whose display shape differs from the PATCH payload). | `InlineEditField`, `/api/accounts/[id]` PATCH |
| `src/components/views/ResellerManagementView.tsx` (+144 net) | Adds `saveFields` helper + wraps ResellerDetailView's read-only grid in `<InlineEditFieldProvider>`. Replaces several `InfoCard` reads with `InlineEditField` writes (primary contact kept on click-to-open-full-edit, other fields individualised). Adds `useEffect(() => setCurrentPage(1))` reset — this triggers the `react-hooks/set-state-in-effect` lint error. | `InlineEditField`, `/api/resellers/[id]` PATCH |
| `src/components/views/InvoiceDetailView.tsx` (-134 net) | Drops `CURRENCIES` const, `editInvoiceDate`/`editDueDate`/`editCurrency` state. Line-item editing stays via `editing` mode. Dates + currency now inline. | `InlineEditField`, `/api/invoices/[id]` PATCH |
| `src/components/SearchModal.tsx` (+44/-… net) | Converts `handleSearch` to an `AbortController`-guarded `useCallback`. Adds unmount cleanup. | — |
| `src/components/views/AccountsView.tsx` (±67) | Same AbortController pattern. `fetchAccounts(signal)` instead of bare `async`. | `/api/accounts` GET |
| `src/components/views/LeadsView.tsx` (±69) | Same AbortController pattern. | `/api/leads` GET |
| `src/components/views/ReportsView.tsx` (±6) | "Approved Invoices"→"Approved Orders", "Draft Invoices"→"Draft Orders" label/placeholder. | — |
| `src/app/api/invoices/[id]/route.ts` (±2) | PATCH body no longer accepts `Currency`. | — |
| `src/app/layout.tsx` (±2) | Metadata description "invoices"→"orders". | — |
| `src/components/chat/ChatMessage.tsx` (±2) | `'Create Invoice'` button label → `'Create Order'`. | — |
| `src/components/chat/LineItemForm.tsx` (±2) | `'Create Invoice'` → `'Create Order'`. | — |
| `src/components/views/CreateInvoiceView.tsx` (±2) | `'Invoice Date'` → `'Order Date'`. | — |
| `src/components/views/DraftInvoicesView.tsx` (±2) | `'Invoice Date'` column header → `'Order Date'`. | — |

### Suggested commit groupings

> These are suggestions only — commit structure is the user's decision.

**Option A — feature-themed (4 commits):**

1. `Added the InlineEditField component for click-to-edit card fields`
   — just `src/components/InlineEditField.tsx`. Lands the primitive
   first so history bisects cleanly if a consumer breaks.
2. `Migrated detail views to inline per-field editing`
   — `AccountDetailView.tsx`, `CouponDetailView.tsx`,
   `InvoiceDetailView.tsx`, `LeadDetailView.tsx`,
   `ResellerManagementView.tsx`. Body notes the pattern (provider
   wrap, `saveFields` helper, optimistic + rollback).
3. `Hardened list/search fetches against racing paste-driven requests`
   — `SearchModal.tsx`, `AccountsView.tsx`, `LeadsView.tsx`. Cleanly
   independent.
4. `Finished the Invoices → Orders visual rename and locked Currency on PATCH`
   — `layout.tsx`, `ChatMessage.tsx`, `LineItemForm.tsx`,
   `CreateInvoiceView.tsx`, `DraftInvoicesView.tsx`, `ReportsView.tsx`,
   `src/app/api/invoices/[id]/route.ts`. The API hardening naturally
   pairs with the rename continuation since both are user-visible
   clean-ups of the invoice flow.

**Option B — single bundled commit.** Defensible since the carry-over
is a single week's work, has sat together on disk, and the reviewer is
the same person who wrote it. Only downside: bisecting inline-edit
regressions pulls in the rename + search changes too.

**Option C — split the API hardening.** If the Currency-on-PATCH
change is considered a security fix, commit it alone first (one-line,
small blast radius) so it can be cherry-picked to `master` without
dragging the UX refactor. The rest as Option A bundles 2–4 without the
route hunk.

### Pre-commit checks that should pass

- [ ] `npm run build` — expected to pass (carry-over builds clean
      today).
- [ ] `npm test` — expected to pass (no test coverage of the touched
      files).
- [ ] Manual smoke: log in as admin, edit a field on each of the 5
      detail views, confirm optimistic save + rollback paths.
- [ ] Manual smoke: type fast in SearchModal / Accounts / Leads search;
      confirm no stale results flash.
- [ ] Manual smoke: invoice PATCH with `Currency` in body is ignored
      (curl or devtools).
- [ ] `npm run lint` — **will still fail**. Do not gate on a clean lint;
      39/64 pre-existing. Carry-over does not regress the count
      materially (1 new set-state-in-effect in ResellerManagementView,
      matching the pattern already present elsewhere).

---

## 7. TODO / debt scan

Grep of `src/` for `TODO|FIXME|XXX|HACK|@hack|@todo` and
`eslint-disable`:

### Explicit TODOs
- `src/components/views/DashboardView.tsx:186` — `onClick={() => {/* TODO: navigate to guide */}}` — Partner Guide link stub.

### `eslint-disable` sites (suppressions — each is a mini-debt flag)
- `src/components/InlineEditField.tsx:205` — `react-hooks/exhaustive-deps` on the "fire `onOpenEdit` only on entering edit mode" effect. Intentional.
- `src/components/SearchModal.tsx:94` — `react-hooks/exhaustive-deps` on the module-filter re-search effect. Intentional.
- `src/components/layout/AppShell.tsx:122` — `react-hooks/exhaustive-deps`. Intentional.
- `src/lib/export-lists.ts:33, 164` — `@typescript-eslint/no-explicit-any`. Rule-disable directives have **gone stale**: lint flags them as "Unused eslint-disable directive" and then flags the underlying `any` as an error. Net: 2 errors here.
- `src/components/views/ResellerManagementView.tsx:130, 275, 460, 468, 494` — 5 × `@typescript-eslint/no-explicit-any` disables. Pre-carry-over. Need review.

### Debt grouped by area

| Area | Count | Notes |
|---|---|---|
| `lint: no-unused-vars` (unused `user` from `requireAuth`) | ~20 API routes | Purely cosmetic — cleanup batch. |
| `lint: set-state-in-effect` | ~5 | React 19 rule upgrade. Needs real migration to `useEffect`-free idioms (e.g. derived state). |
| `lint: no-explicit-any` | ~8 (export-lists + ResellerManagementView) | Needs proper Zoho typings. |
| `lint: no-assign-module-variable` | 3 (`attach-file`, `chat`, `emails` routes) | Next.js correctness flag. Rename `module` → `mod` or similar. |
| `lint: use-memo` | 1 (CreateEvaluationModal:69) | `useCallback(onClose, [onClose])` → inline function expression. |
| `lint: no-img-element` | 1 (`src/app/page.tsx:10`) | Migrate to `next/image`. |
| `auth: JWT fallback secret` | 1 (`src/lib/auth.ts:23`, `src/lib/env.ts:17`) | `JWT_SECRET` falls back to the literal `'recivis-dev-secret-change-in-production'`. Production deploys MUST set this; there is currently no startup assertion that `NODE_ENV === 'production'` + fallback-value → fail-loud. **Quick win: add a check in `env.ts`.** |
| `dep: xlsx unfixable vulns` | 1 | Prototype pollution + ReDoS, no upstream fix. See §5. |
| `dep: next < 16.2.4` | 1 | 6 advisories. Run `npm audit fix --force` after confirming the 16.2.4 changelog is compatible. |
| `deploy: no `.env.example`` | — | A fresh clone can't start without copying `.env.local` from a populated environment. Not a bug but a docs gap. |
| `tests: zero UI / route coverage` | — | `__tests__/` covers `cache`, `constants`, `validation` only. No Vitest DOM env despite `@testing-library/react` + `@testing-library/jest-dom` being installed — `vitest.config.ts` uses `environment: 'node'`. |
| `feature: Partner Guide link` | 1 | Dashboard stub. |

---

## 8. Resume plan

Prioritised. Tagged `[review]` (blocks on user review), `[agent]`
(agent-actionable now), `[defer]` (not urgent).

### P0 — unblock the backlog

1. **[review]** Decide commit grouping for the 15-file carry-over. See
   Options A/B/C in §6. Once chosen, the next session can execute in
   one pass (build + test before each commit).
2. **[review]** Decide whether to run `npm audit fix --force` to bump
   Next 16.1.6 → 16.2.4 before the inline-edit merge lands. Semantically
   a minor bump; advisory surface argues it should go first.

### P1 — security / correctness wins (small, high-leverage)

3. **[agent]** Harden `JWT_SECRET` handling in `src/lib/env.ts`: throw
   if `NODE_ENV === 'production'` and the env var equals (or falls
   through to) the default string. ~5 lines.
4. **[agent]** Fix the 3 `no-assign-module-variable` Next.js errors in
   `attach-file`, `chat`, `emails` API routes — rename local `module`
   to `mod`. Small, mechanical.
5. **[agent]** Strip the 20 unused `const user = await requireAuth(…)`
   destructuring warnings. Convert to `await requireAuth(…)` where the
   return value is unused, or drop `user` from the destructure.
6. **[agent]** Clean the 2 stale `eslint-disable-next-line
   @typescript-eslint/no-explicit-any` directives in
   `src/lib/export-lists.ts` (either unbreak the `any` or keep the
   disable + type it properly).

### P2 — debt-reduction (larger, defensible)

7. **[defer]** Migrate the 5 `react-hooks/set-state-in-effect` sites to
   derived state or explicit event handlers. Touches 5 files, needs per-
   site thought. The React team flags this as performance-relevant.
8. **[defer]** Evaluate `xlsx` replacement or confinement. If the only
   consumer is `/api/parse-file` spreadsheet input, consider `exceljs`
   (maintained) or move to SheetJS's CDN distribution.
9. **[defer]** Add a minimum viable Vitest suite for each detail view's
   inline-edit save path (the most logic-dense part of the carry-over).
10. **[defer]** Check in a `.env.example` that lists required vars with
    placeholder values (no secrets) — eliminates the "fresh clone won't
    start" friction.

### P3 — feature follow-ups

11. **[defer]** Wire up the DashboardView "Partner Guide" link stub.
12. **[defer]** Replace `<img>` in `src/app/page.tsx` with
    `next/image`.

---

## 9. Open questions for user

Decisions required before development resumes, in rough priority order:

1. **Commit grouping for carry-over.** A / B / C from §6, or something
   else? This gates everything else on the branch.
2. **Do we push `development` after committing?** Remote `development`
   currently has only the integration scaffolding commit (`4394d52`).
   Once the carry-over lands it should be pushed so it's recoverable —
   but push is always user-authorised.
3. **Merge `development` → `master` cadence.** Carry-over has been on
   disk ~3 weeks. Once committed and smoke-tested, is the expectation
   to merge-and-auto-deploy, or to sit on `development` for a while?
4. **`npm audit fix --force` for Next 16.1.6 → 16.2.4.** Before the
   UX merge? After? Skip? (The 6 advisories are non-trivial but all
   require specific attack vectors that may or may not apply to this
   deployment shape.)
5. **`xlsx` strategy.** Replace, CDN-migrate, or accept (and document
   the limitation on parse-file input)?
6. **Lint gate policy.** Is the current 39-error state a known-debt
   acceptance, or should cleaning the lint backlog be scheduled as its
   own task? (The carry-over does not regress it materially.)
7. **JWT fallback secret.** Quick-fix the env-var hardening now, or
   fold into a broader auth review?
8. **Test coverage.** Bring Vitest up for views + API routes, or leave
   as manual-smoke-plus-type-checking indefinitely?

---

*End of review. Next session: read the chosen answers to §9 Q1–Q2,
then execute the commit(s).*
