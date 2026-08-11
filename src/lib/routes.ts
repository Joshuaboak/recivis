/**
 * routes.ts — Single source of truth for the portal's URL scheme.
 *
 * Every path string in the app comes from here. Nothing else may hardcode
 * a portal path: pages take their title from `getRouteTitle`, the header
 * resolves its title from `usePathname()`, middleware redirects using
 * `LOGIN_PATH` / `DEFAULT_PORTAL_PATH`, and navigation builds URLs with
 * `buildPath`.
 *
 * `legacyViewId` is the old `currentView` string union from store.ts. It
 * exists so the migration can map both ways while views still drive
 * themselves off the store. Phase B removes `currentView`; at that point
 * `legacyViewId` can be dropped from this table.
 */

/** One entry in the portal URL table. */
export interface RouteDef {
  /** URL pattern. A `[id]` segment matches any single non-empty segment. */
  path: string;
  /** The `currentView` id this route replaces. */
  legacyViewId: string;
  /** Title shown in the app header and used as the document title. */
  title: string;
  /** True when `path` contains an `[id]` segment. */
  needsId: boolean;
}

/** The complete portal URL table. Order is significant only for readability. */
export const ROUTES = [
  { path: '/dashboard', legacyViewId: 'dashboard', title: 'Dashboard', needsId: false },
  { path: '/leads', legacyViewId: 'leads', title: 'Leads', needsId: false },
  { path: '/leads/new', legacyViewId: 'create-lead', title: 'Create Lead', needsId: false },
  { path: '/leads/[id]', legacyViewId: 'lead-detail', title: 'Lead', needsId: true },
  { path: '/leads/[id]/edit', legacyViewId: 'lead-edit', title: 'Edit Lead', needsId: true },
  { path: '/accounts', legacyViewId: 'accounts', title: 'Accounts', needsId: false },
  { path: '/accounts/new', legacyViewId: 'create-account', title: 'Create Account', needsId: false },
  { path: '/accounts/[id]', legacyViewId: 'account-detail', title: 'Account', needsId: true },
  { path: '/accounts/[id]/edit', legacyViewId: 'account-edit', title: 'Edit Account', needsId: true },
  { path: '/orders', legacyViewId: 'draft-invoices', title: 'Existing Orders', needsId: false },
  { path: '/orders/new', legacyViewId: 'create-invoice', title: 'New Order', needsId: false },
  { path: '/orders/[id]', legacyViewId: 'invoice-detail', title: 'Order', needsId: true },
  { path: '/orders/[id]/edit', legacyViewId: 'invoice-edit', title: 'Edit Order', needsId: true },
  { path: '/order-assistant', legacyViewId: 'invoice', title: 'Order Assistant', needsId: false },
  { path: '/coupons', legacyViewId: 'coupons', title: 'Coupons', needsId: false },
  { path: '/coupons/new', legacyViewId: 'create-coupon', title: 'Create Coupon', needsId: false },
  { path: '/coupons/[id]', legacyViewId: 'coupon-detail', title: 'Coupon', needsId: true },
  { path: '/coupons/[id]/edit', legacyViewId: 'coupon-edit', title: 'Edit Coupon', needsId: true },
  { path: '/reports', legacyViewId: 'reports', title: 'AI Reports', needsId: false },
  { path: '/reports/dashboard', legacyViewId: 'reports-dashboard', title: 'Reports Dashboard', needsId: false },
  { path: '/partners', legacyViewId: 'resellers', title: 'Partners', needsId: false },
  { path: '/partners/[id]', legacyViewId: 'reseller-detail', title: 'Partner', needsId: true },
  { path: '/partners/[id]/edit', legacyViewId: 'reseller-edit-route', title: 'Edit Partner', needsId: true },
  { path: '/partner-resources', legacyViewId: 'partner-resources', title: 'Partner Resources', needsId: false },
] as const satisfies readonly RouteDef[];

/** The legacy `currentView` ids covered by the table. */
export type LegacyViewId = (typeof ROUTES)[number]['legacyViewId'];

/** The login screen. Lives outside the portal route group. */
export const LOGIN_PATH = '/login';

/** Where an authenticated user lands when no specific destination is known. */
export const DEFAULT_PORTAL_PATH = '/dashboard';

/** Header title used when a pathname matches no known route. */
const FALLBACK_TITLE = 'Partner Portal';

/** Strip a trailing slash so `/leads/` and `/leads` resolve identically. */
function normalize(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) return pathname.slice(0, -1);
  return pathname;
}

/**
 * Find the route matching a concrete pathname (e.g. `/leads/12345`).
 * Static paths win over dynamic ones, so `/leads/new` never matches `/leads/[id]`.
 */
export function matchRoute(pathname: string): RouteDef | undefined {
  const path = normalize(pathname);

  const exact = ROUTES.find((route) => route.path === path);
  if (exact) return exact;

  const segments = path.split('/');
  return ROUTES.find((route) => {
    if (!route.needsId) return false;
    const pattern = route.path.split('/');
    if (pattern.length !== segments.length) return false;
    return pattern.every((part, i) =>
      part === '[id]' ? segments[i].length > 0 : part === segments[i]
    );
  });
}

/** Header/document title for a pathname, falling back to the app name. */
export function getRouteTitle(pathname: string): string {
  return matchRoute(pathname)?.title ?? FALLBACK_TITLE;
}

/** The record id embedded in a pathname, or null for routes without one. */
export function getRouteId(pathname: string): string | null {
  const path = normalize(pathname);
  const route = matchRoute(path);
  if (!route?.needsId) return null;
  const index = route.path.split('/').indexOf('[id]');
  return path.split('/')[index] ?? null;
}

/**
 * Build a concrete URL for a view. Throws when a detail route is asked for
 * without an id — that is always a caller bug, not a runtime condition.
 */
export function buildPath(legacyViewId: LegacyViewId, id?: string): string {
  const route = ROUTES.find((r) => r.legacyViewId === legacyViewId);
  if (!route) throw new Error(`buildPath: unknown view "${legacyViewId}"`);
  if (!route.needsId) return route.path;
  if (!id) throw new Error(`buildPath: view "${legacyViewId}" requires a record id`);
  return route.path.replace('[id]', encodeURIComponent(id));
}
