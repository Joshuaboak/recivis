import { NextRequest, NextResponse } from 'next/server';
import { searchAllPages, getAllRecordPages, parseMcpResult, callMcpTool, executeZohoTool } from '@/lib/zoho';
import { log } from '@/lib/logger';
import { requireAuth } from '@/lib/api-auth';

/**
 * GET /api/accounts?search=term&resellerId=id&resellerIds=id1,id2,id3
 *
 * Fetches ALL matching accounts across pages (up to 2000).
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search') || '';
  const resellerId = searchParams.get('resellerId');
  const resellerIds = searchParams.get('resellerIds');

  try {
    const fields = 'Account_Name,Billing_Country,Reseller,Email_Domain,Owner,Record_Status__s';
    let allRecords: Record<string, unknown>[];

    // Build reseller criteria fragment if needed
    let resellerCriteria = '';
    if (resellerId) {
      resellerCriteria = `(Reseller:equals:${resellerId})`;
    } else if (resellerIds) {
      const ids = resellerIds.split(',').filter(Boolean);
      if (ids.length === 1) {
        resellerCriteria = `(Reseller:equals:${ids[0]})`;
      } else if (ids.length > 1) {
        resellerCriteria = `(${ids.map(id => `(Reseller:equals:${id})`).join('or')})`;
      }
    }

    if (search && resellerCriteria) {
      allRecords = await searchAllPages(
        'Accounts',
        `((Account_Name:starts_with:${search})and${resellerCriteria})`,
        fields, 'desc'
      );
    } else if (search) {
      // Word search — use MCP tool directly with pagination
      allRecords = [];
      for (let page = 1; page <= 10; page++) {
        try {
          const result = await callMcpTool('ZohoCRM_searchRecords', {
            path_variables: { module: 'Accounts' },
            query_params: { word: search, fields, page },
          });
          const parsed = parseMcpResult(result);
          allRecords.push(...parsed.data);
          if (!parsed.moreRecords) break;
        } catch { break; }
      }
    } else if (resellerCriteria) {
      allRecords = await searchAllPages(
        'Accounts',
        resellerCriteria,
        fields, 'desc'
      );
    } else {
      // No filter — get all accounts
      allRecords = await getAllRecordPages('Accounts', fields, 'Modified_Time', 'desc');
    }

    const accounts = allRecords.filter(
      (r) => r.Record_Status__s !== 'Trash'
    );

    return NextResponse.json({ accounts });
  } catch (error) {
    log('error', 'api', 'Accounts fetch failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to load accounts' }, { status: 500 });
  }
}

/**
 * POST /api/accounts — create a new account
 */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  try {
    const body = await request.json();

    const result = await executeZohoTool('create_records', {
      module: 'Accounts',
      records: [body],
      trigger: [],
    });

    const parsed = parseMcpResult(result);
    const created = parsed.data[0] as Record<string, unknown> | undefined;

    if (created?.code === 'SUCCESS') {
      const details = created.details as Record<string, unknown>;
      log('info', 'api', 'Account created', { id: details?.id });
      return NextResponse.json({ success: true, id: details?.id });
    }

    log('warn', 'api', 'Account creation result', { data: JSON.stringify(parsed.data).slice(0, 300) });
    return NextResponse.json({ success: true, data: parsed.data });
  } catch (error) {
    log('error', 'api', 'Account creation failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to create account' }, { status: 500 });
  }
}
