/**
 * /api/leads/[id] — Lead detail and conversion.
 *
 * GET:  Fetches a single lead or prospect account detail.
 *       Query param ?source=lead|prospect determines which module to query.
 *       - lead: fetches from Leads module (single record, no related records)
 *       - prospect: fetches from Accounts module with contacts, assets, invoices
 *
 * POST: Converts a Zoho Lead into an Account + Contact.
 *       Uses the Zoho REST API (POST /Leads/{id}/actions/convert) with an
 *       OAuth token obtained via the getresellerzohotoken Deluge function.
 *       Triggers workflows on the newly created records.
 */

import { NextRequest, NextResponse } from 'next/server';
import { executeZohoTool, parseMcpResult, callMcpTool } from '@/lib/zoho';
import { log } from '@/lib/logger';
import { requireAuth, isAdmin } from '@/lib/api-auth';

// --- OAuth Token Management (same pattern as attach-file) ---

function getTokenUrl(): string {
  const key = process.env.ZOHO_API_KEY;
  if (!key) throw new Error('ZOHO_API_KEY not set');
  return `https://www.zohoapis.com.au/crm/v7/functions/getresellerzohotoken/actions/execute?auth_type=apikey&zapikey=${key}&arguments=%7B%22resellerName%22%3A%22Civil%20Survey%20Applications%22%7D`;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60000) {
    return cachedToken.token;
  }

  const res = await fetch(getTokenUrl(), { method: 'POST' });
  if (!res.ok) throw new Error(`Token fetch failed: ${res.status}`);

  const data = await res.json();
  const token = data?.details?.output;
  if (!token || token.startsWith('ERROR')) {
    throw new Error(`Token error: ${token || 'no output'}`);
  }

  cachedToken = { token, expiresAt: Date.now() + 3600 * 1000 };
  log('info', 'auth', 'Got Zoho access token for lead conversion');
  return token;
}

/**
 * GET /api/leads/[id]?source=lead|prospect
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const { id } = await params;
  const source = new URL(request.url).searchParams.get('source') || 'lead';

  try {
    if (source === 'prospect') {
      // Fetch as prospect account — same pattern as /api/accounts/[id]
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
          fields: 'Name,Product,Status,Start_Date,Renewal_Date,Quantity,Serial_Key,Reseller,Upgraded_To_Key,Evaluation_License,Educational_License,Record_Status__s',
        }),
        executeZohoTool('get_related_records', {
          parent_module: 'Accounts',
          parent_id: id,
          related_list: 'Invoices',
          fields: 'Subject,Reference_Number,Invoice_Date,Status,Grand_Total,Currency,Invoice_Type,Record_Status__s',
        }),
      ]);

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
        (a: Record<string, unknown>) => a.Record_Status__s !== 'Trash'
      );
      const evaluationAssets = allAssets.filter(
        (a: Record<string, unknown>) => a.Evaluation_License === true
      );
      const otherAssets = allAssets.filter(
        (a: Record<string, unknown>) => a.Evaluation_License !== true && !a.Upgraded_To_Key
      );
      const activeAssets = otherAssets.filter(
        (a: Record<string, unknown>) => a.Status === 'Active'
      );
      const archivedAssets = otherAssets.filter(
        (a: Record<string, unknown>) => a.Status !== 'Active'
      );
      const invoices = parseResult(invoicesResult).filter(
        (inv: Record<string, unknown>) => inv.Record_Status__s !== 'Trash'
      );

      return NextResponse.json({
        source: 'prospect',
        account,
        contacts,
        evaluationAssets,
        activeAssets,
        archivedAssets,
        invoices,
      });
    } else {
      // Fetch from Leads module
      const result = await callMcpTool('ZohoCRM_getLeadsRecord', {
        path_variables: { recordID: id },
      });

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

      const leadData = parseResult(result);
      const lead = leadData[0] || null;

      return NextResponse.json({
        source: 'lead',
        lead,
      });
    }
  } catch (error) {
    log('error', 'api', `Lead detail failed for ${id} (source: ${source})`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to load lead' }, { status: 500 });
  }
}

/**
 * POST /api/leads/[id] — Convert a Zoho Lead to Account + Contact.
 *
 * Calls the Zoho CRM v7 convert lead API with trigger=['workflow']
 * so that all configured workflows fire on the new records.
 *
 * Request body (optional):
 * - overwrite: boolean (default false) — overwrite existing account/contact if matched
 * - notify_lead_owner: boolean (default true)
 * - notify_new_entity_owner: boolean (default true)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  // Only admin/ibm can convert leads
  if (!isAdmin(user)) {
    return NextResponse.json({ error: 'Only administrators can convert leads' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const body = await request.json().catch(() => ({}));

    // Step 1: Get conversion options to find the right layout/mapping
    let conversionOptions: Record<string, unknown> | null = null;
    try {
      const optionsResult = await callMcpTool('ZohoCRM_getLeadConversionOptions', {
        path_variables: { leadId: id },
      });
      const parsed = optionsResult as { content?: Array<{ text?: string }> };
      if (parsed?.content) {
        for (const item of parsed.content) {
          if (item.text) {
            try {
              conversionOptions = JSON.parse(item.text);
            } catch { /* skip */ }
          }
        }
      }
    } catch (err) {
      log('warn', 'api', 'Could not fetch lead conversion options, proceeding with defaults', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Step 2: Get OAuth token
    const accessToken = await getAccessToken();

    // Step 3: Build conversion payload
    const convertData: Record<string, unknown>[] = [{
      overwrite: body.overwrite ?? false,
      notify_lead_owner: body.notify_lead_owner ?? true,
      notify_new_entity_owner: body.notify_new_entity_owner ?? true,
      Accounts: {},
      Contacts: {},
    }];

    // Step 4: Call the Zoho REST API to convert
    const convertUrl = `https://www.zohoapis.com.au/crm/v7/Leads/${id}/actions/convert`;
    const res = await fetch(convertUrl, {
      method: 'POST',
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data: convertData }),
    });

    const responseText = await res.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      log('error', 'api', 'Non-JSON response from lead conversion', {
        response: responseText.slice(0, 500),
      });
      return NextResponse.json({
        error: `Unexpected response from Zoho (HTTP ${res.status})`,
      }, { status: 502 });
    }

    if (!res.ok) {
      if (res.status === 401) cachedToken = null;
      log('error', 'api', `Lead conversion failed for ${id}`, {
        status: res.status,
        response: responseText.slice(0, 500),
      });
      return NextResponse.json({
        error: data?.message || `Zoho API error: ${res.status}`,
        details: data,
      }, { status: 502 });
    }

    // Parse the conversion result
    const conversionResult = data?.data?.[0] || data;
    const accountId = conversionResult?.Accounts || null;
    const contactId = conversionResult?.Contacts || null;

    log('info', 'api', `Lead ${id} converted`, {
      accountId,
      contactId,
      user: user.email,
    });

    return NextResponse.json({
      success: true,
      accountId,
      contactId,
      data: conversionResult,
    });
  } catch (error) {
    log('error', 'api', `Lead conversion failed for ${id}`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Lead conversion failed' },
      { status: 500 }
    );
  }
}
