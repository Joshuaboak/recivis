/**
 * Tests for the guard behind reassigning an order to another reseller.
 *
 * `canManageReseller` decides both who may open an order and, since the PATCH
 * route started accepting `Reseller`, who it may be handed to. Getting the
 * second one wrong moves real money: the commission and the bill follow the
 * reseller on the record. A distributor must reach its own children and
 * nothing else.
 */
import { describe, it, expect, vi } from 'vitest';

// api-auth pulls in the Postgres pool at import time; the guards under test are
// pure and never touch it.
vi.mock('@/lib/db', () => ({ query: vi.fn(), initDB: vi.fn() }));

const { canManageReseller, isAdmin } = await import('@/lib/api-auth');
type AuthUser = Parameters<typeof canManageReseller>[0];

/** A user shaped like the real one, with only the fields these guards read. */
function userWith(role: string, allowedResellerIds: string[]): AuthUser {
  return { role, allowedResellerIds } as AuthUser;
}

// A distributor's allowed set is its own id followed by its active children,
// which is what auth.ts builds on login.
const distributor = userWith('standard', ['dist-1', 'child-1', 'child-2']);
const plainReseller = userWith('standard', ['res-9']);
const admin = userWith('admin', []);
const ibm = userWith('ibm', []);

describe('canManageReseller — order reassignment', () => {
  it('lets a distributor assign an order to itself', () => {
    expect(canManageReseller(distributor, 'dist-1')).toBe(true);
  });

  it('lets a distributor assign an order to any of its children', () => {
    expect(canManageReseller(distributor, 'child-1')).toBe(true);
    expect(canManageReseller(distributor, 'child-2')).toBe(true);
  });

  it('refuses a reseller that is not under the distributor', () => {
    expect(canManageReseller(distributor, 'someone-else')).toBe(false);
  });

  it('refuses a child of a different distributor', () => {
    expect(canManageReseller(distributor, 'res-9')).toBe(false);
  });

  it('gives a plain reseller nowhere to move an order to but itself', () => {
    expect(canManageReseller(plainReseller, 'res-9')).toBe(true);
    expect(canManageReseller(plainReseller, 'dist-1')).toBe(false);
    expect(canManageReseller(plainReseller, 'child-1')).toBe(false);
  });

  it('lets CSA staff assign an order to any reseller', () => {
    expect(canManageReseller(admin, 'dist-1')).toBe(true);
    expect(canManageReseller(admin, 'child-1')).toBe(true);
    expect(canManageReseller(ibm, 'anything-at-all')).toBe(true);
  });

  it('refuses everything when the allowed set is empty and the user is not staff', () => {
    expect(canManageReseller(userWith('standard', []), 'dist-1')).toBe(false);
  });

  it('treats admin and ibm as staff, and nothing else', () => {
    expect(isAdmin(admin)).toBe(true);
    expect(isAdmin(ibm)).toBe(true);
    expect(isAdmin(distributor)).toBe(false);
    expect(isAdmin(userWith('viewer', []))).toBe(false);
  });
});
