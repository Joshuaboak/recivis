/**
 * GuardedLink — <Link> that asks before navigating away from unsaved work.
 *
 * Takes exactly the props `next/link` takes, so it is a drop-in replacement.
 * On a plain left-click with unsaved work it prevents the default, asks via
 * `confirmDiscard()`, and navigates only on confirm.
 *
 * Deliberately NOT guarded, because these leave the current work untouched:
 *   - middle-click and ctrl/cmd-click (open in a new tab)
 *   - shift-click (new window), alt-click (download)
 *   - "copy link address" and any other context-menu action — we never touch
 *     the href, so the real URL is always there to copy
 *   - target="_blank" and download links
 *
 * The provider also runs a capture-phase backstop for raw <a href> elements.
 * This component tags itself with `data-guarded-link` so the backstop skips it
 * and the user is never prompted twice for one click.
 */

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ComponentProps, MouseEvent } from 'react';
import { useUnsavedChanges } from './UnsavedChangesProvider';

export type GuardedLinkProps = ComponentProps<typeof Link>;

export function GuardedLink({ onClick, ...props }: GuardedLinkProps) {
  const router = useRouter();
  const { confirmDiscard, isAnythingDirty } = useUnsavedChanges();

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    // Respect the caller's own handler first, including its preventDefault.
    onClick?.(e);
    if (e.defaultPrevented) return;

    if (!isAnythingDirty()) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    const anchor = e.currentTarget;
    if (anchor.target && anchor.target !== '_self') return;
    if (anchor.hasAttribute('download')) return;

    // Resolved absolute href — read before the async gap, since React may
    // pool/reuse the event and the element could unmount.
    const href = anchor.href;

    e.preventDefault();
    void confirmDiscard().then(proceed => {
      if (!proceed) return;
      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) {
        window.location.href = href;
        return;
      }
      router.push(url.pathname + url.search + url.hash);
    });
  };

  return <Link {...props} data-guarded-link="true" onClick={handleClick} />;
}
