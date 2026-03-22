/**
 * auth.ts — Authentication, user management, and password reset for ReCivis.
 *
 * Three-tier permission model:
 * 1. Reseller roles — org-level permission caps (what the reseller org can do)
 * 2. User roles — per-user permissions within the org (what the individual can do)
 * 3. Effective = user_role AND reseller_role (user cannot exceed org caps)
 *
 * System admins (admin/ibm user_roles) bypass the intersection — they get full access.
 *
 * Password hashing: bcrypt with 12 salt rounds.
 * Session tokens: JWT with 24-hour expiry, set as HTTP-only cookies.
 * Password reset: SHA-256 hashed tokens stored in DB, plain tokens sent via email.
 */

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { google } from 'googleapis';
import { query, initDB } from './db';
import type { User, UserPermissions } from './types';

const JWT_SECRET = process.env.JWT_SECRET || 'recivis-dev-secret-change-in-production';
const SALT_ROUNDS = 12;

let dbInitialized = false;

async function ensureDB() {
  if (!dbInitialized) {
    await initDB();
    dbInitialized = true;
  }
}

// ============================================================
// USER CRUD
// ============================================================

export async function createUser(
  email: string,
  password: string,
  name: string,
  resellerId?: string,
  userRoleId?: number
): Promise<{ id: number; email: string }> {
  await ensureDB();
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const result = await query(
    `INSERT INTO users (email, password_hash, name, reseller_id, user_role_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (email) DO UPDATE SET
       password_hash = $2, name = $3, reseller_id = $4, user_role_id = $5, updated_at = NOW()
     RETURNING id, email`,
    [email.toLowerCase().trim(), passwordHash, name, resellerId || null, userRoleId || null]
  );
  return result.rows[0];
}

// ============================================================
// AUTHENTICATION
// ============================================================

