/**
 * zoho-token.ts — an OAuth access token for the Zoho REST API.
 *
 * Most of the portal reaches Zoho over MCP, which carries its own key. A few
 * things cannot: attachments are multipart uploads and binary downloads, and
 * lead conversion is a REST action with no MCP equivalent. Those go to
 * `zohoapis.com.au` directly and need a bearer token, which comes from the
 * `getresellerzohotoken` Deluge function.
 *
 * This lived in three route files with three private caches, which meant three
 * tokens in flight and three places to fix when one expired badly. One cache
 * here, and `clearZohoToken()` for the 401 path.
 */

import { log } from './logger';

/** Tokens last an hour; renewed a minute early so one never expires in flight. */
const TOKEN_TTL_MS = 3600 * 1000;
const RENEW_MARGIN_MS = 60 * 1000;

let cached: { token: string; expiresAt: number } | null = null;
/** In-flight fetch, so concurrent callers wait on one request rather than racing. */
let inFlight: Promise<string> | null = null;

function tokenUrl(): string {
  const key = process.env.ZOHO_API_KEY;
  if (!key) throw new Error('ZOHO_API_KEY not set');
  return (
    'https://www.zohoapis.com.au/crm/v7/functions/getresellerzohotoken/actions/execute' +
    `?auth_type=apikey&zapikey=${key}` +
    '&arguments=%7B%22resellerName%22%3A%22Civil%20Survey%20Applications%22%7D'
  );
}

async function requestToken(): Promise<string> {
  const res = await fetch(tokenUrl(), { method: 'POST' });
  if (!res.ok) throw new Error(`Token fetch failed: ${res.status}`);

  const data = await res.json();
  const token = data?.details?.output;
  // The function reports its own failures in the output rather than by status.
  if (!token || typeof token !== 'string' || token.startsWith('ERROR')) {
    throw new Error(`Token error: ${token || 'no output'}`);
  }

  cached = { token, expiresAt: Date.now() + TOKEN_TTL_MS };
  log('info', 'auth', 'Got Zoho access token');
  return token;
}

/** A valid token, from cache when there is one. */
export async function getZohoToken(): Promise<string> {
  if (cached && Date.now() < cached.expiresAt - RENEW_MARGIN_MS) {
    return cached.token;
  }
  if (!inFlight) {
    inFlight = requestToken().finally(() => { inFlight = null; });
  }
  return inFlight;
}

/**
 * Throw away the cached token.
 *
 * Call this on a 401 from Zoho: the token is dead earlier than its stated
 * lifetime, and without this every retry reuses the same dead one.
 */
export function clearZohoToken(): void {
  cached = null;
}
