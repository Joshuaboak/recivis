/**
 * /api/coupons — List and create discount coupons.
 *
 * GET: Returns all coupons from Zoho CRM with Redis caching (2-minute TTL).
 *
 * POST: Two-step coupon creation (admin-only):
 *   1. Creates the Coupon record via the Zoho REST API (not MCP, because the
 *      MCP endpoint is not authorised for Coupons module writes)
 *   2. Calls a Deluge function to create the associated Discount Product record
 *      (the product that gets added as a negative line item on invoices)
 *
 * Auth for writes uses a reseller-scoped OAuth token fetched via a Deluge function,
 * since the MCP key doesn't have Coupons write permission.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAllRecordPages } from '@/lib/zoho';
import { log } from '@/lib/logger';
import { requireAuth, isAdmin, type AuthUser } from '@/lib/api-auth';
import { cacheGet, cacheSet, cacheInvalidatePattern } from '@/lib/cache';

/** Filter coupons by region and partner restrictions for non-admin users. */
function filterCouponsForUser(coupons: Record<string, unknown>[], user: AuthUser): Record<string, unknown>[] {
  return coupons.filter(c => {
    // Region restriction check
    if (c.Region_Restrictions) {
      const regions = Array.isArray(c.Regions) ? c.Regions as string[] : [];
      if (regions.length > 0 && (!user.resellerRegion || !regions.includes(user.resellerRegion))) {
        return false;
      }
    }
    // Partner restriction check
    if (c.Partner_Restrictions) {
      const partners = Array.isArray(c.Partners)
        ? (c.Partners as { id?: string }[]).map(p => p.id)
        : [];
      if (partners.length > 0 && (!user.resellerId || !partners.includes(user.resellerId))) {
        return false;
      }
    }
    return true;
  });
}

const FIELDS = 'Name,Coupon_Name,Coupon_Description,Discount_Type,Discount_Percentage,Discount_Amount,Currency,Status,Coupon_Start_Date,Coupon_End_Date,Total_Usage_Allowance,Remaining_Uses,Region_Restrictions,Regions,Partner_Restrictions,Partners,Product_Restrictions,Allowed_Products,Order_Type_Restrictions,Order_Type,Usage_Restrictions,Minimum_Order_Value,Maximum_Order_Value,Discount_Product,Record_Status__s';

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
 * GET /api/coupons — list all coupons
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  try {
    // Fetch all coupons (cached 2 min), then filter by user permissions
    const cacheKey = 'coupons:all';
    let allCoupons: Record<string, unknown>[];
    const cached = await cacheGet<{ coupons: Record<string, unknown>[] }>(cacheKey);
    if (cached) {
      allCoupons = cached.coupons;
    } else {
      const allRecords = await getAllRecordPages('Coupons', FIELDS, 'Created_Time', 'desc');
      allCoupons = allRecords.filter(r => r.Record_Status__s !== 'Trash');
      await cacheSet(cacheKey, { coupons: allCoupons }, 120);
    }

    // Admin/IBM see all coupons; others only see coupons valid for their region + partner
    const coupons = isAdmin(user) ? allCoupons : filterCouponsForUser(allCoupons, user);

    return NextResponse.json({ coupons });
  } catch (error) {
    log('error', 'api', 'Coupons fetch failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ coupons: [] });
  }
}

/**
 * POST /api/coupons — create a coupon, then call create_coupon_product
 */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  if (!isAdmin(user)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();

    // 1. Create the coupon record via REST API (MCP not authorised for Coupons writes)
    const accessToken = await getAccessToken();
    const createRes = await fetch('https://www.zohoapis.com.au/crm/v7/Coupons', {
      method: 'POST',
      headers: {
        'Authorization': `Zoho-oauthtoken ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data: [body], trigger: [] }),
    });
    const createData = await createRes.json();

    let couponId: string | null = null;
    const created = createData?.data?.[0];
    if (created?.code === 'SUCCESS') {
      couponId = created.details?.id;
      log('info', 'api', 'Coupon created', { id: couponId });
    }

    if (!couponId) {
      log('warn', 'api', 'Coupon creation result', { data: JSON.stringify(createData).slice(0, 300) });
      return NextResponse.json({ success: false, error: 'Failed to create coupon', data: createData?.data || [] }, { status: 400 });
    }

    // 2. Call create_coupon_product function
    const zapikey = process.env.ZOHO_API_KEY;
    if (!zapikey) throw new Error('ZOHO_API_KEY not set');
    const fnUrl = `https://www.zohoapis.com.au/crm/v7/functions/create_coupon_product/actions/execute?auth_type=apikey&zapikey=${zapikey}&arguments=${encodeURIComponent(
      JSON.stringify({ couponId: couponId })
    )}`;

    const fnRes = await fetch(fnUrl, { method: 'POST' });
    const fnResult = await fnRes.json();
    log('info', 'api', 'Coupon product created', { couponId, result: JSON.stringify(fnResult).slice(0, 300) });

    // Invalidate cached coupon list since a new coupon was created
    await cacheInvalidatePattern('coupons:*');

    return NextResponse.json({ success: true, id: couponId, productResult: fnResult });
  } catch (error) {
    log('error', 'api', 'Coupon creation failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to create coupon' }, { status: 500 });
  }
}
