import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser, seedAdminUsers, auditLog } from '@/lib/auth';
import { log } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    // Seed admin users on first request (idempotent)
    try {
      await seedAdminUsers();
    } catch (seedErr) {
      // If DB isn't connected yet, fall back to email-only auth
      log('warn', 'auth', 'DB not available, using email-only auth', {
        error: seedErr instanceof Error ? seedErr.message : String(seedErr),
      });

      // Fallback: email-only for admin users when DB isn't ready
      const ADMIN_EMAILS: Record<string, { name: string; role: string }> = {
        'joshua.boak@civilsurveysolutions.com.au': { name: 'Josh Boak', role: 'admin' },
        'andrew.english@civilsurveyapplications.com.au': { name: 'Andrew English', role: 'ibm' },
      };

      const normalizedEmail = email.toLowerCase().trim();
      if (ADMIN_EMAILS[normalizedEmail]) {
        const admin = ADMIN_EMAILS[normalizedEmail];
        return NextResponse.json({
          user: { email: normalizedEmail, name: admin.name, role: admin.role },
          demo: true,
        });
      }

      return NextResponse.json({ error: 'Database not available. Please try again later.' }, { status: 503 });
    }

    // If no password provided, return a hint (don't reveal if email exists)
    if (!password) {
      return NextResponse.json({ error: 'Password is required' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Authenticate with email + password
    const result = await authenticateUser(normalizedEmail, password);

    if (!result) {
      await auditLog(null, normalizedEmail, 'login_failed', 'Invalid email or password');
      log('warn', 'auth', `Failed login attempt: ${normalizedEmail}`);
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    await auditLog(null, normalizedEmail, 'login_success');
    log('info', 'auth', `User logged in: ${result.user.name} (${result.user.role})`);

    return NextResponse.json({
      user: result.user,
      token: result.token,
    });
  } catch (error) {
    log('error', 'auth', 'Auth error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: 'Authentication failed. Please try again.' },
      { status: 500 }
    );
  }
}
