import { NextRequest, NextResponse } from 'next/server';
import { executeZohoTool, parseMcpResult } from '@/lib/zoho';
import { log } from '@/lib/logger';
import { requireAuth } from '@/lib/api-auth';
import { createContactSchema, validateBody } from '@/lib/validation';

/**
 * POST /api/contacts — create a new contact
 * Body: { First_Name, Last_Name, Email, Phone, Account_Name: { id } }
 */
export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  try {
    // Validate request body with Zod schema
    const rawBody = await request.json();
    const validation = validateBody(createContactSchema, rawBody);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    const body = validation.data;

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
      trigger: ['workflow'],
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
