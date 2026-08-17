/**
 * POST /api/subscriptions/renew — Extend a monthly subscription by 30 days.
 *
 * A renewal does exactly two things: it moves Renewal_Date on by a term, and
 * it stamps Last_Renewal_Transaction with the period just paid for. No licence
 * is regenerated and no key is re-issued — the asset is already live, this
 * only buys it another month.
 *
 * Gated on the Allow Monthly Subscriptions partner permission, and refuses any
 * asset that is not tagged as a monthly subscription.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAdmin } from '@/lib/api-auth';
import { executeZohoTool, parseMcpResult } from '@/lib/zoho';
import { log } from '@/lib/logger';
import { MONTHLY_SUBSCRIPTION_TAG, renewalDates, todayIso } from '@/lib/subscriptions';

/** Zoho returns record tags as objects; we only care about their names. */
function tagNames(asset: Record<string, unknown>): string[] {
  const tags = asset.Tag;
  if (!Array.isArray(tags)) return [];
  return tags.map(t => (typeof t === 'string' ? t : (t as { name?: string })?.name || ''));
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  if (!user.permissions.canMonthlySubscriptions) {
    return NextResponse.json({ error: 'You do not have permission to renew monthly subscriptions' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const assetIds: string[] = Array.isArray(body.assetIds)
      ? body.assetIds
      : body.assetId ? [body.assetId] : [];

    if (assetIds.length === 0) {
      return NextResponse.json({ error: 'assetId or assetIds is required' }, { status: 400 });
    }

    const today = todayIso();
    const renewed: Array<{ id: string; renewalDate: string; lastRenewalTransaction: string }> = [];
    const failed: Array<{ id: string; reason: string }> = [];

    for (const assetId of assetIds) {
      const result = await executeZohoTool('get_record', { module: 'Assets1', record_id: assetId });
      const asset = parseMcpResult(result).data[0];

      if (!asset) {
        failed.push({ id: assetId, reason: 'Asset not found' });
        continue;
      }

      if (!tagNames(asset).includes(MONTHLY_SUBSCRIPTION_TAG)) {
        failed.push({ id: assetId, reason: 'Not a monthly subscription' });
        continue;
      }

      // Ownership — an asset carries the reseller it was sold through.
      if (!isAdmin(user) && user.allowedResellerIds.length > 0) {
        const assetReseller = (asset.Reseller as { id?: string } | null)?.id;
        if (assetReseller && !user.allowedResellerIds.includes(assetReseller)) {
          failed.push({ id: assetId, reason: 'Not your subscription' });
          continue;
        }
      }

      const dates = renewalDates((asset.Renewal_Date as string) || null, today);

      const updateResult = await executeZohoTool('update_records', {
        module: 'Assets1',
        records: [{
          id: assetId,
          Renewal_Date: dates.renewalDate,
          Last_Renewal_Transaction: dates.lastRenewalTransaction,
          // A lapsed subscription being paid for again goes back into service.
          Status: 'Active',
        }],
        trigger: [],
      });

      const updated = (parseMcpResult(updateResult).data as Record<string, unknown>[])?.[0];
      if (!updated || updated.code !== 'SUCCESS') {
        failed.push({ id: assetId, reason: (updated?.message as string) || 'Zoho rejected the update' });
        continue;
      }

      renewed.push({ id: assetId, ...dates });
    }

    log('info', 'api', 'Monthly subscriptions renewed', {
      renewed: renewed.length,
      failed: failed.length,
      by: user.email,
    });

    // A partial failure is still reported 200 with both lists — the caller
    // shows which ones went through rather than assuming all or nothing.
    return NextResponse.json({ success: failed.length === 0, renewed, failed });
  } catch (error) {
    log('error', 'api', 'Monthly subscription renewal failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to renew subscription' }, { status: 500 });
  }
}
