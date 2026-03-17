import { NextRequest, NextResponse } from 'next/server';
import { log } from '@/lib/logger';

/**
 * Attach a file to a Zoho CRM record.
 * Calls a Deluge custom function that accepts base64 file data.
 *
 * The Deluge function "attachfiletoinvoice" must exist in Zoho CRM with:
 *   Arguments: invoiceId (string), fileName (string), fileBase64 (string)
 *   Code:
 *     fileData = fileBase64.toFile(fileName);
 *     response = zoho.crm.attachFile("Invoices", invoiceId.toLong(), fileData);
 *     return response.toString();
 */

const ZAPIKEY = process.env.ZOHO_API_KEY ||
  '1003.c34f94ef513dd69ce6eada9d6d97dc31.35c2e6e02fc62c21dfcfb5c3391e8e6d';

export async function POST(request: NextRequest) {
  try {
    const { invoiceId, fileName, base64, module } = await request.json();

    if (!invoiceId || !fileName || !base64) {
      return NextResponse.json({ error: 'Missing invoiceId, fileName, or base64' }, { status: 400 });
    }

    const targetModule = module || 'Invoices';

    log('info', 'file', `Attaching ${fileName} to ${targetModule}/${invoiceId}`);

    const args = JSON.stringify({
      invoiceId: invoiceId,
      fileName: fileName,
      fileBase64: base64,
      module: targetModule,
    });

    const url = `https://www.zohoapis.com.au/crm/v2/functions/attachfiletoinvoice/actions/execute?auth_type=apikey&zapikey=${ZAPIKEY}&arguments=${encodeURIComponent(args)}`;

    const res = await fetch(url, { method: 'POST' });
    const responseText = await res.text();

    log('info', 'file', `Attachment result for ${fileName}`, {
      status: res.status,
      result: responseText.slice(0, 300),
    });

    // Try to parse as JSON
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      // Deluge function may not exist yet or returned non-JSON
      log('error', 'file', 'Non-JSON response from attachment function', {
        response: responseText.slice(0, 200),
      });
      return NextResponse.json({
        error: 'The attachment function is not available. The Deluge function "attachfiletoinvoice" needs to be created in Zoho CRM.',
      }, { status: 501 });
    }

    if (!res.ok) {
      return NextResponse.json({ error: `Zoho API error: ${res.status}` }, { status: 502 });
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
