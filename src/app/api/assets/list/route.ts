/**
 * GET /api/assets/list?scope=all|renewals|expired|subscriptions
 *
 * The backing query for the Assets section. Assets are individual records in
 * Zoho but partners think in customers, so everything is returned grouped by
 * account with the group's most urgent renewal driving its position.
 *
 * Scopes:
 *   all           — every asset the caller can see, newest renewal first
 *   renewals      — active, renewing within 60 days, soonest first
 *   expired       — lapsed within the last 60 days, most recent first
 *   subscriptions — assets tagged Monthly Subscription
 *
 * Tag filtering happens here rather than in the Zoho query: tags are not a
 * searchable field, so the set is fetched and filtered in memory.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAdmin } from '@/lib/api-auth';
import { searchAllPages, getAllRecordPages } from '@/lib/zoho';
import { log } from '@/lib/logger';
import { MONTHLY_SUBSCRIPTION_TAG, PERPETUAL_PLAN_TAG } from '@/lib/subscriptions';

/** How far ahead "due for renewal" looks, and how far back "recently expired" reaches. */
const WINDOW_DAYS = 60;

const ASSET_FIELDS = [
  'id', 'Name', 'Account', 'Product', 'Product_Code', 'Status', 'Quantity',
  'Serial_Key', 'Start_Date', 'Renewal_Date', 'Days_to_Renewal', 'Reseller',
  'Evaluation_License', 'Tag', 'Asset_Type', 'Record_Status__s',
].join(',');

export type AssetScope = 'all' | 'renewals' | 'expired' | 'subscriptions';

interface AssetRow {
  id: string;
  name: string;
  accountId: string;
  accountName: string;
  productName: string;
  productCode: string;
  status: string;
  quantity: number;
  serialKey: string;
  startDate: string | null;
  renewalDate: string | null;
  daysToRenewal: number | null;
  tags: string[];
  isMonthlySubscription: boolean;
  isPerpetualPlan: boolean;
  isEvaluation: boolean;
}

interface AccountGroup {
  accountId: string;
  accountName: string;
  assets: AssetRow[];
  /** Soonest renewal in the group — what the group sorts on. */
  nextRenewal: string | null;
}

function tagNames(asset: Record<string, unknown>): string[] {
  const tags = asset.Tag;
  if (!Array.isArray(tags)) return [];
  return tags
    .map(t => (typeof t === 'string' ? t : (t as { name?: string })?.name || ''))
    .filter(Boolean);
}

/** Whole days from today to an ISO date; negative once the date has passed. */
function daysUntil(iso: string | null, todayMs: number): number | null {
  if (!iso) return null;
  const target = new Date(`${iso}T00:00:00Z`).getTime();
  if (Number.isNaN(target)) return null;
  return Math.round((target - todayMs) / 86400000);
}

function toRow(asset: Record<string, unknown>, todayMs: number): AssetRow {
  const tags = tagNames(asset);
  const renewalDate = (asset.Renewal_Date as string) || null;
  return {
    id: asset.id as string,
    name: (asset.Name as string) || '',
    accountId: (asset.Account as { id?: string } | null)?.id || 'unassigned',
    accountName: (asset.Account as { name?: string } | null)?.name || 'Unassigned',
    productName: (asset.Product as { name?: string } | null)?.name || '',
    productCode: (asset.Product_Code as string) || '',
    status: (asset.Status as string) || '',
    quantity: Number(asset.Quantity) || 0,
    serialKey: (asset.Serial_Key as string) || '',
    startDate: (asset.Start_Date as string) || null,
    renewalDate,
    // Zoho's own Days_to_Renewal is a formula field refreshed on a schedule, so
    // it can lag by a day. Recomputing keeps the 60-day windows honest.
    daysToRenewal: daysUntil(renewalDate, todayMs),
    tags,
    isMonthlySubscription: tags.includes(MONTHLY_SUBSCRIPTION_TAG),
    isPerpetualPlan: tags.includes(PERPETUAL_PLAN_TAG),
    isEvaluation: asset.Evaluation_License === true,
  };
}

