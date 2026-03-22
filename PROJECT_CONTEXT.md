# ReCivis — Civil Survey Applications Partner Portal

## Project Context for AI Assistants

**Read this file to understand the full project before making changes.**
**Last updated: 2026-03-22**

---

## Quick Reference

| Item | Value |
|------|-------|
| **Local path** | `C:\Users\JoshuaBoak\Desktop\recivis` |
| **Git repo** | `https://github.com/Joshuaboak/recivis.git` |
| **Branch** | `master` |
| **Deployment** | Railway (auto-deploys on push to master) |
| **Production URL** | `https://recivis-production.up.railway.app` |
| **Framework** | Next.js 16.1.6 (Turbopack), React 19, TypeScript 5 |
| **Styling** | Tailwind CSS 4, Framer Motion |
| **Database** | PostgreSQL (Railway-hosted) |
| **Cache** | Redis (Railway-hosted, optional — app works without it) |
| **CRM** | Zoho CRM (.com.au — Australian instance) |
| **Zoho Org ID** | `7002802215` |
| **CRM Base URL** | `https://crm.zoho.com.au/crm/org7002802215` |

---

## Who Owns This

**Josh Boak** — Systems Development / IT Manager
- Email: joshua.boak@civilsurveysolutions.com.au
- Manages three companies: CSS, CADApps, CSA (see CLAUDE.md)

**Company**: Civil Survey Applications (CSA) — develops Civil Site Design & Stringer Suite software. This portal is for CSA's reseller/partner network to manage invoices, accounts, licences, and assets.

---

## Architecture Overview

```
Browser (React SPA)
    ↓ HTTP-only JWT cookie (24h expiry, auto-logout on 401)
Next.js API Routes (server-side)
    ↓                    ↓                    ↓
PostgreSQL          Zoho CRM MCP         Zoho REST API
(users, roles,      (accounts,           (coupons, file
 resellers DB,       invoices,            attachments,
 audit log,          products,            OAuth tokens,
 notification        assets, leads,       lead conversion)
 dismissals)         emails, etc.)
    ↓
Redis (optional cache for resellers, products, coupons, reports, notifications, currencies)
```

### Zoho CRM Integration — Two Methods

1. **MCP (Model Context Protocol)** — Preauthorized endpoint for most CRUD operations
   - URL: `https://recivis-7006508204.zohomcp.com.au/mcp/<key>/message`
   - Configured in: `src/lib/zoho-mcp-auth.ts`
   - Client: `src/lib/zoho.ts`
   - Available tools: `searchRecords`, `getRecords`, `getRecord`, `getRelatedRecords`, `getVariables`, `createRecords`, `updateRecords`, `getEmails`, `getSpecificEmail`, `getLeadsRecords`, `getLeadsRecord`, `getLeadConversionOptions`, `getCurrencies`, `getAttachmentById`
   - **IMPORTANT**: Tool names are camelCase (e.g., `ZohoCRM_searchRecords` not `ZohoCRM_Search_Records`)
   - **IMPORTANT**: `getRecords` only supports `id`, `Created_Time`, `Modified_Time` as sort_by fields — NOT custom fields like `Invoice_Date`
   - Session management: auto-retry on stale sessions in `callMcpTool()`
   - The MCP key changes periodically — update in `.env.local` (`ZOHO_MCP_URL`) and Railway env vars

2. **REST API with API Key** — For operations MCP doesn't support
   - Deluge functions called via `https://www.zohoapis.com.au/crm/v7/functions/<name>/actions/execute?auth_type=apikey&zapikey=<key>`
   - Used for: renewal generation, licence deactivation, QLM key details, coupon product creation
   - OAuth tokens for file attachments AND lead conversion obtained via `getresellerzohotoken` Deluge function
   - Lead conversion: `POST /crm/v7/Leads/{id}/actions/convert` with OAuth token
   - API key stored in `ZOHO_API_KEY` env var — **never hardcode it**

### Key Zoho Modules

