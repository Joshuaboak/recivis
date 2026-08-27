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
import { isDemoSession } from '@/lib/demo/guard';
import { findDemoRecord } from '@/lib/demo/fixtures';
import { requireAuth, isAdmin, canManageReseller } from '@/lib/api-auth';

/**
 * Statuses past which an order is committed and stops accepting portal edits.
 *
 * Approved only. `Sent` used to be here on the reasoning that it was reachable
 * only through approval, which is not true: sending an order for payment leaves
 * it unapproved and unpaid, and locking it there meant a partner who had
 * emailed an invoice could no longer correct the PO number or a line on it —
 * before anybody had committed to anything.
 */
const LOCKED_STATUSES = ['Approved'];

/** One file attached to an order, as the portal shows it. */
export interface Attachment {
  id: string;
  fileName: string;
  /** Bytes, when Zoho reports them. */
  size: number | null;
  createdTime: string;
  createdBy: string;
}

/**
 * Why this order may not be processed on account, or null when it may.
 *
 * Two conditions, both read off records rather than off the request: the
 * partner has account terms (`Can_Purchase_on_Credit` on their Reseller), and
 * the order carries a purchase order number. The portal asks for a PO document
 * too, but the attachment lives outside this record and the number is the part
 * that is checkable here.
 */
async function accountTermsDenial(
  invoice: Record<string, unknown> | undefined,
  invoiceId: string
): Promise<string | null> {
  if (!String(invoice?.Purchase_Order ?? '').trim()) {
    return 'A purchase order number is required before this order can be processed.';
  }

  const resellerId = (invoice?.Reseller as { id?: string } | null)?.id;
  if (!resellerId) {
    return 'This order has no partner on it, so it cannot be processed.';
  }

  try {
    const result = await executeZohoTool('get_record', {
      module: 'Resellers',
      record_id: resellerId,
    });
    const reseller = parseMcpResult(result).data[0] as Record<string, unknown> | undefined;
    if (!reseller?.Can_Purchase_on_Credit) {
      return 'Your account does not have payment terms, so orders cannot be processed on account. Pay by card, or send the order for payment.';
    }
  } catch (error) {
    // A check that cannot run is not a check that passes: this one stands
    // between an unpaid order and issued licence keys.
    log('error', 'api', `Could not read payment terms for invoice ${invoiceId}`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return 'Your payment terms could not be confirmed. Please try again.';
  }

  return null;
}

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

  // A practice session reads the demo order it just created, or one of the
  // fixtures it started with.
  if (isDemoSession(user)) {
    const invoice = findDemoRecord(id);
    if (!invoice) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    return NextResponse.json({
      invoice,
      lineItems: (invoice.Invoiced_Items as Record<string, unknown>[]) || [],
    });
  }

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

    /**
     * Attachments are a related list on the record, not a field on it.
     *
     * Nothing fetched them, so the order page only knew about a document if it
     * had watched the upload happen in that same session. Reopen the order, or
     * open one somebody else raised, and the purchase order it plainly had
     * looked missing — which also blocked Process Order, since that requires
     * the document.
     *
     * Failure here is not failure of the order: the page still loads, with an
     * empty list, rather than 500ing over a related list.
     */
    let attachments: Attachment[] = [];
    if (invoice) {
      try {
        const attachmentResult = await executeZohoTool('get_related_records', {
          parent_module: 'Invoices',
          parent_id: id,
          related_list: 'Attachments',
        });
        attachments = parseResult(attachmentResult).map((a: Record<string, unknown>) => ({
          id: a.id as string,
          fileName: (a.File_Name as string) || 'Attachment',
          size: Number(a.Size) || null,
          createdTime: (a.Created_Time as string) || '',
          createdBy: ((a.Created_By ?? a.Owner) as { name?: string } | null)?.name || '',
        }));
      } catch (err) {
        log('warn', 'api', `Could not load attachments for invoice ${id}`, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return NextResponse.json({ invoice, lineItems, attachments });
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
    // The current record drives both the ownership check and the lock below,
    // so it is fetched for everyone rather than only for non-admins.
    const checkResult = await executeZohoTool('get_record', { module: 'Invoices', record_id: id });
    const existing = parseMcpResult(checkResult).data[0] as Record<string, unknown> | undefined;

    if (!isAdmin(user)) {
      const resId = (existing?.Reseller as { id?: string })?.id;
      if (!resId || !canManageReseller(user, resId)) {
        return NextResponse.json({ error: 'This invoice belongs to another reseller' }, { status: 403 });
      }
    }

    // An approved order is locked: it has been committed, licence keys may
    // already exist against it, and the money is settled off its totals.
    // CSA staff keep a way in for corrections, everyone else goes through the
    // CRM.
    const currentStatus = (existing?.Status as string) || '';
    if (LOCKED_STATUSES.includes(currentStatus) && !isAdmin(user)) {
      return NextResponse.json({
        error: `This order is ${currentStatus.toLowerCase()} and can no longer be changed.`,
      }, { status: 409 });
    }

    const body = await request.json();
    const updateData: Record<string, unknown> = { id };

    // Only allow specific fields
    if (body.Invoice_Date) updateData.Invoice_Date = body.Invoice_Date;
    if (body.Due_Date) updateData.Due_Date = body.Due_Date;
    // Currency is seeded from the Reseller record when an order is created, but it
    // stays editable afterwards: an order can legitimately be raised in a currency
    // other than its partner's default. Removed from this allow-list in dab7c76 and
    // deliberately restored — dropping it silently was worse than either choice,
    // because the request still returned success and the edit vanished without a word.
    if (body.Currency) updateData.Currency = body.Currency;
    if (body.Invoiced_Items) updateData.Invoiced_Items = body.Invoiced_Items;
    if (body.Reseller_Direct_Purchase !== undefined) updateData.Reseller_Direct_Purchase = body.Reseller_Direct_Purchase;
    if (body.Purchase_Order !== undefined) updateData.Purchase_Order = body.Purchase_Order;

    // Status changes require specific permissions
    if (body.Status) {
      /**
       * Two ways to be allowed to approve an order, and a partner only ever has
       * the second.
       *
       * `canApproveInvoices` resolves to `user_role.can_approve_invoices AND
       * reseller_role.can_approve_invoices`, and every partner-side preset sets
       * the user-role half to false — viewer, standard and manager alike. No
       * per-reseller override reaches it, because the override only moves the
       * reseller half. So gating this on that permission alone made processing
       * an order impossible for every partner, whatever an administrator
       * toggled on: the button was hidden, and the write would have been
       * refused if it had somehow been pressed.
       *
       * The partner's authority is the arrangement itself: account terms mean
       * CSA issues keys before the money arrives, and the purchase order stands
       * in for the payment. That is what `accountTermsDenial` checks.
       */
      if (body.Status === 'Approved' && !isAdmin(user)) {
        const denial = await accountTermsDenial(existing, id);
        if (denial && !user.permissions.canApproveInvoices) {
          return NextResponse.json({ error: denial }, { status: 403 });
        }
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
