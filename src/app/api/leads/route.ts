/**
 * /api/leads — Unified leads list from Zoho Leads module + Prospect Accounts.
 *
 * GET: Fetches unconverted leads AND accounts where Account_Type='Prospect',
 *      merges them into a unified shape. Supports search, reseller, region,
 *      lead status, and evaluation product filters.
 *
 *      For prospect accounts, also batch-fetches evaluation assets (Assets1
 *      where Evaluation_License=true) to populate evaluation data.
 */

import { NextRequest, NextResponse } from 'next/server';
import { searchAllPages, getAllRecordPages, parseMcpResult, callMcpTool, executeZohoTool } from '@/lib/zoho';
import { log } from '@/lib/logger';
import { requireAuth, isAdmin } from '@/lib/api-auth';

const LEAD_FIELDS = 'Company,Full_Name,First_Name,Last_Name,Email,Phone,Country,Lead_Status,Lead_Source,Product_Interest,Reseller,Owner,Created_Time,Record_Status__s,Converted__s';
const PROSPECT_FIELDS = 'Account_Name,Billing_Country,Reseller,Email_Domain,Owner,Account_Type,Primary_Contact,Created_Time,Record_Status__s';

interface UnifiedLead {
  id: string;
  _source: 'lead' | 'prospect';
  name: string;
  contactName: string;
  email: string;
  phone: string;
  country: string;
  leadStatus: string;
  productInterest: string;
  leadSource: string;
  reseller: { name: string; id: string } | null;
  owner: { name: string } | null;
  evaluations: string[];
  createdTime: string;
}

