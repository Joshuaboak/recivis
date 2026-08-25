/**
 * Tests for the shared record-access guards.
 *
 * These are the checks the REST routes rely on, and the failure mode is silent:
 * a guard that returns the wrong answer does not throw, it just serves one
 * partner another partner's customers. Each case here is a leak if it flips.
 *
 * Only the synchronous half is covered. `recordIsVisible` and friends reach
 * Zoho, so they belong to a fixture-backed suite rather than a unit test; the
 * decision they delegate to is `recordInScope`, which tenant-scope.test.ts
 * covers directly.
 */
import { describe, it, expect, vi } from 'vitest';

// The module graph under record-access pulls in the Zoho transport and the
// Postgres pool. Neither is needed for the pure guards, and importing them for
// real would open a database connection during the test run.
vi.mock('@/lib/zoho', () => ({ executeZohoTool: vi.fn() }));
vi.mock('@/lib/db', () => ({ query: vi.fn(), initDB: vi.fn() }));

const { requirePartnerScope, resellerScopeCriteria, filterToScope, NOT_YOURS } =
  await import('@/lib/record-access');
type AuthUser = Parameters<typeof requirePartnerScope>[0];

/** A user shaped like the real one, with only the fields these guards read. */
function userWith(role: string, allowedResellerIds: string[]): AuthUser {
  return { role, allowedResellerIds } as AuthUser;
}

const reseller = userWith('standard', ['res-1']);
const distributor = userWith('manager', ['res-1', 'res-2']);
const orphan = userWith('standard', []);
const admin = userWith('admin', []);
const ibm = userWith('ibm', []);

describe('requirePartnerScope', () => {
  it('lets a partner-scoped user through', () => {
    expect(requirePartnerScope(reseller)).toBeNull();
    expect(requirePartnerScope(distributor)).toBeNull();
  });

  it('lets CSA roles through with no partner of their own', () => {
    expect(requirePartnerScope(admin)).toBeNull();
    expect(requirePartnerScope(ibm)).toBeNull();
  });

  it('refuses a non-CSA user scoped to no partner', () => {
    const denied = requirePartnerScope(orphan);
    expect(denied).not.toBeNull();
    expect(denied!.status).toBe(403);
  });
});

describe('resellerScopeCriteria', () => {
  it('returns null for CSA roles, meaning no filter', () => {
    expect(resellerScopeCriteria(admin)).toBeNull();
    expect(resellerScopeCriteria(ibm)).toBeNull();
  });

  it('filters to the one partner a reseller may see', () => {
    expect(resellerScopeCriteria(reseller)).toBe('(Reseller:equals:res-1)');
  });

  it('ors together every partner a distributor may see', () => {
    expect(resellerScopeCriteria(distributor)).toBe(
      '((Reseller:equals:res-1)or(Reseller:equals:res-2))'
    );
  });

  it('returns the empty string — not null — for a user scoped to nothing', () => {
    // The distinction is the whole point: null means "no filter needed", and
    // returning it here would have meant every record in the CRM.
    expect(resellerScopeCriteria(orphan)).toBe('');
  });
});

describe('filterToScope', () => {
  const mine = { id: '1', Reseller: { id: 'res-1' } };
  const childs = { id: '2', Reseller: { id: 'res-2' } };
  const strangers = { id: '3', Reseller: { id: 'res-9' } };
  const unowned = { id: '4' };

  it('keeps only the caller’s own records', () => {
    expect(filterToScope(reseller, 'Accounts', [mine, childs, strangers])).toEqual([mine]);
  });

  it('keeps child records for a distributor', () => {
    expect(filterToScope(distributor, 'Leads', [mine, childs, strangers])).toEqual([mine, childs]);
  });

  it('keeps everything for CSA roles', () => {
    expect(filterToScope(admin, 'Accounts', [mine, strangers])).toHaveLength(2);
    expect(filterToScope(ibm, 'Accounts', [mine, strangers])).toHaveLength(2);
  });

  it('drops a record with no partner on it rather than treating it as public', () => {
    expect(filterToScope(reseller, 'Accounts', [unowned])).toEqual([]);
  });

  it('drops everything for a module nobody has scoped', () => {
    expect(filterToScope(reseller, 'Deals', [mine])).toEqual([]);
  });

  it('passes shared catalogue data through', () => {
    const product = { id: 'p1', Product_Name: 'Civil Site Design' };
    expect(filterToScope(reseller, 'Products', [product])).toEqual([product]);
  });

  it('gives a user scoped to nothing nothing', () => {
    expect(filterToScope(orphan, 'Accounts', [mine, childs, strangers])).toEqual([]);
  });
});

describe('NOT_YOURS', () => {
  it('names no record, so it cannot confirm one exists', () => {
    expect(NOT_YOURS).toBe('Sorry, this customer is assigned to another partner.');
  });
});
