/**
 * tour/progress.ts — asking the tutorial to open, from anywhere.
 *
 * There is no saved position any more. The tutorial is per page and per
 * section: what a person has already been shown lives on their user record,
 * and where they are is simply which page they are on. So all that is left
 * here is the event the help icon and the user menu fire.
 */

/** Fired at the controller to open or close a section's walkthrough. */
export const TOUR_EVENT = 'recivis-tour';

export interface TourEventDetail {
  action: 'open' | 'stop';
  /** Which section to open. Omitted means "whatever covers this page". */
  sectionId?: string;
}

function dispatch(detail: TourEventDetail): void {
  window.dispatchEvent(new CustomEvent<TourEventDetail>(TOUR_EVENT, { detail }));
}

/** Explain the page the user is on, or a named section. */
export function openTour(sectionId?: string): void {
  dispatch({ action: 'open', sectionId });
}

/** Close whatever is open. */
export function stopTour(): void {
  dispatch({ action: 'stop' });
}

/**
 * Ask for the next page to explain itself.
 *
 * "Learn more" on a dashboard card is a request about somewhere else, and a
 * section can only run on its own page — so the request outlives the
 * navigation in sessionStorage and the controller picks it up on arrival.
 * Recorded against the path so a request cannot fire on the wrong page if the
 * user changes their mind halfway.
 */
const PENDING_KEY = 'recivis:tour:pending';

export function explainOnArrival(path: string): void {
  try {
    window.sessionStorage.setItem(PENDING_KEY, path);
  } catch { /* storage unavailable — the page simply will not introduce itself */ }
}

/** Take the pending request, if it is for this path. */
export function takeExplainRequest(pathname: string): boolean {
  try {
    const pending = window.sessionStorage.getItem(PENDING_KEY);
    if (!pending) return false;
    if (pending !== pathname) return false;
    window.sessionStorage.removeItem(PENDING_KEY);
    return true;
  } catch {
    return false;
  }
}
