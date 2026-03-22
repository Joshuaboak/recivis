/**
 * Sidebar — Collapsible navigation panel with animated submenus.
 *
 * Features:
 * - Animated collapse/expand (260px <-> 72px icon-only mode)
 * - Nested submenus for Accounts, Invoices, and Partners sections
 * - Active view indicator with animated accent bar (Framer Motion layoutId)
 * - CRM connection status indicator
 * - User menu (profile, logout) at the bottom
 *
 * Clears chat messages when navigating between views to prevent
 * stale conversation context from leaking across views.
 */

'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  FilePlus,
  FileText,
  BarChart3,
  Building2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Check,
  Ticket,
  Users,
  UserSearch,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';
import UserMenu from './UserMenu';

type ViewId = 'dashboard' | 'leads' | 'lead-detail' | 'accounts' | 'create-account' | 'invoice' | 'draft-invoices' | 'reports' | 'reports-dashboard' | 'coupons' | 'create-coupon' | 'resellers' | 'reseller-detail' | 'partner-resources';

export default function Sidebar() {
  const { currentView, setCurrentView, sidebarOpen, setSidebarOpen, clearMessages } = useAppStore();
  const [accountMenuOpen, setAccountMenuOpen] = useState(
    currentView === 'accounts' || currentView === 'account-detail' || currentView === 'create-account'
  );
  const [invoiceMenuOpen, setInvoiceMenuOpen] = useState(
    currentView === 'invoice' || currentView === 'draft-invoices' || currentView === 'invoice-detail'
  );
  const [reportsMenuOpen, setReportsMenuOpen] = useState(
    currentView === 'reports' || currentView === 'reports-dashboard'
  );
  const [partnerMenuOpen, setPartnerMenuOpen] = useState(
    currentView === 'resellers' || currentView === 'reseller-detail' || currentView === 'partner-resources'
  );

  const handleNavClick = (id: ViewId) => {
    if (id !== currentView) clearMessages();
    setCurrentView(id);
  };

  const isAccountActive = currentView === 'accounts' || currentView === 'account-detail' || currentView === 'create-account';
  const isInvoiceActive = currentView === 'invoice' || currentView === 'draft-invoices' || currentView === 'invoice-detail';

  return (
    <motion.aside
      initial={false}
      animate={{ width: sidebarOpen ? 260 : 72 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      className="h-screen bg-csa-dark border-r-4 border-border flex flex-col relative z-20"
    >
      {/* Logo */}
      <div className="h-16 flex items-center px-4 border-b-4 border-border">
        <motion.div className="flex items-center gap-3 overflow-hidden" animate={{ opacity: 1 }}>
          <img src="/logo.svg" alt="Civil Survey Applications" className="w-6 h-12 flex-shrink-0" />
          <AnimatePresence>
            {sidebarOpen && (
              <motion.div initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: 'auto' }} exit={{ opacity: 0, width: 0 }} className="overflow-hidden whitespace-nowrap">
                <h1 className="text-sm font-bold text-text-primary tracking-tight leading-tight">
                  Civil Survey Applications
                  <span className="block text-sm font-semibold text-csa-accent">Partner Portal</span>
                </h1>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {/* Dashboard */}
        <NavItem id="dashboard" label="Dashboard" icon={LayoutDashboard} active={currentView === 'dashboard'} onClick={() => handleNavClick('dashboard')} open={sidebarOpen} />

        {/* Leads */}
        <NavItem id="leads" label="Leads" icon={UserSearch} active={currentView === 'leads' || currentView === 'lead-detail'} onClick={() => handleNavClick('leads')} open={sidebarOpen} />

        {/* Accounts (with submenu) */}
        <div>
          <button
            onClick={() => {
              if (!sidebarOpen) {
                handleNavClick('accounts');
              } else {
                setAccountMenuOpen(!accountMenuOpen);
                if (!isAccountActive) handleNavClick('accounts');
              }
            }}
            className={`
              w-full flex items-center gap-3 px-3 py-3 text-sm font-semibold
              transition-all duration-150 relative group rounded-xl cursor-pointer
              ${isAccountActive
                ? 'bg-csa-accent/15 text-csa-accent'
                : 'text-text-secondary hover:bg-surface-raised hover:text-text-primary'
              }
            `}
          >
            {isAccountActive && (
              <motion.div layoutId="nav-indicator-acc" className="absolute left-0 top-0 bottom-0 w-1 bg-csa-accent rounded-r" transition={{ duration: 0.2 }} />
            )}
            <Building2 size={20} className="flex-shrink-0" />
            <AnimatePresence>
              {sidebarOpen && (
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 text-left overflow-hidden whitespace-nowrap">
                  Accounts
                </motion.span>
              )}
            </AnimatePresence>
            {sidebarOpen && (
              <ChevronDown size={14} className={`text-text-muted transition-transform ${accountMenuOpen ? 'rotate-180' : ''}`} />
            )}
          </button>

          <AnimatePresence>
            {sidebarOpen && accountMenuOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="overflow-hidden"
              >
                <div className="ml-8 mt-1 space-y-0.5">
                  <SubNavItem label="Browse Accounts" active={currentView === 'accounts' || currentView === 'account-detail'} onClick={() => handleNavClick('accounts')} />
                  <SubNavItem label="Create Account" active={currentView === 'create-account'} onClick={() => handleNavClick('create-account')} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Invoices (with submenu) */}
        <div>
          <button
            onClick={() => {
              if (!sidebarOpen) {
                handleNavClick('invoice');
              } else {
                setInvoiceMenuOpen(!invoiceMenuOpen);
                if (!isInvoiceActive) handleNavClick('invoice');
              }
            }}
            className={`
              w-full flex items-center gap-3 px-3 py-3 text-sm font-semibold
              transition-all duration-150 relative group rounded-xl cursor-pointer
              ${isInvoiceActive
                ? 'bg-csa-accent/15 text-csa-accent'
                : 'text-text-secondary hover:bg-surface-raised hover:text-text-primary'
              }
            `}
          >
            {isInvoiceActive && (
              <motion.div layoutId="nav-indicator-inv" className="absolute left-0 top-0 bottom-0 w-1 bg-csa-accent rounded-r" transition={{ duration: 0.2 }} />
            )}
            <FilePlus size={20} className="flex-shrink-0" />
            <AnimatePresence>
              {sidebarOpen && (
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 text-left overflow-hidden whitespace-nowrap">
                  Invoices
                </motion.span>
              )}
            </AnimatePresence>
            {sidebarOpen && (
              <ChevronDown size={14} className={`text-text-muted transition-transform ${invoiceMenuOpen ? 'rotate-180' : ''}`} />
            )}
          </button>

          {/* Submenu */}
          <AnimatePresence>
            {sidebarOpen && invoiceMenuOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="overflow-hidden"
              >
                <div className="ml-8 mt-1 space-y-0.5">
                  <SubNavItem label="Browse Invoices" active={currentView === 'draft-invoices'} onClick={() => handleNavClick('draft-invoices')} />
                  <SubNavItem label="Invoicing Assistant" active={currentView === 'invoice'} onClick={() => handleNavClick('invoice')} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Reports (with submenu) */}
        {(() => {
          const isReportsActive = currentView === 'reports' || currentView === 'reports-dashboard';
          return (
            <div>
              <button
                onClick={() => {
                  if (!sidebarOpen) { handleNavClick('reports-dashboard'); }
                  else {
                    setReportsMenuOpen(!reportsMenuOpen);
                    if (!isReportsActive) handleNavClick('reports-dashboard');
                  }
                }}
                className={`w-full flex items-center gap-3 px-3 py-3 text-sm font-semibold transition-all duration-150 relative group rounded-xl cursor-pointer ${
                  isReportsActive ? 'bg-csa-accent/15 text-csa-accent' : 'text-text-secondary hover:bg-surface-raised hover:text-text-primary'
                }`}
              >
                {isReportsActive && <motion.div layoutId="nav-indicator-reports" className="absolute left-0 top-0 bottom-0 w-1 bg-csa-accent rounded-r" transition={{ duration: 0.2 }} />}
                <BarChart3 size={20} className="flex-shrink-0" />
                <AnimatePresence>
                  {sidebarOpen && <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 text-left overflow-hidden whitespace-nowrap">Reports</motion.span>}
                </AnimatePresence>
                {sidebarOpen && <ChevronDown size={14} className={`text-text-muted transition-transform ${reportsMenuOpen ? 'rotate-180' : ''}`} />}
              </button>
              <AnimatePresence>
                {sidebarOpen && reportsMenuOpen && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }} className="overflow-hidden">
                    <div className="ml-8 mt-1 space-y-0.5">
                      <SubNavItem label="Dashboard" active={currentView === 'reports-dashboard'} onClick={() => handleNavClick('reports-dashboard')} />
                      <SubNavItem label="AI Assistant" active={currentView === 'reports'} onClick={() => handleNavClick('reports')} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })()}

        {/* Coupons */}
        <NavItem id="coupons" label="Coupons" icon={Ticket} active={currentView === 'coupons' || currentView === 'create-coupon' || currentView === 'coupon-detail'} onClick={() => handleNavClick('coupons')} open={sidebarOpen} />

        {/* Partners (with submenu) */}
        {(() => {
          const isPartnerActive = currentView === 'resellers' || currentView === 'reseller-detail' || currentView === 'partner-resources';
          return (
            <div>
              <button
                onClick={() => {
                  if (!sidebarOpen) { handleNavClick('resellers'); }
                  else {
                    setPartnerMenuOpen(!partnerMenuOpen);
                    if (!isPartnerActive) handleNavClick('resellers');
                  }
                }}
                className={`w-full flex items-center gap-3 px-3 py-3 text-sm font-semibold transition-all duration-150 relative group rounded-xl cursor-pointer ${
                  isPartnerActive ? 'bg-csa-accent/15 text-csa-accent' : 'text-text-secondary hover:bg-surface-raised hover:text-text-primary'
                }`}
              >
                {isPartnerActive && <motion.div layoutId="nav-indicator-partner" className="absolute left-0 top-0 bottom-0 w-1 bg-csa-accent rounded-r" transition={{ duration: 0.2 }} />}
                <Users size={20} className="flex-shrink-0" />
                <AnimatePresence>
                  {sidebarOpen && <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 text-left overflow-hidden whitespace-nowrap">Partners</motion.span>}
                </AnimatePresence>
                {sidebarOpen && <ChevronDown size={14} className={`text-text-muted transition-transform ${partnerMenuOpen ? 'rotate-180' : ''}`} />}
              </button>
              <AnimatePresence>
                {sidebarOpen && partnerMenuOpen && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }} className="overflow-hidden">
                    <div className="ml-8 mt-1 space-y-0.5">
                      <SubNavItem label="Manage Partners" active={currentView === 'resellers' || currentView === 'reseller-detail'} onClick={() => handleNavClick('resellers')} />
                      <SubNavItem label="Partner Resources" active={currentView === 'partner-resources'} onClick={() => handleNavClick('partner-resources')} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })()}
      </nav>

      {/* CRM Status */}
      <div className="px-3 pb-2">
        <div className="flex items-center gap-3 px-3 py-2 text-xs font-semibold text-success">
          <Check size={16} className="flex-shrink-0" />
          <AnimatePresence>
            {sidebarOpen && (
              <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="overflow-hidden whitespace-nowrap">
                CRM Connected
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* User menu */}
      <div className="px-3 pb-4 border-t-2 border-border-subtle pt-3">
        <UserMenu collapsed={!sidebarOpen} />
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="absolute -right-3 top-20 w-6 h-6 bg-surface-raised border-2 border-border flex items-center justify-center text-text-muted hover:text-csa-accent hover:border-csa-accent transition-colors z-30 rounded-full cursor-pointer"
      >
        {sidebarOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
      </button>
    </motion.aside>
  );
}

// Standard nav item
function NavItem({ id, label, icon: Icon, active, onClick, open }: {
  id: string; label: string; icon: React.ComponentType<{ size: number; className?: string }>; active: boolean; onClick: () => void; open: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        w-full flex items-center gap-3 px-3 py-3 text-sm font-semibold
        transition-all duration-150 relative group rounded-xl cursor-pointer
        ${active ? 'bg-csa-accent/15 text-csa-accent' : 'text-text-secondary hover:bg-surface-raised hover:text-text-primary'}
      `}
    >
      {active && (
        <motion.div layoutId="nav-indicator" className="absolute left-0 top-0 bottom-0 w-1 bg-csa-accent rounded-r" transition={{ duration: 0.2 }} />
      )}
      <Icon size={20} className="flex-shrink-0" />
      <AnimatePresence>
        {open && (
          <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="overflow-hidden whitespace-nowrap">
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}

// Sub-nav item (indented)
function SubNavItem({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`
        w-full text-left px-3 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer
        ${active ? 'text-csa-accent bg-csa-accent/10' : 'text-text-muted hover:text-text-secondary hover:bg-surface-raised'}
      `}
    >
      {label}
    </button>
  );
}
