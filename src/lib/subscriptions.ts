/**
 * subscriptions.ts — Shared model for 30-day monthly subscription licences.
 *
 * A monthly subscription is an ordinary commercial cloud licence with a 30-day
 * renewal date rather than a yearly one — there is no monthly SKU in Zoho, so
 * the annual commercial cloud subscription product is used and the term comes
 * from `Renewal_Date`. The asset is marked with a Zoho tag so the portal can
 * find it again.
 *
 * Prices are quoted in USD. Every monthly deal runs through the reseller
 * model, so the reseller is charged list minus their commission and marks up
 * to the customer themselves.
 */

/** Zoho record tag applied to every monthly subscription asset. */
export const MONTHLY_SUBSCRIPTION_TAG = 'Monthly Subscription';

/** Additional tag for the Civil Site Design perpetual purchase plan. */
export const PERPETUAL_PLAN_TAG = 'Perpetual Purchase Plan';

/** A monthly subscription runs 30 days from creation and extends 30 at a time. */
export const SUBSCRIPTION_TERM_DAYS = 30;

/** A product that can be sold on a monthly subscription. */
export interface MonthlyProduct {
  /** SKU product code. */
  code: string;
  /** Display name. */
  label: string;
  /** Monthly list price in USD — what we recommend the reseller charges. */
  usdPrice: number;
  /**
   * Monthly list price in USD when bought on the perpetual purchase plan.
   * Only Civil Site Design offers this, so it is absent elsewhere and the
   * plan option is hidden.
   */
  perpetualUsdPrice?: number;
}

/**
 * The monthly line-up. Civil Site Design Plus is deliberately absent: it is a
 * computer-bound-only product with no cloud SKU, so it cannot be sold this way.
 */
export const MONTHLY_PRODUCTS: MonthlyProduct[] = [
  { code: 'CSD', label: 'Civil Site Design', usdPrice: 60, perpetualUsdPrice: 140 },
  { code: 'CEZ', label: 'Corridor EZ', usdPrice: 60 },
  { code: 'STR', label: 'Stringer', usdPrice: 30 },
];

/**
 * Reseller region code to SKU region segment. Matches SKUBuilder — New Zealand
 * buys on the ANZ price list, so both fold into ANZ.
 */
const SKU_REGION_MAP: Record<string, string> = {
  AU: 'ANZ', NZ: 'ANZ', AF: 'AF', AS: 'AS', EU: 'EU', NA: 'NA', WW: 'WW',
};

/** The SKU region segment for a reseller region code. */
export function skuRegion(region: string): string {
  return SKU_REGION_MAP[region] || region;
}

/**
 * The commercial cloud subscription SKU for a product in a region.
 *
 * Not every product exists in every region — Corridor EZ has no cloud SKU on
 * the ANZ price list, for one — so the caller must confirm the SKU resolves to
 * a real Zoho product before offering it.
 */
export function buildMonthlySku(productCode: string, region: string): string {
  return `${productCode}-SU-CL-COM-1YR-SUB-${skuRegion(region)}`;
}

/** Look up a product in the monthly line-up. */
export function findMonthlyProduct(code: string): MonthlyProduct | undefined {
  return MONTHLY_PRODUCTS.find(p => p.code === code);
}

/**
 * The USD list price for a product, taking the perpetual purchase plan into
 * account. Returns null when the plan is requested for a product that has no
 * plan price, so callers fail loudly rather than silently charging the
 * standard rate.
 */
export function monthlyListPrice(product: MonthlyProduct, perpetualPlan: boolean): number | null {
  if (!perpetualPlan) return product.usdPrice;
  return product.perpetualUsdPrice ?? null;
}

/**
 * What the reseller pays: list price less their commission. A reseller on 30%
 * pays 70% of list and keeps the difference when they bill the customer.
 */
export function resellerPrice(listPrice: number, resellerPercentage: number): number {
  const pct = Math.min(Math.max(resellerPercentage || 0, 0), 100);
  return Math.round(listPrice * (100 - pct)) / 100;
}

/** Today as YYYY-MM-DD, which is the format every Zoho date field wants. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Add whole days to a YYYY-MM-DD date and return the same format. */
export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Where a renewal lands, and what the transaction date becomes.
 *
 * A subscription still in date extends from its existing renewal date, so
 * billing stays on the same day of the month. One that has already lapsed
 * extends from today instead — adding 30 days to a date 45 days gone would
 * leave the licence expired and the customer still locked out.
 */
export function renewalDates(currentRenewal: string | null, today: string): {
  renewalDate: string;
  lastRenewalTransaction: string;
} {
  const inDate = !!currentRenewal && currentRenewal > today;
  return {
    renewalDate: addDays(inDate ? (currentRenewal as string) : today, SUBSCRIPTION_TERM_DAYS),
    // The transaction date records the period just paid for: the date the
    // licence ran to before this renewal, or today if it had already lapsed.
    lastRenewalTransaction: inDate ? (currentRenewal as string) : today,
  };
}
