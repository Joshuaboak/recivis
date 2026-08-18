import { NextRequest, NextResponse } from 'next/server';
import { executeZohoTool, resetSession } from '@/lib/zoho';
import { toolDefinitions, getSystemPrompt } from '@/lib/ai-tools';
import { log } from '@/lib/logger';
import { requireAuth, isAdmin } from '@/lib/api-auth';
import type { AuthUser } from '@/lib/api-auth';
import { MODULE_SCOPES, WRITABLE_MODULES, recordInScope, scopingAccountId } from '@/lib/tenant-scope';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * The tenant boundary itself lives in lib/tenant-scope.ts so it can be tested
 * and so the support assistant enforces the identical rules. What stays here
 * is only how those rules apply to this route's tools.
 */

const READ_TOOLS = new Set(['search_records', 'get_record']);
const WRITE_TOOLS = new Set(['create_records', 'update_records']);

/** Read one record from Zoho, or null if it isn't there. */
async function fetchRecord(moduleName: string, recordId: string): Promise<Record<string, unknown> | null> {
  try {
    const result = await executeZohoTool('get_record', { module: moduleName, record_id: recordId });
    const res = result as { content?: Array<{ text?: string }> };
    for (const item of res?.content || []) {
      if (!item.text) continue;
      const parsed = JSON.parse(item.text);
      const record = parsed.data?.[0];
      if (record) return record as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Whether the caller may see one record, fetching it to find out.
 *
 * Contacts and anything else scoped through an account cost a second lookup,
 * since the contact itself names no partner.
 */
async function recordIsVisible(user: AuthUser, moduleName: string, recordId: string): Promise<boolean> {
  const scope = MODULE_SCOPES[moduleName];
  if (!scope) return false;
  if (scope.kind === 'catalogue') return true;

  const record = await fetchRecord(moduleName, recordId);
  if (!record) return false;

  if (scope.kind === 'via-account') {
    const accountId = scopingAccountId(scope, record);
    // A contact attached to nothing has no partner to inherit, so it stays
    // unproven rather than becoming everyone's.
    if (!accountId) return false;
    return accountIsVisible(user, accountId);
  }

  return recordInScope(user, scope, record);
}

/** Whether the caller may see one account. */
async function accountIsVisible(user: AuthUser, accountId: string): Promise<boolean> {
  const account = await fetchRecord('Accounts', accountId);
  if (!account) return false;
  return recordInScope(user, MODULE_SCOPES.Accounts, account);
}

/**
 * Resolve which of a set of accounts the caller may see.
 *
 * Contact searches return many contacts across few accounts, so the distinct
 * accounts are resolved once each rather than once per contact.
 */
async function visibleAccountIds(user: AuthUser, accountIds: Iterable<string>): Promise<Set<string>> {
  const allowed = new Set<string>();
  await Promise.all(
    Array.from(new Set(accountIds)).map(async id => {
      if (await accountIsVisible(user, id)) allowed.add(id);
    })
  );
  return allowed;
}

/**
 * Server-side RBAC on AI tool calls, before execution.
 *
 * Returns an error string to block the call, or null to allow it. Also edits
 * `args` in place so scoped searches always fetch the Reseller field the
 * post-filter needs.
 */
async function enforceToolRBAC(
  user: AuthUser,
  toolName: string,
  args: Record<string, unknown>
): Promise<string | null> {
  const moduleName = String(args.module || '');
  const records = args.records as Array<Record<string, unknown>> | undefined;

  // Scoped to no resellers means there is nothing this user may read.
  if (user.allowedResellerIds.length === 0) {
    return 'Your account is not linked to a partner, so CRM records are not available.';
  }

  if ((READ_TOOLS.has(toolName) || WRITE_TOOLS.has(toolName)) && !MODULE_SCOPES[moduleName]) {
    return `The ${moduleName || 'requested'} module is not available through the assistant.`;
  }

  // The post-filter reads record.Reseller, so it has to come back in the results.
  if (READ_TOOLS.has(toolName) && MODULE_SCOPES[moduleName]?.kind === 'reseller-lookup') {
    const fields = String(args.fields || '');
    if (fields && !fields.includes('Reseller')) {
      args.fields = fields + ',Reseller';
    }
  }

  // Related records are scoped by proving the caller may see the parent.
  if (toolName === 'get_related_records') {
    const parentModule = String(args.parent_module || '');
    const parentId = String(args.parent_id || '');
    if (!parentModule || !parentId) {
      return 'A parent module and record id are required to fetch related records.';
    }
    if (!(await recordIsVisible(user, parentModule, parentId))) {
      return 'That record belongs to another reseller.';
    }
    return null;
  }

  if (WRITE_TOOLS.has(toolName)) {
    if (!WRITABLE_MODULES.has(moduleName)) {
      // Partner records are administered by CSA and assets are issued by the
      // licensing system, so neither is authored from here.
      return `The assistant can create and update accounts, contacts, leads and orders, but not ${moduleName} records.`;
    }

    for (const rec of records || []) {
      // Changing an existing record means proving it is the caller's first —
      // otherwise any id would do.
      if (toolName === 'update_records') {
        const recordId = typeof rec.id === 'string' ? rec.id : '';
        if (!recordId) return 'An id is required to update a record.';
        if (!(await recordIsVisible(user, moduleName, recordId))) {
          return 'That record belongs to another reseller.';
        }
      }

      // A record cannot be filed under a partner the caller may not see.
      const resellerId = (rec.Reseller as { id?: string })?.id || rec.Reseller;
      if (typeof resellerId === 'string' && !user.allowedResellerIds.includes(resellerId)) {
        return 'You cannot assign records to another reseller.';
      }

      // Contacts inherit their partner from their account, so the account has
      // to be one the caller may see.
      if (moduleName === 'Contacts') {
        const accountId = (rec.Account_Name as { id?: string })?.id;
        if (accountId && !(await accountIsVisible(user, accountId))) {
          return 'That account belongs to another reseller.';
        }
      }

      if (moduleName === 'Invoices') {
        if (rec.Status === 'Approved' && !user.permissions.canApproveInvoices) {
          return 'You do not have permission to approve invoices.';
        }
        if (rec.Send_Invoice === true && !user.permissions.canSendInvoices) {
          return 'You do not have permission to send invoices.';
        }
        // Contract_Term_Years of 0 is this codebase's marker for a hand-set
        // price (see CreateInvoiceView and the subscription routes), so it is
        // the exact signal that a line is being priced away from the catalogue.
        if (!user.permissions.canModifyPrices) {
          const lineItems = rec.Invoiced_Items as Array<Record<string, unknown>> | undefined;
          if (lineItems?.some(li => Number(li.Contract_Term_Years) === 0)) {
            return 'You do not have permission to set custom prices on line items.';
          }
        }
      }
    }
  }

  // Renewal generation creates real invoices from asset ids, so every asset
  // must be shown to belong to the caller before the function runs.
  if (toolName === 'call_renewal_function') {
    const assetIds = (args.asset_ids as string[] | undefined) || [];
    if (assetIds.length === 0) return 'No assets were given to renew.';
    if (assetIds.length > 20) return 'Too many assets in one renewal. Please do 20 or fewer at a time.';
    for (const assetId of assetIds) {
      if (!(await recordIsVisible(user, 'Assets1', assetId))) {
        return 'One or more of those assets belongs to another reseller.';
      }
    }
  }

  return null;
}

/**
 * Post-execution RBAC filter: removes Account records the user doesn't have access to.
 * This is the critical enforcement for the AI chat — it prevents the AI from ever
 * seeing accounts belonging to other resellers, blocking the entire invoice flow.
 */
async function filterResultsForRBAC(
  user: AuthUser,
  toolName: string,
  args: Record<string, unknown>,
  result: unknown
): Promise<unknown> {
  const moduleName = String(args.module || '');
  const scope = MODULE_SCOPES[moduleName];

  if (!READ_TOOLS.has(toolName)) return result;
  // An unknown module never reaches here — enforceToolRBAC blocks it — and a
  // catalogue module holds no partner data to separate.
  if (!scope || scope.kind === 'catalogue') return result;

  try {
    const res = result as { content?: Array<{ text?: string }> };
    if (!res?.content) return result;

    for (const item of res.content) {
      if (!item.text) continue;
      try {
        const parsed = JSON.parse(item.text);
        if (!parsed.data || !Array.isArray(parsed.data)) continue;

        // Records scoped through an account need those accounts resolved
        // before anything can be judged. Done once for the whole page.
        let allowedAccounts: Set<string> | undefined;
        if (scope.kind === 'via-account') {
          const accountIds = (parsed.data as Record<string, unknown>[])
            .map(record => scopingAccountId(scope, record))
            .filter((id): id is string => !!id);
          allowedAccounts = await visibleAccountIds(user, accountIds);
        }

        const originalCount = parsed.data.length;
        parsed.data = parsed.data.filter((record: Record<string, unknown>) =>
          recordInScope(user, scope, record, allowedAccounts)
        );

        if (parsed.data.length === 0 && originalCount > 0) {
          // All results were filtered — tell the AI why
          parsed.message = `The ${moduleName} records matching this search belong to other resellers. This user does not have access to them.`;
        }

        item.text = JSON.stringify(parsed);
      } catch { /* skip unparseable content items */ }
    }

    return result;
  } catch {
    return result;
  }
}

const TOOL_STATUS: Record<string, string> = {
  search_records: 'Searching CRM records...',
  get_record: 'Fetching record details...',
  get_related_records: 'Loading related records...',
  create_records: 'Creating records in CRM...',
  update_records: 'Updating CRM records...',
  get_variables: 'Checking system settings...',
  call_renewal_function: 'Generating renewal invoice...',
};

function convertTools() {
  return toolDefinitions.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    },
  }));
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const authUser = authResult;

  const encoder = new TextEncoder();
  const requestStart = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      function sendEvent(type: string, data: unknown) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type, ...data as Record<string, unknown> })}\n\n`)
        );
      }

      try {
        const { messages } = await request.json();

        const lastUserMsg = messages.filter((m: { role: string }) => m.role === 'user').pop();
        const userInput = typeof lastUserMsg?.content === 'string'
          ? lastUserMsg.content.slice(0, 100)
          : '[multimodal]';

        log('info', 'api', `Chat request from ${authUser.name}`, {
          userInput,
          messageCount: messages.length,
          role: authUser.role,
        });

        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
          log('error', 'api', 'OpenRouter API key not configured');
          sendEvent('error', { error: 'OpenRouter API key not configured' });
          controller.close();
          return;
        }

        // Build user context from SERVER-SIDE auth (never trust client-provided user data)
        const userContext = `\n\n## Current User\n- Email: ${authUser.email}\n- Name: ${authUser.name}\n- Role: ${authUser.role}\n- Reseller ID: ${authUser.resellerId || 'N/A'}\n- Allowed Reseller IDs: ${authUser.allowedResellerIds.length > 0 ? authUser.allowedResellerIds.join(', ') : 'ALL (admin)'}\n- Can Create Invoices: ${authUser.permissions.canCreateInvoices}\n- Can Approve Invoices: ${authUser.permissions.canApproveInvoices}\n- Can Send Invoices: ${authUser.permissions.canSendInvoices}\n- Can Modify Prices: ${authUser.permissions.canModifyPrices}`;

        const systemMessage = {
          role: 'system',
          content: getSystemPrompt() + userContext,
        };

        const conversationMessages = [systemMessage, ...messages];
        const tools = convertTools();
        let iteration = 0;
        let maxIterations = 15;

        while (maxIterations > 0) {
          maxIterations--;
          iteration++;

          sendEvent('status', { message: 'Thinking...' });

          const aiStart = Date.now();
          const response = await fetch(OPENROUTER_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
              'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://recivis.up.railway.app',
              'X-Title': 'ReCivis',
            },
            body: JSON.stringify({
              model: 'anthropic/claude-opus-4.6:exacto',
              messages: conversationMessages,
              tools,
              max_tokens: 4096,
              temperature: 0.2,
            }),
          });
          const aiDuration = Date.now() - aiStart;

          if (!response.ok) {
            const errText = await response.text();
            log('error', 'ai', `OpenRouter error ${response.status}`, { error: errText.slice(0, 300) }, aiDuration);
            sendEvent('error', { error: `AI service error: ${response.status}` });
            controller.close();
            return;
          }

          const data = await response.json();
          const choice = data.choices?.[0];
          const usage = data.usage;

          log('info', 'ai', `AI response (iteration ${iteration})`, {
            hasToolCalls: !!choice?.message?.tool_calls?.length,
            toolCallCount: choice?.message?.tool_calls?.length || 0,
            contentLength: choice?.message?.content?.length || 0,
            promptTokens: usage?.prompt_tokens,
            completionTokens: usage?.completion_tokens,
            finishReason: choice?.finish_reason,
          }, aiDuration);

          if (!choice) {
            log('error', 'ai', 'No choice in AI response');
            sendEvent('error', { error: 'No response from AI' });
            controller.close();
            return;
          }

          const assistantMessage = choice.message;

          // No tool calls — final response
          if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
            log('info', 'api', `Chat complete`, {
              iterations: iteration,
              responseLength: assistantMessage.content?.length || 0,
            }, Date.now() - requestStart);

            sendEvent('done', { content: assistantMessage.content || '' });
            controller.close();
            return;
          }

          // Execute tool calls in parallel
          conversationMessages.push(assistantMessage);
          const toolCalls = assistantMessage.tool_calls as ToolCall[];

          const firstToolName = toolCalls[0]?.function?.name;
          const statusMsg = TOOL_STATUS[firstToolName] || 'Working...';
          sendEvent('status', {
            message: toolCalls.length > 1
              ? `${statusMsg} (${toolCalls.length} operations)`
              : statusMsg,
          });

          const results = await Promise.all(
            toolCalls.map(async (toolCall) => {
              let args: Record<string, unknown>;
              try {
                args = JSON.parse(toolCall.function.arguments);
              } catch {
                args = {};
              }

              const toolStart = Date.now();
              let result: unknown;

              log('info', 'tool', `Calling ${toolCall.function.name}`, {
                args: JSON.stringify(args).slice(0, 1000),
              });

              // RBAC enforcement on tool calls for non-admin users
              if (!isAdmin(authUser)) {
                const rbacError = await enforceToolRBAC(authUser, toolCall.function.name, args);
                if (rbacError) {
                  log('warn', 'tool', `RBAC blocked: ${toolCall.function.name}`, { reason: rbacError });
                  return {
                    role: 'tool' as const,
                    tool_call_id: toolCall.id,
                    content: JSON.stringify({ error: rbacError }),
                  };
                }
              }

              try {
                result = await executeZohoTool(toolCall.function.name, args);

                const resultStr = JSON.stringify(result);
                log('info', 'tool', `${toolCall.function.name} success`, {
                  resultLength: resultStr.length,
                  resultPreview: resultStr.slice(0, 500),
                }, Date.now() - toolStart);
              } catch (error) {
                log('error', 'tool', `${toolCall.function.name} failed`, {
                  error: error instanceof Error ? error.message : String(error),
                  args: JSON.stringify(args).slice(0, 200),
                }, Date.now() - toolStart);

                if (error instanceof Error && error.message === 'NOT_AUTHENTICATED') {
                  result = { error: 'Zoho CRM is not connected.' };
                } else if (error instanceof Error && error.message.includes('session')) {
                  resetSession();
                  try {
                    result = await executeZohoTool(toolCall.function.name, args);
                  } catch (retryError) {
                    result = { error: retryError instanceof Error ? retryError.message : 'Tool failed after retry' };
                  }
                } else {
                  result = { error: error instanceof Error ? error.message : 'Tool execution failed' };
                }
              }

              // Post-execution: drop records belonging to other partners.
              // No allowedResellerIds guard here — a non-admin scoped to
              // nothing is refused upstream, and skipping the filter for one
              // would have returned every record unscoped.
              if (!isAdmin(authUser)) {
                result = await filterResultsForRBAC(authUser, toolCall.function.name, args, result);
              }

              return {
                role: 'tool' as const,
                tool_call_id: toolCall.id,
                content: typeof result === 'string' ? result : JSON.stringify(result),
              };
            })
          );

          for (const r of results) {
            conversationMessages.push(r);
          }
        }

        log('warn', 'api', 'Hit max iterations', { iterations: iteration }, Date.now() - requestStart);
        sendEvent('done', {
          content: 'Reached the maximum number of operations. Please try again.',
        });
        controller.close();
      } catch (error) {
        log('error', 'api', 'Chat API error', {
          error: error instanceof Error ? error.message : String(error),
        }, Date.now() - requestStart);
        sendEvent('error', {
          error: error instanceof Error ? error.message : 'Internal server error',
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
