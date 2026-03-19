import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { auditLog } from '@/lib/auth';
import { log } from '@/lib/logger';
import bcrypt from 'bcryptjs';

/**
 * PATCH /api/users/[id] — update user (role, reseller, active status, name)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await request.json();
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (body.name !== undefined) {
      updates.push(`name = $${paramIdx++}`);
      values.push(body.name);
    }
    if (body.is_active !== undefined) {
      updates.push(`is_active = $${paramIdx++}`);
      values.push(body.is_active);
    }
    if (body.user_role_name !== undefined) {
      const roleResult = await query('SELECT id FROM user_roles WHERE name = $1', [body.user_role_name]);
      if (roleResult.rows.length > 0) {
        updates.push(`user_role_id = $${paramIdx++}`);
        values.push(roleResult.rows[0].id);
      }
    }
    if (body.reseller_id !== undefined) {
      updates.push(`reseller_id = $${paramIdx++}`);
      values.push(body.reseller_id || null);
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    await query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIdx}`,
      values
    );

    // Get updated user for audit
    const userResult = await query('SELECT email FROM users WHERE id = $1', [id]);
    const email = userResult.rows[0]?.email || '';
    await auditLog(parseInt(id), email, 'user_updated', `Fields: ${Object.keys(body).join(', ')}`);
    log('info', 'auth', `User ${id} updated`, { fields: Object.keys(body) });

    return NextResponse.json({ success: true });
  } catch (error) {
    log('error', 'api', `User update failed for ${id}`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}

/**
 * PUT /api/users/[id] — reset password
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const body = await request.json();
    const { password } = body;

    if (!password || password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [passwordHash, id]);

    const userResult = await query('SELECT email FROM users WHERE id = $1', [id]);
    const email = userResult.rows[0]?.email || '';
    await auditLog(parseInt(id), email, 'password_reset_by_admin');
    log('info', 'auth', `Password reset for user ${id} by admin`);

    return NextResponse.json({ success: true });
  } catch (error) {
    log('error', 'api', `Password reset failed for ${id}`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to reset password' }, { status: 500 });
  }
}
