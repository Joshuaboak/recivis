/**
 * Portal layout — the authenticated app shell.
 *
 * Owns the sidebar, header bar, notifications, search modal, the
 * session-expiry watcher and the app-wide unsaved-changes guard.
 * Middleware has already checked that a
 * `recivis-token` cookie exists by the time this renders; this layout turns
 * that cookie into a user by calling GET /api/auth once on mount. Nothing is
 * read from localStorage, so the server and client agree on the first render.
 *
 * The header title comes from routes.ts via the current pathname — view ids
 * no longer decide what the header says.
 */

'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/lib/store';
import { getRouteTitle, LOGIN_PATH } from '@/lib/routes';
import Sidebar from '@/components/layout/Sidebar';
import BrandSplash from '@/components/layout/BrandSplash';
import SessionExpiryWatcher from '@/components/layout/SessionExpiryWatcher';
import SearchModal from '@/components/SearchModal';
import RecentItems from '@/components/RecentItems';
import NotificationBell from '@/components/NotificationBell';
import ThemeToggle from '@/components/ThemeToggle';
import { UnsavedChangesProvider } from '@/components/UnsavedChangesProvider';

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const { user, setUser } = useAppStore();
  const [searchOpen, setSearchOpen] = useState(false);
  const [sessionResolved, setSessionResolved] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  // Rehydrate the session from the cookie. Also refreshes permissions, which
  // the server may have changed since the user last signed in.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth')
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (!cancelled && data?.user) setUser(data.user); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setSessionResolved(true); });
    return () => { cancelled = true; };
  }, [setUser]);

  // No usable session, or the user signed out — back to the login screen.
  useEffect(() => {
    if (sessionResolved && !user) router.replace(LOGIN_PATH);
  }, [sessionResolved, user, router]);

  // Ctrl+K / Cmd+K shortcut to open search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (!user) return <BrandSplash />;

  return (
    <UnsavedChangesProvider>
      <div className="flex h-screen overflow-hidden bg-csa-deep">
        <SessionExpiryWatcher />
        <Sidebar />
        <main className="flex-1 flex flex-col overflow-hidden">
          <header className="h-16 border-b border-border-subtle bg-csa-dark flex items-center justify-between px-6 flex-shrink-0">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-text-primary">
                {getRouteTitle(pathname)}
              </h2>
              <span className="h-4 w-px bg-border-subtle" />
              <span className="text-xs text-text-muted">Civil Survey Applications Partner Portal</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSearchOpen(true)}
                className="flex items-center gap-2.5 px-4 py-2 bg-surface border border-border-subtle rounded-xl text-text-muted hover:text-text-primary hover:border-csa-accent/50 transition-colors cursor-pointer group"
              >
                <Search size={15} className="group-hover:text-csa-accent transition-colors" />
                <span className="text-xs font-medium">Search</span>
                <kbd className="hidden sm:inline-flex px-1.5 py-0.5 text-[10px] font-mono font-semibold text-text-muted/60 bg-csa-dark border border-border-subtle rounded ml-2">
                  Ctrl K
                </kbd>
              </button>
              <ThemeToggle />
              <RecentItems />
              <NotificationBell />
            </div>
          </header>

          <div className="flex-1 overflow-hidden">
            {children}
          </div>
        </main>
        <AnimatePresence>
          {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} />}
        </AnimatePresence>
      </div>
    </UnsavedChangesProvider>
  );
}
