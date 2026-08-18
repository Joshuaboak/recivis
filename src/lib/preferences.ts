/**
 * preferences.ts — settings that belong to a person rather than a partner.
 *
 * `UserPermissions` decides what a partner organisation is allowed to do.
 * These decide how one of their staff likes the portal to behave, which is a
 * different question with a different owner: the guided tutorial is wanted by
 * whoever is new, not by the company. Theme already works this way, kept
 * deliberately outside the permission model.
 *
 * Stored as key/value rows so a preference can be added without a migration,
 * and read as a whole set on session load. Unknown keys and unparseable values
 * fall back to the default rather than failing the login.
 */

import { query } from './db';

export interface UserPreferences {
  /** Whether the guided tutorial offers itself and its launcher is shown. */
  guidedTutorial: boolean;
}

/** What a user gets before they have expressed any preference. */
export const DEFAULT_PREFERENCES: UserPreferences = {
  // On by default: someone who has never seen the portal is exactly who the
  // tutorial is for, and it is one click to turn off.
  guidedTutorial: true,
};

/** The stored key for each preference. */
const PREFERENCE_KEYS: Record<keyof UserPreferences, string> = {
  guidedTutorial: 'guided_tutorial',
};

/** Stored keys back to preference names, for reading rows. */
const KEYS_TO_PREFERENCE = Object.fromEntries(
  Object.entries(PREFERENCE_KEYS).map(([name, key]) => [key, name as keyof UserPreferences])
) as Record<string, keyof UserPreferences>;

/** Whether a string is a preference this build understands. */
export function isPreferenceName(name: string): name is keyof UserPreferences {
  return Object.prototype.hasOwnProperty.call(PREFERENCE_KEYS, name);
}

/**
 * Load a user's preferences, filling anything unset from the defaults.
 *
 * Never throws: a preferences table that is missing or unreachable returns
 * defaults, because losing a toggle is not a reason to fail a login.
 */
export async function getUserPreferences(userId: number): Promise<UserPreferences> {
  try {
    const result = await query(
      'SELECT pref_key, pref_value FROM user_preferences WHERE user_id = $1',
      [userId]
    );

    const preferences = { ...DEFAULT_PREFERENCES };
    for (const row of result.rows) {
      const name = KEYS_TO_PREFERENCE[row.pref_key as string];
      // A key written by a newer build, or removed by an older one.
      if (!name) continue;
      preferences[name] = row.pref_value === 'true';
    }
    return preferences;
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

/** Write one preference, replacing any previous value. */
export async function setUserPreference(
  userId: number,
  name: keyof UserPreferences,
  value: boolean
): Promise<void> {
  await query(
    `INSERT INTO user_preferences (user_id, pref_key, pref_value, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (user_id, pref_key)
     DO UPDATE SET pref_value = EXCLUDED.pref_value, updated_at = NOW()`,
    [userId, PREFERENCE_KEYS[name], String(value)]
  );
}
