/**
 * AppShell — Root layout component for the authenticated app.
 *
 * Responsibilities:
 * - Gates the entire app behind authentication (renders LoginView if no user)
 * - Renders the sidebar navigation and header bar
 * - Maps the current view ID from the Zustand store to a code-split component
 * - Animates view transitions with Framer Motion
 *
 * All view components are dynamically imported (next/dynamic) so each view's
 * bundle is loaded on demand, keeping the initial page load fast.
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { Search, LogOut } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import Sidebar from './Sidebar';
import LoginView from '../views/LoginView';
import SearchModal from '../SearchModal';
import NotificationBell from '../NotificationBell';
import { AnimatePresence, motion } from 'framer-motion';

/** Loading spinner shown while a code-split view is being loaded. */
function ViewLoader() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="w-6 h-6 border-2 border-csa-accent/30 border-t-csa-accent rounded-full animate-spin" />
    </div>
  );
}

/**
 * Dynamically imported view components.
 * Code-split so each view bundle is loaded on demand rather than included
 * in the initial page load. Each has a loading fallback to prevent layout
 * shifts while the chunk loads.
 */
const DashboardView = dynamic(() => import('../views/DashboardView'), { loading: ViewLoader });
const LeadsView = dynamic(() => import('../views/LeadsView'), { loading: ViewLoader });
const LeadDetailView = dynamic(() => import('../views/LeadDetailView'), { loading: ViewLoader });
const AccountsView = dynamic(() => import('../views/AccountsView'), { loading: ViewLoader });
const AccountDetailView = dynamic(() => import('../views/AccountDetailView'), { loading: ViewLoader });
const CreateAccountView = dynamic(() => import('../views/CreateAccountView'), { loading: ViewLoader });
const InvoiceView = dynamic(() => import('../views/InvoiceView'), { loading: ViewLoader });
const InvoiceDetailView = dynamic(() => import('../views/InvoiceDetailView'), { loading: ViewLoader });
const CreateInvoiceView = dynamic(() => import('../views/CreateInvoiceView'), { loading: ViewLoader });
const DraftInvoicesView = dynamic(() => import('../views/DraftInvoicesView'), { loading: ViewLoader });
const ReportsView = dynamic(() => import('../views/ReportsView'), { loading: ViewLoader });
const ReportsDashboardView = dynamic(() => import('../views/ReportsDashboardView'), { loading: ViewLoader });
const CouponsView = dynamic(() => import('../views/CouponsView'), { loading: ViewLoader });
const CreateCouponView = dynamic(() => import('../views/CreateCouponView'), { loading: ViewLoader });
const CouponDetailView = dynamic(() => import('../views/CouponDetailView'), { loading: ViewLoader });
const ResellerManagementView = dynamic(() => import('../views/ResellerManagementView'), { loading: ViewLoader });
const PartnerResourcesView = dynamic(() => import('../views/PartnerResourcesView'), { loading: ViewLoader });

/** Human-readable titles shown in the header bar for each view. */
const VIEW_TITLES: Record<string, string> = {
  dashboard: 'Dashboard',
  leads: 'Leads',
  'lead-detail': 'Lead',
  accounts: 'Accounts',
  'account-detail': 'Account',
  'create-account': 'Create Account',
  invoice: 'Invoice Assistant',
  'invoice-detail': 'Invoice',
  'create-invoice': 'New Invoice',
  'draft-invoices': 'Existing Invoices',
  reports: 'AI Reports',
  'reports-dashboard': 'Reports Dashboard',
  coupons: 'Coupons',
  'create-coupon': 'Create Coupon',
  'coupon-detail': 'Coupon',
  resellers: 'Partners',
  'reseller-detail': 'Partner',
  'partner-resources': 'Partner Resources',
};

export default function AppShell() {
  const { user, currentView, setUser } = useAppStore();
  const [searchOpen, setSearchOpen] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const interceptorInstalled = useRef(false);

  // Global fetch interceptor — detect 401s and auto-logout
  useEffect(() => {
    if (interceptorInstalled.current || !user) return;
    interceptorInstalled.current = true;

    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      // Only intercept our own API calls, not external requests
      const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request)?.url || '';
      if (response.status === 401 && url.startsWith('/api/')) {
        setSessionExpired(true);
        setTimeout(() => {
          setUser(null);
          setSessionExpired(false);
        }, 3000);
      }
      return response;
    };

    return () => {
      window.fetch = originalFetch;
      interceptorInstalled.current = false;
    };
  }, [user, setUser]);

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

  if (!user) {
    return (
      <>
        <LoginView />
        <AnimatePresence>
          {sessionExpired && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
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
        </AnimatePresence>
      </>
    );
  }

  const ViewComponent = {
    dashboard: DashboardView,
    leads: LeadsView,
    'lead-detail': LeadDetailView,
    accounts: AccountsView,
    'account-detail': AccountDetailView,
    'create-account': CreateAccountView,
    invoice: InvoiceView,
    'invoice-detail': InvoiceDetailView,
    'create-invoice': CreateInvoiceView,
    'draft-invoices': DraftInvoicesView,
    reports: ReportsView,
    'reports-dashboard': ReportsDashboardView,
    coupons: CouponsView,
    'create-coupon': CreateCouponView,
    'coupon-detail': CouponDetailView,
    resellers: ResellerManagementView,
    'reseller-detail': ResellerManagementView,
    'partner-resources': PartnerResourcesView,
  }[currentView];

  return (
    <div className="flex h-screen overflow-hidden bg-csa-deep">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 border-b-4 border-border bg-csa-dark flex items-center justify-between px-6 flex-shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-text-primary">
              {VIEW_TITLES[currentView] || currentView}
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
            <NotificationBell />
          </div>
        </header>

        <div className="flex-1 overflow-hidden">
          <AnimatePresence mode="popLayout">
            {ViewComponent && (
              <motion.div
                key={currentView}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="h-full"
              >
                <ViewComponent />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
      <AnimatePresence>
        {searchOpen && <SearchModal onClose={() => setSearchOpen(false)} />}
      </AnimatePresence>
    </div>
  );
}
