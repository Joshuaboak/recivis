import { NextRequest, NextResponse } from 'next/server';
import { callMcpTool } from '@/lib/zoho';
import { log } from '@/lib/logger';

/**
 * GET /api/resellers?resellerId=id&includeChildren=true
 *
 * Fetches resellers from Zoho CRM Resellers module.
 * - No params (admin/ibm): all active resellers
 * - resellerId + includeChildren: own + child resellers (distributor)
 * - resellerId only: own reseller only
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const resellerId = searchParams.get('resellerId');
    const includeChildren = searchParams.get('includeChildren') === 'true';

    const fields = 'Name,Region,Currency,Partner_Category,Distributor,Record_Status__s';

    let resellers: Array<{ id: string; name: string; region: string; partner_category: string; distributor_id: string | null }> = [];

    if (resellerId && includeChildren) {
      // Distributor: fetch own + children (where Distributor = this reseller)
      // Fetch all and filter — Zoho doesn't support OR on lookup + equals:id easily
      const [ownResult, childResult] = await Promise.all([
        callMcpTool('ZohoCRM_getRecord', {
          path_variables: { module: 'Resellers', recordID: resellerId },
        }),
        callMcpTool('ZohoCRM_searchRecords', {
          path_variables: { module: 'Resellers' },
          query_params: {
            criteria: `(Distributor:equals:${resellerId})`,
            fields,
          },
        }),
      ]);

      const ownData = parseResult(ownResult);
      const childData = parseResult(childResult);
      const all = [...ownData, ...childData].filter(
        (r: Record<string, unknown>) => r.Record_Status__s !== 'Trash'
      );
      resellers = all.map(mapReseller);
    } else if (resellerId) {
      // Single reseller
      const result = await callMcpTool('ZohoCRM_getRecord', {
        path_variables: { module: 'Resellers', recordID: resellerId },
      });
      const data = parseResult(result).filter(
        (r: Record<string, unknown>) => r.Record_Status__s !== 'Trash'
      );
      resellers = data.map(mapReseller);
    } else {
      // Admin: all resellers
      const result = await callMcpTool('ZohoCRM_getRecords', {
        path_variables: { module: 'Resellers' },
        query_params: { fields, per_page: 200, sort_order: 'asc' },
      });
      const data = parseResult(result).filter(
        (r: Record<string, unknown>) => r.Record_Status__s !== 'Trash'
      );
      resellers = data.map(mapReseller);
    }

    // Sort by name
    resellers.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ resellers });
  } catch (error) {
    log('error', 'api', 'Resellers fetch failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load resellers' },
      { status: 500 }
    );
  }
}

function parseResult(r: unknown): Record<string, unknown>[] {
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
}

function mapReseller(r: Record<string, unknown>) {
  const distributor = r.Distributor as { id?: string } | null;
  return {
    id: r.id as string,
    name: r.Name as string || 'Unknown',
    region: r.Region as string || '',
    partner_category: r.Partner_Category as string || '',
    distributor_id: distributor?.id || null,
  };
}
