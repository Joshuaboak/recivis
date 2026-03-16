import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizationUrl, isAuthenticated } from '@/lib/zoho-mcp-auth';

export async function GET(request: NextRequest) {
  try {
    if (isAuthenticated()) {
      return NextResponse.json({ status: 'connected' });
    }

    const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const authUrl = await getAuthorizationUrl(appBaseUrl);

    return NextResponse.json({ status: 'needs_auth', authUrl });
  } catch (error) {
    console.error('MCP connect error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to initiate connection' },
      { status: 500 }
    );
  }
}
