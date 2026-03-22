/**
 * /api/currencies — Fetch exchange rates from Zoho CRM.
 *
 * Returns all active currencies with exchange rates relative to AUD (home currency).
 * Cached in Redis for 1 hour since rates don't change frequently.
 */

import { NextRequest, NextResponse } from 'next/server';
import { callMcpTool } from '@/lib/zoho';
import { requireAuth } from '@/lib/api-auth';
import { cacheGet, cacheSet } from '@/lib/cache';

interface CurrencyRate {
  code: string;
  symbol: string;
  rate: number;
  name: string;
}

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const cached = await cacheGet<CurrencyRate[]>('currencies:rates');
  if (cached) return NextResponse.json({ currencies: cached });

  try {
    const result = await callMcpTool('ZohoCRM_getCurrencies', {});

    const res = result as { content?: Array<{ text?: string }> };
    let currencies: CurrencyRate[] = [];

    if (res?.content) {
      for (const item of res.content) {
        if (item.text) {
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
      }
    }

    // Ensure AUD is present with rate 1
    if (!currencies.find(c => c.code === 'AUD')) {
      currencies.unshift({ code: 'AUD', symbol: '$', rate: 1, name: 'Australian Dollar' });
    }

    await cacheSet('currencies:rates', currencies, 3600); // 1 hour
    return NextResponse.json({ currencies });
  } catch {
    // Fallback rates if Zoho is unavailable
    return NextResponse.json({
      currencies: [
        { code: 'AUD', symbol: '$', rate: 1, name: 'Australian Dollar' },
        { code: 'USD', symbol: 'US$', rate: 0.65, name: 'US Dollar' },
        { code: 'EUR', symbol: '€', rate: 0.60, name: 'Euro' },
        { code: 'GBP', symbol: '£', rate: 0.52, name: 'British Pound' },
        { code: 'NZD', symbol: 'NZ$', rate: 1.10, name: 'New Zealand Dollar' },
        { code: 'INR', symbol: '₹', rate: 54, name: 'Indian Rupee' },
      ]
    });
  }
}
