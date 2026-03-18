import { NextRequest, NextResponse } from 'next/server';
import { executeZohoTool, parseMcpResult } from '@/lib/zoho';
import { log } from '@/lib/logger';

/**
 * POST /api/contacts — create a new contact
 * Body: { First_Name, Last_Name, Email, Phone, Account_Name: { id } }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const contactData: Record<string, unknown> = {
      First_Name: body.First_Name,
      Last_Name: body.Last_Name,
    };
    if (body.Email) contactData.Email = body.Email;
    if (body.Phone) contactData.Phone = body.Phone;
    if (body.Account_Name?.id) contactData.Account_Name = { id: body.Account_Name.id };

    const result = await executeZohoTool('create_records', {
      module: 'Contacts',
      records: [contactData],
      trigger: [],
    });

    const parsed = parseMcpResult(result);
    const created = parsed.data[0] as Record<string, unknown> | undefined;

    if (created?.code === 'SUCCESS') {
      log('info', 'api', 'Contact created', { id: created.details });
      return NextResponse.json({ success: true, id: (created.details as Record<string, unknown>)?.id });
    }

    return NextResponse.json({ success: true, data: parsed.data });
  } catch (error) {
    log('error', 'api', 'Contact creation failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to create contact' }, { status: 500 });
  }
}
