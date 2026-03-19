/**
 * zoho.ts — Zoho CRM client via the Model Context Protocol (MCP).
 *
 * Communicates with CSA's Zoho CRM instance through a preauthorized MCP endpoint.
 * The MCP protocol uses JSON-RPC 2.0 over HTTP, with an optional SSE transport
 * for streaming responses. The endpoint URL contains an embedded API key, so no
 * OAuth dance is needed.
 *
 * Architecture:
 * - mcpRequest()        — Low-level JSON-RPC transport (handles SSE + JSON responses)
 * - ensureInitialized() — One-time MCP handshake (protocol version negotiation)
 * - callMcpTool()       — Calls any MCP tool by name, with auto-retry on stale sessions
 * - executeZohoTool()   — Maps simplified tool names to MCP tool names + args
 * - searchAllPages()    — Auto-paginating search across all Zoho pages
 * - getAllRecordPages()  — Auto-paginating browse (Get_Records) across all pages
 */

import { getMcpEndpoint } from './zoho-mcp-auth';
import { log } from './logger';
import { MAX_ZOHO_PAGES } from './constants';

// --- MCP Session State ---
// These are module-level singletons — one active MCP session per server process.

let sessionId: string | null = null;
let initialized = false;
let initPromise: Promise<void> | null = null;

/**
 * Send a JSON-RPC 2.0 request to the MCP endpoint.
 * Handles both standard JSON and SSE (Server-Sent Events) response formats.
 * Notifications (isNotification=true) are fire-and-forget with no response expected.
 */
