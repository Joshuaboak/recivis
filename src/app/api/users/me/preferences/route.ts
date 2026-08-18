/**
 * /api/users/me/preferences — the signed-in user's own settings.
 *
 * Scoped to the caller by construction: the user id comes from the verified
 * session, never from the request, so there is no id to tamper with and no
 * ownership check to get wrong. Every authenticated user may read and write
 * their own preferences; none can reach anyone else's.
 *
 * GET   -> { preferences }
 * PATCH { guidedTutorial: boolean } -> { preferences }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { log } from '@/lib/logger';
import {
  getUserPreferences,
  setUserPreference,
  isPreferenceName,
  type UserPreferences,
} from '@/lib/preferences';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  const preferences = await getUserPreferences(user.userId);
  return NextResponse.json({ preferences });
}

export async function PATCH(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult;

  try {
    const body = await request.json();

    // Only names this build knows, and only booleans. An unknown key is a
    // typo or a newer client, and either way is worth saying out loud rather
    // than storing a row nothing will ever read.
    const updates: Array<[keyof UserPreferences, boolean]> = [];
    for (const [name, value] of Object.entries(body)) {
      if (!isPreferenceName(name)) {
        return NextResponse.json({ error: `Unknown preference: ${name}` }, { status: 400 });
      }
      if (typeof value !== 'boolean') {
        return NextResponse.json({ error: `${name} must be true or false` }, { status: 400 });
      }
      updates.push([name, value]);
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No preferences given' }, { status: 400 });
    }

    for (const [name, value] of updates) {
      await setUserPreference(user.userId, name, value);
    }

    const preferences = await getUserPreferences(user.userId);
    log('info', 'api', 'User preferences updated', {
      by: user.email,
      keys: updates.map(([name]) => name).join(','),
    });
    return NextResponse.json({ preferences });
  } catch (error) {
    log('error', 'api', 'Preference update failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to save your preference' }, { status: 500 });
  }
}
