/**
 * /api/currencies — Fetch exchange rates from Zoho CRM.
 *
 * Returns all active currencies with exchange rates relative to AUD (home currency).
 * Cached in Redis for 1 hour since rates don't change frequently.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getCurrencyRates } from '@/lib/currency-rates';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;

  const currencies = await getCurrencyRates();
  if (currencies) return NextResponse.json({ currencies });

  // Fallback rates if Zoho is unavailable
  return NextResponse.json({
    currencies: [
      { code: 'AUD', symbol: '$', rate: 1, name: 'Australian Dollar' },
      { code: 'USD', symbol: 'US$', rate: 0.65, name: 'US Dollar' },
      { code: 'EUR', symbol: '€', rate: 0.60, name: 'Euro' },
      { code: 'INR', symbol: '₹', rate: 54, name: 'Indian Rupee' },
    ]
  });
}
