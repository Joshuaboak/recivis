import { NextRequest, NextResponse } from 'next/server';
import { executeZohoTool, parseMcpResult } from '@/lib/zoho';
import { log } from '@/lib/logger';
import { requireAuth, isAdmin } from '@/lib/api-auth';

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
    return NextResponse.json({ coupon: parsed.data[0] || null });
  } catch (error) {
    log('error', 'api', `Coupon detail failed for ${id}`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to load coupon' }, { status: 500 });
  }
}

/**
 * PATCH /api/coupons/[id] — update coupon
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
    const result = await executeZohoTool('update_records', {
      module: 'Coupons',
      records: [{ id, ...body }],
      trigger: [],
    });
    const parsed = parseMcpResult(result);
    log('info', 'api', `Coupon ${id} updated`);
    return NextResponse.json({ success: true, data: parsed.data });
  } catch (error) {
    log('error', 'api', `Coupon update failed for ${id}`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to update coupon' }, { status: 500 });
  }
}
