import { NextRequest, NextResponse } from 'next/server';
import { executeZohoTool, parseMcpResult } from '@/lib/zoho';
import { query } from '@/lib/db';
import { log } from '@/lib/logger';

// Map csa-internal to the actual Zoho reseller ID for CSA
const CSA_ZOHO_ID = '55779000000560184';
const CSA_INTERNAL_ID = 'csa-internal';

/**
 * GET /api/resellers/[id] — get reseller detail + users
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    // Fetch reseller from Zoho
    const zohoId = id === CSA_INTERNAL_ID ? CSA_ZOHO_ID : id;
    const result = await executeZohoTool('get_record', { module: 'Resellers', record_id: zohoId });
    const parsed = parseMcpResult(result);
    const reseller = parsed.data[0] || null;

    // Fetch users from PostgreSQL — match both the Zoho ID and csa-internal for CSA
    const userIds = [id];
    if (id === CSA_ZOHO_ID || id === CSA_INTERNAL_ID) {
      userIds.push(CSA_ZOHO_ID, CSA_INTERNAL_ID);
    }
    const placeholders = userIds.map((_, i) => `$${i + 1}`).join(',');
    const usersResult = await query(
      `SELECT u.id, u.email, u.name, u.is_active, u.last_login, u.created_at,
              ur.name AS user_role, ur.display_name AS user_role_display,
              r.name AS reseller_name, r.id AS reseller_id
       FROM users u
       LEFT JOIN user_roles ur ON ur.id = u.user_role_id
       LEFT JOIN resellers r ON r.id = u.reseller_id
       WHERE u.reseller_id IN (${placeholders})
       ORDER BY u.created_at DESC`,
      userIds
    );

    return NextResponse.json({ reseller, users: usersResult.rows });
  } catch (error) {
    log('error', 'api', `Reseller detail failed for ${id}`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to load reseller' }, { status: 500 });
  }
}

/**
 * PATCH /api/resellers/[id] — update reseller in Zoho
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const body = await request.json();
    const zohoId = id === CSA_INTERNAL_ID ? CSA_ZOHO_ID : id;

    const result = await executeZohoTool('update_records', {
      module: 'Resellers',
      records: [{ id: zohoId, ...body }],
      trigger: [],
    });
    const parsed = parseMcpResult(result);
    log('info', 'api', `Reseller ${id} updated`);
    return NextResponse.json({ success: true, data: parsed.data });
  } catch (error) {
    log('error', 'api', `Reseller update failed for ${id}`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to update reseller' }, { status: 500 });
  }
}
