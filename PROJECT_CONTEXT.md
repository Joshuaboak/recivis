# ReCivis — Civil Survey Applications Partner Portal

## Project Context for AI Assistants

**Read this file to understand the full project before making changes.**
**Last updated: 2026-03-19**

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
    ↓ HTTP-only JWT cookie
Next.js API Routes (server-side)
    ↓                    ↓                    ↓
PostgreSQL          Zoho CRM MCP         Zoho REST API
(users, roles,      (accounts,           (coupons, file
 resellers DB,       invoices,            attachments,
 audit log)          products,            OAuth tokens)
                     assets, etc.)
    ↓
Redis (optional cache for resellers, products, coupons)
```

### Zoho CRM Integration — Two Methods

1. **MCP (Model Context Protocol)** — Preauthorized endpoint for most CRUD operations
   - URL: `https://recivis-7006508204.zohomcp.com.au/mcp/<key>/message`
   - Configured in: `src/lib/zoho-mcp-auth.ts`
   - Client: `src/lib/zoho.ts`
   - Available tools: `searchRecords`, `getRecords`, `getRecord`, `getRelatedRecords`, `getVariables`, `createRecords`, `updateRecords`
   - **IMPORTANT**: Tool names are camelCase (e.g., `ZohoCRM_searchRecords` not `ZohoCRM_Search_Records`)
   - Session management: auto-retry on stale sessions in `callMcpTool()`
   - The MCP key changes periodically — update in `.env.local` (`ZOHO_MCP_URL`) and Railway env vars

2. **REST API with API Key** — For operations MCP doesn't support
   - Deluge functions called via `https://www.zohoapis.com.au/crm/v7/functions/<name>/actions/execute?auth_type=apikey&zapikey=<key>`
   - Used for: renewal generation, licence deactivation, QLM key details, coupon product creation
   - OAuth tokens for file attachments obtained via `getresellerzohotoken` Deluge function
   - API key stored in `ZOHO_API_KEY` env var — **never hardcode it**

### Key Zoho Modules

| Module | API Name | Purpose |
|--------|----------|---------|
| Accounts | `Accounts` | Customer companies |
| Contacts | `Contacts` | People at accounts |
| Invoices | `Invoices` | Sales invoices with line items (subform: `Invoiced_Items`) |
| Products | `Products` | SKU-based products with lookup filters |
| Assets | `Assets1` | Software licences (note: `Assets1` not `Assets`) |
| Resellers | `Resellers` | Partner organizations |
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
- `Direct_Customer_Contact` boolean controls invoice routing (reseller vs customer)

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

### CSA Internal Mapping

- PostgreSQL `reseller_id = 'csa-internal'` for CSA staff (Josh, Andrew)
- Zoho CRM `Resellers` module ID for CSA = `55779000000560184`
- The `resellers/[id]/route.ts` API maps between these two IDs

### Indexes

```sql
idx_resellers_distributor ON resellers(distributor_id)
idx_resellers_role ON resellers(reseller_role_id)
idx_users_email ON users(email)
idx_users_reseller ON users(reseller_id)
idx_users_role ON users(user_role_id)
idx_audit_log_user ON audit_log(user_id)
idx_audit_log_email ON audit_log(email)
idx_audit_log_created ON audit_log(created_at)
idx_reset_tokens_token ON password_reset_tokens(token)
idx_password_reset_user ON password_reset_tokens(user_id)
```

---

## Authentication & RBAC

### Auth Flow
1. User logs in via `POST /api/auth` with email + password
2. Server validates against bcrypt hash in PostgreSQL
3. Server sets HTTP-only cookie `recivis-token` with JWT (24h expiry)
4. All subsequent API requests include the cookie automatically
5. `src/lib/api-auth.ts` → `requireAuth(request)` reads cookie, verifies JWT, loads full permissions from DB

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

---

## Caching (Redis)

Configured in `src/lib/cache.ts`. Completely optional — falls back gracefully.

| Cache Key Pattern | TTL | Invalidated On |
|-------------------|-----|---------------|
| `resellers:*` | 5 min | POST /api/resellers |
| `products:<sku>` | 10 min | Never (products rarely change) |
| `coupons:all` | 2 min | POST /api/coupons |

---

## File Structure

```
src/
├── app/
│   ├── api/
│   │   ├── auth/              — Login, forgot-password, reset-password, logout
│   │   ├── accounts/          — GET (list), POST (create)
│   │   ├── accounts/[id]/     — GET (detail + contacts/assets/invoices), PATCH (update)
│   │   ├── invoices/          — GET (list), POST (create)
│   │   ├── invoices/[id]/     — GET (detail + line items), PATCH (update)
│   │   ├── resellers/         — GET (list + user counts), POST (create)
│   │   ├── resellers/[id]/    — GET (detail + users), PATCH (update)
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
│   │   ├── AppShell.tsx       — Root layout, view routing, code splitting
│   │   ├── Sidebar.tsx        — Navigation with collapsible submenus
│   │   └── UserMenu.tsx       — User profile, add user modal, logout
│   ├── views/
│   │   ├── DashboardView.tsx  — Landing page, quick actions, recent accounts
│   │   ├── AccountsView.tsx   — Account list with filters, search, export
│   │   ├── AccountDetailView.tsx — Account detail (info, contacts, invoices, assets)
│   │   ├── CreateAccountView.tsx — New account + contact form
│   │   ├── InvoiceView.tsx    — AI chat invoice assistant
│   │   ├── InvoiceDetailView.tsx — Invoice detail orchestrator
│   │   ├── CreateInvoiceView.tsx — New invoice from account context
│   │   ├── DraftInvoicesView.tsx — Invoice list with filters, sort, search
│   │   ├── ReportsView.tsx    — AI chat for reports
│   │   ├── CouponsView.tsx    — Coupon list
│   │   ├── CreateCouponView.tsx — Coupon creation form
│   │   ├── CouponDetailView.tsx — Coupon detail with restrictions
│   │   ├── ResellerManagementView.tsx — Partner grid + detail + users
│   │   ├── PartnerResourcesView.tsx — External resource links
│   │   └── LoginView.tsx      — Auth screen
│   ├── invoice/               — InvoiceDetailView sub-components
│   │   ├── InvoiceHeader.tsx
│   │   ├── InvoiceLineItems.tsx
│   │   ├── InvoicePurchaseOrder.tsx
│   │   ├── InvoiceSendTo.tsx
│   │   └── InvoiceCoupon.tsx
│   ├── Pagination.tsx         — Shared pagination with sliding window
│   ├── SKUBuilder.tsx         — Product SKU wizard modal
│   └── AssetDetailModal.tsx   — Asset + QLM key details modal
│
├── lib/
│   ├── store.ts               — Zustand state (user, view, messages, selections)
│   ├── types.ts               — TypeScript interfaces (permissions, chat, Zoho)
│   ├── zoho.ts                — MCP client, tool mapping, pagination helpers
│   ├── zoho-mcp-auth.ts       — MCP endpoint configuration
│   ├── auth.ts                — User CRUD, JWT, password reset, seeding
│   ├── db.ts                  — PostgreSQL schema, connection pool
│   ├── api-auth.ts            — JWT cookie auth middleware for API routes
│   ├── api-response.ts        — Standardized API response helpers
│   ├── cache.ts               — Redis caching with graceful fallback
│   ├── validation.ts          — Zod schemas for input validation
│   ├── constants.ts           — Centralized constants (IDs, regions, currencies)
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