| Module | API Name | Purpose |
|--------|----------|---------|
| Accounts | `Accounts` | Customer companies (Account_Type: Customer or Prospect) |
| Contacts | `Contacts` | People at accounts |
| Invoices | `Invoices` | Sales invoices with line items (subform: `Invoiced_Items`) |
| Products | `Products` | SKU-based products with lookup filters |
| Assets | `Assets1` | Software licences (note: `Assets1` not `Assets`) |
| Resellers | `Resellers` | Partner organizations |
| Leads | `Leads` | Web form submissions (unconverted contacts) |
| Coupons | `Coupons` | Discount coupons |

### Zoho Field Gotchas

- `Record_Status__s` CANNOT be used in search criteria — always filter post-fetch
- `Invoiced_Items` is a subform (array), not a related list
- To delete a subform row: include `{id: "...", _delete: true}` in the array
- To update existing subform rows: include `id` but DON'T include `Product_Name` (triggers re-validation of lookup filter)
- New subform rows: include `Product_Name: {id: "..."}` without a row `id`
- `Reference_Number` is the invoice auto-number field (label: INV)
- `Reseller_Region` on invoices must be set for product lookup filters to work (maps AU→ANZ, NZ→ANZ)
- Multi-select picklists come as arrays from Zoho, not semicolon strings
- `Reseller_Direct_Purchase` = true means reseller IS purchasing (invoice to reseller, apply discount)
- `Reseller_Direct_Purchase` = false means customer is purchasing (invoice to customer, full list price)
- IMAP-synced emails return `NO_PERMISSION` from MCP when fetching content — handle gracefully

---

## Environment Variables

### Required (app will fail without these)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `ZOHO_MCP_URL` | Preauthorized MCP endpoint URL (includes key) |
| `ZOHO_API_KEY` | Zoho API key for Deluge function calls |

### Optional

| Variable | Purpose | Default |
|----------|---------|---------|
| `JWT_SECRET` | JWT signing secret | `recivis-dev-secret-change-in-production` |
| `REDIS_URL` | Redis connection for caching | Falls back gracefully without cache |
| `OPENROUTER_API_KEY` | AI chat assistant (OpenRouter) | Chat won't work without it |
| `NEXT_PUBLIC_APP_URL` | App URL for password reset emails | `http://localhost:3000` |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Gmail API for password reset emails | Logs reset URL to console |
| `GMAIL_SENDER` | Sender email for reset emails | `auth@civilsurveyapplications.com.au` |

---

## Database Schema (PostgreSQL)

Defined in `src/lib/db.ts`. Three-tier permission model:

```
reseller_roles (org-level caps)
    ↓ reseller_role_id
resellers (partner organizations — synced from Zoho)
    ↓ reseller_id
users (individual portal accounts)
    ↓ user_role_id
user_roles (per-user permissions within their org)

Effective permission = user_role AND reseller_role
```

### Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `reseller_roles` | Org-level permission caps (internal, distributor, reseller, restricted) | `can_create_invoices`, `can_approve_invoices`, `can_view_child_records`, etc. |
| `resellers` | Partner orgs | `id` (Zoho ID or 'csa-internal'), `distributor_id` (parent), `reseller_role_id` |
| `user_roles` | Per-user caps (admin, ibm, manager, standard, viewer) | Same boolean flags as reseller_roles + `can_manage_users` |
| `users` | Portal user accounts | `email`, `password_hash` (bcrypt), `reseller_id`, `user_role_id`, `is_active` |
| `audit_log` | Security audit trail | `user_id`, `email`, `action`, `details`, `ip_address` |
| `password_reset_tokens` | Reset tokens (SHA-256 hashed) | `user_id`, `token` (hashed), `expires_at`, `used` |
| `notification_dismissals` | Tracks dismissed notifications per user | `user_id`, `notification_key`, `created_at` (auto-cleanup >30d) |

### Reseller Roles (seeded)

| Role | Create Invoices | Approve | Send | View All | View Children | Modify Prices |
|------|----------------|---------|------|----------|---------------|---------------|
| `internal` | Yes | Yes | Yes | Yes | Yes | Yes |
| `distributor` | Yes | No | Yes | No | Yes | Yes |
| `reseller` | Yes | No | No | No | No | No |
| `restricted` | Yes | No | No | No | No | No |

