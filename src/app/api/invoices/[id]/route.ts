import { NextRequest, NextResponse } from 'next/server';
import { executeZohoTool } from '@/lib/zoho';
import { log } from '@/lib/logger';

/**
 * GET /api/invoices/[id] — get invoice detail with line items
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    // Fetch invoice and line items in parallel
    const [invoiceResult, lineItemsResult] = await Promise.all([
      executeZohoTool('get_record', { module: 'Invoices', record_id: id }),
      executeZohoTool('get_related_records', {
        parent_module: 'Invoices',
        parent_id: id,
        related_list: 'Invoiced_Items',
        fields: 'Product_Name,Quantity,Unit_Price,Total,List_Price,Discount,Net_Total,Tax,Description,Record_Status__s',
      }),
    ]);

    // Parse results
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
    const lineItems = parseResult(lineItemsResult).filter(
      (li: Record<string, unknown>) => li.Record_Status__s !== 'Trash'
    );

    return NextResponse.json({ invoice, lineItems });
  } catch (error) {
    log('error', 'api', `Invoice detail failed for ${id}`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to load invoice' }, { status: 500 });
  }
}
