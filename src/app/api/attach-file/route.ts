import { NextRequest, NextResponse } from 'next/server';
import { log } from '@/lib/logger';

/**
 * Attach a file to any Zoho CRM record.
 * 1. Gets an OAuth access token via the getresellerzohotoken Deluge function
 * 2. Uploads the file directly to Zoho CRM Attachments REST API (multipart/form-data)
 */

const TOKEN_URL = 'https://www.zohoapis.com.au/crm/v7/functions/getresellerzohotoken/actions/execute?auth_type=apikey&zapikey=1003.c34f94ef513dd69ce6eada9d6d97dc31.35c2e6e02fc62c21dfcfb5c3391e8e6d&arguments=%7B%22resellerName%22%3A%22Civil%20Survey%20Applications%22%7D';

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60000) {
    return cachedToken.token;
  }

  const res = await fetch(TOKEN_URL, { method: 'POST' });
  if (!res.ok) {
    throw new Error(`Token fetch failed: ${res.status}`);
  }

  const data = await res.json();
  const token = data?.details?.output;

  if (!token || token.startsWith('ERROR')) {
    throw new Error(`Token error: ${token || 'no output'}`);
  }

  cachedToken = {
    token,
    expiresAt: Date.now() + 3600 * 1000, // 1 hour
  };

  log('info', 'auth', 'Got Zoho access token for attachments');
  return token;
}

export async function POST(request: NextRequest) {
  try {
    const { recordID, fileName, base64, moduleName } = await request.json();

    if (!recordID || !fileName || !base64) {
      return NextResponse.json({ error: 'Missing recordID, fileName, or base64' }, { status: 400 });
    }

    const module = moduleName || 'Invoices';
    const sizeKB = Math.round(base64.length / 1024);

    log('info', 'file', `Attaching ${fileName} to ${module}/${recordID} (${sizeKB}KB base64)`);

    // Step 1: Get access token
    const accessToken = await getAccessToken();

    // Step 2: Convert base64 to file and upload via multipart/form-data
    const fileBuffer = Buffer.from(base64, 'base64');
    const blob = new Blob([fileBuffer]);

    const formData = new FormData();
    formData.append('file', blob, fileName);

    const apiUrl = `https://www.zohoapis.com.au/crm/v7/${module}/${recordID}/Attachments`;
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
        cachedToken = null;
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