export async function authenticateUser(
  email: string,
  password: string
): Promise<{ token: string; user: User } | null> {
  await ensureDB();

  const result = await query(
    `SELECT
       u.id, u.email, u.password_hash, u.name, u.is_active, u.reseller_id,
       ur.name AS user_role_name, ur.display_name AS user_role_display,
       ur.can_create_invoices AS ur_create, ur.can_approve_invoices AS ur_approve,
       ur.can_send_invoices AS ur_send, ur.can_modify_prices AS ur_price,
       ur.can_upload_po AS ur_po, ur.can_manage_users AS ur_users,
       ur.can_view_reports AS ur_reports, ur.can_export_data AS ur_export,
       r.id AS reseller_zoho_id, r.name AS reseller_name, r.email AS reseller_email,
       r.region, r.currency, r.partner_category, r.direct_customer_contact, r.distributor_id,
       rr.name AS reseller_role_name, rr.display_name AS reseller_role_display,
       rr.can_create_invoices AS rr_create, rr.can_approve_invoices AS rr_approve,
       rr.can_send_invoices AS rr_send, rr.can_view_all_records AS rr_all,
       rr.can_view_child_records AS rr_child, rr.can_modify_prices AS rr_price,
       rr.can_upload_po AS rr_po, rr.can_view_reports AS rr_reports,
       rr.can_export_data AS rr_export,
       r.perm_create_invoices AS ro_create, r.perm_approve_invoices AS ro_approve,
       r.perm_send_invoices AS ro_send, r.perm_view_all_records AS ro_all,
       r.perm_view_child_records AS ro_child, r.perm_modify_prices AS ro_price,
       r.perm_upload_po AS ro_po, r.perm_view_reports AS ro_reports,
       r.perm_export_data AS ro_export
     FROM users u
     LEFT JOIN user_roles ur ON ur.id = u.user_role_id
     LEFT JOIN resellers r ON r.id = u.reseller_id
     LEFT JOIN reseller_roles rr ON rr.id = r.reseller_role_id
     WHERE u.email = $1`,
    [email.toLowerCase().trim()]
  );

  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  if (!row.is_active) return null;

  const passwordValid = await bcrypt.compare(password, row.password_hash);
  if (!passwordValid) return null;

  await query('UPDATE users SET last_login = NOW() WHERE id = $1', [row.id]);

  // Effective permissions = user_role AND reseller_role (intersection).
  // System admins bypass this — they get true for everything.
  // Per-reseller overrides (ro_*) take precedence over role defaults (rr_*).
  const isSystemAdmin = row.user_role_name === 'admin' || row.user_role_name === 'ibm';

  const rrCreate = row.ro_create ?? row.rr_create ?? false;
  const rrApprove = row.ro_approve ?? row.rr_approve ?? false;
  const rrSend = row.ro_send ?? row.rr_send ?? false;
  const rrAll = row.ro_all ?? row.rr_all ?? false;
  const rrChild = row.ro_child ?? row.rr_child ?? false;
  const rrPrice = row.ro_price ?? row.rr_price ?? false;
  const rrPo = row.ro_po ?? row.rr_po ?? false;
  const rrReports = row.ro_reports ?? row.rr_reports ?? false;
  const rrExport = row.ro_export ?? row.rr_export ?? false;

  const permissions: UserPermissions = {
    canCreateInvoices: isSystemAdmin || ((row.ur_create ?? false) && rrCreate),
    canApproveInvoices: isSystemAdmin || ((row.ur_approve ?? false) && rrApprove),
    canSendInvoices: isSystemAdmin || ((row.ur_send ?? false) && rrSend),
    canViewAllRecords: isSystemAdmin || rrAll,
    canViewChildRecords: isSystemAdmin || rrChild,
    canModifyPrices: isSystemAdmin || ((row.ur_price ?? false) && rrPrice),
    canUploadPO: isSystemAdmin || ((row.ur_po ?? false) && rrPo),
    canManageUsers: isSystemAdmin || (row.ur_users ?? false),
    canViewReports: isSystemAdmin || ((row.ur_reports ?? false) && rrReports),
    canExportData: isSystemAdmin || ((row.ur_export ?? false) && rrExport),
  };

  // Build the list of reseller IDs this user can see.
  // Admins see everything; distributors see own + child resellers.
  let allowedResellerIds: string[] | undefined;
  if (!isSystemAdmin && row.reseller_id) {
    allowedResellerIds = [row.reseller_id];
    if (permissions.canViewChildRecords) {
      const children = await query(
        'SELECT id FROM resellers WHERE distributor_id = $1 AND is_active = true',
        [row.reseller_id]
      );
      for (const child of children.rows) {
        allowedResellerIds.push(child.id);
      }
    }
  }

  const user: User = {
    email: row.email,
    name: row.name,
    userRoleName: row.user_role_name,
    userRoleDisplayName: row.user_role_display,
    resellerRoleName: row.reseller_role_name,
    permissions,
    allowedResellerIds,
    // Legacy compat for the AI system prompt
    role: row.user_role_name || 'reseller',
    resellerId: row.reseller_id || undefined,
    resellerName: row.reseller_name || undefined,
    region: row.region || undefined,
    reseller: row.reseller_id ? {
      id: row.reseller_id,
      name: row.reseller_name,
      email: row.reseller_email,
      region: row.region,
      currency: row.currency,
      partnerCategory: row.partner_category,
      directCustomerContact: row.direct_customer_contact,
      distributorId: row.distributor_id,
      resellerRoleName: row.reseller_role_name,
    } : undefined,
  };

  const token = jwt.sign(
    { userId: row.id, email: row.email, userRole: row.user_role_name },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  return { token, user };
}

/** Verify a JWT and return a minimal user object, or null if invalid/expired. */
export async function verifyToken(token: string): Promise<User | null> {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number };
    const result = await query(
      `SELECT u.email, u.name, u.reseller_id, ur.name AS user_role_name
       FROM users u LEFT JOIN user_roles ur ON ur.id = u.user_role_id
       WHERE u.id = $1 AND u.is_active = true`,
      [decoded.userId]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      email: row.email,
      name: row.name,
      role: row.user_role_name || 'reseller',
      resellerId: row.reseller_id || undefined,
    };
  } catch {
    return null;
  }
}

