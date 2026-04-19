# ReCivis continued-development plan — 2026-04-19

Authored by the `recivis` agent on 2026-04-19 immediately after the
four-commit carry-over consolidation landed on `development` (`757552f`
→ `dab7c76`, atop the review-doc commit `88a684f`). This plan feeds off
§8 ("Resume plan") and §9 ("Open questions for user") of
`docs/codebase-review-2026-04-19.md` but takes the post-consolidation
state as its new starting line.

---

## 1. Snapshot (after consolidation)

| Field | Value |
|---|---|
| Branch | `development` |
| HEAD | `dab7c76` — "Finished the Invoices -> Orders visual rename and locked Currency on PATCH" |
| Working tree | **clean** |
| Commits ahead of `origin/development` | 0 (all four carry-over commits pushed) |
| Commits ahead of `origin/master` | 6 (`4394d52` + `88a684f` + `757552f` + `b6efc75` + `2d4fba4` + `dab7c76`) |
| `npm run build` | ✅ PASS (Next.js 16.1.6, 31 routes) |
| `npm test` | ✅ 33 / 33 PASS (cache, constants, validation suites) |
| `npm run lint` | ❌ 39 errors / 64 warnings (pre-existing baseline, unchanged by the carry-over) |
| `npm audit` | ⚠ 6 vulns (1 moderate, 5 high) — next, xlsx, vite, picomatch, flatted, brace-expansion |
| Merge path | `development` → `master` (user-only; auto-deploys to Railway) |

Everything downstream of this document is either:
- **agent-executable without further review** (single-file, <50 LoC, no
  dep / schema / API change — see "In-scope small fixes" below); or
- **blocked on user sign-off** — escalated in §4 Open questions.

---

## 2. In-scope small fixes — to execute this session

Per directive scope: single-file, < 50 LoC delta, no dependency /
schema / API contract change, one commit per fix. Executed in order
listed; each commit gates on build + test.

### F1. Hardened JWT fallback in `src/lib/env.ts`
- **What**: If `process.env.JWT_SECRET` is unset *and* `NODE_ENV === 'production'`, throw at
  call site instead of silently falling back to the dev placeholder
  `'recivis-dev-secret-change-in-production'`.
- **Why**: The fallback exists so a fresh clone can boot without an
  `.env.local`. In production that same fallback becomes a forgeable
  JWT-signing key. A fail-loud check costs nothing in dev and
  eliminates the worst-case deploy slip.
- **Risk**: Zero in dev — same code path. In production, deploys
  missing `JWT_SECRET` now crash on first login instead of silently
  issuing forgeable tokens. That is the intended behaviour; operator
  should surface the env-var before promoting the build.
- **Files**: `src/lib/env.ts` (single function, ~6 LoC delta).

### F2. Renamed `module` local in `src/app/api/chat/route.ts`
- **What**: Rename the `const module` at `route.ts:69` inside
  `filterResultsForRBAC` to `moduleName`. Fixes the Next.js
  `no-assign-module-variable` correctness warning.
- **Why**: `module` shadows Node's reserved identifier. Next.js
  flags this as a correctness bug because in some bundler contexts
  it can collide with the CommonJS `module` object.
- **Risk**: Mechanical rename of a local variable. No caller-visible
  change.
- **Files**: `src/app/api/chat/route.ts` (~4 LoC delta).

### F3. Renamed `module` local in `src/app/api/emails/route.ts`
- **What**: Rename the `module` searchParam local at
  `route.ts:60` (and its ~6 downstream uses) to `moduleName`.
- **Why**: Same rule as F2. Larger LoC touch than F2 because the
  variable is referenced multiple times inside the handler, but it
  is one file and the rename is purely mechanical.
- **Risk**: None — purely local.
- **Files**: `src/app/api/emails/route.ts` (~8 LoC delta).

### F4. Renamed `module` local in `src/app/api/attach-file/route.ts`
- **What**: Rename `const module = moduleName || 'Invoices'` at
  `route.ts:57` to `moduleApi`. Two downstream references on the
  same page.
- **Why**: Same rule as F2 / F3.
- **Risk**: None.
- **Files**: `src/app/api/attach-file/route.ts` (~4 LoC delta).

### F5. Dropped stale `eslint-disable-next-line` directives in `src/lib/export-lists.ts`
- **What**: Remove the two `eslint-disable-next-line
  @typescript-eslint/no-explicit-any` directives that lint now
  reports as "Unused directive". The underlying `any` then becomes
  the actual flagged error — keep the directive active but narrow
  it (update to a specific-rule `// eslint-disable-next-line
  @typescript-eslint/no-explicit-any -- Zoho response shape not yet
  typed`) or type the parameter properly. The correct narrowing
  depends on whether future typing work is planned in the short
  term; default here is to drop the stale directives AND keep the
  `any` flagged so the debt shows up in lint for a future proper
  fix.
- **Why**: A stale `eslint-disable` is strictly worse than no
  directive — it hides the underlying problem once the rule drifts.
- **Risk**: Adds 2 errors back to the lint count (the now-visible
  `any` errors). Net lint delta: -2 warnings (directive unused) +2
  errors (any flagged). Acceptable — moves the debt from "invisible"
  to "tracked".
