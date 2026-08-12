'use client';

/**
 * RecentItems — header menu listing the records this user has opened.
 *
 * Reads the list written by `useTrackRecentItem` (see lib/useRecentItems.ts).
 * Panel styling matches NotificationBell, which sits beside it.
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { History, Building2, UserSearch, FileText, Ticket, Handshake } from 'lucide-react';
import { GuardedLink } from '@/components/GuardedLink';
import { useRecentItems, type RecentItemType } from '@/lib/useRecentItems';

const TYPE_CONFIG: Record<RecentItemType, { icon: typeof History; label: string; color: string; bgColor: string }> = {
  account: { icon: Building2,  label: 'Account', color: 'text-emerald-500',  bgColor: 'bg-emerald-500/15' },
  lead:    { icon: UserSearch, label: 'Lead',    color: 'text-csa-accent',   bgColor: 'bg-csa-accent/15' },
  order:   { icon: FileText,   label: 'Order',   color: 'text-sky-500',      bgColor: 'bg-sky-500/15' },
  coupon:  { icon: Ticket,     label: 'Coupon',  color: 'text-csa-purple',   bgColor: 'bg-csa-purple/15' },
  partner: { icon: Handshake,  label: 'Partner', color: 'text-amber-500',    bgColor: 'bg-amber-500/15' },
};

function formatTimeAgo(ts: number) {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function RecentItems() {
  const { items, clear } = useRecentItems();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close panel on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(!open)}
        title="Recent items"
        className="flex items-center justify-center w-9 h-9 bg-surface border border-border-subtle rounded-xl text-text-muted hover:text-text-primary hover:border-csa-accent/50 transition-colors cursor-pointer"
      >
        <History size={16} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -5, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -5, scale: 0.97 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-full mt-2 w-96 bg-csa-dark border border-border rounded-2xl shadow-2xl overflow-hidden z-50"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
              <span className="text-sm font-bold text-text-primary">Recent Items</span>
              {items.length > 0 && (
                <button
                  onClick={clear}
                  className="text-[10px] font-semibold text-text-muted hover:text-error transition-colors cursor-pointer"
                >
                  Clear All
                </button>
              )}
            </div>

            {/* List */}
            <div className="max-h-[400px] overflow-y-auto">
              {items.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <History size={24} className="text-text-muted/30 mx-auto mb-2" />
                  <p className="text-xs text-text-muted">Nothing opened yet</p>
                </div>
              ) : (
                <div className="py-1">
                  {items.map(entry => {
                    const config = TYPE_CONFIG[entry.type];
                    const Icon = config.icon;

                    return (
                      <GuardedLink
                        key={`${entry.type}:${entry.id}`}
                        href={entry.href}
                        onClick={() => setOpen(false)}
                        className="flex items-start gap-3 px-4 py-3 hover:bg-surface-raised transition-colors group cursor-pointer"
                      >
                        <div className={`w-8 h-8 rounded-lg ${config.bgColor} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                          <Icon size={15} className={config.color} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-text-primary truncate group-hover:text-csa-accent transition-colors">
                            {entry.title}
                          </p>
                          <p className="text-[11px] text-text-secondary truncate">
                            {config.label}{entry.subtitle ? ` · ${entry.subtitle}` : ''}
                          </p>
                          <p className="text-[10px] text-text-muted mt-0.5">{formatTimeAgo(entry.openedAt)}</p>
                        </div>
                      </GuardedLink>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
