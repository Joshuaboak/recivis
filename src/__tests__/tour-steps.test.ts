/**
 * Tests for the tour's step list, permission filtering and path matching.
 *
 * The tour navigates between routes and anchors to elements by attribute, so
 * a step pointing at a path that does not exist, or an anchor nothing carries,
 * is a tour that silently stalls or skips. These catch both — and catch a step
 * that would walk somebody up to a button their permissions do not give them.
 */
import { describe, it, expect } from 'vitest';
import {
  ALL_TOUR_STEPS,
  tourStepsFor,
  stepsForPath,
  pathMatches,
  indexOfStep,
  isDirectPath,
} from '@/lib/tour/steps';
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
    maxEvaluationsPerAccount: 0,
    canExtendEvaluations: false,
    canDirectCustomerComms: false,
    canMonthlySubscriptions: false,
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
  canExtendEvaluations: true,
  canDirectCustomerComms: true,
  canMonthlySubscriptions: true,
});

describe('step definitions', () => {
  it('gives every step a unique id', () => {
    const ids = ALL_TOUR_STEPS.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('points every step at a route that exists', () => {
    const patterns = new Set<string>(ROUTES.map(r => r.path));
    for (const step of ALL_TOUR_STEPS) {
      expect(patterns.has(step.path), `${step.id} points at ${step.path}`).toBe(true);
    }
  });

  it('gives an advanceOnClick step something to click', () => {
    for (const step of ALL_TOUR_STEPS) {
      if (step.advanceOnClick) expect(step.anchor).toBeTruthy();
    }
  });

  it('gives an advanceOnClick step somewhere to skip to', () => {
    // Without it, a partner with an empty list has no way past the step.
    for (const step of ALL_TOUR_STEPS) {
      if (step.advanceOnClick) expect(step.skipTo, `${step.id} has no skipTo`).toBeTruthy();
    }
  });

  it('only skips to steps that exist', () => {
    const ids = new Set(ALL_TOUR_STEPS.map(s => s.id));
    for (const step of ALL_TOUR_STEPS) {
      if (step.skipTo) expect(ids.has(step.skipTo), `${step.id} skips to ${step.skipTo}`).toBe(true);
    }
  });

  it('never skips backwards', () => {
    for (const step of ALL_TOUR_STEPS) {
      if (!step.skipTo) continue;
      const from = indexOfStep(ALL_TOUR_STEPS, step.id);
      const to = indexOfStep(ALL_TOUR_STEPS, step.skipTo);
      expect(to).toBeGreaterThan(from);
    }
  });

  it('reaches a detail page only from a step that asks for a click', () => {
    // Nothing can navigate to /accounts/[id] on its own — the id comes from
    // the user opening a record.
    ALL_TOUR_STEPS.forEach((step, i) => {
      if (isDirectPath(step.path)) return;
      const previous = ALL_TOUR_STEPS[i - 1];
      const arrivedByClick = previous?.advanceOnClick || !isDirectPath(previous?.path ?? '');
      expect(arrivedByClick, `${step.id} is unreachable`).toBe(true);
    });
  });

  it('starts on the dashboard, where a new user lands', () => {
    expect(ALL_TOUR_STEPS[0].path).toBe('/dashboard');
  });

  it('covers every part of the portal', () => {
    const ids = ALL_TOUR_STEPS.map(s => s.id);
    for (const expected of [
      'leads-search', 'lead-form', 'lead-convert',
      'accounts-search', 'account-create', 'account-contacts', 'account-add-contact',
      'account-new-order', 'account-assets',
      'orders-search', 'order-po', 'order-send-to', 'order-actions',
      'assets-search', 'assets-renewals',
      'order-assistant', 'coupons', 'reports-dashboard', 'partner-reports',
      'partners', 'support-launcher', 'finish',
    ]) {
      expect(ids, `tour never covers ${expected}`).toContain(expected);
    }
  });
});

describe('tourStepsFor', () => {
  it('drops steps for buttons this person does not have', () => {
    const ids = tourStepsFor(permissions()).map(s => s.id);
    expect(ids).not.toContain('account-new-subscription');
    expect(ids).not.toContain('account-new-order');
    expect(ids).not.toContain('partner-reports');
    expect(ids).not.toContain('order-po');
  });

  it('keeps the steps anybody can use', () => {
    const ids = tourStepsFor(permissions()).map(s => s.id);
    expect(ids).toContain('welcome');
    expect(ids).toContain('accounts-search');
    expect(ids).toContain('finish');
  });

  it('gives somebody with every permission the whole tour', () => {
    expect(tourStepsFor(everything)).toHaveLength(ALL_TOUR_STEPS.length);
  });

  it('adds a step back once the permission is held', () => {
    const before = tourStepsFor(permissions()).map(s => s.id);
    const after = tourStepsFor(permissions({ canMonthlySubscriptions: true })).map(s => s.id);
    expect(before).not.toContain('account-new-subscription');
    expect(after).toContain('account-new-subscription');
  });

  it('keeps the order of the full list', () => {
    const filtered = tourStepsFor(permissions()).map(s => s.id);
    const expected = ALL_TOUR_STEPS.filter(s => filtered.includes(s.id)).map(s => s.id);
    expect(filtered).toEqual(expected);
  });

  it('falls back to the ungated steps when permissions are unknown', () => {
    const ids = tourStepsFor(null).map(s => s.id);
    expect(ids).toContain('welcome');
    expect(ids).not.toContain('order-po');
  });

  it('still ends on the finish step for everyone', () => {
    for (const perms of [permissions(), everything, permissions({ canViewReports: true })]) {
      const filtered = tourStepsFor(perms);
      expect(filtered[filtered.length - 1].id).toBe('finish');
    }
  });
});

describe('pathMatches', () => {
  it('matches an exact path', () => {
    expect(pathMatches('/dashboard', '/dashboard')).toBe(true);
    expect(pathMatches('/dashboard', '/accounts')).toBe(false);
  });

  it('treats [id] as any single segment', () => {
    expect(pathMatches('/accounts/[id]', '/accounts/55779000002948830')).toBe(true);
    expect(pathMatches('/accounts/[id]', '/accounts/demo-account-1')).toBe(true);
  });

  it('does not let [id] swallow extra segments', () => {
    expect(pathMatches('/accounts/[id]', '/accounts/123/edit')).toBe(false);
    expect(pathMatches('/accounts/[id]', '/accounts')).toBe(false);
  });

  it('ignores a trailing slash', () => {
    expect(pathMatches('/accounts', '/accounts/')).toBe(true);
  });
});

describe('stepsForPath', () => {
  it('returns the steps belonging to a page', () => {
    const ids = stepsForPath(ALL_TOUR_STEPS, '/dashboard').map(s => s.id);
    expect(ids).toContain('welcome');
    expect(ids).not.toContain('accounts-search');
  });

  it('resolves detail-page steps for any record id', () => {
    const ids = stepsForPath(ALL_TOUR_STEPS, '/accounts/demo-account-1').map(s => s.id);
    expect(ids).toContain('account-orders');
  });

  it('respects the filtered list it is given', () => {
    const filtered = tourStepsFor(permissions());
    const ids = stepsForPath(filtered, '/accounts/demo-account-1').map(s => s.id);
    expect(ids).not.toContain('account-new-order');
  });
});

describe('indexOfStep', () => {
  it('finds a known step', () => {
    expect(indexOfStep(ALL_TOUR_STEPS, 'welcome')).toBe(0);
  });

  it('reports an unknown step as -1, so a stale saved position is ignored', () => {
    expect(indexOfStep(ALL_TOUR_STEPS, 'a-step-that-was-removed')).toBe(-1);
  });

  it('numbers a step against the tour this person is being shown', () => {
    // The counter in the popover is index + 1 of the filtered list, which is
    // what makes "Step 7 of 31" true rather than a count of somebody else's.
    const filtered = tourStepsFor(permissions());
    expect(indexOfStep(filtered, 'finish')).toBe(filtered.length - 1);
  });
});