- **Files**: `src/lib/export-lists.ts` (~2 LoC delta).

> **Deferred from this session**: the ~20 unused `const user = await
> requireAuth(...)` destructures surfaced by the review doc. The
> pattern repeats across many files; the cleanest fix is a single
> commit that touches them all, but that pushes past the "single
> file" small-fix rule. Covered in the next section as W4.

---

## 3. Top 10 work units — continued development

Prioritised; each unit has **goal**, **risk**, **effort** (S / M / L),
**dependencies**, and **blocked-on** tag.

### W1 — Upgrade Next.js 16.1.6 → 16.2.4 `[P1][dep][M]`
- **Goal**: Close 6 Next.js advisories flagged by `npm audit` (request
  smuggling in rewrites, image cache exhaustion, postponed-resume
  DoS, null-origin CSRF in Server Actions, null-origin CSRF in dev
  HMR WS, Server Components DoS).
- **Risk**: Minor version bump. Changelog review required — 16.2.x
  may have introduced behaviour changes to Server Actions / image
  handling that this app relies on. Turbopack is still the build
  driver at 16.2.4.
- **Effort**: S (version bump) + M (smoke + regression pass against
  the 33-route server-render set).
- **Dependencies**: None structural. Should go ahead of the next
  merge to `master` so the deploy carries the patch.
- **Blocked on**: User ack of `npm audit fix --force` (changes
  `package-lock.json`; lockfile modifications are out of scope for
  agent autonomy).

### W2 — Evaluate / constrain `xlsx` attack surface `[P2][security][L]`
- **Goal**: Mitigate the two known-unfixed `xlsx` vulns
  (prototype pollution + ReDoS). Three paths: (a) replace with
  `exceljs` for the read path in `/api/parse-file`; (b) migrate to
  SheetJS's CDN distribution (unpatched but reflects upstream's
  current posture); (c) accept and harden the
  usage site (sanitise parsed output before it hits any object
  literal spread).
- **Risk**: `exceljs` differs in API and parsing behaviour; the
  `/api/parse-file` flow uploads spreadsheets from reseller users
  and the parser output feeds invoice line-item creation. A silent
  parse-shape change could break invoice imports.
- **Effort**: L — audit parse-file consumers, choose path, implement,
  regression-test against real reseller uploads.
- **Dependencies**: None blocking. Decision gate on user preference
  (replace vs. harden).
- **Blocked on**: User decision (review doc §9 Q5).

### W3 — Merge `development` → `master` (cadence decision) `[P0][release][S]`
- **Goal**: Promote the inline-edit + search-race + rename + currency
  lock bundle to production.
- **Risk**: Auto-deploys to Railway on merge. The four commits have
  passed build + test + lint-baseline locally but no UI smoke has
  run against production data (no sandbox available). Smoke in the
  deployed instance is the only path — recommend merging at a
  low-traffic window and watching logs for the first hour.
- **Effort**: S (merge + push). M if a rollback is needed.
- **Dependencies**: W1 optional-before (landing Next upgrade with
  the same deploy saves a round trip).
- **Blocked on**: User explicit approval to merge to master.

### W4 — Cleanup of ~20 unused `const user = await requireAuth()` destructures `[P1][lint][M]`
- **Goal**: Either drop `user` from the destructure (when it is
  unused) or replace the destructure with a bare
  `await requireAuth(request)` + ensure actual consumers still have
  the return value they need.
- **Risk**: Multi-file. Mechanical per file but 20+ files means
  correctness depends on not silently changing the auth call shape.
- **Effort**: M — bulk rewrite + targeted per-route test.
- **Dependencies**: None. Should be done in one commit so the lint
  drop shows up cleanly.
- **Blocked on**: Agent can execute this — but the commit will touch
  >1 file so it falls outside this session's "in-scope small fix"
  definition. Schedule as its own dedicated directive.

### W5 — Migrate 5 `react-hooks/set-state-in-effect` sites to derived state `[P2][lint][M]`
- **Goal**: Remove the 5 `setState`-in-`useEffect` violations flagged
  by the React 19 rule set. Either derive the state from inputs
  directly (no effect needed) or move the setState to the event that
  actually causes the change.
- **Risk**: Per-site judgement. The sites are:
  `AssetDetailModal.tsx:81`, `ResellerManagementView.tsx:161` (the
  one just introduced by the carry-over), and three more documented
  in the review doc §4.
- **Effort**: M — 5 independent per-site redesigns.
- **Dependencies**: None structural. Could be broken up across
  separate commits (one per site) to keep blast-radius tight.
- **Blocked on**: Nothing; agent-actionable but each site is a
  separate small-but-not-tiny fix.

### W6 — `.env.example` check-in `[P1][docs][S]`
- **Goal**: Check in a placeholder-valued `.env.example` listing the
  11 required / optional env vars from review doc §3. Eliminates
  the "fresh clone won't start" friction for a new contributor.
- **Risk**: Zero — no secret values, pure scaffolding. Risk is only
  if the list drifts from the actual required set over time.
