/**
 * DraftRestoreBar — offers a saved draft back to the user.
 *
 * Pairs with `useDraft`, which deliberately never rehydrates a form on its
 * own. Render this when `pendingDraft` is non-null so the user decides:
 *
 *   {pendingDraft && (
 *     <DraftRestoreBar
 *       savedAt={pendingDraftSavedAt!}
 *       onRestore={() => { const d = restore(); if (d) setForm(d); }}
 *       onDiscard={discard}
 *     />
 *   )}
 *
 * Styled to match the amber notice banner in AccountsView.
 */

'use client';

import { useEffect, useState } from 'react';
import { History } from 'lucide-react';

/** "moments ago" / "14 minutes ago" / "3 hours ago" / "2 days ago". */
function relativeTime(savedAt: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - savedAt) / 1000));
  if (seconds < 45) return 'moments ago';

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export interface DraftRestoreBarProps {
  /** When the draft was written (epoch ms) — `pendingDraftSavedAt` from useDraft. */
  savedAt: number;
  onRestore: () => void;
  onDiscard: () => void;
  /** What the draft is, for the copy. Defaults to "unsaved draft". */
  label?: string;
  className?: string;
}

export function DraftRestoreBar({
  savedAt,
  onRestore,
  onDiscard,
  label = 'unsaved draft',
  className = '',
}: DraftRestoreBarProps) {
  // Derived at render so it always matches the current `savedAt`. The ticker
  // exists only to force a re-render, so "moments ago" doesn't go stale while
  // the user is reading it.
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  const when = relativeTime(savedAt);

  return (
    <div
      role="status"
      className={`flex items-center justify-between gap-3 mb-4 px-4 py-3 rounded-lg bg-amber-600/10 border border-amber-600/30 ${className}`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <History size={16} className="text-warning flex-shrink-0" />
        <span className="text-sm text-text-primary">
          You have an {label} from {when}.
        </span>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={onRestore}
          className="px-3 py-1.5 text-xs font-semibold text-text-primary bg-csa-accent/20 border border-csa-accent/40 hover:bg-csa-accent/30 rounded-lg transition-colors"
        >
          Restore
        </button>
        <button
          onClick={onDiscard}
          className="text-xs font-semibold text-text-muted hover:text-text-primary transition-colors"
        >
          Discard
        </button>
      </div>
    </div>
  );
}
