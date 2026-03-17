import { NextRequest, NextResponse } from 'next/server';
import { executeZohoTool } from '@/lib/zoho';
import { log } from '@/lib/logger';

/**
 * GET /api/accounts?search=term&resellerId=id&page=1
 * Search accounts from Zoho CRM via MCP
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search') || '';
  const resellerId = searchParams.get('resellerId');
  const page = parseInt(searchParams.get('page') || '1');

  try {
    const fields = 'Account_Name,Billing_Country,Reseller,Email_Domain,Owner,Record_Status__s';
    let result;

    if (search) {
      if (resellerId) {
        result = await executeZohoTool('search_records', {
          module: 'Accounts',
          criteria: `((Account_Name:starts_with:${search})and(Reseller:equals:${resellerId}))`,
          fields,
          page,
        });
      } else {
        result = await executeZohoTool('search_records', {
          module: 'Accounts',
          word: search,
          fields,
          page,
        });
      }
    } else if (resellerId) {
      result = await executeZohoTool('search_records', {
        module: 'Accounts',
        criteria: `(Reseller:equals:${resellerId})`,
        fields,
        page,
      });
    } else {
      // No filter — get recent accounts
      result = await executeZohoTool('search_records', {
        module: 'Accounts',
        word: 'a',
        fields,
        page,
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
    log('error', 'api', 'Accounts search failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to search accounts' }, { status: 500 });
  }
}
