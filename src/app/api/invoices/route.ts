import { NextRequest, NextResponse } from 'next/server';
import { executeZohoTool } from '@/lib/zoho';
import { log } from '@/lib/logger';

/**
 * GET /api/invoices?status=Draft&resellerId=id&resellerIds=id1,id2,id3
 *
 * Supports:
 * - resellerId: single reseller filter
 * - resellerIds: comma-separated list for multi-reseller filter (region/distributor)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || 'Draft';
  const resellerId = searchParams.get('resellerId');
  const resellerIds = searchParams.get('resellerIds');

  try {
    const fields = 'Subject,Reference_Number,Account_Name,Invoice_Date,Status,Grand_Total,Currency,Invoice_Type,Reseller,Record_Status__s';

    let criteria: string;

    if (resellerId) {
      // Single reseller
      criteria = `((Status:equals:${status})and(Reseller:equals:${resellerId}))`;
    } else if (resellerIds) {
      // Multiple resellers — build OR chain
      const ids = resellerIds.split(',').filter(Boolean);
      if (ids.length === 1) {
        criteria = `((Status:equals:${status})and(Reseller:equals:${ids[0]}))`;
      } else if (ids.length > 1) {
        // Zoho supports nested OR: ((Reseller:equals:id1)or(Reseller:equals:id2)or...)
        const resellerOr = ids.map(id => `(Reseller:equals:${id})`).join('or');
        criteria = `((Status:equals:${status})and(${resellerOr}))`;
      } else {
        criteria = `(Status:equals:${status})`;
      }
    } else {
      // No reseller filter — all invoices with this status
      criteria = `(Status:equals:${status})`;
    }

    const result = await executeZohoTool('search_records', {
      module: 'Invoices',
      criteria,
      fields,
      sort_order: 'desc',
    });

    let invoices: unknown[] = [];
    const res = result as { content?: Array<{ text?: string }> };
    if (res?.content) {
      for (const item of res.content) {
        if (item.text) {
          try {
            const parsed = JSON.parse(item.text);
            if (parsed.data) {
              invoices = parsed.data.filter(
                (r: Record<string, unknown>) => r.Record_Status__s !== 'Trash'
              );
            }
          } catch { /* skip */ }
        }
      }
    }

    return NextResponse.json({ invoices });
  } catch (error) {
    log('error', 'api', 'Invoice search failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to load invoices' }, { status: 500 });
  }
}
