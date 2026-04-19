/**
 * ResellerManagementView — Manage partner organizations and their users.
 *
 * Two display modes controlled by selectedResellerId in the store:
 *
 * 1. Grid mode (no reseller selected):
 *    - Shows reseller cards with name, region, category, user count
 *    - Search filter, region filter (admin only), category filter
 *    - "Create Reseller" form (admin only) with name, region, currency, category
 *    - Click a card to enter detail mode
 *
 * 2. Detail mode (reseller selected):
 *    - Reseller info with editable fields (admin: region, currency, category, email)
 *    - User list with role badges, active/inactive status
 *    - Create user form (name, email, password, role)
 *    - Edit user role, toggle active status, reset password
 *    - Link to open the reseller in Zoho CRM
 *
 * Permissions:
 * - Admin/IBM: See all resellers, create resellers, create any role
 * - Managers: See own + child resellers, create viewer/standard/manager roles
 * - Others: Only see their own reseller
 *
 * Data: /api/resellers (list), /api/resellers/[id] (detail + users), /api/users (CRUD).
 */

'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Users, UserPlus, Search, Loader2, Shield, ShieldOff, KeyRound,
  ChevronDown, X, AlertCircle, Building2, Pencil, Save, Plus,
  ArrowLeft, Globe, DollarSign, Mail, ExternalLink, RefreshCw,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';
import Pagination from '../Pagination';
import { InlineEditField, InlineEditFieldProvider } from '../InlineEditField';

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

// Permission definitions for the toggle UI
const PERMISSION_DEFS = [
  { key: 'can_create_invoices', label: 'Create Orders', desc: 'Create new orders in the portal' },
  { key: 'can_approve_invoices', label: 'Approve Orders', desc: 'Approve orders and generate licence keys' },
  { key: 'can_send_invoices', label: 'Send Orders', desc: 'Send orders to customers or resellers' },
  { key: 'can_view_all_records', label: 'View All Records', desc: 'See all records across all resellers' },
  { key: 'can_view_child_records', label: 'View Child Records', desc: 'See records for child resellers (distributors)' },
  { key: 'can_modify_prices', label: 'Modify Prices', desc: 'Change line item prices on orders' },
  { key: 'can_upload_po', label: 'Upload PO', desc: 'Upload purchase order documents' },
  { key: 'can_view_reports', label: 'View Reports', desc: 'Access the reports dashboard' },
  { key: 'can_export_data', label: 'Export Data', desc: 'Export data to Excel/CSV' },
  { key: 'can_create_evaluations', label: 'Create Evaluations', desc: 'Create evaluation licences for accounts' },
  { key: 'can_extend_evaluations', label: 'Extend Evaluations', desc: 'Extend evaluation licences beyond 30 days' },
];

