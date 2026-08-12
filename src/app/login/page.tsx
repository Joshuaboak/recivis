/**
 * Login screen — deliberately outside the (portal) route group.
 *
 * Keeping it out means the portal shell, and in particular the 401 fetch
 * interceptor, never mounts here: a failed sign-in returns 401 and must not
 * be mistaken for an expired session.
 *
 * Honours two query params: `?next=` (where to go after signing in) and
 * `?expired=1` (the session timed out).
 */

'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { LogOut } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { DEFAULT_PORTAL_PATH } from '@/lib/routes';
import LoginView from '@/components/views/LoginView';
import BrandSplash from '@/components/layout/BrandSplash';
import ThemeToggle from '@/components/ThemeToggle';

/** Only same-origin absolute paths are followed, so `?next=` cannot redirect off-site. */
function safeNext(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return DEFAULT_PORTAL_PATH;
  return next;
}

function LoginScreen() {
  const user = useAppStore((state) => state.user);
  const router = useRouter();
  const searchParams = useSearchParams();

  const next = safeNext(searchParams.get('next'));
  const expired = searchParams.get('expired') === '1';

  // LoginView drops the authenticated user into the store; that is our signal
  // that sign-in succeeded.
  useEffect(() => {
    if (user) router.replace(next);
  }, [user, next, router]);

  return (
    <>
      {/* The toggle has to exist here too: a user who prefers dark should not be
          forced through a light login screen to reach it. */}
      <ThemeToggle className="fixed top-6 right-6 z-50" />
      <LoginView />
      {expired && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-csa-dark border border-warning/40 rounded-xl px-5 py-3 shadow-2xl flex items-center gap-3"
        >
          <div className="w-8 h-8 rounded-lg bg-warning/15 flex items-center justify-center flex-shrink-0">
            <LogOut size={16} className="text-warning" />
          </div>
          <div>
            <p className="text-sm font-semibold text-text-primary">Session expired</p>
            <p className="text-xs text-text-muted">Please log in again to continue.</p>
          </div>
        </motion.div>
      )}
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<BrandSplash />}>
      <LoginScreen />
    </Suspense>
  );
}
