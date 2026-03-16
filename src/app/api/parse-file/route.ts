import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { base64, mediaType, fileName } = await request.json();

    if (!base64) {
      return NextResponse.json({ error: 'No file data provided' }, { status: 400 });
    }

    const isPdf = mediaType === 'application/pdf';

    if (isPdf) {
      // Extract text from PDF server-side
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require('pdf-parse');
      const buffer = Buffer.from(base64, 'base64');
      const data = await pdfParse(buffer);

      return NextResponse.json({
        type: 'text',
        content: data.text,
        fileName,
        pageCount: data.numpages,
      });
    } else {
      // For images, return the base64 as-is for multimodal
      return NextResponse.json({
        type: 'image',
        base64,
        mediaType,
        fileName,
      });
    }
  } catch (error) {
    console.error('File parse error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to parse file' },
      { status: 500 }
    );
  }
}
