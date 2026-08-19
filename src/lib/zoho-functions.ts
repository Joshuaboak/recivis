/**
 * zoho-functions.ts — calling CSA's Deluge functions over the Zoho REST API.
 *
 * These bypass the MCP transport entirely, which matters twice over. They are
 * where the genuinely irreversible things happen — minting a licence key on
 * the external licensing server, emailing a customer, generating an invoice —
 * and until this helper existed each caller built its own URL inline, so there
 * was no single place to stop one.
 *
 * Every call now passes through here, which gives the demo backstop somewhere
 * to stand. Calls default to `mutates: true`: a function nobody has classified
 * is assumed to change something, so the failure mode of forgetting is a
 * blocked demo call rather than a real licence issued during a tutorial.
 */

import { log } from './logger';
import { DemoWriteBlockedError } from './demo/guard';
import { currentRequestIsDemo } from './request-context';

const ZOHO_FUNCTIONS_BASE = 'https://www.zohoapis.com.au/crm/';

/**
 * What the REST wrapper around a Deluge function looks like.
 *
 * `output` is whatever the function returned — usually a string, sometimes
 * JSON inside a string. `userMessage` collects anything it logged along the
 * way. Both are untyped because the functions are written in Deluge and this
 * repo cannot see their signatures.
 */
export interface ZohoFunctionResult {
  details?: {
    output?: unknown;
    userMessage?: unknown;
  };
  code?: string;
  message?: string;
}

export interface ZohoFunctionOptions {
  /** Whether this function changes anything. Defaults to true. */
  mutates?: boolean;
  /** API version the function is published under. Most are v7. */
  version?: 'v2' | 'v7';
}

/**
 * Execute a Deluge function and return its parsed response.
 *
 * The caller is responsible for reading the result: several of these report
 * failure inside a success-shaped body rather than through the HTTP status.
 */
export async function callZohoFunction(
  functionName: string,
  args: Record<string, unknown>,
  options: ZohoFunctionOptions = {}
): Promise<ZohoFunctionResult> {
  const { mutates = true, version = 'v7' } = options;

  if (mutates && currentRequestIsDemo()) {
    log('warn', 'api', `Blocked Deluge function ${functionName} from a demo session`);
    throw new DemoWriteBlockedError(functionName);
  }

  const zapikey = process.env.ZOHO_API_KEY;
  if (!zapikey) throw new Error('ZOHO_API_KEY not configured');

  const url =
    `${ZOHO_FUNCTIONS_BASE}${version}/functions/${functionName}/actions/execute` +
    `?auth_type=apikey&zapikey=${zapikey}` +
    `&arguments=${encodeURIComponent(JSON.stringify(args))}`;

  const res = await fetch(url, { method: 'POST' });
  return res.json();
}

/**
 * The string a Deluge function returned, pulled out of the REST wrapper.
 * Shape is { details: { output: "..." } }.
 */
export function functionOutput(result: unknown): string {
  const output = (result as { details?: { output?: unknown } })?.details?.output;
  if (typeof output === 'string') return output;
  return JSON.stringify(result ?? '');
}
