'use client';

import dynamic from 'next/dynamic';
import { useAppStore } from '@/lib/store';
import Sidebar from './Sidebar';
import LoginView from '../views/LoginView';
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
const AccountsView = dynamic(() => import('../views/AccountsView'), { loading: ViewLoader });
const AccountDetailView = dynamic(() => import('../views/AccountDetailView'), { loading: ViewLoader });
const CreateAccountView = dynamic(() => import('../views/CreateAccountView'), { loading: ViewLoader });
const InvoiceView = dynamic(() => import('../views/InvoiceView'), { loading: ViewLoader });
const InvoiceDetailView = dynamic(() => import('../views/InvoiceDetailView'), { loading: ViewLoader });
const CreateInvoiceView = dynamic(() => import('../views/CreateInvoiceView'), { loading: ViewLoader });
const DraftInvoicesView = dynamic(() => import('../views/DraftInvoicesView'), { loading: ViewLoader });
const ReportsView = dynamic(() => import('../views/ReportsView'), { loading: ViewLoader });
const CouponsView = dynamic(() => import('../views/CouponsView'), { loading: ViewLoader });
const CreateCouponView = dynamic(() => import('../views/CreateCouponView'), { loading: ViewLoader });
const CouponDetailView = dynamic(() => import('../views/CouponDetailView'), { loading: ViewLoader });
const ResellerManagementView = dynamic(() => import('../views/ResellerManagementView'), { loading: ViewLoader });
const PartnerResourcesView = dynamic(() => import('../views/PartnerResourcesView'), { loading: ViewLoader });

const VIEW_TITLES: Record<string, string> = {
  dashboard: 'Dashboard',
  accounts: 'Accounts',
  'account-detail': 'Account',
  'create-account': 'Create Account',
  invoice: 'Invoice Assistant',
  'invoice-detail': 'Invoice',
  'create-invoice': 'New Invoice',
  'draft-invoices': 'Existing Invoices',
  reports: 'Reports',
  coupons: 'Coupons',
  'create-coupon': 'Create Coupon',
  'coupon-detail': 'Coupon',
  resellers: 'Partners',
  'reseller-detail': 'Partner',
  'partner-resources': 'Partner Resources',
};

export default function AppShell() {
  const { user, currentView } = useAppStore();

  if (!user) {
    return <LoginView />;
  }

  const ViewComponent = {
    dashboard: DashboardView,
    accounts: AccountsView,
    'account-detail': AccountDetailView,
    'create-account': CreateAccountView,
    invoice: InvoiceView,
    'invoice-detail': InvoiceDetailView,
    'create-invoice': CreateInvoiceView,
    'draft-invoices': DraftInvoicesView,
    reports: ReportsView,
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
        <header className="h-16 border-b-4 border-border bg-csa-dark flex items-center px-6 flex-shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-text-primary">
              {VIEW_TITLES[currentView] || currentView}
            </h2>
            <span className="h-4 w-px bg-border-subtle" />
            <span className="text-xs text-text-muted">Civil Survey Applications Partner Portal</span>
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
    </div>
  );
}
