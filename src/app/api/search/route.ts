/**
 * /api/search — Global search across Zoho CRM modules.
 *
 * GET ?q=term                    → Search all modules
 * GET ?q=term&modules=Accounts   → Search specific module(s), comma-separated
 *
 * Supported modules: Accounts, Leads, Prospects, Contacts, Invoices, Resellers,
 * Assets. Applies reseller-based RBAC filtering. Admin/IBM only for Resellers.
 *
 * Assets are matched on serial key rather than by keyword: a licence key is
 * the one thing about an asset somebody types in verbatim, usually off a
 * customer's email, and it is the only field worth a global search.
 */

import { NextRequest, NextResponse } from 'next/server';
import { callMcpTool, parseMcpResult } from '@/lib/zoho';
import { log } from '@/lib/logger';
import { requireAuth, isAdmin } from '@/lib/api-auth';
import { requirePartnerScope, visibleAccountIds } from '@/lib/record-access';

interface SearchResult {
  id: string;
  module: string;
  title: string;
  subtitle: string;
  meta?: string;
  /** The customer to open for a result that has no page of its own. */
  accountId?: string;
}

async function searchModule(
  module: string,
  word: string,
  fields: string,
): Promise<Record<string, unknown>[]> {
  try {
    const result = await callMcpTool('ZohoCRM_searchRecords', {
      path_variables: { module },
      query_params: { word, fields, page: 1 },
    });
    const parsed = parseMcpResult(result);
    return parsed.data;
  } catch {
    return [];
  }
}

const ALL_MODULES = ['Accounts', 'Leads', 'Prospects', 'Contacts', 'Invoices', 'Assets', 'Resellers'];

/**
 * The searchable form of a licence key.
 *
 * The term is interpolated into a Zoho criteria string, where an unescaped
 * bracket or colon changes what is being asked rather than what is being
 * matched — so everything a key cannot contain is dropped rather than quoted.
 * Keys are alphanumerics in dash-separated groups, and Zoho matches them
 * case-insensitively.
 */
function serialKeyTerm(q: string): string | null {
  const cleaned = q.replace(/[^A-Za-z0-9-]/g, '');
  // The global minimum is two characters, which is fine for a name and far too
  // little for a key prefix: every search for "ab" would drag back a page of
  // licences to permission-check. One whole group of a key is four or five.
  return cleaned.length >= 5 ? cleaned : null;
}

/**
 * How many key matches are permission-checked.
 *
 * Each distinct customer behind a match costs a Zoho read, so an undiscriminating
 * prefix would turn one search into a hundred of them. A whole key matches one
 * licence; anything returning more than a screenful was not a key.
 */
const MAX_KEY_MATCHES = 25;

/**
 * Assets whose serial key begins with the term.
 *
 * `starts_with` rather than an exact match so a partial key pasted from an
 * email still finds the licence; Zoho search offers no substring operator, so
 * a fragment from the middle of a key will not match.
 */
