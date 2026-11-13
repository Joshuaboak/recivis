/**
 * currency-rates.ts — exchange rates from Zoho CRM, shared server-side.
 *
 * Rates are relative to AUD, the CRM's home currency: `rate` is how much of
 * that currency one Australian dollar buys (AUD itself is 1). Cached in Redis
 * for an hour, as rates do not move fast enough to matter within one.
 */

import { callMcpTool } from '@/lib/zoho';
import { cacheGet, cacheSet } from '@/lib/cache';

export interface CurrencyRate {
  code: string;
  symbol: string;
  rate: number;
  name: string;
}

const CACHE_KEY = 'currencies:rates';

/** Live rates from the CRM, or null when they could not be loaded. */
export async function getCurrencyRates(): Promise<CurrencyRate[] | null> {
  const cached = await cacheGet<CurrencyRate[]>(CACHE_KEY);
  if (cached) return cached;

  try {
    const result = await callMcpTool('ZohoCRM_getCurrencies', {});
    const res = result as { content?: Array<{ text?: string }> };
    let currencies: CurrencyRate[] = [];

    for (const item of res?.content || []) {
      if (!item.text) continue;
      try {
        const parsed = JSON.parse(item.text);
        const data = parsed.currencies || parsed.data || [];
        currencies = data
          .filter((c: Record<string, unknown>) => c.is_active !== false)
          .map((c: Record<string, unknown>) => ({
            code: c.iso_code as string || c.ISO_code as string || '',
            symbol: c.symbol as string || '$',
            rate: Number(c.exchange_rate) || 1,
            name: c.name as string || c.currency_name as string || '',
          }));
      } catch { /* skip */ }
    }

    if (currencies.length === 0) return null;

    // AUD is the base; make sure it is present at 1.
    if (!currencies.find(c => c.code === 'AUD')) {
      currencies.unshift({ code: 'AUD', symbol: '$', rate: 1, name: 'Australian Dollar' });
    }

    await cacheSet(CACHE_KEY, currencies, 3600);
    return currencies;
  } catch {
    return null;
  }
}

/**
 * Convert between two currencies via AUD. Returns null when either rate is
 * unknown, so callers can keep the original currency rather than show a
 * figure converted at a guessed rate.
 */
export function convertBetween(
  amount: number,
  from: string,
  to: string,
  rates: CurrencyRate[] | null
): number | null {
  if (from === to) return amount;
  if (!rates) return null;
  const rateOf = (code: string) => (code === 'AUD' ? 1 : rates.find(c => c.code === code)?.rate);
  const fromRate = rateOf(from);
  const toRate = rateOf(to);
  if (!fromRate || !toRate || fromRate <= 0 || toRate <= 0) return null;
  return Math.round((amount / fromRate) * toRate * 100) / 100;
}
