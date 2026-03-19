'use client';

import { useAppStore } from '@/lib/store';
import Sidebar from './Sidebar';
import DashboardView from '../views/DashboardView';
import AccountsView from '../views/AccountsView';
import AccountDetailView from '../views/AccountDetailView';
import CreateAccountView from '../views/CreateAccountView';
import InvoiceView from '../views/InvoiceView';
import InvoiceDetailView from '../views/InvoiceDetailView';
import CreateInvoiceView from '../views/CreateInvoiceView';
import DraftInvoicesView from '../views/DraftInvoicesView';
import ReportsView from '../views/ReportsView';
import CouponsView from '../views/CouponsView';
import CreateCouponView from '../views/CreateCouponView';
import CouponDetailView from '../views/CouponDetailView';
import ResellerManagementView from '../views/ResellerManagementView';
import LoginView from '../views/LoginView';
import { AnimatePresence, motion } from 'framer-motion';

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
