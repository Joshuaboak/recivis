/**
 * Sidebar — Collapsible navigation panel with animated submenus.
 *
 * Features:
 * - Animated collapse/expand (260px <-> 72px icon-only mode)
 * - Nested submenus for Accounts, Invoices, and Partners sections
 * - Active indicator with animated accent bar (Framer Motion layoutId)
 * - CRM connection status indicator
 * - User menu (profile, logout) at the bottom
 *
 * Every item is a real link built from routes.ts, and the active section is
 * derived from the URL — so a cold deep link into a detail route lights up
 * its parent item and opens the right submenu on the first paint.
 *
 * Clears chat messages when navigating between sections to prevent
 * stale conversation context from leaking across views.
 *
 * Items use <GuardedLink>, so a plain left-click asks before discarding unsaved
 * work elsewhere in the app. Middle-click, ctrl/cmd-click and "copy link
 * address" are untouched — they open a new tab and leave the work alone.
 */

'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
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
  Package,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { buildPath } from '@/lib/routes';
import { GuardedLink } from '@/components/GuardedLink';
import UserMenu from './UserMenu';

const PATHS = {
  dashboard: buildPath('dashboard'),
  leads: buildPath('leads'),
  createLead: buildPath('create-lead'),
  accounts: buildPath('accounts'),
  createAccount: buildPath('create-account'),
  orders: buildPath('draft-invoices'),
  orderAssistant: buildPath('invoice'),
  reports: buildPath('reports'),
  reportsDashboard: buildPath('reports-dashboard'),
  coupons: buildPath('coupons'),
  partners: buildPath('resellers'),
  partnerReports: buildPath('partner-reports'),
  partnerResources: buildPath('partner-resources'),
  assets: buildPath('assets'),
  assetRenewals: buildPath('assets-renewals'),
  assetsExpired: buildPath('assets-expired'),
  assetSubscriptions: buildPath('assets-subscriptions'),
} as const;