### CSA Internal Mapping

- PostgreSQL `reseller_id = 'csa-internal'` for CSA staff (Josh, Andrew)
- Zoho CRM `Resellers` module ID for CSA = `55779000000560184`
- The `resellers/[id]/route.ts` API maps between these two IDs

---

## Authentication & RBAC

### Auth Flow
1. User logs in via `POST /api/auth` with email + password
2. Server validates against bcrypt hash in PostgreSQL
3. Server sets HTTP-only cookie `recivis-token` with JWT (24h expiry)
4. All subsequent API requests include the cookie automatically
5. `src/lib/api-auth.ts` → `requireAuth(request)` reads cookie, verifies JWT, loads full permissions from DB
6. Global fetch interceptor in AppShell detects 401s → shows "Session expired" toast → auto-logout

### Role Hierarchy
| Role | Can Create Invoices | Can Approve | Can Send | Can Manage Users | Can View All |
|------|-------------------|-------------|----------|-----------------|-------------|
| `admin` | Yes | Yes | Yes | Yes | Yes |
| `ibm` | Yes | Yes | Yes | No | Yes |
| `manager` | Depends on reseller_role | No | Depends | Yes (own org) | No |
| `standard` | Depends | No | No | No | No |
| `viewer` | No | No | No | No | No |

### RBAC on API Routes
- All routes (except auth/setup) require authentication
- Write operations check specific permissions (see `api-auth.ts`)
- Admin/IBM bypass all permission checks
- Account search and invoice creation now enforce reseller ownership at both API and AI levels
- Individual permission overrides are configurable on partner registration and from the partner detail view

---

## Leads Module

The leads page merges data from two Zoho sources into a unified view:

1. **Leads** (Zoho Leads module) — web form contacts without evaluations
2. **Prospects** (Accounts where `Account_Type = 'Prospect'`) — contacts with product evaluations

### Key Behaviors
- Accounts page filters OUT `Account_Type = 'Prospect'`
- Leads page shows both with source badges (Lead vs Prospect)
- Lead detail has inline editing for all fields + "Convert to Prospect" button (admin only)
- Convert uses Zoho REST API: `POST /Leads/{id}/actions/convert` with OAuth token and `trigger: ['workflow']`
- Prospect detail shows contacts, evaluation assets, invoices (like account detail)
- Tooltips on Lead/Prospect badges explain the difference

### Lead Fields
- Company, Full_Name, First_Name, Last_Name, Email, Phone, Mobile, Website
- Lead_Status: Not Contacted, Attempted to Contact, Contacted, Future Interest, No Interest Ever, Dormant, Lost Lead, Pre-Qualified, Suspect
- Product_Interest: Civil Site Design for BricsCAD/Civil 3D, Corridor EZ for Civil 3D, Stringer Topo for BricsCAD/Civil 3D, Customization/Design/Training Services, Software Maintenance Plan
- Industry: Civil Engineering, Utilities, Academic, Builder, Developer, Government, Mining, Survey, etc.
- Lead_Source, Reseller (lookup), Owner, Job_Title3, Country, Converted__s

---

## Reseller Pricing

### Commission Logic
- `Reseller_Sale` field on the Resellers module = reseller's commission percentage
- Products in Zoho always store the full customer list price
- When `Reseller_Direct_Purchase = true` (reseller is buying): prices discounted by `(100 - commission%)`
- When toggled to customer: prices restored to full list price
- Coupon discount line items (negative prices) are never modified
- `Contract_Term_Years = 0` signals custom pricing to Zoho

### Revenue Splits (for reports)
For a $100 list price, Reseller% = 40, Distributor% = 50:

**Customer Direct** (invoice to customer at $100):
- Customer pays: $100
- Reseller earns: $40 (40%)
- Distributor earns: $10 (50% - 40% = 10%)
- CSA keeps: $50 (100% - 50%)

**Reseller Direct** (invoice to reseller at $60):
- Reseller pays: $60 (discounted)
- Reseller earns from us: $0 (they mark up to customer)
- Distributor earns: $10 (same margin)
- CSA keeps: $50

