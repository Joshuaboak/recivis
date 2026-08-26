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
import { executeZohoTool, parseMcpResult } from '@/lib/zoho';
import { log } from '@/lib/logger';
import { requireAuth, isAdmin } from '@/lib/api-auth';
import { NOT_YOURS, fetchRecord, requireRecordAccess } from '@/lib/record-access';

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
 * A record id out of whatever Zoho put in a conversion result slot.
 *
 * The slot holds a bare id, a `{ id, name }` lookup, or null depending on the
 * shape of the day. Anything else is not an id and must not be treated as one:
 * an object stringifies to `[object Object]`, which is what ended up in the
 * portal's URL bar.
 */
function recordId(value: unknown): string | null {
  if (typeof value === 'string' && value) return value;
  if (value && typeof value === 'object') {
    const id = (value as { id?: unknown }).id;
    if (typeof id === 'string' && id) return id;
  }
  return null;
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
  const user = authResult;

  const { id } = await params;
  const source = new URL(request.url).searchParams.get('source') || 'lead';

  // A prospect is an Account and a lead is a Lead, and both are scoped by the
  // partner named on the record. Checked before the fetch: the id comes
  // straight off the URL, so without this any lead in the CRM was one link away.
  const denied = await requireRecordAccess(
    user,
    source === 'prospect' ? 'Accounts' : 'Leads',
    id
  );
  if (denied) return denied;

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
      // Fetch from Leads module using the standard get_record tool
      const result = await executeZohoTool('get_record', {
        module: 'Leads',
        record_id: id,
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
 * PATCH /api/leads/[id] — Update a Zoho Lead record.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  const { id } = await params;

  const denied = await requireRecordAccess(user, 'Leads', id);
  if (denied) return denied;

  // Reading a lead is one thing; changing it is another. Viewers are read-only
  // by definition, so they stop here rather than at each field.
  if (user.role === 'viewer') {
    return NextResponse.json({ error: 'Your account is read-only.' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const updateData: Record<string, unknown> = { id };

    // Simple text/picklist fields
    const directFields = [
      'First_Name', 'Last_Name', 'Email', 'Phone', 'Mobile', 'Company',
      'Website', 'Lead_Status', 'Industry', 'Product_Interest', 'Country',
      'Street', 'City', 'State', 'Zip_Code', 'Description', 'Job_Title3',
    ];
    for (const field of directFields) {
      if (body[field] !== undefined) updateData[field] = body[field];
    }

    // Reseller is a lookup field — requires admin/ibm or canViewChildRecords
    if (body.Reseller !== undefined) {
      if (!isAdmin(user) && !user.permissions.canViewChildRecords) {
        return NextResponse.json({ error: 'Insufficient permissions to change reseller' }, { status: 403 });
      }
      // A distributor may move a lead around its own tree, not out of it —
      // otherwise reassignment was a way to hand a lead to a stranger, or to
      // take one by first assigning it to yourself.
      if (body.Reseller && !isAdmin(user) && !user.allowedResellerIds.includes(String(body.Reseller))) {
        return NextResponse.json(
          { error: 'You cannot assign a lead to another partner.' },
          { status: 403 }
        );
      }
      updateData.Reseller = body.Reseller ? { id: body.Reseller } : null;
    }

    const result = await executeZohoTool('update_records', {
      module: 'Leads',
      records: [updateData],
      trigger: [],
    });

    const parsed = parseMcpResult(result);
    log('info', 'api', `Lead ${id} updated`, { fields: Object.keys(body) });
    return NextResponse.json({ success: true, data: parsed.data });
  } catch (error) {
    log('error', 'api', `Lead update failed for ${id}`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to update lead' }, { status: 500 });
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

  // Converting is ordinary partner work — moving an enquiry on once it has
  // taken the trial — so it is a permission rather than a role check. Admins
  // and IBMs keep it unconditionally through the permission resolution itself.
  if (!user.permissions.canConvertLeads) {
    return NextResponse.json(
      { error: 'You do not have permission to convert leads' },
      { status: 403 }
    );
  }

  const { id } = await params;

  // Converting creates an account and a contact from the lead, so it has to be
  // the caller's lead before any of that happens.
  const denied = await requireRecordAccess(user, 'Leads', id, NOT_YOURS);
  if (denied) return denied;

  // Read before the conversion, because afterwards the lead is converted and
  // the partner on it is the only thing that says who the new prospect belongs
  // to. Whether Zoho's field mapping carries Reseller across is configuration,
  // not something this route can rely on — and a prospect with no partner is
  // one its own partner cannot open, since an unowned record is denied.
  const lead = await fetchRecord('Leads', id);
  const leadResellerId = (lead?.Reseller as { id?: string } | null)?.id || null;

  try {
    const body = await request.json().catch(() => ({}));

    // The conversion options endpoint used to be called here and its result
    // thrown away — a round trip per conversion for nothing. Zoho picks the
    // layout and mapping itself when the payload omits them, which is what the
    // payload below does.
    const accessToken = await getAccessToken();

    // Omit Accounts/Contacts to let Zoho create new records from the lead data
    const convertData: Record<string, unknown>[] = [{
      overwrite: body.overwrite ?? false,
      notify_lead_owner: body.notify_lead_owner ?? true,
      notify_new_entity_owner: body.notify_new_entity_owner ?? true,
    }];

    // Call the Zoho REST API to convert
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
      // Extract the most useful error message from Zoho's response
      const zohoError = data?.data?.[0]?.message
        || data?.message
        || data?.data?.[0]?.details?.expected_data_type
        || `Zoho API error: ${res.status}`;
      return NextResponse.json({
        error: zohoError,
        details: data,
      }, { status: 502 });
    }

    // Parse the conversion result.
    //
    // Zoho has three shapes here between versions and modules: the ids sit
    // under `details` or at the top level, and each is either a bare id string
    // or a `{ id, name }` lookup object. Reading only the top level returned
    // null from a conversion that had succeeded; reading only the string form
    // returned the object, which reached the URL as `[object Object]`.
    const conversionResult = data?.data?.[0] || data;
    const ids = (conversionResult?.details ?? conversionResult) as Record<string, unknown>;
    const accountId = recordId(ids?.Accounts);
    const contactId = recordId(ids?.Contacts);

    if (!accountId) {
      // Zoho accepted it, so the lead is converted whatever we can see. Saying
      // so is the only safe answer: reporting failure invites a second attempt.
      log('warn', 'api', `Lead ${id} converted but no account id in the response`, {
        response: responseText.slice(0, 500),
        user: user.email,
      });
      return NextResponse.json({
        success: true,
        accountId: null,
        contactId,
        warning:
          'The lead was converted, but the new prospect could not be opened automatically. Find them on the Leads page.',
        data: conversionResult,
      });
    }

    // Zoho's convert action makes a plain Account. The portal calls this a
    // prospect — a customer who has been through a trial but not yet ordered —
    // and that is a field on the record, `Account_Type`, not a separate module.
    // Left unset, the new record dropped off the Leads page entirely and turned
    // up under Accounts as though it had already bought something.
    //
    // Done after the conversion rather than as part of it because the convert
    // action takes flags, not field values.
    let accountTypeSet = true;
    try {
      await executeZohoTool('update_records', {
        module: 'Accounts',
        records: [{
          id: accountId,
          Account_Type: 'Prospect',
          // Same value Zoho's mapping would have set, when it sets one.
          ...(leadResellerId ? { Reseller: { id: leadResellerId } } : {}),
        }],
        trigger: [],
      });
    } catch (err) {
      // The conversion itself stands. Worth saying so rather than throwing,
      // because a failure here is a record filed in the wrong list, not a
      // record that does not exist.
      accountTypeSet = false;
      log('warn', 'api', `Converted lead ${id} but could not set Account_Type/Reseller`, {
        accountId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    log('info', 'api', `Lead ${id} converted`, {
      accountId,
      contactId,
      accountTypeSet,
      user: user.email,
    });

    return NextResponse.json({
      success: true,
      accountId,
      contactId,
      ...(accountTypeSet
        ? {}
        : {
            warning:
              'The lead was converted, but it could not be marked as a prospect. It will show under Accounts rather than Leads.',
          }),
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
