'use client';

import { useAppStore } from '@/lib/store';
import Sidebar from './Sidebar';
import DashboardView from '../views/DashboardView';
import AccountsView from '../views/AccountsView';
import AccountDetailView from '../views/AccountDetailView';
import InvoiceView from '../views/InvoiceView';
import InvoiceDetailView from '../views/InvoiceDetailView';
import DraftInvoicesView from '../views/DraftInvoicesView';
import ReportsView from '../views/ReportsView';
import LoginView from '../views/LoginView';
import { AnimatePresence, motion } from 'framer-motion';

const VIEW_TITLES: Record<string, string> = {
  dashboard: 'Dashboard',
  accounts: 'Accounts',
  'account-detail': 'Account',
  invoice: 'Invoice Assistant',
  'invoice-detail': 'Invoice',
  'draft-invoices': 'Existing Invoices',
  reports: 'Reports',
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
    invoice: InvoiceView,
    'invoice-detail': InvoiceDetailView,
    'draft-invoices': DraftInvoicesView,
    reports: ReportsView,
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
            <span className="text-xs text-text-muted">Civil Survey Applications</span>
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
