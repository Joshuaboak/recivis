/**
 * support/links.ts — the pages the support assistant is allowed to link to.
 *
 * "Go to Accounts" is a worse answer than a link that takes them to Accounts,
 * so the assistant is told to link every page it names. That only works if the
 * paths it emits are real: a made-up link is worse than no link, because it
 * looks authoritative and lands on a 404.
 *
 * So the catalogue is derived from routes.ts rather than typed out here. A
 * route that is renamed or removed changes this list with it, and the model is
 * given the list verbatim with an instruction to use nothing else.
 *
 * Detail routes are excluded on purpose. The assistant has no data access, so
 * it cannot know a record id, and a link to `/accounts/[id]` is a broken link.
 * It tells them what to open instead.
 */

import { ROUTES } from '@/lib/routes';
import type { UserPermissions } from '@/lib/types';

export interface LinkablePage {
  path: string;
  title: string;
  /** Permission the sidebar requires to show this page, if any. */
  requires?: keyof UserPermissions;
}

/**
 * Pages hidden from the sidebar unless a permission is held. Linking somebody
 * to a page their own nav does not show is a dead end, so these drop out of
 * the catalogue for anybody who cannot reach them.
 */
const GATED: Record<string, keyof UserPermissions> = {
  '/assets/subscriptions': 'canMonthlySubscriptions',
  '/partners/reports': 'canViewReports',
};

/**
 * Pages that only work when you arrive from somewhere else. New Order reads
 * the customer you came from and bounces back to Accounts without one, so a
 * link to it is a link to a spinner.
 */
const NEEDS_CONTEXT = new Set<string>(['/orders/new']);

/** Every list/landing page in the portal, in sidebar-ish order. */
export const LINKABLE_PAGES: LinkablePage[] = ROUTES
  .filter(route => !route.needsId && !NEEDS_CONTEXT.has(route.path))
  .map(route => ({
    path: route.path,
    title: route.title,
    ...(GATED[route.path] ? { requires: GATED[route.path] } : {}),
  }));

/** The subset this user can actually reach. */
export function linkablePagesFor(permissions: UserPermissions): LinkablePage[] {
  return LINKABLE_PAGES.filter(page => !page.requires || permissions[page.requires] === true);
}

/** The catalogue as prompt text, one page per line. */
export function linkCatalogueAsPrompt(permissions: UserPermissions): string {
  return linkablePagesFor(permissions)
    .map(page => `- ${page.title}: ${page.path}`)
    .join('\n');
}
