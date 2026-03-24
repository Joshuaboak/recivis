/**
 * POST /api/send-keys — Send licence key emails via Zoho Deluge function.
 *
 * Calls sendkeyemail with:
 * - assetIDString: asset IDs joined by "|||"
 * - sendToCustomer: boolean (true = send to customer's primary contact, false = send to reseller)
 * - invoiceID: empty string (not used for direct sends)
 * - crmAPIRequest: empty string
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { log } from '@/lib/logger';

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  // Viewer role cannot send keys
  if (user.role === 'viewer') {
    return NextResponse.json({ error: 'You do not have permission to send keys' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { assetIds, sendToCustomer } = body;

    if (!assetIds || !Array.isArray(assetIds) || assetIds.length === 0) {
      return NextResponse.json({ error: 'assetIds array is required' }, { status: 400 });
    }

    if (typeof sendToCustomer !== 'boolean') {
      return NextResponse.json({ error: 'sendToCustomer boolean is required' }, { status: 400 });
    }

    const zapikey = process.env.ZOHO_API_KEY;
    if (!zapikey) {
      return NextResponse.json({ error: 'ZOHO_API_KEY not configured' }, { status: 500 });
    }

    const assetIDString = assetIds.join('|||');

    const url = `https://www.zohoapis.com.au/crm/v7/functions/sendkeyemail/actions/execute?auth_type=apikey&zapikey=${zapikey}&arguments=${encodeURIComponent(
      JSON.stringify({
        crmAPIRequest: '',
        invoiceID: '',
        assetIDString,
        sendToCustomer,
      })
    )}`;

    const res = await fetch(url, { method: 'POST' });
    const result = await res.json();

    log('info', 'api', 'Send keys email triggered', {
      assetCount: assetIds.length,
      sendToCustomer,
      by: user.email,
      result: JSON.stringify(result).slice(0, 300),
    });

    return NextResponse.json({ success: true, result });
  } catch (error) {
    log('error', 'api', 'Send keys failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to send keys' }, { status: 500 });
  }
}
