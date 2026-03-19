import { NextRequest, NextResponse } from 'next/server';
import { getAllRecordPages } from '@/lib/zoho';
import { log } from '@/lib/logger';

const FIELDS = 'Name,Coupon_Name,Coupon_Description,Discount_Type,Discount_Percentage,Discount_Amount,Currency,Status,Coupon_Start_Date,Coupon_End_Date,Total_Usage_Allowance,Remaining_Uses,Region_Restrictions,Regions,Partner_Restrictions,Partners,Product_Restrictions,Allowed_Products,Order_Type_Restrictions,Order_Type,Usage_Restrictions,Minimum_Order_Value,Maximum_Order_Value,Discount_Product,Record_Status__s';

const TOKEN_URL = 'https://www.zohoapis.com.au/crm/v7/functions/getresellerzohotoken/actions/execute?auth_type=apikey&zapikey=1003.c34f94ef513dd69ce6eada9d6d97dc31.35c2e6e02fc62c21dfcfb5c3391e8e6d&arguments=%7B%22resellerName%22%3A%22Civil%20Survey%20Applications%22%7D';

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60000) return cachedToken.token;
  const res = await fetch(TOKEN_URL, { method: 'POST' });
  const data = await res.json();
  const token = data?.details?.output;
  if (!token || token.startsWith('ERROR')) throw new Error(`Token error: ${token}`);
  cachedToken = { token, expiresAt: Date.now() + 3600000 };
  return token;
}

/**
 * GET /api/coupons — list all coupons
 */
export async function GET() {
  try {
    const allRecords = await getAllRecordPages('Coupons', FIELDS, 'Created_Time', 'desc');
    const coupons = allRecords.filter(r => r.Record_Status__s !== 'Trash');
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
    const zapikey = process.env.ZOHO_API_KEY || '1003.c34f94ef513dd69ce6eada9d6d97dc31.35c2e6e02fc62c21dfcfb5c3391e8e6d';
    const fnUrl = `https://www.zohoapis.com.au/crm/v7/functions/create_coupon_product/actions/execute?auth_type=apikey&zapikey=${zapikey}&arguments=${encodeURIComponent(
      JSON.stringify({ couponID: couponId })
    )}`;

    const fnRes = await fetch(fnUrl, { method: 'POST' });
    const fnResult = await fnRes.json();
    log('info', 'api', 'Coupon product created', { couponId, result: JSON.stringify(fnResult).slice(0, 300) });

    return NextResponse.json({ success: true, id: couponId, productResult: fnResult });
  } catch (error) {
    log('error', 'api', 'Coupon creation failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to create coupon' }, { status: 500 });
  }
}
