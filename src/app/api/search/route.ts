/**
 * /api/search — Global search across Zoho CRM modules.
 *
 * GET ?q=term                    → Search all modules
 * GET ?q=term&modules=Accounts   → Search specific module(s), comma-separated
 *
 * Supported modules: Accounts, Leads, Prospects, Contacts, Invoices, Resellers
 * Applies reseller-based RBAC filtering. Admin/IBM only for Resellers.
 */

import { NextRequest, NextResponse } from 'next/server';
import { callMcpTool, parseMcpResult } from '@/lib/zoho';
import { log } from '@/lib/logger';
import { requireAuth, isAdmin } from '@/lib/api-auth';

interface SearchResult {
  id: string;
  module: string;
  title: string;
  subtitle: string;
  meta?: string;
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

const ALL_MODULES = ['Accounts', 'Leads', 'Prospects', 'Contacts', 'Invoices', 'Resellers'];

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

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

    // --- Contacts ---
    if (dataMap.contacts) {
      for (const contact of dataMap.contacts) {
        if (contact.Record_Status__s === 'Trash') continue;

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
