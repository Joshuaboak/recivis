/**
 * /api/subscriptions — 30-day monthly subscription licences.
 *
 * GET:  The monthly line-up available to the caller's reseller, priced. A
 *       product only appears if its commercial cloud SKU resolves to a real
 *       Zoho product for that reseller's region — Corridor EZ has no ANZ cloud
 *       SKU, for instance, so ANZ partners never see it offered.
 *
 * POST: Create the licences. One placeholder asset per licence, each pushed
 *       to QLM on its own, then the three things that make each one a
 *       subscription: the Monthly Subscription tag, the perpetual-plan tag
 *       when asked for, and Last_Renewal_Transaction stamped with today.
 *
 *       Per licence rather than in bulk because that is what the licensing
 *       side does anyway — the mass function is a loop over the single one
 *       with a four-and-a-half minute budget, so a batch that runs long is
 *       silently cut short. Driving the loop here means every licence is
 *       accounted for and a failure names which one.
 *
 * Both are gated on the Allow Monthly Subscriptions partner permission.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAdmin, type AuthUser } from '@/lib/api-auth';
import { executeZohoTool, parseMcpResult, callMcpTool } from '@/lib/zoho';
import { log } from '@/lib/logger';
import { callZohoFunction, functionOutput } from '@/lib/zoho-functions';
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
 * The currency a partner is quoted in alongside USD.
 *
 * New Zealand partners buy on the ANZ price list, so they are shown AUD — the
 * same reason skuRegion folds NZ into ANZ. Currencies Zoho has no rate for
 * (GBP) fall through and end up quoted in USD only, which is better than a
 * made-up number.
 */
function displayCurrency(currency: string): string {
  return currency === 'NZD' ? 'AUD' : currency;
}

