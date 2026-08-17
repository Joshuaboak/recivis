/**
 * Tests for the monthly subscription model.
 * The renewal date rule and the reseller price are the two pieces of
 * arithmetic partners are billed on, so both are pinned here.
 */
import { describe, it, expect } from 'vitest';
import {
  buildMonthlySku,
  findMonthlyProduct,
  monthlyListPrice,
  resellerPrice,
  renewalDates,
  addDays,
  MONTHLY_PRODUCTS,
} from '@/lib/subscriptions';

describe('buildMonthlySku', () => {
  it('builds a commercial cloud subscription SKU', () => {
    expect(buildMonthlySku('CSD', 'AU')).toBe('CSD-SU-CL-COM-1YR-SUB-ANZ');
  });

  it('folds New Zealand into the ANZ price list', () => {
    expect(buildMonthlySku('STR', 'NZ')).toBe('STR-SU-CL-COM-1YR-SUB-ANZ');
  });

  it('passes through regions that map to themselves', () => {
    expect(buildMonthlySku('CEZ', 'NA')).toBe('CEZ-SU-CL-COM-1YR-SUB-NA');
  });
});

describe('monthlyListPrice', () => {
  it('returns the standard price when no plan is requested', () => {
    const csd = findMonthlyProduct('CSD')!;
    expect(monthlyListPrice(csd, false)).toBe(60);
  });

  it('returns the plan price for Civil Site Design', () => {
    const csd = findMonthlyProduct('CSD')!;
    expect(monthlyListPrice(csd, true)).toBe(140);
  });

  it('refuses the perpetual plan for products that do not offer it', () => {
    const stringer = findMonthlyProduct('STR')!;
    expect(monthlyListPrice(stringer, true)).toBeNull();
  });

  it('offers the plan on Civil Site Design only', () => {
    const withPlan = MONTHLY_PRODUCTS.filter(p => p.perpetualUsdPrice != null).map(p => p.code);
    expect(withPlan).toEqual(['CSD']);
  });
});

describe('resellerPrice', () => {
  it('discounts list by the reseller commission', () => {
    expect(resellerPrice(60, 30)).toBe(42);
  });

  it('charges full list when the reseller earns nothing', () => {
    expect(resellerPrice(60, 0)).toBe(60);
  });

  it('handles fractional commissions to two places', () => {
    expect(resellerPrice(60, 33.3)).toBe(40.02);
  });
});

describe('addDays', () => {
  it('crosses a month boundary', () => {
    expect(addDays('2026-01-28', 30)).toBe('2026-02-27');
  });
});

describe('renewalDates', () => {
  it('extends an in-date subscription from its existing renewal date', () => {
    const result = renewalDates('2026-09-10', '2026-09-01');
    expect(result.renewalDate).toBe('2026-10-10');
    // The period just paid for ended on the old renewal date.
    expect(result.lastRenewalTransaction).toBe('2026-09-10');
  });

  it('extends a lapsed subscription from today, not from the stale date', () => {
    const result = renewalDates('2026-07-15', '2026-09-01');
    expect(result.renewalDate).toBe('2026-10-01');
    expect(result.lastRenewalTransaction).toBe('2026-09-01');
  });

  it('treats a subscription renewing today as lapsed', () => {
    const result = renewalDates('2026-09-01', '2026-09-01');
    expect(result.renewalDate).toBe('2026-10-01');
    expect(result.lastRenewalTransaction).toBe('2026-09-01');
  });

  it('handles a subscription with no renewal date at all', () => {
    const result = renewalDates(null, '2026-09-01');
    expect(result.renewalDate).toBe('2026-10-01');
    expect(result.lastRenewalTransaction).toBe('2026-09-01');
  });
});
