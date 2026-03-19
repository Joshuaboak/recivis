/**
 * Application-wide constants for ReCivis.
 *
 * Centralizes hardcoded values (IDs, URLs, defaults) so they can be
 * imported from a single source of truth instead of scattered across files.
 */

// ============================================================
// CSA Identity — Zoho CRM and internal database identifiers
// ============================================================

/** Internal PostgreSQL reseller ID for Civil Survey Applications staff accounts. */
export const CSA_INTERNAL_ID = 'csa-internal';

/** Zoho CRM record ID for the CSA reseller record. */
export const CSA_ZOHO_ID = '55779000000560184';

/** CSA Zoho organisation ID, used in CRM URLs. */
export const CSA_ORG_ID = '7002802215';

/** Base URL for linking to CSA's Zoho CRM instance (org7002802215). */
export const CRM_BASE_URL = 'https://crm.zoho.com.au/crm/org7002802215';

// ============================================================
// Region labels — human-readable names for region codes
// ============================================================

/** Maps two-letter region codes to their display labels. */
export const REGION_LABELS: Record<string, string> = {
  AU: 'Australia',
  EU: 'Europe',
  NA: 'North America',
  AS: 'Asia',
  NZ: 'New Zealand',
  WW: 'Worldwide',
  AF: 'Africa',
};

// ============================================================
// Currencies and partner categories
// ============================================================

/** Supported invoice currencies. */
export const CURRENCIES = ['AUD', 'USD', 'EUR', 'INR', 'GBP', 'NZD'] as const;

/** Valid partner category values in Zoho CRM. */
export const PARTNER_CATEGORIES = [
  'Reseller',
  'Distributor',
  'Distributor/Reseller',
  'Affiliate',
  'Platinum Partner',
] as const;

// ============================================================
// Pagination and API limits
// ============================================================

/**
 * Maximum number of Zoho pages to fetch when auto-paginating.
 * At 200 records per page, this caps at 2000 records.
 */
export const MAX_ZOHO_PAGES = 10;

/**
 * Default items-per-page for each list view.
 * Used by frontend components and API routes for consistent pagination.
 */
export const ITEMS_PER_PAGE = {
  leads: 50,
  accounts: 50,
  invoices: 50,
  assets: 20,
  contacts: 10,
  users: 10,
  coupons: 20,
  resellers: 24,
} as const;

// ============================================================
// Chat
// ============================================================

/**
 * Maximum number of chat messages retained in the Zustand store.
 * Older messages are trimmed to prevent memory bloat in long sessions.
 */
export const CHAT_MESSAGE_LIMIT = 25;
