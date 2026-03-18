import { NextRequest, NextResponse } from 'next/server';
import { searchAllPages, getAllRecordPages, parseMcpResult, callMcpTool } from '@/lib/zoho';
import { log } from '@/lib/logger';

/**
 * GET /api/accounts?search=term&resellerId=id
 *
 * Fetches ALL matching accounts across pages (up to 2000).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search') || '';
  const resellerId = searchParams.get('resellerId');

  try {
    const fields = 'Account_Name,Billing_Country,Reseller,Email_Domain,Owner,Record_Status__s';
    let allRecords: Record<string, unknown>[];

    if (search && resellerId) {
      allRecords = await searchAllPages(
        'Accounts',
        `((Account_Name:starts_with:${search})and(Reseller:equals:${resellerId}))`,
        fields, 'desc'
      );
    } else if (search) {
      // Word search doesn't use criteria — use the MCP tool directly with pagination
      allRecords = [];
      for (let page = 1; page <= 10; page++) {
        const result = await callMcpTool('ZohoCRM_Search_Records', {
          path_variables: { module: 'Accounts' },
          query_params: { word: search, fields, page },
        });
        const parsed = parseMcpResult(result);
        allRecords.push(...parsed.data);
        if (!parsed.moreRecords) break;
      }
    } else if (resellerId) {
      allRecords = await searchAllPages(
        'Accounts',
        `(Reseller:equals:${resellerId})`,
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
