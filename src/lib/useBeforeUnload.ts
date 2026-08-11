/**
 * useBeforeUnload — warn on hard exits while there is unsaved work.
 *
 * Covers only the exits that leave the page entirely: refresh, tab/window
 * close, typing a new URL, and following an external link. It does nothing for
 * in-app route changes — those go through `useGuardedRouter` / `<GuardedLink>`.
 *
 * Browsers show their own generic message ("Changes you made may not be
 * saved") and ignore any custom string, so we don't try to set one.
 *
 *   useBeforeUnload(isDirty);
 */

'use client';

import { useEffect } from 'react';

export function useBeforeUnload(isDirty: boolean): void {
  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // preventDefault is the modern signal; returnValue is kept for older
      // browsers that still gate the prompt on it.
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);
}
