import { NextRequest, NextResponse } from 'next/server';
import { callMcpTool } from '@/lib/zoho';
import { log } from '@/lib/logger';

/**
 * GET /api/accounts?search=term&resellerId=id&page=1
 * Fetches accounts — shows a list on load, filters on search.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search') || '';
  const resellerId = searchParams.get('resellerId');
  const page = parseInt(searchParams.get('page') || '1');

  try {
    const fields = 'Account_Name,Billing_Country,Reseller,Email_Domain,Owner,Record_Status__s';
    let result;

    if (search && resellerId) {
      result = await callMcpTool('ZohoCRM_Search_Records', {
        path_variables: { module: 'Accounts' },
        query_params: {
          criteria: `((Account_Name:starts_with:${search})and(Reseller:equals:${resellerId}))`,
          fields, page,
        },
      });
    } else if (search) {
      result = await callMcpTool('ZohoCRM_Search_Records', {
        path_variables: { module: 'Accounts' },
        query_params: { word: search, fields, page },
      });
    } else if (resellerId) {
      result = await callMcpTool('ZohoCRM_Search_Records', {
        path_variables: { module: 'Accounts' },
        query_params: { criteria: `(Reseller:equals:${resellerId})`, fields, page },
      });
    } else {
      // No filter — get recent accounts using Get_Records (browse mode)
      result = await callMcpTool('ZohoCRM_Get_Records', {
        path_variables: { module: 'Accounts' },
        query_params: { fields, per_page: 50, page, sort_by: 'Modified_Time', sort_order: 'desc' },
      });
    }

    // Parse MCP response
    let accounts: unknown[] = [];
    const res = result as { content?: Array<{ text?: string }> };
    if (res?.content) {
      for (const item of res.content) {
        if (item.text) {
          try {
            const parsed = JSON.parse(item.text);
            if (parsed.data) {
              accounts = parsed.data.filter(
                (r: Record<string, unknown>) => r.Record_Status__s !== 'Trash'
              );
            }
          } catch { /* skip */ }
        }
      }
    }

    return NextResponse.json({ accounts });
  } catch (error) {
    log('error', 'api', 'Accounts fetch failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to load accounts' }, { status: 500 });
  }
}