**CSA-owned resellers** (Civil Survey Applications, LLC, India, Europe) = 100% CSA revenue, no splits.

---

## Email History

- `EmailHistory` component on Account detail, Lead detail, Prospect detail
- Admin/IBM only
- Fetches via `ZohoCRM_getEmails` (metadata list) and `ZohoCRM_getSpecificEmail` (full content)
- For accounts: fetches emails for each Contact (not the account ID) since Zoho ties emails to contacts
- IMAP-synced emails show "IMAP" badge and graceful error when content is unavailable
- Full HTML rendered in sandboxed iframe (`srcdoc`)
- Attachment download on demand (not stored)

---

## Notifications

Poll-based system querying Zoho for recent events:

| Type | Trigger | Who Sees It |
|------|---------|-------------|
| New Lead Assigned | Lead created with reseller | Reseller + Distributor + Admin/IBM |
| Evaluation Started | Prospect account created | Reseller + Distributor + Admin/IBM |
| Invoice Approved/Paid | Invoice status change | Reseller + Distributor + Admin/IBM |

- Cached in Redis per reseller (3 min TTL), admin sees all
- Dismissals stored in PostgreSQL (auto-cleanup >30 days)
- Bell icon in header with unread count badge
- Click → navigate to record + auto-dismiss
- Frontend polls every 3 minutes

---

## Reports Dashboard

Tabs: Overview | Accounts | Leads | Revenue

### Features
- 13-month default range, "Load More" for history
- Multi-month selection (click months to combine)
- Currency switcher: All (converted to AUD) | individual currencies
- Exchange rates from Zoho CRM `getCurrencies` API (cached 1 hour)
- Clickable summary cards navigate to relevant tab
- Bar charts for revenue, accounts, leads trends
- Drill-down tables per month with clickable rows
- CSV export per tab with month range in filename
- Only Approved invoices in revenue reports

### RBAC for Reports
- Admin/IBM: all data + region/partner filters + full breakdown (CSA Profit, Distributor Owed, Reseller Owed)
- Distributor: own + child reseller data, sees "Your Earnings"
- Reseller: own data only, sees "Your Commission"

---

## Stripe Payments

- `InvoicePayment` component on invoice detail (after Send To section)
- Zoho fields: `Stripe_Payment_Link`, `Stripe_Total`, `Payment_Status`, `Grand_Total_with_Stripe_Fee`, `Stripe_Transaction_Fee`
- Payment link locked when invoice is Approved/Sent
- Invoice updates trigger `['workflow']` which generates Stripe link
- 6-second delayed reload after save to fetch generated payment details
- Note: licence keys auto-sent to payee after payment

---

## Global Search

- Ctrl+K / Cmd+K shortcut opens search modal
- Module filter pills: All | Accounts | Prospects | Leads | Contacts | Invoices | Partners
- Searches Zoho via word search, results grouped by module
- Click result → navigate to detail view
- RBAC: non-admin users only see results matching their reseller IDs
- Partners module admin/IBM only
- Re-searches automatically when changing module filter

---

## Caching (Redis)

Configured in `src/lib/cache.ts`. Completely optional — falls back gracefully.

| Cache Key Pattern | TTL | Invalidated On |
|-------------------|-----|---------------|
| `resellers:*` | 5 min | POST /api/resellers |
| `products:<sku>` | 10 min | Never (products rarely change) |
| `coupons:all` | 2 min | POST /api/coupons |
| `notifications:*` | 3 min | Auto |
| `reports:v4:*` | 10 min | Auto |
| `currencies:rates` | 1 hour | Auto |

---

## File Structure

