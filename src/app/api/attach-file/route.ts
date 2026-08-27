import { NextRequest, NextResponse } from 'next/server';
import { log } from '@/lib/logger';
import { requireAuth } from '@/lib/api-auth';
import { getZohoToken, clearZohoToken } from '@/lib/zoho-token';

/**
 * Attach a file to any Zoho CRM record.
 * 1. Gets an OAuth access token via the getresellerzohotoken Deluge function
 * 2. Uploads the file directly to Zoho CRM Attachments REST API (multipart/form-data)
 */

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  try {
    const { recordID, fileName, base64, moduleName } = await request.json();

    if (!recordID || !fileName || !base64) {
      return NextResponse.json({ error: 'Missing recordID, fileName, or base64' }, { status: 400 });
    }

    const moduleApi = moduleName || 'Invoices';
    const sizeKB = Math.round(base64.length / 1024);

    log('info', 'file', `Attaching ${fileName} to ${moduleApi}/${recordID} (${sizeKB}KB base64)`);

    // Step 1: Get access token
    const accessToken = await getZohoToken();

    // Step 2: Convert base64 to file and upload via multipart/form-data
    const fileBuffer = Buffer.from(base64, 'base64');
    const blob = new Blob([fileBuffer]);

    const formData = new FormData();
    formData.append('file', blob, fileName);

    const apiUrl = `https://www.zohoapis.com.au/crm/v7/${moduleApi}/${recordID}/Attachments`;
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
      },
      body: formData,
    });

    const responseText = await res.text();

    log('info', 'file', `Attachment result for ${fileName}`, {
      status: res.status,
      result: responseText.slice(0, 500),
    });

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      log('error', 'file', 'Non-JSON response from Zoho Attachments API', {
        response: responseText.slice(0, 300),
      });
      return NextResponse.json({
        error: `Unexpected response from Zoho (HTTP ${res.status})`,
      }, { status: 502 });
    }

    if (!res.ok) {
      // If token expired, clear cache and let user retry
      if (res.status === 401) {
        clearZohoToken();
      }
      return NextResponse.json({
        error: data?.message || `Zoho API error: ${res.status}`,
      }, { status: 502 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    log('error', 'file', 'Attachment failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Attachment failed' },
      { status: 500 }
    );
  }
}
