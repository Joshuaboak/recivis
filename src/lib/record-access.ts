/**
 * record-access.ts — one implementation of "may this caller touch this record".
 *
 * `tenant-scope.ts` decides what a record's partner *is*; this module does the
 * fetching and the answering, so every API route asks the same question the
 * same way. Before this existed the AI chat route had the only real
 * implementation and the plain REST routes each improvised — which is how
 * `/api/leads`, `/api/assets` and `/api/renewals` ended up with none at all.
 *
 * Two rules hold everywhere in here:
 *
 * 1. **Only `admin` and `ibm` see everything.** They are CSA's own roles —
 *    system administrator and the international business manager who covers a
 *    whole geo. A partner-side user never reaches this bypass, whatever their
 *    user role is called.
 * 2. **Unproven is denied.** A record with no reseller, a record that failed to
 *    load, a module nobody has scoped: all no. A caller scoped to no partner at
 *    all gets nothing rather than everything.
 */

import { NextResponse } from 'next/server';
import { executeZohoTool } from './zoho';
import { isAdmin, type AuthUser } from './api-auth';
import { MODULE_SCOPES, recordInScope, scopingAccountId } from './tenant-scope';

/**
 * What a partner is told when they reach for someone else's record.
 *
 * One sentence, the same everywhere, and it never says whether the record
 * exists — "assigned to another partner" is true either way, and confirming
 * the existence of a stranger's customer is itself a leak.
 */
export const NOT_YOURS = 'Sorry, this customer is assigned to another partner.';

/** The same refusal for records that are not customers. */
export const NOT_YOURS_RECORD = 'This record belongs to another partner.';

/** Read one record from Zoho, or null if it is not there. */
export async function fetchRecord(
  moduleName: string,
  recordId: string
): Promise<Record<string, unknown> | null> {
  try {
    const result = await executeZohoTool('get_record', {
      module: moduleName,
      record_id: recordId,
    });
    const res = result as { content?: Array<{ text?: string }> };
    for (const item of res?.content || []) {
      if (!item.text) continue;
      const parsed = JSON.parse(item.text);
      const record = parsed.data?.[0];
      if (record) return record as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

/** Whether the caller may see one account. */
export async function accountIsVisible(user: AuthUser, accountId: string): Promise<boolean> {
  if (isAdmin(user)) return true;
  const account = await fetchRecord('Accounts', accountId);
  if (!account) return false;
  return recordInScope(user, MODULE_SCOPES.Accounts, account);
}

/**
 * Whether the caller may see one record, fetching it to find out.
 *
 * Contacts and anything else scoped through an account cost a second lookup,
 * since the contact itself names no partner.
 */
export async function recordIsVisible(
  user: AuthUser,
  moduleName: string,
  recordId: string
): Promise<boolean> {
  if (isAdmin(user)) return true;

  const scope = MODULE_SCOPES[moduleName];
  if (!scope) return false;
  if (scope.kind === 'catalogue') return true;

  const record = await fetchRecord(moduleName, recordId);
  if (!record) return false;

  if (scope.kind === 'via-account') {
    const accountId = scopingAccountId(scope, record);
    // A contact attached to nothing has no partner to inherit, so it stays
    // unproven rather than becoming everyone's.
    if (!accountId) return false;
    return accountIsVisible(user, accountId);
  }

  return recordInScope(user, scope, record);
}

/**
 * Resolve which of a set of accounts the caller may see.
 *
 * Contact searches return many contacts across few accounts, so the distinct
 * accounts are resolved once each rather than once per contact.
 */
export async function visibleAccountIds(
  user: AuthUser,
  accountIds: Iterable<string>
): Promise<Set<string>> {
  const allowed = new Set<string>();
  await Promise.all(
    Array.from(new Set(accountIds)).map(async id => {
      if (await accountIsVisible(user, id)) allowed.add(id);
    })
  );
  return allowed;
}

/**
 * Route guard: null to carry on, or the 403 to return.
 *
 * `message` overrides the wording for records that are not customers.
 */
export async function requireRecordAccess(
  user: AuthUser,
  moduleName: string,
  recordId: string,
  message: string = NOT_YOURS
): Promise<NextResponse | null> {
  if (await recordIsVisible(user, moduleName, recordId)) return null;
  return NextResponse.json({ error: message }, { status: 403 });
}

/**
 * Route guard: a non-CSA caller must be scoped to at least one partner.
 *
 * Several routes wrote their scope check as
 * `!isAdmin(user) && user.allowedResellerIds.length > 0`, which reads as
 * caution and behaves as the opposite: a user with no partner at all skipped
 * the check and saw everything. Calling this early makes zero partners mean
 * zero records, and leaves those conditionals correct as written.
 */
export function requirePartnerScope(user: AuthUser): NextResponse | null {
  if (isAdmin(user)) return null;
  if (user.allowedResellerIds.length === 0) {
    return NextResponse.json(
      { error: 'Your account is not linked to a partner, so customer records are not available.' },
      { status: 403 }
    );
  }
  return null;
}

/**
 * A Zoho search fragment restricting results to the partners this caller may
 * see, or null for a caller who should see everything.
 *
 * Returns the empty string for a non-admin scoped to no partner — a caller
 * with nothing to see, which the caller must handle as "no results" rather
 * than "no filter".
 */
export function resellerScopeCriteria(user: AuthUser): string | null {
  if (isAdmin(user)) return null;
  const ids = user.allowedResellerIds;
  if (ids.length === 0) return '';
  if (ids.length === 1) return `(Reseller:equals:${ids[0]})`;
  return `(${ids.map(id => `(Reseller:equals:${id})`).join('or')})`;
}

/**
 * Drop records belonging to other partners from a list already fetched.
 *
 * Search criteria are the first line of defence, but Zoho's `word` search
 * takes no criteria at all — every keyword search in the portal used to come
 * back unscoped. This runs over the results regardless of how they were
 * fetched, so a query that forgot its filter still cannot leak.
 */
export function filterToScope<T extends Record<string, unknown>>(
  user: AuthUser,
  moduleName: string,
  records: T[]
): T[] {
  if (isAdmin(user)) return records;
  const scope = MODULE_SCOPES[moduleName];
  if (!scope) return [];
  if (scope.kind === 'catalogue') return records;
  return records.filter(record => recordInScope(user, scope, record));
}
