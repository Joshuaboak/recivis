import { NextResponse } from 'next/server';
import { initDB } from '@/lib/db';
import { seedAdminUsers } from '@/lib/auth';

/**
 * One-time setup endpoint. Initializes the database and seeds admin users.
 * GET /api/setup
 */
export async function GET() {
  try {
    await initDB();
    await seedAdminUsers();
    return NextResponse.json({ success: true, message: 'Database initialized and admin users seeded.' });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Setup failed' },
      { status: 500 }
    );
  }
}
