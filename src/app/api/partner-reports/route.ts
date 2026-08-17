/**
 * GET /api/partner-reports?report=statement|schedule&month=YYYY-MM
 *
 * Reconciliation reports written from one partner's point of view, answering
 * the only two questions a reseller or distributor asks at month end: what do
 * I owe, and what am I owed.
 *
 * Who settles with whom follows the partner chain. A reseller under a
 * distributor settles with that distributor; a reseller with no distributor
 * settles with CSA; a distributor settles with CSA for everything and with
 * each of its child resellers separately.
 *
 * The order maths matches /api/reports so the two never disagree:
 *   customer direct — the order is at list, the seller earns their commission
 *   reseller direct — the order is already discounted, so the seller earns
 *                     nothing further and owes the discounted total
 *
 * Monthly subscriptions carry no invoice, so they are priced here from the
 * same USD list prices the create form quotes: each partner is charged list
 * less their own commission, and a distributor keeps the difference between
 * its rate and its reseller's.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAdmin } from '@/lib/api-auth';
import { searchAllPages, executeZohoTool, parseMcpResult } from '@/lib/zoho';
import { log } from '@/lib/logger';
import { CSA_INTERNAL_ID, CSA_ZOHO_ID } from '@/lib/constants';
import {
  MONTHLY_SUBSCRIPTION_TAG,
  PERPETUAL_PLAN_TAG,
  findMonthlyProduct,
  monthlyListPrice,
  resellerPrice,
} from '@/lib/subscriptions';

const CSA_BILLING_NAME = 'Civil Survey Applications';

interface PartnerInfo {
  id: string;
  name: string;
  percentage: number;
  distributorPercentage: number;
  distributorId: string | null;
  distributorName: string | null;
  currency: string;
}

interface OrderRow {
  id: string;
  date: string;
  reference: string;
  account: string;
  currency: string;
  total: number;
  direction: 'Reseller' | 'Customer';
  /** Commission the counterparty owes the partner on this order. */
  owedToPartner: number;
  /** What the partner owes the counterparty for this order. */
  owedByPartner: number;
}

interface SubscriptionRow {
  id: string;
  account: string;
  product: string;
  quantity: number;
  perpetualPlan: boolean;
  renewalDate: string | null;
  /** USD the partner is charged per month. */
  monthlyCost: number;
  /** USD the partner is recommended to charge the customer. */
  monthlyList: number;
}

/** Load a reseller's commercial terms from Zoho. */
async function loadPartner(resellerId: string): Promise<PartnerInfo | null> {
  const zohoId = resellerId === CSA_INTERNAL_ID ? CSA_ZOHO_ID : resellerId;
  try {
    const result = await executeZohoTool('get_record', { module: 'Resellers', record_id: zohoId });
    const record = parseMcpResult(result).data[0];
    if (!record) return null;
    const distributor = record.Distributor as { id?: string; name?: string } | null;
    return {
      id: zohoId,
      name: (record.Name as string) || 'Partner',
      percentage: Number(record.Reseller_Sale) || 0,
      distributorPercentage: Number(record.Distributor_Percentage_Rate) || 0,
      distributorId: distributor?.id || null,
      distributorName: distributor?.name || null,
      currency: (record.Currency as string) || 'AUD',
    };
  } catch {
    return null;
  }
}

/** First and last day of a YYYY-MM month, inclusive. */
function monthBounds(month: string): { start: string; end: string; label: string } {
  const [year, m] = month.split('-').map(Number);
  const start = new Date(Date.UTC(year, m - 1, 1));
  const end = new Date(Date.UTC(year, m, 0));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
    label: start.toLocaleDateString('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
  };
}

function tagNames(asset: Record<string, unknown>): string[] {
  const tags = asset.Tag;
  if (!Array.isArray(tags)) return [];
  return tags.map(t => (typeof t === 'string' ? t : (t as { name?: string })?.name || '')).filter(Boolean);
}

/** Reseller-scoped Zoho criteria for one or more partner ids. */
function resellerCriteria(ids: string[]): string {
  if (ids.length === 1) return `(Reseller:equals:${ids[0]})`;
  return `(${ids.map(id => `(Reseller:equals:${id})`).join('or')})`;
}

/**
 * Split one approved order into what the seller is owed and what they owe.
 *
 * `sellerPct` is the commission of the partner who sold it; `buyerPct` is the
 * commission of whoever they settle with — their distributor's rate, or 0 when
 * that is CSA, since CSA takes no commission from itself.
 */
