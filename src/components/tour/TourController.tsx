/**
 * TourController — the guided tutorial, once per page rather than once per user.
 *
 * The tutorial used to be a single forty-step march that drove the user around
 * the portal. This waits instead: open a section for the first time and that
 * section explains itself; press Next through it and it stops offering. The
 * help icon in the header brings it back whenever it is wanted.
 *
 * Nothing here navigates. That is the whole difference — the old controller
 * pushed routes and had to reason about arriving, leaving, and being followed;
 * this one only ever describes the page it is already on.
 *
 * driver.js draws the popover and TourSpotlight draws the dim-and-blur. Two
 * things are deliberately not driver's job:
 *
 *   The footer. driver is handed one step at a time, so it believes every step
 *   is both the first and the last: Back renders disabled and Next renders as
 *   Done. The footer is rebuilt by onPopoverRender, and its clicks are taken by
 *   a capture listener registered before driver starts — driver installs its
 *   own, treats clicks it does not recognise as "close", and would otherwise
 *   destroy the tour when Back was pressed.
 *
 *   Skipping. driver's skipMissingElement only skips within its own step array,
 *   which is one step long, so a missing anchor showed nothing at all. Anchors
 *   legitimately come and go — empty lists, buttons that appear on selection —
 *   so the controller watches for its own target and moves on without it.
 */

'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { driver, type Driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useAppStore } from '@/lib/store';
import { sectionsFor, sectionForPath, type TourSection } from '@/lib/tour/sections';
import { TOUR_EVENT, takeExplainRequest, type TourEventDetail } from '@/lib/tour/progress';
import TourSpotlight from './TourSpotlight';

/** How long to wait for an anchor that has not rendered yet. */
const ANCHOR_TIMEOUT_MS = 8000;

/** How long before giving up on an anchor and moving to the next step. */
const ANCHOR_GIVE_UP_MS = 5000;

/**
 * How long a page gets to settle before a section offers itself.
 *
 * Long enough that the list has loaded and the popover lands on something
 * real; short enough that it does not feel like an afterthought.
 */
const AUTO_OPEN_DELAY_MS = 1200;

