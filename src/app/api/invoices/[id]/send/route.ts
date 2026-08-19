/**
 * POST /api/invoices/[id]/send — Send an order to its recipient.
 *
 * Delegates to the CSA Deluge function `markSendInvoiceCheckbox`, which is the
 * only supported way to send. It validates the invoice against its reseller,
 * clears an already-ticked Send_Invoice with all automation suppressed so a
 * second press resends rather than silently doing nothing, then ticks the box
 * and sets Status to Sent — which is what fires the Send Marked Invoice
 * workflow and, through it, send_invoice11.
 *
 * Writing Send_Invoice directly from here would skip the validation and the
 * resend handling, and would double-fire the Stripe payment-link rule.
 *
 * The function reports failure in its return string, not its HTTP status, so a
 * 200 from Zoho means nothing on its own and the body has to be read.
 */

import { NextRequest, NextResponse } from 'next/server';
import { executeZohoTool, parseMcpResult } from '@/lib/zoho';
import { log } from '@/lib/logger';
import { requireAuth, isAdmin, canManageReseller } from '@/lib/api-auth';
import { callZohoFunction, functionOutput } from '@/lib/zoho-functions';

/** The only string the Deluge function returns on success. */
const SUCCESS_MARKER = 'has been successfully marked to be sent';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  const { id } = await params;

  if (!user.permissions.canSendInvoices && !isAdmin(user)) {
    return NextResponse.json({ error: 'You do not have permission to send orders' }, { status: 403 });
  }

  try {
    // Ownership check — the Deluge function validates the invoice against its
    // reseller but knows nothing about who is logged into the portal.
    const existingResult = await executeZohoTool('get_record', { module: 'Invoices', record_id: id });
    const existing = parseMcpResult(existingResult).data[0] as Record<string, unknown> | undefined;

    if (!existing) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (!isAdmin(user)) {
      const resellerId = (existing.Reseller as { id?: string })?.id;
      if (!resellerId || !canManageReseller(user, resellerId)) {
        return NextResponse.json({ error: 'This order belongs to another reseller' }, { status: 403 });
      }
    }

    const result = await callZohoFunction('markSendInvoiceCheckbox', { invoiceID: id });
    const output = functionOutput(result);

    // Failures come back as prose: "ERROR ...", or a validation message passed
    // straight through from checkinvoicedetailsforreseller that need not start
    // with ERROR at all. Only the success sentence counts as success.
    if (!output.includes(SUCCESS_MARKER)) {
      log('warn', 'api', `Order ${id} send refused`, { output: output.slice(0, 400), by: user.email });
      return NextResponse.json({
        error: output.trim() || 'The order could not be sent. Please try again.',
      }, { status: 422 });
    }

    log('info', 'api', `Order ${id} sent`, { by: user.email });
    return NextResponse.json({ success: true, message: output.trim() });
  } catch (error) {
    log('error', 'api', `Order send failed for ${id}`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to send order' }, { status: 500 });
  }
}
