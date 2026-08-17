/**
 * /api/subscriptions — 30-day monthly subscription licences.
 *
 * GET:  The monthly line-up available to the caller's reseller, priced. A
 *       product only appears if its commercial cloud SKU resolves to a real
 *       Zoho product for that reseller's region — Corridor EZ has no ANZ cloud
 *       SKU, for instance, so ANZ partners never see it offered.
 *
 * POST: Create the licence. Same path as an evaluation (placeholder asset ->
 *       QLM function) plus the three things that make it a subscription: the
 *       Monthly Subscription tag, the perpetual-plan tag when asked for, and
 *       Last_Renewal_Transaction stamped with today.
 *
 * Both are gated on the Allow Monthly Subscriptions partner permission.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAdmin, type AuthUser } from '@/lib/api-auth';
import { executeZohoTool, parseMcpResult, callMcpTool } from '@/lib/zoho';
import { log } from '@/lib/logger';
import { cacheGet, cacheSet } from '@/lib/cache';
import { CSA_INTERNAL_ID, CSA_ZOHO_ID } from '@/lib/constants';
import {
  MONTHLY_PRODUCTS,
  MONTHLY_SUBSCRIPTION_TAG,
  PERPETUAL_PLAN_TAG,
  SUBSCRIPTION_TERM_DAYS,
  buildMonthlySku,
  findMonthlyProduct,
  monthlyListPrice,
  resellerPrice,
  todayIso,
  addDays,
} from '@/lib/subscriptions';

/** The reseller context a monthly quote depends on. */
interface ResellerContext {
  region: string;
  currency: string;
  percentage: number;
  /** Who invoices this partner for monthly usage — their distributor, or CSA. */
  billedBy: string;
}

/** Who the partner settles with. Distributors and direct resellers pay CSA. */
const CSA_BILLING_NAME = 'Civil Survey Applications';

/** Load region, currency, commission and billing counterparty from Zoho. */
async function loadResellerContext(user: AuthUser): Promise<ResellerContext> {
  const fallback: ResellerContext = {
    region: user.resellerRegion || 'AU',
    currency: 'USD',
    percentage: 0,
    billedBy: CSA_BILLING_NAME,
  };
  if (!user.resellerId) return fallback;

  const zohoId = user.resellerId === CSA_INTERNAL_ID ? CSA_ZOHO_ID : user.resellerId;
  try {
    const result = await executeZohoTool('get_record', { module: 'Resellers', record_id: zohoId });
    const record = parseMcpResult(result).data[0];
    if (!record) return fallback;
    const distributor = record.Distributor as { name?: string } | null;
    return {
      region: (record.Region as string) || fallback.region,
      currency: (record.Currency as string) || fallback.currency,
      percentage: Number(record.Reseller_Sale) || 0,
      billedBy: distributor?.name || CSA_BILLING_NAME,
    };
  } catch {
    return fallback;
  }
}

/**
 * USD -> target currency using Zoho's org rates, which are quoted as units of
 * the currency per 1 AUD (the base). Returns null when either leg is missing —
 * NZD and GBP resellers exist in the portal but are not configured in Zoho, and
 * a wrong number here is worse than no number.
 */
async function usdConverter(targetCurrency: string): Promise<((usd: number) => number) | null> {
  if (targetCurrency === 'USD') return (usd: number) => usd;
  try {
    const result = await callMcpTool('ZohoCRM_getCurrencies', {});
    const res = result as { content?: Array<{ text?: string }> };
    const rates: Record<string, number> = {};
    for (const item of res?.content || []) {
      if (!item.text) continue;
      try {
        const parsed = JSON.parse(item.text);
        for (const c of parsed.currencies || []) {
          const code = c.iso_code as string;
          const rate = Number(c.exchange_rate);
          if (code && rate > 0) rates[code] = rate;
        }
      } catch { /* skip */ }
    }
    const usdRate = rates['USD'];
    const targetRate = rates[targetCurrency];
    if (!usdRate || !targetRate) return null;
    return (usd: number) => Math.round((usd / usdRate) * targetRate * 100) / 100;
  } catch {
    return null;
  }
}

