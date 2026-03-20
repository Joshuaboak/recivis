/**
 * /api/emails — Email history for Zoho CRM records.
 *
 * GET ?module=X&recordId=Y              → List emails for a single record
 * GET ?module=X&recordIds=Y1,Y2,Y3      → List emails for multiple records (merged, sorted)
 * GET ?module=X&recordId=Y&messageId=Z  → Full email content
 * GET ?module=X&recordId=Y&attachmentId=Z → Download attachment
 *
 * Admin/IBM only. The recordIds param is used for Accounts — fetches emails
 * for each Contact under the account since Zoho ties emails to Contacts.
 */

import { NextRequest, NextResponse } from 'next/server';
import { callMcpTool } from '@/lib/zoho';
import { log } from '@/lib/logger';
import { requireAuth, isAdmin } from '@/lib/api-auth';

/** Parse the standard MCP content response into JSON. */
function parseMcpContent(result: unknown): Record<string, unknown> | null {
  const res = result as { content?: Array<{ text?: string }> };
  if (res?.content) {
    for (const item of res.content) {
      if (item.text) {
        try {
          return JSON.parse(item.text);
        } catch { /* skip */ }
      }
    }
  }
  return null;
}

/** Fetch emails for a single record ID. Returns the Emails array. */
async function fetchEmailsForRecord(module: string, recordId: string): Promise<Record<string, unknown>[]> {
  try {
    const result = await callMcpTool('ZohoCRM_getEmails', {
      path_variables: {
        moduleApiName: module,
        id: recordId,
      },
    });

    const parsed = parseMcpContent(result);
    return (parsed?.Emails as Record<string, unknown>[]) || [];
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  if (!isAdmin(user)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const module = searchParams.get('module');
  const recordId = searchParams.get('recordId');
  const recordIds = searchParams.get('recordIds');
  const messageId = searchParams.get('messageId');
  const attachmentId = searchParams.get('attachmentId');

  if (!module || (!recordId && !recordIds)) {
    return NextResponse.json({ error: 'module and recordId/recordIds are required' }, { status: 400 });
  }

  try {
    // --- Attachment download ---
    if (attachmentId && recordId) {
      const result = await callMcpTool('ZohoCRM_getAttachmentById', {
        path_variables: {
          moduleApiName: module,
          recordId,
          id: attachmentId,
        },
      });

      return NextResponse.json({ attachment: result });
    }

    // --- Specific email content ---
    if (messageId && recordId) {
      try {
        const result = await callMcpTool('ZohoCRM_getSpecificEmail', {
          path_variables: {
            moduleApiName: module,
            id: recordId,
            messageId,
          },
        });

        const parsed = parseMcpContent(result);
        if (parsed) {
          if (parsed.code === 'NO_PERMISSION' || parsed.status === 'error') {
            return NextResponse.json({ email: null, error: `permission denied: ${parsed.message || 'NO_PERMISSION'}` });
          }
          const email = (parsed.Emails as Record<string, unknown>[])?.[0] || null;
          return NextResponse.json({ email });
        }

        return NextResponse.json({ email: null });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (errMsg.includes('NO_PERMISSION') || errMsg.includes('permission')) {
          return NextResponse.json({ email: null, error: 'permission denied: IMAP email' });
        }
        throw err;
      }
    }

    // --- Email list (multiple records) ---
    if (recordIds) {
      const ids = recordIds.split(',').filter(Boolean);
      const allEmails = await Promise.all(
        ids.map(id => fetchEmailsForRecord(module, id))
      );

      // Merge, deduplicate by message_id, and sort by time descending
      const seen = new Set<string>();
      const merged: Record<string, unknown>[] = [];
      for (const batch of allEmails) {
        for (const email of batch) {
          const mid = email.message_id as string;
          if (mid && !seen.has(mid)) {
            seen.add(mid);
            merged.push(email);
          }
        }
      }

      merged.sort((a, b) => {
        const timeA = new Date(a.time as string || 0).getTime();
        const timeB = new Date(b.time as string || 0).getTime();
        return timeB - timeA;
      });

      return NextResponse.json({ emails: merged, info: { count: merged.length } });
    }

    // --- Email list (single record) ---
    const emails = await fetchEmailsForRecord(module, recordId!);
    return NextResponse.json({ emails, info: { count: emails.length } });
  } catch (error) {
    log('error', 'api', `Email fetch failed for ${module}/${recordId || recordIds}`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to load emails' }, { status: 500 });
  }
}