/** Build the reseller-scoped Zoho criteria, or null when the caller sees everything. */
function resellerCriteria(ids: string[]): string | null {
  if (ids.length === 0) return null;
  if (ids.length === 1) return `(Reseller:equals:${ids[0]})`;
  return `(${ids.map(id => `(Reseller:equals:${id})`).join('or')})`;
}

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  const { searchParams } = new URL(request.url);
  const scope = (searchParams.get('scope') || 'all') as AssetScope;
  const statusFilter = searchParams.get('status') || '';
  const search = (searchParams.get('search') || '').toLowerCase().trim();

  if (scope === 'subscriptions' && !user.permissions.canMonthlySubscriptions) {
    return NextResponse.json({ error: 'You do not have permission to view monthly subscriptions' }, { status: 403 });
  }

  try {
    const criteria = isAdmin(user) ? null : resellerCriteria(user.allowedResellerIds);

    // A non-admin with no reseller has nothing to show — returning early
    // avoids an unscoped fetch of every asset in the CRM.
    if (!isAdmin(user) && !criteria) {
      return NextResponse.json({ groups: [], total: 0, scope });
    }

    const raw = criteria
      ? await searchAllPages('Assets1', criteria, ASSET_FIELDS, 'desc')
      : await getAllRecordPages('Assets1', ASSET_FIELDS, 'Modified_Time', 'desc');

    const todayMs = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').getTime();

    let rows = raw
      .filter(a => a.Record_Status__s !== 'Trash')
      .map(a => toRow(a, todayMs));

    if (scope === 'renewals') {
      rows = rows.filter(r =>
        r.status === 'Active' && r.daysToRenewal !== null && r.daysToRenewal >= 0 && r.daysToRenewal <= WINDOW_DAYS
      );
      rows.sort((a, b) => (a.daysToRenewal ?? 0) - (b.daysToRenewal ?? 0));
    } else if (scope === 'expired') {
      // "Recently expired" mirrors the upcoming window: gone, but within the
      // last 60 days. Most recently lapsed first.
      rows = rows.filter(r =>
        r.daysToRenewal !== null && r.daysToRenewal < 0 && r.daysToRenewal >= -WINDOW_DAYS
      );
      rows.sort((a, b) => (b.daysToRenewal ?? 0) - (a.daysToRenewal ?? 0));
    } else if (scope === 'subscriptions') {
      rows = rows.filter(r => r.isMonthlySubscription);
      rows.sort((a, b) => (a.daysToRenewal ?? 0) - (b.daysToRenewal ?? 0));
    } else {
      rows.sort((a, b) => (b.renewalDate || '').localeCompare(a.renewalDate || ''));
    }

    if (statusFilter) rows = rows.filter(r => r.status === statusFilter);
    if (search) {
      rows = rows.filter(r =>
        r.accountName.toLowerCase().includes(search) ||
        r.productName.toLowerCase().includes(search) ||
        r.serialKey.toLowerCase().includes(search)
      );
    }

    // Group by account, preserving the scope's ordering within each group and
    // ranking groups by whichever of their assets is most urgent.
    const groupMap = new Map<string, AccountGroup>();
    for (const row of rows) {
      let group = groupMap.get(row.accountId);
      if (!group) {
        group = { accountId: row.accountId, accountName: row.accountName, assets: [], nextRenewal: null };
        groupMap.set(row.accountId, group);
      }
      group.assets.push(row);
      if (row.renewalDate && (!group.nextRenewal || row.renewalDate < group.nextRenewal)) {
        group.nextRenewal = row.renewalDate;
      }
    }

    const groups = Array.from(groupMap.values());
    if (scope === 'expired') {
      groups.sort((a, b) => (b.nextRenewal || '').localeCompare(a.nextRenewal || ''));
    } else if (scope === 'all') {
      groups.sort((a, b) => a.accountName.localeCompare(b.accountName));
    } else {
      groups.sort((a, b) => (a.nextRenewal || '9999').localeCompare(b.nextRenewal || '9999'));
    }

    return NextResponse.json({ groups, total: rows.length, scope });
  } catch (error) {
    log('error', 'api', 'Asset list failed', {
      scope,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to load assets' }, { status: 500 });
  }
}