async function mcpRequest(
  method: string,
  params?: Record<string, unknown>,
  isNotification = false
): Promise<unknown> {
  const endpoint = getMcpEndpoint();

  const body: Record<string, unknown> = {
    jsonrpc: '2.0',
    method,
  };

  if (params) body.params = params;
  if (!isNotification) body.id = Date.now();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  };

  if (sessionId) {
    headers['Mcp-Session-Id'] = sessionId;
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  // Capture session ID
  const newSessionId = res.headers.get('Mcp-Session-Id');
  if (newSessionId) {
    sessionId = newSessionId;
  }

  if (isNotification) return null;

  const contentType = res.headers.get('content-type') || '';

  // Handle SSE responses
  if (contentType.includes('text/event-stream')) {
    const text = await res.text();
    const lines = text.split('\n');
    let lastData = '';
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        lastData = line.slice(6);
      }
    }
    if (lastData) {
      const parsed = JSON.parse(lastData);
      if (parsed.error) throw new Error(JSON.stringify(parsed.error));
      return parsed.result;
    }
    return null;
  }

  if (!res.ok) {
    const errText = await res.text();
    log('error', 'mcp', `MCP ${method} error ${res.status}`, { error: errText.slice(0, 200) });
    throw new Error(`MCP error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  if (data.error) {
    log('error', 'mcp', `MCP ${method} returned error`, { error: JSON.stringify(data.error).slice(0, 200) });
    throw new Error(JSON.stringify(data.error));
  }
  return data.result;
}

/**
 * Ensure the MCP session is initialized (protocol handshake + notification).
 * Uses a shared promise to prevent concurrent initialization attempts.
 */
async function ensureInitialized(): Promise<void> {
  if (initialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      await mcpRequest('initialize', {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'recivis', version: '1.0.0' },
      });

      await mcpRequest('notifications/initialized', undefined, true);
      initialized = true;
    } catch (err) {
      initPromise = null;
      throw err;
    }
  })();

  return initPromise;
}

/**
 * Call a Zoho MCP tool by name with arguments.
 * Auto-retries once on failure by resetting the MCP session.
 */
export async function callMcpTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  try {
    await ensureInitialized();
    return await mcpRequest('tools/call', {
      name: toolName,
      arguments: args,
    });
  } catch (err) {
    // Session may be stale — reset and retry once
    log('warn', 'mcp', `Tool call ${toolName} failed, resetting session and retrying`, {
      error: err instanceof Error ? err.message : String(err),
    });
    resetSession();
    await ensureInitialized();
    return await mcpRequest('tools/call', {
      name: toolName,
      arguments: args,
    });
  }
}

/**
 * Reset the MCP session (e.g. on auth refresh).
 */
export function resetSession(): void {
  sessionId = null;
  initialized = false;
  initPromise = null;
}

// --- Result Parsing Helpers ---

/**
 * Parse an MCP tool result into an array of records.
 */
export function parseMcpResult(result: unknown): { data: Record<string, unknown>[]; moreRecords: boolean; page: number } {
  const res = result as { content?: Array<{ text?: string }> };
  if (res?.content) {
    for (const item of res.content) {
      if (item.text) {
        try {
          const parsed = JSON.parse(item.text);
          return {
            data: parsed.data || [],
            moreRecords: parsed.info?.more_records ?? false,
            page: parsed.info?.page ?? 1,
          };
        } catch { /* skip */ }
      }
    }
  }
  return { data: [], moreRecords: false, page: 1 };
}

/**
 * Search records across all pages (auto-paginates).
 * Defaults to MAX_ZOHO_PAGES (2000 records at 200/page) to avoid runaway loops.
 */
export async function searchAllPages(
  module: string,
  criteria: string,
  fields: string,
  sortOrder: string = 'desc',
  maxPages: number = MAX_ZOHO_PAGES
): Promise<Record<string, unknown>[]> {
  const allRecords: Record<string, unknown>[] = [];

  for (let page = 1; page <= maxPages; page++) {
    try {
      const result = await executeZohoTool('search_records', {
        module,
        criteria,
        fields,
        page,
        sort_order: sortOrder,
      });

      const parsed = parseMcpResult(result);
      allRecords.push(...parsed.data);

      if (!parsed.moreRecords) break;
    } catch {
      // Zoho returns an error when no records match — stop paging
      break;
    }
  }

  return allRecords;
}

/**
 * Get records across all pages using Get_Records (browse mode).
 * Defaults to MAX_ZOHO_PAGES (2000 records at 200/page).
 */
export async function getAllRecordPages(
  module: string,
  fields: string,
  sortBy: string = 'Modified_Time',
  sortOrder: string = 'desc',
  maxPages: number = MAX_ZOHO_PAGES
): Promise<Record<string, unknown>[]> {
  const allRecords: Record<string, unknown>[] = [];

  for (let page = 1; page <= maxPages; page++) {
    try {
      const result = await callMcpTool('ZohoCRM_getRecords', {
        path_variables: { module },
        query_params: { fields, per_page: 200, page, sort_by: sortBy, sort_order: sortOrder },
      });

      const parsed = parseMcpResult(result);
      allRecords.push(...parsed.data);

      if (!parsed.moreRecords) break;
    } catch {
      break;
    }
  }

  return allRecords;
}

// --- Tool Execution Mapping ---

/**
 * Map a simplified tool name + args to the corresponding MCP tool call.
 * This abstraction layer lets the rest of the codebase use clean names like
 * 'search_records' instead of 'ZohoCRM_searchRecords' with nested path_variables.
 */
export async function executeZohoTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case 'search_records': {
      const mcpArgs: Record<string, unknown> = {
        path_variables: { module: args.module },
        query_params: {} as Record<string, unknown>,
      };
      const qp = mcpArgs.query_params as Record<string, unknown>;
      if (args.criteria) qp.criteria = args.criteria;
      if (args.email) qp.email = args.email;
      if (args.phone) qp.phone = args.phone;
      if (args.word) qp.word = args.word;
      if (args.fields) qp.fields = args.fields;
      if (args.page) qp.page = args.page;
      if (args.sort_by) qp.sort_by = args.sort_by;
      if (args.sort_order) qp.sort_order = args.sort_order;
      return callMcpTool('ZohoCRM_searchRecords', mcpArgs);
    }

    case 'get_record': {
      return callMcpTool('ZohoCRM_getRecord', {
        path_variables: {
          module: args.module,
          recordID: args.record_id,
        },
      });
    }

    case 'get_related_records': {
      const mcpArgs: Record<string, unknown> = {
        path_variables: {
          parentRecordModule: args.parent_module,
          parentRecord: args.parent_id,
          relatedList: args.related_list,
        },
      };
      if (args.fields) {
        mcpArgs.query_params = { fields: args.fields };
      }
      return callMcpTool('ZohoCRM_getRelatedRecords', mcpArgs);
    }

    case 'create_records': {
      return callMcpTool('ZohoCRM_createRecords', {
        path_variables: { module: args.module },
        body: {
          data: args.records,
          trigger: args.trigger || ['workflow'],
        },
      });
    }

    case 'update_records': {
      return callMcpTool('ZohoCRM_updateRecords', {
        path_variables: { module: args.module },
        body: {
          data: args.records,
          trigger: args.trigger || [],
        },
      });
    }

    case 'get_variables': {
      return callMcpTool('ZohoCRM_getVariables', {});
    }

    case 'call_renewal_function': {
      // Calls a Deluge custom function via the Zoho REST API (not MCP).
      // Passes asset IDs as a triple-pipe-delimited string — Deluge convention.
      const assetIds = args.asset_ids as string[];
      const assetIDString = assetIds.join('|||');
      const zapikey = process.env.ZOHO_API_KEY;
      if (!zapikey) throw new Error('ZOHO_API_KEY not set');
      const url = `https://www.zohoapis.com.au/crm/v2/functions/generaterenewalinvoicesforassets/actions/execute?auth_type=apikey&zapikey=${zapikey}&arguments=${encodeURIComponent(
        JSON.stringify({ buttonPusher: 'claude', assetIDString })
      )}`;
      const res = await fetch(url, { method: 'POST' });
      return res.json();
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}
