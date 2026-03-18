import { NextRequest, NextResponse } from 'next/server';
import { executeZohoTool } from '@/lib/zoho';
import { log } from '@/lib/logger';

/**
 * POST /api/renewals — generate renewal invoices for selected assets
 * Body: { asset_ids: string[] }
 * Returns the created invoice ID from the Deluge function response.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const assetIds = body.asset_ids as string[];

    if (!assetIds || assetIds.length === 0) {
      return NextResponse.json({ error: 'No assets selected' }, { status: 400 });
    }

    log('info', 'api', 'Generating renewal invoice', { assetCount: assetIds.length });

    const result = await executeZohoTool('call_renewal_function', {
      asset_ids: assetIds,
    });

    const response = result as Record<string, unknown>;

    // The Deluge function returns the invoice ID in various formats
    // Try to extract it from the response
    let invoiceId: string | null = null;

    if (response?.details) {
      const details = response.details as Record<string, unknown>;
      if (details?.output) {
        // Parse the output string which contains the invoice ID
        const output = details.output as string;
        try {
          const parsed = JSON.parse(output);
          invoiceId = parsed?.invoiceId || parsed?.invoice_id || parsed?.id || null;
        } catch {
          // Output might be a plain ID string
          if (typeof output === 'string' && output.length > 10) {
            invoiceId = output;
          }
        }
      }
      if (details?.userMessage) {
        // Sometimes the ID is in userMessage
        const msg = (details.userMessage as Array<{ message?: string }>)?.[0]?.message;
        if (msg) {
          const idMatch = msg.match(/\d{15,}/);
          if (idMatch) invoiceId = idMatch[0];
        }
      }
    }

    log('info', 'api', 'Renewal invoice result', {
      invoiceId,
      response: JSON.stringify(response).slice(0, 500),
    });

    return NextResponse.json({ success: true, invoiceId, raw: response });
  } catch (error) {
    log('error', 'api', 'Renewal generation failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to generate renewal invoice' }, { status: 500 });
  }
}
