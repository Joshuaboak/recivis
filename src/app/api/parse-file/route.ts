import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const VISION_MODEL = 'google/gemini-3.1-flash-image-preview';

const EXTRACTION_PROMPT = `You are a purchase order data extraction assistant. Extract ALL information from this document and return it in a clear, structured format.

Extract these fields:
- Company/Account name
- Contact name
- Contact email
- Contact phone
- Billing address
- PO Number
- Currency

For EACH line item:
- Product description (full text)
- Quantity
- Unit price
- Total price
- Any licence type info (perpetual, subscription, maintenance, single user, multi user, cloud, etc.)

Also note:
- Any dates mentioned (start, end, expiry)
- Any special notes or instructions
- Whether this looks like a NEW purchase or a RENEWAL/maintenance

Return the extracted data as structured text. Be thorough — include every detail you can read from the document.`;

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  try {
    const { base64, mediaType, fileName } = await request.json();

    if (!base64) {
      return NextResponse.json({ error: 'No file data provided' }, { status: 400 });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    // Send to Gemini Flash for visual extraction — works for both images and PDFs
    const dataUri = `data:${mediaType};base64,${base64}`;

    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'https://recivis.up.railway.app',
        'X-Title': 'ReCivis',
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: dataUri },
              },
              {
                type: 'text',
                text: EXTRACTION_PROMPT,
              },
            ],
          },
        ],
        max_tokens: 4096,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Gemini extraction error:', errText);
      return NextResponse.json(
        { error: `Vision model error: ${response.status}` },
        { status: 502 }
      );
    }

    const data = await response.json();
    const extractedText = data.choices?.[0]?.message?.content || '';

    if (!extractedText) {
      return NextResponse.json(
        { error: 'No text could be extracted from the document' },
        { status: 422 }
      );
    }

    return NextResponse.json({
      type: 'text',
      content: extractedText,
      fileName,
    });
  } catch (error) {
    console.error('File parse error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to parse file' },
      { status: 500 }
    );
  }
}
