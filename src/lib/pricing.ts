/**
 * pricing.ts — what a line on an order costs.
 *
 * Three facts the arithmetic follows from, none of them guessable from the
 * numbers alone:
 *
 * 1. **Every price in Zoho is in AUD.** AUD is the CRM's home currency, so a
 *    product's `Unit_Price` is its customer list price in AUD — including on
 *    the region-specific SKUs. Those differ from each other (ANZ 2995, EU 1325)
 *    because CSA sells for different amounts in different regions, not because
 *    some of them are already converted. Reading a regional price as
 *    "already local" would leave EU orders billed at the AUD figure.
 *
 * 2. **The exchange rate comes from the CRM**, via /api/currencies, and is the
 *    amount of the target currency one Australian dollar buys. So the local
 *    price is the AUD price multiplied by the rate.
 *
 * 3. **The reseller's cut only applies when the reseller is the buyer.** On an
 *    order addressed to the end customer the customer pays list. On one
 *    addressed to the partner, they pay list less their commission, which is
 *    what `Reseller_Sale` on their record holds.
 *
 * Order matters: convert first, then discount. Discounting first and converting
 * after gives the same answer for a single line, but the list price shown
 * beside it would be in the wrong currency.
 */

/** Money is rounded to cents once, at the end, not at each step. */
function toCents(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/**
 * An AUD amount in another currency.
 *
 * A missing or nonsensical rate returns the AUD figure unchanged rather than
 * zero: showing the un-converted price is visibly wrong and gets questioned,
 * where a zero looks like a free licence.
 */
export function convertFromAud(audAmount: number, rate: number | null | undefined): number {
  if (!Number.isFinite(audAmount)) return 0;
  if (rate == null || !Number.isFinite(rate) || rate <= 0) return toCents(audAmount);
  return toCents(audAmount * rate);
}

/**
 * What the reseller pays: the list price less their commission.
 *
 * `resellerPercentage` is a percentage as stored — 40 means 40%, and the
 * reseller pays the other 60%. A percentage at or above 100 would price the
 * licence at nothing or less, so it is refused and list is returned; a partner
 * agreement that says 100% is a data problem, not a free order.
 */
export function applyResellerShare(
  listAmount: number,
  resellerPercentage: number | null | undefined
): number {
  if (!Number.isFinite(listAmount)) return 0;
  if (resellerPercentage == null || !Number.isFinite(resellerPercentage)) return toCents(listAmount);
  if (resellerPercentage <= 0 || resellerPercentage >= 100) return toCents(listAmount);
  return toCents(listAmount * (100 - resellerPercentage) / 100);
}

/** Everything a line's price is worked out from. */
export interface LinePriceInputs {
  /** The product's Unit_Price from Zoho, which is in AUD. */
  audListPrice: number;
  /** Target-currency-per-AUD, from /api/currencies. Null for AUD orders. */
  rate: number | null | undefined;
  /** The partner's commission, as stored on their record (40 = 40%). */
  resellerPercentage: number | null | undefined;
  /** Whether the order is addressed to the partner rather than the customer. */
  resellerDirect: boolean;
}

/** What a line's price and its list price are, in the order's currency. */
export interface LinePrice {
  /** What goes on the line. */
  price: number;
  /** The customer list price in the same currency, for the "less commission" note. */
  listPrice: number;
  /** The commission actually applied, or null when none was. */
  appliedPercentage: number | null;
}

/**
 * The price for one line, in the order's currency.
 *
 * Convert, then discount if the partner is the buyer. Both figures come back
 * because the UI shows the list price beside the discounted one, and computing
 * that separately is how the two drift apart.
 */
export function orderLinePrice(inputs: LinePriceInputs): LinePrice {
  const listPrice = convertFromAud(inputs.audListPrice, inputs.rate);
  if (!inputs.resellerDirect) {
    return { price: listPrice, listPrice, appliedPercentage: null };
  }
  const price = applyResellerShare(listPrice, inputs.resellerPercentage);
  return {
    price,
    listPrice,
    appliedPercentage: price === listPrice ? null : Number(inputs.resellerPercentage),
  };
}

/** The rate for a currency out of the /api/currencies list. */
export function rateFor(
  currencies: Array<{ code: string; rate: number }>,
  currency: string
): number | null {
  if (!currency || currency === 'AUD') return 1;
  return currencies.find(c => c.code === currency)?.rate ?? null;
}

/**
 * Whether Zoho should pro-rate this line across its dates.
 *
 * `Contract_Term_Years` is not a count of years. It is the pro-ration switch,
 * and it reads backwards from what the name suggests:
 *
 * - **1 — pro-rate across the dates, on an annual basis.** The price sent is
 *   the annual one and the CRM works out the period. This is the normal case,
 *   including a full year, where pro-rating changes nothing.
 * - **0 — do not pro-rate; bill List_Price exactly as sent.** Only for a figure
 *   that is already final: one a user typed, or one off a purchase order.
 *
 * The portal had this from the wrong end. It set 0 whenever the price differed
 * from the product's Unit_Price — and the reseller discount makes it differ on
 * every partner order, so pro-ration was switched off across the board and a
 * co-term would have been billed as a full year. A discounted price is still a
 * calculated price; only a hand-typed one is final.
 */
export const PRORATE_ACROSS_DATES = 1;
export const BILL_PRICE_AS_GIVEN = 0;

export function contractTermYears(priceWasTypedByHand: boolean): number {
  return priceWasTypedByHand ? BILL_PRICE_AS_GIVEN : PRORATE_ACROSS_DATES;
}
