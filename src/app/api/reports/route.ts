/**
 * /api/reports — Pre-baked monthly reports across accounts, leads, and invoices.
 *
 * GET ?months=13&region=AU&resellerId=xxx
 *
 * Returns monthly aggregates for the requested time range.
 * Calculates revenue splits (CSA revenue, distributor owed, reseller owed)
 * based on current reseller/distributor percentages.
 *
 * RBAC:
 * - Admin/IBM: all data, optional region/reseller filter
 * - Distributor: own + child reseller data
 * - Reseller: own data only
 */

import { NextRequest, NextResponse } from 'next/server';
import { searchAllPages, getAllRecordPages, callMcpTool, parseMcpResult } from '@/lib/zoho';
import { log } from '@/lib/logger';
import { requireAuth, isAdmin } from '@/lib/api-auth';
import { cacheGet, cacheSet } from '@/lib/cache';

interface MonthReport {
  month: string;
  label: string;
  accounts: number;
  leads: number;
  prospects: number;
  invoiceCount: number;
  invoiceTotal: number;
  listTotal: number;
  csaRevenue: number;
  distributorOwed: number;
  resellerOwed: number;
  invoices: InvoiceRow[];
  accountItems: RecordRow[];
  leadItems: RecordRow[];
  prospectItems: RecordRow[];
}

interface InvoiceRow {
  id: string;
  ref: string;
  subject: string;
  account: string;
  reseller: string;
  date: string;
  total: number;
  listTotal: number;
  csaRevenue: number;
  distributorOwed: number;
  resellerOwed: number;
  currency: string;
  status: string;
  paymentStatus: string;
  isResellerDirect: boolean;
}

interface RecordRow {
  id: string;
  name: string;
  reseller: string;
  country: string;
  date: string;
}

