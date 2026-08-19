/**
 * tour/progress.ts — where the tour keeps its place.
 *
 * sessionStorage, matching the precedent set by the chat transcript: it has to
 * survive a route change, an in-app Back and a reload of the same tab, but it
 * is worthless in a new tab and should not outlive the visit. Whether someone
 * has *finished* the tour is a different question with a different lifetime,
 * and lives on their user record instead.
 *
 * Every access is wrapped: storage can be unavailable or full, and a tour that
 * cannot remember its place is a smaller problem than one that throws.
 */

const STORAGE_KEY = 'recivis:session:tour';

/** Fired at the controller to start or stop the tour from elsewhere. */
export const TOUR_EVENT = 'recivis-tour';

/** The step id the tour was last on, or null. */
export function readTourProgress(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeTourProgress(stepId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, stepId);
  } catch { /* storage unavailable — the tour still runs, it just forgets */ }
}

export function clearTourProgress(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch { /* nothing to do */ }
}

/** Start the tour from the beginning. */
export function startTour(): void {
  clearTourProgress();
  window.dispatchEvent(new CustomEvent(TOUR_EVENT, { detail: { action: 'start' } }));
}

/** Stop the tour where it is. */
export function stopTour(): void {
  window.dispatchEvent(new CustomEvent(TOUR_EVENT, { detail: { action: 'stop' } }));
}
