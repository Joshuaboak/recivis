import { NextRequest } from 'next/server';
import { executeZohoTool, resetSession } from '@/lib/zoho';
import { toolDefinitions, getSystemPrompt } from '@/lib/ai-tools';
import { log } from '@/lib/logger';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
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
        const { messages, user } = await request.json();

        const lastUserMsg = messages.filter((m: { role: string }) => m.role === 'user').pop();
        const userInput = typeof lastUserMsg?.content === 'string'
          ? lastUserMsg.content.slice(0, 100)
          : '[multimodal]';

        log('info', 'api', `Chat request from ${user?.name || 'unknown'}`, {
          userInput,
          messageCount: messages.length,
          role: user?.role,
        });

        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
          log('error', 'api', 'OpenRouter API key not configured');
          sendEvent('error', { error: 'OpenRouter API key not configured' });
          controller.close();
          return;
        }

        const userContext = user
          ? `\n\n## Current User\n- Email: ${user.email}\n- Name: ${user.name}\n- Role: ${user.role}\n- Reseller: ${user.resellerName || 'N/A'}\n- Region: ${user.region || 'N/A'}\n- Allowed Reseller IDs: ${user.allowedResellerIds?.join(', ') || 'ALL (admin)'}`
          : '';

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
