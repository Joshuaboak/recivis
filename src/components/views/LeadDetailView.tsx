'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Building2, User, Package, Loader2, ExternalLink, Mail, Phone,
  MapPin, FileText, Star, Plus, X, Eye, Beaker, ArrowRightLeft, Check,
  AlertTriangle, Globe, Briefcase, Tag, Clock, MessageSquare, Pencil, Save,
  Smartphone, Factory, ChevronDown,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';
import Pagination from '../Pagination';
import AssetDetailModal from '../AssetDetailModal';
import EmailHistory from '../EmailHistory';

interface ResellerOption {
  id: string;
  name: string;
  region: string;
}

const LEAD_STATUSES = [
  'Not Contacted', 'Attempted to Contact', 'Contacted', 'Future Interest',
  'No Interest Ever', 'Dormant', 'Lost Lead', 'Pre-Qualified', 'Suspect',
];

const INDUSTRIES = [
  'Civil Engineering', 'Utilities', 'Academic', 'Architectural', 'Builder',
  'Civil', 'Civil & Structural', 'Developer', 'Educational', 'Government',
  'Mechanical', 'Mining', 'Structural', 'Survey', 'Town Planning',
  'Traffic Engineering', 'Other', 'Management ISV',
];

const PRODUCTS_OF_INTEREST = [
  'Civil Site Design for BricsCAD', 'Civil Site Design for Civil 3D',
  'Corridor EZ for Civil 3D', 'Stringer Topo for BricsCAD',
  'Stringer Topo for Civil 3D', 'Customization Services',
  'Design Services', 'Training Services', 'Software Maintenance Plan',
];

const STATUS_COLORS: Record<string, string> = {
  'Not Contacted': 'bg-text-muted/20 text-text-muted',
  'Attempted to Contact': 'bg-warning/20 text-warning',
  'Contacted': 'bg-csa-accent/20 text-csa-accent',
  'Future Interest': 'bg-csa-purple/20 text-csa-purple',
  'No Interest Ever': 'bg-error/20 text-error',
  'Dormant': 'bg-text-muted/20 text-text-muted',
  'Lost Lead': 'bg-error/20 text-error',
  'Pre-Qualified': 'bg-success/20 text-success',
  'Suspect': 'bg-warning/20 text-warning',
  'Prospect': 'bg-csa-highlight/20 text-csa-accent',
};