async function searchAssetsBySerialKey(term: string): Promise<Record<string, unknown>[]> {
  try {
    const result = await callMcpTool('ZohoCRM_searchRecords', {
      path_variables: { module: 'Assets1' },
      query_params: {
        criteria: `(Serial_Key:starts_with:${term})`,
        fields: 'Name,Serial_Key,Product,Account,Record_Status__s',
        page: 1,
      },
    });
    return parseMcpResult(result).data;
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  // A caller with no partner of their own sees no customer records. Without
  // this the scope checks below, written as `allowedResellerIds.length > 0`,
  // were skipped entirely for such a user.
  const unscoped = requirePartnerScope(user);
  if (unscoped) return unscoped;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim();
  const modulesParam = searchParams.get('modules');

  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const userIsAdmin = isAdmin(user);

  // Determine which modules to search
  let requestedModules = ALL_MODULES;
  if (modulesParam) {
    requestedModules = modulesParam.split(',').filter(m => ALL_MODULES.includes(m));
    if (requestedModules.length === 0) requestedModules = ALL_MODULES;
  }

  // Non-admin users can't search Resellers
  if (!userIsAdmin) {
    requestedModules = requestedModules.filter(m => m !== 'Resellers');
  }

  // Accounts and Prospects both come from the Accounts module
  const needAccounts = requestedModules.includes('Accounts') || requestedModules.includes('Prospects');

  try {
    // Build parallel search promises based on requested modules
    const searches: Promise<Record<string, unknown>[]>[] = [];
    const searchKeys: string[] = [];

    if (needAccounts) {
      searches.push(searchModule('Accounts', q, 'Account_Name,Billing_Country,Reseller,Email_Domain,Account_Type,Record_Status__s'));
      searchKeys.push('accounts');
    }
    if (requestedModules.includes('Leads')) {
      searches.push(searchModule('Leads', q, 'Company,Full_Name,Email,Country,Lead_Status,Reseller,Record_Status__s,Converted__s'));
      searchKeys.push('leads');
    }
    if (requestedModules.includes('Contacts')) {
      searches.push(searchModule('Contacts', q, 'Full_Name,Email,Phone,Account_Name,Record_Status__s'));
      searchKeys.push('contacts');
    }
    if (requestedModules.includes('Invoices')) {
      searches.push(searchModule('Invoices', q, 'Subject,Reference_Number,Account_Name,Status,Grand_Total,Currency,Invoice_Type,Reseller,Record_Status__s'));
      searchKeys.push('invoices');
    }
    if (requestedModules.includes('Resellers')) {
      searches.push(searchModule('Resellers', q, 'Name,Region,Partner_Category,Record_Status__s'));
      searchKeys.push('resellers');
    }
    const keyTerm = requestedModules.includes('Assets') ? serialKeyTerm(q) : null;
    if (keyTerm) {
      searches.push(searchAssetsBySerialKey(keyTerm));
      searchKeys.push('assets');
    }

    const searchResults = await Promise.all(searches);
    const dataMap: Record<string, Record<string, unknown>[]> = {};
    searchKeys.forEach((key, i) => { dataMap[key] = searchResults[i]; });

    const results: SearchResult[] = [];

    // --- Accounts (exclude Prospects and Trash) ---
    if (requestedModules.includes('Accounts') && dataMap.accounts) {
      for (const acc of dataMap.accounts) {
        if (acc.Record_Status__s === 'Trash') continue;
        if (acc.Account_Type === 'Prospect') continue;

        if (!userIsAdmin && user.allowedResellerIds.length > 0) {
          const reseller = acc.Reseller as { id?: string } | null;
          if (reseller?.id && !user.allowedResellerIds.includes(reseller.id)) continue;
        }

        results.push({
          id: acc.id as string,
          module: 'Accounts',
          title: acc.Account_Name as string || '',
          subtitle: (acc.Email_Domain as string) || (acc.Billing_Country as string) || '',
          meta: (acc.Reseller as { name?: string })?.name,
        });
      }
    }

    // --- Prospects (Account_Type = Prospect) ---
    if (requestedModules.includes('Prospects') && dataMap.accounts) {
      for (const acc of dataMap.accounts) {
        if (acc.Record_Status__s === 'Trash') continue;
        if (acc.Account_Type !== 'Prospect') continue;

        if (!userIsAdmin && user.allowedResellerIds.length > 0) {
          const reseller = acc.Reseller as { id?: string } | null;
          if (reseller?.id && !user.allowedResellerIds.includes(reseller.id)) continue;
        }

        results.push({
          id: acc.id as string,
          module: 'Prospects',
          title: acc.Account_Name as string || '',
          subtitle: (acc.Email_Domain as string) || (acc.Billing_Country as string) || '',
          meta: (acc.Reseller as { name?: string })?.name,
        });
      }
    }

    // --- Leads (exclude converted and trash) ---
    if (dataMap.leads) {
      for (const lead of dataMap.leads) {
        if (lead.Record_Status__s === 'Trash') continue;
        if (lead.Converted__s) continue;

        if (!userIsAdmin && user.allowedResellerIds.length > 0) {
          const reseller = lead.Reseller as { id?: string } | null;
          if (reseller?.id && !user.allowedResellerIds.includes(reseller.id)) continue;
        }

        results.push({
          id: lead.id as string,
          module: 'Leads',
          title: (lead.Company as string) || (lead.Full_Name as string) || '',
          subtitle: (lead.Email as string) || (lead.Country as string) || '',
          meta: lead.Lead_Status as string,
        });
      }
    }

    // --- Contacts (filter by account's reseller for non-admin) ---
    if (dataMap.contacts) {
      // Build a set of allowed account IDs from the already-fetched accounts data
      const allowedAccountIds = new Set<string>();
      if (!userIsAdmin && user.allowedResellerIds.length > 0 && dataMap.accounts) {
        for (const acc of dataMap.accounts) {
          const reseller = acc.Reseller as { id?: string } | null;
          if (!reseller?.id || user.allowedResellerIds.includes(reseller.id)) {
            allowedAccountIds.add(acc.id as string);
          }
        }
      }

      for (const contact of dataMap.contacts) {
        if (contact.Record_Status__s === 'Trash') continue;

        // Filter by account ownership for non-admin users
        if (!userIsAdmin && user.allowedResellerIds.length > 0) {
          const account = contact.Account_Name as { id?: string } | null;
          if (account?.id && !allowedAccountIds.has(account.id)) continue;
          if (!account?.id) continue; // Skip orphaned contacts
        }

        results.push({
          id: contact.id as string,
          module: 'Contacts',
          title: contact.Full_Name as string || '',
          subtitle: (contact.Email as string) || (contact.Phone as string) || '',
          meta: (contact.Account_Name as { name?: string })?.name,
        });
      }
    }

    // --- Invoices ---
    if (dataMap.invoices) {
      for (const inv of dataMap.invoices) {
        if (inv.Record_Status__s === 'Trash') continue;

        if (!userIsAdmin && user.allowedResellerIds.length > 0) {
          const reseller = inv.Reseller as { id?: string } | null;
          if (reseller?.id && !user.allowedResellerIds.includes(reseller.id)) continue;
        }

        const currency = inv.Currency as string;
        const symbol = currency === 'AUD' ? '$' : currency === 'EUR' ? '\u20AC' : currency === 'GBP' ? '\u00A3' : '$';
        const total = inv.Grand_Total as number;

        results.push({
          id: inv.id as string,
          module: 'Invoices',
          title: (inv.Subject as string) || (inv.Reference_Number as string) || '',
          subtitle: (inv.Account_Name as { name?: string })?.name || '',
          meta: `${inv.Status as string || ''} ${total ? `${symbol}${total.toFixed(2)}` : ''}`.trim(),
        });
      }
    }

    // --- Assets, by serial key ---
    //
    // Scoped on the customer rather than on the asset's own Reseller field:
    // the result's only destination is the customer's page, so a licence whose
    // account this partner cannot open has nowhere to go and is not theirs to
    // see. The distinct accounts are resolved once each.
    if (dataMap.assets) {
      const live = dataMap.assets
        .filter(a => a.Record_Status__s !== 'Trash')
        .slice(0, MAX_KEY_MATCHES);
      const allowedAccounts = await visibleAccountIds(
        user,
        live
          .map(a => (a.Account as { id?: string } | null)?.id)
          .filter((id): id is string => !!id)
      );

      for (const asset of live) {
        const account = asset.Account as { id?: string; name?: string } | null;
        // A licence attached to no customer has no page to open and no owner
        // to check, so it stays out rather than becoming everyone's.
        if (!account?.id || !allowedAccounts.has(account.id)) continue;

        results.push({
          id: asset.id as string,
          module: 'Assets',
          title: (asset.Product as { name?: string } | null)?.name || (asset.Name as string) || '',
          subtitle: (asset.Serial_Key as string) || '',
          meta: account.name,
          accountId: account.id,
        });
      }
    }

    // --- Resellers (admin/IBM only) ---
    if (dataMap.resellers) {
      for (const res of dataMap.resellers) {
        if (res.Record_Status__s === 'Trash') continue;

        results.push({
          id: res.id as string,
          module: 'Resellers',
          title: res.Name as string || '',
          subtitle: (res.Partner_Category as string) || '',
          meta: res.Region as string,
        });
      }
    }

    return NextResponse.json({ results, query: q });
  } catch (error) {
    log('error', 'api', 'Global search failed', {
      error: error instanceof Error ? error.message : String(error),
      query: q,
    });
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
