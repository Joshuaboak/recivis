import { NextRequest, NextResponse } from 'next/server';
import { exchangeCode } from '@/lib/zoho-mcp-auth';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      return NextResponse.redirect(
        new URL(`/?mcp_error=${encodeURIComponent(error)}`, request.url)
      );
    }

    if (!code || !state) {
      return NextResponse.redirect(
        new URL('/?mcp_error=missing_params', request.url)
      );
    }

    const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    await exchangeCode(code, state, appBaseUrl);

    // Redirect back to app with success indicator
    return NextResponse.redirect(new URL('/?mcp_connected=true', request.url));
  } catch (error) {
    console.error('MCP callback error:', error);
    return NextResponse.redirect(
      new URL(
        `/?mcp_error=${encodeURIComponent(error instanceof Error ? error.message : 'auth_failed')}`,
        request.url
      )
    );
  }
}
