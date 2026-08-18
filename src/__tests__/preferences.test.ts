/**
 * Tests for the user-preference contract.
 * The storage layer needs a database; what is pinned here is the part that
 * decides what gets written and what a user gets before choosing anything.
 */
import { describe, it, expect } from 'vitest';
import { DEFAULT_PREFERENCES, isPreferenceName } from '@/lib/preferences';

describe('isPreferenceName', () => {
  it('accepts preferences this build knows', () => {
    expect(isPreferenceName('guidedTutorial')).toBe(true);
  });

  it('rejects anything else, so a typo cannot write a row nothing reads', () => {
    expect(isPreferenceName('guided_tutorial')).toBe(false);
    expect(isPreferenceName('canApproveInvoices')).toBe(false);
    expect(isPreferenceName('__proto__')).toBe(false);
    expect(isPreferenceName('')).toBe(false);
  });
});

describe('DEFAULT_PREFERENCES', () => {
  it('offers the tutorial to someone who has never set anything', () => {
    // Whoever has expressed no preference is most likely the person the
    // tutorial exists for.
    expect(DEFAULT_PREFERENCES.guidedTutorial).toBe(true);
  });
});
