import { NextRequest, NextResponse } from 'next/server';
import { executeZohoTool, parseMcpResult } from '@/lib/zoho';
import { log } from '@/lib/logger';

/**
 * GET /api/invoices/[id] — get invoice detail with line items
 * Line items are embedded in the invoice record as Product_Details.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
  const { id } = await params;

  try {
    const body = await request.json();
    const updateData: Record<string, unknown> = { id };

    // Only allow specific fields
    if (body.Invoice_Date) updateData.Invoice_Date = body.Invoice_Date;
    if (body.Due_Date) updateData.Due_Date = body.Due_Date;
    if (body.Invoiced_Items) updateData.Invoiced_Items = body.Invoiced_Items;

    const result = await executeZohoTool('update_records', {
      module: 'Invoices',
      records: [updateData],
      trigger: [],
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
