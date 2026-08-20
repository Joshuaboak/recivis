/**
 * Tests for the support assistant's link catalogue.
 *
 * The assistant is told to link only what is in this list, so a path in here
 * that no longer exists becomes a confident link to a 404, and a page that
 * should be permission-gated becomes a link into a dead end.
 */
import { describe, it, expect } from 'vitest';
import { LINKABLE_PAGES, linkablePagesFor, linkCatalogueAsPrompt } from '@/lib/support/links';
import { ROUTES } from '@/lib/routes';
import type { UserPermissions } from '@/lib/types';

function permissions(overrides: Partial<UserPermissions> = {}): UserPermissions {
  return {
    canCreateInvoices: false,
    canApproveInvoices: false,
    canSendInvoices: false,
    canViewAllRecords: false,
    canViewChildRecords: false,
    canModifyPrices: false,
    canUploadPO: false,
    canManageUsers: false,
    canViewReports: false,
    canExportData: false,
    canCreateEvaluations: false,
    canConvertLeads: false,
    maxEvaluationsPerAccount: 0,
    canExtendEvaluations: false,
    canDirectCustomerComms: false,
    canMonthlySubscriptions: false,
    ...overrides,
  };
}

describe('link catalogue', () => {
  it('only offers paths that exist in the route table', () => {
    const known = new Set<string>(ROUTES.map(r => r.path));
    for (const page of LINKABLE_PAGES) {
      expect(known.has(page.path), `${page.path} is not a route`).toBe(true);
    }
  });

  it('never offers a detail route, since the assistant cannot know a record id', () => {
    for (const page of LINKABLE_PAGES) {
      expect(page.path).not.toContain('[id]');
    }
  });

  it('leaves out pages that only work when you arrive from a record', () => {
    // New Order needs the customer you came from; on its own it redirects.
    expect(LINKABLE_PAGES.map(p => p.path)).not.toContain('/orders/new');
  });

  it('covers the pages partners are sent to most', () => {
    const paths = LINKABLE_PAGES.map(p => p.path);
    for (const expected of ['/accounts', '/orders', '/assets', '/assets/renewals', '/dashboard']) {
      expect(paths).toContain(expected);
    }
  });
});

describe('linkablePagesFor', () => {
  it('hides monthly subscriptions from a partner without the permission', () => {
    const paths = linkablePagesFor(permissions()).map(p => p.path);
    expect(paths).not.toContain('/assets/subscriptions');
  });

  it('offers monthly subscriptions once the permission is held', () => {
    const paths = linkablePagesFor(permissions({ canMonthlySubscriptions: true })).map(p => p.path);
    expect(paths).toContain('/assets/subscriptions');
  });

  it('hides partner reports from a partner who cannot view reports', () => {
    const paths = linkablePagesFor(permissions()).map(p => p.path);
    expect(paths).not.toContain('/partners/reports');
    expect(paths).toContain('/partners');
  });
});

describe('linkCatalogueAsPrompt', () => {
  it('lists one page per line as title and path', () => {
    const lines = linkCatalogueAsPrompt(permissions()).split('\n');
    expect(lines).toContain('- Accounts: /accounts');
    expect(lines.every(line => line.startsWith('- '))).toBe(true);
  });
});
