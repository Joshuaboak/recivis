import { NextRequest, NextResponse } from 'next/server';
import { callMcpTool, executeZohoTool, parseMcpResult } from '@/lib/zoho';
import { query } from '@/lib/db';
import { log } from '@/lib/logger';
import { requireAuth, isAdmin } from '@/lib/api-auth';

const CSA_ZOHO_ID = '55779000000560184';
const CSA_INTERNAL_ID = 'csa-internal';

/**
 * GET /api/resellers?resellerId=id&includeChildren=true
 *
 * Fetches resellers from Zoho CRM Resellers module.
 * - No params (admin/ibm): all active resellers
 * - resellerId + includeChildren: own + child resellers (distributor)
 * - resellerId only: own reseller only
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

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

    // Get user counts from PostgreSQL
    try {
      const countsResult = await query(
        `SELECT reseller_id, COUNT(*) as count FROM users WHERE is_active = true GROUP BY reseller_id`
      );
      const counts: Record<string, number> = {};
      for (const row of countsResult.rows) {
        counts[row.reseller_id] = parseInt(row.count);
      }
      // Map csa-internal counts to the Zoho CSA ID
      if (counts[CSA_INTERNAL_ID]) {
        counts[CSA_ZOHO_ID] = (counts[CSA_ZOHO_ID] || 0) + counts[CSA_INTERNAL_ID];
      }
      for (const r of resellers) {
        (r as Record<string, unknown>).user_count = counts[r.id] || 0;
      }
    } catch { /* non-critical */ }

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

/**
 * POST /api/resellers — create a new reseller in Zoho
 */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  if (!isAdmin(user)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();

    const result = await executeZohoTool('create_records', {
      module: 'Resellers',
      records: [body],
      trigger: [],
    });

    const parsed = parseMcpResult(result);
    const created = parsed.data[0] as Record<string, unknown> | undefined;

    if (created?.code === 'SUCCESS') {
      const details = created.details as Record<string, unknown>;
      log('info', 'api', 'Reseller created', { id: details?.id });
      return NextResponse.json({ success: true, id: details?.id });
    }

    log('warn', 'api', 'Reseller creation result', { data: JSON.stringify(parsed.data).slice(0, 300) });
    return NextResponse.json({ success: false, error: 'Failed to create reseller', data: parsed.data }, { status: 400 });
  } catch (error) {
    log('error', 'api', 'Reseller creation failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to create reseller' }, { status: 500 });
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
    currency: r.Currency as string || '',
    partner_category: r.Partner_Category as string || '',
    distributor_id: distributor?.id || null,
  };
}
