/**
 * /api/logs — the in-memory server log buffer. Admin only.
 *
 * The buffer is one process-wide array shared by every request, so its entries
 * span all resellers and carry tool arguments and result previews. Handing it
 * to a partner leaks other partners' data; handing them DELETE lets them
 * destroy the evidence. Both handlers previously stopped at requireAuth and
 * bound `user` without ever reading it.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getLogs, clearLogs } from '@/lib/logger';
import { requireAuth, isAdmin } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  if (!isAdmin(user)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

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

  if (!isAdmin(user)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  clearLogs();
  return NextResponse.json({ cleared: true });
}
