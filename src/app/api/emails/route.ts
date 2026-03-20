/**
 * /api/emails — Email history for Zoho CRM records.
 *
 * GET ?module=X&recordId=Y           → List emails (metadata only)
 * GET ?module=X&recordId=Y&messageId=Z → Full email content
 * GET ?module=X&recordId=Y&attachmentId=Z → Download attachment
 *
 * Admin/IBM only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { callMcpTool } from '@/lib/zoho';
import { log } from '@/lib/logger';
import { requireAuth, isAdmin } from '@/lib/api-auth';

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
  const messageId = searchParams.get('messageId');
  const attachmentId = searchParams.get('attachmentId');

  if (!module || !recordId) {
    return NextResponse.json({ error: 'module and recordId are required' }, { status: 400 });
  }

  try {
    // --- Attachment download ---
    if (attachmentId) {
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
    if (messageId) {
      const result = await callMcpTool('ZohoCRM_getSpecificEmail', {
        path_variables: {
          moduleApiName: module,
          id: recordId,
          messageId,
        },
      });

      // Parse the MCP response
      const res = result as { content?: Array<{ text?: string }> };
      if (res?.content) {
        for (const item of res.content) {
          if (item.text) {
            try {
              const parsed = JSON.parse(item.text);
              const email = parsed.Emails?.[0] || null;
              return NextResponse.json({ email });
            } catch { /* skip */ }
          }
        }
      }

      return NextResponse.json({ email: null });
    }

    // --- Email list ---
    const result = await callMcpTool('ZohoCRM_getEmails', {
      path_variables: {
        moduleApiName: module,
        id: recordId,
      },
    });

    // Parse the MCP response
    const res = result as { content?: Array<{ text?: string }> };
    if (res?.content) {
      for (const item of res.content) {
        if (item.text) {
          try {
            const parsed = JSON.parse(item.text);
            return NextResponse.json({
              emails: parsed.Emails || [],
              info: parsed.info || {},
            });
          } catch { /* skip */ }
        }
      }
    }

    return NextResponse.json({ emails: [], info: {} });
  } catch (error) {
    log('error', 'api', `Email fetch failed for ${module}/${recordId}`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to load emails' }, { status: 500 });
  }
}
