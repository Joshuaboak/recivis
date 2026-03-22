/**
 * DashboardView — Landing page after login.
 *
 * Features:
 * - Personalised greeting based on time of day
 * - 6 feature cards with navigation and "Learn more" links
 * - Recent accounts table (last 8 modified accounts from Zoho CRM)
 *
 * Data: Fetches recent accounts from /api/accounts on mount.
 */

'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Users,
  Building2,
  FileText,
  BarChart3,
  MessageSquare,
  Bot,
  ArrowRight,
  Loader2,
  MapPin,
  ExternalLink,
  BookOpen,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';

interface RecentAccount {
  id: string;
  Account_Name: string;
  Billing_Country: string | null;
  Email_Domain: string | null;
  Reseller?: { name: string; id: string };
}

const featureCards = [
  {
    id: 'leads',
    label: 'Leads',
    description: 'View and manage your existing leads.',
    icon: Users,
    color: 'bg-amber-600',
    view: 'leads' as const,
  },
  {
    id: 'accounts',
    label: 'Accounts',
    description: 'Create, view, and manage new and renewal invoices for existing accounts.',
    icon: Building2,
    color: 'bg-emerald-600',
    view: 'accounts' as const,
  },
  {
    id: 'invoices',
    label: 'Invoices',
    description: 'View and manage your existing invoices.',
    icon: FileText,
    color: 'bg-csa-accent',
    view: 'draft-invoices' as const,
  },
  {
    id: 'reports-dashboard',
    label: 'Reports Dashboard',
    description: 'Check out your pre-made reports.',
    icon: BarChart3,
    color: 'bg-csa-purple',
    view: 'reports-dashboard' as const,
  },
  {
    id: 'invoice-assistant',
    label: 'Invoice Assistant',
    description: 'Upload a PO or chat with our AI invoicing agent to generate new and renewal invoices.',
    icon: MessageSquare,
    color: 'bg-sky-600',
    view: 'invoice' as const,
  },
  {
    id: 'reports-assistant',
    label: 'Reports Assistant',
    description: 'Chat with our reporting AI assistant to generate custom reports.',
    icon: Bot,
    color: 'bg-violet-600',
    view: 'reports' as const,
  },
];

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
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

  const handleAction = (view: string) => {
    clearMessages();
    setCurrentView(view as Parameters<typeof setCurrentView>[0]);
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

        {/* Feature Cards */}
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10"
        >
          {featureCards.map((card) => (
            <motion.div
              key={card.id}
              variants={item}
              className="group bg-csa-dark border-2 border-border-subtle hover:border-csa-accent/60 p-6 text-left transition-all duration-200 relative overflow-hidden rounded-2xl flex flex-col"
            >
              {/* Hover accent bar */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-csa-accent scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-200 rounded-b" />

              <button
                onClick={() => handleAction(card.view)}
                className="flex-1 text-left cursor-pointer"
              >
                <div className={`w-10 h-10 ${card.color} flex items-center justify-center mb-4 rounded-lg`}>
                  <card.icon size={20} className="text-white" />
                </div>
                <h3 className="text-base font-bold text-text-primary mb-2 group-hover:text-csa-accent transition-colors">
                  {card.label}
                </h3>
                <p className="text-xs text-text-muted leading-relaxed">
                  {card.description}
                </p>
              </button>

              <div className="mt-4 pt-3 border-t border-border-subtle">
                <button
                  onClick={() => {/* TODO: navigate to guide */}}
                  className="flex items-center gap-1.5 text-[11px] font-semibold text-text-muted hover:text-csa-accent transition-colors cursor-pointer"
                >
                  <BookOpen size={12} />
                  Learn more
                </button>
              </div>

              <ArrowRight
                size={16}
                className="absolute top-6 right-5 text-text-muted opacity-0 group-hover:opacity-100 group-hover:translate-x-0 -translate-x-2 transition-all duration-200"
              />
            </motion.div>
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
      </div>
    </div>
  );
}
