import { NextRequest, NextResponse } from 'next/server';
import { executeZohoTool } from '@/lib/zoho';
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

    // Extract line items from the invoice record's Product_Details array
    const lineItems = (invoice?.Product_Details as Record<string, unknown>[] | undefined) || [];

    return NextResponse.json({ invoice, lineItems });
  } catch (error) {
    log('error', 'api', `Invoice detail failed for ${id}`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to load invoice' }, { status: 500 });
  }
}
