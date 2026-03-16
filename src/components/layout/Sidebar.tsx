'use client';

import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  FilePlus,
  BarChart3,
  Upload,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Check,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';

const navItems = [
  { id: 'dashboard' as const, label: 'Dashboard', icon: LayoutDashboard },
  { id: 'invoice' as const, label: 'Invoices', icon: FilePlus },
  { id: 'upload' as const, label: 'Upload PO', icon: Upload },
  { id: 'reports' as const, label: 'Reports', icon: BarChart3 },
];

export default function Sidebar() {
  const { user, setUser, currentView, setCurrentView, sidebarOpen, setSidebarOpen, clearMessages } = useAppStore();

  const handleNavClick = (id: 'dashboard' | 'invoice' | 'reports' | 'upload') => {
    if (id !== currentView) {
      clearMessages();
    }
    setCurrentView(id);
  };

  return (
    <motion.aside
      initial={false}
      animate={{ width: sidebarOpen ? 260 : 72 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      className="h-screen bg-csa-dark border-r-4 border-border flex flex-col relative z-20"
    >
      {/* Logo */}
      <div className="h-16 flex items-center px-4 border-b-4 border-border">
        <motion.div
          className="flex items-center gap-3 overflow-hidden"
          animate={{ opacity: 1 }}
        >
          <div className="w-10 h-10 bg-csa-accent flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-lg">R</span>
          </div>
          <AnimatePresence>
            {sidebarOpen && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                className="overflow-hidden whitespace-nowrap"
              >
                <h1 className="text-xl font-bold text-text-primary tracking-tight">
                  Re<span className="text-csa-accent">Civis</span>
                </h1>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-1">
        {navItems.map((item) => {
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              className={`
                w-full flex items-center gap-3 px-3 py-3 text-sm font-semibold
                transition-all duration-150 relative group
                ${isActive
                  ? 'bg-csa-accent/15 text-csa-accent'
                  : 'text-text-secondary hover:bg-surface-raised hover:text-text-primary'
                }
              `}
            >
              {isActive && (
                <motion.div
                  layoutId="nav-indicator"
                  className="absolute left-0 top-0 bottom-0 w-1 bg-csa-accent"
                  transition={{ duration: 0.2 }}
                />
              )}
              <item.icon size={20} className="flex-shrink-0" />
              <AnimatePresence>
                {sidebarOpen && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="overflow-hidden whitespace-nowrap"
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          );
        })}
      </nav>

      {/* CRM Status */}
      <div className="px-3 pb-2">
        <div className="flex items-center gap-3 px-3 py-2 text-xs font-semibold text-success">
          <Check size={16} className="flex-shrink-0" />
          <AnimatePresence>
            {sidebarOpen && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="overflow-hidden whitespace-nowrap"
              >
                CRM Connected
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* User section */}
      <div className="px-3 pb-4 space-y-2">
        {user && sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="px-3 py-2 border-t-2 border-border-subtle pt-4"
          >
            <p className="text-xs font-semibold text-text-secondary truncate">{user.name}</p>
            <p className="text-xs text-text-muted truncate">{user.email}</p>
            <span className="inline-block mt-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-csa-accent/20 text-csa-accent">
              {user.role}
            </span>
          </motion.div>
        )}

        <button
          onClick={() => setUser(null)}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-text-muted hover:text-error transition-colors"
        >
          <LogOut size={18} className="flex-shrink-0" />
          {sidebarOpen && <span>Sign Out</span>}
        </button>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="absolute -right-3 top-20 w-6 h-6 bg-surface-raised border-2 border-border flex items-center justify-center text-text-muted hover:text-csa-accent hover:border-csa-accent transition-colors z-30"
      >
        {sidebarOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
      </button>
    </motion.aside>
  );
}
