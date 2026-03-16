import { NextRequest, NextResponse } from 'next/server';
import { zohoTools } from '@/lib/zoho';
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

    // Check if Zoho is configured
    if (!process.env.ZOHO_CLIENT_ID) {
      // In demo mode, allow login without Zoho
      return NextResponse.json({
        user: {
          email: normalizedEmail,
          name: normalizedEmail.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
          role: 'admin' as UserRole,
        },
        demo: true,
      });
    }

    // Search Resellers module by email
    try {
      const result = await zohoTools.searchRecords(
        'Resellers',
        `Email:equals:${normalizedEmail}`,
        ['Name', 'Email', 'Region', 'Currency', 'Partner_Category', 'Direct_Customer_Contact', 'Distributor', 'Record_Status__s']
      ) as { data?: Array<Record<string, unknown>> };

      if (!result?.data || result.data.length === 0) {
        return NextResponse.json(
          { error: 'Your email address is not linked to a reseller account. Please contact CSA for access.' },
          { status: 403 }
        );
      }

      const reseller = result.data[0];

      // Check Record_Status__s
      if (reseller.Record_Status__s === 'Trash') {
        return NextResponse.json(
          { error: 'Your reseller account is no longer active. Please contact CSA.' },
          { status: 403 }
        );
      }

      const partnerCategory = reseller.Partner_Category as string || '';
      const isDistributor = partnerCategory === 'Distributor' || partnerCategory === 'Distributor/Reseller';
      const role: UserRole = isDistributor ? 'distributor' : 'reseller';

      // Build allowed reseller IDs
      const allowedResellerIds: string[] = [reseller.id as string];

      if (isDistributor) {
        // Find child resellers
        try {
          const children = await zohoTools.searchRecords(
            'Resellers',
            `Distributor:equals:${reseller.id}`,
            ['id', 'Name', 'Record_Status__s']
          ) as { data?: Array<Record<string, unknown>> };

          if (children?.data) {
            for (const child of children.data) {
              if (child.Record_Status__s !== 'Trash') {
                allowedResellerIds.push(child.id as string);
              }
            }
          }
        } catch {
          // If child lookup fails, continue with just the distributor's own ID
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
      console.error('Zoho auth error:', zohoError);
      return NextResponse.json(
        { error: 'Unable to verify your account. Please try again later.' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Auth error:', error);
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 500 }
    );
  }
}
