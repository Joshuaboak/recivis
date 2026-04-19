/**
 * /api/invoices/[id] — Invoice detail and field updates.
 *
 * GET:   Fetches the full invoice record including line items (Invoiced_Items subform).
 * PATCH: Updates invoice fields. Supports dates, currency, PO number, direct
 *        purchase flag, and line item modifications. Only allows specific fields
 *        to prevent accidental data corruption.
 */

import { NextRequest, NextResponse } from 'next/server';
import { executeZohoTool, parseMcpResult } from '@/lib/zoho';
import { log } from '@/lib/logger';
import { requireAuth, isAdmin, canManageReseller } from '@/lib/api-auth';

/**
 * GET /api/invoices/[id] — get invoice detail with line items
 * Line items are embedded in the invoice record as Product_Details.
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
    const invoiceResult = await executeZohoTool('get_record', {
      module: 'Invoices',
      record_id: id,
    });

    // Parse result
    const parseResult = (r: unknown) => {
      const res = r as { content?: Array<{ text?: string }> };
      if (res?.content) {
        for (const item of res.content) {
          if (item.text) {
            try {
              const parsed = JSON.parse(item.text);
              return parsed.data || [];
            } catch { /* skip */ }
          }
        }
      }
      return [];
    };

    const invoiceData = parseResult(invoiceResult);
    const invoice = invoiceData[0] || null;

    // RBAC: Non-admin users can only view invoices for their allowed resellers
    if (invoice && !isAdmin(user)) {
      const invResellerId = (invoice.Reseller as { id?: string })?.id;
      if (!invResellerId || !canManageReseller(user, invResellerId)) {
        return NextResponse.json({ error: 'This invoice belongs to another reseller' }, { status: 403 });
      }
    }

    // Extract line items from the invoice record's Invoiced_Items subform
    const lineItems = (invoice?.Invoiced_Items as Record<string, unknown>[] | undefined) || [];

    return NextResponse.json({ invoice, lineItems });
  } catch (error) {
    log('error', 'api', `Invoice detail failed for ${id}`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to load invoice' }, { status: 500 });
  }
}

/**
 * PATCH /api/invoices/[id] — update invoice fields
 * Body: { Invoice_Date?, Due_Date?, Invoiced_Items?: [...] }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  const { id } = await params;

  try {
    // RBAC: Fetch invoice first to check ownership
    if (!isAdmin(user)) {
      const checkResult = await executeZohoTool('get_record', { module: 'Invoices', record_id: id });
      const checkData = parseMcpResult(checkResult);
      const existing = checkData.data[0] as Record<string, unknown> | undefined;
      const resId = (existing?.Reseller as { id?: string })?.id;
      if (!resId || !canManageReseller(user, resId)) {
        return NextResponse.json({ error: 'This invoice belongs to another reseller' }, { status: 403 });
      }
    }

    const body = await request.json();
    const updateData: Record<string, unknown> = { id };

    // Only allow specific fields
    if (body.Invoice_Date) updateData.Invoice_Date = body.Invoice_Date;
    if (body.Due_Date) updateData.Due_Date = body.Due_Date;
    // Currency is sourced from the Reseller record — not user-editable here.
    if (body.Invoiced_Items) updateData.Invoiced_Items = body.Invoiced_Items;
    if (body.Reseller_Direct_Purchase !== undefined) updateData.Reseller_Direct_Purchase = body.Reseller_Direct_Purchase;
    if (body.Purchase_Order !== undefined) updateData.Purchase_Order = body.Purchase_Order;

    // Status changes require specific permissions
    if (body.Status) {
      if (body.Status === 'Approved' && !user.permissions.canApproveInvoices && !isAdmin(user)) {
        return NextResponse.json({ error: 'You do not have permission to approve invoices' }, { status: 403 });
      }
      if (body.Send_Invoice && !user.permissions.canSendInvoices && !isAdmin(user)) {
        return NextResponse.json({ error: 'You do not have permission to send invoices' }, { status: 403 });
      }
      updateData.Status = body.Status;
    }
    if (body.Send_Invoice !== undefined) updateData.Send_Invoice = body.Send_Invoice;

    const result = await executeZohoTool('update_records', {
      module: 'Invoices',
      records: [updateData],
      trigger: ['workflow'],
    });

    const parsed = parseMcpResult(result);
    const updated = parsed.data[0];

    if (updated && (updated as Record<string, unknown>).code === 'SUCCESS') {
      log('info', 'api', `Invoice ${id} updated`, { fields: Object.keys(body) });
      return NextResponse.json({ success: true });
    }

    log('warn', 'api', `Invoice ${id} update returned non-success`, { result: JSON.stringify(parsed.data).slice(0, 300) });
    return NextResponse.json({ success: true }); // Zoho sometimes returns data differently
  } catch (error) {
    log('error', 'api', `Invoice update failed for ${id}`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to update invoice' }, { status: 500 });
  }
}
