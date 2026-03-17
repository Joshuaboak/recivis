import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { google } from 'googleapis';
import { query, initDB } from './db';
import type { User, UserRole } from './types';

const JWT_SECRET = process.env.JWT_SECRET || 'recivis-dev-secret-change-in-production';
const SALT_ROUNDS = 12;

let dbInitialized = false;

async function ensureDB() {
  if (!dbInitialized) {
    await initDB();
    dbInitialized = true;
  }
}

/**
 * Create a new user with hashed password.
 */
export async function createUser(
  email: string,
  password: string,
  name: string,
  role: UserRole,
  resellerData?: {
    resellerId?: string;
    resellerName?: string;
    region?: string;
    allowedResellerIds?: string[];
  },
  roleId?: number
): Promise<{ id: number; email: string }> {
  await ensureDB();

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  // If no roleId provided, look it up from the role name
  if (!roleId) {
    const roleResult = await query('SELECT id FROM roles WHERE name = $1', [role]);
    if (roleResult.rows.length > 0) {
      roleId = roleResult.rows[0].id;
    }
  }

  const result = await query(
    `INSERT INTO users (email, password_hash, name, role, role_id, reseller_id, reseller_name, region, allowed_reseller_ids)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (email) DO UPDATE SET
       password_hash = $2, name = $3, role = $4, role_id = $5, reseller_id = $6,
       reseller_name = $7, region = $8, allowed_reseller_ids = $9, updated_at = NOW()
     RETURNING id, email`,
    [
      email.toLowerCase().trim(),
      passwordHash,
      name,
      role,
      roleId || null,
      resellerData?.resellerId || null,
      resellerData?.resellerName || null,
      resellerData?.region || null,
      resellerData?.allowedResellerIds || null,
    ]
  );

  return result.rows[0];
}

/**
 * Authenticate user with email and password.
 * Returns a JWT token + User object on success, null on failure.
 */
