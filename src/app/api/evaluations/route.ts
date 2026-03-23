/**
 * POST /api/evaluations — Create an evaluation licence in Zoho CRM.
 *
 * Flow:
 * 1. Validate permissions (canCreateEvaluations, maxEvaluationsPerAccount)
 * 2. Create a placeholder asset in Zoho (Assets1 module)
 * 3. Call qlminterfacemasspushkeydetails to generate the real licence
 * 4. Return the created asset ID
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { executeZohoTool, parseMcpResult, callMcpTool } from '@/lib/zoho';
import { log } from '@/lib/logger';

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  if (!user.permissions.canCreateEvaluations) {
    return NextResponse.json({ error: 'You do not have permission to create evaluations' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { accountId, productId, quantity, endDate } = body;

    if (!accountId || !productId || !quantity || !endDate) {
      return NextResponse.json({ error: 'accountId, productId, quantity, and endDate are required' }, { status: 400 });
    }

    // Validate end date — non-extend users cannot go beyond 30 days
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    const daysDiff = Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (daysDiff > 30 && !user.permissions.canExtendEvaluations) {
      return NextResponse.json({ error: 'You do not have permission to extend evaluations beyond 30 days' }, { status: 403 });
    }

    if (daysDiff < 1) {
      return NextResponse.json({ error: 'End date must be in the future' }, { status: 400 });
    }

    // Check max evaluations per account (if not unlimited)
    const maxEvals = user.permissions.maxEvaluationsPerAccount;
    if (maxEvals !== -1) {
      // Count existing evaluation assets for this account
      const existingResult = await callMcpTool('ZohoCRM_getRelatedRecords', {
        path_variables: {
          module: 'Accounts',
          recordID: accountId,
          relatedModule: 'Assets1',
        },
        query_params: {
          fields: 'id,Evaluation_License',
          page: 1,
          per_page: 200,
        },
      });
      const existingParsed = parseMcpResult(existingResult);
      const evalCount = (existingParsed.data as Record<string, unknown>[])?.filter(
        (a: Record<string, unknown>) => a.Evaluation_License === true
      ).length ?? 0;

      if (evalCount >= maxEvals) {
        return NextResponse.json({
          error: `Maximum evaluations per account reached (${maxEvals}). Contact your administrator.`,
        }, { status: 403 });
      }
    }

    // Format dates for Zoho (YYYY-MM-DD)
    const todayStr = today.toISOString().slice(0, 10);
    const endStr = end.toISOString().slice(0, 10);

    // Step 1: Create placeholder asset in Zoho
    const assetData = {
      Asset_Name: 'placeholder',
      Account: { id: accountId },
      Product: { id: productId },
      Serial_Key: 'create123982',
      Quantity: Number(quantity),
      Start_Date: todayStr,
      End_Date: endStr,
    };

    const createResult = await executeZohoTool('create_records', {
      module: 'Assets1',
      records: [assetData],
      trigger: [],
    });

    const createParsed = parseMcpResult(createResult);
    const created = (createParsed.data as Record<string, unknown>[])?.[0];

    if (!created || created.code !== 'SUCCESS') {
      log('error', 'api', 'Evaluation asset creation failed', {
        data: JSON.stringify(createParsed.data).slice(0, 500),
      });
      return NextResponse.json({ error: 'Failed to create evaluation asset in Zoho' }, { status: 500 });
    }

    const placeholderAssetId = (created.details as Record<string, unknown>)?.id as string;
    log('info', 'api', 'Placeholder evaluation asset created', { id: placeholderAssetId, by: user.email });

    // Step 2: Call QLM function to generate the real licence
    const zapikey = process.env.ZOHO_API_KEY;
    if (!zapikey) {
      return NextResponse.json({ error: 'ZOHO_API_KEY not configured' }, { status: 500 });
    }

    const qlmUrl = `https://www.zohoapis.com.au/crm/v7/functions/qlminterfacemasspushkeydetails/actions/execute?auth_type=apikey&zapikey=${zapikey}&arguments=${encodeURIComponent(
      JSON.stringify({ assetID: placeholderAssetId })
    )}`;

    const qlmRes = await fetch(qlmUrl, { method: 'POST' });
    const qlmResult = await qlmRes.json();

    log('info', 'api', 'QLM evaluation licence generated', {
      placeholderId: placeholderAssetId,
      result: JSON.stringify(qlmResult).slice(0, 300),
      by: user.email,
    });

    // The QLM function deletes the placeholder and creates the real asset
    // Extract the new asset ID from the result if available
    let finalAssetId = placeholderAssetId;
    const qlmOutput = qlmResult?.details?.output;
    if (typeof qlmOutput === 'string') {
      try {
        const parsed = JSON.parse(qlmOutput);
        if (parsed?.assetId) finalAssetId = parsed.assetId;
        else if (parsed?.id) finalAssetId = parsed.id;
      } catch {
        // QLM output may not be JSON — that's OK
      }
    }

    return NextResponse.json({ success: true, id: finalAssetId });
  } catch (error) {
    log('error', 'api', 'Evaluation creation failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to create evaluation' }, { status: 500 });
  }
}
