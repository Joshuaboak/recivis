/**
 * DashboardView — Landing page after login.
 *
 * Features:
 * - Personalised greeting based on time of day
 * - Feature cards with navigation and "Learn more" links, each hidden when the
 *   user lacks the permission for the page it opens
 *
 * Records the user has opened live in the header's Recent Items menu, not here.
 */

'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Users,
  Building2,
  FileText,
  BarChart3,
  MessageSquare,
  Bot,
  ArrowRight,
  BookOpen,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { explainOnArrival } from '@/lib/tour/progress';
import { useGuardedRouter } from '@/lib/useGuardedRouter';
import { buildPath } from '@/lib/routes';
import type { UserPermissions } from '@/lib/types';

/** `requires`: the card only shows when the user holds this permission —
 *  the same one that gates the page it opens. */
const featureCards: Array<{
  id: string; label: string; description: string; icon: typeof Users; color: string;
  view: 'leads' | 'accounts' | 'draft-invoices' | 'reports-dashboard' | 'invoice' | 'reports';
  requires?: keyof UserPermissions;
}> = [
  {
    id: 'leads',
    label: 'Leads',
    description: 'View and manage your existing leads.',
    icon: Users,
    color: 'bg-amber-600',
    view: 'leads',
  },
  {
    id: 'accounts',
    label: 'Accounts',
    description: 'Create, view, and manage new and renewal orders for existing accounts.',
    icon: Building2,
    color: 'bg-emerald-600',
    view: 'accounts',
  },
  {
    id: 'invoices',
    label: 'Orders',
    description: 'View and manage your existing orders.',
    icon: FileText,
    color: 'bg-csa-accent',
    view: 'draft-invoices',
    requires: 'canViewOrders',
  },
  {
    id: 'reports-dashboard',
    label: 'Reports Dashboard',
    description: 'Check out your pre-made reports.',
    icon: BarChart3,
    color: 'bg-csa-purple',
    view: 'reports-dashboard',
    requires: 'canViewReports',
  },
  {
    id: 'invoice-assistant',
    label: 'Order Assistant',
    description: 'Upload a PO or chat with our AI ordering agent to generate new and renewal orders.',
    icon: MessageSquare,
    color: 'bg-sky-600',
    view: 'invoice',
    requires: 'canUseOrderAssistant',
  },
  {
    id: 'reports-assistant',
    label: 'Reports Assistant',
    description: 'Chat with our reporting AI assistant to generate custom reports.',
    icon: Bot,
    color: 'bg-violet-600',
    view: 'reports',
    requires: 'canViewReports',
  },
];

/**
 * Which card carries the tutorial's "Learn more" anchor.
 *
 * Six identical buttons would make the first match arbitrary, so one of them
 * is named and the rest go without.
 */
const LEARN_MORE_ANCHOR_CARD = 'leads';

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
  const { user, clearMessages } = useAppStore();
  const router = useGuardedRouter();

  const perms = user?.permissions;
  const canOrder = !!(perms?.canCreateInvoices || perms?.canCreateRenewals);
  const visibleCards = featureCards
    .filter(card => !card.requires || !!perms?.[card.requires])
    // The Accounts blurb promises orders; drop that for partners who cannot raise any.
    .map(card => card.id === 'accounts' && !canOrder
      ? { ...card, description: 'Create, view, and manage your customer accounts.' }
      : card);

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
          {/* The comma only earns its place when there is a name after it. */}
          <h1 className="text-3xl font-bold text-text-primary mb-1">
            Good {timeOfDay()}{user?.name?.split(' ')[0] ? `, ${user.name.split(' ')[0]}` : ''}
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
          data-tour="dashboard-cards"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10"
        >
          {visibleCards.map((card) => (
            <motion.div
              key={card.id}
              variants={item}
              className="group bg-csa-dark border-2 border-border-subtle hover:border-csa-accent/60 p-6 text-left transition-all duration-200 relative overflow-hidden rounded-2xl flex flex-col"
            >
              {/* Hover accent bar */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-csa-accent scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-200 rounded-b" />

              <Link
                href={buildPath(card.view)}
                onClick={() => clearMessages()}
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
              </Link>

              <div className="mt-4 pt-3 border-t border-border-subtle">
                <button
                  data-tour={card.id === LEARN_MORE_ANCHOR_CARD ? 'dashboard-learn-more' : undefined}
                  onClick={() => {
                    // The walkthrough for that section runs on that section's
                    // page, so this asks for it and then goes there.
                    const path = buildPath(card.view);
                    clearMessages();
                    explainOnArrival(path);
                    router.push(path);
                  }}
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
      </div>
    </div>
  );
}
