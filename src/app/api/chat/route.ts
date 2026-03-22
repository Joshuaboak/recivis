import { NextRequest, NextResponse } from 'next/server';
import { executeZohoTool, resetSession } from '@/lib/zoho';
import { toolDefinitions, getSystemPrompt } from '@/lib/ai-tools';
import { log } from '@/lib/logger';
import { requireAuth, isAdmin } from '@/lib/api-auth';
import type { AuthUser } from '@/lib/api-auth';

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
 * Server-side RBAC enforcement on AI tool calls.
 * Returns an error string if the call should be blocked, null if allowed.
 */
function enforceToolRBAC(user: AuthUser, toolName: string, args: Record<string, unknown>): string | null {
  const records = args.records as Array<Record<string, unknown>> | undefined;

  if (toolName === 'create_records' && args.module === 'Invoices' && records) {
    for (const rec of records) {
      const resellerId = (rec.Reseller as { id?: string })?.id || rec.Reseller;
      if (typeof resellerId === 'string' && !user.allowedResellerIds.includes(resellerId)) {
        return 'You cannot create invoices for accounts assigned to another reseller.';
      }
    }
  }

  if (toolName === 'update_records' && args.module === 'Invoices' && records) {
    for (const rec of records) {
      if (rec.Status === 'Approved' && !user.permissions.canApproveInvoices) {
        return 'You do not have permission to approve invoices.';
      }
      if (rec.Send_Invoice === true && !user.permissions.canSendInvoices) {
        return 'You do not have permission to send invoices.';
      }
    }
  }

  return null;
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
                const rbacError = enforceToolRBAC(authUser, toolCall.function.name, args);
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
