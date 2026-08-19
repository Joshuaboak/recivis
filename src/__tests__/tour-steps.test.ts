/**
 * Tests for the tour's step list and path matching.
 *
 * The tour navigates between routes and anchors to elements by attribute, so
 * a step pointing at a path that does not exist, or an anchor nothing carries,
 * is a tour that silently stalls or skips. These catch both.
 */
import { describe, it, expect } from 'vitest';
import { TOUR_STEPS, stepsForPath, pathMatches, indexOfStep } from '@/lib/tour/steps';
import { ROUTES } from '@/lib/routes';

describe('step definitions', () => {
  it('gives every step a unique id', () => {
    const ids = TOUR_STEPS.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('points every step at a route that exists', () => {
    const patterns = new Set<string>(ROUTES.map(r => r.path));
    for (const step of TOUR_STEPS) {
      expect(patterns.has(step.path)).toBe(true);
    }
  });

  it('points every nextPath at a route that exists', () => {
    const patterns = new Set<string>(ROUTES.map(r => r.path));
    for (const step of TOUR_STEPS) {
      if (step.nextPath) expect(patterns.has(step.nextPath)).toBe(true);
    }
  });

  it('gives an advanceOnClick step something to click', () => {
    for (const step of TOUR_STEPS) {
      if (step.advanceOnClick) expect(step.anchor).toBeTruthy();
    }
  });

  it('starts on the dashboard, where a new user lands', () => {
    expect(TOUR_STEPS[0].path).toBe('/dashboard');
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
    const ids = stepsForPath('/dashboard').map(s => s.id);
    expect(ids).toContain('welcome');
    expect(ids).not.toContain('accounts-search');
  });

  it('resolves detail-page steps for any record id', () => {
    const ids = stepsForPath('/accounts/demo-account-1').map(s => s.id);
    expect(ids).toContain('account-orders');
  });

  it('returns nothing for a page the tour does not cover', () => {
    expect(stepsForPath('/coupons')).toEqual([]);
  });
});

describe('indexOfStep', () => {
  it('finds a known step', () => {
    expect(indexOfStep('welcome')).toBe(0);
  });

  it('reports an unknown step as -1, so a stale saved position is ignored', () => {
    expect(indexOfStep('a-step-that-was-removed')).toBe(-1);
  });
});