/** Get the month string (YYYY-MM) from a date string. */
function getMonth(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Get a human-readable month label. */
function getMonthLabel(monthStr: string): string {
  const [year, month] = monthStr.split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[parseInt(month) - 1]} ${year}`;
}

/** Build reseller criteria for search queries. */
function buildResellerCriteria(ids: string[]): string {
  if (ids.length === 1) return `(Reseller:equals:${ids[0]})`;
  return `(${ids.map(id => `(Reseller:equals:${id})`).join('or')})`;
}

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  const { searchParams } = new URL(request.url);
  const monthCount = parseInt(searchParams.get('months') || '13');
  const regionFilter = searchParams.get('region') || '';
  const resellerFilter = searchParams.get('resellerId') || '';

  const userIsAdmin = isAdmin(user);

  // Determine which reseller IDs to query
  let resellerIds: string[] | null = null; // null = all
  if (resellerFilter) {
    resellerIds = [resellerFilter];
  } else if (!userIsAdmin) {
    if (user.allowedResellerIds.length > 0) {
      resellerIds = user.allowedResellerIds;
    } else if (user.resellerId) {
      resellerIds = [user.resellerId];
    } else {
      return NextResponse.json({ months: [], totals: {} });
    }
  }

  // Cache key
  const cacheKey = `reports:${resellerIds ? resellerIds.sort().join(',') : 'all'}:${regionFilter}:${monthCount}`;
  const cached = await cacheGet<{ months: MonthReport[]; totals: Record<string, number> }>(cacheKey);
  if (cached) return NextResponse.json(cached);

  try {
    // Generate month slots
    const now = new Date();
    const monthSlots: string[] = [];
    for (let i = 0; i < monthCount; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthSlots.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    const resellerCriteria = resellerIds ? buildResellerCriteria(resellerIds) : null;

    // Fetch all data in parallel
    const [accounts, leads, prospects, invoices] = await Promise.all([
      // Accounts (non-prospect)
      (resellerCriteria
        ? searchAllPages('Accounts', `((Account_Type:not_equal:Prospect)and${resellerCriteria})`, 'Account_Name,Reseller,Billing_Country,Created_Time,Account_Type,Record_Status__s', 'desc')
        : getAllRecordPages('Accounts', 'Account_Name,Reseller,Billing_Country,Created_Time,Account_Type,Record_Status__s', 'Created_Time', 'desc')
      ).catch(() => []),

      // Leads
      (resellerCriteria
        ? searchAllPages('Leads', resellerCriteria, 'Company,Full_Name,Reseller,Country,Created_Time,Converted__s,Record_Status__s', 'desc')
        : getAllRecordPages('Leads', 'Company,Full_Name,Reseller,Country,Created_Time,Converted__s,Record_Status__s', 'Created_Time', 'desc')
      ).catch(() => []),

      // Prospects
      (resellerCriteria
        ? searchAllPages('Accounts', `((Account_Type:equals:Prospect)and${resellerCriteria})`, 'Account_Name,Reseller,Billing_Country,Created_Time,Record_Status__s', 'desc')
        : searchAllPages('Accounts', '(Account_Type:equals:Prospect)', 'Account_Name,Reseller,Billing_Country,Created_Time,Record_Status__s', 'desc')
      ).catch(() => []),

      // Invoices
      (resellerCriteria
        ? searchAllPages('Invoices', resellerCriteria, 'Subject,Reference_Number,Account_Name,Invoice_Date,Grand_Total,Currency,Status,Payment_Status,Reseller,Reseller_Direct_Purchase,Record_Status__s', 'desc')
        : getAllRecordPages('Invoices', 'Subject,Reference_Number,Account_Name,Invoice_Date,Grand_Total,Currency,Status,Payment_Status,Reseller,Reseller_Direct_Purchase,Record_Status__s', 'Invoice_Date', 'desc')
      ).catch(() => []),
    ]);

    // Fetch all unique resellers to get their percentages
    const resellerIdSet = new Set<string>();
    for (const inv of invoices) {
      const r = inv.Reseller as { id?: string } | null;
      if (r?.id) resellerIdSet.add(r.id);
    }

    // Batch fetch reseller details (percentages + distributors)
    const resellerMap = new Map<string, { percentage: number; distributorId: string | null; distributorPercentage: number }>();
    const distributorIdSet = new Set<string>();

    for (const rid of resellerIdSet) {
      try {
        const result = await callMcpTool('ZohoCRM_getRecord', {
          path_variables: { module: 'Resellers', recordID: rid },
        });
        const parsed = parseMcpResult(result);
        const rec = parsed.data[0];
        if (rec) {
          const pct = Number(rec.Reseller_Sale) || 0;
          const distro = rec.Distributor as { id?: string } | null;
          resellerMap.set(rid, {
            percentage: pct,
            distributorId: distro?.id || null,
            distributorPercentage: 0,
          });
          if (distro?.id) distributorIdSet.add(distro.id);
        }
      } catch { /* skip */ }
    }

    // Fetch distributor percentages
    for (const did of distributorIdSet) {
      try {
        const result = await callMcpTool('ZohoCRM_getRecord', {
          path_variables: { module: 'Resellers', recordID: did },
        });
        const parsed = parseMcpResult(result);
        const rec = parsed.data[0];
        if (rec) {
          const distPct = Number(rec.Reseller_Sale) || 0;
          // Update all resellers under this distributor
          for (const [rid, info] of resellerMap) {
            if (info.distributorId === did) {
              info.distributorPercentage = distPct;
            }
          }
        }
      } catch { /* skip */ }
    }

    // Build month reports
    const oldestMonth = monthSlots[monthSlots.length - 1];
    const monthMap = new Map<string, MonthReport>();
    for (const m of monthSlots) {
      monthMap.set(m, {
        month: m, label: getMonthLabel(m),
        accounts: 0, leads: 0, prospects: 0,
        invoiceCount: 0, invoiceTotal: 0, listTotal: 0,
        csaRevenue: 0, distributorOwed: 0, resellerOwed: 0,
        invoices: [], accountItems: [], leadItems: [], prospectItems: [],
      });
    }

    // Process accounts
    for (const acc of accounts) {
      if (acc.Record_Status__s === 'Trash' || acc.Account_Type === 'Prospect') continue;
      if (regionFilter) {
        const country = acc.Billing_Country as string || '';
        // Simple region matching — not perfect but covers main cases
        if (regionFilter === 'AU' && country !== 'Australia') continue;
        if (regionFilter === 'NZ' && country !== 'New Zealand') continue;
      }
      const month = getMonth(acc.Created_Time as string || '');
      const slot = monthMap.get(month);
      if (slot) {
        slot.accounts++;
        slot.accountItems.push({
          id: acc.id as string,
          name: acc.Account_Name as string || '',
          reseller: (acc.Reseller as { name?: string })?.name || '',
          country: acc.Billing_Country as string || '',
          date: acc.Created_Time as string || '',
        });
      }
    }

    // Process leads
    for (const lead of leads) {
      if (lead.Record_Status__s === 'Trash' || lead.Converted__s) continue;
      const month = getMonth(lead.Created_Time as string || '');
      const slot = monthMap.get(month);
      if (slot) {
        slot.leads++;
        slot.leadItems.push({
          id: lead.id as string,
          name: (lead.Company as string) || (lead.Full_Name as string) || '',
          reseller: (lead.Reseller as { name?: string })?.name || '',
          country: lead.Country as string || '',
          date: lead.Created_Time as string || '',
        });
      }
    }

    // Process prospects
    for (const acc of prospects) {
      if (acc.Record_Status__s === 'Trash') continue;
      const month = getMonth(acc.Created_Time as string || '');
      const slot = monthMap.get(month);
      if (slot) {
        slot.prospects++;
        slot.prospectItems.push({
          id: acc.id as string,
          name: acc.Account_Name as string || '',
          reseller: (acc.Reseller as { name?: string })?.name || '',
          country: acc.Billing_Country as string || '',
          date: acc.Created_Time as string || '',
        });
      }
    }

    // Process invoices with revenue calculations
    for (const inv of invoices) {
      if (inv.Record_Status__s === 'Trash') continue;
      const invoiceDate = inv.Invoice_Date as string || '';
      if (!invoiceDate) continue;
      const month = getMonth(invoiceDate);
      const slot = monthMap.get(month);
      if (!slot) continue;

      const grandTotal = Number(inv.Grand_Total) || 0;
      const resellerId = (inv.Reseller as { id?: string })?.id || '';
      const isResellerDirect = !!inv.Reseller_Direct_Purchase;
      const resellerInfo = resellerMap.get(resellerId);
      const resellerPct = resellerInfo?.percentage || 0;
      const distroPct = resellerInfo?.distributorPercentage || 0;

      // Calculate list total (reverse discount for reseller direct)
      let listTotal = grandTotal;
      if (isResellerDirect && resellerPct > 0) {
        listTotal = Math.round(grandTotal / ((100 - resellerPct) / 100) * 100) / 100;
      }

      // Revenue splits based on list price
      let csaRevenue: number;
      let distributorOwed: number;
      let resellerOwed: number;

      if (distroPct > 0) {
        // Has distributor
        csaRevenue = Math.round(listTotal * (100 - distroPct) / 100 * 100) / 100;
        distributorOwed = Math.round(listTotal * (distroPct - resellerPct) / 100 * 100) / 100;
        resellerOwed = isResellerDirect ? 0 : Math.round(listTotal * resellerPct / 100 * 100) / 100;
      } else {
        // No distributor — CSA pays reseller directly
        csaRevenue = Math.round(listTotal * (100 - resellerPct) / 100 * 100) / 100;
        distributorOwed = 0;
        resellerOwed = isResellerDirect ? 0 : Math.round(listTotal * resellerPct / 100 * 100) / 100;
      }

      const row: InvoiceRow = {
        id: inv.id as string,
        ref: inv.Reference_Number as string || '',
        subject: inv.Subject as string || '',
        account: (inv.Account_Name as { name?: string })?.name || '',
        reseller: (inv.Reseller as { name?: string })?.name || '',
        date: invoiceDate,
        total: grandTotal,
        listTotal,
        csaRevenue,
        distributorOwed,
        resellerOwed,
        currency: inv.Currency as string || 'AUD',
        status: inv.Status as string || '',
        paymentStatus: inv.Payment_Status as string || '',
        isResellerDirect,
      };

      slot.invoiceCount++;
      slot.invoiceTotal += grandTotal;
      slot.listTotal += listTotal;
      slot.csaRevenue += csaRevenue;
      slot.distributorOwed += distributorOwed;
      slot.resellerOwed += resellerOwed;
      slot.invoices.push(row);
    }

    // Round aggregates
    for (const slot of monthMap.values()) {
      slot.invoiceTotal = Math.round(slot.invoiceTotal * 100) / 100;
      slot.listTotal = Math.round(slot.listTotal * 100) / 100;
      slot.csaRevenue = Math.round(slot.csaRevenue * 100) / 100;
      slot.distributorOwed = Math.round(slot.distributorOwed * 100) / 100;
      slot.resellerOwed = Math.round(slot.resellerOwed * 100) / 100;
    }

    const months = monthSlots.map(m => monthMap.get(m)!);

    // Calculate totals
    const totals = {
      accounts: months.reduce((s, m) => s + m.accounts, 0),
      leads: months.reduce((s, m) => s + m.leads, 0),
      prospects: months.reduce((s, m) => s + m.prospects, 0),
      invoiceCount: months.reduce((s, m) => s + m.invoiceCount, 0),
      invoiceTotal: Math.round(months.reduce((s, m) => s + m.invoiceTotal, 0) * 100) / 100,
      listTotal: Math.round(months.reduce((s, m) => s + m.listTotal, 0) * 100) / 100,
      csaRevenue: Math.round(months.reduce((s, m) => s + m.csaRevenue, 0) * 100) / 100,
      distributorOwed: Math.round(months.reduce((s, m) => s + m.distributorOwed, 0) * 100) / 100,
      resellerOwed: Math.round(months.reduce((s, m) => s + m.resellerOwed, 0) * 100) / 100,
    };

    const result = { months, totals };
    await cacheSet(cacheKey, result, 600); // 10 min cache
    return NextResponse.json(result);
  } catch (error) {
    log('error', 'api', 'Reports failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to generate reports' }, { status: 500 });
  }
}
