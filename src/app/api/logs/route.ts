import { NextRequest, NextResponse } from 'next/server';
import { getLogs, clearLogs } from '@/lib/logger';
import { requireAuth } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  const { searchParams } = new URL(request.url);
  const count = parseInt(searchParams.get('count') || '50');
  const category = searchParams.get('category') || undefined;

  const logs = getLogs(count, category);
  return NextResponse.json({ logs, total: logs.length });
}

export async function DELETE(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  clearLogs();
  return NextResponse.json({ cleared: true });
}
