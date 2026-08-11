/**
 * UnsavedChangesProvider — the app's single source of truth for "is there
 * unsaved work right now?", plus the modal that asks the user about it.
 *
 * Why this exists: the App Router removed `router.events`, so there is no
 * supported way to intercept or cancel a client-side navigation from a hook.
 * `beforeunload` only covers hard exits (refresh, tab close, typed URL,
 * external link) and does nothing for in-app route changes. So protection is
 * split in two:
 *
 *   - Work that must survive the browser Back button has to be *persisted*,
 *     not blocked — see `useDraft`. Back cannot be reliably cancelled
 *     (`popstate` fires after the history entry has already changed) and we
 *     deliberately do not push sentinel history entries to fake it.
 *   - Work reached through in-app navigation we control is *guarded*: the
 *     navigation goes through `useGuardedRouter` or `<GuardedLink>`, which
 *     ask `confirmDiscard()` first.
 *
 * Scopes: every dirty region of the UI registers itself under a stable
 * `scopeId`. Many scopes can be dirty at once. A scope clears itself by
 * calling `registerDirty(scopeId, false)` — do that on unmount and after a
 * successful save.
 */

'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';

export interface UnsavedChangesContextValue {
  /**
   * Declare whether `scopeId` currently holds unsaved work. Pass `false` to
   * clear the scope — on unmount and after a successful save. `label` is used
   * in the modal copy ("You have unsaved changes to the billing address").
   *
   * Stable across renders, so it is safe to list in effect dependencies.
   */
  registerDirty: (scopeId: string, isDirty: boolean, label?: string) => void;
  /** True when at least one scope is dirty. Reads a ref — does not re-render. */
  isAnythingDirty: () => boolean;
  /**
   * Ask the user whether to abandon the unsaved work. Resolves `true` to
   * proceed (discard) and `false` to stay. Resolves `true` immediately when
   * nothing is dirty, so callers never need to check first.
   */
  confirmDiscard: () => Promise<boolean>;
}

const UnsavedChangesContext = createContext<UnsavedChangesContextValue | null>(null);

/**
 * Access the unsaved-changes registry. Throws when no provider is mounted,
 * which is deliberate: a silent no-op would mean dirty tracking quietly does
 * nothing and the guards stop working.
 */
export function useUnsavedChanges(): UnsavedChangesContextValue {
  const ctx = useContext(UnsavedChangesContext);
  if (!ctx) {
    throw new Error('useUnsavedChanges must be used within an <UnsavedChangesProvider>');
  }
  return ctx;
}

/**
 * Same registry, but returns `null` instead of throwing when no provider is
 * mounted. For shared primitives that must keep working in isolation (tests,
 * one-off renders outside the portal layout). Prefer `useUnsavedChanges`.
 */
