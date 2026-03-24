/**
 * /api/resellers/[id] — Reseller detail and update.
 *
 * GET: Fetches the reseller record from Zoho CRM and its users from PostgreSQL.
 *      Handles the CSA internal reseller ID mapping (csa-internal <-> Zoho ID).
 *
 * PATCH: Updates reseller fields in Zoho CRM. Admin-only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { executeZohoTool, parseMcpResult, callMcpTool } from '@/lib/zoho';
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

  // Non-admin users can only view their own reseller or child resellers
  if (!isAdmin(user)) {
    const checkId = id === CSA_ZOHO_ID ? CSA_INTERNAL_ID : id;
    if (!user.allowedResellerIds.includes(checkId) && !user.allowedResellerIds.includes(id)) {
      return NextResponse.json({ error: 'Not authorized to view this reseller' }, { status: 403 });
    }
  }

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

    // Fetch available reseller roles with full permission data for the registration form
    const rolesResult = await query(
      `SELECT id, name, display_name,
              can_create_invoices, can_approve_invoices, can_send_invoices,
              can_view_all_records, can_view_child_records, can_modify_prices,
              can_upload_po, can_view_reports, can_export_data,
              can_create_evaluations, max_evaluations_per_account, can_extend_evaluations
       FROM reseller_roles WHERE is_system_role = false ORDER BY id`
    );

    // Fetch per-reseller permission overrides (if registered)
    let permissionOverrides: Record<string, boolean | null> | null = null;
    if (dbRecord) {
      const overridesResult = await query(
        `SELECT perm_create_invoices, perm_approve_invoices, perm_send_invoices,
                perm_view_all_records, perm_view_child_records, perm_modify_prices,
                perm_upload_po, perm_view_reports, perm_export_data,
                perm_create_evaluations, perm_max_evaluations_per_account, perm_extend_evaluations
         FROM resellers WHERE id IN (${dbPlaceholders}) LIMIT 1`,
        dbLookupIds
      );
      if (overridesResult.rows[0]) {
        permissionOverrides = overridesResult.rows[0];
      }
    }

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
      permissionOverrides,
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

    // Sync reseller data from Zoho → PostgreSQL (distributor, region, currency, partner_category)
    if (body._syncDistributor) {
      const dbId = id === CSA_ZOHO_ID ? CSA_INTERNAL_ID : id;

      // Fetch the full Zoho record
      const zohoResult = await executeZohoTool('get_record', { module: 'Resellers', record_id: id === CSA_INTERNAL_ID ? CSA_ZOHO_ID : id });
      const zohoParsed = parseMcpResult(zohoResult);
      const zohoRecord = zohoParsed.data[0] as Record<string, unknown> | undefined;
      const zohoDistId = (zohoRecord?.Distributor as { id?: string })?.id;

      // Sync region, currency, partner_category from Zoho
      if (zohoRecord) {
        await query(
          `UPDATE resellers SET region = $1, currency = $2, partner_category = $3, name = $4, email = $5, updated_at = NOW() WHERE id = $6`,
          [
            (zohoRecord.Region as string) || null,
            (zohoRecord.Currency as string) || null,
            (zohoRecord.Partner_Category as string) || null,
            (zohoRecord.Name as string) || null,
            (zohoRecord.Email as string) || null,
            dbId,
          ]
        );
      }

      // Sync distributor relationship
      if (zohoDistId) {
        const distExists = await query('SELECT id FROM resellers WHERE id = $1', [zohoDistId]);
        if (distExists.rows.length > 0) {
          await query('UPDATE resellers SET distributor_id = $1, updated_at = NOW() WHERE id = $2', [zohoDistId, dbId]);
        }
      }

      // Also backfill children: find Zoho resellers whose Distributor = this reseller
      const zohoId = id === CSA_INTERNAL_ID ? CSA_ZOHO_ID : id;
      try {
        const childResult = await callMcpTool('ZohoCRM_searchRecords', {
          path_variables: { module: 'Resellers' },
          query_params: { criteria: `(Distributor:equals:${zohoId})`, fields: 'Name' },
        });
        const childParsed = parseMcpResult(childResult);
        for (const child of childParsed.data) {
          await query(
            'UPDATE resellers SET distributor_id = $1, updated_at = NOW() WHERE id = $2 AND distributor_id IS NULL',
            [dbId, child.id as string]
          );
        }
      } catch { /* non-critical */ }

      log('info', 'api', `Reseller data synced from Zoho for ${id}`, { by: user.email });
      return NextResponse.json({ success: true });
    }

    // If updating portal permissions (from the permission management UI)
    if (body._updatePermissions) {
      const { permissions, reseller_role_id } = body;
      const toNullableBool = (v: unknown): boolean | null => v === true || v === false ? v : null;
      const permOverrides = permissions || {};

      const updates: string[] = [];
      const values: unknown[] = [];
      let paramIdx = 1;

      if (reseller_role_id !== undefined) {
        updates.push(`reseller_role_id = $${paramIdx++}`);
        values.push(reseller_role_id);
      }

      const permCols = [
        'perm_create_invoices', 'perm_approve_invoices', 'perm_send_invoices',
        'perm_view_all_records', 'perm_view_child_records', 'perm_modify_prices',
        'perm_upload_po', 'perm_view_reports', 'perm_export_data',
        'perm_create_evaluations', 'perm_extend_evaluations',
      ];
      const permKeys = [
        'can_create_invoices', 'can_approve_invoices', 'can_send_invoices',
        'can_view_all_records', 'can_view_child_records', 'can_modify_prices',
        'can_upload_po', 'can_view_reports', 'can_export_data',
        'can_create_evaluations', 'can_extend_evaluations',
      ];
      for (let i = 0; i < permCols.length; i++) {
        updates.push(`${permCols[i]} = $${paramIdx++}`);
        values.push(toNullableBool(permOverrides[permKeys[i]]));
      }

      // max_evaluations_per_account — integer, null = use role default
      const maxEvalVal = permOverrides.max_evaluations_per_account;
      updates.push(`perm_max_evaluations_per_account = $${paramIdx++}`);
      values.push(maxEvalVal !== undefined && maxEvalVal !== null ? Number(maxEvalVal) : null);

      updates.push(`updated_at = NOW()`);

      // Use the DB lookup ID (csa-internal for CSA)
      const dbId = id === CSA_ZOHO_ID ? CSA_INTERNAL_ID : id;
      values.push(dbId);

      await query(
        `UPDATE resellers SET ${updates.join(', ')} WHERE id = $${paramIdx}`,
        values
      );

      log('info', 'api', `Reseller ${id} permissions updated`, { by: user.email });
      return NextResponse.json({ success: true });
    }

    // Otherwise, update in Zoho CRM
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
    const { name, email, region, currency, partner_category, direct_customer_contact, distributor_id, reseller_role_id, permissions } = body;

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

    // Extract per-reseller permission overrides (null = use role default)
    const permOverrides = permissions || {};
    const toNullableBool = (v: unknown): boolean | null => v === true || v === false ? v : null;

    const maxEvalOverride = permOverrides.max_evaluations_per_account;
    await query(
      `INSERT INTO resellers (id, name, email, region, currency, partner_category, direct_customer_contact, distributor_id, reseller_role_id, is_active,
       perm_create_invoices, perm_approve_invoices, perm_send_invoices, perm_view_all_records, perm_view_child_records, perm_modify_prices, perm_upload_po, perm_view_reports, perm_export_data,
       perm_create_evaluations, perm_max_evaluations_per_account, perm_extend_evaluations)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)`,
      [
        id, name, email || null, region || null, currency || null, partner_category || null,
        !!direct_customer_contact, distributor_id || null, reseller_role_id,
        toNullableBool(permOverrides.can_create_invoices),
        toNullableBool(permOverrides.can_approve_invoices),
        toNullableBool(permOverrides.can_send_invoices),
        toNullableBool(permOverrides.can_view_all_records),
        toNullableBool(permOverrides.can_view_child_records),
        toNullableBool(permOverrides.can_modify_prices),
        toNullableBool(permOverrides.can_upload_po),
        toNullableBool(permOverrides.can_view_reports),
        toNullableBool(permOverrides.can_export_data),
        toNullableBool(permOverrides.can_create_evaluations),
        maxEvalOverride !== undefined && maxEvalOverride !== null ? Number(maxEvalOverride) : null,
        toNullableBool(permOverrides.can_extend_evaluations),
      ]
    );

    log('info', 'api', `Reseller ${id} registered in portal`, { name, role_id: reseller_role_id, by: user.email });

    // Auto-backfill: if this reseller is a distributor, find any already-registered
    // child resellers in Zoho and update their distributor_id in PostgreSQL.
    // This fixes the case where children were registered before their distributor.
    try {
      const childSearchResult = await callMcpTool('ZohoCRM_searchRecords', {
        path_variables: { module: 'Resellers' },
        query_params: {
          criteria: `(Distributor:equals:${id})`,
          fields: 'Name',
        },
      });
      const childParsed = parseMcpResult(childSearchResult);
      for (const child of childParsed.data) {
        const childId = child.id as string;
        await query(
          'UPDATE resellers SET distributor_id = $1, updated_at = NOW() WHERE id = $2 AND distributor_id IS NULL',
          [id, childId]
        );
      }
      // Also: if this reseller has a distributor in Zoho that's already registered, set the FK
      if (!distributor_id) {
        const zohoResult = await executeZohoTool('get_record', { module: 'Resellers', record_id: id });
        const zohoParsed = parseMcpResult(zohoResult);
        const zohoRecord = zohoParsed.data[0] as Record<string, unknown> | undefined;
        const zohoDistId = (zohoRecord?.Distributor as { id?: string })?.id;
        if (zohoDistId) {
          const distExists = await query('SELECT id FROM resellers WHERE id = $1', [zohoDistId]);
          if (distExists.rows.length > 0) {
            await query('UPDATE resellers SET distributor_id = $1, updated_at = NOW() WHERE id = $2', [zohoDistId, id]);
          }
        }
      }
    } catch (e) {
      log('warn', 'api', `Distributor backfill skipped for ${id}`, { error: e instanceof Error ? e.message : String(e) });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    log('error', 'api', `Reseller registration failed for ${id}`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to register reseller' }, { status: 500 });
  }
}
