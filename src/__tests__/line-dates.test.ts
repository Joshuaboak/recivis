/**
 * Tests for order line dates.
 *
 * The case that prompted these: a purchase order reading "end date: 26.08.2027"
 * produced an order whose renewal date was today, and it was created without
 * complaint. A renewal date equal to the start date is not an edge case, it is
 * what a failed date extraction looks like, so it is refused rather than
 * discouraged.
 */
import { describe, it, expect } from 'vitest';
import {
  YEAR_DAYS,
  defaultRenewalDate,
  lineDateProblem,
  orderDateProblem,
} from '@/lib/line-dates';

describe('defaultRenewalDate', () => {
  it('is the start date plus 364 days, because the start day counts', () => {
    expect(YEAR_DAYS).toBe(364);
    expect(defaultRenewalDate('2026-08-27')).toBe('2027-08-26');
  });

  it('crosses a leap day without drifting', () => {
    // 2028 is a leap year: 364 days from 2027-03-01 lands on 2028-02-28.
    expect(defaultRenewalDate('2027-03-01')).toBe('2028-02-28');
  });

  it('returns nothing for a date it cannot read', () => {
    expect(defaultRenewalDate('')).toBe('');
    expect(defaultRenewalDate('not a date')).toBe('');
  });
});

describe('lineDateProblem', () => {
  it('accepts a normal year', () => {
    expect(lineDateProblem({ Start_Date: '2026-08-27', Renewal_Date: '2027-08-26' })).toBeNull();
  });

  it('accepts a short period, which is what a co-term is', () => {
    expect(lineDateProblem({ Start_Date: '2026-08-27', Renewal_Date: '2026-09-18' })).toBeNull();
  });

  it('refuses a licence that expires the day it starts', () => {
    const problem = lineDateProblem({ Start_Date: '2026-08-27', Renewal_Date: '2026-08-27' });
    expect(problem).toContain('expire on the day it starts');
  });

  it('refuses a renewal date before the start date', () => {
    expect(lineDateProblem({ Start_Date: '2026-08-27', Renewal_Date: '2026-01-01' }))
      .toContain('before the start date');
  });

  it('allows a missing date, which the CRM fills with a sane default', () => {
    expect(lineDateProblem({ Start_Date: '2026-08-27' })).toBeNull();
    expect(lineDateProblem({ Renewal_Date: '2027-08-26' })).toBeNull();
    expect(lineDateProblem({})).toBeNull();
  });

  it('reads a timestamp as the date part of it', () => {
    expect(lineDateProblem({
      Start_Date: '2026-08-27T00:00:00+10:00',
      Renewal_Date: '2026-08-27T00:00:00+10:00',
    })).toContain('expire on the day it starts');
  });
});

describe('orderDateProblem', () => {
  const good = { Start_Date: '2026-08-27', Renewal_Date: '2027-08-26' };
  const sameDay = {
    Product_Name: { name: 'Civil Site Design' },
    Start_Date: '2026-08-27',
    Renewal_Date: '2026-08-27',
  };

  it('passes an order whose lines all describe a period', () => {
    expect(orderDateProblem([good, good])).toBeNull();
  });

  it('names the product on the line that is wrong', () => {
    const problem = orderDateProblem([good, sameDay]);
    expect(problem).toContain('Civil Site Design');
    expect(problem).toContain('364');
  });

  it('falls back to the line number when there is no product name', () => {
    expect(orderDateProblem([{ Start_Date: '2026-08-27', Renewal_Date: '2026-08-27' }]))
      .toContain('line 1');
  });

  it('ignores lines being deleted, which carry no dates worth checking', () => {
    expect(orderDateProblem([{ ...sameDay, _delete: true }])).toBeNull();
    expect(orderDateProblem([{ ...sameDay, _deleted: true }])).toBeNull();
  });

  it('passes an empty or absent list', () => {
    expect(orderDateProblem([])).toBeNull();
    expect(orderDateProblem(undefined)).toBeNull();
  });
});
