/**
 * tenant-scope.ts — which partner's data a CRM record belongs to.
 *
 * Every AI tool call reaches Zoho through one shared MCP session with an
 * embedded API key (see zoho.ts), so the CRM sees a single identity and
 * provides no separation between partners. These rules are the entire tenant
 * boundary for anything that queries Zoho on a user's behalf.
 *
 * The module map is an allowlist on purpose. `executeZohoTool` passes
 * `args.module` straight through, so a module that is not named here is one
 * nobody has decided how to scope — and the safe answer to that is no.
 */

import type { AuthUser } from './api-auth';

export type ModuleScope =
  /** The record names its partner in a `Reseller` lookup. */
  | { kind: 'reseller-lookup' }
  /**
   * The record has no reseller of its own and inherits one from the account it
   * hangs off. Scoping it costs an extra lookup, so callers must resolve the
   * account first and pass the result in.
   */
  | { kind: 'via-account'; accountField: string }
  /** The record IS a partner, so its own id must be one the caller may see. */
  | { kind: 'self' }
  /** Shared reference data carrying no partner information. */
  | { kind: 'catalogue' };

export const MODULE_SCOPES: Record<string, ModuleScope> = {
  Accounts: { kind: 'reseller-lookup' },
  Invoices: { kind: 'reseller-lookup' },
  Assets1: { kind: 'reseller-lookup' },
  Leads: { kind: 'reseller-lookup' },
  // Contacts carry no Reseller field — only the account they belong to.
  Contacts: { kind: 'via-account', accountField: 'Account_Name' },
  Resellers: { kind: 'self' },
  Products: { kind: 'catalogue' },
};

/**
 * Modules that may be created or changed on a partner's behalf.
 *
 * Resellers and Assets1 are readable but not writable: partner records are
 * administered by CSA, and assets are issued by the licensing system rather
 * than authored. Products are a shared catalogue.
 */
export const WRITABLE_MODULES = new Set(['Invoices', 'Accounts', 'Contacts', 'Leads']);

/** The scope rule for a module, or undefined when the module is not allowed. */
export function scopeForModule(moduleName: string): ModuleScope | undefined {
  return MODULE_SCOPES[moduleName];
}

/**
 * The account a record is scoped through, for `via-account` modules.
 * Returns null for every other kind, and for a record with no account set.
 */
export function scopingAccountId(scope: ModuleScope, record: Record<string, unknown>): string | null {
  if (scope.kind !== 'via-account') return null;
  const account = record[scope.accountField] as { id?: string } | null | undefined;
  return account?.id || null;
}

/**
 * Whether one record belongs to a partner this caller may see.
 *
 * Anything that cannot be proven to belong to the caller returns false. A
 * record with no reseller set is not treated as public: it is treated as
 * unproven, which is the same thing as denied.
 *
 * `allowedAccountIds` carries the already-resolved accounts a caller may see,
 * and is required for `via-account` modules. Omitting it there denies rather
 * than admits, so a caller that forgets to resolve fails closed.
 */
export function recordInScope(
  user: Pick<AuthUser, 'allowedResellerIds'>,
  scope: ModuleScope,
  record: Record<string, unknown>,
  allowedAccountIds?: ReadonlySet<string>
): boolean {
  switch (scope.kind) {
    case 'catalogue':
      return true;
    case 'self':
      return typeof record.id === 'string' && user.allowedResellerIds.includes(record.id);
    case 'reseller-lookup': {
      const reseller = record.Reseller as { id?: string } | null | undefined;
      if (!reseller?.id) return false;
      return user.allowedResellerIds.includes(reseller.id);
    }
    case 'via-account': {
      const accountId = scopingAccountId(scope, record);
      if (!accountId || !allowedAccountIds) return false;
      return allowedAccountIds.has(accountId);
    }
  }
}
