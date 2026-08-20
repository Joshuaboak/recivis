/**
 * TourController — drives the guided tutorial.
 *
 * Mounted once inside UnsavedChangesProvider, so it survives client-side
 * navigation and can use the navigation guard. It holds a driver.js instance
 * in a ref and re-points it whenever the route changes; driver.js draws the
 * popover and positions it, TourSpotlight draws the dim-and-blur, and this
 * decides what to show and when to move.
 *
 * Three things are deliberately not driver.js's job:
 *
 *   Routing. Every in-app navigation in this codebase goes through
 *   useGuardedRouter so confirmDiscard runs first — a tour that called
 *   router.push itself could throw away a half-written order. It also means
 *   the tour never needs a nextPath: the next step declares where it lives and
 *   the controller goes there. The reverse holds too: when a step asks the
 *   user to open a record, the tour follows by watching where they land rather
 *   than by listening for a click.
 *
 *   Counting. driver.js is given one step at a time (the next one may be on a
 *   page that does not exist yet), so its own progress text would read "1 of 1"
 *   on every step and its Next button would call itself Finish. The counter is
 *   ours, over the steps this person actually gets.
 *
 *   The overlay. driver's flat dim leaves the rest of the page perfectly
 *   readable; TourSpotlight blurs it instead. driver's own overlay is kept at
 *   zero opacity because it is also what blocks stray clicks.
 */

'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { driver, type Driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useAppStore } from '@/lib/store';
import { useGuardedRouter } from '@/lib/useGuardedRouter';
import {
  tourStepsFor,
  stepsForPath,
  indexOfStep,
  isDirectPath,
  pathMatches,
  type TourStep,
} from '@/lib/tour/steps';
import {
  readTourProgress,
  writeTourProgress,
  clearTourProgress,
  TOUR_EVENT,
} from '@/lib/tour/progress';
import TourSpotlight from './TourSpotlight';

/** How long to wait for an anchor that has not rendered yet. */
const ANCHOR_TIMEOUT_MS = 8000;

/**
 * How long to wait before giving up on an anchor and moving on.
 *
 * Shorter than the timeout driver is given, so the skip happens rather than
 * the user being left looking at a page with no popover on it.
 */
const ANCHOR_GIVE_UP_MS = 5000;

