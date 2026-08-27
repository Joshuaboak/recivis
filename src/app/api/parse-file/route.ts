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

DATES — read this part carefully, it is the field most often missed:

Find every date on the document and report each one with the exact words next to
it. Look for start dates, end dates, renewal dates and expiry dates, and look for
them in all of these places:
- beside or beneath a line item, often as a short note such as "end date:
  26.08.2027" on its own line under the product
- in the header, as an order date or a document date
- in the totals block, or in free text and notes

Dates are written in many formats and some of them are ambiguous. Report each one
BOTH ways:
- **raw**: exactly the characters on the page, e.g. "26.08.2027"
- **iso**: the same date as YYYY-MM-DD, e.g. "2027-08-26"

Dot-separated and slash-separated dates on these documents are day-first
(26.08.2027 is 26 August 2027, not 8 February). Say so if a date is genuinely
ambiguous rather than guessing silently.

For each date also say what it applies to: the whole order, or a specific line
item — and which line.

**If the document has no start or end date at all, say so explicitly:
"NO START DATE FOUND" / "NO END DATE FOUND".** Do not omit the section and do not
invent a date. A missing date has to be visible, because the alternative is
somebody being given today's date and not noticing.

Also note:
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
