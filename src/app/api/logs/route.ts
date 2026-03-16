import { NextRequest, NextResponse } from 'next/server';
import { getLogs, clearLogs } from '@/lib/logger';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const count = parseInt(searchParams.get('count') || '50');
  const category = searchParams.get('category') || undefined;

  const logs = getLogs(count, category);
  return NextResponse.json({ logs, total: logs.length });
}

export async function DELETE() {
  clearLogs();
  return NextResponse.json({ cleared: true });
}
