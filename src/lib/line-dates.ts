/**
 * line-dates.ts — the dates on an order line have to describe a period.
 *
 * A licence that expires the day it starts is not a licence, and a renewal date
 * equal to today is the signature of a date nobody read: it is what you get when
 * something failed to find a date and filled the field in anyway. A purchase
 * order carrying "end date: 26.08.2027" produced exactly that, and the order was
 * created without complaint.
 *
 * So the rule is enforced where orders are written rather than only asked for in
 * a prompt. Prompts are guidance; this is arithmetic, and arithmetic can be
 * checked.
 */

/** A term of one year, counted the way the portal counts it. */
export const YEAR_DAYS = 364;

/**
 * The default end date for a term starting on `startDate`.
 *
 * 364 days, not 365 and not calendar-year arithmetic: the start day is the
 * first day of the term, so a year runs to start + 364.
 */
export function defaultRenewalDate(startDate: string): string {
  const start = new Date(`${startDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return '';
  start.setUTCDate(start.getUTCDate() + YEAR_DAYS);
  return start.toISOString().slice(0, 10);
}

/**
 * Why this line's dates cannot be right, or null when they can.
 *
 * Only the impossible is refused. A short period is legitimate — that is what a
 * co-term is — so the test is that the term has any length at all, not that it
 * looks like a year.
 */
export function lineDateProblem(line: {
  Start_Date?: unknown;
  Renewal_Date?: unknown;
}): string | null {
  const start = typeof line.Start_Date === 'string' ? line.Start_Date.slice(0, 10) : '';
  const renewal = typeof line.Renewal_Date === 'string' ? line.Renewal_Date.slice(0, 10) : '';

  // Either date absent is fine: the CRM fills a missing start with today and a
  // missing renewal with a year out, which are both defensible defaults.
  if (!start || !renewal) return null;

  if (renewal === start) {
    return 'the licence would expire on the day it starts';
  }
  if (renewal < start) {
    return 'the renewal date is before the start date';
  }
  return null;
}

/**
 * Check every line on an order, and name the first that cannot be right.
 *
 * Reports the line by product name where there is one, because "line 3" means
 * little to somebody looking at an order that came from a purchase order.
 */
export function orderDateProblem(
  lineItems: Array<Record<string, unknown>> | undefined
): string | null {
  for (const [index, line] of (lineItems || []).entries()) {
    // A deletion carries no dates worth checking.
    if (line._delete || line._deleted) continue;
    const problem = lineDateProblem(line);
    if (!problem) continue;
    const product =
      (line.Product_Name as { name?: string } | null)?.name || `line ${index + 1}`;
    return `Check the dates on ${product}: ${problem}. Set a renewal date after the start date — a year is the start date plus ${YEAR_DAYS} days.`;
  }
  return null;
}
