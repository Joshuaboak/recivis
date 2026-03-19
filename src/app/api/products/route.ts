import { NextRequest, NextResponse } from 'next/server';
import { executeZohoTool, parseMcpResult } from '@/lib/zoho';
import { requireAuth } from '@/lib/api-auth';

/**
 * GET /api/products?sku=CSD-SU-CL-COM-1YR-SUB-ANZ
 * Search products by Product_Code (SKU).
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  const { searchParams } = new URL(request.url);
  const sku = searchParams.get('sku');

  if (!sku) {
    return NextResponse.json({ error: 'sku parameter required' }, { status: 400 });
  }

  try {
    const result = await executeZohoTool('search_records', {
      module: 'Products',
      criteria: `(Product_Code:equals:${sku})`,
      fields: 'id,Product_Name,Product_Code,Unit_Price,Product_Active',
    });

    const parsed = parseMcpResult(result);
    const products = parsed.data.filter(
      (p) => p.Product_Active !== false
    );

    return NextResponse.json({ products });
  } catch {
    return NextResponse.json({ products: [] });
  }
}
