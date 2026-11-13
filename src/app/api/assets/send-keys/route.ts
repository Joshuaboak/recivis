/**
 * POST /api/assets/send-keys — email one asset's licence key from the asset view.
 *
 * Body: { assetId, to: 'customer' | 'reseller' }
 *
 * - customer: Deluge `sendkeydetailstocustomer(assetID, serialKey, buttonPusher)`,
 *   which emails the account's Primary Contact via `sendkeyemail`.
 * - reseller: Deluge `sendassetdetailstoresellers(crmAPIRequest, assetID)`, which
 *   emails the Reseller on the asset's account. For most partners that is
 *   themselves; for a distributor it is the reseller under them.
 *
 * Both report failure inside a success-shaped body, so the output string is
 * read rather than the HTTP status.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { log } from '@/lib/logger';
import { callZohoFunction, functionOutput } from '@/lib/zoho-functions';
import { NOT_YOURS_RECORD, requireRecordAccess } from '@/lib/record-access';

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  if (user.role === 'viewer') {
    return NextResponse.json({ error: 'You do not have permission to send keys' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const assetId = body.assetId as string;
    const to = body.to as string;

    if (!assetId) {
      return NextResponse.json({ error: 'assetId required' }, { status: 400 });
    }
    if (to !== 'customer' && to !== 'reseller') {
      return NextResponse.json({ error: "to must be 'customer' or 'reseller'" }, { status: 400 });
    }

    const denied = await requireRecordAccess(user, 'Assets1', assetId, NOT_YOURS_RECORD);
    if (denied) return denied;

    const result = to === 'customer'
      ? await callZohoFunction('sendkeydetailstocustomer', {
          assetID: assetId,
          serialKey: '',
          buttonPusher: user.email,
        })
      : await callZohoFunction('sendassetdetailstoresellers', {
          crmAPIRequest: '',
          assetID: assetId,
        });

    // Each function has one success return; anything else is a failure,
    // including a Zoho REST error, which arrives without a string output.
    const output = functionOutput(result);
    const succeeded = to === 'customer'
      ? output.startsWith('SUCCESS')
      : output.startsWith('Asset details have been sent');
    const failed = !succeeded;

    log(failed ? 'warn' : 'info', 'api', `Send keys to ${to} for asset ${assetId}`, {
      by: user.email,
      output: output.slice(0, 300),
    });

    if (failed) {
      return NextResponse.json(
        { error: output || 'The key email could not be sent' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      message: to === 'customer'
        ? 'Key sent to the customer’s primary contact.'
        : 'Licence keys sent to the reseller on this account.',
    });
  } catch (error) {
    log('error', 'api', 'Asset send keys failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to send keys' }, { status: 500 });
  }
}
