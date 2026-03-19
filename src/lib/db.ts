/**
 * db.ts — PostgreSQL connection pool and schema initialization.
 *
 * Defines the complete database schema for ReCivis:
 * - reseller_roles: Org-level permission caps (what a reseller org can do)
 * - resellers: Partner organizations, synced from Zoho CRM
 * - user_roles: Per-user permission levels (what an individual can do within their org)
 * - users: Individual user accounts (linked to a reseller + user role)
 * - audit_log: Tracks logins, user changes, and password resets
 * - password_reset_tokens: SHA-256 hashed tokens for self-service password reset
 *
 * Three-tier permission model:
 *   Effective permission = user_role AND reseller_role
 *   (A user can never exceed the caps set by their reseller org)
 */

import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  max: 10,
  idleTimeoutMillis: 30000,
});

export default pool;

/**
 * Initialize database tables.
 *
 * Three-tier permission model:
 * 1. reseller_roles — what a reseller ORG is allowed to do (org-level caps)
 * 2. user_roles — what a USER within a reseller can do (user-level within org)
 * 3. Effective permission = reseller_role AND user_role (user can't exceed org caps)
 */
export async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`

      -- ============================================================
      -- RESELLER ROLES — org-level permission caps
      -- Controls what the reseller organization as a whole can do.
      -- A user within this reseller can never exceed these permissions.
      -- ============================================================
      CREATE TABLE IF NOT EXISTS reseller_roles (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50) UNIQUE NOT NULL,
        display_name VARCHAR(100) NOT NULL,
        description TEXT,
        can_create_invoices BOOLEAN DEFAULT false,
        can_approve_invoices BOOLEAN DEFAULT false,
        can_send_invoices BOOLEAN DEFAULT false,
        can_view_all_records BOOLEAN DEFAULT false,
        can_view_child_records BOOLEAN DEFAULT false,
        can_modify_prices BOOLEAN DEFAULT false,
        can_upload_po BOOLEAN DEFAULT false,
        can_view_reports BOOLEAN DEFAULT false,
        can_export_data BOOLEAN DEFAULT false,
        is_system_role BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      -- ============================================================
      -- RESELLERS — master data synced from Zoho CRM
      -- One row per reseller organization.
      -- ============================================================
      CREATE TABLE IF NOT EXISTS resellers (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        region VARCHAR(10),
        currency VARCHAR(10),
        partner_category VARCHAR(50),
        direct_customer_contact BOOLEAN DEFAULT false,
        distributor_id VARCHAR(50) REFERENCES resellers(id),
        reseller_role_id INTEGER REFERENCES reseller_roles(id),
        zoho_record_status VARCHAR(50) DEFAULT 'Available',
        is_active BOOLEAN DEFAULT true,
        synced_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      -- ============================================================
      -- USER ROLES — per-user permission level within a reseller org
      -- Controls what an individual user can do within their org.
      -- Effective permission = user_role AND reseller_role.
      -- ============================================================
      CREATE TABLE IF NOT EXISTS user_roles (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50) UNIQUE NOT NULL,
        display_name VARCHAR(100) NOT NULL,
        description TEXT,
        can_create_invoices BOOLEAN DEFAULT false,
        can_approve_invoices BOOLEAN DEFAULT false,
        can_send_invoices BOOLEAN DEFAULT false,
        can_modify_prices BOOLEAN DEFAULT false,
        can_upload_po BOOLEAN DEFAULT false,
        can_view_reports BOOLEAN DEFAULT false,
        can_export_data BOOLEAN DEFAULT false,
        can_manage_users BOOLEAN DEFAULT false,
        is_system_role BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      -- ============================================================
      -- USERS — individual user accounts
      -- Linked to a reseller org and assigned a user role within it.
      -- ============================================================
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        reseller_id VARCHAR(50) REFERENCES resellers(id),
        user_role_id INTEGER REFERENCES user_roles(id),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        last_login TIMESTAMP
      );

      -- ============================================================
      -- AUDIT LOG
      -- ============================================================
      CREATE TABLE IF NOT EXISTS audit_log (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        email VARCHAR(255),
        action VARCHAR(100) NOT NULL,
        details TEXT,
        ip_address VARCHAR(45),
        created_at TIMESTAMP DEFAULT NOW()
      );

      -- ============================================================
      -- PASSWORD RESET TOKENS
      -- ============================================================
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) NOT NULL,
        token VARCHAR(255) UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      );

      -- Indexes
      CREATE INDEX IF NOT EXISTS idx_resellers_distributor ON resellers(distributor_id);
      CREATE INDEX IF NOT EXISTS idx_resellers_role ON resellers(reseller_role_id);
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_reseller ON users(reseller_id);
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(user_role_id);
      CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);
      CREATE INDEX IF NOT EXISTS idx_audit_log_email ON audit_log(email);
      CREATE INDEX IF NOT EXISTS idx_reset_tokens_token ON password_reset_tokens(token);
      CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens(user_id);
    `);
  } finally {
    client.release();
  }
}

/**
 * Query helper.
 */
export async function query(text: string, params?: unknown[]) {
  const result = await pool.query(text, params);
  return result;
}