```
src/
├── app/
│   ├── api/
│   │   ├── auth/              — Login, forgot-password, reset-password, logout
│   │   ├── accounts/          — GET (list, filters out Prospects), POST (create)
│   │   ├── accounts/[id]/     — GET (detail + contacts/assets/invoices), PATCH (update)
│   │   ├── invoices/          — GET (list), POST (create)
│   │   ├── invoices/[id]/     — GET (detail + line items), PATCH (update, triggers workflows)
│   │   ├── leads/             — GET (unified leads + prospects list)
│   │   ├── leads/[id]/        — GET (lead or prospect detail), POST (convert lead), PATCH (update lead)
│   │   ├── resellers/         — GET (list + user counts), POST (create in Zoho)
│   │   ├── resellers/[id]/    — GET (detail + users + DB status), PATCH (update), POST (register in DB)
│   │   ├── users/             — GET (list), POST (create)
│   │   ├── users/[id]/        — PATCH (update), PUT (reset password)
│   │   ├── contacts/          — POST (create)
│   │   ├── products/          — GET (search by SKU)
│   │   ├── assets/            — GET (detail), POST (QLM key details), PATCH (update), PUT (deactivate)
│   │   ├── renewals/          — POST (generate renewal invoice)
│   │   ├── coupons/           — GET (list), POST (create + call coupon product function)
│   │   ├── coupons/[id]/      — GET (detail), PATCH (update)
│   │   ├── coupons/validate/  — POST (validate coupon code against restrictions)
│   │   ├── attach-file/       — POST (upload file to Zoho record)
│   │   ├── emails/            — GET (list emails, specific email content, attachment download)
│   │   ├── search/            — GET (global search across modules with RBAC)
│   │   ├── notifications/     — GET (poll notifications), POST (dismiss)
│   │   ├── reports/           — GET (monthly aggregates with revenue splits)
│   │   ├── currencies/        — GET (exchange rates from Zoho)
│   │   ├── chat/              — POST (AI chat with OpenRouter)
│   │   ├── parse-file/        — POST (parse PO file)
│   │   ├── logs/              — GET (app logs)
│   │   └── setup/             — GET (init DB + seed)
│   ├── layout.tsx             — HTML shell, metadata, favicon
│   ├── page.tsx               — Entry point (loads AppShell)
│   └── globals.css            — Tailwind config, CSA brand colors, table styles
│
├── components/
│   ├── layout/
│   │   ├── AppShell.tsx       — Root layout, view routing, code splitting, session expiry, search + notifications
│   │   ├── Sidebar.tsx        — Navigation with collapsible submenus (Accounts, Invoices, Reports, Partners)
│   │   └── UserMenu.tsx       — User profile, logout
│   ├── views/
│   │   ├── DashboardView.tsx  — Landing page, quick actions, recent accounts
│   │   ├── AccountsView.tsx   — Account list (excludes Prospects), sortable by Created
│   │   ├── AccountDetailView.tsx — Account detail (info, contacts, emails, invoices, assets)
│   │   ├── CreateAccountView.tsx — New account + contact form
│   │   ├── LeadsView.tsx      — Unified leads + prospects list with filters
│   │   ├── LeadDetailView.tsx — Lead detail (editable) or Prospect detail (account-like)
│   │   ├── InvoiceView.tsx    — AI chat invoice assistant
│   │   ├── InvoiceDetailView.tsx — Invoice detail with payment, pricing, send-to toggle
│   │   ├── CreateInvoiceView.tsx — New invoice with reseller pricing auto-applied
│   │   ├── DraftInvoicesView.tsx — Invoice list with sortable columns
│   │   ├── ReportsView.tsx    — AI chat for reports
│   │   ├── ReportsDashboardView.tsx — Pre-baked reports with currency conversion
│   │   ├── CouponsView.tsx    — Coupon list
│   │   ├── CreateCouponView.tsx — Coupon creation form
│   │   ├── CouponDetailView.tsx — Coupon detail with restrictions
│   │   ├── ResellerManagementView.tsx — Partner grid + detail + users + DB registration
│   │   ├── PartnerResourcesView.tsx — External resource links
│   │   └── LoginView.tsx      — Auth screen
│   ├── invoice/               — InvoiceDetailView sub-components
│   │   ├── InvoiceHeader.tsx
│   │   ├── InvoiceLineItems.tsx — With reseller pricing tooltips
│   │   ├── InvoicePurchaseOrder.tsx
│   │   ├── InvoiceSendTo.tsx
│   │   ├── InvoiceCoupon.tsx
│   │   └── InvoicePayment.tsx — Stripe payment link, status, fees
│   ├── EmailHistory.tsx       — Reusable email list + detail modal (admin/IBM only)
│   ├── EmailDetailModal.tsx   — Full email viewer with iframe, tracking, attachments
│   ├── SearchModal.tsx        — Global search with module filter pills
│   ├── NotificationBell.tsx   — Notification dropdown with dismiss/clear
│   ├── Pagination.tsx         — Shared pagination with sliding window
│   ├── SKUBuilder.tsx         — Product SKU wizard modal
│   └── AssetDetailModal.tsx   — Asset + QLM key details modal
│
├── lib/
│   ├── store.ts               — Zustand state (user, view, messages, selections, leads)
│   ├── types.ts               — TypeScript interfaces (permissions, chat, Zoho)
│   ├── zoho.ts                — MCP client, tool mapping, pagination helpers
│   ├── zoho-mcp-auth.ts       — MCP endpoint configuration
│   ├── auth.ts                — User CRUD, JWT, password reset, seeding
│   ├── db.ts                  — PostgreSQL schema, connection pool, notification_dismissals table
│   ├── api-auth.ts            — JWT cookie auth middleware for API routes
│   ├── api-response.ts        — Standardized API response helpers
│   ├── cache.ts               — Redis caching with graceful fallback
│   ├── validation.ts          — Zod schemas for input validation
│   ├── constants.ts           — Centralized constants (IDs, regions, currencies, page sizes)
│   ├── env.ts                 — Safe environment variable access
│   ├── ai-tools.ts            — AI system prompt + tool definitions
│   ├── logger.ts              — Async debounced file logger
│   ├── export-account.ts      — XLSX export for single account
│   └── export-lists.ts        — XLSX export for account/invoice lists
│
├── __tests__/
│   ├── validation.test.ts     — Zod schema tests (21 tests)
│   ├── constants.test.ts      — Constants integrity tests (9 tests)
│   └── cache.test.ts          — Redis fallback tests (3 tests)
│
└── public/
    ├── favicon.svg            — CSA icon on dark background
    ├── logo.svg               — CSA blue icon
    └── logo-grey.svg          — CSA greyscale icon
```

