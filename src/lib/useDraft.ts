/**
 * useDraft — debounced localStorage persistence for in-progress form work.
 *
 * This is the layer that actually solves the browser Back button. Back cannot
 * be cancelled in the App Router (`popstate` fires after the history entry has
 * already changed), so work that must survive it has to be persisted rather
 * than blocked. Create views persist; edit-in-place views guard.
 *
 * ── HARD RULE: never persist secrets or file bodies ──────────────────────
 * Do NOT pass passwords, tokens, API keys, or base64 file/image bodies into
 * `value`. localStorage is plain text, readable by any script on the origin,
 * survives logout, and is not covered by the app's session lifetime. Base64
 * bodies also blow the ~5MB quota and will silently fail the write. Strip
 * those fields out of the object you hand to this hook.
 *
 * ── No silent rehydration ────────────────────────────────────────────────
 * A found draft is never applied to your form for you. It comes back as
 * `pendingDraft` so you can render <DraftRestoreBar> and let the user choose.
 * A stale half-finished order that quietly reappears will get submitted by
 * accident — that is worse than losing it. Writes are suspended while a
 * pending draft is unresolved, so a pristine empty form cannot overwrite the
 * draft the user is still deciding about.
 *
 * ── Usage ────────────────────────────────────────────────────────────────
 *   const [form, setForm] = useState(EMPTY_FORM);
 *   const { pendingDraft, pendingDraftSavedAt, restore, discard, clear } =
 *     useDraft('orders:new', form);
 *
 *   {pendingDraft && (
 *     <DraftRestoreBar
 *       savedAt={pendingDraftSavedAt!}
 *       onRestore={() => { const d = restore(); if (d) setForm(d); }}
 *       onDiscard={discard}
 *     />
 *   )}
 *
 *   // after a successful submit:
 *   clear();
 *
 * All localStorage access is wrapped in try/catch and degrades to a silent
 * no-op — private browsing, exhausted quota and disabled storage must never
 * throw into a form the user is filling in.
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** Storage keys are namespaced so a portal draft is never mistaken for other app state. */
export const DRAFT_KEY_PREFIX = 'recivis:draft:';

const DEFAULT_TTL_HOURS = 24;
const WRITE_DEBOUNCE_MS = 500;

/** Envelope actually written to localStorage. `v` allows a future format change. */
interface StoredDraft<T> {
  v: 1;
  savedAt: number;
  value: T;
}

export interface UseDraftOptions {
  /** How long a draft stays offerable. Default 24. */
  ttlHours?: number;
}

export interface UseDraftResult<T> {
  /** A draft found on mount within TTL, else null. Never auto-applied. */
  pendingDraft: T | null;
  /** When `pendingDraft` was written (epoch ms), else null. */
  pendingDraftSavedAt: number | null;
  /** Take the pending draft and dismiss the prompt. Returns the value to apply. */
  restore: () => T | null;
  /** Throw the pending draft away and dismiss the prompt. */
  discard: () => void;
  /** Delete the stored draft. Call after a successful submit. */
  clear: () => void;
}

function safeStringify(value: unknown): string | null {
  try {
    return JSON.stringify(value) ?? null;
  } catch {
    // Circular or non-serialisable value — nothing we can persist.
    return null;
  }
}

function removeDraft(storageKey: string): void {
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // Storage unavailable — nothing to clean up.
  }
}

function readDraft<T>(storageKey: string, ttlHours: number): { value: T; savedAt: number } | null {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      (parsed as StoredDraft<T>).v !== 1 ||
      typeof (parsed as StoredDraft<T>).savedAt !== 'number'
    ) {
      removeDraft(storageKey);
      return null;
    }

    const draft = parsed as StoredDraft<T>;
    if (Date.now() - draft.savedAt > ttlHours * 60 * 60 * 1000) {
      removeDraft(storageKey);
      return null;
    }
    return { value: draft.value, savedAt: draft.savedAt };
  } catch {
    // Unparseable or unreadable — treat as "no draft".
    return null;
  }
}

function writeDraft<T>(storageKey: string, value: T): void {
  try {
    const envelope: StoredDraft<T> = { v: 1, savedAt: Date.now(), value };
    window.localStorage.setItem(storageKey, JSON.stringify(envelope));
  } catch {
    // Quota exceeded, private mode, or storage disabled. Drafts are a
    // best-effort convenience, so failing to save one is not an error.
  }
}

export function useDraft<T>(key: string, value: T, opts?: UseDraftOptions): UseDraftResult<T> {
  const storageKey = DRAFT_KEY_PREFIX + key;
  const ttlHours = opts?.ttlHours ?? DEFAULT_TTL_HOURS;

  // Read once, in a lazy initialiser rather than an effect: localStorage is a
  // synchronous store, so there is nothing to wait for. The `window` guard is
  // defensive — the portal layout renders <BrandSplash /> until the session
  // resolves, so a create view only ever mounts client-side.
  const [pending, setPending] = useState<{ value: T; savedAt: number } | null>(() =>
    typeof window === 'undefined' ? null : readDraft<T>(storageKey, ttlHours),
  );

  // Serialised form state we treat as "unchanged", so a pristine form never
  // persists itself and a restored draft isn't immediately rewritten.
  const [baseline, setBaseline] = useState<string | null>(() => safeStringify(value));

  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  // Debounced write. `pending` doubles as the write suspension: while a found
  // draft still awaits the user's choice, a pristine empty form must not
  // overwrite the very draft they are deciding about.
  useEffect(() => {
    if (pending) return;
    const serialized = safeStringify(value);
    if (serialized === null || serialized === baseline) return;

    const timer = setTimeout(() => writeDraft(storageKey, value), WRITE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value, pending, baseline, storageKey]);

  const restore = useCallback((): T | null => {
    if (!pending) return null;
    // The form is about to equal the stored draft, so make that the baseline.
    setBaseline(safeStringify(pending.value));
    setPending(null);
    return pending.value;
  }, [pending]);

  const discard = useCallback(() => {
    setPending(null);
    removeDraft(storageKey);
  }, [storageKey]);

  const clear = useCallback(() => {
    setPending(null);
    removeDraft(storageKey);
    // Whatever was just submitted becomes the baseline, so a successful submit
    // doesn't immediately re-persist itself as a fresh draft.
    setBaseline(safeStringify(valueRef.current));
  }, [storageKey]);

  return {
    pendingDraft: pending?.value ?? null,
    pendingDraftSavedAt: pending?.savedAt ?? null,
    restore,
    discard,
    clear,
  };
}
