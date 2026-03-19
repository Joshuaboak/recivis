import { NextRequest, NextResponse } from 'next/server';
import { searchAllPages, getAllRecordPages, executeZohoTool, parseMcpResult } from '@/lib/zoho';
import { log } from '@/lib/logger';

const FIELDS = 'Name,Coupon_Name,Coupon_Description,Discount_Type,Discount_Percentage,Discount_Amount,Currency,Status,Coupon_Start_Date,Coupon_End_Date,Total_Usage_Allowance,Remaining_Uses,Region_Restrictions,Regions,Partner_Restrictions,Product_Restrictions,Allowed_Products,Order_Type_Restrictions,Order_Type,Usage_Restrictions,Minimum_Order_Value,Maximum_Order_Value,Discount_Product,Record_Status__s';

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

    // 1. Create the coupon record
    const result = await executeZohoTool('create_records', {
      module: 'Coupons',
      records: [body],
      trigger: [],
    });

    const parsed = parseMcpResult(result);
    const created = parsed.data[0] as Record<string, unknown> | undefined;
    let couponId: string | null = null;

    if (created?.code === 'SUCCESS') {
      const details = created.details as Record<string, unknown>;
      couponId = details?.id as string;
      log('info', 'api', 'Coupon created', { id: couponId });
    }

    if (!couponId) {
      log('warn', 'api', 'Coupon creation result', { data: JSON.stringify(parsed.data).slice(0, 300) });
      return NextResponse.json({ success: false, error: 'Failed to create coupon', data: parsed.data }, { status: 400 });
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