---

## Key Design Decisions

### SKU Builder
Products are identified by SKU codes built from selections:
- Format: `{PRODUCT}-{USERTYPE}-{LICENSING}-COM-1YR-{MODEL}-{REGION}`
- Example: `CSD-SU-CL-COM-1YR-SUB-ANZ`
- CSP is special: `CSP-{VER}-SU-CB-COM-1YR-{MODEL}-{REGION}`
- Region mapping: AU→ANZ, NZ→ANZ, others match (EU, NA, AS, AF, WW)

### Invoice Line Item Editing
- Existing rows: send `id` but NOT `Product_Name` (avoids lookup filter re-validation)
- New rows: send `Product_Name: {id}` without row `id`
- Deleted rows: send `{id, _delete: true}` (Zoho requires explicit deletion)
- Price changes: set `Contract_Term_Years = 0` to signal custom pricing
- Invoice updates trigger `['workflow']` for Stripe link generation

### Renewal Eligibility
Assets NOT eligible for renewal:
- Upgraded (`Upgraded_To_Key` has value)
- Revoked (`Revoked = true`, tooltip shows `Revoked_Reason`)
- Evaluation (`Evaluation_License` or product name contains "evaluation")
- Educational (`Educational_License` or product name contains "educational")
- NFR (product name contains "nfr")
- Home Use (product name contains "home use") UNLESS Civil Site Design Plus

### Coupon System
1. Admin creates coupon in Zoho (via REST API, MCP not authorised)
2. `create_coupon_product` Deluge function creates a discount product
3. Users apply coupons by code → validates restrictions → adds discount product as negative-price line item
4. Restrictions: region, partner, product, order type, date range, usage limit, order value

---

## RBAC Security Model (Implemented)

