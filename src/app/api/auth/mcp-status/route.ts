import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/zoho-mcp-auth';

export async function GET() {
  return NextResponse.json({ connected: isAuthenticated() });
}
