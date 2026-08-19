/**
 * TourSpotlight — the dim-and-blur layer behind the tutorial popover.
 *
 * driver.js draws a flat translucent overlay with a hole in it. That reads as
 * "the screen went dark" rather than "look here", because the rest of the
 * interface is still perfectly legible through it. This replaces it: the page
 * outside the highlighted element is blurred as well as dimmed, so the eye has
 * nowhere else to land, and the target gets a ring so it is obvious even when
 * it is a small button in a crowded row.
 *
 * The hole is cut with a two-layer CSS mask (full-screen layer XOR hole layer),
 * which means the backdrop filter genuinely does not paint over the target —
 * no second element sitting on top trying to look transparent.
 *
 * Position is polled rather than observed. The anchor can move for reasons no
 * single observer catches: a sidebar animating open, an image loading above it,
 * a Framer Motion entrance, the user scrolling. A cheap rect comparison a few
 * times a second, only while the tour is on screen, is simpler than four
 * listeners and misses less.
 */

'use client';

import { useEffect, useState } from 'react';

/** How often to re-measure the anchor. Fast enough to track an animation. */
const POLL_MS = 120;

/** Breathing room around the target, matching driver's stagePadding. */
const PADDING = 6;

interface Rect { x: number; y: number; width: number; height: number }

function readRect(selector: string): Rect | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return {
    x: Math.max(0, r.x - PADDING),
    y: Math.max(0, r.y - PADDING),
    width: r.width + PADDING * 2,
    height: r.height + PADDING * 2,
  };
}

function same(a: Rect | null, b: Rect | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    Math.abs(a.x - b.x) < 1 &&
    Math.abs(a.y - b.y) < 1 &&
    Math.abs(a.width - b.width) < 1 &&
    Math.abs(a.height - b.height) < 1
  );
}

export default function TourSpotlight({ anchor }: { anchor?: string }) {
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    if (!anchor) return;
    const selector = `[data-tour="${anchor}"]`;
    const tick = () => setRect(current => {
      const next = readRect(selector);
      return same(current, next) ? current : next;
    });
    const timer = window.setInterval(tick, POLL_MS);
    tick();
    return () => window.clearInterval(timer);
  }, [anchor]);

  // A step with no anchor blurs the whole page: there is nothing to look at
  // except the popover, which is the point of a centred step. The last
  // anchor's rect is ignored rather than cleared, so no render is spent
  // undoing state the next step is about to replace anyway.
  const hole = anchor ? rect : null;

  const style = hole
    ? ({
        '--tour-hole-x': `${hole.x}px`,
        '--tour-hole-y': `${hole.y}px`,
        '--tour-hole-w': `${hole.width}px`,
        '--tour-hole-h': `${hole.height}px`,
      } as React.CSSProperties)
    : undefined;

  return (
    <>
      <div
        className={`recivis-tour-blur${hole ? ' recivis-tour-blur--hole' : ''}`}
        style={style}
        aria-hidden
      />
      {hole && (
        <div
          className="recivis-tour-ring"
          style={{ left: hole.x, top: hole.y, width: hole.width, height: hole.height }}
          aria-hidden
        />
      )}
    </>
  );
}
