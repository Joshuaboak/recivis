import { NextRequest, NextResponse } from 'next/server';
import { searchAllPages } from '@/lib/zoho';
import { log } from '@/lib/logger';
import { requireAuth } from '@/lib/api-auth';

/**
 * POST /api/coupons/validate — validate a coupon code against invoice context
 * Body: { code, resellerRegion, resellerId, invoiceType, subtotal }
 * Returns: { valid, coupon, error?, discountProductId?, discountAmount? }
 */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  try {
    const body = await request.json();
    const { code, invoiceType, subtotal } = body;
    // Use server-side auth context for region and partner — never trust client-provided values
    const resellerRegion = user.resellerRegion;
    const resellerId = user.resellerId;

    if (!code) {
      return NextResponse.json({ valid: false, error: 'Coupon code is required' });
    }

    // Search for the coupon by code
    const fields = 'Name,Coupon_Name,Discount_Type,Discount_Percentage,Discount_Amount,Currency,Status,Coupon_Start_Date,Coupon_End_Date,Total_Usage_Allowance,Remaining_Uses,Region_Restrictions,Regions,Partner_Restrictions,Partners,Product_Restrictions,Allowed_Products,Order_Type_Restrictions,Order_Type,Usage_Restrictions,Minimum_Order_Value,Maximum_Order_Value,Discount_Product,Record_Status__s';

    let coupons: Record<string, unknown>[] = [];
    try {
      coupons = await searchAllPages('Coupons', `(Name:equals:${code})`, fields, 'desc', 1);
    } catch { /* no results */ }

    if (coupons.length === 0) {
      return NextResponse.json({ valid: false, error: 'Coupon code not found' });
    }

    const coupon = coupons[0];

    // Status check
    if (coupon.Status !== 'Active') {
      return NextResponse.json({ valid: false, error: `Coupon is ${coupon.Status || 'not active'}`, coupon });
    }

    // Date check
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    if (coupon.Coupon_Start_Date) {
      const start = new Date(coupon.Coupon_Start_Date as string);
      if (now < start) {
        return NextResponse.json({ valid: false, error: 'Coupon has not started yet', coupon });
      }
    }
    if (coupon.Coupon_End_Date) {
      const end = new Date(coupon.Coupon_End_Date as string);
      if (now > end) {
        return NextResponse.json({ valid: false, error: 'Coupon has expired', coupon });
      }
    }

    // Usage check
    if (coupon.Total_Usage_Allowance && coupon.Remaining_Uses !== null && coupon.Remaining_Uses !== undefined) {
      if ((coupon.Remaining_Uses as number) <= 0) {
        return NextResponse.json({ valid: false, error: 'Coupon has no remaining uses', coupon });
      }
    }

    // Region check
    if (coupon.Region_Restrictions && resellerRegion) {
      const regions = Array.isArray(coupon.Regions)
        ? coupon.Regions as string[]
        : (coupon.Regions as string || '').split(';').filter(Boolean);
      if (regions.length > 0 && !regions.includes(resellerRegion)) {
        return NextResponse.json({ valid: false, error: 'Coupon is not available in your region', coupon });
      }
    }

    // Partner check
    if (coupon.Partner_Restrictions && resellerId) {
      const partners = Array.isArray(coupon.Partners)
        ? (coupon.Partners as { id?: string }[]).map(p => p.id)
        : [];
      if (partners.length > 0 && !partners.includes(resellerId)) {
        return NextResponse.json({ valid: false, error: 'Coupon is not available for your reseller', coupon });
      }
    }

    // Order type check
    if (coupon.Order_Type_Restrictions && invoiceType) {
      const orderTypes = Array.isArray(coupon.Order_Type)
        ? coupon.Order_Type as string[]
        : (coupon.Order_Type as string || '').split(';').filter(Boolean);
      if (orderTypes.length > 0 && !orderTypes.includes(invoiceType)) {
        return NextResponse.json({ valid: false, error: `Coupon is not valid for ${invoiceType} invoices`, coupon });
      }
    }

    // Order value check
    if (coupon.Usage_Restrictions && subtotal !== undefined) {
      if (coupon.Minimum_Order_Value && subtotal < (coupon.Minimum_Order_Value as number)) {
        return NextResponse.json({ valid: false, error: `Minimum order value is $${(coupon.Minimum_Order_Value as number).toFixed(2)}`, coupon });
      }
      if (coupon.Maximum_Order_Value && subtotal > (coupon.Maximum_Order_Value as number)) {
        return NextResponse.json({ valid: false, error: `Maximum order value is $${(coupon.Maximum_Order_Value as number).toFixed(2)}`, coupon });
      }
    }

    // Calculate discount
    let discountAmount = 0;
    if (coupon.Discount_Type === 'Percentage Based') {
      discountAmount = (subtotal || 0) * ((coupon.Discount_Percentage as number) || 0) / 100;
    } else if (coupon.Discount_Type === 'Fixed Amount') {
      discountAmount = (coupon.Discount_Amount as number) || 0;
    }

    const discountProduct = coupon.Discount_Product as { id?: string; name?: string } | null;

    log('info', 'api', `Coupon ${code} validated`, { valid: true, discountAmount });

    return NextResponse.json({
      valid: true,
      coupon,
      discountProductId: discountProduct?.id || null,
      discountProductName: discountProduct?.name || null,
      discountAmount,
    });
  } catch (error) {
    log('error', 'api', 'Coupon validation failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ valid: false, error: 'Validation failed' });
  }
}