/** Resolve a SKU to a Zoho product, or null when it does not exist. */
async function resolveSku(sku: string): Promise<{ id: string; name: string } | null> {
  const cacheKey = `subscription-sku:${sku}`;
  const cached = await cacheGet<{ id: string; name: string } | { missing: true }>(cacheKey);
  if (cached) return 'missing' in cached ? null : cached;

  try {
    const result = await executeZohoTool('search_records', {
      module: 'Products',
      criteria: `(Product_Code:equals:${sku})`,
      fields: 'id,Product_Name,Product_Code,Product_Active',
    });
    const match = parseMcpResult(result).data.find(p => p.Product_Active !== false);
    if (!match) {
      await cacheSet(cacheKey, { missing: true }, 600);
      return null;
    }
    const product = {
      id: match.id as string,
      name: (match.Product_Name as string) || sku,
    };
    await cacheSet(cacheKey, product, 600);
    return product;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  if (!user.permissions.canMonthlySubscriptions) {
    return NextResponse.json({ error: 'You do not have permission to create monthly subscriptions' }, { status: 403 });
  }

  const context = await loadResellerContext(user);
  const convert = await usdConverter(context.currency);

  const products = await Promise.all(
    MONTHLY_PRODUCTS.map(async product => {
      const sku = buildMonthlySku(product.code, context.region);
      const resolved = await resolveSku(sku);
      if (!resolved) return null;

      const price = (usd: number) => {
        const reseller = resellerPrice(usd, context.percentage);
        return {
          usdList: usd,
          usdReseller: reseller,
          localList: convert ? convert(usd) : null,
          localReseller: convert ? convert(reseller) : null,
        };
      };

      return {
        code: product.code,
        label: product.label,
        sku,
        productId: resolved.id,
        productName: resolved.name,
        standard: price(product.usdPrice),
        perpetual: product.perpetualUsdPrice != null ? price(product.perpetualUsdPrice) : null,
      };
    })
  );

  return NextResponse.json({
    products: products.filter(Boolean),
    currency: convert ? context.currency : 'USD',
    resellerPercentage: context.percentage,
    billedBy: context.billedBy,
    termDays: SUBSCRIPTION_TERM_DAYS,
  });
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  if (!user.permissions.canMonthlySubscriptions) {
    return NextResponse.json({ error: 'You do not have permission to create monthly subscriptions' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { accountId, productCode, quantity, perpetualPlan } = body as {
      accountId?: string;
      productCode?: string;
      quantity?: number;
      perpetualPlan?: boolean;
    };

    if (!accountId || !productCode) {
      return NextResponse.json({ error: 'accountId and productCode are required' }, { status: 400 });
    }

    const product = findMonthlyProduct(productCode);
    if (!product) {
      return NextResponse.json({ error: `Unknown monthly product: ${productCode}` }, { status: 400 });
    }

    const listPrice = monthlyListPrice(product, !!perpetualPlan);
    if (listPrice === null) {
      return NextResponse.json(
        { error: `${product.label} is not available on the perpetual purchase plan` },
        { status: 400 }
      );
    }

    const qty = Math.max(1, Number(quantity) || 1);

    // Account ownership — same guard the evaluation route applies.
    if (!isAdmin(user) && user.allowedResellerIds.length > 0) {
      const accResult = await callMcpTool('ZohoCRM_getRecord', {
        path_variables: { module: 'Accounts', recordId: accountId },
        query_params: { fields: 'Reseller' },
      });
      const accReseller = (parseMcpResult(accResult).data[0] as Record<string, unknown>)?.Reseller as { id?: string } | null;
      if (accReseller?.id && !user.allowedResellerIds.includes(accReseller.id)) {
        return NextResponse.json({ error: 'Cannot create subscriptions for this account' }, { status: 403 });
      }
    }

    const context = await loadResellerContext(user);
    const sku = buildMonthlySku(product.code, context.region);
    const resolved = await resolveSku(sku);
    if (!resolved) {
      return NextResponse.json(
        { error: `${product.label} is not available for your region (no product for ${sku})` },
        { status: 400 }
      );
    }

    const startDate = todayIso();
    const renewalDate = addDays(startDate, SUBSCRIPTION_TERM_DAYS);

    // Step 1 — placeholder asset. QLM replaces it with the real licence.
    const createResult = await executeZohoTool('create_records', {
      module: 'Assets1',
      records: [{
        Name: 'placeholder',
        Account: { id: accountId },
        Product: { id: resolved.id },
        Serial_Key: String(Date.now()),
        Quantity: qty,
        Status: 'Active',
        Start_Date: startDate,
        Renewal_Date: renewalDate,
      }],
      trigger: [],
    });

    const created = (parseMcpResult(createResult).data as Record<string, unknown>[])?.[0];
    if (!created || created.code !== 'SUCCESS') {
      const detail = JSON.stringify(parseMcpResult(createResult).data).slice(0, 500);
      log('error', 'api', 'Monthly subscription asset creation failed', { data: detail });
      return NextResponse.json({ error: (created?.message as string) || detail || 'Failed to create subscription asset' }, { status: 500 });
    }

    const placeholderAssetId = (created.details as Record<string, unknown>)?.id as string;
    log('info', 'api', 'Placeholder monthly subscription asset created', { id: placeholderAssetId, by: user.email });

    // Let Zoho commit before the Deluge function reads the record back.
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Step 2 — QLM generates the real licence and swaps out the placeholder.
    const zapikey = process.env.ZOHO_API_KEY;
    if (!zapikey) {
      return NextResponse.json({ error: 'ZOHO_API_KEY not configured' }, { status: 500 });
    }

    const qlmArgs = JSON.stringify({ assetID: placeholderAssetId });
    const qlmUrl = `https://www.zohoapis.com.au/crm/v7/functions/qlminterfacemasspushkeydetails/actions/execute?auth_type=apikey&zapikey=${zapikey}&arguments=${encodeURIComponent(qlmArgs)}`;
    const qlmRes = await fetch(qlmUrl, { method: 'POST' });
    const qlmResult = await qlmRes.json();

    log('info', 'api', 'QLM monthly subscription licence generated', {
      placeholderId: placeholderAssetId,
      result: JSON.stringify(qlmResult).slice(0, 300),
      by: user.email,
    });

    const finalAssetId = await resolveFinalAssetId(qlmResult, placeholderAssetId, accountId, resolved.id);

    // Step 3 — the three things that make this a subscription rather than a
    // plain licence. Tagging and the transaction date are what every later
    // subscription view and the billing reports key off, so a failure here is
    // reported rather than swallowed: the licence exists but is not tracked.
    const tags = [MONTHLY_SUBSCRIPTION_TAG];
    if (perpetualPlan) tags.push(PERPETUAL_PLAN_TAG);

    let markingError: string | null = null;
    try {
      await executeZohoTool('add_tags', {
        module: 'Assets1',
        record_id: finalAssetId,
        tags,
      });
      await executeZohoTool('update_records', {
        module: 'Assets1',
        records: [{ id: finalAssetId, Last_Renewal_Transaction: startDate }],
        trigger: [],
      });
    } catch (err) {
      markingError = err instanceof Error ? err.message : String(err);
      log('error', 'api', 'Monthly subscription created but not marked', {
        assetId: finalAssetId,
        error: markingError,
      });
    }

    return NextResponse.json({
      success: true,
      id: finalAssetId,
      sku,
      listPrice,
      resellerPrice: resellerPrice(listPrice, context.percentage),
      renewalDate,
      warning: markingError
        ? 'The licence was created but could not be tagged as a monthly subscription. Contact CSA before renewing it.'
        : undefined,
    });
  } catch (error) {
    log('error', 'api', 'Monthly subscription creation failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to create monthly subscription' }, { status: 500 });
  }
}

/**
 * Work out which asset the QLM function ended up creating.
 *
 * QLM deletes the placeholder and writes a fresh record, and it does not
 * reliably report the new id. When the output does not carry one, the newest
 * matching asset on the account is the licence just made — without this the
 * tag and transaction date would land on a record that no longer exists.
 */
async function resolveFinalAssetId(
  qlmResult: unknown,
  placeholderAssetId: string,
  accountId: string,
  productId: string
): Promise<string> {
  const output = (qlmResult as { details?: { output?: unknown } })?.details?.output;
  if (typeof output === 'string') {
    try {
      const parsed = JSON.parse(output);
      if (parsed?.assetId) return parsed.assetId as string;
      if (parsed?.id) return parsed.id as string;
    } catch { /* QLM output is not always JSON */ }
  }

  try {
    const result = await callMcpTool('ZohoCRM_getRelatedRecords', {
      path_variables: { parentRecordModule: 'Accounts', parentRecord: accountId, relatedList: 'Assets' },
      query_params: { fields: 'id,Product,Created_Time', page: 1, per_page: 200 },
    });
    const assets = parseMcpResult(result).data as Record<string, unknown>[];
    const mine = assets
      .filter(a => (a.Product as { id?: string })?.id === productId)
      .sort((a, b) => String(b.Created_Time || '').localeCompare(String(a.Created_Time || '')));
    if (mine[0]?.id) return mine[0].id as string;
  } catch { /* fall through to the placeholder id */ }

  return placeholderAssetId;
}
