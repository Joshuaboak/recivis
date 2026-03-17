import { NextRequest, NextResponse } from 'next/server';
import { resetPassword } from '@/lib/auth';
import { log } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const { token, password } = await request.json();

    if (!token || !password) {
      return NextResponse.json({ error: 'Token and new password are required' }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    const result = await resetPassword(token, password);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    log('info', 'auth', 'Password reset completed');
    return NextResponse.json({ message: 'Password has been reset. You can now log in.' });
  } catch (error) {
    log('error', 'auth', 'Password reset failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
