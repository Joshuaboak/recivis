import { NextRequest, NextResponse } from 'next/server';
import { executeZohoTool, parseMcpResult } from '@/lib/zoho';
import { log } from '@/lib/logger';

/**
 * GET /api/assets?id=xxx — get full asset record
 * POST /api/assets — get QLM key details for an asset
 * Body: { assetId: string }
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }

  try {
    const result = await executeZohoTool('get_record', {
      module: 'Assets1',
      record_id: id,
    });
    const parsed = parseMcpResult(result);
    return NextResponse.json({ asset: parsed.data[0] || null });
  } catch (error) {
    log('error', 'api', `Asset fetch failed for ${id}`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to load asset' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const assetId = body.assetId as string;

    if (!assetId) {
      return NextResponse.json({ error: 'assetId required' }, { status: 400 });
    }

    const zapikey =
      process.env.ZOHO_API_KEY ||
      '1003.c34f94ef513dd69ce6eada9d6d97dc31.35c2e6e02fc62c21dfcfb5c3391e8e6d';

    const url = `https://www.zohoapis.com.au/crm/v7/functions/qlminterfaceloadkeydetails/actions/execute?auth_type=apikey&zapikey=${zapikey}&arguments=${encodeURIComponent(
      JSON.stringify({ assetID: assetId })
    )}`;

    const res = await fetch(url, { method: 'POST' });
    const result = await res.json();

    // Parse key details from the last userMessage entry (JSON string)
    let keyDetails: Record<string, string> | null = null;
    let activationError: string | null = null;

    if (result?.details?.userMessage) {
      const messages = result.details.userMessage as string[];
      // Last message is the JSON object with all key details
      const lastMsg = messages[messages.length - 1];
      if (lastMsg) {
        try {
          keyDetails = JSON.parse(lastMsg);
        } catch { /* not JSON */ }
      }
    }

    // Check for activation errors in the output
    if (result?.details?.output && typeof result.details.output === 'string') {
      const output = result.details.output as string;
      if (output.includes('<error>') || output.includes('<message>')) {
        const msgMatch = output.match(/<message>(.*?)<\/message>/);
        if (msgMatch) activationError = msgMatch[1];
      }
    }

    return NextResponse.json({ keyDetails, activationError });
  } catch (error) {
    log('error', 'api', 'QLM key details failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to load key details' }, { status: 500 });
  }
}