/** True when `pathname` is `base` itself or any route nested under it. */
function inSection(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

export default function Sidebar() {
  const { sidebarOpen, setSidebarOpen, clearMessages, user } = useAppStore();
  const pathname = usePathname();

  const isLeadActive = inSection(pathname, PATHS.leads);
  const isAccountActive = inSection(pathname, PATHS.accounts);
  const isInvoiceActive = inSection(pathname, PATHS.orders) || inSection(pathname, PATHS.orderAssistant);

  const [leadsMenuOpen, setLeadsMenuOpen] = useState(isLeadActive);
  const [accountMenuOpen, setAccountMenuOpen] = useState(isAccountActive);
  const [invoiceMenuOpen, setInvoiceMenuOpen] = useState(isInvoiceActive);
  const [reportsMenuOpen, setReportsMenuOpen] = useState(inSection(pathname, PATHS.reports));
  const isAssetsActive = inSection(pathname, PATHS.assets);
  const [assetsMenuOpen, setAssetsMenuOpen] = useState(isAssetsActive);
  const [partnerMenuOpen, setPartnerMenuOpen] = useState(
    inSection(pathname, PATHS.partners) || inSection(pathname, PATHS.partnerResources)
  );

  const handleNavClick = (href: string) => {
    if (href !== pathname) clearMessages();
  };

  return (
    <motion.aside
      initial={false}
      animate={{ width: sidebarOpen ? 260 : 72 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      data-tour="sidebar"
      className="h-screen flex-shrink-0 bg-csa-dark border-r border-border-subtle flex flex-col relative z-20"
    >
      {/* Logo */}
      <div className="h-16 flex items-center px-4 border-b border-border-subtle">
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
        <NavItem href={PATHS.dashboard} label="Dashboard" icon={LayoutDashboard} active={pathname === PATHS.dashboard} onClick={() => handleNavClick(PATHS.dashboard)} open={sidebarOpen} />

        {/* Leads (with submenu) */}
        <div>
          <GuardedLink
            href={PATHS.leads}
            title={sidebarOpen ? undefined : 'Leads'}
            onClick={(e) => {
              if (sidebarOpen) {
                setLeadsMenuOpen(!leadsMenuOpen);
                // Already in this section — the click only works the disclosure.
                if (isLeadActive) { e.preventDefault(); return; }
              }
              handleNavClick(PATHS.leads);
            }}
            className={`
              w-full flex items-center gap-3 px-3 py-3 text-sm font-semibold
              transition-all duration-150 relative group rounded-xl cursor-pointer
              ${isLeadActive
                ? 'bg-csa-accent/15 text-csa-accent'
                : 'text-text-secondary hover:bg-surface-raised hover:text-text-primary'
              }
            `}
          >
            {isLeadActive && (
              <motion.div layoutId="nav-indicator-lead" className="absolute left-0 top-0 bottom-0 w-1 bg-csa-accent rounded-r" transition={{ duration: 0.2 }} />
            )}
            <UserSearch size={20} className="flex-shrink-0" />
            <AnimatePresence>
              {sidebarOpen && (
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 text-left overflow-hidden whitespace-nowrap">
                  Leads
                </motion.span>
              )}
            </AnimatePresence>
            {sidebarOpen && (
              <ChevronDown size={14} className={`text-text-muted transition-transform ${leadsMenuOpen ? 'rotate-180' : ''}`} />
            )}
          </GuardedLink>
          <AnimatePresence>
            {sidebarOpen && leadsMenuOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="overflow-hidden"
              >
                <div className="ml-8 mt-1 space-y-0.5">
                  <SubNavItem label="Browse Leads" href={PATHS.leads} active={isLeadActive && pathname !== PATHS.createLead} onClick={() => handleNavClick(PATHS.leads)} />
                  <SubNavItem label="Create Lead" href={PATHS.createLead} active={pathname === PATHS.createLead} onClick={() => handleNavClick(PATHS.createLead)} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Accounts (with submenu) */}
        <div>
          <GuardedLink
            href={PATHS.accounts}
            title={sidebarOpen ? undefined : 'Accounts'}
            onClick={(e) => {
              if (sidebarOpen) {
                setAccountMenuOpen(!accountMenuOpen);
                if (isAccountActive) { e.preventDefault(); return; }
              }
              handleNavClick(PATHS.accounts);
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
          </GuardedLink>

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
                  <SubNavItem label="Browse Accounts" href={PATHS.accounts} active={isAccountActive && pathname !== PATHS.createAccount} onClick={() => handleNavClick(PATHS.accounts)} />
                  <SubNavItem label="Create Account" href={PATHS.createAccount} active={pathname === PATHS.createAccount} onClick={() => handleNavClick(PATHS.createAccount)} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Assets (with submenu) */}
        <div>
          <GuardedLink
            href={PATHS.assets}
            title={sidebarOpen ? undefined : 'Assets'}
            onClick={(e) => {
              if (sidebarOpen) {
                setAssetsMenuOpen(!assetsMenuOpen);
                if (isAssetsActive) { e.preventDefault(); return; }
              }
              handleNavClick(PATHS.assets);
            }}
            className={`w-full flex items-center gap-3 px-3 py-3 text-sm font-semibold transition-all duration-150 relative group rounded-xl cursor-pointer ${
              isAssetsActive ? 'bg-csa-accent/15 text-csa-accent' : 'text-text-secondary hover:bg-surface-raised hover:text-text-primary'
            }`}
          >
            {isAssetsActive && <motion.div layoutId="nav-indicator-assets" className="absolute left-0 top-0 bottom-0 w-1 bg-csa-accent rounded-r" transition={{ duration: 0.2 }} />}
            <Package size={20} className="flex-shrink-0" />
            <AnimatePresence>
              {sidebarOpen && <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 text-left overflow-hidden whitespace-nowrap">Assets</motion.span>}
            </AnimatePresence>
            {sidebarOpen && <ChevronDown size={14} className={`text-text-muted transition-transform ${assetsMenuOpen ? 'rotate-180' : ''}`} />}
          </GuardedLink>
          <AnimatePresence>
            {sidebarOpen && assetsMenuOpen && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }} className="overflow-hidden">
                <div className="ml-8 mt-1 space-y-0.5">
                  <SubNavItem label="All Assets" href={PATHS.assets} active={pathname === PATHS.assets} onClick={() => handleNavClick(PATHS.assets)} />
                  <SubNavItem label="Due for Renewal" href={PATHS.assetRenewals} active={pathname === PATHS.assetRenewals} onClick={() => handleNavClick(PATHS.assetRenewals)} />
                  <SubNavItem label="Recently Expired" href={PATHS.assetsExpired} active={pathname === PATHS.assetsExpired} onClick={() => handleNavClick(PATHS.assetsExpired)} />
                  {/* Monthly subscriptions are permission-gated, so the entry
                      only appears for partners who can actually use them. */}
                  {user?.permissions?.canMonthlySubscriptions && (
                    <SubNavItem label="Monthly Subscriptions" href={PATHS.assetSubscriptions} active={pathname === PATHS.assetSubscriptions} onClick={() => handleNavClick(PATHS.assetSubscriptions)} />
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Invoices (with submenu) */}
        <div>
          <GuardedLink
            href={PATHS.orderAssistant}
            title={sidebarOpen ? undefined : 'Orders'}
            onClick={(e) => {
              if (sidebarOpen) {
                setInvoiceMenuOpen(!invoiceMenuOpen);
                if (isInvoiceActive) { e.preventDefault(); return; }
              }
              handleNavClick(PATHS.orderAssistant);
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
                  Orders
                </motion.span>
              )}
            </AnimatePresence>
            {sidebarOpen && (
              <ChevronDown size={14} className={`text-text-muted transition-transform ${invoiceMenuOpen ? 'rotate-180' : ''}`} />
            )}
          </GuardedLink>

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
                  <SubNavItem label="Browse Orders" href={PATHS.orders} active={inSection(pathname, PATHS.orders)} onClick={() => handleNavClick(PATHS.orders)} />
                  <SubNavItem label="Order Assistant" href={PATHS.orderAssistant} active={pathname === PATHS.orderAssistant} onClick={() => handleNavClick(PATHS.orderAssistant)} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Reports (with submenu) */}
        {(() => {
          const isReportsActive = inSection(pathname, PATHS.reports);
          return (
            <div>
              <GuardedLink
                href={PATHS.reportsDashboard}
                title={sidebarOpen ? undefined : 'Reports'}
                onClick={(e) => {
                  if (sidebarOpen) {
                    setReportsMenuOpen(!reportsMenuOpen);
                    if (isReportsActive) { e.preventDefault(); return; }
                  }
                  handleNavClick(PATHS.reportsDashboard);
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
              </GuardedLink>
              <AnimatePresence>
                {sidebarOpen && reportsMenuOpen && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }} className="overflow-hidden">
                    <div className="ml-8 mt-1 space-y-0.5">
                      <SubNavItem label="Dashboard" href={PATHS.reportsDashboard} active={pathname === PATHS.reportsDashboard} onClick={() => handleNavClick(PATHS.reportsDashboard)} />
                      <SubNavItem label="AI Assistant" href={PATHS.reports} active={pathname === PATHS.reports} onClick={() => handleNavClick(PATHS.reports)} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })()}

        {/* Coupons */}
        <NavItem href={PATHS.coupons} label="Coupons" icon={Ticket} active={inSection(pathname, PATHS.coupons)} onClick={() => handleNavClick(PATHS.coupons)} open={sidebarOpen} />

        {/* Partners (with submenu) */}
        {(() => {
          const isPartnerActive = inSection(pathname, PATHS.partners) || inSection(pathname, PATHS.partnerResources);
          return (
            <div>
              <GuardedLink
                href={PATHS.partners}
                title={sidebarOpen ? undefined : 'Partners'}
                onClick={(e) => {
                  if (sidebarOpen) {
                    setPartnerMenuOpen(!partnerMenuOpen);
                    if (isPartnerActive) { e.preventDefault(); return; }
                  }
                  handleNavClick(PATHS.partners);
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
              </GuardedLink>
              <AnimatePresence>
                {sidebarOpen && partnerMenuOpen && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }} className="overflow-hidden">
                    <div className="ml-8 mt-1 space-y-0.5">
                      <SubNavItem label="Manage Partners" href={PATHS.partners} active={inSection(pathname, PATHS.partners) && pathname !== PATHS.partnerReports} onClick={() => handleNavClick(PATHS.partners)} />
                      {user?.permissions?.canViewReports && (
                        <SubNavItem label="Partner Reports" href={PATHS.partnerReports} active={pathname === PATHS.partnerReports} onClick={() => handleNavClick(PATHS.partnerReports)} />
                      )}
                      <SubNavItem label="Partner Resources" href={PATHS.partnerResources} active={inSection(pathname, PATHS.partnerResources)} onClick={() => handleNavClick(PATHS.partnerResources)} />
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
        className="absolute -right-3 top-20 w-6 h-6 bg-surface border border-border shadow-[var(--shadow-raised)] flex items-center justify-center text-text-muted hover:text-csa-accent hover:border-csa-accent transition-colors z-30 rounded-full cursor-pointer"
      >
        {sidebarOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
      </button>
    </motion.aside>
  );
}

// Standard nav item
function NavItem({ href, label, icon: Icon, active, onClick, open }: {
  href: string; label: string; icon: React.ComponentType<{ size: number; className?: string }>; active: boolean; onClick: () => void; open: boolean;
}) {
  return (
    <GuardedLink
      href={href}
      onClick={onClick}
      title={open ? undefined : label}
      className={`
        w-full flex items-center gap-3 px-3 py-3 text-sm font-semibold
        transition-all duration-150 relative group rounded-xl cursor-pointer
        ${active ? 'bg-csa-accent/15 text-csa-accent' : 'text-text-secondary hover:bg-surface-raised hover:text-text-primary'}
      `}
    >
      {/* No left rule. The tinted fill plus the accent icon and label already carry the
          active state, and a full-height 4px bar on every item was what made the menu
          read as blocky. */}
      <Icon size={20} className="flex-shrink-0" />
      <AnimatePresence>
        {open && (
          <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="overflow-hidden whitespace-nowrap">
            {label}
          </motion.span>
        )}
      </AnimatePresence>
    </GuardedLink>
  );
}

// Sub-nav item (indented)
function SubNavItem({ label, href, active, onClick }: { label: string; href: string; active: boolean; onClick: () => void }) {
  return (
    <GuardedLink
      href={href}
      onClick={onClick}
      className={`
        block w-full text-left px-3 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer
        ${active ? 'text-csa-accent bg-csa-accent/10' : 'text-text-muted hover:text-text-secondary hover:bg-surface-raised'}
      `}
    >
      {label}
    </GuardedLink>
  );
}