function settleOrder(total: number, direction: 'Reseller' | 'Customer', sellerPct: number, buyerPct: number) {
  if (direction === 'Customer') {
    // The order was billed to the customer at list, so the counterparty
    // collected the money and owes the seller their margin.
    return { owedToPartner: round(total * sellerPct / 100), owedByPartner: 0 };
  }
  // The order was billed to the seller at their discounted rate, so they owe
  // that amount on. Their margin is whatever they charge the customer.
  const listTotal = sellerPct < 100 ? total / ((100 - sellerPct) / 100) : total;
  const counterpartyShare = buyerPct > 0 ? round(listTotal * (100 - buyerPct) / 100) : total;
  return { owedToPartner: 0, owedByPartner: round(Math.min(counterpartyShare, total)) };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  if (!user.permissions.canViewReports) {
    return NextResponse.json({ error: 'You do not have permission to view reports' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const report = searchParams.get('report') || 'statement';
  const month = searchParams.get('month') || new Date().toISOString().slice(0, 7);
  // Admins have no partner of their own, so they pick whose statement to read.
  const requestedPartner = searchParams.get('resellerId');

  const partnerId = requestedPartner && isAdmin(user)
    ? requestedPartner
    : user.resellerId;

  if (!partnerId) {
    return NextResponse.json({ error: 'No partner to report on' }, { status: 400 });
  }

  try {
    const partner = await loadPartner(partnerId);
    if (!partner) {
      return NextResponse.json({ error: 'Partner not found' }, { status: 404 });
    }

    // Child resellers make this a distributor statement as well as a reseller one.
    const children = (await searchAllPages(
      'Resellers',
      `(Distributor:equals:${partner.id})`,
      'id,Name,Reseller_Sale,Currency',
      'asc',
      2
    )).map(r => ({
      id: r.id as string,
      name: (r.Name as string) || 'Reseller',
      percentage: Number(r.Reseller_Sale) || 0,
    }));

    const counterparty = partner.distributorName || CSA_BILLING_NAME;

    if (report === 'schedule') {
      const schedule = await buildSchedule(partner, children);
      return NextResponse.json({ report: 'schedule', partner: partner.name, counterparty, ...schedule });
    }

    const statement = await buildStatement(partner, children, month);
    return NextResponse.json({
      report: 'statement',
      partner: partner.name,
      counterparty,
      isDistributor: children.length > 0,
      ...statement,
    });
  } catch (error) {
    log('error', 'api', 'Partner report failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to build report' }, { status: 500 });
  }
}

/** The month-end reconciliation: orders plus subscriptions, netted per currency. */
async function buildStatement(
  partner: PartnerInfo,
  children: Array<{ id: string; name: string; percentage: number }>,
  month: string
) {
  const { start, end, label } = monthBounds(month);

  const invoices = await searchAllPages(
    'Invoices',
    `${resellerCriteria([partner.id])}and(Invoice_Date:between:${start},${end})`,
    'id,Subject,Reference_Number,Account_Name,Invoice_Date,Status,Grand_Total,Currency,Reseller,Reseller_Direct_Purchase,Record_Status__s',
    'asc'
  );

  // Only approved orders are real money; drafts and trashed records are not.
  const counterpartyPct = partner.distributorId ? partner.distributorPercentage : 0;
  const orders: OrderRow[] = [];
  for (const inv of invoices) {
    if (inv.Record_Status__s === 'Trash') continue;
    if (inv.Status !== 'Approved') continue;

    const total = Number(inv.Grand_Total) || 0;
    const direction: 'Reseller' | 'Customer' = inv.Reseller_Direct_Purchase ? 'Reseller' : 'Customer';
    const settled = settleOrder(total, direction, partner.percentage, counterpartyPct);

    orders.push({
      id: inv.id as string,
      date: (inv.Invoice_Date as string) || '',
      reference: (inv.Reference_Number as string) || (inv.Subject as string) || '',
      account: (inv.Account_Name as { name?: string } | null)?.name || '',
      currency: (inv.Currency as string) || partner.currency,
      total,
      direction,
      ...settled,
    });
  }

  const subscriptions = await loadSubscriptions([partner.id], partner.percentage);
  const subscriptionCost = round(subscriptions.reduce((sum, s) => sum + s.monthlyCost * s.quantity, 0));

  // Orders settle in the currency they were raised in; subscriptions are USD.
  const orderTotals: Record<string, { owedToYou: number; youOwe: number }> = {};
  for (const order of orders) {
    const slot = orderTotals[order.currency] ||= { owedToYou: 0, youOwe: 0 };
    slot.owedToYou = round(slot.owedToYou + order.owedToPartner);
    slot.youOwe = round(slot.youOwe + order.owedByPartner);
  }

  // A distributor also settles with each child: it collects what the child owes
  // and pays the child its commission.
  const childStatements = [];
  for (const child of children) {
    const childInvoices = await searchAllPages(
      'Invoices',
      `${resellerCriteria([child.id])}and(Invoice_Date:between:${start},${end})`,
      'id,Reference_Number,Account_Name,Invoice_Date,Status,Grand_Total,Currency,Reseller_Direct_Purchase,Record_Status__s',
      'asc'
    );

    let owedToDistributor = 0;
    let owedByDistributor = 0;
    let currency = partner.currency;
    let orderCount = 0;

    for (const inv of childInvoices) {
      if (inv.Record_Status__s === 'Trash') continue;
      if (inv.Status !== 'Approved') continue;
      orderCount++;
      currency = (inv.Currency as string) || currency;
      const total = Number(inv.Grand_Total) || 0;
      const direction: 'Reseller' | 'Customer' = inv.Reseller_Direct_Purchase ? 'Reseller' : 'Customer';
      const settled = settleOrder(total, direction, child.percentage, partner.distributorPercentage);
      // Mirrored: what the child owes is what the distributor is owed.
      owedToDistributor = round(owedToDistributor + settled.owedByPartner);
      owedByDistributor = round(owedByDistributor + settled.owedToPartner);
    }

    const childSubs = await loadSubscriptions([child.id], child.percentage);
    const childSubCost = round(childSubs.reduce((sum, s) => sum + s.monthlyCost * s.quantity, 0));

    childStatements.push({
      resellerId: child.id,
      resellerName: child.name,
      orderCount,
      currency,
      owedToYou: round(owedToDistributor + childSubCost),
      youOweThem: owedByDistributor,
      subscriptionCount: childSubs.length,
      subscriptionCost: childSubCost,
    });
  }

  return {
    month,
    monthLabel: label,
    orders,
    subscriptions,
    subscriptionCost,
    orderTotals,
    childStatements,
    /** Subscriptions are billed in USD regardless of the order currency. */
    subscriptionCurrency: 'USD',
  };
}

/** Forward-looking view: what the active subscription base costs per month. */
async function buildSchedule(
  partner: PartnerInfo,
  children: Array<{ id: string; name: string; percentage: number }>
) {
  const own = await loadSubscriptions([partner.id], partner.percentage);

  const childRows = [];
  for (const child of children) {
    const subs = await loadSubscriptions([child.id], child.percentage);
    if (subs.length === 0) continue;
    childRows.push({
      resellerId: child.id,
      resellerName: child.name,
      subscriptions: subs,
      monthlyCost: round(subs.reduce((sum, s) => sum + s.monthlyCost * s.quantity, 0)),
    });
  }

  const monthlyCost = round(own.reduce((sum, s) => sum + s.monthlyCost * s.quantity, 0));
  const monthlyList = round(own.reduce((sum, s) => sum + s.monthlyList * s.quantity, 0));

  return {
    subscriptions: own,
    monthlyCost,
    monthlyList,
    /** What the base costs over a year at today's rate. */
    annualisedCost: round(monthlyCost * 12),
    childRows,
    currency: 'USD',
  };
}

/** Active monthly subscription assets for one or more resellers, priced. */
async function loadSubscriptions(resellerIds: string[], percentage: number): Promise<SubscriptionRow[]> {
  const assets = await searchAllPages(
    'Assets1',
    `${resellerCriteria(resellerIds)}and(Status:equals:Active)`,
    'id,Name,Account,Product,Product_Code,Quantity,Renewal_Date,Tag,Record_Status__s',
    'asc'
  );

  const rows: SubscriptionRow[] = [];
  for (const asset of assets) {
    if (asset.Record_Status__s === 'Trash') continue;
    const tags = tagNames(asset);
    if (!tags.includes(MONTHLY_SUBSCRIPTION_TAG)) continue;

    const perpetualPlan = tags.includes(PERPETUAL_PLAN_TAG);
    const code = ((asset.Product_Code as string) || '').split('-')[0];
    const product = findMonthlyProduct(code);
    // A subscription on a product no longer in the line-up still exists and
    // still bills, but we cannot price it — surfaced as zero rather than
    // guessed at, and the view flags it.
    const list = product ? monthlyListPrice(product, perpetualPlan) ?? 0 : 0;

    rows.push({
      id: asset.id as string,
      account: (asset.Account as { name?: string } | null)?.name || '',
      product: (asset.Product as { name?: string } | null)?.name || (asset.Name as string) || '',
      quantity: Number(asset.Quantity) || 1,
      perpetualPlan,
      renewalDate: (asset.Renewal_Date as string) || null,
      monthlyCost: resellerPrice(list, percentage),
      monthlyList: list,
    });
  }

  return rows;
}
