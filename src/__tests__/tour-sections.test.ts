/**
 * Tests for the tutorial's sections.
 *
 * The tutorial is now per page: a section offers itself when its route is
 * opened, and the help icon replays it. That makes two things load-bearing —
 * a section's path has to be a real route, or it never fires, and a section
 * has to disappear entirely when its steps are all filtered away, or the help
 * icon promises an explanation it cannot give.
 */
import { describe, it, expect } from 'vitest';
import {
  ALL_SECTIONS,
  sectionsFor,
  sectionForPath,
  pathMatches,
} from '@/lib/tour/sections';
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
    canAccessCrm: false,
    ...overrides,
  };
}

const everything = permissions({
  canCreateInvoices: true,
  canApproveInvoices: true,
  canSendInvoices: true,
  canViewAllRecords: true,
  canViewChildRecords: true,
  canModifyPrices: true,
  canUploadPO: true,
  canManageUsers: true,
  canViewReports: true,
  canExportData: true,
  canCreateEvaluations: true,
  canConvertLeads: true,
  canExtendEvaluations: true,
  canDirectCustomerComms: true,
  canMonthlySubscriptions: true,
});

describe('section definitions', () => {
  it('gives every section a unique id', () => {
    const ids = ALL_SECTIONS.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every step an id unique within its section', () => {
    for (const section of ALL_SECTIONS) {
      const ids = section.steps.map(s => s.id);
      expect(new Set(ids).size, `duplicate step id in ${section.id}`).toBe(ids.length);
    }
  });

  it('points every section at a route that exists', () => {
    const paths = new Set<string>(ROUTES.map(r => r.path));
    for (const section of ALL_SECTIONS) {
      expect(paths.has(section.path), `${section.id} points at ${section.path}`).toBe(true);
    }
  });

  it('covers one route at most once', () => {
    // Two sections on one path would race: whichever matched first would win
    // and the other would never be reachable, icon included.
    const paths = ALL_SECTIONS.map(s => s.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('gives every section at least one step', () => {
    for (const section of ALL_SECTIONS) {
      expect(section.steps.length, `${section.id} has no steps`).toBeGreaterThan(0);
    }
  });

  /**
   * A section that could resolve to nothing is a help icon that does nothing.
   *
   * Steps marked `onlyIfPresent` are dropped when their target is not on the
   * page, so a section made entirely of them can empty itself out. Every
   * section needs at least one step that is always there to carry it.
   */
  it('always has something to say', () => {
    for (const section of ALL_SECTIONS) {
      const unconditional = section.steps.filter(step => !step.onlyIfPresent);
      expect(
        unconditional.length,
        `every step in "${section.id}" is conditional, so it can open empty`
      ).toBeGreaterThan(0);
    }
  });

  /**
   * Steps stay short.
   *
   * The tutorial is read standing in front of the thing it describes, so a
   * step is a caption, not a paragraph — and length is the one part of that
   * a test can hold. A step built as a definition list is allowed more room,
   * because its bulk is structure rather than prose.
   */
  it('keeps every step to a caption', () => {
    for (const section of ALL_SECTIONS) {
      for (const step of section.steps) {
        const plain = step.body.replace(/<[^>]+>/g, '');
        const limit = step.body.includes('<br>') ? 400 : 260;
        expect(
          plain.length,
          `${section.id}/${step.id} runs to ${plain.length} characters`
        ).toBeLessThanOrEqual(limit);
        expect(
          step.title.length,
          `${section.id}/${step.id} has a long title`
        ).toBeLessThanOrEqual(60);
      }
    }
  });

  it('says something in every step', () => {
    for (const section of ALL_SECTIONS) {
      for (const step of section.steps) {
        expect(step.title.trim().length).toBeGreaterThan(0);
        expect(step.body.trim().length, `${section.id}/${step.id} is too short`).toBeGreaterThan(40);
      }
    }
  });

  it('explains the pages a partner actually opens', () => {
    const ids = ALL_SECTIONS.map(s => s.id);
    for (const expected of [
      'dashboard', 'leads', 'lead-create', 'lead-detail',
      'accounts', 'account-create', 'account-detail',
      'orders', 'order-detail', 'assets', 'assets-renewals',
      'order-assistant', 'coupons', 'reports', 'partners',
    ]) {
      expect(ids, `nothing explains ${expected}`).toContain(expected);
    }
  });

  it('introduces the header controls somewhere', () => {
    // Search, recent items, notifications and the help icon are on every page
    // and belong to no section in particular, so the dashboard covers them.
    const dashboard = ALL_SECTIONS.find(s => s.id === 'dashboard');
    const anchors = dashboard?.steps.map(s => s.anchor);
    expect(anchors).toContain('header-search');
    expect(anchors).toContain('header-recent');
    expect(anchors).toContain('header-notifications');
    expect(anchors).toContain('header-help');
  });
});

describe('sectionsFor', () => {
  it('drops steps for buttons this person does not have', () => {
    const account = sectionsFor(permissions()).find(s => s.id === 'account-detail');
    const stepIds = account?.steps.map(s => s.id) ?? [];
    expect(stepIds).toContain('contacts');
    expect(stepIds).not.toContain('new-order');
    expect(stepIds).not.toContain('subscriptions');
  });

  it('drops a whole section when its permission is missing', () => {
    const ids = sectionsFor(permissions()).map(s => s.id);
    expect(ids).not.toContain('assets-subscriptions');
    expect(ids).not.toContain('partner-reports');
    expect(ids).not.toContain('order-assistant');
  });

  it('drops a section whose every step was filtered away', () => {
    // Nothing should survive as an empty shell: the help icon renders when a
    // section exists, and an empty one would open on nothing.
    for (const section of sectionsFor(permissions())) {
      expect(section.steps.length, `${section.id} is empty`).toBeGreaterThan(0);
    }
  });

  it('gives somebody with every permission every section', () => {
    expect(sectionsFor(everything)).toHaveLength(ALL_SECTIONS.length);
  });

  it('brings a section back once the permission is held', () => {
    const before = sectionsFor(permissions()).map(s => s.id);
    const after = sectionsFor(permissions({ canMonthlySubscriptions: true })).map(s => s.id);
    expect(before).not.toContain('assets-subscriptions');
    expect(after).toContain('assets-subscriptions');
  });

  it('keeps the dashboard for everyone', () => {
    expect(sectionsFor(permissions()).map(s => s.id)).toContain('dashboard');
    expect(sectionsFor(null).map(s => s.id)).toContain('dashboard');
  });
});

describe('sectionForPath', () => {
  it('finds the section explaining a page', () => {
    expect(sectionForPath('/orders', everything)?.id).toBe('orders');
    expect(sectionForPath('/dashboard', everything)?.id).toBe('dashboard');
  });

  it('resolves a record page for any id', () => {
    expect(sectionForPath('/accounts/55779000002948830', everything)?.id).toBe('account-detail');
  });

  it('does not mistake a page for a record', () => {
    expect(sectionForPath('/accounts/new', everything)?.id).toBe('account-create');
    expect(sectionForPath('/leads/new', everything)?.id).toBe('lead-create');
  });

  it('returns nothing for a page with no section', () => {
    expect(sectionForPath('/orders/new', everything)).toBeUndefined();
  });

  it('respects permissions, so the help icon cannot promise nothing', () => {
    expect(sectionForPath('/partners/reports', permissions())).toBeUndefined();
    expect(sectionForPath('/partners/reports', everything)?.id).toBe('partner-reports');
  });
});

describe('pathMatches', () => {
  it('matches an exact path', () => {
    expect(pathMatches('/dashboard', '/dashboard')).toBe(true);
    expect(pathMatches('/dashboard', '/accounts')).toBe(false);
  });

  it('treats [id] as any single segment', () => {
    expect(pathMatches('/accounts/[id]', '/accounts/55779000002948830')).toBe(true);
  });

  it('does not let [id] swallow a real page', () => {
    expect(pathMatches('/leads/[id]', '/leads/new')).toBe(false);
    expect(pathMatches('/accounts/[id]', '/accounts/new')).toBe(false);
  });

  it('does not let [id] swallow extra segments', () => {
    expect(pathMatches('/accounts/[id]', '/accounts/123/edit')).toBe(false);
    expect(pathMatches('/accounts/[id]', '/accounts')).toBe(false);
  });

  it('ignores a trailing slash', () => {
    expect(pathMatches('/accounts', '/accounts/')).toBe(true);
  });
});