export default function TourController() {
  const { user, setUser } = useAppStore();
  const pathname = usePathname();
  const router = useGuardedRouter();

  const driverRef = useRef<Driver | null>(null);
  /** The step the tour is on, by id. Null when the tour is not running. */
  const [currentStepId, setCurrentStepId] = useState<string | null>(null);

  const enabled = user?.preferences?.guidedTutorial ?? true;

  /**
   * The tour as this person sees it — steps for buttons they do not have are
   * gone, so the count and the ordering are theirs.
   */
  const steps = useMemo(() => tourStepsFor(user?.permissions), [user?.permissions]);

  /** Remember where we are, so a hard reload or Back does not lose the place. */
  const rememberStep = useCallback((stepId: string | null) => {
    setCurrentStepId(stepId);
    if (stepId) writeTourProgress(stepId);
    else clearTourProgress();
  }, []);

  /** Mark the tour finished, so it stops offering itself. */
  const finish = useCallback(async () => {
    rememberStep(null);
    driverRef.current?.destroy();
    try {
      const res = await fetch('/api/users/me/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tutorialCompleted: true }),
      });
      if (res.ok && user) {
        const data = await res.json();
        setUser({ ...user, preferences: data.preferences });
      }
    } catch {
      // Completion is a nicety; failing to record it must not break anything.
    }
  }, [rememberStep, user, setUser]);

  /** Move to a step by index across the whole tour. */
  const goToStep = useCallback((index: number) => {
    const step = steps[index];
    if (!step) {
      finish();
      return;
    }
    rememberStep(step.id);
  }, [steps, finish, rememberStep]);

  /**
   * Go to a step, taking the user to its page first if it is somewhere else.
   *
   * Detail pages are the exception: they need a record id the tour does not
   * have, which is why the steps before them ask the user to click one.
   */
  const travelTo = useCallback((index: number) => {
    const next = steps[index];
    if (!next) {
      finish();
      return;
    }
    if (isDirectPath(next.path) && next.path !== pathname) router.push(next.path);
    goToStep(index);
  }, [steps, pathname, router, goToStep, finish]);

  // Start, stop and replay in response to the rest of the app.
  useEffect(() => {
    const onTourEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ action: 'start' | 'stop' }>).detail;
      if (detail?.action === 'start') {
        // travelTo rather than rememberStep: the first step is on the
        // dashboard and Replay is pressed from wherever they happen to be, so
        // the tour has to take them there or its first step never renders.
        travelTo(0);
      } else {
        rememberStep(null);
        driverRef.current?.destroy();
      }
    };
    window.addEventListener(TOUR_EVENT, onTourEvent);
    return () => window.removeEventListener(TOUR_EVENT, onTourEvent);
  }, [rememberStep, travelTo]);

  // Pick the tour back up after a reload, but only if it was mid-flight.
  useEffect(() => {
    const saved = readTourProgress();
    if (saved && indexOfStep(steps, saved) >= 0) setCurrentStepId(saved);
    // Runs once: later changes come through the event above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stepIndex = currentStepId ? indexOfStep(steps, currentStepId) : -1;
  const step: TourStep | undefined = stepIndex >= 0 ? steps[stepIndex] : undefined;
  /** True when the step's page is the page we are on. */
  const onStepPage = !!step && stepsForPath(steps, pathname).some(s => s.id === step.id);

  /**
   * Follow the user into a record.
   *
   * A step that says "click a customer and the tour follows you in" cannot
   * watch for the click itself: the row is a link, the click may be a
   * middle-click or a keyboard Enter, and the navigation may be cancelled by
   * the unsaved-changes guard after the click has already happened. Watching
   * where they actually ended up is both simpler and true — the tour moves on
   * because they arrived, not because something was pressed.
   */
  useEffect(() => {
    if (!enabled || !step?.advanceOnClick) return;
    if (pathMatches(step.path, pathname)) return;

    // Only record pages count. Following the user to any later step would
    // also fire mid-navigation, when the pathname is still the page they are
    // leaving — which is how the tour used to skip a step and strand itself.
    const arrived = steps.findIndex(
      (s, i) => i > stepIndex && !isDirectPath(s.path) && pathMatches(s.path, pathname)
    );
    if (arrived >= 0) goToStep(arrived);
  }, [pathname, step, stepIndex, steps, enabled, goToStep]);

  /**
   * Skip a step whose target never appears.
   *
   * driver.js has skipMissingElement, but it only skips within the step array
   * it was given, and it is given one step at a time — so a missing anchor
   * produced no popover at all and the tour simply stopped, which is what
   * happened on the send-keys step, whose buttons only exist once a licence is
   * ticked. Anchors legitimately come and go: empty lists, permission-gated
   * buttons, controls that appear on selection. The tour has to survive all of
   * them, so if the target has not turned up by the time the user would notice,
   * move on.
   */
  useEffect(() => {
    if (!enabled || !step?.anchor || !onStepPage) return;

    const selector = `[data-tour="${step.anchor}"]`;
    if (document.querySelector(selector)) return;

    let cancelled = false;
    const started = Date.now();

    const look = () => {
      if (cancelled) return;
      if (document.querySelector(selector)) return;
      if (Date.now() - started >= ANCHOR_GIVE_UP_MS) {
        travelTo(stepIndex + 1);
        return;
      }
      window.setTimeout(look, 300);
    };
    const timer = window.setTimeout(look, 300);

    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [step, stepIndex, onStepPage, enabled, travelTo]);

  // The tour itself. Re-runs when the step or the route changes, which is how
  // a step on another page picks up after navigation.
  useEffect(() => {
    if (!enabled || !step || !onStepPage) {
      driverRef.current?.destroy();
      driverRef.current = null;
      return;
    }

    const isLast = stepIndex === steps.length - 1;

    const advance = () => {
      // An advanceOnClick step's Next means "I cannot do this" — skip past the
      // steps that only make sense inside a record.
      if (step.advanceOnClick && step.skipTo) {
        const target = indexOfStep(steps, step.skipTo);
        travelTo(target >= 0 ? target : stepIndex + 1);
        return;
      }
      travelTo(stepIndex + 1);
    };

    const instance = driver({
      showProgress: true,
      // Literal, not driver's {{current}}/{{total}} — it only ever holds one
      // step, so its own numbers would always read "1 of 1".
      progressText: `Step ${stepIndex + 1} of ${steps.length}`,
      allowClose: true,
      // TourSpotlight paints the dim and the blur. driver's overlay stays for
      // the one job it still has: swallowing clicks outside the highlight.
      overlayOpacity: 0,
      stagePadding: 6,
      popoverClass: 'recivis-tour',
      nextBtnText: isLast ? 'Finish' : 'Next',
      // driver treats a single-step tour as already finished, so this is the
      // button actually rendered. Without it every step says Finish.
      doneBtnText: isLast ? 'Finish' : 'Next',
      prevBtnText: 'Back',
      showButtons: stepIndex === 0 ? ['next', 'close'] : ['next', 'previous', 'close'],
      steps: [buildDriverStep(step)],
      onNextClick: advance,
      onDestroyed: () => {
        // Closing the popover ends the tour. Reaching the final step finishes
        // it properly; anything earlier is someone opting out.
        if (isLast) finish();
      },
    });

    driverRef.current = instance;
    instance.drive();

    /**
     * Re-enable Back, and drive it.
     *
     * driver.js decides the previous button is dead when the step it is
     * showing is the first in its array — and its array is always one step,
     * because the next step may be on a page that does not exist yet. So Back
     * rendered greyed out and carrying the disabled attribute on every step,
     * which also stopped onPrevClick from ever firing.
     *
     * Both halves have to survive driver re-rendering its own footer, which it
     * does on reposition: the attribute is stripped on a poll rather than once,
     * and the click is taken by a delegated capture-phase listener on the
     * document rather than bound to a button node that gets replaced.
     */
    const enablePrev = window.setInterval(() => {
      if (stepIndex === 0) return;
      const prev = document.querySelector<HTMLButtonElement>('.driver-popover-prev-btn');
      if (!prev) return;
      prev.classList.remove('driver-popover-btn-disabled');
      prev.removeAttribute('disabled');
    }, 200);

    const onDocumentClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest?.('.driver-popover-prev-btn')) return;
      if (stepIndex === 0) return;
      event.preventDefault();
      event.stopPropagation();
      travelTo(stepIndex - 1);
    };
    document.addEventListener('click', onDocumentClick, true);

    return () => {
      window.clearInterval(enablePrev);
      document.removeEventListener('click', onDocumentClick, true);
      instance.destroy();
      driverRef.current = null;
    };
  }, [step, stepIndex, steps, onStepPage, enabled, travelTo, finish]);

  if (!enabled || !step || !onStepPage) return null;
  return <TourSpotlight anchor={step.anchor} />;
}

/** Translate one of our steps into driver.js's shape. */
function buildDriverStep(step: TourStep) {
  return {
    element: step.anchor ? `[data-tour="${step.anchor}"]` : undefined,
    popover: {
      title: step.title,
      description: step.body,
      side: 'bottom' as const,
      align: 'start' as const,
    },
    // Views fetch on mount and render a spinner first, so an anchor genuinely
    // is not there for a few hundred milliseconds after a route change.
    onDeselected: undefined,
    // advanceOnClick steps exist to be clicked; everything else is read-only
    // so a stray click cannot fire an action from behind the popover.
    disableActiveInteraction: !step.advanceOnClick,
    // A target that never appears — a permission-gated button, an empty list —
    // skips rather than stalling the tour on a highlight of nothing.
    skipMissingElement: true,
    waitForElement: ANCHOR_TIMEOUT_MS,
  };
}
