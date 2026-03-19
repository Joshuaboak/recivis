'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Users, UserPlus, Search, Loader2, Shield, ShieldOff, KeyRound,
  ChevronDown, X, AlertCircle, Building2, Pencil, Save,
  ArrowLeft, Globe, DollarSign, Mail, ExternalLink,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';
import Pagination from '../Pagination';

interface UserRecord {
  id: number; email: string; name: string; is_active: boolean;
  last_login: string | null; created_at: string; user_role: string;
  user_role_display: string; reseller_name: string; reseller_id: string;
}

interface ResellerItem {
  id: string; name: string; region: string; currency: string;
  partner_category: string; distributor_id: string | null; user_count?: number;
}

const ALL_ROLES = [
  { value: 'viewer', label: 'Viewer' },
  { value: 'standard', label: 'Standard User' },
  { value: 'manager', label: 'Reseller Manager' },
  { value: 'ibm', label: 'Int. Business Manager' },
  { value: 'admin', label: 'System Administrator' },
];
const MANAGER_ROLES = ['viewer', 'standard', 'manager'];
const REGION_LABELS: Record<string, string> = { AU: 'Australia', EU: 'Europe', NA: 'North America', AS: 'Asia', NZ: 'New Zealand', WW: 'Worldwide', AF: 'Africa' };
const REGIONS = Object.entries(REGION_LABELS);
const CURRENCIES = ['AUD', 'USD', 'EUR', 'INR', 'GBP', 'NZD'];
const PARTNER_CATEGORIES = ['Reseller', 'Distributor', 'Distributor/Reseller', 'Affiliate', 'Platinum Partner'];

const inputCls = "w-full bg-csa-dark border border-border-subtle px-3 py-2 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-lg";
const selectCls = "w-full bg-csa-dark border border-border-subtle px-3 py-2 text-sm text-text-primary outline-none focus:border-csa-accent rounded-lg appearance-none cursor-pointer pr-8";

// ============================================================
// MAIN COMPONENT — routes between list and detail
// ============================================================
export default function ResellerManagementView() {
  const { user, currentView, selectedResellerId, setCurrentView, setSelectedResellerId } = useAppStore();
  const isAdmin = user?.role === 'admin' || user?.role === 'ibm';
  const isManager = user?.permissions?.canManageUsers;
  const hasChildResellers = user?.permissions?.canViewChildRecords;

  useEffect(() => {
    if (currentView === 'resellers' && !isAdmin && !hasChildResellers && user?.resellerId) {
      setSelectedResellerId(user.resellerId);
      setCurrentView('reseller-detail');
    }
  }, [currentView, isAdmin, hasChildResellers, user?.resellerId, setSelectedResellerId, setCurrentView]);

  if (!isManager && !isAdmin) {
    return <div className="flex items-center justify-center h-full"><p className="text-text-muted">You do not have permission to manage partners.</p></div>;
  }

  if (currentView === 'reseller-detail' && selectedResellerId) return <ResellerDetailView />;
  return <ResellerListView />;
}

