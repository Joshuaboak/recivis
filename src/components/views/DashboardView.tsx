'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  FilePlus,
  RefreshCw,
  BarChart3,
  Building2,
  FileText,
  Clock,
  TrendingUp,
  ArrowRight,
  Loader2,
  MapPin,
  ExternalLink,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';

interface RecentAccount {
  id: string;
  Account_Name: string;
  Billing_Country: string | null;
  Email_Domain: string | null;
  Reseller?: { name: string; id: string };
}

const quickActions = [
  {
    id: 'new',
    label: 'New Invoice',
    description: 'Create a new product invoice',
    icon: FilePlus,
    color: 'bg-csa-accent',
    view: 'invoice' as const,
  },
  {
    id: 'renewal',
    label: 'Renewal',
    description: 'Renew existing licences',
    icon: RefreshCw,
    color: 'bg-csa-purple',
    view: 'invoice' as const,
  },
  {
    id: 'accounts',
    label: 'Accounts',
    description: 'Browse customer accounts',
    icon: Building2,
    color: 'bg-emerald-600',
    view: 'accounts' as const,
  },
  {
    id: 'drafts',
    label: 'Existing Invoices',
    description: 'View and manage invoices',
    icon: FileText,
    color: 'bg-amber-600',
    view: 'draft-invoices' as const,
  },
];

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
};

export default function DashboardView() {
  const { user, setCurrentView, clearMessages, setSelectedAccountId } = useAppStore();
  const [recentAccounts, setRecentAccounts] = useState<RecentAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);

  // Load recent accounts on mount
  useEffect(() => {
    setLoadingAccounts(true);
    fetch('/api/accounts?')
      .then(res => res.json())
      .then(data => setRecentAccounts((data.accounts || []).slice(0, 8)))
      .catch(() => setRecentAccounts([]))
      .finally(() => setLoadingAccounts(false));
  }, []);

  const handleAction = (action: (typeof quickActions)[number]) => {
    clearMessages();
    setCurrentView(action.view);
  };

  const openAccount = (id: string) => {
    setSelectedAccountId(id);
    setCurrentView('account-detail');
  };

  const timeOfDay = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    return 'evening';
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Welcome */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-8"
        >
          <h1 className="text-3xl font-bold text-text-primary mb-1">
            Good {timeOfDay()}, {user?.name?.split(' ')[0]}
          </h1>
          <p className="text-sm text-text-muted">
            What would you like to do today?
          </p>
        </motion.div>

        {/* Quick Actions */}
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10"
        >
          {quickActions.map((action) => (
            <motion.button
              key={action.id}
              variants={item}
              onClick={() => handleAction(action)}
              className="group bg-csa-dark border-2 border-border-subtle hover:border-csa-accent p-6 text-left transition-all duration-200 relative overflow-hidden rounded-2xl"
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
            >
              {/* Hover accent bar */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-csa-accent scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-200 rounded-b" />

              <div className={`w-10 h-10 ${action.color} flex items-center justify-center mb-4`}>
                <action.icon size={20} className="text-white" />
              </div>
              <h3 className="text-base font-bold text-text-primary mb-1">
                {action.label}
              </h3>
              <p className="text-xs text-text-muted">
                {action.description}
              </p>
              <ArrowRight
                size={16}
                className="absolute bottom-4 right-4 text-text-muted opacity-0 group-hover:opacity-100 group-hover:translate-x-0 -translate-x-2 transition-all duration-200"
              />
            </motion.button>
          ))}
        </motion.div>

        {/* Recent Accounts */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.4 }}
          className="mb-10"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
              <Building2 size={18} className="text-csa-accent" />
              Recent Accounts
            </h2>
            <button
              onClick={() => { clearMessages(); setCurrentView('accounts'); }}
              className="text-xs font-semibold text-csa-accent hover:text-csa-highlight transition-colors flex items-center gap-1 cursor-pointer"
            >
              View All <ArrowRight size={12} />
            </button>
          </div>

          {loadingAccounts ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="text-csa-accent animate-spin" />
            </div>
          ) : recentAccounts.length > 0 ? (
            <div className="border border-border-subtle rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-surface-raised">
                    <th>Account</th>
                    <th>Country</th>
                    <th>Reseller</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {recentAccounts.map((acc, i) => (
                    <motion.tr
                      key={acc.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.4 + i * 0.03 }}
                      onClick={() => openAccount(acc.id)}
                      className="cursor-pointer hover:bg-csa-accent/5 transition-colors"
                    >
                      <td>
                        <div className="flex items-center gap-2">
                          <Building2 size={14} className="text-csa-accent flex-shrink-0" />
                          <span className="font-semibold text-text-primary">{acc.Account_Name}</span>
                        </div>
                        {acc.Email_Domain && (
                          <span className="text-xs text-text-muted ml-6">{acc.Email_Domain}</span>
                        )}
                      </td>
                      <td className="text-text-secondary">
                        {acc.Billing_Country && (
                          <span className="flex items-center gap-1">
                            <MapPin size={12} className="text-text-muted" />
                            {acc.Billing_Country}
                          </span>
                        )}
                      </td>
                      <td className="text-text-secondary text-sm">
                        {acc.Reseller?.name || '\u2014'}
                      </td>
                      <td>
                        <ExternalLink size={14} className="text-text-muted" />
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-sm text-text-muted">No accounts found</div>
          )}
        </motion.div>

        {/* Stats row */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.4 }}
          className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10"
        >
          <div className="bg-csa-dark border-2 border-border-subtle p-5 rounded-2xl">
            <div className="flex items-center gap-2 mb-3">
              <FileText size={16} className="text-csa-accent" />
              <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                Quick Start
              </span>
            </div>
            <p className="text-sm text-text-secondary leading-relaxed">
              Jump into the <button onClick={() => { clearMessages(); setCurrentView('invoice'); }} className="text-csa-accent hover:text-csa-highlight underline underline-offset-2">Invoice Assistant</button> and provide an email, contact name, or account name to begin.
            </p>
          </div>

          <div className="bg-csa-dark border-2 border-border-subtle p-5 rounded-2xl">
            <div className="flex items-center gap-2 mb-3">
              <Clock size={16} className="text-csa-purple" />
              <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                Renewals
              </span>
            </div>
            <p className="text-sm text-text-secondary leading-relaxed">
              Check the <button onClick={() => setCurrentView('reports')} className="text-csa-accent hover:text-csa-highlight underline underline-offset-2">Reports</button> view for expiring assets and upcoming renewals.
            </p>
          </div>

          <div className="bg-csa-dark border-2 border-border-subtle p-5 rounded-2xl">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp size={16} className="text-emerald-500" />
              <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                PO Upload
              </span>
            </div>
            <p className="text-sm text-text-secondary leading-relaxed">
              Upload a purchase order PDF and the assistant will extract details and create the invoice automatically.
            </p>
          </div>
        </motion.div>

        {/* Footer hint */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="text-center pb-8"
        >
          <p className="text-xs text-text-muted">
            ReCivis connects to CSA Zoho CRM to manage invoices, accounts, contacts, and assets.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
