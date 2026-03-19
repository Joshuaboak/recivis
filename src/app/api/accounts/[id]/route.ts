import { NextRequest, NextResponse } from 'next/server';
import { executeZohoTool, parseMcpResult } from '@/lib/zoho';
import { log } from '@/lib/logger';

/**
 * GET /api/accounts/[id] — get account detail with contacts and assets
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    // Fetch account, contacts, assets, and invoices in parallel
    const [accountResult, contactsResult, assetsResult, invoicesResult] = await Promise.all([
      executeZohoTool('get_record', { module: 'Accounts', record_id: id }),
      executeZohoTool('get_related_records', {
        parent_module: 'Accounts',
        parent_id: id,
        related_list: 'Contacts',
        fields: 'Full_Name,First_Name,Last_Name,Email,Phone,Title,Record_Status__s',
      }),
      executeZohoTool('get_related_records', {
        parent_module: 'Accounts',
        parent_id: id,
        related_list: 'Assets',
        fields: 'Name,Product,Status,Start_Date,Renewal_Date,Quantity,Serial_Key,Reseller,Upgraded_To_Key,Upgraded_From_Key,Renewal_Invoice_Generated,Not_Renewing_Asset,Revoked,Revoked_Reason,Evaluation_License,Educational_License,Record_Status__s',
      }),
      executeZohoTool('get_related_records', {
        parent_module: 'Accounts',
        parent_id: id,
        related_list: 'Invoices',
        fields: 'Subject,Reference_Number,Invoice_Date,Status,Grand_Total,Currency,Invoice_Type,Record_Status__s',
      }),
    ]);

    // Parse each result
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

    const accountData = parseResult(accountResult);
    const account = accountData[0] || null;
    const contacts = parseResult(contactsResult).filter(
      (c: Record<string, unknown>) => c.Record_Status__s !== 'Trash'
    );
    const allAssets = parseResult(assetsResult).filter(
      (a: Record<string, unknown>) =>
        a.Record_Status__s !== 'Trash' && !a.Upgraded_To_Key
    );

    const activeAssets = allAssets.filter(
      (a: Record<string, unknown>) => a.Status === 'Active'
    );
    const archivedAssets = allAssets.filter(
      (a: Record<string, unknown>) => a.Status !== 'Active'
    );

    const invoices = parseResult(invoicesResult).filter(
      (inv: Record<string, unknown>) => inv.Record_Status__s !== 'Trash'
    );

    return NextResponse.json({ account, contacts, activeAssets, archivedAssets, invoices });
  } catch (error) {
    log('error', 'api', `Account detail failed for ${id}`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to load account' }, { status: 500 });
  }
}

/**
 * PATCH /api/accounts/[id] — update account fields (Primary/Secondary Contact)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await request.json();
    const updateData: Record<string, unknown> = { id };

    if (body.Primary_Contact !== undefined) {
      updateData.Primary_Contact = body.Primary_Contact ? { id: body.Primary_Contact } : null;
    }
    if (body.Secondary_Contact !== undefined) {
      updateData.Secondary_Contact = body.Secondary_Contact ? { id: body.Secondary_Contact } : null;
    }
    if (body.Billing_Street !== undefined) updateData.Billing_Street = body.Billing_Street;
    if (body.Billing_City !== undefined) updateData.Billing_City = body.Billing_City;
    if (body.Billing_State !== undefined) updateData.Billing_State = body.Billing_State;
    if (body.Billing_Code !== undefined) updateData.Billing_Code = body.Billing_Code;
    if (body.Billing_Country !== undefined) updateData.Billing_Country = body.Billing_Country;
    if (body.Reseller !== undefined) {
      updateData.Reseller = body.Reseller ? { id: body.Reseller } : null;
    }

    const result = await executeZohoTool('update_records', {
      module: 'Accounts',
      records: [updateData],
      trigger: [],
    });

    const parsed = parseMcpResult(result);
    log('info', 'api', `Account ${id} updated`, { fields: Object.keys(body) });
    return NextResponse.json({ success: true, data: parsed.data });
  } catch (error) {
    log('error', 'api', `Account update failed for ${id}`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to update account' }, { status: 500 });
  }
}
