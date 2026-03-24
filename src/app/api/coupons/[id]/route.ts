/**
 * /api/coupons/[id] — Coupon detail and update.
 *
 * GET: Fetches a single coupon record from Zoho CRM by ID (via MCP — reads are fine).
 * PATCH: Updates coupon fields (admin-only) via REST API with OAuth token,
 *        because MCP is not authorised for Coupons module writes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { executeZohoTool, parseMcpResult } from '@/lib/zoho';
import { log } from '@/lib/logger';
import { requireAuth, isAdmin, type AuthUser } from '@/lib/api-auth';
import { cacheInvalidatePattern } from '@/lib/cache';

/** Check if a non-admin user is allowed to view this coupon based on restrictions. */
function userCanAccessCoupon(coupon: Record<string, unknown>, user: AuthUser): boolean {
  if (coupon.Region_Restrictions) {
    const regions = Array.isArray(coupon.Regions) ? coupon.Regions as string[] : [];
    if (regions.length > 0 && (!user.resellerRegion || !regions.includes(user.resellerRegion))) {
      return false;
    }
  }
  if (coupon.Partner_Restrictions) {
    const partners = Array.isArray(coupon.Partners)
      ? (coupon.Partners as { id?: string }[]).map(p => p.id)
      : [];
    if (partners.length > 0 && (!user.resellerId || !partners.includes(user.resellerId))) {
      return false;
    }
  }
  return true;
}

/** Build the URL for the Deluge function that returns a scoped OAuth token. */
function getTokenUrl(): string {
  const key = process.env.ZOHO_API_KEY;
  if (!key) throw new Error('ZOHO_API_KEY not set');
  return `https://www.zohoapis.com.au/crm/v7/functions/getresellerzohotoken/actions/execute?auth_type=apikey&zapikey=${key}&arguments=%7B%22resellerName%22%3A%22Civil%20Survey%20Applications%22%7D`;
}

/** In-memory cache for the OAuth token (1-hour TTL with 1-minute buffer). */
let cachedToken: { token: string; expiresAt: number } | null = null;

/** Fetch or return a cached OAuth token for Zoho REST API calls. */
async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60000) return cachedToken.token;
  const res = await fetch(getTokenUrl(), { method: 'POST' });
  const data = await res.json();
  const token = data?.details?.output;
  if (!token || token.startsWith('ERROR')) throw new Error(`Token error: ${token}`);
  cachedToken = { token, expiresAt: Date.now() + 3600000 };
  return token;
}

/**
 * GET /api/coupons/[id] — get coupon detail
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  const { id } = await params;
  try {
    const result = await executeZohoTool('get_record', { module: 'Coupons', record_id: id });
    const parsed = parseMcpResult(result);
    const coupon = parsed.data[0] as Record<string, unknown> | undefined;

    // Non-admin users cannot view coupons restricted to other regions/partners
    if (coupon && !isAdmin(user) && !userCanAccessCoupon(coupon, user)) {
      return NextResponse.json({ error: 'You do not have access to this coupon' }, { status: 403 });
    }

    return NextResponse.json({ coupon: coupon || null });
  } catch (error) {
    log('error', 'api', `Coupon detail failed for ${id}`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to load coupon' }, { status: 500 });
  }
}

/**
 * PATCH /api/coupons/[id] — update coupon via REST API (MCP not authorised for writes)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  if (!isAdmin(user)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  try {
    const body = await request.json();
    const accessToken = await getAccessToken();

    const updateRes = await fetch(`https://www.zohoapis.com.au/crm/v7/Coupons`, {
      method: 'PUT',
      headers: {
        'Authorization': `Zoho-oauthtoken ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data: [{ id, ...body }], trigger: [] }),
    });
    const updateData = await updateRes.json();

    const updated = updateData?.data?.[0];
    if (updated?.code !== 'SUCCESS') {
      log('warn', 'api', `Coupon update result for ${id}`, { data: JSON.stringify(updateData).slice(0, 300) });
      return NextResponse.json({ success: false, error: updated?.message || 'Failed to update coupon', data: updateData?.data || [] }, { status: 400 });
    }

    log('info', 'api', `Coupon ${id} updated by ${user.email}`);
    await cacheInvalidatePattern('coupons:*');
    return NextResponse.json({ success: true, data: updateData.data });
  } catch (error) {
    log('error', 'api', `Coupon update failed for ${id}`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to update coupon' }, { status: 500 });
  }
}
