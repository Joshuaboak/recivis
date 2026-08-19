/**
 * demo/guard.ts — the rule that keeps practice runs out of the real CRM.
 *
 * There is no Zoho sandbox: local development and production both read and
 * write the live CRM. Writing a fake order there is not reversible tidying —
 * a licence key is minted on an external licensing server, `send_invoice11`
 * puts mail in a customer's inbox, a Stripe link becomes payable by anyone
 * holding the URL, and an invoice consumes a number out of CSA's books.
 * Deleting the record afterwards undoes none of it.
 *
 * So a demo session writes nothing. Reads of a partner's own data are fine and
 * more useful than a fixture; writes are served from `demo/fixtures.ts`
 * instead.
 *
 * Two layers enforce this:
 *
 *   1. Routes check `isDemoSession` and answer from fixtures. This is what
 *      makes the tutorial work.
 *   2. `assertNotDemo` throws deep in the Zoho transport, where every write
 *      eventually has to pass. This is what makes it safe — the next route
 *      somebody adds is covered without anyone remembering to think about it.
 *
 * Layer 2 is the one that matters. Layer 1 is a courtesy.
 */

import type { AuthUser } from '../api-auth';

/** Thrown when a demo session reaches a write it must never perform. */
export class DemoWriteBlockedError extends Error {
  constructor(operation: string) {
    super(
      `Blocked a write to the live CRM from a demo session (${operation}). ` +
      `Demo sessions are served from fixtures and must never reach Zoho.`
    );
    this.name = 'DemoWriteBlockedError';
  }
}

/**
 * Whether this session is a demo one.
 *
 * Read only from the server-derived user. A demo flag that could arrive on a
 * request would be an authentication bypass in the other direction: anyone
 * could claim demo status to dodge permission checks, or clear it to make a
 * demo account write for real.
 */
export function isDemoSession(user: Pick<AuthUser, 'isDemo'>): boolean {
  return user.isDemo === true;
}

/**
 * MCP tool names that change data. Matched by prefix because the Zoho MCP
 * surface is large and grows: a new `ZohoCRM_createWidget` is caught without
 * anyone updating a list, and the failure mode of a wrong guess here is a
 * blocked demo write rather than a leaked real one.
 */
const MUTATING_TOOL_PREFIXES = [
  'ZohoCRM_create',
  'ZohoCRM_update',
  'ZohoCRM_delete',
  'ZohoCRM_post',
  'ZohoCRM_put',
  'ZohoCRM_mass',
  'ZohoCRM_remove',
  'ZohoCRM_transferAndDelete',
  'ZohoCRM_bulkDelete',
];

/** Whether an MCP tool name writes. */
export function isMutatingTool(toolName: string): boolean {
  return MUTATING_TOOL_PREFIXES.some(prefix => toolName.startsWith(prefix));
}

/**
 * Refuse an operation that would write to the live CRM in a demo session.
 *
 * Throws rather than returning a value: a caller that ignores a boolean still
 * writes, and this is the layer that has to hold when someone forgets.
 */
export function assertNotDemo(user: Pick<AuthUser, 'isDemo'> | null | undefined, operation: string): void {
  if (user && isDemoSession(user)) {
    throw new DemoWriteBlockedError(operation);
  }
}
