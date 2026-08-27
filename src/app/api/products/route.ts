import { NextRequest, NextResponse } from 'next/server';
import { executeZohoTool, parseMcpResult } from '@/lib/zoho';
import { requireAuth } from '@/lib/api-auth';
import { cacheGet, cacheSet } from '@/lib/cache';

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
  /**
   * Lookup by record id, for an order line.
   *
   * A saved line names its product by id and carries no SKU, so repricing one —
   * which needs the product's AUD Unit_Price — had no way to ask for it.
   */
  const id = searchParams.get('id');

  if (!sku && !id) {
    return NextResponse.json({ error: 'sku or id parameter required' }, { status: 400 });
  }

  try {
    // Check Redis cache before hitting Zoho API (10-minute TTL)
    const cacheKey = `products:${id ? `id:${id}` : sku}`;
    const cached = await cacheGet<{ products: unknown[] }>(cacheKey);
    if (cached) return NextResponse.json(cached);

    const result = id
      ? await executeZohoTool('get_record', { module: 'Products', record_id: id })
      : await executeZohoTool('search_records', {
      module: 'Products',
      criteria: `(Product_Code:equals:${sku})`,
      fields: 'id,Product_Name,Product_Code,Unit_Price,Product_Active',
    });

    const parsed = parseMcpResult(result);
    const products = parsed.data.filter(
      (p) => p.Product_Active !== false
    );

    // Cache the response in Redis for 10 minutes (600s)
    const response = { products };
    await cacheSet(cacheKey, response, 600);

    return NextResponse.json(response);
  } catch {
    return NextResponse.json({ products: [] });
  }
}
