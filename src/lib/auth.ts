import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
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
  }
): Promise<{ id: number; email: string }> {
  await ensureDB();

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const result = await query(
    `INSERT INTO users (email, password_hash, name, role, reseller_id, reseller_name, region, allowed_reseller_ids)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (email) DO UPDATE SET
       password_hash = $2, name = $3, role = $4, reseller_id = $5,
       reseller_name = $6, region = $7, allowed_reseller_ids = $8, updated_at = NOW()
     RETURNING id, email`,
    [
      email.toLowerCase().trim(),
      passwordHash,
      name,
      role,
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
    `SELECT id, email, password_hash, name, role, reseller_id, reseller_name, region, allowed_reseller_ids, is_active
     FROM users WHERE email = $1`,
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
 * Seed initial admin users. Called once on setup.
 */
export async function seedAdminUsers() {
  await ensureDB();

  // Check if admin users exist
  const existing = await query('SELECT COUNT(*) FROM users WHERE role IN ($1, $2)', ['admin', 'ibm']);

  if (parseInt(existing.rows[0].count) === 0) {
    await createUser(
      'joshua.boak@civilsurveysolutions.com.au',
      'CSA-Admin-2026!',
      'Josh Boak',
      'admin'
    );

    await createUser(
      'andrew.english@civilsurveyapplications.com.au',
      'CSA-IBM-2026!',
      'Andrew English',
      'ibm'
    );

    console.log('Admin users seeded successfully');
  }
}
