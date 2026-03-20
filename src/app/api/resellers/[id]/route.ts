/**
 * /api/resellers/[id] — Reseller detail and update.
 *
 * GET: Fetches the reseller record from Zoho CRM and its users from PostgreSQL.
 *      Handles the CSA internal reseller ID mapping (csa-internal <-> Zoho ID).
 *
 * PATCH: Updates reseller fields in Zoho CRM. Admin-only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { executeZohoTool, parseMcpResult } from '@/lib/zoho';
import { query } from '@/lib/db';
import { log } from '@/lib/logger';
import { requireAuth, isAdmin } from '@/lib/api-auth';
import { CSA_ZOHO_ID, CSA_INTERNAL_ID } from '@/lib/constants';

/**
 * GET /api/resellers/[id] — get reseller detail + users
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
    // Fetch reseller from Zoho
    const zohoId = id === CSA_INTERNAL_ID ? CSA_ZOHO_ID : id;
    const result = await executeZohoTool('get_record', { module: 'Resellers', record_id: zohoId });
    const parsed = parseMcpResult(result);
    const reseller = parsed.data[0] || null;

    // Check if the reseller exists in PostgreSQL
    const dbLookupIds = [zohoId];
    if (zohoId === CSA_ZOHO_ID) dbLookupIds.push(CSA_INTERNAL_ID);
    const dbPlaceholders = dbLookupIds.map((_, i) => `$${i + 1}`).join(',');

    const dbResult = await query(
      `SELECT r.id, r.reseller_role_id, rr.name AS reseller_role_name, rr.display_name AS reseller_role_display
       FROM resellers r
       LEFT JOIN reseller_roles rr ON rr.id = r.reseller_role_id
       WHERE r.id IN (${dbPlaceholders})
       LIMIT 1`,
      dbLookupIds
    );
    const dbRecord = dbResult.rows[0] || null;

    // Fetch available reseller roles for the registration form
    const rolesResult = await query(
      `SELECT id, name, display_name FROM reseller_roles WHERE is_system_role = false ORDER BY id`
    );

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

    return NextResponse.json({
      reseller,
      users: usersResult.rows,
      dbRegistered: !!dbRecord,
      dbRole: dbRecord ? { name: dbRecord.reseller_role_name, display: dbRecord.reseller_role_display } : null,
      availableRoles: rolesResult.rows,
    });
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
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  if (!isAdmin(user)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

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

/**
 * POST /api/resellers/[id] — Register a Zoho reseller into the PostgreSQL database.
 *
 * Creates a row in the `resellers` table with the Zoho ID, pre-filled fields,
 * and the selected reseller_role. Admin-only.
 */
export async function POST(
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
    const { name, email, region, currency, partner_category, direct_customer_contact, distributor_id, reseller_role_id } = body;

    if (!reseller_role_id) {
      return NextResponse.json({ error: 'reseller_role_id is required' }, { status: 400 });
    }

    // Check if already registered
    const existing = await query('SELECT id FROM resellers WHERE id = $1', [id]);
    if (existing.rows.length > 0) {
      return NextResponse.json({ error: 'Reseller is already registered in the portal' }, { status: 409 });
    }

    // Validate the distributor_id exists in the DB if provided
    if (distributor_id) {
      const distCheck = await query('SELECT id FROM resellers WHERE id = $1', [distributor_id]);
      if (distCheck.rows.length === 0) {
        return NextResponse.json({ error: 'Distributor must be registered in the portal first' }, { status: 400 });
      }
    }

    await query(
      `INSERT INTO resellers (id, name, email, region, currency, partner_category, direct_customer_contact, distributor_id, reseller_role_id, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)`,
      [id, name, email || null, region || null, currency || null, partner_category || null, !!direct_customer_contact, distributor_id || null, reseller_role_id]
    );

    log('info', 'api', `Reseller ${id} registered in portal`, { name, role_id: reseller_role_id, by: user.email });
    return NextResponse.json({ success: true });
  } catch (error) {
    log('error', 'api', `Reseller registration failed for ${id}`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to register reseller' }, { status: 500 });
  }
}
