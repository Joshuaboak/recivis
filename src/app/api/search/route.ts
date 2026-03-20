/**
 * /api/search — Global search across Zoho CRM modules.
 *
 * Searches Accounts, Leads, Contacts, and Invoices in parallel using
 * word search. Filters out Prospect accounts, converted leads, and
 * trashed records. Applies reseller-based RBAC filtering.
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

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  const q = new URL(request.url).searchParams.get('q')?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const userIsAdmin = isAdmin(user);

  try {
    // Search all modules in parallel
    const [accounts, leads, contacts, invoices] = await Promise.all([
      searchModule('Accounts', q, 'Account_Name,Billing_Country,Reseller,Email_Domain,Account_Type,Record_Status__s'),
      searchModule('Leads', q, 'Company,Full_Name,Email,Country,Lead_Status,Reseller,Record_Status__s,Converted__s'),
      searchModule('Contacts', q, 'Full_Name,Email,Phone,Account_Name,Record_Status__s'),
      searchModule('Invoices', q, 'Subject,Reference_Number,Account_Name,Status,Grand_Total,Currency,Invoice_Type,Reseller,Record_Status__s'),
    ]);

    const results: SearchResult[] = [];

    // --- Accounts (exclude Prospects and Trash) ---
    for (const acc of accounts) {
      if (acc.Record_Status__s === 'Trash') continue;
      if (acc.Account_Type === 'Prospect') continue;

      // RBAC: non-admin users can only see accounts with their reseller
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

    // --- Leads (exclude converted and trash) ---
    for (const lead of leads) {
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

    // --- Prospects (Account_Type = Prospect) ---
    for (const acc of accounts) {
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

    // --- Contacts ---
    for (const contact of contacts) {
      if (contact.Record_Status__s === 'Trash') continue;

      results.push({
        id: contact.id as string,
        module: 'Contacts',
        title: contact.Full_Name as string || '',
        subtitle: (contact.Email as string) || (contact.Phone as string) || '',
        meta: (contact.Account_Name as { name?: string })?.name,
      });
    }

    // --- Invoices ---
    for (const inv of invoices) {
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

    return NextResponse.json({ results, query: q });
  } catch (error) {
    log('error', 'api', 'Global search failed', {
      error: error instanceof Error ? error.message : String(error),
      query: q,
    });
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