export async function authenticateUser(
  email: string,
  password: string
): Promise<{ token: string; user: User } | null> {
  await ensureDB();

  const result = await query(
    `SELECT u.id, u.email, u.password_hash, u.name, u.role, u.reseller_id, u.reseller_name,
            u.region, u.allowed_reseller_ids, u.is_active,
            r.can_create_invoices, r.can_approve_invoices, r.can_send_invoices,
            r.can_view_all_records, r.can_view_own_records, r.can_view_child_records,
            r.can_modify_prices, r.can_upload_po, r.can_manage_users,
            r.can_view_reports, r.can_export_data
     FROM users u
     LEFT JOIN roles r ON r.id = u.role_id
     WHERE u.email = $1`,
    [email.toLowerCase().trim()]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];

  if (!row.is_active) return null;

  const passwordValid = await bcrypt.compare(password, row.password_hash);
  if (!passwordValid) return null;

  // Update last login
  await query('UPDATE users SET last_login = NOW() WHERE id = $1', [row.id]);

  const user: User = {
    email: row.email,
    name: row.name,
    role: row.role as UserRole,
    resellerId: row.reseller_id || undefined,
    resellerName: row.reseller_name || undefined,
    region: row.region || undefined,
    allowedResellerIds: row.allowed_reseller_ids || undefined,
    permissions: {
      canCreateInvoices: row.can_create_invoices ?? true,
      canApproveInvoices: row.can_approve_invoices ?? false,
      canSendInvoices: row.can_send_invoices ?? false,
      canViewAllRecords: row.can_view_all_records ?? false,
      canModifyPrices: row.can_modify_prices ?? false,
      canUploadPO: row.can_upload_po ?? false,
      canManageUsers: row.can_manage_users ?? false,
      canViewReports: row.can_view_reports ?? false,
      canExportData: row.can_export_data ?? false,
    },
  };

  const token = jwt.sign(
    { userId: row.id, email: row.email, role: row.role },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  return { token, user };
}

/**
 * Verify a JWT token and return the user.
 */
export async function verifyToken(token: string): Promise<User | null> {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; email: string };

    const result = await query(
      `SELECT email, name, role, reseller_id, reseller_name, region, allowed_reseller_ids
       FROM users WHERE id = $1 AND is_active = true`,
      [decoded.userId]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      email: row.email,
      name: row.name,
      role: row.role as UserRole,
      resellerId: row.reseller_id || undefined,
      resellerName: row.reseller_name || undefined,
      region: row.region || undefined,
      allowedResellerIds: row.allowed_reseller_ids || undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Log an audit event.
 */
export async function auditLog(
  userId: number | null,
  email: string,
  action: string,
  details?: string,
  ipAddress?: string
) {
  await ensureDB();
  await query(
    'INSERT INTO audit_log (user_id, email, action, details, ip_address) VALUES ($1, $2, $3, $4, $5)',
    [userId, email, action, details || null, ipAddress || null]
  );
}

/**
 * Seed default roles and admin users. Called once on setup.
 */
export async function seedAdminUsers() {
  await ensureDB();

  // Seed roles if they don't exist
  const existingRoles = await query('SELECT COUNT(*) FROM roles');
  if (parseInt(existingRoles.rows[0].count) === 0) {
    await query(`
      INSERT INTO roles (name, display_name, description, can_create_invoices, can_approve_invoices, can_send_invoices, can_view_all_records, can_view_own_records, can_view_child_records, can_modify_prices, can_upload_po, can_manage_users, can_view_reports, can_export_data, is_system_role) VALUES
      ('admin', 'Administrator', 'Full system access. Can manage users, approve invoices, and access all records.', true, true, true, true, true, true, true, true, true, true, true, true),
      ('ibm', 'International Business Manager', 'Full access to all records and invoicing. Cannot manage users.', true, true, true, true, true, true, true, true, false, true, true, true),
      ('distributor', 'Distributor', 'Can create and send invoices for own accounts and child reseller accounts. Cannot approve.', true, false, true, false, true, true, false, true, false, true, true, false),
      ('reseller', 'Reseller', 'Can create invoices and upload POs for own accounts only. Cannot approve or send.', true, false, false, false, true, false, false, true, false, true, false, false),
      ('viewer', 'Viewer', 'Read-only access to own records. Cannot create or modify anything.', false, false, false, false, true, false, false, false, false, true, false, false)
    `);
    console.log('Default roles seeded');
  }

  // Seed admin users if they don't exist
  const existingUsers = await query('SELECT COUNT(*) FROM users WHERE role IN ($1, $2)', ['admin', 'ibm']);
  if (parseInt(existingUsers.rows[0].count) === 0) {
    // Get role IDs
    const adminRole = await query('SELECT id FROM roles WHERE name = $1', ['admin']);
    const ibmRole = await query('SELECT id FROM roles WHERE name = $1', ['ibm']);

    await createUser('joshua.boak@civilsurveysolutions.com.au', 'CSA-Admin-2026!', 'Josh Boak', 'admin', {}, adminRole.rows[0]?.id);
    await createUser('andrew.english@civilsurveyapplications.com.au', 'CSA-IBM-2026!', 'Andrew English', 'ibm', {}, ibmRole.rows[0]?.id);
    console.log('Admin users seeded');
  } else {
    // Link existing users to roles if role_id is null
    await query(`
      UPDATE users SET role_id = (SELECT id FROM roles WHERE name = users.role)
      WHERE role_id IS NULL AND EXISTS (SELECT 1 FROM roles WHERE name = users.role)
    `);
  }
}

/**
 * Get permissions for a role.
 */
export async function getRolePermissions(roleName: string): Promise<Record<string, boolean>> {
  await ensureDB();
  const result = await query('SELECT * FROM roles WHERE name = $1', [roleName]);
  if (result.rows.length === 0) return {};

  const role = result.rows[0];
  return {
    canCreateInvoices: role.can_create_invoices,
    canApproveInvoices: role.can_approve_invoices,
    canSendInvoices: role.can_send_invoices,
    canViewAllRecords: role.can_view_all_records,
    canViewOwnRecords: role.can_view_own_records,
    canViewChildRecords: role.can_view_child_records,
    canModifyPrices: role.can_modify_prices,
    canUploadPO: role.can_upload_po,
    canManageUsers: role.can_manage_users,
    canViewReports: role.can_view_reports,
    canExportData: role.can_export_data,
  };
}

/**
 * Create a password reset token and send email.
 * Token expires in 1 hour.
 */
export async function requestPasswordReset(email: string): Promise<boolean> {
  await ensureDB();

  const normalizedEmail = email.toLowerCase().trim();
  const result = await query('SELECT id, name FROM users WHERE email = $1 AND is_active = true', [normalizedEmail]);

  if (result.rows.length === 0) {
    // Don't reveal whether email exists — return true anyway
    return true;
  }

  const user = result.rows[0];
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  // Invalidate any existing tokens for this user
  await query('UPDATE password_reset_tokens SET used = true WHERE user_id = $1 AND used = false', [user.id]);

  // Create new token
  await query(
    'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
    [user.id, token, expiresAt]
  );

  // Send reset email
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://recivis-production.up.railway.app';
  const resetUrl = `${appUrl}?reset=${token}`;

  await sendResetEmail(normalizedEmail, user.name, resetUrl);
  await auditLog(user.id, normalizedEmail, 'password_reset_requested');

  return true;
}

/**
 * Verify a reset token and set new password.
 */
export async function resetPassword(token: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
  await ensureDB();

  const result = await query(
    `SELECT t.id AS token_id, t.user_id, t.expires_at, u.email, u.name
     FROM password_reset_tokens t
     JOIN users u ON u.id = t.user_id
     WHERE t.token = $1 AND t.used = false AND u.is_active = true`,
    [token]
  );

  if (result.rows.length === 0) {
    return { success: false, error: 'Invalid or expired reset link.' };
  }

  const row = result.rows[0];

  if (new Date(row.expires_at) < new Date()) {
    await query('UPDATE password_reset_tokens SET used = true WHERE id = $1', [row.token_id]);
    return { success: false, error: 'This reset link has expired. Please request a new one.' };
  }

  // Set new password
  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [passwordHash, row.user_id]);

  // Mark token as used
  await query('UPDATE password_reset_tokens SET used = true WHERE id = $1', [row.token_id]);

  await auditLog(row.user_id, row.email, 'password_reset_completed');

  return { success: true };
}

/**
 * Send password reset email via Gmail API with service account.
 * Uses domain-wide delegation to send as auth@civilsurveyapplications.com.au
 */
async function sendResetEmail(email: string, name: string, resetUrl: string) {
  const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const senderEmail = process.env.GMAIL_SENDER || 'auth@civilsurveyapplications.com.au';

  if (!serviceAccountKey) {
    // Fallback: log the reset URL for manual use
    console.log(`Password reset for ${email}: ${resetUrl}`);
    return;
  }

  try {
    const credentials = JSON.parse(serviceAccountKey);

    const auth = new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/gmail.send'],
      subject: senderEmail, // Domain-wide delegation: impersonate this user
    });

    const gmail = google.gmail({ version: 'v1', auth });

    const bccEmail = process.env.GMAIL_BCC || 'it@civilsurveysolutions.com.au';

    const htmlBody = [
      `<div style="font-family: 'Encode Sans Semi Condensed', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">`,
      `  <div style="text-align: center; margin-bottom: 24px;">`,
      `    <div style="display: inline-block; background: #0077B7; width: 48px; height: 48px; line-height: 48px; text-align: center; border-radius: 12px; color: white; font-size: 24px; font-weight: bold;">R</div>`,
      `  </div>`,
      `  <h2 style="color: #0A4C6E; margin-bottom: 16px;">Reset Your Password</h2>`,
      `  <p style="color: #333;">Hi ${name},</p>`,
      `  <p style="color: #333;">You requested a password reset for your ReCivis account. Click the button below to set a new password. This link expires in 1 hour.</p>`,
      `  <p style="text-align: center; margin: 32px 0;">`,
      `    <a href="${resetUrl}" style="background: #0077B7; color: white; padding: 14px 36px; text-decoration: none; font-weight: bold; display: inline-block; border-radius: 8px; font-size: 14px;">`,
      `      Reset Password`,
      `    </a>`,
      `  </p>`,
      `  <p style="color: #888; font-size: 13px;">If you didn't request this, you can safely ignore this email. Your password won't change.</p>`,
      `  <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">`,
      `  <p style="color: #aaa; font-size: 11px;">Civil Survey Applications Pty Ltd</p>`,
      `</div>`,
    ].join('\n');

    const rawMessage = [
      `From: ReCivis <${senderEmail}>`,
      `To: ${email}`,
      `Bcc: ${bccEmail}`,
      `Subject: ReCivis - Password Reset`,
      `Content-Type: text/html; charset=utf-8`,
      ``,
      htmlBody,
    ].join('\n');

    const encodedMessage = Buffer.from(rawMessage)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
      },
    });

    console.log(`Password reset email sent to ${email} via Gmail API`);
  } catch (err) {
    console.error('Gmail API send failed:', err);
    // Fallback to console logging
    console.log(`Password reset for ${email}: ${resetUrl}`);
  }
}
