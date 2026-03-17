import { NextRequest, NextResponse } from 'next/server';
import { createUser, auditLog } from '@/lib/auth';
import { query } from '@/lib/db';
import { log } from '@/lib/logger';

/**
 * GET /api/users — list users (for admins/managers)
 * POST /api/users — create a new user
 */

export async function GET() {
  try {
    const result = await query(`
      SELECT u.id, u.email, u.name, u.is_active, u.last_login, u.created_at,
             ur.name AS user_role, ur.display_name AS user_role_display,
             r.name AS reseller_name, r.id AS reseller_id
      FROM users u
      LEFT JOIN user_roles ur ON ur.id = u.user_role_id
      LEFT JOIN resellers r ON r.id = u.reseller_id
      ORDER BY u.created_at DESC
    `);
    return NextResponse.json({ users: result.rows });
  } catch (error) {
    log('error', 'api', 'Failed to list users', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to load users' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { email, password, name, resellerId, userRoleName } = await request.json();

    if (!email || !password || !name) {
      return NextResponse.json({ error: 'Email, password, and name are required' }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    // Look up user_role by name
    let userRoleId: number | undefined;
    if (userRoleName) {
      const roleResult = await query('SELECT id FROM user_roles WHERE name = $1', [userRoleName]);
      if (roleResult.rows.length === 0) {
        return NextResponse.json({ error: `Unknown user role: ${userRoleName}` }, { status: 400 });
      }
      userRoleId = roleResult.rows[0].id;
    }

    // Verify reseller exists if provided
    if (resellerId) {
      const resellerResult = await query('SELECT id FROM resellers WHERE id = $1', [resellerId]);
      if (resellerResult.rows.length === 0) {
        return NextResponse.json({ error: `Reseller not found: ${resellerId}` }, { status: 400 });
      }
    }

    // Check if email already exists
    const existing = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (existing.rows.length > 0) {
      return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 });
    }

    const result = await createUser(
      email,
      password,
      name,
      resellerId || 'csa-internal',
      userRoleId
    );

    await auditLog(null, email, 'user_created', `Created by admin. Role: ${userRoleName || 'standard'}`);
    log('info', 'auth', `User created: ${email} (${userRoleName || 'standard'})`);

    return NextResponse.json({
      success: true,
      user: { id: result.id, email: result.email, name, role: userRoleName || 'standard' },
    });
  } catch (error) {
    log('error', 'api', 'Failed to create user', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create user' },
      { status: 500 }
    );
  }
}
