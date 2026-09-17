/**
 * reseller-scope.ts — which resellers a user's records may come from.
 *
 * This lived twice: once in auth.ts for the session object the client holds,
 * once in api-auth.ts for the guard every API route runs. Two copies of a
 * permission rule is one too many — the API-side copy is the one that decides
 * what data leaves the building, and it is the copy that gets forgotten.
 */

import { query } from './db';
import { callMcpTool, parseMcpResult } from './zoho';
import { cacheGet, cacheSet } from './cache';
import { log } from './logger';
import { CSA_INTERNAL_ID, CSA_ZOHO_ID } from './constants';

/**
 * The resellers Zoho says this distributor is above.
 *
 * The `resellers` table only holds partners someone registered in the portal,
 * because that is what a row is for: a login, a role, permission overrides. The
 * distributor relationship is a different fact, it lives in the CRM, and it
 * covers partners who will never have a portal account at all. Reading children
 * out of Postgres alone meant a distributor could not see the records of any
 * such partner — the account was there, correctly filed against the child
 * reseller, and simply invisible.
 *
 * Cached for five minutes, the same TTL /api/resellers uses, because this sits
 * in the path of every authenticated request.
 */
async function zohoChildResellerIds(resellerId: string): Promise<string[]> {
  // CSA's own partner row is keyed differently either side of the fence.
  const zohoId = resellerId === CSA_INTERNAL_ID ? CSA_ZOHO_ID : resellerId;
  const cacheKey = `scope:children:${zohoId}`;

  const cached = await cacheGet<string[]>(cacheKey);
  if (cached) return cached;

  try {
    const result = await callMcpTool('ZohoCRM_searchRecords', {
      path_variables: { module: 'Resellers' },
      query_params: {
        criteria: `(Distributor:equals:${zohoId})`,
        fields: 'Name,Record_Status__s',
      },
    });
    const ids = parseMcpResult(result).data
      .filter(r => r.Record_Status__s !== 'Trash')
      .map(r => r.id as string)
      .filter(Boolean)
      // Map CSA back to the id the portal files records under.
      .map(id => (id === CSA_ZOHO_ID ? CSA_INTERNAL_ID : id));

    await cacheSet(cacheKey, ids, 300);
    return ids;
  } catch (err) {
    // Widening the scope is what failed, so the safe answer is the narrower
    // one. Logged rather than swallowed: silently showing a distributor less
    // than they should see is the bug this exists to fix.
    log('warn', 'auth', 'Could not read child resellers from Zoho', {
      resellerId,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * Every reseller id whose records this user may see.
 *
 * Empty for a system admin — the callers read that as "no filter" rather than
 * "nothing", so admins must never be passed through here.
 *
 * The two child sources are unioned rather than one replacing the other: a
 * partner registered in the portal but not yet linked in the CRM keeps working,
 * and a Zoho outage degrades to the old behaviour instead of emptying somebody's
 * account list mid-session.
 */
export async function allowedResellerIdsFor(
  resellerId: string,
  canViewChildRecords: boolean
): Promise<string[]> {
  const ids = [resellerId];
  if (!canViewChildRecords) return ids;

  const registered = await query(
    'SELECT id FROM resellers WHERE distributor_id = $1 AND is_active = true',
    [resellerId]
  );
  for (const child of registered.rows) {
    if (!ids.includes(child.id)) ids.push(child.id);
  }

  for (const childId of await zohoChildResellerIds(resellerId)) {
    if (!ids.includes(childId)) ids.push(childId);
  }

  return ids;
}
