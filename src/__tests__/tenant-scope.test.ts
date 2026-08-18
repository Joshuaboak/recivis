/**
 * Tests for the tenant boundary.
 *
 * Zoho sees one identity for every user, so these rules are the only thing
 * separating one partner's records from another's. Each case here is a leak if
 * it ever flips.
 */
import { describe, it, expect } from 'vitest';
import {
  MODULE_SCOPES,
  WRITABLE_MODULES,
  scopeForModule,
  scopingAccountId,
  recordInScope,
} from '@/lib/tenant-scope';

const user = { allowedResellerIds: ['res-1', 'res-2'] };

describe('scopeForModule', () => {
  it('allows the modules the assistant works with', () => {
    expect(scopeForModule('Accounts')).toEqual({ kind: 'reseller-lookup' });
    expect(scopeForModule('Invoices')).toEqual({ kind: 'reseller-lookup' });
    expect(scopeForModule('Assets1')).toEqual({ kind: 'reseller-lookup' });
    expect(scopeForModule('Leads')).toEqual({ kind: 'reseller-lookup' });
    expect(scopeForModule('Products')).toEqual({ kind: 'catalogue' });
  });

  it('scopes Contacts through the account they belong to', () => {
    expect(scopeForModule('Contacts')).toEqual({ kind: 'via-account', accountField: 'Account_Name' });
  });

  it('refuses modules nobody has decided how to scope', () => {
    expect(scopeForModule('Users')).toBeUndefined();
    expect(scopeForModule('Deals')).toBeUndefined();
    expect(scopeForModule('Quotes')).toBeUndefined();
    expect(scopeForModule('')).toBeUndefined();
  });
});

describe('WRITABLE_MODULES', () => {
  it('lets the assistant author the records a partner works with', () => {
    for (const moduleName of ['Accounts', 'Contacts', 'Leads', 'Invoices']) {
      expect(WRITABLE_MODULES.has(moduleName)).toBe(true);
    }
  });

  it('keeps partner records and issued licences read-only', () => {
    // Resellers are administered by CSA; assets come from the licensing system.
    expect(WRITABLE_MODULES.has('Resellers')).toBe(false);
    expect(WRITABLE_MODULES.has('Assets1')).toBe(false);
    expect(WRITABLE_MODULES.has('Products')).toBe(false);
  });

  it('never lets a writable module escape the scope map', () => {
    for (const moduleName of WRITABLE_MODULES) {
      expect(scopeForModule(moduleName)).toBeDefined();
    }
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

describe('recordInScope — Contacts scope through their account', () => {
  const scope = MODULE_SCOPES.Contacts;
  const allowedAccounts = new Set(['acc-1']);

  it('reads the account id off the configured field', () => {
    expect(scopingAccountId(scope, { Account_Name: { id: 'acc-1' } })).toBe('acc-1');
    expect(scopingAccountId(scope, { Account_Name: null })).toBeNull();
  });

  it('admits a contact on an account the caller may see', () => {
    expect(recordInScope(user, scope, { Account_Name: { id: 'acc-1' } }, allowedAccounts)).toBe(true);
  });

  it('rejects a contact on someone else account', () => {
    expect(recordInScope(user, scope, { Account_Name: { id: 'acc-9' } }, allowedAccounts)).toBe(false);
  });

  it('rejects a contact attached to no account at all', () => {
    expect(recordInScope(user, scope, {}, allowedAccounts)).toBe(false);
  });

  it('fails closed when the caller forgot to resolve accounts', () => {
    // Omitting the resolved set must deny, never admit — a caller that skips
    // the lookup must not accidentally get everything.
    expect(recordInScope(user, scope, { Account_Name: { id: 'acc-1' } })).toBe(false);
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
