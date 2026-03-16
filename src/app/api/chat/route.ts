import { NextRequest, NextResponse } from 'next/server';
import { zohoTools } from '@/lib/zoho';
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

async function executeToolCall(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'search_contacts':
      return zohoTools.searchRecords(
        'Contacts',
        args.criteria as string,
        (args.fields as string || 'Full_Name,First_Name,Last_Name,Email,Account_Name,Title,Phone,Record_Status__s').split(',')
      );

    case 'search_accounts':
      if (args.word) {
        return zohoTools.searchByWord(
          'Accounts',
          args.word as string,
          (args.fields as string || 'Account_Name,Billing_Country,Reseller,Email_Domain,Record_Status__s').split(',')
        );
      }
      return zohoTools.searchRecords(
        'Accounts',
        args.criteria as string,
        (args.fields as string || 'Account_Name,Billing_Country,Reseller,Email_Domain,Record_Status__s').split(',')
      );

    case 'search_resellers':
      return zohoTools.searchRecords(
        'Resellers',
        args.criteria as string,
        (args.fields as string || 'Name,Email,Region,Currency,Partner_Category,Direct_Customer_Contact,Distributor,Record_Status__s').split(',')
      );

    case 'get_record':
      return zohoTools.getRecord(
        args.module as string,
        args.id as string,
        args.fields ? (args.fields as string).split(',') : undefined
      );

    case 'get_related_records':
      return zohoTools.getRelatedRecords(
        args.parent_module as string,
        args.parent_id as string,
        args.related_list as string,
        args.fields ? (args.fields as string).split(',') : undefined
      );

    case 'search_products':
      return zohoTools.searchRecords(
        'Products',
        `Product_Code:equals:${args.product_code}`,
        (args.fields as string || 'Product_Name,Product_Code,Unit_Price,Record_Status__s').split(',')
      );

    case 'create_records':
      return zohoTools.createRecords(
        args.module as string,
        args.records as unknown[]
      );

    case 'update_records':
      return zohoTools.updateRecords(
        args.module as string,
        args.records as unknown[],
        args.trigger as string[] | undefined
      );

    case 'get_org_variable': {
      const result = await zohoTools.getOrgVariable(args.variable_name as string);
      return result;
    }

    case 'call_renewal_function': {
      const assetIds = args.asset_ids as string[];
      const assetIDString = assetIds.join('|||');
      const url = `https://www.zohoapis.com.au/crm/v2/functions/generaterenewalinvoicesforassets/actions/execute?auth_type=apikey&zapikey=${process.env.ZOHO_API_KEY}&arguments=${encodeURIComponent(JSON.stringify({ buttonPusher: 'claude', assetIDString }))}`;
      const res = await fetch(url, { method: 'POST' });
      return res.json();
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
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
      ? `\n\n## Current User\n- Email: ${user.email}\n- Name: ${user.name}\n- Role: ${user.role}\n- Reseller: ${user.resellerName || 'N/A'}\n- Allowed Reseller IDs: ${user.allowedResellerIds?.join(', ') || 'ALL (admin)'}`
      : '';

    const systemMessage = {
      role: 'system',
      content: SYSTEM_PROMPT + userContext,
    };

    let conversationMessages = [systemMessage, ...messages];
    const tools = convertTools();

    // Loop to handle tool calls
    let maxIterations = 10;
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

      // Execute tool calls
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
          result = await executeToolCall(toolCall.function.name, args);
        } catch (error) {
          result = { error: error instanceof Error ? error.message : 'Tool execution failed' };
        }

        conversationMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }

      // Continue the loop — Claude will process tool results and may call more tools or respond
    }

    return NextResponse.json({
      content: 'I hit the maximum number of operations for this request. Please try again with a simpler query.',
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
