'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, UserSearch, Beaker, FileText, X, Trash2, ExternalLink } from 'lucide-react';
import { useAppStore } from '@/lib/store';

interface Notification {
  key: string;
  type: 'lead' | 'evaluation' | 'invoice';
  title: string;
  message: string;
  recordId: string;
  recordModule: string;
  timestamp: string;
}

const TYPE_CONFIG: Record<string, { icon: typeof Bell; color: string; bgColor: string }> = {
  lead:       { icon: UserSearch, color: 'text-csa-accent',  bgColor: 'bg-csa-accent/15' },
  evaluation: { icon: Beaker,     color: 'text-success',     bgColor: 'bg-success/15' },
  invoice:    { icon: FileText,   color: 'text-csa-purple',  bgColor: 'bg-csa-purple/15' },
};

export default function NotificationBell() {
  const { user, setCurrentView, setSelectedLeadId, setSelectedLeadSource, setSelectedInvoiceId, setInvoiceReturnView } = useAppStore();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications');
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch { /* silent */ }
  }, []);

  // Fetch on mount + poll every 3 minutes
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 180000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

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

  const handleNavigate = (n: Notification) => {
    // Dismiss on click
    dismiss(n.key);

    switch (n.recordModule) {
      case 'Leads':
        setSelectedLeadId(n.recordId);
        setSelectedLeadSource('lead');
        setCurrentView('lead-detail');
        break;
      case 'Prospects':
        setSelectedLeadId(n.recordId);
        setSelectedLeadSource('prospect');
        setCurrentView('lead-detail');
        break;
      case 'Invoices':
        setSelectedInvoiceId(n.recordId);
        setInvoiceReturnView('draft-invoices');
        setCurrentView('invoice-detail');
        break;
    }
    setOpen(false);
  };

  const dismiss = async (key: string) => {
    setNotifications(prev => prev.filter(n => n.key !== key));
    setUnreadCount(prev => Math.max(0, prev - 1));
    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dismiss', key }),
      });
    } catch { /* silent */ }
  };

  const dismissAll = async () => {
    const keys = notifications.map(n => n.key);
    setNotifications([]);
    setUnreadCount(0);
    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dismiss-all', keys }),
      });
    } catch { /* silent */ }
  };

  const formatTimeAgo = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative flex items-center justify-center w-9 h-9 bg-surface border border-border-subtle rounded-xl text-text-muted hover:text-text-primary hover:border-csa-accent/50 transition-colors cursor-pointer"
      >
        <Bell size={16} />
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-error text-white text-[10px] font-bold rounded-full flex items-center justify-center"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      {/* Notification panel */}
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
              <span className="text-sm font-bold text-text-primary">Notifications</span>
              {notifications.length > 0 && (
                <button
                  onClick={dismissAll}
                  className="text-[10px] font-semibold text-text-muted hover:text-error transition-colors cursor-pointer"
                >
                  Clear All
                </button>
              )}
            </div>

            {/* Notifications list */}
            <div className="max-h-[400px] overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <Bell size={24} className="text-text-muted/30 mx-auto mb-2" />
                  <p className="text-xs text-text-muted">No new notifications</p>
                </div>
              ) : (
                <div className="py-1">
                  {notifications.map(n => {
                    const config = TYPE_CONFIG[n.type] || TYPE_CONFIG.lead;
                    const Icon = config.icon;

                    return (
                      <div
                        key={n.key}
                        className="flex items-start gap-3 px-4 py-3 hover:bg-surface-raised transition-colors group"
                      >
                        {/* Icon */}
                        <div className={`w-8 h-8 rounded-lg ${config.bgColor} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                          <Icon size={15} className={config.color} />
                        </div>

                        {/* Content — clickable */}
                        <button
                          onClick={() => handleNavigate(n)}
                          className="flex-1 text-left min-w-0 cursor-pointer"
                        >
                          <p className="text-xs font-semibold text-text-primary group-hover:text-csa-accent transition-colors">
                            {n.title}
                          </p>
                          <p className="text-[11px] text-text-secondary truncate">{n.message}</p>
                          <p className="text-[10px] text-text-muted mt-0.5">{formatTimeAgo(n.timestamp)}</p>
                        </button>

                        {/* Dismiss button */}
                        <button
                          onClick={(e) => { e.stopPropagation(); dismiss(n.key); }}
                          className="p-1 text-text-muted/0 group-hover:text-text-muted hover:!text-error transition-colors cursor-pointer flex-shrink-0 mt-0.5"
                        >
                          <X size={13} />
                        </button>
                      </div>
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
