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
 * Called on first request or app startup.
 */
export async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS roles (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50) UNIQUE NOT NULL,
        display_name VARCHAR(100) NOT NULL,
        description TEXT,
        can_create_invoices BOOLEAN DEFAULT false,
        can_approve_invoices BOOLEAN DEFAULT false,
        can_send_invoices BOOLEAN DEFAULT false,
        can_view_all_records BOOLEAN DEFAULT false,
        can_view_own_records BOOLEAN DEFAULT true,
        can_view_child_records BOOLEAN DEFAULT false,
        can_modify_prices BOOLEAN DEFAULT false,
        can_upload_po BOOLEAN DEFAULT false,
        can_manage_users BOOLEAN DEFAULT false,
        can_view_reports BOOLEAN DEFAULT false,
        can_export_data BOOLEAN DEFAULT false,
        is_system_role BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'reseller',
        role_id INTEGER REFERENCES roles(id),
        reseller_id VARCHAR(50),
        reseller_name VARCHAR(255),
        region VARCHAR(50),
        allowed_reseller_ids TEXT[],
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        last_login TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS audit_log (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        email VARCHAR(255),
        action VARCHAR(100) NOT NULL,
        details TEXT,
        ip_address VARCHAR(45),
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) NOT NULL,
        token VARCHAR(255) UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_roles_name ON roles(name);
      CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id);
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);
      CREATE INDEX IF NOT EXISTS idx_reset_tokens_token ON password_reset_tokens(token);
    `);
  } finally {
    client.release();
  }
}

/**
 * Query helper with automatic connection management.
 */
export async function query(text: string, params?: unknown[]) {
  const result = await pool.query(text, params);
  return result;
}
