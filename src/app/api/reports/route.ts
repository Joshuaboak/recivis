/**
 * /api/reports — Pre-baked monthly reports across accounts, leads, and invoices.
 *
 * GET ?months=13&region=AU&resellerId=xxx
 *
 * Revenue logic:
 * - CSA-owned resellers (Civil Survey Applications*) = 100% CSA revenue
 * - Customer direct: reseller earns %, distributor earns (distro% - reseller%)
 * - Reseller direct: reseller earns $0, distributor earns (distro% - reseller%)
 * - CSA Profit: revenue minus all partner payouts
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
  revenue: number;
  csaProfit: number;
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
  revenue: number;
  csaProfit: number;
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

const CSA_RESELLER_NAMES = [
  'civil survey applications',
  'civil survey applications llc',
  'civil survey applications india',
  'civil survey applications europe',
];

function getMonth(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthLabel(monthStr: string): string {
  const [year, month] = monthStr.split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[parseInt(month) - 1]} ${year}`;
}

function buildResellerCriteria(ids: string[]): string {
  if (ids.length === 1) return `(Reseller:equals:${ids[0]})`;
  return `(${ids.map(id => `(Reseller:equals:${id})`).join('or')})`;
}

function isCsaReseller(name: string): boolean {
  return CSA_RESELLER_NAMES.includes(name.toLowerCase().trim());
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

  let resellerIds: string[] | null = null;
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

  const cacheKey = `reports:v3:${resellerIds ? resellerIds.sort().join(',') : 'all'}:${regionFilter}:${monthCount}`;
  const cached = await cacheGet<{ months: MonthReport[]; totals: Record<string, number> }>(cacheKey);
  if (cached) return NextResponse.json(cached);

  try {
    const now = new Date();
    const monthSlots: string[] = [];
    for (let i = 0; i < monthCount; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthSlots.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    const resellerCriteria = resellerIds ? buildResellerCriteria(resellerIds) : null;

    // Fetch data — for admin with no filter, use getRecords. For filtered, use search.
    const fetchAccounts = resellerCriteria
      ? searchAllPages('Accounts', resellerCriteria, 'Account_Name,Reseller,Billing_Country,Created_Time,Account_Type,Record_Status__s', 'desc')
      : getAllRecordPages('Accounts', 'Account_Name,Reseller,Billing_Country,Created_Time,Account_Type,Record_Status__s', 'Created_Time', 'desc');

    const fetchLeads = resellerCriteria
      ? searchAllPages('Leads', resellerCriteria, 'Company,Full_Name,Reseller,Country,Created_Time,Converted__s,Record_Status__s', 'desc')
      : getAllRecordPages('Leads', 'Company,Full_Name,Reseller,Country,Created_Time,Converted__s,Record_Status__s', 'Created_Time', 'desc');

    const invoiceFields = 'Subject,Reference_Number,Account_Name,Invoice_Date,Grand_Total,Currency,Status,Payment_Status,Reseller,Reseller_Direct_Purchase,Record_Status__s';
    const fetchInvoices = resellerCriteria
      ? searchAllPages('Invoices', resellerCriteria, invoiceFields, 'desc')
      : getAllRecordPages('Invoices', invoiceFields, 'Modified_Time', 'desc');

    const [allAccounts, leads, invoices] = await Promise.all([
      fetchAccounts.catch((e) => { log('warn', 'api', 'Reports accounts fetch failed', { error: String(e) }); return []; }),
      fetchLeads.catch((e) => { log('warn', 'api', 'Reports leads fetch failed', { error: String(e) }); return []; }),
      fetchInvoices.catch((e) => { log('warn', 'api', 'Reports invoices fetch failed', { error: String(e) }); return []; }),
    ]);

    // Split accounts into non-prospect and prospect
    const accounts = allAccounts.filter((a: Record<string, unknown>) => a.Account_Type !== 'Prospect');
    const prospects = allAccounts.filter((a: Record<string, unknown>) => a.Account_Type === 'Prospect');

    // Fetch reseller percentages for invoice calculations
    const resellerIdSet = new Set<string>();
    for (const inv of invoices) {
      const r = inv.Reseller as { id?: string } | null;
      if (r?.id) resellerIdSet.add(r.id);
    }

    const resellerMap = new Map<string, { name: string; percentage: number; distributorId: string | null; distributorPercentage: number }>();
    const distributorIdSet = new Set<string>();

    // Batch fetch reseller records
    const resellerFetches = Array.from(resellerIdSet).map(async (rid) => {
      try {
        const result = await callMcpTool('ZohoCRM_getRecord', {
          path_variables: { module: 'Resellers', recordID: rid },
        });
        const parsed = parseMcpResult(result);
        const rec = parsed.data[0];
        if (rec) {
          const name = rec.Name as string || '';
          const pct = Number(rec.Reseller_Sale) || 0;
          const distro = rec.Distributor as { id?: string } | null;
          resellerMap.set(rid, {
            name,
            percentage: pct,
            distributorId: distro?.id || null,
            distributorPercentage: 0,
          });
          if (distro?.id) distributorIdSet.add(distro.id);
        }
      } catch { /* skip */ }
    });
    await Promise.all(resellerFetches);

    // Fetch distributor percentages
    const distroFetches = Array.from(distributorIdSet).map(async (did) => {
      try {
        const result = await callMcpTool('ZohoCRM_getRecord', {
          path_variables: { module: 'Resellers', recordID: did },
        });
        const parsed = parseMcpResult(result);
        const rec = parsed.data[0];
        if (rec) {
          const distPct = Number(rec.Reseller_Sale) || 0;
          for (const [, info] of resellerMap) {
            if (info.distributorId === did) info.distributorPercentage = distPct;
          }
        }
      } catch { /* skip */ }
    });
    await Promise.all(distroFetches);

    // Build month reports
    const monthMap = new Map<string, MonthReport>();
    for (const m of monthSlots) {
      monthMap.set(m, {
        month: m, label: getMonthLabel(m),
        accounts: 0, leads: 0, prospects: 0,
        invoiceCount: 0, revenue: 0, csaProfit: 0,
        distributorOwed: 0, resellerOwed: 0,
        invoices: [], accountItems: [], leadItems: [], prospectItems: [],
      });
    }

    // Process accounts
    for (const acc of accounts) {
      if (acc.Record_Status__s === 'Trash') continue;
      const created = acc.Created_Time as string;
      if (!created) continue;
      const month = getMonth(created);
      const slot = monthMap.get(month);
      if (slot) {
        slot.accounts++;
        slot.accountItems.push({
          id: acc.id as string,
          name: acc.Account_Name as string || '',
          reseller: (acc.Reseller as { name?: string })?.name || '',
          country: acc.Billing_Country as string || '',
          date: created,
        });
      }
    }

    // Process leads
    for (const lead of leads) {
      if (lead.Record_Status__s === 'Trash' || lead.Converted__s) continue;
      const created = lead.Created_Time as string;
      if (!created) continue;
      const month = getMonth(created);
      const slot = monthMap.get(month);
      if (slot) {
        slot.leads++;
        slot.leadItems.push({
          id: lead.id as string,
          name: (lead.Company as string) || (lead.Full_Name as string) || '',
          reseller: (lead.Reseller as { name?: string })?.name || '',
          country: lead.Country as string || '',
          date: created,
        });
      }
    }

    // Process prospects
    for (const acc of prospects) {
      if (acc.Record_Status__s === 'Trash') continue;
      const created = acc.Created_Time as string;
      if (!created) continue;
      const month = getMonth(created);
      const slot = monthMap.get(month);
      if (slot) {
        slot.prospects++;
        slot.prospectItems.push({
          id: acc.id as string,
          name: acc.Account_Name as string || '',
          reseller: (acc.Reseller as { name?: string })?.name || '',
          country: acc.Billing_Country as string || '',
          date: created,
        });
      }
    }

    // Process invoices
    for (const inv of invoices) {
      if (inv.Record_Status__s === 'Trash') continue;
      const invoiceDate = inv.Invoice_Date as string || '';
      if (!invoiceDate) continue;
      const month = getMonth(invoiceDate);
      const slot = monthMap.get(month);
      if (!slot) continue;

      const grandTotal = Number(inv.Grand_Total) || 0;
      const resellerId = (inv.Reseller as { id?: string })?.id || '';
      const resellerName = (inv.Reseller as { name?: string })?.name || '';
      const isResellerDirect = !!inv.Reseller_Direct_Purchase;
      const resellerInfo = resellerMap.get(resellerId);
      const resellerPct = resellerInfo?.percentage || 0;
      const distroPct = resellerInfo?.distributorPercentage || 0;

      // Revenue = the actual invoice total (what was invoiced)
      const revenue = grandTotal;

      // Check if this is a CSA-owned reseller or no reseller (100% CSA revenue)
      const isCSA = !resellerId || isCsaReseller(resellerName) || isCsaReseller(resellerInfo?.name || '');

      let csaProfit: number;
      let distributorOwed: number;
      let resellerOwed: number;

      if (isCSA) {
        // CSA-owned reseller — everything is CSA profit
        csaProfit = revenue;
        distributorOwed = 0;
        resellerOwed = 0;
      } else if (isResellerDirect) {
        // Reseller direct — invoice total is already discounted
        // Reseller earns $0 from us (they mark up to customer)
        // Distributor owed = (distro% - reseller%) / (100 - reseller%) * invoice total
        // CSA Profit = invoice total - distributor owed
        if (distroPct > 0 && resellerPct < 100) {
          const listTotal = grandTotal / ((100 - resellerPct) / 100);
          distributorOwed = Math.round(listTotal * (distroPct - resellerPct) / 100 * 100) / 100;
        } else {
          distributorOwed = 0;
        }
        resellerOwed = 0;
        csaProfit = Math.round((revenue - distributorOwed) * 100) / 100;
      } else {
        // Customer direct — invoice total is list price
        if (distroPct > 0) {
          distributorOwed = Math.round(revenue * (distroPct - resellerPct) / 100 * 100) / 100;
          resellerOwed = Math.round(revenue * resellerPct / 100 * 100) / 100;
        } else {
          distributorOwed = 0;
          resellerOwed = Math.round(revenue * resellerPct / 100 * 100) / 100;
        }
        csaProfit = Math.round((revenue - distributorOwed - resellerOwed) * 100) / 100;
      }

      const row: InvoiceRow = {
        id: inv.id as string,
        ref: inv.Reference_Number as string || '',
        subject: inv.Subject as string || '',
        account: (inv.Account_Name as { name?: string })?.name || '',
        reseller: resellerName,
        date: invoiceDate,
        revenue,
        csaProfit,
        distributorOwed,
        resellerOwed,
        currency: inv.Currency as string || 'AUD',
        status: inv.Status as string || '',
        paymentStatus: inv.Payment_Status as string || '',
        isResellerDirect,
      };

      slot.invoiceCount++;
      slot.revenue += revenue;
      slot.csaProfit += csaProfit;
      slot.distributorOwed += distributorOwed;
      slot.resellerOwed += resellerOwed;
      slot.invoices.push(row);
    }

    // Round aggregates
    for (const slot of monthMap.values()) {
      slot.revenue = Math.round(slot.revenue * 100) / 100;
      slot.csaProfit = Math.round(slot.csaProfit * 100) / 100;
      slot.distributorOwed = Math.round(slot.distributorOwed * 100) / 100;
      slot.resellerOwed = Math.round(slot.resellerOwed * 100) / 100;
    }

    const months = monthSlots.map(m => monthMap.get(m)!);
    const totals = {
      accounts: months.reduce((s, m) => s + m.accounts, 0),
      leads: months.reduce((s, m) => s + m.leads, 0),
      prospects: months.reduce((s, m) => s + m.prospects, 0),
      invoiceCount: months.reduce((s, m) => s + m.invoiceCount, 0),
      revenue: Math.round(months.reduce((s, m) => s + m.revenue, 0) * 100) / 100,
      csaProfit: Math.round(months.reduce((s, m) => s + m.csaProfit, 0) * 100) / 100,
      distributorOwed: Math.round(months.reduce((s, m) => s + m.distributorOwed, 0) * 100) / 100,
      resellerOwed: Math.round(months.reduce((s, m) => s + m.resellerOwed, 0) * 100) / 100,
    };

    const result = { months, totals };
    await cacheSet(cacheKey, result, 600);
    return NextResponse.json(result);
  } catch (error) {
    log('error', 'api', 'Reports failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to generate reports' }, { status: 500 });
  }
}
