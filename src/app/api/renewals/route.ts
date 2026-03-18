import { NextRequest, NextResponse } from 'next/server';
import { executeZohoTool } from '@/lib/zoho';
import { log } from '@/lib/logger';

/**
 * POST /api/renewals — generate renewal invoices for selected assets
 * Body: { asset_ids: string[] }
 *
 * Deluge function response format:
 * {
 *   "code": "success",
 *   "details": {
 *     "output": "{\"status\":\"SUCCESS\",\"invoiceIDList\":[\"55779000012345678\"]}",
 *     "userMessage": ["..."],
 *     "id": "..."
 *   }
 * }
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
    let invoiceId: string | null = null;

    // Parse the Deluge function output
    if (response?.details) {
      const details = response.details as Record<string, unknown>;
      if (details?.output && typeof details.output === 'string') {
        try {
          const parsed = JSON.parse(details.output);
          // invoiceIDList is the array of created invoice IDs
          if (parsed.invoiceIDList && Array.isArray(parsed.invoiceIDList) && parsed.invoiceIDList.length > 0) {
            invoiceId = parsed.invoiceIDList[0];
          }
          // Fallback: try other field names
          if (!invoiceId) {
            invoiceId = parsed.invoiceId || parsed.invoice_id || parsed.id || null;
          }
        } catch { /* not JSON */ }
      }

      // Fallback: scan userMessage for a long numeric ID
      if (!invoiceId && details?.userMessage) {
        const messages = details.userMessage as Array<string | { message?: string }>;
        for (const msg of messages) {
          const text = typeof msg === 'string' ? msg : msg?.message || '';
          const idMatch = text.match(/\d{15,}/);
          if (idMatch) {
            invoiceId = idMatch[0];
            break;
          }
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