export default function TourController() {
  const { user, setUser } = useAppStore();
  const pathname = usePathname();

  const driverRef = useRef<Driver | null>(null);
  /**
   * True while the controller is tearing a popover down itself.
   *
   * driver calls onDestroyed for every destroy, including the one that happens
   * when moving to the next step — so without this, pressing Next read as the
   * user closing the section and ended it on the first step.
   */
  const tearingDownRef = useRef(false);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);

  const enabled = user?.preferences?.guidedTutorial ?? true;
  const seen = useMemo(() => user?.preferences?.seenSections ?? [], [user?.preferences?.seenSections]);

  /** The sections this person gets, with steps they cannot use removed. */
  const sections = useMemo(() => sectionsFor(user?.permissions), [user?.permissions]);

  /** The section covering the page they are on, if any. */
  const sectionHere: TourSection | undefined = useMemo(
    () => sections.find(s => sectionForPath(pathname, user?.permissions)?.id === s.id),
    [sections, pathname, user?.permissions]
  );

  const active = activeSectionId ? sections.find(s => s.id === activeSectionId) : undefined;
  const step = active?.steps[stepIndex];

  /**
   * Remember that a section has been shown.
   *
   * Sent as `sectionSeen` so the server appends rather than replacing: two
   * tabs finishing different sections must not overwrite each other.
   */
  const markSeen = useCallback(async (sectionId: string) => {
    if (seen.includes(sectionId)) return;
    try {
      const res = await fetch('/api/users/me/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sectionSeen: sectionId }),
      });
      if (res.ok && user) {
        const data = await res.json();
        setUser({ ...user, preferences: data.preferences });
      }
    } catch {
      // Remembering is a nicety. Failing to record it means the section
      // offers itself once more, which is a smaller problem than a crash.
    }
  }, [seen, user, setUser]);

  const close = useCallback((sectionId: string | null) => {
    tearingDownRef.current = true;
    driverRef.current?.destroy();
    tearingDownRef.current = false;
    driverRef.current = null;
    setActiveSectionId(null);
    setStepIndex(0);
    if (sectionId) markSeen(sectionId);
  }, [markSeen]);

  const open = useCallback((sectionId: string) => {
    setActiveSectionId(sectionId);
    setStepIndex(0);
  }, []);

  /**
   * Offer a section on arrival.
   *
   * Twice over: the first time somebody opens a page, and whenever they asked
   * for it from somewhere else — "Learn more" on a dashboard card is a request
   * about a page they are not on yet, so it survives the navigation and is
   * honoured here even if the section has been seen.
   */
  useEffect(() => {
    if (!sectionHere || activeSectionId) return;

    const asked = takeExplainRequest(pathname);
    if (!asked && (!enabled || seen.includes(sectionHere.id))) return;

    const timer = window.setTimeout(() => open(sectionHere.id), AUTO_OPEN_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [enabled, sectionHere, activeSectionId, seen, open, pathname]);

  // The help icon, and the replay in the user menu.
  useEffect(() => {
    const onTourEvent = (event: Event) => {
      const detail = (event as CustomEvent<TourEventDetail>).detail;
      if (detail?.action === 'stop') {
        close(null);
        return;
      }
      const target = detail?.sectionId || sectionHere?.id;
      if (target && sections.some(s => s.id === target)) open(target);
    };
    window.addEventListener(TOUR_EVENT, onTourEvent);
    return () => window.removeEventListener(TOUR_EVENT, onTourEvent);
  }, [sections, sectionHere, open, close]);

  // Leaving the page closes what was open: a section explains one page, and a
  // popover pointing at a page you have left is worse than no popover.
  useEffect(() => {
    if (activeSectionId && sectionHere?.id !== activeSectionId) close(null);
  }, [pathname, activeSectionId, sectionHere, close]);

  // Skip a step whose target never appears.
  useEffect(() => {
    if (!step?.anchor || !active) return;

    const selector = `[data-tour="${step.anchor}"]`;
    if (document.querySelector(selector)) return;

    let cancelled = false;
    const started = Date.now();
    const look = () => {
      if (cancelled) return;
      if (document.querySelector(selector)) return;
      if (Date.now() - started >= ANCHOR_GIVE_UP_MS) {
        if (stepIndex + 1 < active.steps.length) setStepIndex(stepIndex + 1);
        else close(active.id);
        return;
      }
      window.setTimeout(look, 300);
    };
    const timer = window.setTimeout(look, 300);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [step, stepIndex, active, close]);

  // Draw the current step.
  useEffect(() => {
    if (!enabled || !active || !step) {
      tearingDownRef.current = true;
      driverRef.current?.destroy();
      tearingDownRef.current = false;
      driverRef.current = null;
      return;
    }

    const isLast = stepIndex === active.steps.length - 1;
    const advance = () => {
      if (isLast) close(active.id);
      else setStepIndex(stepIndex + 1);
    };
    const back = () => setStepIndex(Math.max(0, stepIndex - 1));

    const instance = driver({
      showProgress: true,
      progressText: `${active.title} · ${stepIndex + 1} of ${active.steps.length}`,
      allowClose: true,
      // TourSpotlight paints the dim and the blur; driver's overlay stays only
      // to swallow clicks outside the highlight.
      overlayOpacity: 0,
      stagePadding: 6,
      popoverClass: 'recivis-tour',
      showButtons: ['close'],
      steps: [{
        element: step.anchor ? `[data-tour="${step.anchor}"]` : undefined,
        popover: {
          title: step.title,
          description: step.body,
          side: 'bottom' as const,
          align: 'start' as const,
        },
        disableActiveInteraction: false,
        skipMissingElement: true,
        waitForElement: ANCHOR_TIMEOUT_MS,
      }],
      onPopoverRender: popover => {
        const footer = popover.wrapper.querySelector('.driver-popover-footer');
        if (!footer) return;

        // driver renders its own pair first — a disabled Previous and a Done —
        // and showButtons does not stop it.
        footer.querySelectorAll('.driver-popover-navigation-btns').forEach(el => el.remove());

        const buttons = document.createElement('span');
        buttons.className = 'driver-popover-navigation-btns';

        if (stepIndex > 0) {
          const prev = document.createElement('button');
          prev.type = 'button';
          prev.className = 'driver-popover-prev-btn driver-popover-footer-btn';
          prev.textContent = 'Back';
          buttons.appendChild(prev);
        }

        const next = document.createElement('button');
        next.type = 'button';
        next.className = 'driver-popover-next-btn driver-popover-footer-btn';
        next.textContent = isLast ? 'Got it' : 'Next';
        buttons.appendChild(next);

        footer.appendChild(buttons);
      },
      onDestroyed: () => {
        // The × closes the section for good: a tutorial that reappears after
        // being dismissed is worse than one that never showed up. Stepping and
        // unmounting also destroy the popover, and those are not dismissals.
        if (!tearingDownRef.current) close(active.id);
      },
    });

    const onFooterClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const isBack = target?.closest?.('.driver-popover-prev-btn');
      const isNext = target?.closest?.('.driver-popover-next-btn');
      if (!isBack && !isNext) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      if (isBack) back();
      else advance();
    };
    document.addEventListener('click', onFooterClick, true);

    driverRef.current = instance;
    instance.drive();

    return () => {
      document.removeEventListener('click', onFooterClick, true);
      tearingDownRef.current = true;
      instance.destroy();
      tearingDownRef.current = false;
      driverRef.current = null;
    };
  }, [active, step, stepIndex, enabled, close]);

  if (!enabled || !active || !step) return null;
  return <TourSpotlight anchor={step.anchor} />;
}
