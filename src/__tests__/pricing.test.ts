/**
 * Tests for order line pricing.
 *
 * Every case here is money on a real invoice. The two failure modes that
 * matter: reading an AUD regional price as though it were already local (which
 * bills an EU customer the AUD figure), and getting the pro-ration switch
 * backwards (which bills a 22-day co-term as a full year, or a hand-agreed
 * figure pro-rated down to a fraction of itself).
 *
 * The numbers are the live ones: AUD is base, EUR 0.6, USD 0.66, INR 54.88,
 * and Example Reseller is on 40%.
 */
import { describe, it, expect } from 'vitest';
import {
  convertFromAud,
  applyResellerShare,
  orderLinePrice,
  rateFor,
  contractTermYears,
  PRORATE_ACROSS_DATES,
  BILL_PRICE_AS_GIVEN,
} from '@/lib/pricing';

const RATES = [
  { code: 'AUD', rate: 1 },
  { code: 'USD', rate: 0.66 },
  { code: 'EUR', rate: 0.6 },
  { code: 'INR', rate: 54.88 },
];

describe('convertFromAud', () => {
  it('multiplies by the rate, which is target-per-AUD', () => {
    expect(convertFromAud(100, 0.6)).toBe(60);
    expect(convertFromAud(1325, 0.6)).toBe(795);
    expect(convertFromAud(2995, 0.66)).toBe(1976.7);
  });

  it('leaves an AUD amount alone', () => {
    expect(convertFromAud(2995, 1)).toBe(2995);
  });

  it('rounds to cents', () => {
    expect(convertFromAud(1325, 0.66)).toBe(874.5);
    expect(convertFromAud(999.99, 54.88)).toBe(54879.45);
  });

  it('returns the AUD figure when there is no usable rate', () => {
    // Visibly wrong and gets questioned; a zero looks like a free licence.
    expect(convertFromAud(1325, null)).toBe(1325);
    expect(convertFromAud(1325, 0)).toBe(1325);
    expect(convertFromAud(1325, -1)).toBe(1325);
    expect(convertFromAud(1325, undefined)).toBe(1325);
  });
});

describe('applyResellerShare', () => {
  it('leaves the reseller paying list less commission', () => {
    expect(applyResellerShare(100, 40)).toBe(60);
    expect(applyResellerShare(795, 40)).toBe(477);
    expect(applyResellerShare(50, 10)).toBe(45);
  });

  it('charges list when there is no commission', () => {
    expect(applyResellerShare(795, 0)).toBe(795);
    expect(applyResellerShare(795, null)).toBe(795);
  });

  it('refuses a percentage that would price the licence at nothing', () => {
    // A 100% agreement is a data problem, not a free order.
    expect(applyResellerShare(795, 100)).toBe(795);
    expect(applyResellerShare(795, 140)).toBe(795);
  });
});

describe('orderLinePrice', () => {
  const euReseller = { audListPrice: 1325, rate: 0.6, resellerPercentage: 40 };

  it('converts then discounts, for an order addressed to the partner', () => {
    // 1325 AUD → €795 list → €477 at 40% commission.
    expect(orderLinePrice({ ...euReseller, resellerDirect: true })).toEqual({
      price: 477,
      listPrice: 795,
      appliedPercentage: 40,
    });
  });

  it('charges the customer list price when the order goes to the customer', () => {
    expect(orderLinePrice({ ...euReseller, resellerDirect: false })).toEqual({
      price: 795,
      listPrice: 795,
      appliedPercentage: null,
    });
  });

  it('reports the list price in the order currency, not in AUD', () => {
    // The "less commission" note sits beside the price and has to agree with it.
    const { listPrice } = orderLinePrice({ ...euReseller, resellerDirect: true });
    expect(listPrice).not.toBe(1325);
    expect(listPrice).toBe(795);
  });

  it('handles an AUD order with no conversion', () => {
    expect(
      orderLinePrice({ audListPrice: 2995, rate: 1, resellerPercentage: 40, resellerDirect: true })
    ).toMatchObject({ price: 1797, listPrice: 2995 });
  });

  it('reports no commission applied when none changed the price', () => {
    expect(
      orderLinePrice({ audListPrice: 1325, rate: 0.6, resellerPercentage: 0, resellerDirect: true })
        .appliedPercentage
    ).toBeNull();
  });
});

describe('rateFor', () => {
  it('finds the rate for a currency', () => {
    expect(rateFor(RATES, 'EUR')).toBe(0.6);
    expect(rateFor(RATES, 'INR')).toBe(54.88);
  });

  it('treats AUD as 1 without needing the list', () => {
    expect(rateFor([], 'AUD')).toBe(1);
    expect(rateFor([], '')).toBe(1);
  });

  it('returns null for a currency with no rate, rather than guessing 1', () => {
    // GBP and NZD are not in the CRM. Silently treating them as 1:1 with AUD
    // is how an order gets billed in the wrong currency at the wrong number.
    expect(rateFor(RATES, 'GBP')).toBeNull();
    expect(rateFor(RATES, 'NZD')).toBeNull();
  });
});

describe('contractTermYears', () => {
  it('pro-rates unless the price was typed by hand', () => {
    expect(contractTermYears(false)).toBe(PRORATE_ACROSS_DATES);
    expect(contractTermYears(false)).toBe(1);
  });

  it('takes a hand-typed price exactly as given', () => {
    expect(contractTermYears(true)).toBe(BILL_PRICE_AS_GIVEN);
    expect(contractTermYears(true)).toBe(0);
  });

  it('does not treat a discounted price as hand-typed', () => {
    // The reseller discount is calculated, so it still pro-rates. Inferring
    // "hand-typed" from "differs from Unit_Price" switched pro-ration off on
    // every partner order.
    const discounted = orderLinePrice({
      audListPrice: 1325, rate: 0.6, resellerPercentage: 40, resellerDirect: true,
    });
    expect(discounted.price).not.toBe(discounted.listPrice);
    expect(contractTermYears(false)).toBe(1);
  });
});
