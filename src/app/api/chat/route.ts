import { NextRequest, NextResponse } from 'next/server';
import { executeZohoTool, resetSession } from '@/lib/zoho';
import { toolDefinitions, SYSTEM_PROMPT } from '@/lib/ai-tools';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

// Convert our tool format to OpenAI function calling format
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
  try {
    const { messages, user } = await request.json();

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OpenRouter API key not configured' }, { status: 500 });
    }

    // Build system message with user context
    const userContext = user
      ? `\n\n## Current User\n- Email: ${user.email}\n- Name: ${user.name}\n- Role: ${user.role}\n- Reseller: ${user.resellerName || 'N/A'}\n- Region: ${user.region || 'N/A'}\n- Allowed Reseller IDs: ${user.allowedResellerIds?.join(', ') || 'ALL (admin)'}`
      : '';

    const systemMessage = {
      role: 'system',
      content: SYSTEM_PROMPT + userContext,
    };

    const conversationMessages = [systemMessage, ...messages];
    const tools = convertTools();

    // Loop to handle tool calls (Claude may need multiple rounds)
    let maxIterations = 15;
    while (maxIterations > 0) {
      maxIterations--;

      const response = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://recivis.up.railway.app',
          'X-Title': 'ReCivis',
        },
        body: JSON.stringify({
          model: 'anthropic/claude-sonnet-4-6',
          messages: conversationMessages,
          tools,
          max_tokens: 4096,
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error('OpenRouter error:', errText);

        // If it's a 502/503, might be transient
        if (response.status >= 500) {
          return NextResponse.json(
            { error: 'AI service is temporarily unavailable. Please try again.' },
            { status: 502 }
          );
        }
        return NextResponse.json(
          { error: `AI service error: ${response.status}` },
          { status: 502 }
        );
      }

      const data = await response.json();
      const choice = data.choices?.[0];

      if (!choice) {
        return NextResponse.json({ error: 'No response from AI' }, { status: 502 });
      }

      const assistantMessage = choice.message;

      // If no tool calls, return the final text response
      if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
        return NextResponse.json({
          content: assistantMessage.content || '',
          role: 'assistant',
        });
      }

      // Execute tool calls via Zoho MCP
      conversationMessages.push(assistantMessage);

      for (const toolCall of assistantMessage.tool_calls as ToolCall[]) {
        let args: Record<string, unknown>;
        try {
          args = JSON.parse(toolCall.function.arguments);
        } catch {
          args = {};
        }

        let result: unknown;
        try {
          result = await executeZohoTool(toolCall.function.name, args);
        } catch (error) {
          console.error(`Tool ${toolCall.function.name} failed:`, error);

          // If MCP session expired, reset and retry once
          if (error instanceof Error && error.message.includes('session')) {
            resetSession();
            try {
              result = await executeZohoTool(toolCall.function.name, args);
            } catch (retryError) {
              result = { error: retryError instanceof Error ? retryError.message : 'Tool execution failed after retry' };
            }
          } else {
            result = { error: error instanceof Error ? error.message : 'Tool execution failed' };
          }
        }

        conversationMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: typeof result === 'string' ? result : JSON.stringify(result),
        });
      }

      // Continue loop — Claude processes tool results and may call more tools or respond
    }

    return NextResponse.json({
      content: 'I reached the maximum number of operations for this request. Please try again or simplify your query.',
      role: 'assistant',
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
