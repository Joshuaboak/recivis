# Civil Survey Applications — Partner Portal

Invoice, licence, and account management portal for Civil Survey Applications' global partner network.

Built with Next.js 16, React 19, PostgreSQL, Redis, and Zoho CRM.

---

## Features

### Accounts
- Browse, search, and filter customer accounts
- Create accounts with primary contacts and duplicate detection
- View account details with contacts, invoices, and assets
- Edit address, reseller assignment, primary/secondary contacts
- XLSX export (accounts + contacts + assets)

### Invoices
- Create new product invoices with SKU builder
- Generate renewal invoices from active assets
- Edit invoice dates, currency, line items, and pricing
- Apply discount coupons with automatic restriction validation
- PO number management and document attachment
- Customer communication preference (direct to customer or via reseller)
- Approve, send, and lock workflows
- Sortable, filterable invoice list with XLSX export

### Assets & Licences
- View active and archived assets per account
- Asset detail modal with QLM licence key details
- Edit renewal dates (auto-activates if future date)
- Deactivate licences with confirmation
- Renewal eligibility rules (excludes upgraded, revoked, eval, edu, NFR, home use)

### Partners
- Manage reseller/distributor organizations
- View and edit partner details (region, currency, category, commercial terms)
- Create new partners
- User management per partner (create, edit roles, reset passwords, activate/deactivate)
- Partner resources page (marketing, YouTube guides, support links)

### Coupons
- Create percentage or fixed-amount discount coupons
- Restrictions: region, partner, product, order type, date range, usage limits, order value
- Apply coupons to invoices with full restriction validation

### Reporting & Export
- AI chat assistant for reports (expiring assets, approved invoices, drafts)
- XLSX export on all list views with filter context
- Account-level multi-sheet exports

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.1.6 (App Router, Turbopack) |
| UI | React 19, Tailwind CSS 4, Framer Motion |
| State | Zustand (persisted to localStorage) |
| Database | PostgreSQL |
| Cache | Redis (optional, graceful fallback) |
| CRM | Zoho CRM (.com.au) via MCP + REST API |
| Auth | JWT (HTTP-only cookies), bcrypt |
| Validation | Zod |
| Export | SheetJS (xlsx) |
| Testing | Vitest |
| Icons | Lucide React |
| Deployment | Railway (Docker) |

---

## Getting Started

### Prerequisites
- Node.js 20+
- PostgreSQL database
- Zoho CRM MCP endpoint (preauthorized)
- Zoho API key

### Setup

```bash
git clone https://github.com/Joshuaboak/recivis.git
cd recivis
npm install
```

Create `.env.local`:

```env
# Required
DATABASE_URL=postgresql://user:pass@host:5432/dbname
ZOHO_MCP_URL=https://recivis-7006508204.zohomcp.com.au/mcp/<key>/message
ZOHO_API_KEY=your-zoho-api-key

# Optional
JWT_SECRET=your-jwt-secret
REDIS_URL=redis://host:6379
OPENROUTER_API_KEY=your-openrouter-key
NEXT_PUBLIC_APP_URL=http://localhost:3000
GOOGLE_SERVICE_ACCOUNT_KEY={"client_email":"...","private_key":"..."}
```

### Run

```bash
npm run dev       # Development server
npm run build     # Production build
npm start         # Start production server
npm test          # Run tests
npm run test:watch  # Tests in watch mode
```

The database schema is auto-created on first request via `/api/setup`.

---

## Architecture

```
Browser (React SPA)
    ↓ HTTP-only JWT cookie
Next.js API Routes
    ↓                    ↓                    ↓
PostgreSQL          Zoho CRM MCP         Zoho REST API
(users, roles,      (accounts,           (coupons, files,
 audit log)          invoices,            Deluge functions)
                     products)
    ↓
Redis (optional cache)
```

### Authentication
1. Login sets HTTP-only cookie with JWT (24h expiry)
2. All API routes verify the cookie via `requireAuth()`
3. RBAC checks enforce role-based permissions on write operations

### Permission Model
Three-tier intersection: `effective = user_role AND reseller_role`

| Role | Description |
|------|-------------|
| `admin` | Full access to everything |
| `ibm` | International Business Manager — full invoicing |
| `manager` | Reseller Manager — manage own org users |
| `standard` | Standard User — create invoices, upload POs |
| `viewer` | Read-only access |

---

## Project Structure

```
src/
├── app/api/          # 24 API route files (auth, CRUD, Zoho integration)
├── components/
│   ├── layout/       # AppShell, Sidebar, UserMenu
│   ├── views/        # 15 page-level components
│   ├── invoice/      # 5 InvoiceDetail sub-components
│   ├── Pagination.tsx, SKUBuilder.tsx, AssetDetailModal.tsx
├── lib/              # 16 utility modules (auth, DB, Zoho, cache, validation)
├── __tests__/        # 33 tests (validation, constants, cache)
└── public/           # CSA logo assets
```

See [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) for comprehensive technical documentation.

---

## Deployment

Deployed on Railway with auto-deploy on push to `master`.

```bash
git push origin master  # Triggers Railway build + deploy
```

### Environment Variables on Railway
Set all required env vars in the Railway project dashboard. The `ZOHO_MCP_URL` must be updated when the MCP key rotates.

---

## Testing

```bash
npm test  # 33 tests across validation, constants, and cache modules
```

---

## License

Proprietary — Civil Survey Applications Pty Ltd. All rights reserved.
