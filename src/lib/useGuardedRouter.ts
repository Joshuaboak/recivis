/**
 * useGuardedRouter — a drop-in replacement for `next/navigation`'s useRouter
 * that asks before throwing away unsaved work.
 *
 * `push`, `replace`, `back` and `forward` await `confirmDiscard()` when
 * anything is dirty and no-op if the user chooses to stay. `refresh` and
 * `prefetch` pass straight through — neither leaves the current view, so
 * there is nothing to lose.
 *
 * Call signatures match `useRouter` exactly, so swapping the import is the
 * whole migration:
 *
 *   - const router = useRouter();          → const router = useGuardedRouter();
 *
 * Note that `back`/`forward` here only guard *programmatic* history moves. The
 * browser's own Back button cannot be intercepted in the App Router; work that
 * must survive it has to be persisted with `useDraft` instead.
 */

'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useUnsavedChanges } from '@/components/UnsavedChangesProvider';

type AppRouter = ReturnType<typeof useRouter>;

export function useGuardedRouter(): AppRouter {
  const router = useRouter();
  const { confirmDiscard } = useUnsavedChanges();

  return useMemo(() => {
    /** Run `action` only if the user is willing to abandon unsaved work. */
    const guard = (action: () => void) => {
      void confirmDiscard().then(proceed => {
        if (proceed) action();
      });
    };

    return {
      ...router,
      push: (href, options) => guard(() => router.push(href, options)),
      replace: (href, options) => guard(() => router.replace(href, options)),
      back: () => guard(() => router.back()),
      forward: () => guard(() => router.forward()),
      refresh: () => router.refresh(),
      prefetch: (href, options) => router.prefetch(href, options),
    } satisfies AppRouter;
  }, [router, confirmDiscard]);
}
