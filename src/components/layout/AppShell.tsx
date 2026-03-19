'use client';

import dynamic from 'next/dynamic';
import { useAppStore } from '@/lib/store';
import Sidebar from './Sidebar';
import LoginView from '../views/LoginView';
import { AnimatePresence, motion } from 'framer-motion';

/**
 * Dynamically imported view components.
 * Code-split so each view bundle is loaded on demand rather than included
 * in the initial page load. Sidebar and LoginView remain static imports
 * because they are always rendered immediately.
 */
const DashboardView = dynamic(() => import('../views/DashboardView'));
const AccountsView = dynamic(() => import('../views/AccountsView'));
const AccountDetailView = dynamic(() => import('../views/AccountDetailView'));
const CreateAccountView = dynamic(() => import('../views/CreateAccountView'));
const InvoiceView = dynamic(() => import('../views/InvoiceView'));
const InvoiceDetailView = dynamic(() => import('../views/InvoiceDetailView'));
const CreateInvoiceView = dynamic(() => import('../views/CreateInvoiceView'));
const DraftInvoicesView = dynamic(() => import('../views/DraftInvoicesView'));
const ReportsView = dynamic(() => import('../views/ReportsView'));
const CouponsView = dynamic(() => import('../views/CouponsView'));
const CreateCouponView = dynamic(() => import('../views/CreateCouponView'));
const CouponDetailView = dynamic(() => import('../views/CouponDetailView'));
const ResellerManagementView = dynamic(() => import('../views/ResellerManagementView'));
const PartnerResourcesView = dynamic(() => import('../views/PartnerResourcesView'));

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
          <AnimatePresence mode="wait">
            {ViewComponent && (
              <motion.div
                key={currentView}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
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