// ============================================================
// AUDIT
// ============================================================

/** Write an entry to the audit log table. Used for login, user management, and password resets. */
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

// ============================================================
// SEED DATA
// ============================================================

/**
 * Seed default roles, the CSA internal reseller, and admin users.
 * Idempotent — only inserts if tables are empty. Called on first auth request.
 */
export async function seedAdminUsers() {
  await ensureDB();

  // Seed reseller_roles
  const existingRR = await query('SELECT COUNT(*) FROM reseller_roles');
  if (parseInt(existingRR.rows[0].count) === 0) {
    await query(`
      INSERT INTO reseller_roles (name, display_name, description, can_create_invoices, can_approve_invoices, can_send_invoices, can_view_all_records, can_view_child_records, can_modify_prices, can_upload_po, can_view_reports, can_export_data, is_system_role) VALUES
      ('internal', 'Internal (CSA Staff)', 'Full access — for CSA admin and staff accounts.', true, true, true, true, true, true, true, true, true, true),
      ('distributor', 'Distributor', 'Can create and send invoices for own and child reseller accounts.', true, false, true, false, true, true, true, true, true, false),
      ('reseller', 'Reseller', 'Can create invoices and upload POs for own accounts only.', true, false, false, false, false, false, true, true, false, false),
      ('restricted', 'Restricted Reseller', 'Can create invoices at list price only. Cannot modify prices or approve.', true, false, false, false, false, false, true, true, false, false)
    `);
    console.log('Reseller roles seeded');
  }

  // Seed user_roles
  const existingUR = await query('SELECT COUNT(*) FROM user_roles');
  if (parseInt(existingUR.rows[0].count) === 0) {
    await query(`
      INSERT INTO user_roles (name, display_name, description, can_create_invoices, can_approve_invoices, can_send_invoices, can_modify_prices, can_upload_po, can_manage_users, can_view_reports, can_export_data, is_system_role) VALUES
      ('admin', 'System Administrator', 'Full access to everything. Manages users and system settings.', true, true, true, true, true, true, true, true, true),
      ('ibm', 'International Business Manager', 'Full access to invoicing and records. Cannot manage system users.', true, true, true, true, true, false, true, true, true),
      ('manager', 'Reseller Manager', 'Can manage users within their reseller org, create/send invoices.', true, false, true, true, true, true, true, true, false),
      ('standard', 'Standard User', 'Can create invoices and upload POs. Cannot manage users or approve.', true, false, false, false, true, false, true, false, false),
      ('viewer', 'Viewer', 'Read-only access to reports and records.', false, false, false, false, false, false, true, false, false)
    `);
    console.log('User roles seeded');
  }

  // Seed CSA internal reseller (for admin users)
  const existingCSA = await query("SELECT id FROM resellers WHERE id = 'csa-internal'");
  if (existingCSA.rows.length === 0) {
    const internalRole = await query("SELECT id FROM reseller_roles WHERE name = 'internal'");
    await query(
      `INSERT INTO resellers (id, name, email, region, currency, partner_category, reseller_role_id, is_active)
       VALUES ('csa-internal', 'Civil Survey Applications', 'orders@civilsurveyapplications.com.au', 'ANZ', 'AUD', 'Internal', $1, true)`,
      [internalRole.rows[0]?.id]
    );
    console.log('CSA internal reseller seeded');
  }

  // Seed admin users
  const existingUsers = await query('SELECT COUNT(*) FROM users');
  if (parseInt(existingUsers.rows[0].count) === 0) {
    const adminRole = await query("SELECT id FROM user_roles WHERE name = 'admin'");
    const ibmRole = await query("SELECT id FROM user_roles WHERE name = 'ibm'");

    await createUser('joshua.boak@civilsurveysolutions.com.au', 'CSA-Admin-2026!', 'Josh Boak', 'csa-internal', adminRole.rows[0]?.id);
    await createUser('andrew.english@civilsurveyapplications.com.au', 'CSA-IBM-2026!', 'Andrew English', 'csa-internal', ibmRole.rows[0]?.id);
    console.log('Admin users seeded');
  }
}