/** Categorize an asset product name into one of the four evaluation product buckets. */
function categorizeEvalProduct(productName: string): string | null {
  const lower = productName.toLowerCase();
  if (lower.includes('civil site design plus')) return 'Civil Site Design Plus';
  if (lower.includes('civil site design')) return 'Civil Site Design';
  if (lower.includes('corridor')) return 'Corridor EZ';
  if (lower.includes('stringer')) return 'Stringer';
  return null;
}

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search') || '';
  const resellerId = searchParams.get('resellerId');
  const resellerIds = searchParams.get('resellerIds');
  const statusFilter = searchParams.get('status') || '';
  const evalFilter = searchParams.get('evaluation') || '';

  try {
    // Build reseller criteria fragment (shared by both queries)
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

    // --- Fetch Zoho Leads (unconverted only) ---
    let zohoLeads: Record<string, unknown>[] = [];
    try {
      if (search && resellerCriteria) {
        zohoLeads = await searchAllPages(
          'Leads',
          `((Company:starts_with:${search})and${resellerCriteria})`,
          LEAD_FIELDS, 'desc'
        );
      } else if (search) {
        // Word search on leads
        zohoLeads = [];
        for (let page = 1; page <= 10; page++) {
          try {
            const result = await callMcpTool('ZohoCRM_searchRecords', {
              path_variables: { module: 'Leads' },
              query_params: { word: search, fields: LEAD_FIELDS, page },
            });
            const parsed = parseMcpResult(result);
            zohoLeads.push(...parsed.data);
            if (!parsed.moreRecords) break;
          } catch { break; }
        }
      } else if (resellerCriteria) {
        zohoLeads = await searchAllPages('Leads', resellerCriteria, LEAD_FIELDS, 'desc');
      } else {
        // No filter — get all leads using the standard getRecords tool
        zohoLeads = await getAllRecordPages('Leads', LEAD_FIELDS, 'Modified_Time', 'desc');
      }
    } catch (err) {
      log('warn', 'api', 'Leads fetch failed, continuing with prospects only', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Filter out trashed and already-converted leads
    zohoLeads = zohoLeads.filter(
      (r) => r.Record_Status__s !== 'Trash' && !r.Converted__s
    );

    // --- Fetch Prospect Accounts ---
    let prospectAccounts: Record<string, unknown>[] = [];
    try {
      const prospectCriteria = resellerCriteria
        ? `((Account_Type:equals:Prospect)and${resellerCriteria})`
        : '(Account_Type:equals:Prospect)';

      if (search) {
        prospectAccounts = await searchAllPages(
          'Accounts',
          `((Account_Name:starts_with:${search})and(Account_Type:equals:Prospect)${resellerCriteria ? `and${resellerCriteria}` : ''})`,
          PROSPECT_FIELDS, 'desc'
        );
      } else {
        prospectAccounts = await searchAllPages('Accounts', prospectCriteria, PROSPECT_FIELDS, 'desc');
      }
    } catch (err) {
      log('warn', 'api', 'Prospect accounts fetch failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    prospectAccounts = prospectAccounts.filter(
      (r) => r.Record_Status__s !== 'Trash'
    );

    // --- Fetch evaluation assets for prospect accounts ---
    const prospectIds = prospectAccounts.map(a => a.id as string);
    const evalMap = new Map<string, string[]>(); // accountId → evaluation product names

    if (prospectIds.length > 0) {
      try {
        // Search for evaluation assets across all prospect accounts
        const evalAssets = await searchAllPages(
          'Assets1',
          '(Evaluation_License:equals:true)',
          'Name,Product,Account,Evaluation_License,Record_Status__s',
          'desc'
        );

        for (const asset of evalAssets) {
          if (asset.Record_Status__s === 'Trash') continue;
          const account = asset.Account as { id?: string } | null;
          if (!account?.id || !prospectIds.includes(account.id)) continue;

          const productName = (asset.Product as { name?: string })?.name || (asset.Name as string) || '';
          const category = categorizeEvalProduct(productName);
          if (category) {
            const existing = evalMap.get(account.id) || [];
            if (!existing.includes(category)) {
              existing.push(category);
              evalMap.set(account.id, existing);
            }
          }
        }
      } catch (err) {
        log('warn', 'api', 'Evaluation assets fetch failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // --- Normalize into unified shape ---
    const leads: UnifiedLead[] = [];

    for (const lead of zohoLeads) {
      const reseller = lead.Reseller as { name?: string; id?: string } | null;
      const owner = lead.Owner as { name?: string } | null;

      leads.push({
        id: lead.id as string,
        _source: 'lead',
        name: (lead.Company as string) || (lead.Full_Name as string) || '',
        contactName: (lead.Full_Name as string) || '',
        email: (lead.Email as string) || '',
        phone: (lead.Phone as string) || '',
        country: (lead.Country as string) || '',
        leadStatus: (lead.Lead_Status as string) || '',
        productInterest: (lead.Product_Interest as string) || '',
        leadSource: (lead.Lead_Source as string) || '',
        reseller: reseller?.name ? { name: reseller.name, id: reseller.id || '' } : null,
        owner: owner?.name ? { name: owner.name } : null,
        evaluations: [],
        createdTime: (lead.Created_Time as string) || '',
      });
    }

    for (const account of prospectAccounts) {
      const reseller = account.Reseller as { name?: string; id?: string } | null;
      const owner = account.Owner as { name?: string } | null;
      const primaryContact = account.Primary_Contact as { name?: string } | null;
      const accountId = account.id as string;

      leads.push({
        id: accountId,
        _source: 'prospect',
        name: (account.Account_Name as string) || '',
        contactName: primaryContact?.name || '',
        email: (account.Email_Domain as string) || '',
        phone: '',
        country: (account.Billing_Country as string) || '',
        leadStatus: 'Prospect',
        productInterest: '',
        leadSource: '',
        reseller: reseller?.name ? { name: reseller.name, id: reseller.id || '' } : null,
        owner: owner?.name ? { name: owner.name } : null,
        evaluations: evalMap.get(accountId) || [],
        createdTime: (account.Created_Time as string) || '',
      });
    }

    // --- Apply server-side filters ---

    let filtered = leads;

    // Lead status filter
    if (statusFilter) {
      filtered = filtered.filter(l => l.leadStatus === statusFilter);
    }

    // Evaluation filter (only applies to prospects)
    if (evalFilter) {
      if (evalFilter === 'has-evaluation') {
        filtered = filtered.filter(l => l._source === 'lead' || l.evaluations.length > 0);
      } else if (evalFilter === 'no-evaluation') {
        filtered = filtered.filter(l => l._source === 'lead' || l.evaluations.length === 0);
      } else {
        // Specific product filter (e.g., "Civil Site Design")
        filtered = filtered.filter(
          l => l._source === 'lead' || l.evaluations.includes(evalFilter)
        );
      }
    }

    // Sort by created time descending (most recent first)
    filtered.sort((a, b) => {
      const dateA = a.createdTime ? new Date(a.createdTime).getTime() : 0;
      const dateB = b.createdTime ? new Date(b.createdTime).getTime() : 0;
      return dateB - dateA;
    });

    return NextResponse.json({ leads: filtered });
  } catch (error) {
    log('error', 'api', 'Leads fetch failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to load leads' }, { status: 500 });
  }
}

/**
 * POST /api/leads — Create a new lead in Zoho CRM.
 */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  try {
    const body = await request.json();

    // Build lead record — only allow known fields
    const leadData: Record<string, unknown> = {};
    const directFields = [
      'First_Name', 'Last_Name', 'Email', 'Phone', 'Mobile', 'Company',
      'Website', 'Lead_Status', 'Industry', 'Product_Interest', 'Country',
      'Street', 'City', 'State', 'Zip_Code', 'Lead_Source', 'Job_Title3',
      'Description',
    ];
    for (const field of directFields) {
      if (body[field] !== undefined) leadData[field] = body[field];
    }

    // Reseller lookup
    if (body.Reseller) {
      leadData.Reseller = { id: body.Reseller };
    } else if (!isAdmin(user) && user.resellerId) {
      // Auto-assign to the user's reseller
      leadData.Reseller = { id: user.resellerId };
    }

    const result = await executeZohoTool('create_records', {
      module: 'Leads',
      records: [leadData],
      trigger: ['workflow'],
    });

    const parsed = parseMcpResult(result);
    const created = parsed.data[0] as Record<string, unknown> | undefined;

    if (created?.code === 'SUCCESS') {
      const details = created.details as Record<string, unknown>;
      log('info', 'api', 'Lead created', { id: details?.id, by: user.email });
      return NextResponse.json({ success: true, id: details?.id });
    }

    log('warn', 'api', 'Lead creation result', { data: JSON.stringify(parsed.data).slice(0, 300) });
    return NextResponse.json({ success: true, data: parsed.data });
  } catch (error) {
    log('error', 'api', 'Lead creation failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to create lead' }, { status: 500 });
  }
}
