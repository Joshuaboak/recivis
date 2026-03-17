import { NextRequest, NextResponse } from 'next/server';
import { requestPasswordReset } from '@/lib/auth';
import { log } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    await requestPasswordReset(email);
    log('info', 'auth', `Password reset requested for ${email}`);

    // Always return success — don't reveal if email exists
    return NextResponse.json({
      message: 'If an account with that email exists, a reset link has been sent.',
    });
  } catch (error) {
    log('error', 'auth', 'Password reset request failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