- **Effort**: S — one new file, no code changes.
- **Dependencies**: None.
- **Blocked on**: Nothing; agent-actionable in a future session
  (not this one — new file creation outside of carry-over and the
  dev plan itself is agent-conservative default).

### W7 — Minimum Vitest suite for detail-view inline-save paths `[P2][tests][M]`
- **Goal**: Add Vitest + React Testing Library coverage for the five
  detail-view `saveFields` helpers landed in `b6efc75`. Targets the
  most logic-dense + regression-prone surface of the carry-over.
- **Risk**: Vitest is currently configured with
  `environment: 'node'` — this work requires flipping the config to
  `jsdom` or adding a per-suite override for the new DOM-dependent
  tests. `@testing-library/react` + `@testing-library/jest-dom` are
  already in `package.json`.
- **Effort**: M — config plumbing + 5 suites.
- **Dependencies**: None structural.
- **Blocked on**: User decision (review doc §9 Q8).

### W8 — Replace `<img>` in `src/app/page.tsx` with `next/image` `[P3][perf][S]`
- **Goal**: Fix the `@next/next/no-img-element` warning by migrating
  the one remaining `<img>` use to `next/image`. LCP / CLS win on
  the public login page.
- **Risk**: Tiny — known API. Needs correct `width` / `height` /
  `alt` + aspect ratio.
- **Effort**: S.
- **Dependencies**: None.
- **Blocked on**: Nothing; agent-actionable. Single-file < 50 LoC.
  Scheduled for a follow-up session.

### W9 — Wire up Dashboard "Partner Guide" link `[P3][feature][S]`
- **Goal**: Replace the `// TODO: navigate to guide` stub in
  `DashboardView.tsx:186` with a real navigation target. Likely a
  Partner Resources view route (already partly in place per
  `PartnerResources.tsx`).
- **Risk**: Low — UI stub completion.
- **Effort**: S.
- **Dependencies**: None.
- **Blocked on**: User decision on where "Partner Guide" should
  point (internal view vs. external PDF vs. Zoho Workdrive link).

### W10 — RBAC / auth audit as a sequenced package `[P2][security][L]`
- **Goal**: Holistic pass over the 3-tier RBAC model: reseller role,
  user role, per-reseller overrides. Validate every API route
  correctly applies the intersection logic, not just the user-role
  check. Focus on mutation routes (`PATCH` / `POST` / `DELETE` on
  accounts, leads, invoices, resellers, coupons, users).
- **Risk**: Audit is read-only; any fixes discovered become their
  own scoped directives.
- **Effort**: L — careful per-route walk, test against the
  documented permission matrix, potentially add an integration
  test for the matrix as part of W7.
- **Dependencies**: Could run in parallel with W7 (the test
  scaffolding W7 adds is exactly what this audit would need to
  land any fixes it surfaces).
- **Blocked on**: Nothing structural; user decision on urgency. The
  carry-over PATCH lock on Currency is a concrete example of the
  class of gap this audit would surface.

---

## 4. Recommended sequencing

Strict order (→) or parallelisable (||):

```
F1 → F2 || F3 || F4 → F5            (this session, in-scope small fixes)
│
├─► W3 [user-gated]                 (merge development → master)
│   │
│   └─► W1 [user-gated]             (can fold into the same merge)
│
├─► W4 → W5                         (lint cleanup, agent-executable)
│
├─► W7 → W10                        (tests + audit, mutually useful)
│
├─► W6 || W8 || W9                  (tiny follow-ups, any session)
│
└─► W2 [user-gated]                 (xlsx strategy, largest user decision)
```

---

## 5. Dependencies on user input

Carried over from review doc §9, updated for post-consolidation state:

1. **W3 — Merge cadence.** Is the expectation to merge
   `development` → `master` now that the carry-over has landed, or
   to let it settle for a few days?
2. **W1 — `npm audit fix --force`** for Next 16.1.6 → 16.2.4: before
   W3, after, or skip?
3. **W2 — xlsx strategy.** Replace with `exceljs`, migrate to
   SheetJS CDN, or harden the `/api/parse-file` usage site and
   accept the unfixed status?
4. **W7 — Test coverage.** Bring Vitest up for views + API routes,
   or stay on manual-smoke-plus-type-checking?
5. **W10 — RBAC audit.** Scheduled directive or opportunistic
   fix-forward?
6. **Lint gate policy.** The carry-over returned lint to the
   pre-existing 39-error baseline. Is this a known-debt acceptance
   (W4 / W5 are not urgent), or should the backlog clear before the
   next merge to master?

---

## 6. Known blockers / escalations

None active. The four carry-over commits landed cleanly, build is
green, tests are green, and the working tree is clean. The only
"blocker" in the session was that InlineEditField on its own (before
its consumer views joined it) briefly raised lint count by +6 errors
and +2 warnings — this was a stash-driven intermediate state, not a
regression, and was resolved when commit 3 landed and brought the
count back to the 39 / 64 baseline. The transient state is
documented in the commit-3 message for historical clarity.

---

*Authored 2026-04-19. Update on the next directive that lands a work
unit from §3.*
