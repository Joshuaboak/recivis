/**
 * Tests for the tenant boundary.
 *
 * Zoho sees one identity for every user, so these rules are the only thing
 * separating one partner's records from another's. Each case here is a leak if
 * it ever flips.
 */
import { describe, it, expect } from 'vitest';
import { MODULE_SCOPES, scopeForModule, recordInScope } from '@/lib/tenant-scope';

const user = { allowedResellerIds: ['res-1', 'res-2'] };

describe('scopeForModule', () => {
  it('allows the modules the assistant works with', () => {
    expect(scopeForModule('Accounts')).toEqual({ kind: 'reseller-lookup' });
    expect(scopeForModule('Invoices')).toEqual({ kind: 'reseller-lookup' });
    expect(scopeForModule('Assets1')).toEqual({ kind: 'reseller-lookup' });
    expect(scopeForModule('Products')).toEqual({ kind: 'catalogue' });
  });

  it('refuses modules nobody has decided how to scope', () => {
    expect(scopeForModule('Users')).toBeUndefined();
    expect(scopeForModule('Deals')).toBeUndefined();
    expect(scopeForModule('Quotes')).toBeUndefined();
    expect(scopeForModule('')).toBeUndefined();
  });

  it('refuses Contacts, which carry no Reseller field to scope on', () => {
    expect(scopeForModule('Contacts')).toBeUndefined();
  });
});

describe('recordInScope — reseller-lookup modules', () => {
  const scope = MODULE_SCOPES.Invoices;

  it('admits a record belonging to the caller', () => {
    expect(recordInScope(user, scope, { Reseller: { id: 'res-1' } })).toBe(true);
  });

  it('rejects a record belonging to another partner', () => {
    expect(recordInScope(user, scope, { Reseller: { id: 'res-9' } })).toBe(false);
  });

  it('rejects a record with no reseller set — unproven is denied', () => {
    expect(recordInScope(user, scope, { Reseller: null })).toBe(false);
    expect(recordInScope(user, scope, {})).toBe(false);
  });

  it('rejects a reseller lookup with no id', () => {
    expect(recordInScope(user, scope, { Reseller: { name: 'Somebody' } })).toBe(false);
  });

  it('admits records for any reseller the caller may see, not just the first', () => {
    expect(recordInScope(user, scope, { Reseller: { id: 'res-2' } })).toBe(true);
  });
});

describe('recordInScope — the Resellers module scopes on its own id', () => {
  const scope = MODULE_SCOPES.Resellers;

  it('admits the caller own partner record', () => {
    expect(recordInScope(user, scope, { id: 'res-1' })).toBe(true);
  });

  it('rejects another partner record', () => {
    expect(recordInScope(user, scope, { id: 'res-9' })).toBe(false);
  });

  it('does not fall through to a Reseller field on this module', () => {
    // A Resellers record carrying a Reseller lookup must not be admitted by it.
    expect(recordInScope(user, scope, { id: 'res-9', Reseller: { id: 'res-1' } })).toBe(false);
  });
});

describe('recordInScope — catalogue modules', () => {
  it('admits shared reference data', () => {
    expect(recordInScope(user, MODULE_SCOPES.Products, { id: 'prod-1' })).toBe(true);
  });
});

describe('recordInScope — a caller scoped to nothing sees nothing', () => {
  const noAccess = { allowedResellerIds: [] as string[] };

  it('rejects reseller-owned records', () => {
    expect(recordInScope(noAccess, MODULE_SCOPES.Accounts, { Reseller: { id: 'res-1' } })).toBe(false);
  });

  it('rejects partner records', () => {
    expect(recordInScope(noAccess, MODULE_SCOPES.Resellers, { id: 'res-1' })).toBe(false);
  });
});
