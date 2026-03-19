'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, UserPlus, Search, Loader2, Shield, ShieldOff, KeyRound,
  ChevronDown, X, Check, AlertCircle, Building2, Pencil, Save,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';
import Pagination from '../Pagination';

interface UserRecord {
  id: number;
  email: string;
  name: string;
  is_active: boolean;
  last_login: string | null;
  created_at: string;
  user_role: string;
  user_role_display: string;
  reseller_name: string;
  reseller_id: string;
}

const ALL_ROLES = [
  { value: 'viewer', label: 'Viewer' },
  { value: 'standard', label: 'Standard User' },
  { value: 'manager', label: 'Reseller Manager' },
  { value: 'ibm', label: 'Int. Business Manager' },
  { value: 'admin', label: 'System Administrator' },
];
const MANAGER_ROLES = ['viewer', 'standard', 'manager'];

export default function UsersView() {
  const { user } = useAppStore();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  // Edit state
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);
  const [editRole, setEditRole] = useState('');
  const [editReseller, setEditReseller] = useState('');
  const [editName, setEditName] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Password reset
  const [resetUserId, setResetUserId] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);
  const [resetMessage, setResetMessage] = useState('');

  // Add user
  const [showAddUser, setShowAddUser] = useState(false);
  const [addName, setAddName] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [addPassword, setAddPassword] = useState('');
  const [addRole, setAddRole] = useState('standard');
  const [addReseller, setAddReseller] = useState(user?.resellerId || '');
  const [addResellerSearch, setAddResellerSearch] = useState('');
  const [addError, setAddError] = useState('');
  const [addingUser, setAddingUser] = useState(false);

  // Resellers for dropdowns
  const [resellers, setResellers] = useState<{ id: string; name: string }[]>([]);

  const isAdmin = user?.role === 'admin' || user?.role === 'ibm';
  const isManager = user?.permissions?.canManageUsers;
  const hasChildResellers = user?.permissions?.canViewChildRecords;

  const availableRoles = isAdmin ? ALL_ROLES : ALL_ROLES.filter(r => MANAGER_ROLES.includes(r.value));

  useEffect(() => {
    loadUsers();
    loadResellers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    let url = '/api/users';
    if (!isAdmin && user?.resellerId) {
      url = `/api/users?resellerId=${user.resellerId}${hasChildResellers ? '&includeChildren=true' : ''}`;
    }
    try {
      const res = await fetch(url);
      const data = await res.json();
      setUsers(data.users || []);
    } catch { setUsers([]); }
    setLoading(false);
  };

  const loadResellers = async () => {
    let url = '/api/resellers';
    if (!isAdmin && user?.resellerId) {
      url = `/api/resellers?resellerId=${user.resellerId}&includeChildren=true`;
    }
    try {
      const res = await fetch(url);
      const data = await res.json();
      setResellers(data.resellers || []);
    } catch {}
  };

  const filtered = useMemo(() => {
    let result = [...users];
    if (statusFilter === 'active') result = result.filter(u => u.is_active);
    if (statusFilter === 'inactive') result = result.filter(u => !u.is_active);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(u =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.reseller_name || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [users, statusFilter, search]);

  const safePage = Math.min(currentPage, Math.max(1, Math.ceil(filtered.length / pageSize)));
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  useEffect(() => { setCurrentPage(1); }, [statusFilter, search]);

  const formatDate = (d: string | null) => {
    if (!d) return 'Never';
    const date = new Date(d);
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
  };

  // Edit handlers
  const startEdit = (u: UserRecord) => {
    setEditingUser(u);
    setEditRole(u.user_role || 'standard');
    setEditReseller(u.reseller_id || '');
    setEditName(u.name);
  };

  const saveEdit = async () => {
    if (!editingUser) return;
    setSavingEdit(true);
    try {
      await fetch(`/api/users/${editingUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName,
          user_role_name: editRole,
          reseller_id: editReseller,
        }),
      });
      setEditingUser(null);
      loadUsers();
    } catch {}
    setSavingEdit(false);
  };

  const toggleActive = async (u: UserRecord) => {
    await fetch(`/api/users/${u.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !u.is_active }),
    });
    loadUsers();
  };

  const resetPassword = async () => {
    if (!resetUserId || !newPassword) return;
    setResettingPassword(true);
    setResetMessage('');
    try {
      const res = await fetch(`/api/users/${resetUserId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword }),
      });
      if (res.ok) {
        setResetMessage('Password reset successfully');
        setNewPassword('');
        setTimeout(() => { setResetUserId(null); setResetMessage(''); }, 1500);
      } else {
        const data = await res.json();
        setResetMessage(data.error || 'Failed');
      }
    } catch { setResetMessage('Failed'); }
    setResettingPassword(false);
  };

  const addUser = async () => {
    if (!addName || !addEmail || !addPassword) return;
    setAddingUser(true);
    setAddError('');
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: addName, email: addEmail, password: addPassword,
          userRoleName: addRole,
          resellerId: addReseller || user?.resellerId || 'csa-internal',
        }),
      });
      const data = await res.json();
      if (!res.ok) { setAddError(data.error); setAddingUser(false); return; }
      setShowAddUser(false);
      setAddName(''); setAddEmail(''); setAddPassword(''); setAddRole('standard');
      loadUsers();
    } catch { setAddError('Failed to create user'); }
    setAddingUser(false);
  };

  if (!isManager && !isAdmin) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-text-muted">You do not have permission to manage users.</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="flex flex-col gap-4 mb-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-text-primary">User Management</h1>
            <button onClick={() => setShowAddUser(true)}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-csa-accent bg-csa-accent/10 border border-csa-accent/30 rounded-xl hover:bg-csa-accent/20 transition-colors cursor-pointer">
              <UserPlus size={14} /> Add User
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[220px] relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search by name, email, or reseller..."
                className="w-full bg-surface border-2 border-border-subtle pl-10 pr-4 py-2.5 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-xl" />
            </div>
            <div className="relative min-w-[130px]">
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                className="w-full bg-surface border-2 border-border-subtle px-4 py-2.5 text-sm text-text-primary outline-none focus:border-csa-accent rounded-xl appearance-none cursor-pointer pr-10">
                <option value="">All Users</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 size={24} className="text-csa-accent animate-spin" />
            <span className="text-xs text-text-muted">Loading users...</span>
          </div>
        ) : filtered.length > 0 ? (
          <>
            <div className="mb-3">
              <Pagination currentPage={safePage} totalItems={filtered.length} pageSize={pageSize} onPageChange={setCurrentPage} />
            </div>
            <div className="border border-border-subtle rounded-xl overflow-hidden">
              <table className="w-full">
                <thead><tr className="bg-surface-raised">
                  <th>Name</th><th>Email</th><th>Role</th><th>Reseller</th><th>Status</th><th>Last Login</th><th>Actions</th>
                </tr></thead>
                <tbody>
                  {paginated.map(u => (
                    <tr key={u.id} className={!u.is_active ? 'opacity-50' : ''}>
                      <td className="font-semibold text-text-primary">{u.name}</td>
                      <td className="text-text-secondary text-sm">{u.email}</td>
                      <td>
                        <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-md ${
                          u.user_role === 'admin' ? 'bg-error/20 text-error'
                            : u.user_role === 'ibm' ? 'bg-csa-purple/20 text-csa-purple'
                            : u.user_role === 'manager' ? 'bg-csa-accent/20 text-csa-accent'
                            : 'bg-surface-raised text-text-muted'
                        }`}>{u.user_role_display || u.user_role}</span>
                      </td>
                      <td className="text-text-muted text-sm">{u.reseller_name || '\u2014'}</td>
                      <td>
                        <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-md ${
                          u.is_active ? 'bg-success/20 text-success' : 'bg-error/20 text-error'
                        }`}>{u.is_active ? 'Active' : 'Inactive'}</span>
                      </td>
                      <td className="text-text-muted text-xs">{formatDate(u.last_login)}</td>
                      <td>
                        <div className="flex items-center gap-1">
                          <button onClick={() => startEdit(u)} className="p-1 text-text-muted hover:text-csa-accent transition-colors cursor-pointer" title="Edit">
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => { setResetUserId(u.id); setNewPassword(''); setResetMessage(''); }}
                            className="p-1 text-text-muted hover:text-warning transition-colors cursor-pointer" title="Reset Password">
                            <KeyRound size={13} />
                          </button>
                          <button onClick={() => toggleActive(u)}
                            className={`p-1 transition-colors cursor-pointer ${u.is_active ? 'text-text-muted hover:text-error' : 'text-text-muted hover:text-success'}`}
                            title={u.is_active ? 'Deactivate' : 'Activate'}>
                            {u.is_active ? <ShieldOff size={13} /> : <Shield size={13} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="text-center py-16">
            <Users size={32} className="text-text-muted mx-auto mb-3" />
            <p className="text-sm text-text-muted">{search ? `No users matching "${search}"` : 'No users found'}</p>
          </div>
        )}
      </div>

      {/* Edit User Modal */}
      {editingUser ? (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setEditingUser(null)}>
          <div className="bg-csa-dark border-2 border-border rounded-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-text-primary">Edit User</h3>
              <button onClick={() => setEditingUser(null)} className="p-1 text-text-muted hover:text-text-primary cursor-pointer"><X size={16} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Name</label>
                <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
                  className="w-full bg-surface border-2 border-border-subtle px-4 py-2.5 text-sm text-text-primary outline-none focus:border-csa-accent rounded-xl" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Role</label>
                <select value={editRole} onChange={e => setEditRole(e.target.value)}
                  className="w-full bg-surface border-2 border-border-subtle px-4 py-2.5 text-sm text-text-primary outline-none focus:border-csa-accent rounded-xl appearance-none cursor-pointer">
                  {availableRoles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              {(isAdmin || hasChildResellers) ? (
                <div>
                  <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Reseller</label>
                  <select value={editReseller} onChange={e => setEditReseller(e.target.value)}
                    className="w-full bg-surface border-2 border-border-subtle px-4 py-2.5 text-sm text-text-primary outline-none focus:border-csa-accent rounded-xl appearance-none cursor-pointer">
                    {resellers.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
              ) : null}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setEditingUser(null)} className="px-4 py-2 text-xs font-semibold text-text-muted bg-surface-raised border border-border-subtle rounded-xl cursor-pointer">Cancel</button>
              <button onClick={saveEdit} disabled={savingEdit}
                className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-success bg-success/10 border border-success/30 rounded-xl cursor-pointer disabled:opacity-50">
                {savingEdit ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Password Reset Modal */}
      {resetUserId ? (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setResetUserId(null)}>
          <div className="bg-csa-dark border-2 border-border rounded-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <KeyRound size={18} className="text-warning" />
              <h3 className="text-base font-bold text-text-primary">Reset Password</h3>
            </div>
            <p className="text-sm text-text-muted mb-3">
              Set a new password for {users.find(u => u.id === resetUserId)?.name || 'this user'}.
            </p>
            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
              placeholder="New password (min 8 chars)"
              className="w-full bg-surface border-2 border-border-subtle px-4 py-2.5 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent rounded-xl mb-3" />
            {resetMessage ? (
              <p className={`text-xs mb-3 ${resetMessage.includes('success') ? 'text-success' : 'text-error'}`}>{resetMessage}</p>
            ) : null}
            <div className="flex justify-end gap-2">
              <button onClick={() => setResetUserId(null)} className="px-4 py-2 text-xs font-semibold text-text-muted bg-surface-raised border border-border-subtle rounded-xl cursor-pointer">Cancel</button>
              <button onClick={resetPassword} disabled={resettingPassword || newPassword.length < 8}
                className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-warning bg-warning/10 border border-warning/30 rounded-xl cursor-pointer disabled:opacity-40">
                {resettingPassword ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />} Reset
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Add User Modal */}
      {showAddUser ? (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowAddUser(false)}>
          <div className="bg-csa-dark border-2 border-border rounded-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2"><UserPlus size={18} className="text-csa-accent" /><h3 className="text-base font-bold text-text-primary">Add User</h3></div>
              <button onClick={() => setShowAddUser(false)} className="p-1 text-text-muted hover:text-text-primary cursor-pointer"><X size={16} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Name *</label>
                <input type="text" value={addName} onChange={e => setAddName(e.target.value)} placeholder="Full name"
                  className="w-full bg-surface border-2 border-border-subtle px-4 py-2.5 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent rounded-xl" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Email *</label>
                <input type="email" value={addEmail} onChange={e => setAddEmail(e.target.value)} placeholder="email@company.com"
                  className="w-full bg-surface border-2 border-border-subtle px-4 py-2.5 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent rounded-xl" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Password *</label>
                <input type="password" value={addPassword} onChange={e => setAddPassword(e.target.value)} placeholder="Min 8 characters"
                  className="w-full bg-surface border-2 border-border-subtle px-4 py-2.5 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent rounded-xl" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Role</label>
                <select value={addRole} onChange={e => setAddRole(e.target.value)}
                  className="w-full bg-surface border-2 border-border-subtle px-4 py-2.5 text-sm text-text-primary outline-none focus:border-csa-accent rounded-xl appearance-none cursor-pointer">
                  {availableRoles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              {(isAdmin || hasChildResellers) ? (
                <div>
                  <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Reseller</label>
                  <select value={addReseller} onChange={e => setAddReseller(e.target.value)}
                    className="w-full bg-surface border-2 border-border-subtle px-4 py-2.5 text-sm text-text-primary outline-none focus:border-csa-accent rounded-xl appearance-none cursor-pointer">
                    {resellers.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                </div>
              ) : null}
              {addError ? <p className="text-xs text-error flex items-center gap-1"><AlertCircle size={12} />{addError}</p> : null}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowAddUser(false)} className="px-4 py-2 text-xs font-semibold text-text-muted bg-surface-raised border border-border-subtle rounded-xl cursor-pointer">Cancel</button>
              <button onClick={addUser} disabled={addingUser || !addName || !addEmail || !addPassword}
                className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-success bg-success/10 border border-success/30 rounded-xl cursor-pointer disabled:opacity-40">
                {addingUser ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />} Create
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
