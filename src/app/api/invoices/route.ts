/**
 * /api/invoices — List and create invoices in Zoho CRM.
 *
 * GET: Fetches all invoices matching the given status, with optional reseller filtering.
 *      Auto-paginates across Zoho pages (up to 2000 records). Excludes trashed records.
 *
 * POST: Creates a new invoice in Draft status. Requires canCreateInvoices permission.
 *       Triggers Zoho workflows on creation (e.g. auto-numbering, notifications).
 */

import { NextRequest, NextResponse } from 'next/server';
import { searchAllPages, executeZohoTool, parseMcpResult } from '@/lib/zoho';
import { log } from '@/lib/logger';
import { requireAuth, isAdmin } from '@/lib/api-auth';

/**
 * GET /api/invoices?status=Draft&resellerId=id&resellerIds=id1,id2,id3
 *
 * Fetches ALL matching invoices across pages (up to 2000).
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || 'Draft';
  const resellerId = searchParams.get('resellerId');
  const resellerIds = searchParams.get('resellerIds');

  try {
    const fields = 'Subject,Reference_Number,Account_Name,Invoice_Date,Due_Date,Status,Grand_Total,Currency,Invoice_Type,Reseller,Record_Status__s';

    // Build Zoho COQL criteria — supports single reseller, multiple resellers, or all
    let criteria: string;

    if (resellerId) {
      criteria = `((Status:equals:${status})and(Reseller:equals:${resellerId}))`;
    } else if (resellerIds) {
      const ids = resellerIds.split(',').filter(Boolean);
      if (ids.length === 1) {
        criteria = `((Status:equals:${status})and(Reseller:equals:${ids[0]}))`;
      } else if (ids.length > 1) {
        const resellerOr = ids.map(id => `(Reseller:equals:${id})`).join('or');
        criteria = `((Status:equals:${status})and(${resellerOr}))`;
      } else {
        criteria = `(Status:equals:${status})`;
      }
    } else {
      criteria = `(Status:equals:${status})`;
    }

    // RBAC: Non-admin users can only see invoices for their allowed resellers
    if (!isAdmin(user)) {
      if (user.allowedResellerIds.length === 0) {
        return NextResponse.json({ invoices: [] });
      }
      // Force reseller filter — override any client-provided filter
      const ids = user.allowedResellerIds;
      const resellerOr = ids.length === 1
        ? `(Reseller:equals:${ids[0]})`
        : `(${ids.map(id => `(Reseller:equals:${id})`).join('or')})`;
      criteria = `((Status:equals:${status})and${resellerOr})`;
    }

    const allRecords = await searchAllPages('Invoices', criteria, fields, 'desc');

    const invoices = allRecords.filter(
      (r) => r.Record_Status__s !== 'Trash'
    );

    return NextResponse.json({ invoices });
  } catch (error) {
    log('error', 'api', 'Invoice search failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to load invoices' }, { status: 500 });
  }
}

/**
 * POST /api/invoices — create a new invoice
 */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  if (!user.permissions.canCreateInvoices && !isAdmin(user)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();

    // RBAC: Non-admin users can only create invoices for their allowed resellers
    if (!isAdmin(user)) {
      const invoiceResellerId = body.Reseller?.id || body.Reseller;
      if (invoiceResellerId && !user.allowedResellerIds.includes(invoiceResellerId)) {
        return NextResponse.json({ error: 'You cannot create invoices for accounts assigned to another reseller' }, { status: 403 });
      }
    }

    const result = await executeZohoTool('create_records', {
      module: 'Invoices',
      records: [body],
      trigger: ['workflow'],
    });

    const parsed = parseMcpResult(result);
    const created = parsed.data[0] as Record<string, unknown> | undefined;

    if (created?.code === 'SUCCESS') {
      const details = created.details as Record<string, unknown>;
      log('info', 'api', 'Invoice created', { id: details?.id });
      return NextResponse.json({ success: true, id: details?.id });
    }

    log('warn', 'api', 'Invoice creation result', { data: JSON.stringify(parsed.data).slice(0, 300) });
    return NextResponse.json({ success: true, data: parsed.data });
  } catch (error) {
    log('error', 'api', 'Invoice creation failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to create invoice' }, { status: 500 });
  }
}
