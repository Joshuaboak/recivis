/**
 * TourController — drives the guided tutorial.
 *
 * Mounted once inside UnsavedChangesProvider, so it survives client-side
 * navigation and can use the navigation guard. It holds a driver.js instance
 * in a ref and re-points it whenever the route changes; driver.js draws the
 * spotlight and popover, and this decides what to show and when to move.
 *
 * Routing stays here rather than in the library on purpose. Every in-app
 * navigation in this codebase goes through useGuardedRouter so confirmDiscard
 * runs first — a tour that called router.push itself could throw away a
 * half-written order.
 */

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { driver, type Driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useAppStore } from '@/lib/store';
import { useGuardedRouter } from '@/lib/useGuardedRouter';
import { TOUR_STEPS, stepsForPath, indexOfStep, type TourStep } from '@/lib/tour/steps';
import {
  readTourProgress,
  writeTourProgress,
  clearTourProgress,
  TOUR_EVENT,
} from '@/lib/tour/progress';

/** How long to wait for an anchor that has not rendered yet. */
const ANCHOR_TIMEOUT_MS = 8000;

export default function TourController() {
  const { user, setUser } = useAppStore();
  const pathname = usePathname();
  const router = useGuardedRouter();

  const driverRef = useRef<Driver | null>(null);
  /** The step the tour is on, by id. Null when the tour is not running. */
  const [currentStepId, setCurrentStepId] = useState<string | null>(null);

  const enabled = user?.preferences?.guidedTutorial ?? true;

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

  /** Move to a step by index across the whole tour, navigating if needed. */
  const goToStep = useCallback((index: number) => {
    const step = TOUR_STEPS[index];
    if (!step) {
      finish();
      return;
    }
    rememberStep(step.id);
  }, [finish, rememberStep]);

  // Start, stop and replay in response to the rest of the app.
  useEffect(() => {
    const onTourEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ action: 'start' | 'stop' }>).detail;
      if (detail?.action === 'start') {
        rememberStep(TOUR_STEPS[0].id);
      } else {
        rememberStep(null);
        driverRef.current?.destroy();
      }
    };
    window.addEventListener(TOUR_EVENT, onTourEvent);
    return () => window.removeEventListener(TOUR_EVENT, onTourEvent);
  }, [rememberStep]);

  // Pick the tour back up after a reload, but only if it was mid-flight.
  useEffect(() => {
    const saved = readTourProgress();
    if (saved && indexOfStep(saved) >= 0) setCurrentStepId(saved);
    // Runs once: later changes come through the event above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The tour itself. Re-runs when the step or the route changes, which is how
  // a step on another page picks up after navigation.
  useEffect(() => {
    if (!enabled || !currentStepId) {
      driverRef.current?.destroy();
      driverRef.current = null;
      return;
    }

    const stepIndex = indexOfStep(currentStepId);
    const step = TOUR_STEPS[stepIndex];
    if (!step) return;

    // This step belongs to another page. Wait — either the user is on their
    // way there, or the previous step is about to send them.
    if (!stepsForPath(pathname).some(s => s.id === step.id)) {
      driverRef.current?.destroy();
      driverRef.current = null;
      return;
    }

    const isLast = stepIndex === TOUR_STEPS.length - 1;

    const advance = () => {
      const next = TOUR_STEPS[stepIndex + 1];
      if (!next) {
        finish();
        return;
      }
      // Navigate through the guarded router so unsaved work is protected. If
      // the user chooses to keep editing, the push is a no-op and the tour
      // simply stays put rather than advancing past a page it never reached.
      if (step.nextPath) router.push(step.nextPath);
      goToStep(stepIndex + 1);
    };

    const instance = driver({
      showProgress: true,
      progressText: `{{current}} of {{total}}`,
      allowClose: true,
      overlayOpacity: 0.6,
      // Below the app's modal layer, so a dialog raised mid-tour — the discard
      // prompt especially — still sits on top where it can be read.
      stagePadding: 6,
      popoverClass: 'recivis-tour',
      nextBtnText: isLast ? 'Finish' : 'Next',
      prevBtnText: 'Back',
      doneBtnText: 'Finish',
      steps: [buildDriverStep(step)],
      onNextClick: advance,
      onPrevClick: () => {
        const previous = TOUR_STEPS[stepIndex - 1];
        if (!previous) return;
        if (previous.path !== step.path && !previous.path.includes('[id]')) {
          router.push(previous.path);
        }
        goToStep(stepIndex - 1);
      },
      onDestroyed: () => {
        // Closing the popover ends the tour. Reaching the final step finishes
        // it properly; anything earlier is someone opting out.
        if (isLast) finish();
      },
    });

    driverRef.current = instance;
    instance.drive();

    // advanceOnClick steps hand control to the user: they click the real thing
    // and the app navigates itself, so the tour just listens.
    let cleanupClick: (() => void) | undefined;
    if (step.advanceOnClick && step.anchor) {
      const target = document.querySelector(`[data-tour="${step.anchor}"]`);
      if (target) {
        const onClick = () => goToStep(stepIndex + 1);
        target.addEventListener('click', onClick, { once: true });
        cleanupClick = () => target.removeEventListener('click', onClick);
      }
    }

    return () => {
      cleanupClick?.();
      instance.destroy();
      driverRef.current = null;
    };
  }, [currentStepId, pathname, enabled, router, goToStep, finish]);

  return null;
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
    disableActiveInteraction: false,
    // A target that never appears — a permission-gated button, an empty list —
    // skips rather than stalling the tour on a highlight of nothing.
    skipMissingElement: true,
    waitForElement: ANCHOR_TIMEOUT_MS,
  };
}