/**
 * USD -> target currency using Zoho's org rates, which are quoted as units of
 * the currency per 1 AUD (the base). Returns null when either leg is missing,
 * because a wrong number here is worse than no number.
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
  const quoteCurrency = displayCurrency(context.currency);
  const convert = await usdConverter(quoteCurrency);

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
    currency: convert ? quoteCurrency : 'USD',
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

    // The account's assets before any of this, so the licences QLM creates can
    // be told apart from the ones that were already there. QLM does not return
    // the ids of what it made when it is called this way, and it deletes the
    // placeholder it was given, so there is nothing to follow through.
    const assetsBefore = await accountAssetIds(accountId);

    // Step 1 — one placeholder per licence. Serial_Key "create" is what tells
    // the QLM function to mint a key rather than push an existing one, and a
    // quantity of 1 is what makes each licence its own record.
    const placeholders: string[] = [];
    for (let i = 0; i < qty; i++) {
      const createResult = await executeZohoTool('create_records', {
        module: 'Assets1',
        records: [{
          Name: 'placeholder',
          Account: { id: accountId },
          Product: { id: resolved.id },
          Serial_Key: 'create',
          Quantity: 1,
          Status: 'Active',
          Start_Date: startDate,
          Renewal_Date: renewalDate,
        }],
        trigger: [],
      });

      const created = (parseMcpResult(createResult).data as Record<string, unknown>[])?.[0];
      if (!created || created.code !== 'SUCCESS') {
        const detail = JSON.stringify(parseMcpResult(createResult).data).slice(0, 500);
        log('error', 'api', 'Monthly subscription placeholder creation failed', {
          data: detail,
          madeSoFar: placeholders.length,
        });
        // Placeholders already made carry no licence and would sit on the
        // customer looking like real assets, so they go before we return.
        await retirePlaceholders(placeholders);
        return NextResponse.json(
          { error: (created?.message as string) || detail || 'Failed to create subscription asset' },
          { status: 500 }
        );
      }
      placeholders.push((created.details as Record<string, unknown>)?.id as string);
    }

    log('info', 'api', 'Monthly subscription placeholders created', {
      count: placeholders.length,
      by: user.email,
    });

    // Let Zoho commit before the Deluge function reads the records back.
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Step 2 — push each placeholder to QLM on its own. One failure does not
    // stop the rest: the licences that did work are real and have to be
    // tagged, and the partner needs to be told the count either way.
    const failures: string[] = [];
    for (const placeholderId of placeholders) {
      try {
        const pushResult = await callZohoFunction('QLMInterfacePushKeyDetails', {
          assetID: placeholderId,
        });
        const output = functionOutput(pushResult);
        // The function reports failure in its return string, not in the HTTP
        // status, so the string is the only thing worth reading.
        if (output.toLowerCase().includes('error')) {
          failures.push(output.slice(0, 200));
          log('error', 'api', 'QLM push failed for monthly subscription', {
            placeholderId,
            output: output.slice(0, 300),
          });
        }
      } catch (err) {
        failures.push(err instanceof Error ? err.message : String(err));
      }
    }

    // Step 3 — whatever QLM created on the account since the snapshot is what
    // was just bought. Placeholders that failed are still there, so they are
    // excluded explicitly rather than assumed gone.
    const assetsAfter = await accountAssetIds(accountId);
    const newAssetIds = assetsAfter.filter(
      id => !assetsBefore.includes(id) && !placeholders.includes(id)
    );

    // Anything left of the placeholders is a licence that never got made.
    const strandedPlaceholders = placeholders.filter(id => assetsAfter.includes(id));
    await retirePlaceholders(strandedPlaceholders);

    log('info', 'api', 'Monthly subscription licences generated', {
      requested: qty,
      created: newAssetIds.length,
      failed: failures.length,
      by: user.email,
    });

    if (newAssetIds.length === 0) {
      return NextResponse.json(
        { error: failures[0] || 'The licences could not be created. Nothing has been charged.' },
        { status: 502 }
      );
    }

    // Step 4 — the three things that make these subscriptions rather than
    // plain licences. Every later subscription view and the billing report
    // keys off them, so a failure here is reported rather than swallowed: the
    // licence exists but is not tracked.
    const tags = [MONTHLY_SUBSCRIPTION_TAG];
    if (perpetualPlan) tags.push(PERPETUAL_PLAN_TAG);

    let markingError: string | null = null;
    for (const assetId of newAssetIds) {
      try {
        await executeZohoTool('add_tags', {
          module: 'Assets1',
          record_id: assetId,
          tags,
        });
        await executeZohoTool('update_records', {
          module: 'Assets1',
          records: [{ id: assetId, Last_Renewal_Transaction: startDate }],
          trigger: [],
        });
      } catch (err) {
        markingError = err instanceof Error ? err.message : String(err);
        log('error', 'api', 'Monthly subscription created but not marked', {
          assetId,
          error: markingError,
        });
      }
    }

    const shortfall = qty - newAssetIds.length;

    return NextResponse.json({
      success: true,
      ids: newAssetIds,
      created: newAssetIds.length,
      requested: qty,
      sku,
      listPrice,
      resellerPrice: resellerPrice(listPrice, context.percentage),
      renewalDate,
      warning: markingError
        ? 'The licences were created but could not all be tagged as monthly subscriptions. Contact CSA before renewing them.'
        : shortfall > 0
          ? `Only ${newAssetIds.length} of ${qty} licences were created. Contact CSA about the rest before trying again.`
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
 * Every asset id currently on an account.
 *
 * Used either side of the QLM push to work out what it created: the function
 * deletes the placeholder it was handed and writes a fresh record, and when it
 * is called with named arguments rather than a request body it returns a
 * human-readable string rather than the ids.
 */
async function accountAssetIds(accountId: string): Promise<string[]> {
  try {
    const result = await callMcpTool('ZohoCRM_getRelatedRecords', {
      path_variables: { parentRecordModule: 'Accounts', parentRecord: accountId, relatedList: 'Assets' },
      query_params: { fields: 'id', page: 1, per_page: 200 },
    });
    return (parseMcpResult(result).data as Record<string, unknown>[])
      .map(a => a.id as string)
      .filter(Boolean);
  } catch (error) {
    log('error', 'api', 'Could not list account assets for subscription reconciliation', {
      accountId,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/**
 * Retire placeholders that never became licences.
 *
 * A placeholder is an asset with no key on it, and left as-is it sits on the
 * customer's licence list looking like something they own. It is marked rather
 * than deleted: the portal has no delete path into the CRM by design, and a
 * cancelled record named for what it is can be cleaned up by CSA without
 * anybody having to work out what it was.
 */
async function retirePlaceholders(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    await executeZohoTool('update_records', {
      module: 'Assets1',
      records: ids.map(id => ({
        id,
        Name: 'Failed subscription placeholder',
        Status: 'Cancelled',
      })),
      trigger: [],
    });
  } catch (error) {
    log('error', 'api', 'Could not retire unused subscription placeholders', {
      ids,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
