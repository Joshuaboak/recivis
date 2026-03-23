/**
 * POST /api/auth — Authenticate a user with email + password.
 *
 * Flow:
 * 1. Seeds default roles and admin users on first request (idempotent)
 * 2. Validates email + password against bcrypt hashes in PostgreSQL
 * 3. Returns the user object and sets a JWT as an HTTP-only cookie
 *
 * Fallback: If the database is unavailable, known admin emails can
 * authenticate without a password (demo mode, no JWT issued).
 *
 * Security: Failed login attempts are audit-logged. Error messages
 * do not reveal whether the email exists.
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser, seedAdminUsers, auditLog } from '@/lib/auth';
import { requireAuth } from '@/lib/api-auth';
import { log } from '@/lib/logger';

/**
 * GET /api/auth — Refresh the current user session.
 *
 * Reads the JWT from the cookie, recomputes permissions from the database,
 * and returns the updated user object. Called on app mount to keep the
 * localStorage-persisted user in sync with server-side permission changes.
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  return NextResponse.json({ user: authResult });
}

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

    const response = NextResponse.json({
      user: result.user,
    });

    // Set HTTP-only cookie with JWT — automatically sent with all subsequent requests
    response.cookies.set('recivis-token', result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24, // 24 hours (matches JWT expiry)
    });

    return response;
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
