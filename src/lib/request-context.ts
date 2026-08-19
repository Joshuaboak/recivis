/**
 * request-context.ts — who the current request belongs to, without threading
 * a parameter through every layer.
 *
 * This exists for one job: letting the Zoho transport refuse a write from a
 * demo session. That check has to hold for routes nobody has written yet, so
 * it cannot depend on each route remembering to pass an actor down. An
 * async-local store carries it instead.
 *
 * `requireAuth` seeds this on every authenticated request. Anything that has
 * not been through `requireAuth` — a cron job, a script, a build-time call —
 * has no context, and is treated as not-a-demo, which is what it is.
 */

import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContext {
  userId: number;
  email: string;
  /** A practice session, whose writes must never reach the live CRM. */
  isDemo: boolean;
}

const storage = new AsyncLocalStorage<RequestContext>();

/**
 * Attach a context to the request currently being handled.
 *
 * Uses `enterWith` rather than `run` so callers do not have to wrap their
 * handler body: `requireAuth` is called at the top of a route, and everything
 * after it in that request shares this async context.
 */
export function setRequestContext(context: RequestContext): void {
  storage.enterWith(context);
}

/** The current request's context, or undefined outside a request. */
export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

/**
 * Whether the request in flight is a demo session.
 *
 * Absent context answers false. That is the honest answer — a call with no
 * authenticated user behind it is not a demo session — and it is why this is a
 * backstop rather than the only guard: routes check `user.isDemo` directly,
 * and this catches what they miss.
 */
export function currentRequestIsDemo(): boolean {
  return storage.getStore()?.isDemo === true;
}