// ============================================================
// RESELLER LIST
// ============================================================
function ResellerListView() {
  const { user, setCurrentView, setSelectedResellerId } = useAppStore();
  const isAdmin = user?.role === 'admin' || user?.role === 'ibm';

  const [resellers, setResellers] = useState<ResellerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 24;

  // Create partner
  const [showCreate, setShowCreate] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [newP, setNewP] = useState<Record<string, any>>({
    Name: '', Email: '', Region: 'AU', Currency: 'AUD', Partner_Category: 'Reseller',
    Reseller_First_Name: '', Reseller_Last_Name: '',
    Street_Address: '', City: '', State: '', Post_Code: '', Country: '',
    Reseller_Sale: '', Distributor_Percentage_Rate: '', Additional_Tax_Infromation: '',
    Direct_Customer_Contact: false, Can_Purchase_on_Credit: false,
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Resellers for distributor lookup
  const [allResellers, setAllResellers] = useState<ResellerItem[]>([]);

  useEffect(() => {
    setLoading(true);
    let url = '/api/resellers';
    if (!isAdmin && user?.resellerId) url = `/api/resellers?resellerId=${user.resellerId}&includeChildren=true`;
    fetch(url).then(r => r.json()).then(d => { setResellers(d.resellers || []); setAllResellers(d.resellers || []); }).catch(() => setResellers([])).finally(() => setLoading(false));
  }, [isAdmin, user?.resellerId]);

  const regions = useMemo(() => [...new Set(resellers.map(r => r.region).filter(Boolean))].sort(), [resellers]);
  const filtered = useMemo(() => {
    let result = [...resellers];
    if (regionFilter) result = result.filter(r => r.region === regionFilter);
    if (search) { const q = search.toLowerCase(); result = result.filter(r => r.name.toLowerCase().includes(q)); }
    return result;
  }, [resellers, regionFilter, search]);

  const safePage = Math.min(currentPage, Math.max(1, Math.ceil(filtered.length / pageSize)));
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  useEffect(() => { setCurrentPage(1); }, [search, regionFilter]);

  const openReseller = (id: string) => { setSelectedResellerId(id); setCurrentView('reseller-detail'); };

  const createReseller = async () => {
    if (!String(newP.Name).trim()) return;
    setCreating(true); setCreateError('');
    try {
      // Clean booleans and numbers
      const data = { ...newP };
      if (data.Reseller_Sale) data.Reseller_Sale = parseFloat(data.Reseller_Sale);
      if (data.Distributor_Percentage_Rate) data.Distributor_Percentage_Rate = parseFloat(data.Distributor_Percentage_Rate);
      if (data.Distributor) data.Distributor = { id: data.Distributor };

      const res = await fetch('/api/resellers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const result = await res.json();
      if (result.id) { setShowCreate(false); openReseller(result.id); }
      else setCreateError(result.error || 'Failed to create partner');
    } catch { setCreateError('Failed to create partner'); }
    setCreating(false);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="flex flex-col gap-4 mb-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-text-primary">Partners</h1>
            {isAdmin ? (
              <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-csa-accent bg-csa-accent/10 border border-csa-accent/30 rounded-xl hover:bg-csa-accent/20 transition-colors cursor-pointer">
                <Building2 size={14} /> Add Partner
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[220px] relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search partners..."
                className="w-full bg-surface border-2 border-border-subtle pl-10 pr-4 py-2.5 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-xl" />
            </div>
            {isAdmin && regions.length > 1 && (
              <div className="relative min-w-[160px]">
                <select value={regionFilter} onChange={e => setRegionFilter(e.target.value)}
                  className="w-full bg-surface border-2 border-border-subtle px-4 py-2.5 text-sm text-text-primary outline-none focus:border-csa-accent rounded-xl appearance-none cursor-pointer pr-10">
                  <option value="">All Regions</option>
                  {regions.map(r => <option key={r} value={r}>{REGION_LABELS[r] || r}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
              </div>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 size={24} className="text-csa-accent animate-spin" /><span className="text-xs text-text-muted">Loading partners...</span>
          </div>
        ) : filtered.length > 0 ? (
          <>
            <div className="mb-3"><Pagination currentPage={safePage} totalItems={filtered.length} pageSize={pageSize} onPageChange={setCurrentPage} /></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {paginated.map(r => (
                <motion.button key={r.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={() => openReseller(r.id)}
                  className="bg-surface border border-border-subtle rounded-xl px-5 py-4 text-left hover:border-csa-accent/50 transition-colors cursor-pointer group">
                  <div className="flex items-center gap-3 mb-2">
                    <Building2 size={18} className="text-csa-accent flex-shrink-0" />
                    <span className="text-sm font-bold text-text-primary group-hover:text-csa-accent transition-colors truncate">{r.name}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-text-muted">
                    <span>{REGION_LABELS[r.region] || r.region || '\u2014'}</span>
                    <span className="font-semibold text-text-secondary">{r.user_count || 0} users</span>
                  </div>
                  <div className="text-[10px] text-text-muted mt-1">{r.partner_category} &bull; {r.currency}</div>
                </motion.button>
              ))}
            </div>
          </>
        ) : (
          <div className="text-center py-16">
            <Building2 size={32} className="text-text-muted mx-auto mb-3" />
            <p className="text-sm text-text-muted">{search ? `No partners matching "${search}"` : 'No partners found'}</p>
          </div>
        )}
      </div>

      {/* Create Partner Modal */}
      {showCreate ? (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-csa-dark border-2 border-border rounded-2xl w-full max-w-2xl p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2"><Building2 size={18} className="text-csa-accent" /><h3 className="text-lg font-bold text-text-primary">Add Partner</h3></div>
              <button onClick={() => setShowCreate(false)} className="p-1 text-text-muted hover:text-text-primary cursor-pointer"><X size={16} /></button>
            </div>
            <div className="max-h-[65vh] overflow-y-auto pr-1 space-y-5">
              <PartnerFormFields values={newP} onChange={setNewP} allResellers={allResellers} />
              {createError ? <p className="text-xs text-error flex items-center gap-1"><AlertCircle size={12} />{createError}</p> : null}
            </div>
            <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-border-subtle">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-xs font-semibold text-text-muted bg-surface-raised border border-border-subtle rounded-xl cursor-pointer">Cancel</button>
              <button onClick={createReseller} disabled={creating || !String(newP.Name).trim()}
                className="flex items-center gap-2 px-5 py-2 text-xs font-semibold text-success bg-success/10 border border-success/30 rounded-xl cursor-pointer disabled:opacity-40">
                {creating ? <Loader2 size={14} className="animate-spin" /> : <Building2 size={14} />} Create Partner
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ============================================================
// SHARED FORM FIELDS
// ============================================================
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PartnerFormFields({ values, onChange, allResellers }: { values: Record<string, any>; onChange: (v: Record<string, any>) => void; allResellers: ResellerItem[] }) {
  const set = (key: string, val: unknown) => onChange({ ...values, [key]: val });
  const [distSearch, setDistSearch] = useState('');
  const distributors = allResellers.filter(r => r.partner_category?.includes('Distributor'));
  const filteredDist = distSearch ? distributors.filter(d => d.name.toLowerCase().includes(distSearch.toLowerCase())) : distributors;
  const selectedDist = allResellers.find(r => r.id === values.Distributor);

  return (
    <>
      {/* Partner Details */}
      <div>
        <h3 className="text-sm font-bold text-text-primary mb-3 flex items-center gap-2"><Building2 size={14} className="text-csa-accent" /> Partner Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Partner Name *</label>
            <input type="text" value={values.Name || ''} onChange={e => set('Name', e.target.value)} placeholder="Company name" className={inputCls} />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Region</label>
            <div className="relative">
              <select value={values.Region || 'AU'} onChange={e => set('Region', e.target.value)} className={selectCls}>
                {REGIONS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Currency</label>
            <div className="relative">
              <select value={values.Currency || 'AUD'} onChange={e => set('Currency', e.target.value)} className={selectCls}>
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Partner Category</label>
            <div className="relative">
              <select value={values.Partner_Category || 'Reseller'} onChange={e => set('Partner_Category', e.target.value)} className={selectCls}>
                {PARTNER_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Distributor</label>
            <div className="relative">
              <input type="text" value={selectedDist ? selectedDist.name : distSearch} placeholder="Search distributors..."
                onChange={e => { setDistSearch(e.target.value); set('Distributor', ''); }}
                onFocus={() => { if (selectedDist) { setDistSearch(selectedDist.name); set('Distributor', ''); } }}
                className={inputCls} />
              {!values.Distributor && distSearch && filteredDist.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 z-10 bg-csa-dark border border-border rounded-xl max-h-[150px] overflow-y-auto shadow-lg">
                  <button onClick={() => { set('Distributor', ''); setDistSearch(''); }}
                    className="w-full text-left px-3 py-2 text-xs text-text-muted hover:bg-surface-raised transition-colors cursor-pointer italic">None</button>
                  {filteredDist.map(d => (
                    <button key={d.id} onClick={() => { set('Distributor', d.id); setDistSearch(''); }}
                      className="w-full text-left px-3 py-2 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-raised transition-colors cursor-pointer">{d.name}</button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Primary Contact */}
      <div>
        <h3 className="text-sm font-bold text-text-primary mb-3 flex items-center gap-2"><Users size={14} className="text-csa-accent" /> Primary Contact</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">First Name</label>
            <input type="text" value={values.Reseller_First_Name || ''} onChange={e => set('Reseller_First_Name', e.target.value)} placeholder="First name" className={inputCls} />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Last Name</label>
            <input type="text" value={values.Reseller_Last_Name || ''} onChange={e => set('Reseller_Last_Name', e.target.value)} placeholder="Last name" className={inputCls} />
          </div>
          <div className="md:col-span-2">
            <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Email</label>
            <input type="email" value={values.Email || ''} onChange={e => set('Email', e.target.value)} placeholder="contact@company.com" className={inputCls} />
          </div>
        </div>
      </div>

      {/* Address */}
      <div>
        <h3 className="text-sm font-bold text-text-primary mb-3 flex items-center gap-2"><Globe size={14} className="text-csa-accent" /> Address</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Street</label>
            <input type="text" value={values.Street_Address || ''} onChange={e => set('Street_Address', e.target.value)} placeholder="Street address" className={inputCls} />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">City</label>
            <input type="text" value={values.City || ''} onChange={e => set('City', e.target.value)} className={inputCls} />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">State</label>
              <input type="text" value={values.State || ''} onChange={e => set('State', e.target.value)} className={inputCls} />
            </div>
            <div className="flex-1">
              <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Post Code</label>
              <input type="text" value={values.Post_Code || ''} onChange={e => set('Post_Code', e.target.value)} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Country</label>
            <input type="text" value={values.Country || ''} onChange={e => set('Country', e.target.value)} className={inputCls} />
          </div>
        </div>
      </div>

      {/* Commercial */}
      <div>
        <h3 className="text-sm font-bold text-text-primary mb-3 flex items-center gap-2"><DollarSign size={14} className="text-csa-accent" /> Commercial</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Reseller Percentage</label>
            <div className="relative">
              <input type="text" inputMode="decimal" value={values.Reseller_Sale || ''} onChange={e => set('Reseller_Sale', e.target.value.replace(/[^\d.]/g, ''))} placeholder="e.g. 10" className={inputCls} />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-muted">%</span>
            </div>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Distributor Percentage</label>
            <div className="relative">
              <input type="text" inputMode="decimal" value={values.Distributor_Percentage_Rate || ''} onChange={e => set('Distributor_Percentage_Rate', e.target.value.replace(/[^\d.]/g, ''))} placeholder="e.g. 5" className={inputCls} />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-muted">%</span>
            </div>
          </div>
          <div className="md:col-span-2">
            <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Additional Tax Information / Tax ID</label>
            <input type="text" value={values.Additional_Tax_Infromation || ''} onChange={e => set('Additional_Tax_Infromation', e.target.value)} placeholder="Tax ID or registration number" className={inputCls} />
          </div>
        </div>
      </div>

      {/* Settings */}
      <div>
        <h3 className="text-sm font-bold text-text-primary mb-3 flex items-center gap-2"><Shield size={14} className="text-csa-accent" /> Settings</h3>
        <div className="space-y-3">
          <div className="bg-surface border border-border-subtle rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-text-primary">Customer Communication Preference</p>
                <p className="text-xs text-text-muted mt-0.5">Controls if invoices and licence keys are sent directly to the customer or to the reseller</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => set('Direct_Customer_Contact', true)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${values.Direct_Customer_Contact ? 'bg-csa-accent/15 text-csa-accent border-csa-accent/40' : 'text-text-muted border-border-subtle hover:border-border'}`}>
                  Direct to Customer
                </button>
                <button onClick={() => set('Direct_Customer_Contact', false)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${!values.Direct_Customer_Contact ? 'bg-csa-accent/15 text-csa-accent border-csa-accent/40' : 'text-text-muted border-border-subtle hover:border-border'}`}>
                  Via Reseller
                </button>
              </div>
            </div>
          </div>
          <label className="flex items-center gap-3 px-4 py-3 bg-surface border border-border-subtle rounded-xl cursor-pointer">
            <input type="checkbox" checked={!!values.Can_Purchase_on_Credit} onChange={e => set('Can_Purchase_on_Credit', e.target.checked)}
              className="w-4 h-4 rounded accent-csa-accent cursor-pointer" />
            <div>
              <p className="text-sm font-semibold text-text-primary">Can Purchase on Credit</p>
              <p className="text-xs text-text-muted">Allow this partner to purchase on credit terms</p>
            </div>
          </label>
        </div>
      </div>
    </>
  );
}

// ============================================================
// RESELLER DETAIL
// ============================================================
function ResellerDetailView() {
  const { user, selectedResellerId, setCurrentView } = useAppStore();
  const isAdmin = user?.role === 'admin' || user?.role === 'ibm';
  const hasChildResellers = user?.permissions?.canViewChildRecords;
  const availableRoles = isAdmin ? ALL_ROLES : ALL_ROLES.filter(r => MANAGER_ROLES.includes(r.value));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [reseller, setReseller] = useState<Record<string, any> | null>(null);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [allResellers, setAllResellers] = useState<ResellerItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit reseller
  const [editingReseller, setEditingReseller] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editFields, setEditFields] = useState<Record<string, any>>({});
  const [savingReseller, setSavingReseller] = useState(false);

  // User modals
  const [showAddUser, setShowAddUser] = useState(false);
  const [addName, setAddName] = useState(''); const [addEmail, setAddEmail] = useState('');
  const [addPassword, setAddPassword] = useState(''); const [addRole, setAddRole] = useState('standard');
  const [addError, setAddError] = useState(''); const [addingUser, setAddingUser] = useState(false);

  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);
  const [editUserName, setEditUserName] = useState(''); const [editUserRole, setEditUserRole] = useState('');
  const [savingUser, setSavingUser] = useState(false);

  const [resetUserId, setResetUserId] = useState<number | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resettingPw, setResettingPw] = useState(false); const [resetMsg, setResetMsg] = useState('');

  const [userSearch, setUserSearch] = useState('');
  const [userPage, setUserPage] = useState(1);

  useEffect(() => { if (selectedResellerId) loadData(); }, [selectedResellerId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [resRes, resellerListRes] = await Promise.all([
        fetch(`/api/resellers/${selectedResellerId}`).then(r => r.json()),
        fetch('/api/resellers').then(r => r.json()),
      ]);
      setReseller(resRes.reseller);
      setUsers(resRes.users || []);
      setAllResellers(resellerListRes.resellers || []);
    } catch {}
    setLoading(false);
  };

  const goBack = () => {
    if (!isAdmin && !hasChildResellers) setCurrentView('dashboard');
    else setCurrentView('resellers');
  };

  const crmLink = `https://crm.zoho.com.au/crm/org7002802215/tab/Resellers/${selectedResellerId}`;

  const formatDate = (d: string | null) => {
    if (!d) return 'Never';
    const date = new Date(d);
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
  };

  const startEditReseller = () => {
    if (!reseller) return;
    setEditFields({
      Name: reseller.Name || '', Email: reseller.Email || '',
      Region: reseller.Region || 'AU', Currency: reseller.Currency || 'AUD',
      Partner_Category: reseller.Partner_Category || 'Reseller',
      Reseller_First_Name: reseller.Reseller_First_Name || '', Reseller_Last_Name: reseller.Reseller_Last_Name || '',
      Street_Address: reseller.Street_Address || '', City: reseller.City || '',
      State: reseller.State || '', Post_Code: reseller.Post_Code || '', Country: reseller.Country || '',
      Reseller_Sale: String(reseller.Reseller_Sale ?? ''),
      Distributor_Percentage_Rate: String(reseller.Distributor_Percentage_Rate ?? ''),
      Additional_Tax_Infromation: reseller.Additional_Tax_Infromation || '',
      Direct_Customer_Contact: !!reseller.Direct_Customer_Contact,
      Can_Purchase_on_Credit: !!reseller.Can_Purchase_on_Credit,
      Distributor: reseller.Distributor?.id || '',
    });
    setEditingReseller(true);
  };

  const saveReseller = async () => {
    setSavingReseller(true);
    try {
      const data = { ...editFields };
      if (data.Reseller_Sale) data.Reseller_Sale = parseFloat(data.Reseller_Sale);
      else delete data.Reseller_Sale;
      if (data.Distributor_Percentage_Rate) data.Distributor_Percentage_Rate = parseFloat(data.Distributor_Percentage_Rate);
      else delete data.Distributor_Percentage_Rate;
      if (data.Distributor) data.Distributor = { id: data.Distributor };
      else data.Distributor = null;

      await fetch(`/api/resellers/${selectedResellerId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      });
      setEditingReseller(false);
      loadData();
    } catch {}
    setSavingReseller(false);
  };

  // User actions
  const addUser = async () => {
    if (!addName || !addEmail || !addPassword) return;
    setAddingUser(true); setAddError('');
    try {
      const res = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: addName, email: addEmail, password: addPassword, userRoleName: addRole, resellerId: selectedResellerId }) });
      const data = await res.json();
      if (!res.ok) { setAddError(data.error); setAddingUser(false); return; }
      setShowAddUser(false); setAddName(''); setAddEmail(''); setAddPassword(''); setAddRole('standard');
      loadData();
    } catch { setAddError('Failed'); }
    setAddingUser(false);
  };

  const saveUser = async () => {
    if (!editingUser) return;
    setSavingUser(true);
    await fetch(`/api/users/${editingUser.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editUserName, user_role_name: editUserRole }) });
    setEditingUser(null); loadData(); setSavingUser(false);
  };

  const toggleActive = async (u: UserRecord) => {
    await fetch(`/api/users/${u.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: !u.is_active }) });
    loadData();
  };

  const resetPassword = async () => {
    if (!resetUserId || !newPassword) return;
    setResettingPw(true); setResetMsg('');
    const res = await fetch(`/api/users/${resetUserId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: newPassword }) });
    setResetMsg(res.ok ? 'Password reset successfully' : 'Failed');
    if (res.ok) { setNewPassword(''); setTimeout(() => { setResetUserId(null); setResetMsg(''); }, 1500); }
    setResettingPw(false);
  };

  const filteredUsers = useMemo(() => {
    if (!userSearch) return users;
    const q = userSearch.toLowerCase();
    return users.filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }, [users, userSearch]);

  const userSafePage = Math.min(userPage, Math.max(1, Math.ceil(filteredUsers.length / 10)));
  const paginatedUsers = filteredUsers.slice((userSafePage - 1) * 10, userSafePage * 10);

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 size={24} className="text-csa-accent animate-spin" /></div>;
  if (!reseller) return <div className="flex flex-col items-center justify-center h-full gap-3"><p className="text-text-muted">Partner not found</p><button onClick={goBack} className="text-csa-accent text-sm cursor-pointer">Go back</button></div>;

  const distributor = reseller.Distributor as { name?: string; id?: string } | null;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button onClick={goBack} className="w-9 h-9 flex items-center justify-center bg-surface-raised rounded-xl hover:bg-surface-overlay transition-colors cursor-pointer">
            <ArrowLeft size={18} className="text-text-secondary" />
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-text-primary">{reseller.Name}</h1>
            <p className="text-sm text-text-muted">{REGION_LABELS[reseller.Region] || reseller.Region} &bull; {reseller.Partner_Category}</p>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && !editingReseller ? (
              <button onClick={startEditReseller} className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-warning bg-warning/10 border border-warning/30 rounded-xl hover:bg-warning/20 transition-colors cursor-pointer">
                <Pencil size={14} /> Edit
              </button>
            ) : null}
            <a href={crmLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-csa-accent bg-csa-accent/10 border border-csa-accent/30 rounded-xl hover:bg-csa-accent/20 transition-colors cursor-pointer">
              <ExternalLink size={14} /> Open in CRM
            </a>
          </div>
        </div>

        {/* Edit Form or Info Cards */}
        {editingReseller ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-surface border border-csa-accent/40 rounded-xl p-5 mb-8">
            <PartnerFormFields values={editFields} onChange={setEditFields} allResellers={allResellers} />
            <div className="flex gap-2 mt-5 pt-4 border-t border-border-subtle">
              <button onClick={() => setEditingReseller(false)} className="px-4 py-2 text-xs font-semibold text-text-muted bg-surface-raised border border-border-subtle rounded-xl cursor-pointer">Cancel</button>
              <button onClick={saveReseller} disabled={savingReseller} className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-success bg-success/10 border border-success/30 rounded-xl cursor-pointer disabled:opacity-50">
                {savingReseller ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            <InfoCard label="Primary Contact" value={[reseller.Reseller_First_Name, reseller.Reseller_Last_Name].filter(Boolean).join(' ') || '\u2014'} icon={<Users size={14} />} />
            <InfoCard label="Email" value={reseller.Email || '\u2014'} icon={<Mail size={14} />} />
            <InfoCard label="Region" value={REGION_LABELS[reseller.Region] || reseller.Region || '\u2014'} icon={<Globe size={14} />} />
            <InfoCard label="Currency" value={reseller.Currency || '\u2014'} icon={<DollarSign size={14} />} />
            <InfoCard label="Partner Category" value={reseller.Partner_Category || '\u2014'} icon={<Building2 size={14} />} />
            {distributor ? <InfoCard label="Distributor" value={distributor.name || '\u2014'} icon={<Building2 size={14} />} /> : null}
            <InfoCard label="Reseller Percentage" value={reseller.Reseller_Sale != null ? `${reseller.Reseller_Sale}%` : '\u2014'} icon={<DollarSign size={14} />} />
            {reseller.Distributor_Percentage_Rate != null ? <InfoCard label="Distributor Percentage" value={`${reseller.Distributor_Percentage_Rate}%`} icon={<DollarSign size={14} />} /> : null}
            {reseller.Additional_Tax_Infromation ? <InfoCard label="Tax Information" value={reseller.Additional_Tax_Infromation} icon={<DollarSign size={14} />} /> : null}
            <div className="bg-surface border border-border-subtle rounded-xl px-4 py-3 group relative">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-text-muted uppercase tracking-wider mb-1"><Mail size={14} />Customer Communication</div>
              <p className="text-sm text-text-primary">{reseller.Direct_Customer_Contact ? 'Direct to Customer' : 'Via Reseller'}</p>
              <div className="absolute left-0 bottom-full mb-1 z-10 bg-csa-dark border border-border rounded-lg px-3 py-2 text-[10px] text-text-secondary whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity shadow-lg">
                Controls if invoices and keys are sent directly to the customer or not
              </div>
            </div>
            <InfoCard label="Can Purchase on Credit" value={reseller.Can_Purchase_on_Credit ? 'Yes' : 'No'} icon={<DollarSign size={14} />} />
            {reseller.Street_Address || reseller.City ? (
              <InfoCard label="Address" value={[reseller.Street_Address, reseller.City, reseller.State, reseller.Post_Code, reseller.Country].filter(Boolean).join(', ')} icon={<Globe size={14} />} />
            ) : null}
            {reseller.Owner ? <InfoCard label="CSA Account Manager" value={reseller.Owner?.name || '\u2014'} icon={<Users size={14} />} /> : null}
            <InfoCard label="Portal Users" value={String(users.length)} icon={<Users size={14} />} />
          </motion.div>
        )}

        {/* Users Section */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-text-primary flex items-center gap-2"><Users size={18} className="text-csa-accent" /> Users ({users.length})</h2>
            <button onClick={() => setShowAddUser(true)} className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-csa-accent bg-csa-accent/10 border border-csa-accent/30 rounded-xl hover:bg-csa-accent/20 transition-colors cursor-pointer">
              <UserPlus size={13} /> Add User
            </button>
          </div>
          <div className="mb-3 max-w-sm relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input type="text" value={userSearch} onChange={e => setUserSearch(e.target.value)} placeholder="Search users..."
              className="w-full bg-surface border-2 border-border-subtle pl-10 pr-4 py-2.5 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-xl" />
          </div>
          {filteredUsers.length > 0 ? (
            <>
              <div className="border border-border-subtle rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead><tr className="bg-surface-raised"><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last Login</th><th>Actions</th></tr></thead>
                  <tbody>
                    {paginatedUsers.map(u => (
                      <tr key={u.id} className={!u.is_active ? 'opacity-50' : ''}>
                        <td className="font-semibold text-text-primary">{u.name}</td>
                        <td className="text-text-secondary text-sm">{u.email}</td>
                        <td><span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-md ${
                          u.user_role === 'admin' ? 'bg-error/20 text-error' : u.user_role === 'ibm' ? 'bg-csa-purple/20 text-csa-purple' : u.user_role === 'manager' ? 'bg-csa-accent/20 text-csa-accent' : 'bg-surface-raised text-text-muted'
                        }`}>{u.user_role_display || u.user_role}</span></td>
                        <td><span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-md ${u.is_active ? 'bg-success/20 text-success' : 'bg-error/20 text-error'}`}>{u.is_active ? 'Active' : 'Inactive'}</span></td>
                        <td className="text-text-muted text-xs">{formatDate(u.last_login)}</td>
                        <td>
                          <div className="flex items-center gap-1">
                            <button onClick={() => { setEditingUser(u); setEditUserName(u.name); setEditUserRole(u.user_role || 'standard'); }} className="p-1 text-text-muted hover:text-csa-accent transition-colors cursor-pointer"><Pencil size={13} /></button>
                            <button onClick={() => { setResetUserId(u.id); setNewPassword(''); setResetMsg(''); }} className="p-1 text-text-muted hover:text-warning transition-colors cursor-pointer"><KeyRound size={13} /></button>
                            <button onClick={() => toggleActive(u)} className={`p-1 transition-colors cursor-pointer ${u.is_active ? 'text-text-muted hover:text-error' : 'text-text-muted hover:text-success'}`}>
                              {u.is_active ? <ShieldOff size={13} /> : <Shield size={13} />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-2"><Pagination currentPage={userSafePage} totalItems={filteredUsers.length} pageSize={10} onPageChange={setUserPage} /></div>
            </>
          ) : (
            <div className="text-center py-8"><Users size={24} className="text-text-muted mx-auto mb-2" /><p className="text-sm text-text-muted">{userSearch ? 'No matching users' : 'No users yet'}</p></div>
          )}
        </motion.div>
      </div>

      {/* Add User Modal */}
      {showAddUser ? (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowAddUser(false)}>
          <div className="bg-csa-dark border-2 border-border rounded-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2"><UserPlus size={18} className="text-csa-accent" /><h3 className="text-base font-bold text-text-primary">Add User</h3></div>
              <button onClick={() => setShowAddUser(false)} className="p-1 text-text-muted hover:text-text-primary cursor-pointer"><X size={16} /></button>
            </div>
            <div className="space-y-3">
              <div><label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Name *</label>
                <input type="text" value={addName} onChange={e => setAddName(e.target.value)} placeholder="Full name" autoFocus className={inputCls} /></div>
              <div><label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Email *</label>
                <input type="email" value={addEmail} onChange={e => setAddEmail(e.target.value)} placeholder="email@company.com" className={inputCls} /></div>
              <div><label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Password *</label>
                <input type="password" value={addPassword} onChange={e => setAddPassword(e.target.value)} placeholder="Min 8 characters" className={inputCls} /></div>
              <div><label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Role</label>
                <div className="relative"><select value={addRole} onChange={e => setAddRole(e.target.value)} className={selectCls}>
                  {availableRoles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select><ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" /></div></div>
              {addError ? <p className="text-xs text-error flex items-center gap-1"><AlertCircle size={12} />{addError}</p> : null}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowAddUser(false)} className="px-4 py-2 text-xs font-semibold text-text-muted bg-surface-raised border border-border-subtle rounded-xl cursor-pointer">Cancel</button>
              <button onClick={addUser} disabled={addingUser || !addName || !addEmail || !addPassword} className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-success bg-success/10 border border-success/30 rounded-xl cursor-pointer disabled:opacity-40">
                {addingUser ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />} Create
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Edit User Modal */}
      {editingUser ? (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setEditingUser(null)}>
          <div className="bg-csa-dark border-2 border-border rounded-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><h3 className="text-base font-bold text-text-primary">Edit User</h3><button onClick={() => setEditingUser(null)} className="p-1 text-text-muted hover:text-text-primary cursor-pointer"><X size={16} /></button></div>
            <div className="space-y-3">
              <div><label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Name</label>
                <input type="text" value={editUserName} onChange={e => setEditUserName(e.target.value)} className={inputCls} /></div>
              <div><label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Role</label>
                <div className="relative"><select value={editUserRole} onChange={e => setEditUserRole(e.target.value)} className={selectCls}>
                  {availableRoles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select><ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" /></div></div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setEditingUser(null)} className="px-4 py-2 text-xs font-semibold text-text-muted bg-surface-raised border border-border-subtle rounded-xl cursor-pointer">Cancel</button>
              <button onClick={saveUser} disabled={savingUser} className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-success bg-success/10 border border-success/30 rounded-xl cursor-pointer disabled:opacity-50">
                {savingUser ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Password Reset Modal */}
      {resetUserId ? (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setResetUserId(null)}>
          <div className="bg-csa-dark border-2 border-border rounded-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4"><KeyRound size={18} className="text-warning" /><h3 className="text-base font-bold text-text-primary">Reset Password</h3></div>
            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="New password (min 8 chars)" className={`${inputCls} mb-3`} />
            {resetMsg ? <p className={`text-xs mb-3 ${resetMsg.includes('success') ? 'text-success' : 'text-error'}`}>{resetMsg}</p> : null}
            <div className="flex justify-end gap-2">
              <button onClick={() => setResetUserId(null)} className="px-4 py-2 text-xs font-semibold text-text-muted bg-surface-raised border border-border-subtle rounded-xl cursor-pointer">Cancel</button>
              <button onClick={resetPassword} disabled={resettingPw || newPassword.length < 8} className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-warning bg-warning/10 border border-warning/30 rounded-xl cursor-pointer disabled:opacity-40">
                {resettingPw ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />} Reset
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ============================================================
// SHARED COMPONENTS
// ============================================================
function InfoCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border-subtle rounded-xl px-4 py-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">{icon}{label}</div>
      <p className="text-sm text-text-primary truncate">{value || '\u2014'}</p>
    </div>
  );
}