interface RoleWithPerms {
  id: number; name: string; display_name: string;
  can_create_invoices: boolean; can_approve_invoices: boolean; can_send_invoices: boolean;
  can_view_all_records: boolean; can_view_child_records: boolean; can_modify_prices: boolean;
  can_upload_po: boolean; can_view_reports: boolean; can_export_data: boolean;
  can_create_evaluations: boolean; max_evaluations_per_account: number; can_extend_evaluations: boolean;
}

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
                <p className="text-xs text-text-muted mt-0.5">Controls if orders and licence keys are sent directly to the customer or to the reseller</p>
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
              <p className="text-sm font-semibold text-text-primary">Pay on Account</p>
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

  // DB registration state
  const [dbRegistered, setDbRegistered] = useState(true);
  const [dbRole, setDbRole] = useState<{ name: string; display: string } | null>(null);
  const [availableResellerRoles, setAvailableResellerRoles] = useState<RoleWithPerms[]>([]);
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [registerFields, setRegisterFields] = useState<Record<string, any>>({});
  const [registering, setRegistering] = useState(false);
  const [registerError, setRegisterError] = useState('');
  const [registerPermissions, setRegisterPermissions] = useState<Record<string, boolean | null>>({});
  const [registerMaxEvals, setRegisterMaxEvals] = useState<number | null>(null);

  // Permission overrides for existing registered partners
  const [permissionOverrides, setPermissionOverrides] = useState<Record<string, boolean | null> | null>(null);
  const [payOnCard, setPayOnCard] = useState(false);
  const [editingPermissions, setEditingPermissions] = useState(false);
  const [editPerms, setEditPerms] = useState<Record<string, boolean | null>>({});
  const [editMaxEvals, setEditMaxEvals] = useState<number | null>(null);
  const [savingPerms, setSavingPerms] = useState(false);

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
      setDbRegistered(resRes.dbRegistered ?? false);
      setDbRole(resRes.dbRole || null);
      setAvailableResellerRoles(resRes.availableRoles || []);
      setPermissionOverrides(resRes.permissionOverrides || null);
      setPayOnCard(resRes.payOnCard ?? false);
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

  /** Optimistic per-field save used by InlineEditField. Updates local
   *  reseller state immediately, PATCHes the record, and rolls back on
   *  error by throwing. `localChanges` is the shape applied locally for
   *  display (e.g. lookup objects with name); `apiChanges` is the body
   *  sent to the API (often a different shape). */
  const saveFields = useCallback(async (
    apiChanges: Record<string, unknown>,
    localChanges?: Record<string, unknown>,
  ) => {
    if (!selectedResellerId) throw new Error('No reseller selected');
    const previous = reseller;
    setReseller(prev => prev ? { ...prev, ...(localChanges ?? apiChanges) } : prev);
    try {
      const res = await fetch(`/api/resellers/${selectedResellerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiChanges),
      });
      if (!res.ok) throw new Error('Save failed');
    } catch (err) {
      setReseller(previous);
      throw err;
    }
  }, [selectedResellerId, reseller]);

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
            {isAdmin && dbRegistered && (
              <button onClick={async () => {
                try {
                  await fetch(`/api/resellers/${selectedResellerId}`, {
                    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ _syncDistributor: true }),
                  });
                  loadData();
                } catch {}
              }} className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-text-muted bg-surface-raised border border-border-subtle rounded-xl hover:border-csa-accent/30 hover:text-csa-accent transition-colors cursor-pointer"
                title="Sync distributor/child relationships from Zoho CRM">
                <RefreshCw size={14} /> Sync
              </button>
            )}
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

        {/* DB Registration Banner */}
        {isAdmin && !dbRegistered && !showRegisterForm && (
          <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="mb-6 p-4 bg-warning/8 border border-warning/25 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-warning/15 flex items-center justify-center flex-shrink-0">
                <AlertCircle size={18} className="text-warning" />
              </div>
              <div>
                <p className="text-sm font-semibold text-text-primary">Not registered in portal</p>
                <p className="text-xs text-text-muted">This partner exists in Zoho CRM but hasn&apos;t been added to the portal database. Register them to enable user accounts and permissions.</p>
              </div>
            </div>
            <button
              onClick={() => {
                setRegisterFields({
                  name: reseller.Name || '',
                  email: reseller.Email || '',
                  region: reseller.Region || '',
                  currency: reseller.Currency || '',
                  partner_category: reseller.Partner_Category || '',
                  direct_customer_contact: !!reseller.Direct_Customer_Contact,
                  distributor_id: reseller.Distributor?.id || '',
                  reseller_role_id: '',
                });
                setShowRegisterForm(true);
                setRegisterError('');
              }}
              className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-success bg-success/10 border border-success/30 rounded-xl hover:bg-success/20 transition-colors cursor-pointer flex-shrink-0"
            >
              <Plus size={14} /> Register Partner
            </button>
          </motion.div>
        )}

        {/* Registration Form */}
        {isAdmin && showRegisterForm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-surface border border-success/40 rounded-xl p-5 mb-8">
            <h3 className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2">
              <Plus size={16} className="text-success" /> Register Partner in Portal
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
              <div>
                <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider block mb-1">Name *</label>
                <input type="text" value={registerFields.name} onChange={e => setRegisterFields(p => ({ ...p, name: e.target.value }))}
                  className="w-full bg-csa-dark border border-border-subtle px-3 py-2 text-sm text-text-primary outline-none focus:border-csa-accent transition-colors rounded-lg" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider block mb-1">Email</label>
                <input type="email" value={registerFields.email} onChange={e => setRegisterFields(p => ({ ...p, email: e.target.value }))}
                  className="w-full bg-csa-dark border border-border-subtle px-3 py-2 text-sm text-text-primary outline-none focus:border-csa-accent transition-colors rounded-lg" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider block mb-1">Permission Preset *</label>
                <select value={registerFields.reseller_role_id} onChange={e => {
                  const roleId = e.target.value;
                  setRegisterFields(p => ({ ...p, reseller_role_id: roleId }));
                  // Reset permission overrides to null (use defaults) when changing preset
                  const nullPerms: Record<string, boolean | null> = {};
                  PERMISSION_DEFS.forEach(p => { nullPerms[p.key] = null; });
                  setRegisterPermissions(nullPerms);
                }}
                  className="w-full bg-csa-dark border border-border-subtle px-3 py-2 text-sm text-text-primary outline-none focus:border-csa-accent transition-colors rounded-lg appearance-none cursor-pointer">
                  <option value="">Select preset...</option>
                  {availableResellerRoles.map(r => (
                    <option key={r.id} value={r.id}>{r.display_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider block mb-1">Region</label>
                <select value={registerFields.region} onChange={e => setRegisterFields(p => ({ ...p, region: e.target.value }))}
                  className="w-full bg-csa-dark border border-border-subtle px-3 py-2 text-sm text-text-primary outline-none focus:border-csa-accent transition-colors rounded-lg appearance-none cursor-pointer">
                  <option value="">—</option>
                  {Object.entries(REGION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider block mb-1">Currency</label>
                <select value={registerFields.currency} onChange={e => setRegisterFields(p => ({ ...p, currency: e.target.value }))}
                  className="w-full bg-csa-dark border border-border-subtle px-3 py-2 text-sm text-text-primary outline-none focus:border-csa-accent transition-colors rounded-lg appearance-none cursor-pointer">
                  <option value="">—</option>
                  <option value="AUD">AUD</option><option value="USD">USD</option><option value="EUR">EUR</option>
                  <option value="GBP">GBP</option><option value="NZD">NZD</option><option value="INR">INR</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider block mb-1">Partner Category</label>
                <select value={registerFields.partner_category} onChange={e => setRegisterFields(p => ({ ...p, partner_category: e.target.value }))}
                  className="w-full bg-csa-dark border border-border-subtle px-3 py-2 text-sm text-text-primary outline-none focus:border-csa-accent transition-colors rounded-lg appearance-none cursor-pointer">
                  <option value="">—</option>
                  <option value="Reseller">Reseller</option>
                  <option value="Distributor">Distributor</option>
                  <option value="Distributor/Reseller">Distributor/Reseller</option>
                  <option value="Affiliate">Affiliate</option>
                  <option value="Platinum Partner">Platinum Partner</option>
                </select>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={registerFields.direct_customer_contact} onChange={e => setRegisterFields(p => ({ ...p, direct_customer_contact: e.target.checked }))}
                    className="w-4 h-4 rounded border-border-subtle accent-csa-accent cursor-pointer" />
                  <span className="text-xs text-text-secondary">Direct Customer Contact</span>
                </label>
              </div>
            </div>

            {/* Permission Toggles */}
            {registerFields.reseller_role_id && (
              <div className="mt-4">
                <h4 className="text-xs font-bold text-text-primary mb-2 flex items-center gap-2">
                  <Shield size={13} className="text-csa-accent" /> Permissions
                  <span className="text-[10px] text-text-muted font-normal">Click to override preset defaults</span>
                </h4>
                <PermissionToggles
                  permissions={registerPermissions}
                  onChange={setRegisterPermissions}
                  roleDefaults={(() => {
                    const role = availableResellerRoles.find(r => String(r.id) === String(registerFields.reseller_role_id));
                    if (!role) return {};
                    const defaults: Record<string, boolean> = {};
                    PERMISSION_DEFS.forEach(p => { defaults[p.key] = !!(role as unknown as Record<string, unknown>)[p.key]; });
                    return defaults;
                  })()}
                  maxEvalsValue={registerMaxEvals}
                  maxEvalsRoleDefault={(() => {
                    const role = availableResellerRoles.find(r => String(r.id) === String(registerFields.reseller_role_id));
                    return role?.max_evaluations_per_account ?? 0;
                  })()}
                  onMaxEvalsChange={setRegisterMaxEvals}
                />
              </div>
            )}

            {registerError && (
              <p className="text-xs text-error mb-3 mt-3">{registerError}</p>
            )}

            <div className="flex gap-2 pt-3 border-t border-border-subtle">
              <button onClick={() => setShowRegisterForm(false)} className="px-4 py-2 text-xs font-semibold text-text-muted bg-surface-raised border border-border-subtle rounded-xl cursor-pointer">Cancel</button>
              <button
                onClick={async () => {
                  if (!registerFields.name || !registerFields.reseller_role_id) {
                    setRegisterError('Name and permission preset are required');
                    return;
                  }
                  setRegistering(true); setRegisterError('');
                  // Build permissions payload — only include overrides (non-null values)
                  const permPayload: Record<string, unknown> = {};
                  for (const [k, v] of Object.entries(registerPermissions)) {
                    if (v !== null && v !== undefined) permPayload[k] = v;
                  }
                  if (registerMaxEvals !== null) permPayload.max_evaluations_per_account = registerMaxEvals;
                  try {
                    const res = await fetch(`/api/resellers/${selectedResellerId}`, {
                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        ...registerFields,
                        reseller_role_id: parseInt(registerFields.reseller_role_id),
                        distributor_id: registerFields.distributor_id || null,
                        permissions: Object.keys(permPayload).length > 0 ? permPayload : undefined,
                      }),
                    });
                    const data = await res.json();
                    if (res.ok) {
                      setShowRegisterForm(false);
                      loadData();
                    } else {
                      setRegisterError(data.error || 'Registration failed');
                    }
                  } catch { setRegisterError('Registration failed'); }
                  setRegistering(false);
                }}
                disabled={registering}
                className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-success bg-success/10 border border-success/30 rounded-xl cursor-pointer disabled:opacity-50"
              >
                {registering ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Register Partner
              </button>
            </div>
          </motion.div>
        )}

        {/* DB Role Badge + Permission Management */}
        {dbRegistered && dbRole && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-md bg-success/15 text-success">Registered</span>
              <span className="text-xs text-text-muted">Permission preset: <span className="text-text-secondary font-semibold">{dbRole.display}</span></span>
              {isAdmin && !editingPermissions && (
                <button onClick={() => {
                  // Pre-fill from current overrides
                  const currentPerms: Record<string, boolean | null> = {};
                  if (permissionOverrides) {
                    PERMISSION_DEFS.forEach(p => {
                      const dbKey = 'perm_' + p.key.replace('can_', '');
                      currentPerms[p.key] = (permissionOverrides as Record<string, boolean | null>)[dbKey] ?? null;
                    });
                    setEditMaxEvals((permissionOverrides as Record<string, number | null>)['perm_max_evaluations_per_account'] ?? null);
                  } else {
                    PERMISSION_DEFS.forEach(p => { currentPerms[p.key] = null; });
                    setEditMaxEvals(null);
                  }
                  // Pre-fill payment method flags
                  currentPerms['_pay_on_card'] = payOnCard;
                  currentPerms['_pay_on_account'] = !!reseller?.Can_Purchase_on_Credit;
                  setEditPerms(currentPerms);
                  setEditingPermissions(true);
                }}
                  className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold text-warning bg-warning/10 border border-warning/30 rounded-lg hover:bg-warning/20 transition-colors cursor-pointer">
                  <Shield size={12} /> Edit Permissions
                </button>
              )}
            </div>

            {/* Inline permission editor */}
            {isAdmin && editingPermissions && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-surface border border-warning/30 rounded-xl p-4 mb-4">
                <h4 className="text-xs font-bold text-text-primary mb-3 flex items-center gap-2">
                  <Shield size={14} className="text-warning" /> Edit Permissions
                  <span className="text-[10px] text-text-muted font-normal">Click to toggle. Orange dot = override from preset.</span>
                </h4>
                <PermissionToggles
                  permissions={editPerms}
                  onChange={setEditPerms}
                  roleDefaults={(() => {
                    const role = availableResellerRoles.find(r => r.name === dbRole?.name);
                    if (!role) return {};
                    const defaults: Record<string, boolean> = {};
                    PERMISSION_DEFS.forEach(p => { defaults[p.key] = !!(role as unknown as Record<string, unknown>)[p.key]; });
                    return defaults;
                  })()}
                  maxEvalsValue={editMaxEvals}
                  maxEvalsRoleDefault={(() => {
                    const role = availableResellerRoles.find(r => r.name === dbRole?.name);
                    return role?.max_evaluations_per_account ?? 0;
                  })()}
                  onMaxEvalsChange={setEditMaxEvals}
                />
                {/* Payment Method Toggles (saved to Zoho) */}
                <div className="mt-3 pt-3 border-t border-border-subtle">
                  <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">Payment Methods</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      { key: '_pay_on_card', label: 'Pay on Card', desc: 'Allow payment via credit card (Pay Now / Pay Later)' },
                      { key: '_pay_on_account', label: 'Pay on Account', desc: 'Allow placing orders on account terms (requires PO)' },
                    ].map(({ key, label, desc }) => {
                      const value = !!editPerms[key];
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setEditPerms(prev => ({ ...prev, [key]: !value }))}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                            value
                              ? 'bg-success/12 border-success/40 ring-1 ring-success/20'
                              : 'bg-surface border-border-subtle'
                          }`}
                        >
                          <div className={`w-4 h-4 rounded-md flex items-center justify-center flex-shrink-0 text-[10px] font-bold ${
                            value ? 'bg-success/25 text-success' : 'bg-surface-raised text-text-muted'
                          }`}>
                            {value ? '✓' : '✕'}
                          </div>
                          <div className="min-w-0">
                            <p className={`text-xs font-semibold truncate ${value ? 'text-text-primary' : 'text-text-muted'}`}>{label}</p>
                            <p className="text-[10px] text-text-muted truncate">{desc}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex gap-2 mt-3 pt-3 border-t border-border-subtle">
                  <button onClick={() => setEditingPermissions(false)}
                    className="px-3 py-1.5 text-xs font-semibold text-text-muted bg-surface-raised border border-border-subtle rounded-lg cursor-pointer">Cancel</button>
                  <button
                    disabled={savingPerms}
                    onClick={async () => {
                      setSavingPerms(true);
                      const permPayload: Record<string, unknown> = {};
                      for (const [k, v] of Object.entries(editPerms)) {
                        if (k.startsWith('_')) continue; // Skip non-DB flags
                        permPayload[k] = v ?? null;
                      }
                      permPayload.max_evaluations_per_account = editMaxEvals;
                      // Include pay_on_card (portal-only, saved to PostgreSQL)
                      permPayload.pay_on_card = !!editPerms['_pay_on_card'];
                      try {
                        // Save PostgreSQL permissions (includes pay_on_card)
                        await fetch(`/api/resellers/${selectedResellerId}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ _updatePermissions: true, permissions: permPayload }),
                        });
                        // Save Pay on Account to Zoho (Can_Purchase_on_Credit)
                        await fetch(`/api/resellers/${selectedResellerId}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            Can_Purchase_on_Credit: !!editPerms['_pay_on_account'],
                          }),
                        });
                        setEditingPermissions(false);
                        loadData();
                      } catch {}
                      setSavingPerms(false);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-success bg-success/10 border border-success/30 rounded-lg cursor-pointer disabled:opacity-50">
                    {savingPerms ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save Permissions
                  </button>
                </div>
              </motion.div>
            )}

            {/* Show current effective permissions (read-only) when not editing */}
            {!editingPermissions && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
                {PERMISSION_DEFS.map(({ key, label }) => {
                  const role = availableResellerRoles.find(r => r.name === dbRole?.name);
                  const roleDefault = role ? !!(role as unknown as Record<string, unknown>)[key] : false;
                  let overrideVal: boolean | null = null;
                  if (permissionOverrides) {
                    const dbKey = 'perm_' + key.replace('can_', '');
                    overrideVal = (permissionOverrides as Record<string, boolean | null>)[dbKey] ?? null;
                  }
                  const effective = overrideVal ?? roleDefault;
                  const isOverridden = overrideVal !== null;

                  return (
                    <div key={key} className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[10px] ${
                      effective ? 'text-success' : 'text-text-muted'
                    }`}>
                      <span>{effective ? '✓' : '✕'}</span>
                      <span className="font-semibold">{label}</span>
                      {isOverridden && <span className="text-warning font-bold">&#x2022;</span>}
                    </div>
                  );
                })}
                {/* Payment method flags from Zoho */}
                {reseller && (
                  <>
                    <div className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[10px] ${payOnCard ? 'text-success' : 'text-text-muted'}`}>
                      <span>{payOnCard ? '✓' : '✕'}</span>
                      <span className="font-semibold">Pay on Card</span>
                    </div>
                    <div className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-[10px] ${reseller.Can_Purchase_on_Credit ? 'text-success' : 'text-text-muted'}`}>
                      <span>{reseller.Can_Purchase_on_Credit ? '✓' : '✕'}</span>
                      <span className="font-semibold">Pay on Account</span>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}

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
          <InlineEditFieldProvider>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">

            {/* Primary Contact — composite (First+Last). Click opens existing edit form. */}
            <div
              onClick={isAdmin ? startEditReseller : undefined}
              className={`bg-surface border border-border-subtle rounded-xl px-4 py-3 transition-colors ${isAdmin ? 'cursor-pointer hover:border-csa-accent/40' : ''}`}
            >
              <div className="flex items-center gap-1.5 text-xs font-semibold text-text-muted uppercase tracking-wider mb-1"><Users size={14} />Primary Contact</div>
              <p className="text-sm text-text-primary truncate">{[reseller.Reseller_First_Name, reseller.Reseller_Last_Name].filter(Boolean).join(' ') || '\u2014'}</p>
            </div>

            <InlineEditField fieldId="email" label="Email" icon={<Mail size={14} />}
              value={reseller.Email || ''} type="email" canEdit={isAdmin}
              onSave={v => saveFields({ Email: v || null })} />

            <InlineEditField fieldId="region" label="Region" icon={<Globe size={14} />}
              value={reseller.Region || 'AU'}
              displayValue={REGION_LABELS[reseller.Region] || reseller.Region || '\u2014'}
              type="select"
              options={REGIONS.map(([k, v]) => ({ value: k, label: v }))}
              canEdit={isAdmin}
              onSave={v => saveFields({ Region: v })} />

            <InlineEditField fieldId="currency" label="Currency" icon={<DollarSign size={14} />}
              value={reseller.Currency || 'AUD'} type="select"
              options={CURRENCIES.map(c => ({ value: c, label: c }))}
              canEdit={isAdmin}
              onSave={v => saveFields({ Currency: v })} />

            <InlineEditField fieldId="partner_category" label="Partner Category" icon={<Building2 size={14} />}
              value={reseller.Partner_Category || 'Reseller'} type="select"
              options={PARTNER_CATEGORIES.map(c => ({ value: c, label: c }))}
              canEdit={isAdmin}
              onSave={v => saveFields({ Partner_Category: v })} />

            <InlineEditField fieldId="distributor" label="Distributor" icon={<Building2 size={14} />}
              value={(reseller.Distributor as { id?: string })?.id || ''}
              displayValue={distributor?.name || '\u2014'}
              type="lookup"
              options={[
                { value: '', label: '— None —' },
                ...allResellers.filter(r => r.partner_category?.includes('Distributor')).map(r => ({ value: r.id, label: r.name })),
              ]}
              placeholder="Search distributors..."
              canEdit={isAdmin}
              onOpenEdit={loadData}
              onSave={async v => {
                const found = allResellers.find(r => r.id === v);
                // API expects {id} (Zoho lookup format); local state needs {id, name} for display
                await saveFields(
                  { Distributor: v ? { id: v } : null },
                  { Distributor: v ? { id: v, name: found?.name || '' } : null },
                );
              }} />

            <InlineEditField fieldId="reseller_sale" label="Reseller Percentage" icon={<DollarSign size={14} />}
              value={reseller.Reseller_Sale != null ? String(reseller.Reseller_Sale) : ''}
              displayValue={reseller.Reseller_Sale != null ? `${reseller.Reseller_Sale}%` : '\u2014'}
              type="number" placeholder="e.g. 10" canEdit={isAdmin}
              onSave={async v => {
                const n = parseFloat(v);
                if (isNaN(n)) throw new Error('Invalid number');
                await saveFields({ Reseller_Sale: n });
              }} />

            <InlineEditField fieldId="distributor_percentage" label="Distributor Percentage" icon={<DollarSign size={14} />}
              value={reseller.Distributor_Percentage_Rate != null ? String(reseller.Distributor_Percentage_Rate) : ''}
              displayValue={reseller.Distributor_Percentage_Rate != null ? `${reseller.Distributor_Percentage_Rate}%` : '\u2014'}
              type="number" placeholder="e.g. 5" canEdit={isAdmin}
              onSave={async v => {
                const n = parseFloat(v);
                if (isNaN(n)) throw new Error('Invalid number');
                await saveFields({ Distributor_Percentage_Rate: n });
              }} />

            <InlineEditField fieldId="tax_info" label="Tax Information" icon={<DollarSign size={14} />}
              value={reseller.Additional_Tax_Infromation || ''} type="text"
              placeholder="Tax ID or registration number" canEdit={isAdmin}
              onSave={v => saveFields({ Additional_Tax_Infromation: v || null })} />

            <InlineEditField fieldId="customer_comm" label="Customer Communication" icon={<Mail size={14} />}
              value={reseller.Direct_Customer_Contact ? 'true' : 'false'}
              displayValue={reseller.Direct_Customer_Contact ? 'Direct to Customer' : 'Via Reseller'}
              type="select"
              options={[
                { value: 'true', label: 'Direct to Customer' },
                { value: 'false', label: 'Via Reseller' },
              ]}
              canEdit={isAdmin}
              onSave={v => saveFields({ Direct_Customer_Contact: v === 'true' })} />

            {/* Address — composite. Click opens existing edit form. */}
            {reseller.Street_Address || reseller.City ? (
              <div
                onClick={isAdmin ? startEditReseller : undefined}
                className={`bg-surface border border-border-subtle rounded-xl px-4 py-3 transition-colors ${isAdmin ? 'cursor-pointer hover:border-csa-accent/40' : ''}`}
              >
                <div className="flex items-center gap-1.5 text-xs font-semibold text-text-muted uppercase tracking-wider mb-1"><Globe size={14} />Address</div>
                <p className="text-sm text-text-primary truncate">{[reseller.Street_Address, reseller.City, reseller.State, reseller.Post_Code, reseller.Country].filter(Boolean).join(', ')}</p>
              </div>
            ) : null}

            {reseller.Owner ? <InfoCard label="CSA Account Manager" value={reseller.Owner?.name || '\u2014'} icon={<Users size={14} />} /> : null}
            <InfoCard label="Portal Users" value={String(users.length)} icon={<Users size={14} />} />
          </motion.div>
          </InlineEditFieldProvider>
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
// PERMISSION TOGGLES — reused in registration and detail views
// ============================================================
function PermissionToggles({
  permissions,
  onChange,
  roleDefaults,
  maxEvalsValue,
  maxEvalsRoleDefault,
  onMaxEvalsChange,
}: {
  permissions: Record<string, boolean | null>;
  onChange: (perms: Record<string, boolean | null>) => void;
  roleDefaults?: Record<string, boolean>;
  maxEvalsValue?: number | null;
  maxEvalsRoleDefault?: number;
  onMaxEvalsChange?: (v: number | null) => void;
}) {
  const toggle = (key: string) => {
    const current = permissions[key];
    const roleDefault = roleDefaults?.[key] ?? false;

    // Cycle: null (use default) → true → false → null
    let next: boolean | null;
    if (current === null || current === undefined) {
      next = !roleDefault; // Override to opposite of default
    } else {
      next = current === roleDefault ? null : !current;
    }
    onChange({ ...permissions, [key]: next });
  };

  const evalEnabled = (permissions['can_create_evaluations'] ?? roleDefaults?.['can_create_evaluations'] ?? false);
  const effectiveMaxEvals = maxEvalsValue ?? maxEvalsRoleDefault ?? 0;

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
      {PERMISSION_DEFS.map(({ key, label, desc }) => {
        const value = permissions[key];
        const roleDefault = roleDefaults?.[key] ?? false;
        const effective = value ?? roleDefault;
        const isOverridden = value !== null && value !== undefined;

        return (
          <button
            key={key}
            type="button"
            onClick={() => toggle(key)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all cursor-pointer ${
              effective
                ? isOverridden
                  ? 'bg-success/12 border-success/40 ring-1 ring-success/20'
                  : 'bg-success/8 border-success/25'
                : isOverridden
                  ? 'bg-error/12 border-error/40 ring-1 ring-error/20'
                  : 'bg-surface border-border-subtle'
            }`}
          >
            <div className={`w-4 h-4 rounded-md flex items-center justify-center flex-shrink-0 text-[10px] font-bold ${
              effective
                ? 'bg-success/25 text-success'
                : 'bg-surface-raised text-text-muted'
            }`}>
              {effective ? '✓' : '✕'}
            </div>
            <div className="min-w-0">
              <p className={`text-xs font-semibold truncate ${effective ? 'text-text-primary' : 'text-text-muted'}`}>
                {label}
                {isOverridden && <span className="ml-1 text-[9px] font-bold text-warning">&#x2022; override</span>}
              </p>
              <p className="text-[10px] text-text-muted truncate">{desc}</p>
            </div>
          </button>
        );
      })}
      </div>
      {evalEnabled && onMaxEvalsChange && (
        <div className="mt-3 flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border-subtle bg-surface">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-text-primary">Max Evaluations Per Account</p>
            <p className="text-[10px] text-text-muted">
              {effectiveMaxEvals === -1 ? 'Unlimited' : effectiveMaxEvals === 0 ? 'Disabled' : `${effectiveMaxEvals} per account`}
              {maxEvalsValue === null || maxEvalsValue === undefined ? ` (default: ${maxEvalsRoleDefault === -1 ? 'unlimited' : maxEvalsRoleDefault ?? 0})` : ''}
            </p>
          </div>
          <label className="flex items-center gap-1.5 text-[10px] text-text-secondary cursor-pointer select-none">
            <input
              type="checkbox"
              checked={effectiveMaxEvals === -1}
              onChange={e => onMaxEvalsChange(e.target.checked ? -1 : 0)}
              className="accent-csa-accent cursor-pointer"
            />
            Unlimited
          </label>
          <input
            type="number"
            min={0}
            value={effectiveMaxEvals === -1 ? '' : effectiveMaxEvals}
            disabled={effectiveMaxEvals === -1}
            placeholder="—"
            onChange={e => {
              const v = parseInt(e.target.value);
              onMaxEvalsChange(isNaN(v) ? 0 : Math.max(0, v));
            }}
            className="w-16 bg-csa-dark border border-border-subtle px-2 py-1 text-sm text-text-primary rounded-lg text-center disabled:opacity-30 disabled:cursor-not-allowed"
          />
          {maxEvalsValue !== null && maxEvalsValue !== undefined && (
            <button type="button" onClick={() => onMaxEvalsChange(null)} className="text-[9px] text-warning hover:text-warning/80 cursor-pointer">Reset</button>
          )}
        </div>
      )}
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