export default function LeadDetailView() {
  const {
    user, selectedLeadId, selectedLeadSource,
    setCurrentView, setSelectedAccountId, setSelectedInvoiceId, setInvoiceReturnView, setNewInvoiceContext,
  } = useAppStore();

  const [loading, setLoading] = useState(true);
  const [lead, setLead] = useState<Record<string, unknown> | null>(null);
  const [account, setAccount] = useState<Record<string, unknown> | null>(null);
  const [contacts, setContacts] = useState<Record<string, unknown>[]>([]);
  const [evaluationAssets, setEvaluationAssets] = useState<Record<string, unknown>[]>([]);
  const [activeAssets, setActiveAssets] = useState<Record<string, unknown>[]>([]);
  const [archivedAssets, setArchivedAssets] = useState<Record<string, unknown>[]>([]);
  const [invoices, setInvoices] = useState<Record<string, unknown>[]>([]);
  const [source, setSource] = useState<'lead' | 'prospect'>(selectedLeadSource || 'lead');

  // Convert state
  const [converting, setConverting] = useState(false);
  const [convertResult, setConvertResult] = useState<{ success: boolean; accountId?: string; error?: string } | null>(null);
  const [showConvertConfirm, setShowConvertConfirm] = useState(false);

  // Asset detail modal
  const [viewingAsset, setViewingAsset] = useState<Record<string, unknown> | null>(null);

  // Pagination
  const [contactPage, setContactPage] = useState(1);
  const contactPageSize = 10;

  // Lead field editing
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [saving, setSaving] = useState(false);

  // Reseller editing (same pattern as AccountDetailView)
  const [editingReseller, setEditingReseller] = useState(false);
  const [resellerOptions, setResellerOptions] = useState<ResellerOption[]>([]);
  const [resellerSearch, setResellerSearch] = useState('');
  const [savingReseller, setSavingReseller] = useState(false);

  const isAdmin = user?.role === 'admin' || user?.role === 'ibm';
  const hasChildResellers = user?.permissions?.canViewChildRecords;
  const canEditReseller = isAdmin || hasChildResellers;

  // Load resellers when editing starts
  useEffect(() => {
    if (!editingReseller || resellerOptions.length > 0) return;
    let url = '/api/resellers';
    if (!isAdmin && user?.resellerId) {
      url = `/api/resellers?resellerId=${user.resellerId}&includeChildren=true`;
    }
    fetch(url)
      .then(res => res.json())
      .then(data => setResellerOptions(data.resellers || []))
      .catch(() => {});
  }, [editingReseller, isAdmin, user?.resellerId, resellerOptions.length]);

  const startEdit = (field: string, currentValue: string) => {
    setEditingField(field);
    setEditValue(currentValue || '');
  };

  const cancelEdit = () => {
    setEditingField(null);
    setEditValue('');
  };

  const saveField = async (field: string, value: string) => {
    if (!selectedLeadId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/leads/${selectedLeadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value || null }),
      });
      if (res.ok) {
        // Reload lead data
        const reload = await fetch(`/api/leads/${selectedLeadId}?source=lead`);
        const data = await reload.json();
        setLead(data.lead);
      }
    } catch { /* handled by UI */ }
    setSaving(false);
    setEditingField(null);
    setEditValue('');
  };

  const saveReseller = async (resellerId: string) => {
    if (!selectedLeadId) return;
    setSavingReseller(true);
    try {
      const res = await fetch(`/api/leads/${selectedLeadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Reseller: resellerId || null }),
      });
      if (res.ok) {
        const reload = await fetch(`/api/leads/${selectedLeadId}?source=lead`);
        const data = await reload.json();
        setLead(data.lead);
        setEditingReseller(false);
        setResellerSearch('');
      }
    } catch { /* handled */ }
    setSavingReseller(false);
  };

  useEffect(() => {
    if (!selectedLeadId || !selectedLeadSource) return;
    setLoading(true);

    fetch(`/api/leads/${selectedLeadId}?source=${selectedLeadSource}`)
      .then(res => res.json())
      .then(data => {
        setSource(data.source || selectedLeadSource);
        if (data.source === 'prospect') {
          setAccount(data.account);
          setContacts(data.contacts || []);
          setEvaluationAssets(data.evaluationAssets || []);
          setActiveAssets(data.activeAssets || []);
          setArchivedAssets(data.archivedAssets || []);
          setInvoices(data.invoices || []);
        } else {
          setLead(data.lead);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedLeadId, selectedLeadSource]);

  const goBack = () => setCurrentView('leads');

  const handleConvert = async () => {
    if (!selectedLeadId) return;
    setConverting(true);
    setConvertResult(null);

    try {
      const res = await fetch(`/api/leads/${selectedLeadId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();

      if (data.success && data.accountId) {
        setConvertResult({ success: true, accountId: data.accountId });
      } else {
        setConvertResult({ success: false, error: data.error || 'Conversion failed' });
      }
    } catch (err) {
      setConvertResult({ success: false, error: err instanceof Error ? err.message : 'Conversion failed' });
    }
    setConverting(false);
    setShowConvertConfirm(false);
  };

  const navigateToAccount = (accountId: string) => {
    setSelectedAccountId(accountId);
    setCurrentView('account-detail');
  };

  const crmLink = source === 'lead'
    ? `https://crm.zoho.com.au/crm/org7002802215/tab/Leads/${selectedLeadId}`
    : `https://crm.zoho.com.au/crm/org7002802215/tab/Accounts/${selectedLeadId}`;

  const formatDate = (d: unknown) => {
    if (!d || typeof d !== 'string') return '\u2014';
    const date = new Date(d);
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={24} className="text-csa-accent animate-spin" />
      </div>
    );
  }

  // === LEAD VIEW (Zoho Leads module) ===
  if (source === 'lead') {
    if (!lead) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-3">
          <p className="text-text-muted">Lead not found</p>
          <button onClick={goBack} className="text-csa-accent text-sm cursor-pointer">Back to Leads</button>
        </div>
      );
    }

    const reseller = lead.Reseller as { name?: string; id?: string } | null;
    const owner = lead.Owner as { name?: string } | null;
    const leadStatus = (lead.Lead_Status as string) || '';

    return (
      <div className="h-full overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <div className="flex items-center gap-4 mb-6">
            <button onClick={goBack} className="w-9 h-9 flex items-center justify-center bg-surface-raised rounded-xl hover:bg-surface-overlay transition-colors cursor-pointer">
              <ArrowLeft size={18} className="text-text-secondary" />
            </button>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-text-primary">{lead.Company as string || lead.Full_Name as string}</h1>
                <div className="relative group/badge">
                  <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-md bg-csa-accent/15 text-csa-accent cursor-help">
                    Lead
                  </span>
                  <div className="absolute left-0 top-full mt-1.5 z-20 bg-csa-dark border border-border rounded-xl px-3 py-2 shadow-lg opacity-0 pointer-events-none group-hover/badge:opacity-100 group-hover/badge:pointer-events-auto transition-opacity w-64">
                    <p className="text-[11px] text-text-secondary leading-relaxed">
                      Leads are people who have interacted with us through a web form (contact us, demo request, or other marketing forms) but do not yet have an evaluation.
                    </p>
                  </div>
                </div>
              </div>
              <p className="text-sm text-text-muted">{lead.Email as string || ''}</p>
            </div>
            <div className="flex items-center gap-2">
              {isAdmin && !convertResult?.success && (
                <div className="flex flex-col items-end gap-1">
                  <button
                    onClick={() => setShowConvertConfirm(true)}
                    disabled={converting}
                    className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-success bg-success/10 border border-success/30 rounded-xl hover:bg-success/20 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {converting ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <ArrowRightLeft size={14} />
                    )}
                    {converting ? 'Converting...' : 'Convert to Prospect'}
                  </button>
                  <span className="text-[10px] text-text-muted">To create evaluations, convert this lead to a prospect first</span>
                </div>
              )}
              <a href={crmLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-csa-accent bg-csa-accent/10 border border-csa-accent/30 rounded-xl hover:bg-csa-accent/20 transition-colors cursor-pointer">
                <ExternalLink size={14} />
                Open in CRM
              </a>
            </div>
          </div>

          <AnimatePresence>
            {showConvertConfirm && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"
                onClick={() => setShowConvertConfirm(false)}
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 10 }}
                  onClick={e => e.stopPropagation()}
                  className="bg-csa-dark border border-border rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-success/15 flex items-center justify-center">
                      <ArrowRightLeft size={20} className="text-success" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-text-primary">Convert to Prospect</h3>
                      <p className="text-xs text-text-muted">This will create an Account and Contact in Zoho CRM</p>
                    </div>
                  </div>

                  <div className="bg-surface rounded-xl p-4 mb-4 space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Building2 size={14} className="text-csa-accent" />
                      <span className="text-text-muted">Company:</span>
                      <span className="text-text-primary font-semibold">{lead.Company as string || '\u2014'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <User size={14} className="text-csa-accent" />
                      <span className="text-text-muted">Contact:</span>
                      <span className="text-text-primary font-semibold">{lead.Full_Name as string || '\u2014'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Mail size={14} className="text-text-muted" />
                      <span className="text-text-muted">Email:</span>
                      <span className="text-text-primary">{lead.Email as string || '\u2014'}</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2 mb-5 p-3 bg-warning/5 border border-warning/20 rounded-xl">
                    <AlertTriangle size={14} className="text-warning mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-text-secondary">
                      This will convert the lead into a prospect account with a contact record.
                      All configured workflows will be triggered on the new records.
                    </p>
                  </div>

                  <div className="flex items-center gap-3 justify-end">
                    <button
                      onClick={() => setShowConvertConfirm(false)}
                      className="px-4 py-2 text-xs font-semibold text-text-muted hover:text-text-primary transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleConvert}
                      disabled={converting}
                      className="flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-success rounded-xl hover:bg-success/90 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {converting ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          Converting...
                        </>
                      ) : (
                        <>
                          <ArrowRightLeft size={14} />
                          Convert to Prospect
                        </>
                      )}
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
            {convertResult && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className={`mb-6 p-4 rounded-xl border ${
                  convertResult.success
                    ? 'bg-success/10 border-success/30'
                    : 'bg-error/10 border-error/30'
                }`}
              >
                {convertResult.success ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-success/20 flex items-center justify-center">
                        <Check size={16} className="text-success" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-success">Lead converted to prospect</p>
                        <p className="text-xs text-text-muted">Prospect account and contact created. Workflows have been triggered.</p>
                      </div>
                    </div>
                    <button
                      onClick={() => navigateToAccount(convertResult.accountId!)}
                      className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-csa-accent bg-csa-accent/10 border border-csa-accent/30 rounded-xl hover:bg-csa-accent/20 transition-colors cursor-pointer"
                    >
                      <ExternalLink size={14} />
                      View Account
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-error/20 flex items-center justify-center">
                      <AlertTriangle size={16} className="text-error" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-error">Conversion failed</p>
                      <p className="text-xs text-text-muted">{convertResult.error}</p>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {/* Row 1: Company, Contact, Job Title */}
            <EditableCard label="Company" field="Company" value={lead.Company as string} icon={<Building2 size={14} />}
              editing={editingField === 'Company'} editValue={editValue} saving={saving}
              onEdit={() => startEdit('Company', lead.Company as string || '')}
              onChange={setEditValue} onSave={() => saveField('Company', editValue)} onCancel={cancelEdit}
            />
            <EditableCard label="Contact" field="names" value={lead.Full_Name as string} icon={<User size={14} />}
              editing={editingField === 'names'} editValue={editValue} saving={saving}
              onEdit={() => { setEditingField('names'); setEditValue(`${lead.First_Name as string || ''}|||${lead.Last_Name as string || ''}`); }}
              onChange={setEditValue} onCancel={cancelEdit}
              onSave={async () => {
                const [first, last] = editValue.split('|||');
                setSaving(true);
                try {
                  const res = await fetch(`/api/leads/${selectedLeadId}`, {
                    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ First_Name: first || '', Last_Name: last || '' }),
                  });
                  if (res.ok) {
                    const reload = await fetch(`/api/leads/${selectedLeadId}?source=lead`);
                    const data = await reload.json();
                    setLead(data.lead);
                  }
                } catch { /* handled */ }
                setSaving(false); setEditingField(null); setEditValue('');
              }}
              renderEdit={(
                <div className="flex gap-2">
                  <input type="text" placeholder="First" value={editValue.split('|||')[0] || ''} onChange={e => setEditValue(`${e.target.value}|||${editValue.split('|||')[1] || ''}`)}
                    className="flex-1 bg-csa-dark border border-border-subtle px-2 py-1 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-lg" autoFocus />
                  <input type="text" placeholder="Last" value={editValue.split('|||')[1] || ''} onChange={e => setEditValue(`${editValue.split('|||')[0] || ''}|||${e.target.value}`)}
                    className="flex-1 bg-csa-dark border border-border-subtle px-2 py-1 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-lg" />
                </div>
              )}
            />
            <EditableCard label="Job Title" field="Job_Title3" value={lead.Job_Title3 as string} icon={<Briefcase size={14} />}
              editing={editingField === 'Job_Title3'} editValue={editValue} saving={saving}
              onEdit={() => startEdit('Job_Title3', lead.Job_Title3 as string || '')}
              onChange={setEditValue} onSave={() => saveField('Job_Title3', editValue)} onCancel={cancelEdit}
            />
            {/* Row 2: Email, Phone, Mobile */}
            <EditableCard label="Email" field="Email" value={lead.Email as string} icon={<Mail size={14} />}
              editing={editingField === 'Email'} editValue={editValue} saving={saving}
              onEdit={() => startEdit('Email', lead.Email as string || '')}
              onChange={setEditValue} onSave={() => saveField('Email', editValue)} onCancel={cancelEdit}
              inputType="email"
            />
            <EditableCard label="Phone" field="Phone" value={lead.Phone as string} icon={<Phone size={14} />}
              editing={editingField === 'Phone'} editValue={editValue} saving={saving}
              onEdit={() => startEdit('Phone', lead.Phone as string || '')}
              onChange={setEditValue} onSave={() => saveField('Phone', editValue)} onCancel={cancelEdit}
              inputType="tel"
            />
            <EditableCard label="Mobile" field="Mobile" value={lead.Mobile as string} icon={<Smartphone size={14} />}
              editing={editingField === 'Mobile'} editValue={editValue} saving={saving}
              onEdit={() => startEdit('Mobile', lead.Mobile as string || '')}
              onChange={setEditValue} onSave={() => saveField('Mobile', editValue)} onCancel={cancelEdit}
              inputType="tel"
            />
            {/* Row 3: Website, Country, Industry */}
            <EditableCard label="Website" field="Website" value={lead.Website as string} icon={<Globe size={14} />}
              editing={editingField === 'Website'} editValue={editValue} saving={saving}
              onEdit={() => startEdit('Website', lead.Website as string || '')}
              onChange={setEditValue} onSave={() => saveField('Website', editValue)} onCancel={cancelEdit}
            />
            <InfoCard label="Country" value={lead.Country as string || '\u2014'} icon={<MapPin size={14} />} />
            <EditableCard label="Industry" field="Industry" value={lead.Industry as string} icon={<Factory size={14} />}
              editing={editingField === 'Industry'} editValue={editValue} saving={saving}
              onEdit={() => startEdit('Industry', lead.Industry as string || '')}
              onChange={setEditValue} onSave={() => saveField('Industry', editValue)} onCancel={cancelEdit}
              selectOptions={INDUSTRIES}
            />
            {/* Row 4: Status, Products of Interest, Lead Source */}
            <EditableCard label="Status" field="Lead_Status" value={leadStatus} icon={<Tag size={14} />}
              editing={editingField === 'Lead_Status'} editValue={editValue} saving={saving}
              onEdit={() => startEdit('Lead_Status', leadStatus)}
              onChange={setEditValue} onSave={() => saveField('Lead_Status', editValue)} onCancel={cancelEdit}
              selectOptions={LEAD_STATUSES}
              badge={leadStatus ? (
                <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-md ${STATUS_COLORS[leadStatus] || 'bg-text-muted/20 text-text-muted'}`}>
                  {leadStatus}
                </span>
              ) : undefined}
            />
            <EditableCard label="Products of Interest" field="Product_Interest" value={lead.Product_Interest as string} icon={<Package size={14} />}
              editing={editingField === 'Product_Interest'} editValue={editValue} saving={saving}
              onEdit={() => startEdit('Product_Interest', lead.Product_Interest as string || '')}
              onChange={setEditValue} onSave={() => saveField('Product_Interest', editValue)} onCancel={cancelEdit}
              selectOptions={PRODUCTS_OF_INTEREST}
            />
            <InfoCard label="Lead Source" value={lead.Lead_Source as string || '\u2014'} icon={<Globe size={14} />} />
            {/* Row 5: Reseller, CSA Sales Rep, Created */}
            {editingReseller ? (
              <div className="bg-surface border border-csa-accent/50 rounded-xl px-4 py-3 relative">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-csa-accent uppercase tracking-wider">
                    <Briefcase size={14} />
                    Reseller
                  </div>
                  <button onClick={() => { setEditingReseller(false); setResellerSearch(''); }} className="p-0.5 text-text-muted hover:text-text-primary transition-colors cursor-pointer"><X size={14} /></button>
                </div>
                <input type="text" value={resellerSearch} onChange={e => setResellerSearch(e.target.value)} placeholder="Search resellers..." autoFocus
                  className="w-full bg-csa-dark border border-border-subtle px-3 py-1.5 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-lg mb-1" />
                {savingReseller ? (
                  <div className="flex items-center justify-center py-3"><Loader2 size={16} className="text-csa-accent animate-spin" /></div>
                ) : (
                  <div className="max-h-[160px] overflow-y-auto space-y-0.5">
                    {resellerOptions
                      .filter(r => !resellerSearch || r.name.toLowerCase().includes(resellerSearch.toLowerCase()))
                      .map(r => (
                        <button key={r.id} onClick={() => saveReseller(r.id)}
                          className={`w-full text-left px-2 py-1.5 text-xs rounded-lg transition-colors cursor-pointer ${
                            reseller?.id === r.id ? 'text-csa-accent bg-csa-accent/10' : 'text-text-secondary hover:text-text-primary hover:bg-surface-raised'
                          }`}>
                          {r.name}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-surface border border-border-subtle rounded-xl px-4 py-3 group">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">
                  <Briefcase size={14} />
                  Reseller
                  {canEditReseller ? (
                    <button onClick={() => setEditingReseller(true)} className="ml-1 text-csa-accent hover:text-csa-highlight transition-colors cursor-pointer opacity-0 group-hover:opacity-100">
                      <Pencil size={10} />
                    </button>
                  ) : null}
                </div>
                <p className="text-sm text-text-primary truncate">{reseller?.name || '\u2014'}</p>
              </div>
            )}
            <InfoCard label="CSA Sales Rep" value={owner?.name || '\u2014'} icon={<User size={14} />} />
            <InfoCard label="Created" value={formatDate(lead.Created_Time)} icon={<Clock size={14} />} />
          </motion.div>

          {(lead.Description as string) ? (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-8">
              <h2 className="text-lg font-bold text-text-primary flex items-center gap-2 mb-3">
                <MessageSquare size={18} className="text-csa-accent" />
                Description
              </h2>
              <div className="bg-surface border border-border-subtle rounded-xl p-4">
                <p className="text-sm text-text-secondary whitespace-pre-wrap">{lead.Description as string}</p>
              </div>
            </motion.div>
          ) : null}

          <EmailHistory module="Leads" recordId={selectedLeadId!} />
        </div>
      </div>
    );
  }

  // === PROSPECT VIEW (Account with type=Prospect) ===
  if (!account) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <p className="text-text-muted">Prospect not found</p>
        <button onClick={goBack} className="text-csa-accent text-sm cursor-pointer">Back to Leads</button>
      </div>
    );
  }

  const reseller = account.Reseller as { name?: string; id?: string } | null;
  const owner = account.Owner as { name?: string } | null;
  const primaryContact = account.Primary_Contact as { name?: string; id?: string } | null;
  const secondaryContact = account.Secondary_Contact as { name?: string; id?: string } | null;

  const sortedContacts = [...contacts].sort((a, b) => {
    const aId = a.id as string;
    const bId = b.id as string;
    if (primaryContact?.id && aId === primaryContact.id) return -1;
    if (primaryContact?.id && bId === primaryContact.id) return 1;
    if (secondaryContact?.id && aId === secondaryContact.id) return -1;
    if (secondaryContact?.id && bId === secondaryContact.id) return 1;
    return 0;
  });

  const contactSafePage = Math.min(contactPage, Math.max(1, Math.ceil(sortedContacts.length / contactPageSize)));
  const paginatedContacts = sortedContacts.slice((contactSafePage - 1) * contactPageSize, contactSafePage * contactPageSize);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="flex items-center gap-4 mb-6">
          <button onClick={goBack} className="w-9 h-9 flex items-center justify-center bg-surface-raised rounded-xl hover:bg-surface-overlay transition-colors cursor-pointer">
            <ArrowLeft size={18} className="text-text-secondary" />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-text-primary">{account.Account_Name as string}</h1>
              <div className="relative group/badge">
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-md bg-csa-purple/15 text-csa-purple cursor-help">
                  Prospect
                </span>
                <div className="absolute left-0 top-full mt-1.5 z-20 bg-csa-dark border border-border rounded-xl px-3 py-2 shadow-lg opacity-0 pointer-events-none group-hover/badge:opacity-100 group-hover/badge:pointer-events-auto transition-opacity w-64">
                  <p className="text-[11px] text-text-secondary leading-relaxed">
                    Prospects are potential customers who have active evaluations for our products. They have been set up with an account and may have contacts, assets, and invoices.
                  </p>
                </div>
              </div>
            </div>
            <p className="text-sm text-text-muted">{account.Email_Domain as string || ''}</p>
          </div>
          <a href={crmLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-csa-accent bg-csa-accent/10 border border-csa-accent/30 rounded-xl hover:bg-csa-accent/20 transition-colors cursor-pointer">
            <ExternalLink size={14} />
            Open in CRM
          </a>
        </div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          <InfoCard label="Country" value={account.Billing_Country as string} icon={<MapPin size={14} />} />
          <InfoCard label="Reseller" value={reseller?.name || '\u2014'} icon={<Building2 size={14} />} />
          <InfoCard label="CSA Sales Rep" value={owner?.name || '\u2014'} icon={<User size={14} />} />
          <InfoCard label="Primary Contact" value={primaryContact?.name || '\u2014'} icon={<User size={14} />} />
          <InfoCard label="Secondary Contact" value={secondaryContact?.name || '\u2014'} icon={<User size={14} />} />
          <InfoCard label="Email Domain" value={account.Email_Domain as string || '\u2014'} icon={<Mail size={14} />} />
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="mb-8">
          <h2 className="text-lg font-bold text-text-primary flex items-center gap-2 mb-3">
            <Beaker size={18} className="text-success" />
            Evaluations ({evaluationAssets.length})
          </h2>
          {evaluationAssets.length > 0 ? (
            <div className="border border-border-subtle rounded-xl overflow-hidden">
              <table className="w-full">
                <thead><tr className="bg-surface-raised">
                  <th>Product</th><th>Qty</th><th>Start</th><th>Renewal</th><th>Serial Key</th><th>Status</th><th className="w-10"></th>
                </tr></thead>
                <tbody>
                  {evaluationAssets.map((a, i) => {
                    const product = a.Product as { name?: string } | null;
                    return (
                      <tr key={i}>
                        <td className="text-text-primary">{product?.name || a.Name as string}</td>
                        <td className="text-text-secondary">{a.Quantity as number}</td>
                        <td className="text-text-secondary">{formatDate(a.Start_Date)}</td>
                        <td className="text-text-secondary">{formatDate(a.Renewal_Date)}</td>
                        <td className="text-text-muted text-xs font-mono">{a.Serial_Key as string || '\u2014'}</td>
                        <td>
                          <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-md ${
                            a.Status === 'Active' ? 'bg-success/20 text-success' : 'bg-text-muted/20 text-text-muted'
                          }`}>
                            {a.Status as string}
                          </span>
                        </td>
                        <td>
                          <button
                            onClick={() => setViewingAsset(a)}
                            className="p-1 text-text-muted hover:text-csa-accent transition-colors cursor-pointer"
                          >
                            <Eye size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-text-muted py-4">No evaluation licences</p>
          )}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-8">
          <h2 className="text-lg font-bold text-text-primary flex items-center gap-2 mb-3">
            <User size={18} className="text-csa-accent" />
            Contacts ({contacts.length})
          </h2>
          {sortedContacts.length > 0 ? (
            <>
              <div className="border border-border-subtle rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead><tr className="bg-surface-raised">
                    <th>Name</th><th>Email</th><th>Phone</th><th>Title</th>
                  </tr></thead>
                  <tbody>
                    {paginatedContacts.map((c, i) => {
                      const cId = c.id as string;
                      const isPrimary = primaryContact?.id && cId === primaryContact.id;
                      const isSecondary = secondaryContact?.id && cId === secondaryContact.id;
                      return (
                        <tr key={i}>
                          <td>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-text-primary">{c.Full_Name as string}</span>
                              {isPrimary && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold uppercase rounded bg-warning/20 text-warning">
                                  <Star size={9} /> Primary
                                </span>
                              )}
                              {isSecondary && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold uppercase rounded bg-csa-accent/20 text-csa-accent">
                                  <Star size={9} /> Secondary
                                </span>
                              )}
                            </div>
                          </td>
                          <td><span className="flex items-center gap-1 text-text-secondary"><Mail size={12} className="text-text-muted" />{c.Email as string || '\u2014'}</span></td>
                          <td><span className="flex items-center gap-1 text-text-secondary"><Phone size={12} className="text-text-muted" />{c.Phone as string || '\u2014'}</span></td>
                          <td className="text-text-muted">{c.Title as string || '\u2014'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-2">
                <Pagination currentPage={contactSafePage} totalItems={sortedContacts.length} pageSize={contactPageSize} onPageChange={setContactPage} />
              </div>
            </>
          ) : (
            <p className="text-sm text-text-muted py-4">No contacts found</p>
          )}
        </motion.div>

        <EmailHistory module="Accounts" recordId={selectedLeadId!} />

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
              <FileText size={18} className="text-csa-purple" />
              Invoices ({invoices.length})
            </h2>
            <button
              onClick={() => {
                setNewInvoiceContext({
                  account: { name: account.Account_Name as string, id: selectedLeadId! },
                  contact: primaryContact ? { name: primaryContact.name, id: primaryContact.id } : null,
                  reseller: reseller ? { name: reseller.name, id: reseller.id } : null,
                  region: (account.Reseller_Region as string) || '',
                  currency: (account.Currency as string) || '',
                  owner: owner ? { name: owner.name, id: (account.Owner as { id?: string })?.id } : null,
                  billingCountry: account.Billing_Country as string || '',
                });
                setCurrentView('create-invoice');
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-csa-accent bg-csa-accent/10 border border-csa-accent/30 rounded-xl hover:bg-csa-accent/20 transition-colors cursor-pointer"
            >
              <Plus size={13} />
              New Product Invoice
            </button>
          </div>
          {invoices.length > 0 ? (
            <div className="border border-border-subtle rounded-xl overflow-hidden">
              <table className="w-full">
                <thead><tr className="bg-surface-raised">
                  <th>Invoice #</th><th>Subject</th><th>Date</th><th>Type</th><th>Status</th><th>Total</th><th className="w-10"></th>
                </tr></thead>
                <tbody>
                  {invoices.map((inv, i) => {
                    const currency = inv.Currency as string;
                    const symbol = currency === 'AUD' ? '$' : currency === 'EUR' ? '\u20AC' : currency === 'GBP' ? '\u00A3' : '$';
                    return (
                      <tr
                        key={i}
                        onClick={() => {
                          setSelectedInvoiceId(inv.id as string);
                          setInvoiceReturnView('account-detail');
                          setCurrentView('invoice-detail');
                        }}
                        className="cursor-pointer hover:bg-csa-accent/5 transition-colors"
                      >
                        <td className="text-text-muted text-xs font-mono">{inv.Reference_Number as string || '\u2014'}</td>
                        <td className="font-semibold text-csa-accent">{inv.Subject as string || `Invoice ${inv.id as string}`}</td>
                        <td className="text-text-secondary">{formatDate(inv.Invoice_Date)}</td>
                        <td>
                          <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-md ${
                            inv.Invoice_Type === 'Renewal' ? 'bg-csa-purple/20 text-csa-purple' : 'bg-csa-accent/20 text-csa-accent'
                          }`}>
                            {inv.Invoice_Type as string || 'New'}
                          </span>
                        </td>
                        <td>
                          <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-md ${
                            inv.Status === 'Sent' ? 'bg-success/20 text-success'
                              : inv.Status === 'Approved' ? 'bg-csa-accent/20 text-csa-accent'
                              : 'bg-warning/20 text-warning'
                          }`}>
                            {inv.Status as string}
                          </span>
                        </td>
                        <td className="text-text-primary font-semibold">{symbol}{(inv.Grand_Total as number)?.toFixed(2)}</td>
                        <td><ExternalLink size={14} className="text-text-muted" /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-text-muted py-4">No invoices yet</p>
          )}
        </motion.div>

        {activeAssets.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mb-8">
            <h2 className="text-lg font-bold text-text-primary flex items-center gap-2 mb-3">
              <Package size={18} className="text-success" />
              Assets ({activeAssets.length})
            </h2>
            <div className="border border-border-subtle rounded-xl overflow-hidden">
              <table className="w-full">
                <thead><tr className="bg-surface-raised">
                  <th>Product</th><th>Qty</th><th>Start</th><th>Renewal</th><th>Serial Key</th><th>Status</th><th className="w-10"></th>
                </tr></thead>
                <tbody>
                  {activeAssets.map((a, i) => {
                    const product = a.Product as { name?: string } | null;
                    return (
                      <tr key={i}>
                        <td className="text-text-primary">{product?.name || a.Name as string}</td>
                        <td className="text-text-secondary">{a.Quantity as number}</td>
                        <td className="text-text-secondary">{formatDate(a.Start_Date)}</td>
                        <td className="text-text-secondary">{formatDate(a.Renewal_Date)}</td>
                        <td className="text-text-muted text-xs font-mono">{a.Serial_Key as string || '\u2014'}</td>
                        <td>
                          <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-md ${
                            a.Status === 'Active' ? 'bg-success/20 text-success' : 'bg-text-muted/20 text-text-muted'
                          }`}>
                            {a.Status as string}
                          </span>
                        </td>
                        <td>
                          <button
                            onClick={() => setViewingAsset(a)}
                            className="p-1 text-text-muted hover:text-csa-accent transition-colors cursor-pointer"
                          >
                            <Eye size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </div>

      {viewingAsset && (
        <AssetDetailModal
          assetId={viewingAsset.id as string}
          assetData={viewingAsset}
          onClose={() => setViewingAsset(null)}
          onAssetUpdated={() => {
            if (selectedLeadId && selectedLeadSource) {
              fetch(`/api/leads/${selectedLeadId}?source=${selectedLeadSource}`)
                .then(res => res.json())
                .then(data => {
                  if (data.source === 'prospect') {
                    setEvaluationAssets(data.evaluationAssets || []);
                    setActiveAssets(data.activeAssets || []);
                    setArchivedAssets(data.archivedAssets || []);
                  }
                })
                .catch(() => {});
            }
          }}
        />
      )}
    </div>
  );
}

function InfoCard({ label, value, icon, badge }: { label: string; value: string; icon: React.ReactNode; badge?: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border-subtle rounded-xl px-4 py-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">
        {icon}
        {label}
      </div>
      {badge || <p className="text-sm text-text-primary truncate">{value || '\u2014'}</p>}
    </div>
  );
}

function EditableCard({ label, field, value, icon, badge, editing, editValue, saving, onEdit, onChange, onSave, onCancel, inputType, selectOptions, renderEdit }: {
  label: string; field: string; value: string; icon: React.ReactNode; badge?: React.ReactNode;
  editing: boolean; editValue: string; saving: boolean;
  onEdit: () => void; onChange: (v: string) => void; onSave: () => void; onCancel: () => void;
  inputType?: string; selectOptions?: string[]; renderEdit?: React.ReactNode;
}) {
  if (editing) {
    return (
      <div className="bg-surface border border-csa-accent/50 rounded-xl px-4 py-3">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-csa-accent uppercase tracking-wider">
            {icon}
            {label}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={onCancel} className="p-0.5 text-text-muted hover:text-text-primary transition-colors cursor-pointer"><X size={14} /></button>
            <button onClick={onSave} disabled={saving} className="p-0.5 text-success hover:text-success/80 transition-colors cursor-pointer disabled:opacity-50">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            </button>
          </div>
        </div>
        {renderEdit || (selectOptions ? (
          <select value={editValue} onChange={e => onChange(e.target.value)} autoFocus
            className="w-full bg-csa-dark border border-border-subtle px-2 py-1.5 text-sm text-text-primary outline-none focus:border-csa-accent transition-colors rounded-lg appearance-none cursor-pointer">
            <option value="">— None —</option>
            {selectOptions.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : (
          <input type={inputType || 'text'} value={editValue} onChange={e => onChange(e.target.value)} autoFocus
            onKeyDown={e => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel(); }}
            className="w-full bg-csa-dark border border-border-subtle px-2 py-1.5 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="bg-surface border border-border-subtle rounded-xl px-4 py-3 group">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">
        {icon}
        {label}
        <button onClick={onEdit} className="ml-1 text-csa-accent hover:text-csa-highlight transition-colors cursor-pointer opacity-0 group-hover:opacity-100">
          <Pencil size={10} />
        </button>
      </div>
      {badge || <p className="text-sm text-text-primary truncate">{value || '\u2014'}</p>}
    </div>
  );
}