// ============================================================
// PASSWORD RESET
// ============================================================

/**
 * Request a password reset for the given email.
 *
 * Generates a random token, hashes it with SHA-256, and stores only the
 * hash in the database. The plain token is sent to the user via email.
 * This way, even if the database is compromised, the tokens cannot be
 * used directly — the attacker would need the unhashed value from the email.
 */
export async function requestPasswordReset(email: string): Promise<boolean> {
  await ensureDB();
  const normalizedEmail = email.toLowerCase().trim();
  const result = await query('SELECT id, name FROM users WHERE email = $1 AND is_active = true', [normalizedEmail]);
  if (result.rows.length === 0) return true; // Don't reveal if email exists

  const user = result.rows[0];
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  /** Hash the token with SHA-256 before storing — only the hash goes in the DB. */
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  await query('UPDATE password_reset_tokens SET used = true WHERE user_id = $1 AND used = false', [user.id]);
  await query('INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)', [user.id, tokenHash, expiresAt]);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://recivis-production.up.railway.app';
  const resetUrl = `${appUrl}?reset=${token}`;

  await sendResetEmail(normalizedEmail, user.name, resetUrl);
  await auditLog(user.id, normalizedEmail, 'password_reset_requested');
  return true;
}

/**
 * Reset a user's password using a previously issued reset token.
 *
 * The incoming plain token is hashed with SHA-256 and compared against
 * the stored hash in the database (we never store plain tokens).
 */
export async function resetPassword(token: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
  await ensureDB();

  /** Hash the incoming token to match against the stored hash. */
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const result = await query(
    `SELECT t.id AS token_id, t.user_id, t.expires_at, u.email, u.name
     FROM password_reset_tokens t JOIN users u ON u.id = t.user_id
     WHERE t.token = $1 AND t.used = false AND u.is_active = true`,
    [tokenHash]
  );

  if (result.rows.length === 0) return { success: false, error: 'Invalid or expired reset link.' };

  const row = result.rows[0];
  if (new Date(row.expires_at) < new Date()) {
    await query('UPDATE password_reset_tokens SET used = true WHERE id = $1', [row.token_id]);
    return { success: false, error: 'This reset link has expired. Please request a new one.' };
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [passwordHash, row.user_id]);
  await query('UPDATE password_reset_tokens SET used = true WHERE id = $1', [row.token_id]);
  await auditLog(row.user_id, row.email, 'password_reset_completed');
  return { success: true };
}

// ============================================================
// EMAIL
// ============================================================

/**
 * Send a password reset email via the Gmail API using a Google service account.
 * Falls back to logging the URL to console if credentials are not configured.
 */
async function sendResetEmail(email: string, name: string, resetUrl: string) {
  const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const senderEmail = process.env.GMAIL_SENDER || 'auth@civilsurveyapplications.com.au';

  if (!serviceAccountKey) {
    console.log(`Password reset for ${email}: ${resetUrl}`);
    return;
  }

  try {
    const credentials = JSON.parse(serviceAccountKey);
    const auth = new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/gmail.send'],
      subject: senderEmail,
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
      `    <a href="${resetUrl}" style="background: #0077B7; color: white; padding: 14px 36px; text-decoration: none; font-weight: bold; display: inline-block; border-radius: 8px; font-size: 14px;">Reset Password</a>`,
      `  </p>`,
      `  <p style="color: #888; font-size: 13px;">If you didn't request this, you can safely ignore this email.</p>`,
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
      requestBody: { raw: encodedMessage },
    });

    console.log(`Password reset email sent to ${email} via Gmail API`);
  } catch (err) {
    console.error('Gmail API send failed:', err);
    console.log(`Password reset for ${email}: ${resetUrl}`);
  }
}
