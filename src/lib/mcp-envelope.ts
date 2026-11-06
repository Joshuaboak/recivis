/**
 * mcp-envelope.ts — strip the HTTP wrapper Zoho's MCP server puts around results.
 *
 * Zoho's MCP tools return the CRM response inside a wrapper:
 *
 *   {"status":"success","headers":{...},"data":{"data":[...],"info":{...}}}
 *
 * Every parser in the portal reads the CRM body directly (`parsed.data` as the
 * record array). Against the wrapper, `parsed.data` is an object, so:
 *
 * - `fetchRecord` found no record and every account-scoped access check
 *   denied, which blocked partners from adding contacts to their own customers.
 * - The AI chat's post-read RBAC filter skipped any result whose `data` was not
 *   an array, so it let reads through unfiltered.
 *
 * Unwrapping once, in the transport, gives every consumer the CRM body again.
 */

/** Replace each wrapped text item with the CRM body inside it. Anything else is left alone. */
export function unwrapZohoEnvelope(result: unknown): unknown {
  const res = result as { content?: Array<{ type?: string; text?: string }> } | null;
  if (!res?.content) return result;

  for (const item of res.content) {
    if (!item.text) continue;
    try {
      const parsed = JSON.parse(item.text);
      const isEnvelope =
        parsed &&
        typeof parsed === 'object' &&
        'status' in parsed &&
        parsed.data &&
        typeof parsed.data === 'object' &&
        !Array.isArray(parsed.data);
      if (isEnvelope) item.text = JSON.stringify(parsed.data);
    } catch { /* not JSON, leave as is */ }
  }
  return result;
}
