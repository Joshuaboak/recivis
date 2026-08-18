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
  /** The record IS a partner, so its own id must be one the caller may see. */
  | { kind: 'self' }
  /** Shared reference data carrying no partner information. */
  | { kind: 'catalogue' };

/**
 * Contacts are deliberately absent: they carry no Reseller field, only an
 * Account_Name lookup, so a contact cannot be scoped without first resolving
 * its account. Callers reach them through related-record lookups on an account
 * that has already been cleared.
 */
export const MODULE_SCOPES: Record<string, ModuleScope> = {
  Accounts: { kind: 'reseller-lookup' },
  Invoices: { kind: 'reseller-lookup' },
  Assets1: { kind: 'reseller-lookup' },
  Leads: { kind: 'reseller-lookup' },
  Resellers: { kind: 'self' },
  Products: { kind: 'catalogue' },
};

/** The scope rule for a module, or undefined when the module is not allowed. */
export function scopeForModule(moduleName: string): ModuleScope | undefined {
  return MODULE_SCOPES[moduleName];
}

/**
 * Whether one record belongs to a partner this caller may see.
 *
 * Anything that cannot be proven to belong to the caller returns false. A
 * record with no reseller set is not treated as public: it is treated as
 * unproven, which is the same thing as denied.
 */
export function recordInScope(
  user: Pick<AuthUser, 'allowedResellerIds'>,
  scope: ModuleScope,
  record: Record<string, unknown>
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
  }
}