export function useOptionalUnsavedChanges(): UnsavedChangesContextValue | null {
  return useContext(UnsavedChangesContext);
}

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const router = useRouter();

  // scopeId → label. A ref, not state: dirty flips must not re-render the
  // whole portal shell, and `registerDirty` must keep a stable identity.
  const dirtyScopes = useRef(new Map<string, string | undefined>());

  // The open prompt is split in two: labels drive the render, while the
  // promise resolver lives in a ref so `confirmDiscard` can stay stable.
  const [promptLabels, setPromptLabels] = useState<string[] | null>(null);
  const resolverRef = useRef<((proceed: boolean) => void) | null>(null);

  const registerDirty = useCallback((scopeId: string, isDirty: boolean, label?: string) => {
    if (isDirty) dirtyScopes.current.set(scopeId, label);
    else dirtyScopes.current.delete(scopeId);
  }, []);

  const isAnythingDirty = useCallback(() => dirtyScopes.current.size > 0, []);

  const confirmDiscard = useCallback((): Promise<boolean> => {
    if (dirtyScopes.current.size === 0) return Promise.resolve(true);

    const labels = [...new Set([...dirtyScopes.current.values()].filter((l): l is string => !!l))];
    return new Promise<boolean>(resolve => {
      // A second request while a prompt is already open supersedes it; the
      // superseded caller stays put rather than navigating unexpectedly.
      resolverRef.current?.(false);
      resolverRef.current = resolve;
      setPromptLabels(labels);
    });
  }, []);

  const settlePrompt = useCallback((proceed: boolean) => {
    resolverRef.current?.(proceed);
    resolverRef.current = null;
    setPromptLabels(null);
  }, []);

  // Capture-phase click backstop. Belt and braces for raw <a href> internal
  // navigations that never went through <GuardedLink>. Runs before React's
  // bubble-phase handlers, so cancelling here also cancels next/link (its
  // onClick early-returns when the event is already defaultPrevented).
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dirtyScopes.current.size === 0) return;
      if (e.defaultPrevented) return;

      // Exempt by design: these open a new tab or context menu and leave the
      // current work untouched. Guarding them would be user-hostile.
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const target = e.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;

      // <GuardedLink> guards itself in the bubble phase — don't double-prompt.
      if (anchor.dataset.guardedLink === 'true') return;
      if (anchor.target && anchor.target !== '_self') return;
      if (anchor.hasAttribute('download')) return;

      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }

      // External links are a hard exit — beforeunload covers those.
      if (url.origin !== window.location.origin) return;
      // Same-document (hash / identical URL) doesn't lose anything.
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;

      e.preventDefault();
      e.stopPropagation();
      void confirmDiscard().then(proceed => {
        if (proceed) router.push(url.pathname + url.search + url.hash);
      });
    };

    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [confirmDiscard, router]);

  // Escape keeps the work (same as "Keep editing").
  useEffect(() => {
    if (!promptLabels) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        settlePrompt(false);
      }
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [promptLabels, settlePrompt]);

  return (
    <UnsavedChangesContext.Provider value={{ registerDirty, isAnythingDirty, confirmDiscard }}>
      {children}
      <AnimatePresence>
        {promptLabels && <DiscardPromptModal labels={promptLabels} onSettle={settlePrompt} />}
      </AnimatePresence>
    </UnsavedChangesContext.Provider>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// The app's own discard modal. Never window.confirm — that can't be styled,
// can't be tested, and reads as a browser error to users.
// ──────────────────────────────────────────────────────────────────────────

function DiscardPromptModal({
  labels,
  onSettle,
}: {
  labels: string[];
  onSettle: (proceed: boolean) => void;
}) {
  // z-index sits above the app's other modals (z-50) so a discard prompt
  // raised from inside a modal is never hidden behind it.
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" role="alertdialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => onSettle(false)} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative bg-csa-dark border border-border rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
      >
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border-subtle">
          <AlertTriangle size={18} className="text-warning" />
          <h2 className="text-base font-bold text-text-primary">Discard unsaved changes?</h2>
        </div>

        <div className="px-5 py-4">
          <p className="text-sm text-text-secondary">
            {labels.length === 1
              ? `You have unsaved changes to ${labels[0]}.`
              : labels.length > 1
              ? `You have unsaved changes in ${labels.length} places.`
              : 'You have unsaved changes.'}{' '}
            Leaving now will lose them.
          </p>

          {labels.length > 1 && (
            <ul className="mt-3 space-y-1">
              {labels.map(label => (
                <li key={label} className="text-sm text-text-primary flex items-start gap-2">
                  <span className="text-text-muted mt-0.5">•</span>
                  {label}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border-subtle">
          <button
            autoFocus
            onClick={() => onSettle(false)}
            className="px-4 py-2 text-sm font-semibold text-text-secondary hover:text-text-primary bg-surface border border-border-subtle rounded-xl transition-colors"
          >
            Keep editing
          </button>
          <button
            onClick={() => onSettle(true)}
            className="px-4 py-2 text-sm font-semibold text-text-primary bg-error/20 border border-error/40 hover:bg-error/30 rounded-xl transition-colors"
          >
            Discard changes
          </button>
        </div>
      </motion.div>
    </div>
  );
}
