/**
 * tour/steps.ts — what the guided tutorial says, and where it says it.
 *
 * Steps are plain data so the tour can be read and edited without touching the
 * controller. Paths come from routes.ts, which is the only place in the app
 * allowed to know a URL.
 *
 * Two rules shaped this list:
 *
 * 1. **No step needs a record id.** A tour that hardcoded an account id would
 *    work for whoever it was written against and nobody else. Where the tour
 *    has to get into a record, it asks the user to click one and waits.
 * 2. **Every step is optional.** Permissions, empty lists and filters that hide
 *    themselves below two options all mean a target may simply not exist for a
 *    given partner. A missing anchor skips its step rather than stalling.
 */

import { ROUTES, buildPath, type LegacyViewId } from '../routes';

/**
 * The URL pattern for a route, with `[id]` left in place.
 *
 * `buildPath` is for concrete URLs and percent-encodes whatever id it is
 * given, so it cannot express "any account". Steps on a detail page need the
 * pattern, and matching happens against that.
 */
function routePattern(view: LegacyViewId): string {
  const route = ROUTES.find(r => r.legacyViewId === view);
  if (!route) throw new Error(`tour: unknown route "${view}"`);
  return route.path;
}

export interface TourStep {
  /** Stable id, used to resume where someone left off. */
  id: string;
  /** The route this step belongs to. */
  path: string;
  /** Element to highlight, matched as [data-tour="..."]. Omit to centre it. */
  anchor?: string;
  title: string;
  body: string;
  /**
   * Advance when the user clicks the highlighted element rather than pressing
   * Next. Used where the point is to do the thing, not read about it.
   */
  advanceOnClick?: boolean;
  /**
   * Where this step's Next button goes, when it leads somewhere else.
   * Navigation is the controller's job so the unsaved-changes guard runs.
   */
  nextPath?: string;
}

export const TOUR_ID = 'partner-onboarding';

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    path: buildPath('dashboard'),
    title: 'Welcome to the partner portal',
    body:
      'This is a quick walk through the things you will do most: finding a customer, ' +
      'placing an order, and keeping an eye on licences that are coming up for renewal. ' +
      'You can stop at any point, and pick it up again from the menu at the bottom left.',
  },
  {
    id: 'sidebar',
    path: buildPath('dashboard'),
    anchor: 'sidebar',
    title: 'Everything lives here',
    body:
      'Leads and Accounts are your customers. Assets are the licences they hold. ' +
      'Orders is where you sell them something new. Sections with an arrow open up ' +
      'to show more.',
  },
  {
    id: 'dashboard-cards',
    path: buildPath('dashboard'),
    anchor: 'dashboard-cards',
    title: 'Or start from here',
    body: 'The same places, as shortcuts. Each card explains what it is for.',
    nextPath: buildPath('accounts'),
  },
  {
    id: 'accounts-search',
    path: buildPath('accounts'),
    anchor: 'accounts-search',
    title: 'Finding a customer',
    body:
      'Search by company name, contact email, or email domain. Domain is the useful one ' +
      'when you know who emailed you but not what their company is called in here.',
  },
  {
    id: 'accounts-open',
    path: buildPath('accounts'),
    anchor: 'accounts-results',
    title: 'Open one to carry on',
    body: 'Click any customer in the list. The tour follows you in.',
    advanceOnClick: true,
  },
  {
    id: 'account-orders',
    path: routePattern('account-detail'),
    anchor: 'account-orders',
    title: 'Their orders',
    body: 'Everything this customer has bought, and where each order got to.',
  },
  {
    id: 'account-new-order',
    path: routePattern('account-detail'),
    anchor: 'new-order-button',
    title: 'Placing a new order',
    body:
      'Orders always start from a customer, which is why this button lives here rather ' +
      'than in the Orders section. It carries the customer, their contact and your ' +
      'pricing straight into the order.',
  },
  {
    id: 'account-assets',
    path: routePattern('account-detail'),
    anchor: 'account-assets',
    title: 'Their licences',
    body:
      'Every licence this customer holds. Tick the ones that are due and the Generate ' +
      'Renewal button appears above — that is how renewals are raised.',
    nextPath: buildPath('assets-renewals'),
  },
  {
    id: 'renewals',
    path: buildPath('assets-renewals'),
    title: 'What is coming up',
    body:
      'Every licence across all your customers renewing in the next 60 days, soonest ' +
      'first and grouped by customer. Recently Expired does the same for ones that have ' +
      'just lapsed.',
    nextPath: buildPath('dashboard'),
  },
  {
    id: 'finish',
    path: buildPath('dashboard'),
    title: 'That is the tour',
    body:
      'Ask the assistant in the bottom right if you get stuck — it knows this portal ' +
      'and can walk you through anything here. You can replay this tour any time from ' +
      'the menu at the bottom left.',
  },
];

/** The steps that belong to a concrete pathname. */
export function stepsForPath(pathname: string): TourStep[] {
  return TOUR_STEPS.filter(step => pathMatches(step.path, pathname));
}

/**
 * Whether a step's path covers a pathname.
 *
 * `[id]` matches any single segment, so detail-page steps work for whichever
 * record the user opened.
 */
export function pathMatches(stepPath: string, pathname: string): boolean {
  const stepParts = stepPath.split('/');
  const pathParts = pathname.replace(/\/$/, '').split('/');
  if (stepParts.length !== pathParts.length) return false;
  return stepParts.every((part, i) => part === '[id]' || part === pathParts[i]);
}

/** Index of a step by id, or -1. */
export function indexOfStep(stepId: string): number {
  return TOUR_STEPS.findIndex(step => step.id === stepId);
}
