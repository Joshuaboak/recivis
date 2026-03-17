import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * GET /api/resellers?scope=all|own
 * Returns resellers the current user is allowed to assign users to.
 * - admin/ibm: all resellers
 * - distributor manager: own + child resellers
 * - reseller manager: own reseller only
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const resellerId = searchParams.get('resellerId');
    const includeChildren = searchParams.get('includeChildren') === 'true';

    let result;

    if (resellerId && includeChildren) {
      // Distributor: own + children
      result = await query(
        `SELECT id, name, region, partner_category FROM resellers
         WHERE is_active = true AND (id = $1 OR distributor_id = $1)
         ORDER BY name`,
        [resellerId]
      );
    } else if (resellerId) {
      // Reseller: own only
      result = await query(
        'SELECT id, name, region, partner_category FROM resellers WHERE id = $1 AND is_active = true',
        [resellerId]
      );
    } else {
      // Admin: all
      result = await query(
        'SELECT id, name, region, partner_category FROM resellers WHERE is_active = true ORDER BY name'
      );
    }

    return NextResponse.json({ resellers: result.rows });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load resellers' },
      { status: 500 }
    );
  }
}
