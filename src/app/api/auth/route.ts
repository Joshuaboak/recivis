import { NextRequest, NextResponse } from 'next/server';
import { executeZohoTool } from '@/lib/zoho';
import type { User, UserRole } from '@/lib/types';

const ADMIN_EMAILS: Record<string, { name: string; role: UserRole }> = {
  'joshua.boak@civilsurveysolutions.com.au': { name: 'Josh Boak', role: 'admin' },
  'andrew.english@civilsurveyapplications.com.au': { name: 'Andrew English', role: 'ibm' },
};

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check admin emails
    if (ADMIN_EMAILS[normalizedEmail]) {
      const admin = ADMIN_EMAILS[normalizedEmail];
      const user: User = {
        email: normalizedEmail,
        name: admin.name,
        role: admin.role,
      };
      return NextResponse.json({ user });
    }

    // Search Resellers module by email via MCP
    try {
      const result = await executeZohoTool('search_records', {
        module: 'Resellers',
        criteria: `(Email:equals:${normalizedEmail})`,
        fields: 'Name,Email,Region,Currency,Partner_Category,Direct_Customer_Contact,Distributor,Record_Status__s',
      }) as { content?: Array<{ text?: string }> };

      // MCP returns results in content array with text field containing JSON
      let records: Array<Record<string, unknown>> = [];
      if (result?.content) {
        for (const item of result.content) {
          if (item.text) {
            try {
              const parsed = JSON.parse(item.text);
              if (parsed.data) records = parsed.data;
            } catch {
              // not JSON, skip
            }
          }
        }
      }

      if (records.length === 0) {
        return NextResponse.json(
          { error: 'Your email address is not linked to a reseller account. Please contact CSA for access.' },
          { status: 403 }
        );
      }

      const reseller = records[0];

      if (reseller.Record_Status__s === 'Trash') {
        return NextResponse.json(
          { error: 'Your reseller account is no longer active. Please contact CSA.' },
          { status: 403 }
        );
      }

      const partnerCategory = reseller.Partner_Category as string || '';
      const isDistributor = partnerCategory === 'Distributor' || partnerCategory === 'Distributor/Reseller';
      const role: UserRole = isDistributor ? 'distributor' : 'reseller';

      const allowedResellerIds: string[] = [reseller.id as string];

      if (isDistributor) {
        try {
          const children = await executeZohoTool('search_records', {
            module: 'Resellers',
            criteria: `(Distributor:equals:${reseller.id})`,
            fields: 'id,Name,Record_Status__s',
          }) as { content?: Array<{ text?: string }> };

          if (children?.content) {
            for (const item of children.content) {
              if (item.text) {
                try {
                  const parsed = JSON.parse(item.text);
                  if (parsed.data) {
                    for (const child of parsed.data) {
                      if (child.Record_Status__s !== 'Trash') {
                        allowedResellerIds.push(child.id as string);
                      }
                    }
                  }
                } catch {
                  // skip
                }
              }
            }
          }
        } catch {
          // continue with just own ID
        }
      }

      const user: User = {
        email: normalizedEmail,
        name: reseller.Name as string,
        role,
        resellerId: reseller.id as string,
        resellerName: reseller.Name as string,
        region: reseller.Region as string,
        allowedResellerIds,
      };

      return NextResponse.json({ user });
    } catch (zohoError) {
      console.error('Zoho MCP auth error:', zohoError);
      // Fall back to demo mode if MCP is unavailable
      return NextResponse.json({
        user: {
          email: normalizedEmail,
          name: normalizedEmail
            .split('@')[0]
            .replace(/[._]/g, ' ')
            .replace(/\b\w/g, (c: string) => c.toUpperCase()),
          role: 'reseller' as UserRole,
        },
        demo: true,
      });
    }
  } catch (error) {
    console.error('Auth error:', error);
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 500 }
    );
  }
}
