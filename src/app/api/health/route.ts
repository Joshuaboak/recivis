/**
 * GET /api/health — liveness probe for Railway's deploy healthcheck.
 *
 * Railway requires a 2xx before it will cut traffic to a new deployment. The
 * probe carries no session cookie, so it cannot use a portal page: middleware
 * 307s an anonymous `/` to `/login`, and a redirect is not a pass. API routes
 * are outside the middleware matcher, so this answers directly.
 *
 * Deliberately dumb. It reports that the server is up and serving, not that
 * Postgres, Redis and Zoho are reachable — a dependency check here turns a
 * blip in someone else's service into a failed deploy and a rollback to the
 * previous image, which is the opposite of what a healthcheck is for.
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ status: 'ok' });
}
