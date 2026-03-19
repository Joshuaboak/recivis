'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LogOut,
  UserPlus,
  ChevronUp,
  X,
  Loader2,
  Check,
  AlertCircle,
  Users,
  Building2,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';

interface RoleOption {
  value: string;
  label: string;
  description: string;
}

const ALL_ROLES: RoleOption[] = [
  { value: 'viewer', label: 'Viewer', description: 'Read-only access to reports' },
  { value: 'standard', label: 'Standard User', description: 'Create invoices, upload POs' },
  { value: 'manager', label: 'Reseller Manager', description: 'Manage users, create/send invoices' },
  { value: 'ibm', label: 'Int. Business Manager', description: 'Full invoicing access' },
  { value: 'admin', label: 'System Administrator', description: 'Full access to everything' },
];

// Managers can only assign these roles
const MANAGER_ROLES = ['standard', 'manager', 'viewer'];

export default function UserMenu({ collapsed }: { collapsed: boolean }) {
  const { user, setUser } = useAppStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const canManageUsers = user?.permissions?.canManageUsers;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={menuRef}>
      <AnimatePresence>
        {showAddUser && (
          <AddUserModal
            currentUser={user}
            onClose={() => setShowAddUser(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full left-0 right-0 mb-2 bg-csa-dark border-2 border-border rounded-xl overflow-hidden shadow-xl z-50"
          >
            {user && (
              <div className="px-4 py-3 border-b border-border-subtle">
                <p className="text-sm font-semibold text-text-primary truncate">{user.name}</p>
                <p className="text-xs text-text-muted truncate">{user.email}</p>
                <span className="inline-block mt-1.5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-csa-accent/20 text-csa-accent rounded-md">
                  {user.userRoleDisplayName || user.role}
                </span>
                {user.resellerName && (
                  <p className="text-[11px] text-text-muted mt-1">{user.resellerName}</p>
                )}
              </div>
            )}

            <div className="py-1">
              {canManageUsers && (
                <button
                  onClick={() => { setMenuOpen(false); setShowAddUser(true); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-text-secondary hover:bg-surface-raised hover:text-csa-accent transition-colors cursor-pointer"
                >
                  <UserPlus size={16} />
                  Add User
                </button>
              )}
              <button
                onClick={async () => { setMenuOpen(false); await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {}); setUser(null); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-text-secondary hover:bg-surface-raised hover:text-error transition-colors cursor-pointer"
              >
                <LogOut size={16} />
                Sign Out
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={() => setMenuOpen(!menuOpen)}
        className="w-full flex items-center gap-3 px-3 py-3 hover:bg-surface-raised rounded-xl transition-colors cursor-pointer group"
      >
        <div className="w-9 h-9 bg-csa-accent/20 flex items-center justify-center rounded-xl flex-shrink-0">
          <Users size={16} className="text-csa-accent" />
        </div>
        {!collapsed && (
          <>
            <div className="flex-1 text-left min-w-0">
              <p className="text-xs font-semibold text-text-secondary truncate">{user?.name}</p>
              <p className="text-[10px] text-text-muted truncate">{user?.userRoleDisplayName || user?.role}</p>
            </div>
            <ChevronUp
              size={14}
              className={`text-text-muted transition-transform ${menuOpen ? '' : 'rotate-180'}`}
            />
          </>
        )}
      </button>
    </div>
  );
}

// ============================================================
// ADD USER MODAL
// ============================================================

interface ResellerOption {
  id: string;
  name: string;
  region: string;
  partner_category: string;
}

function AddUserModal({ currentUser, onClose }: { currentUser: ReturnType<typeof useAppStore.getState>['user']; onClose: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('standard');
  const [resellerId, setResellerId] = useState(currentUser?.resellerId || '');
  const [resellerSearch, setResellerSearch] = useState('');
  const [resellers, setResellers] = useState<ResellerOption[]>([]);
  const [showResellerDropdown, setShowResellerDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const resellerRef = useRef<HTMLDivElement>(null);

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'ibm';
  const isManager = currentUser?.role === 'manager';
  const isDistributor = currentUser?.reseller?.partnerCategory === 'Distributor' ||
    currentUser?.reseller?.partnerCategory === 'Distributor/Reseller';

  // Determine which roles the current user can assign
  const availableRoles = isAdmin
    ? ALL_ROLES
    : ALL_ROLES.filter(r => MANAGER_ROLES.includes(r.value));

  // Determine if user can change reseller
  const canChangeReseller = isAdmin || (isManager && isDistributor);

  // Load resellers
  useEffect(() => {
    async function loadResellers() {
      try {
        let url = '/api/resellers';
        if (isAdmin) {
          // Admin sees all
          url = '/api/resellers';
        } else if (isManager && isDistributor && currentUser?.resellerId) {
          // Distributor manager sees own + children
          url = `/api/resellers?resellerId=${currentUser.resellerId}&includeChildren=true`;
        } else if (currentUser?.resellerId) {
          // Regular manager sees own only
          url = `/api/resellers?resellerId=${currentUser.resellerId}`;
        }

        const res = await fetch(url);
        const data = await res.json();
        setResellers(data.resellers || []);

        // Set default reseller display
        if (currentUser?.resellerId) {
          const own = (data.resellers || []).find((r: ResellerOption) => r.id === currentUser.resellerId);
          if (own) setResellerSearch(own.name);
        }
      } catch {
        // Non-critical
      }
    }
    loadResellers();
  }, [isAdmin, isManager, isDistributor, currentUser?.resellerId]);

  const filteredResellers = resellerSearch
    ? resellers.filter(r => r.name.toLowerCase().includes(resellerSearch.toLowerCase()))
    : resellers;

  const selectedReseller = resellers.find(r => r.id === resellerId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password) return;

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          password,
          userRoleName: role,
          resellerId: resellerId || currentUser?.resellerId || 'csa-internal',
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to create user');
        return;
      }

      setSuccess(`User ${name} created successfully`);
      setTimeout(() => onClose(), 1500);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ duration: 0.2 }}
        className="bg-csa-dark border-2 border-border rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle sticky top-0 bg-csa-dark z-10">
          <div className="flex items-center gap-2">
            <UserPlus size={18} className="text-csa-accent" />
            <h2 className="text-lg font-bold text-text-primary">Add User</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-surface-raised rounded-xl transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">
              Full Name <span className="text-csa-accent">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="John Smith"
              autoFocus
              className="w-full bg-surface border-2 border-border-subtle px-4 py-2.5 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-xl"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">
              Email <span className="text-csa-accent">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="john@company.com"
              className="w-full bg-surface border-2 border-border-subtle px-4 py-2.5 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-xl"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">
              Password <span className="text-csa-accent">*</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 8 characters"
              className="w-full bg-surface border-2 border-border-subtle px-4 py-2.5 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-xl"
            />
          </div>

          {/* Reseller */}
          <div ref={resellerRef}>
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">
              <Building2 size={12} className="inline mr-1" />
              Reseller
            </label>
            {canChangeReseller ? (
              <div className="relative">
                <input
                  type="text"
                  value={resellerSearch}
                  onChange={(e) => {
                    setResellerSearch(e.target.value);
                    setShowResellerDropdown(true);
                    // Clear selection if they're typing
                    if (selectedReseller?.name !== e.target.value) {
                      setResellerId('');
                    }
                  }}
                  onFocus={() => setShowResellerDropdown(true)}
                  onBlur={() => setTimeout(() => setShowResellerDropdown(false), 150)}
                  placeholder="Search resellers..."
                  className="w-full bg-surface border-2 border-border-subtle px-4 py-2.5 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-xl"
                />
                {showResellerDropdown && filteredResellers.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-csa-dark border-2 border-border-subtle rounded-xl overflow-hidden z-50 shadow-lg max-h-48 overflow-y-auto">
                    {filteredResellers.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setResellerId(r.id);
                          setResellerSearch(r.name);
                          setShowResellerDropdown(false);
                        }}
                        className={`w-full text-left px-4 py-2.5 text-sm transition-colors cursor-pointer ${
                          r.id === resellerId
                            ? 'bg-csa-accent/15 text-csa-accent'
                            : 'text-text-secondary hover:bg-surface-raised hover:text-csa-accent'
                        }`}
                      >
                        <span className="font-semibold">{r.name}</span>
                        {r.region && (
                          <span className="text-text-muted text-xs ml-2">({r.region})</span>
                        )}
                        {r.partner_category && r.partner_category !== 'Internal' && (
                          <span className="text-text-muted text-xs ml-1">— {r.partner_category}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="px-4 py-2.5 bg-surface border-2 border-border-subtle rounded-xl text-sm text-text-secondary">
                {selectedReseller?.name || currentUser?.resellerName || 'Your reseller'}
              </div>
            )}
          </div>

          {/* Role */}
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wider mb-1.5">
              Role
            </label>
            <div className="space-y-2">
              {availableRoles.map((r) => (
                <label
                  key={r.value}
                  className={`flex items-center gap-3 px-4 py-3 border-2 rounded-xl cursor-pointer transition-all ${
                    role === r.value
                      ? 'border-csa-accent bg-csa-accent/10'
                      : 'border-border-subtle hover:border-border'
                  }`}
                >
                  <input
                    type="radio"
                    name="role"
                    value={r.value}
                    checked={role === r.value}
                    onChange={() => setRole(r.value)}
                    className="sr-only"
                  />
                  <div
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      role === r.value ? 'border-csa-accent' : 'border-text-muted'
                    }`}
                  >
                    {role === r.value && (
                      <div className="w-2 h-2 rounded-full bg-csa-accent" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-text-primary">{r.label}</p>
                    <p className="text-xs text-text-muted">{r.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Error / Success */}
          {error && (
            <div className="flex items-center gap-2 px-3 py-2 bg-error/10 border-l-4 border-error rounded-r-xl">
              <AlertCircle size={14} className="text-error flex-shrink-0" />
              <p className="text-xs text-error">{error}</p>
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 px-3 py-2 bg-success/10 border-l-4 border-success rounded-r-xl">
              <Check size={14} className="text-success flex-shrink-0" />
              <p className="text-xs text-success">{success}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-sm font-semibold text-text-secondary border-2 border-border-subtle rounded-xl hover:border-border transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name || !email || !password}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-csa-accent rounded-xl hover:bg-csa-primary transition-colors disabled:opacity-40 cursor-pointer"
            >
              {loading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <UserPlus size={16} />
              )}
              Create User
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
