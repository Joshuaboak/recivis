/**
 * Zoho CRM MCP Client
 * Uses MCP Streamable HTTP transport with OAuth 2.0 bearer tokens.
 */

import { getAccessToken, getMcpEndpoint } from './zoho-mcp-auth';

let sessionId: string | null = null;
let initialized = false;
let initPromise: Promise<void> | null = null;

async function mcpRequest(
  method: string,
  params?: Record<string, unknown>,
  isNotification = false
): Promise<unknown> {
  const token = await getAccessToken();
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
    Authorization: `Bearer ${token}`,
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
    throw new Error(`MCP error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  if (data.error) throw new Error(JSON.stringify(data.error));
  return data.result;
}

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
 */
export async function callMcpTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  await ensureInitialized();

  const result = await mcpRequest('tools/call', {
    name: toolName,
    arguments: args,
  });

  return result;
}

/**
 * Reset the MCP session (e.g. on auth refresh).
 */
export function resetSession(): void {
  sessionId = null;
  initialized = false;
  initPromise = null;
}

// ---- Tool execution mapping ----
// Maps simplified tool calls from Claude to MCP tool calls

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
      return callMcpTool('ZohoCRM_Search_Records', mcpArgs);
    }

    case 'get_record': {
      return callMcpTool('ZohoCRM_Get_Record', {
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
      return callMcpTool('ZohoCRM_Create_Records', {
        path_variables: { module: args.module },
        body: {
          data: args.records,
          trigger: args.trigger || ['workflow'],
        },
      });
    }

    case 'update_records': {
      return callMcpTool('ZohoCRM_Update_Records', {
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
      const assetIds = args.asset_ids as string[];
      const assetIDString = assetIds.join('|||');
      const zapikey =
        process.env.ZOHO_API_KEY ||
        '1003.c34f94ef513dd69ce6eada9d6d97dc31.35c2e6e02fc62c21dfcfb5c3391e8e6d';
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
