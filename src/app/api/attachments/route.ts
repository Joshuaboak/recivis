/**
 * GET /api/attachments?module=Invoices&recordId=...&attachmentId=... — download
 * a file attached to a CRM record.
 *
 * Zoho serves attachments only to an authenticated caller, and the portal's
 * users have no Zoho login, so the file is fetched here with the shared service
 * token and streamed back. That makes this endpoint the door to any attachment
 * in the CRM, and the reason it checks the parent record before it opens: an
 * attachment inherits its owner from the record it hangs off, and a caller who
 * may not read the order may not read its purchase order either.
 */

import { NextRequest, NextResponse } from 'next/server';
import { log } from '@/lib/logger';
import { requireAuth } from '@/lib/api-auth';
import { getZohoToken, clearZohoToken } from '@/lib/zoho-token';
import { NOT_YOURS_RECORD, requireRecordAccess } from '@/lib/record-access';

/**
 * Modules an attachment may be fetched from.
 *
 * An allowlist rather than a pass-through, for the same reason tenant-scope
 * keeps one: a module nobody has decided how to scope is one this cannot check.
 */
const ALLOWED_MODULES = new Set(['Invoices', 'Accounts', 'Leads', 'Contacts']);

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  const { searchParams } = new URL(request.url);
  const moduleName = searchParams.get('module') || 'Invoices';
  const recordId = searchParams.get('recordId') || '';
  const attachmentId = searchParams.get('attachmentId') || '';

  if (!recordId || !attachmentId) {
    return NextResponse.json({ error: 'recordId and attachmentId are required' }, { status: 400 });
  }
  if (!ALLOWED_MODULES.has(moduleName)) {
    return NextResponse.json({ error: 'Attachments are not available for that module' }, { status: 400 });
  }

  const denied = await requireRecordAccess(user, moduleName, recordId, NOT_YOURS_RECORD);
  if (denied) return denied;

  try {
    const token = await getZohoToken();
    const url = `https://www.zohoapis.com.au/crm/v7/${moduleName}/${encodeURIComponent(recordId)}/Attachments/${encodeURIComponent(attachmentId)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    });

    if (!res.ok) {
      if (res.status === 401) clearZohoToken();
      log('warn', 'file', `Attachment download failed (${res.status})`, {
        moduleName,
        recordId,
        attachmentId,
      });
      return NextResponse.json({ error: 'Could not download that file.' }, { status: 502 });
    }

    // Zoho names the file in its own Content-Disposition; passing it straight
    // through keeps the original filename on the way out. `inline` so a PDF
    // opens in the browser rather than landing in Downloads unread.
    const disposition = res.headers.get('content-disposition') || 'inline';
    return new NextResponse(res.body, {
      headers: {
        'Content-Type': res.headers.get('content-type') || 'application/octet-stream',
        'Content-Disposition': disposition.replace(/^attachment/i, 'inline'),
        // A CRM attachment is somebody's commercial paperwork; it does not
        // belong in a shared cache.
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    log('error', 'file', 'Attachment download failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Could not download that file.' }, { status: 500 });
  }
}