### Server-Side Enforcement
All API routes enforce reseller ownership for non-admin users:
- `GET /api/accounts` — forces reseller filter to `user.allowedResellerIds`
- `GET /api/accounts/[id]` — verifies account's Reseller matches user's allowed IDs
- `PATCH /api/accounts/[id]` — verifies ownership before update
- `GET /api/invoices` — forces reseller filter to `user.allowedResellerIds`
- `POST /api/invoices` — verifies invoice's Reseller is in user's allowed IDs
- `GET /api/invoices/[id]` — verifies invoice's Reseller matches user
- `PATCH /api/invoices/[id]` — verifies ownership + checks `canApproveInvoices` for Status=Approved, `canSendInvoices` for Send

### AI Chat Enforcement
- System prompt built from server-side auth (not client-provided user data)
- `enforceToolRBAC()` intercepts tool calls: blocks invoice creation for wrong reseller, blocks approve/send without permission
- AI system prompt includes explicit RBAC instructions with user's permissions and allowed reseller IDs

### Per-Reseller Permission Overrides
- `resellers` table has nullable `perm_*` columns (NULL = use reseller_role default, true/false = override)
- `api-auth.ts` computes: `effective = override ?? role_default`
- Registration form shows permission toggles pre-filled from selected preset, allows overrides
- Partner detail view shows current effective permissions with "Edit Permissions" button (admin/IBM only)
- PATCH `/api/resellers/[id]` with `_updatePermissions: true` updates overrides

---

## Dependencies

| Package | Purpose |
|---------|---------|
| `next` 16.1.6 | Framework (App Router, API routes, Turbopack) |
| `react` 19.2.3 | UI |
| `zustand` 5.0.12 | State management (persisted user to localStorage) |
| `tailwindcss` 4 | Styling |
| `framer-motion` 12.36 | Animations |
| `lucide-react` | Icons |
| `pg` 8.20 | PostgreSQL client |
| `ioredis` 5.10 | Redis client |
| `bcryptjs` 3.0 | Password hashing |
| `jsonwebtoken` 9.0 | JWT tokens |
| `googleapis` 171.4 | Gmail API (password reset emails only) |
| `xlsx` 0.18 | Excel export |
| `zod` 4.3 | Input validation |
| `vitest` (dev) | Test framework |

---

## Testing

```bash
npm test        # Run all tests once
npm run test:watch  # Watch mode
```

33 tests across 3 files: validation schemas, constants integrity, cache fallback.

---

## Common Tasks

### Deploy
```bash
git push origin master  # Railway auto-deploys
```

### Update MCP Key
1. Get new URL from Zoho MCP configuration
2. Update `ZOHO_MCP_URL` in `.env.local` (local)
3. Update `ZOHO_MCP_URL` in Railway environment variables (production)
4. Restart dev server / wait for Railway redeploy

### Add a New View
1. Create component in `src/components/views/`
2. Add view ID to store type union in `src/lib/store.ts`
3. Add to `VIEW_TITLES` and view map in `src/components/layout/AppShell.tsx`
4. Add dynamic import with `{ loading: ViewLoader }`
5. Add nav item in `src/components/layout/Sidebar.tsx`

### Add a New API Route
1. Create `src/app/api/<name>/route.ts`
2. Import and call `requireAuth(request)` at top of each handler
3. Add RBAC checks if needed (`isAdmin()`, `user.permissions.*`)
4. Add Zod validation for POST/PATCH bodies
5. Use `parseMcpResult()` for Zoho responses

---

## Brand & Styling

| Token | Value | Usage |
|-------|-------|-------|
| `csa-primary` | `#0A4C6E` | Dark blue |
| `csa-accent` | `#0077B7` | Primary accent (buttons, links) |
| `csa-purple` | `#5B52B7` | Secondary accent (renewals, coupons) |
| `csa-highlight` | `#B1E0F1` | Light accent (hover states) |
| `csa-dark` | `#042637` | Card/panel backgrounds |
| `csa-deep` | `#021A26` | Page background |
| Font | Encode Sans Semi Condensed | Google Fonts import |

The app is branded as **"Civil Survey Applications Partner Portal"** — never abbreviate to CSA in the UI.
