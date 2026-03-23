/**
 * AccountDetailView — Full account profile with contacts, assets, and invoices.
 *
 * Features:
 * - Account info card with editable billing address and reseller assignment
 * - Contacts list with add/remove, primary/secondary role assignment
 * - Active assets table with renewal invoice generation (select assets -> generate)
 * - Archived assets section (collapsed by default)
 * - Invoice history with links to InvoiceDetailView
 * - "New Invoice" button that pre-fills CreateInvoiceView with account context
 * - Asset detail modal (click any asset to view QLM licence details)
 * - XLSX export (full account, contacts only, invoices only, or assets only)
 * - Direct link to the account in Zoho CRM
 *
 * Data: Fetches from /api/accounts/[id] which returns account + related records.
 * Permissions: Address/reseller editing is admin/ibm only.
 */

'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Building2, User, Package, Loader2, ExternalLink, Mail, Phone, MapPin, FileText, Star, Plus, X, RefreshCw, Eye, Pencil, Save, Download, Beaker, Send } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { exportFullAccount, exportContacts, exportInvoices, exportAssets } from '@/lib/export-account';
import { useAppStore } from '@/lib/store';
import Pagination from '../Pagination';
import AssetDetailModal from '../AssetDetailModal';
import CreateEvaluationModal from '../CreateEvaluationModal';
import EmailHistory from '../EmailHistory';

interface ResellerOption {
  id: string;
  name: string;
  region: string;
}

export default function AccountDetailView() {
  const { user, selectedAccountId, setCurrentView, setSelectedInvoiceId, setInvoiceReturnView, setNewInvoiceContext } = useAppStore();
  const [account, setAccount] = useState<Record<string, unknown> | null>(null);
  const [contacts, setContacts] = useState<Record<string, unknown>[]>([]);
  const [evaluationAssets, setEvaluationAssets] = useState<Record<string, unknown>[]>([]);
  const [activeAssets, setActiveAssets] = useState<Record<string, unknown>[]>([]);
  const [archivedAssets, setArchivedAssets] = useState<Record<string, unknown>[]>([]);
  const [invoices, setInvoices] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [contactPage, setContactPage] = useState(1);
  const contactPageSize = 10;

  // Add contact form
  const [showAddContact, setShowAddContact] = useState(false);
  const [newContact, setNewContact] = useState({ First_Name: '', Last_Name: '', Email: '', Phone: '' });
  const [addingContact, setAddingContact] = useState(false);
  const [updatingRole, setUpdatingRole] = useState<string | null>(null);

  // Renewal generation
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());
  const [generatingRenewal, setGeneratingRenewal] = useState(false);
  const [viewingAsset, setViewingAsset] = useState<Record<string, unknown> | null>(null);
  const [showEvalModal, setShowEvalModal] = useState(false);

  // Send keys state
  const [sendKeysConfirm, setSendKeysConfirm] = useState<'customer' | 'reseller' | null>(null);
  const [sendingKeys, setSendingKeys] = useState(false);
  const [sendKeysResult, setSendKeysResult] = useState<{ success: boolean; message: string } | null>(null);

  // Asset pagination
  const [activeAssetPage, setActiveAssetPage] = useState(1);
  const [archivedAssetPage, setArchivedAssetPage] = useState(1);
  const assetPageSize = 20;

  // Address editing
  const [editingAddress, setEditingAddress] = useState(false);
  const [editAddress, setEditAddress] = useState({ street: '', city: '', state: '', code: '', country: '' });
  const [savingAddress, setSavingAddress] = useState(false);

  // Reseller editing
  const [editingReseller, setEditingReseller] = useState(false);
  const [resellerOptions, setResellerOptions] = useState<ResellerOption[]>([]);
  const [resellerSearch, setResellerSearch] = useState('');
  const [savingReseller, setSavingReseller] = useState(false);

  const isAdmin = user?.role === 'admin' || user?.role === 'ibm';
  const hasChildResellers = user?.permissions?.canViewChildRecords;
  const canEditReseller = isAdmin || hasChildResellers;

  useEffect(() => {
    if (!selectedAccountId) return;
    setLoading(true);

    fetch(`/api/accounts/${selectedAccountId}`)
      .then(res => res.json())
      .then(data => {
        setAccount(data.account);
        setContacts(data.contacts || []);
        setEvaluationAssets(data.evaluationAssets || []);
        setActiveAssets(data.activeAssets || []);
        setArchivedAssets(data.archivedAssets || []);
        setInvoices(data.invoices || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedAccountId]);

  const goBack = () => setCurrentView('accounts');

  const handleAddContact = async () => {
    if (!newContact.First_Name || !newContact.Last_Name) return;
    setAddingContact(true);
    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newContact,
          Account_Name: { id: selectedAccountId },
        }),
      });
      if (res.ok) {
        // Reload account data to get fresh contacts
        const reload = await fetch(`/api/accounts/${selectedAccountId}`);
        const data = await reload.json();
        setContacts(data.contacts || []);
        setNewContact({ First_Name: '', Last_Name: '', Email: '', Phone: '' });
        setShowAddContact(false);
      }
    } catch { /* handled by UI */ }
    setAddingContact(false);
  };

  const toggleAsset = (id: string) => {
    setSelectedAssets(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isEligibleForRenewal = (a: Record<string, unknown>) => {
    if (a.Upgraded_To_Key) return false;
    if (a.Revoked) return false;
    const productName = ((a.Product as { name?: string })?.name || a.Name as string || '').toLowerCase();
    if (a.Evaluation_License || productName.includes('evaluation')) return false;
    if (a.Educational_License || productName.includes('educational')) return false;
    if (productName.includes('nfr')) return false;
    if (productName.includes('home use') && !productName.includes('civil site design plus')) return false;
    return true;
  };

  const getIneligibleReason = (a: Record<string, unknown>): string | null => {
    if (a.Upgraded_To_Key) return 'Upgraded assets are not eligible for renewal';
    if (a.Revoked) return `Revoked: ${(a.Revoked_Reason as string) || 'No reason provided'}`;
    const productName = ((a.Product as { name?: string })?.name || a.Name as string || '').toLowerCase();
    if (a.Evaluation_License || productName.includes('evaluation')) return 'Evaluation assets are not eligible for renewal';
    if (a.Educational_License || productName.includes('educational')) return 'Educational assets are not eligible for renewal';
    if (productName.includes('nfr')) return 'NFR assets are not eligible for renewal';
    if (productName.includes('home use') && !productName.includes('civil site design plus')) return 'Home Use assets are not eligible for renewal';
    return null;
  };

  const allAssetIds = [...activeAssets, ...archivedAssets].map(a => a.id as string);
  const allAssetsMap = Object.fromEntries([...activeAssets, ...archivedAssets].map(a => [a.id as string, a]));

  // Check if any selected asset is ineligible for renewal
  const selectedIneligible = Array.from(selectedAssets)
    .map(id => allAssetsMap[id])
    .filter(a => a && !isEligibleForRenewal(a));
  const renewalBlocked = selectedIneligible.length > 0;
  const renewalBlockReasons = [...new Set(selectedIneligible.map(a => getIneligibleReason(a)).filter(Boolean))] as string[];

  const toggleAllAssets = () => {
    if (selectedAssets.size === allAssetIds.length) {
      setSelectedAssets(new Set());
    } else {
      setSelectedAssets(new Set(allAssetIds));
    }
  };

  const generateRenewal = async () => {
    if (selectedAssets.size === 0) return;
    setGeneratingRenewal(true);
    try {
      const res = await fetch('/api/renewals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset_ids: Array.from(selectedAssets) }),
      });
      const data = await res.json();
      if (data.invoiceId) {
        setSelectedInvoiceId(data.invoiceId);
        setInvoiceReturnView('account-detail');
        setCurrentView('invoice-detail');
      } else {
        // Reload account to see the new invoice in the list
        const reload = await fetch(`/api/accounts/${selectedAccountId}`);
        const reloadData = await reload.json();
        setAccount(reloadData.account);
        setInvoices(reloadData.invoices || []);
        setEvaluationAssets(reloadData.evaluationAssets || []);
        setActiveAssets(reloadData.activeAssets || []);
        setSelectedAssets(new Set());
      }
    } catch { /* handled by UI */ }
    setGeneratingRenewal(false);
  };

  const sendKeys = async (toCustomer: boolean) => {
    if (selectedAssets.size === 0) return;
    setSendingKeys(true);
    setSendKeysResult(null);
    try {
      const res = await fetch('/api/send-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetIds: Array.from(selectedAssets),
          sendToCustomer: toCustomer,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSendKeysResult({ success: true, message: `Keys sent to ${toCustomer ? 'customer' : 'reseller'} successfully` });
        setSelectedAssets(new Set());
      } else {
        setSendKeysResult({ success: false, message: data.error || 'Failed to send keys' });
      }
    } catch {
      setSendKeysResult({ success: false, message: 'Failed to send keys' });
    }
    setSendingKeys(false);
    setSendKeysConfirm(null);
    setTimeout(() => setSendKeysResult(null), 5000);
  };

  const setContactRole = async (contactId: string, role: 'primary' | 'secondary') => {
    setUpdatingRole(contactId + role);
    try {
      const body: Record<string, unknown> = {};
      if (role === 'primary') body.Primary_Contact = contactId;
      else body.Secondary_Contact = contactId;

      const res = await fetch(`/api/accounts/${selectedAccountId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        // Reload account to get updated primary/secondary
        const reload = await fetch(`/api/accounts/${selectedAccountId}`);
        const data = await reload.json();
        setAccount(data.account);
        setContacts(data.contacts || []);
      }
    } catch { /* handled by UI */ }
    setUpdatingRole(null);
  };

  // Load resellers for dropdown when editing starts
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

  const saveReseller = async (resellerId: string) => {
    setSavingReseller(true);
    try {
      const res = await fetch(`/api/accounts/${selectedAccountId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Reseller: resellerId }),
      });
      if (res.ok) {
        const reload = await fetch(`/api/accounts/${selectedAccountId}`);
        const data = await reload.json();
        setAccount(data.account);
        setEditingReseller(false);
        setResellerSearch('');
      }
    } catch { /* handled */ }
    setSavingReseller(false);
  };

  const startEditAddress = () => {
    if (!account) return;
    setEditAddress({
      street: account.Billing_Street as string || '',
      city: account.Billing_City as string || '',
      state: account.Billing_State as string || '',
      code: account.Billing_Code as string || '',
      country: account.Billing_Country as string || '',
    });
    setEditingAddress(true);
  };

  const saveAddress = async () => {
    setSavingAddress(true);
    try {
      const res = await fetch(`/api/accounts/${selectedAccountId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          Billing_Street: editAddress.street,
          Billing_City: editAddress.city,
          Billing_State: editAddress.state,
          Billing_Code: editAddress.code,
          Billing_Country: editAddress.country,
        }),
      });
      if (res.ok) {
        const reload = await fetch(`/api/accounts/${selectedAccountId}`);
        const data = await reload.json();
        setAccount(data.account);
        setEditingAddress(false);
      }
    } catch { /* handled */ }
    setSavingAddress(false);
  };

  const crmLink = `https://crm.zoho.com.au/crm/org7002802215/tab/Accounts/${selectedAccountId}`;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={24} className="text-csa-accent animate-spin" />
      </div>
    );
  }

  if (!account) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <p className="text-text-muted">Account not found</p>
        <button onClick={goBack} className="text-csa-accent text-sm cursor-pointer">Back to Accounts</button>
      </div>
    );
  }

  const reseller = account.Reseller as { name?: string } | null;
  const owner = account.Owner as { name?: string } | null;
  const primaryContact = account.Primary_Contact as { name?: string; id?: string } | null;
  const secondaryContact = account.Secondary_Contact as { name?: string; id?: string } | null;

  // Sort contacts: primary first, secondary second, then rest
  const sortedContacts = [...contacts].sort((a, b) => {
    const aId = a.id as string;
    const bId = b.id as string;
    const aIsPrimary = primaryContact?.id && aId === primaryContact.id;
    const bIsPrimary = primaryContact?.id && bId === primaryContact.id;
    const aIsSecondary = secondaryContact?.id && aId === secondaryContact.id;
    const bIsSecondary = secondaryContact?.id && bId === secondaryContact.id;
    if (aIsPrimary) return -1;
    if (bIsPrimary) return 1;
    if (aIsSecondary) return -1;
    if (bIsSecondary) return 1;
    return 0;
  });

  const contactSafePage = Math.min(contactPage, Math.max(1, Math.ceil(sortedContacts.length / contactPageSize)));
  const paginatedContacts = sortedContacts.slice((contactSafePage - 1) * contactPageSize, contactSafePage * contactPageSize);

  const formatDate = (d: unknown) => {
    if (!d || typeof d !== 'string') return '—';
    const date = new Date(d);
    return `${String(date.getDate()).padStart(2,'0')}/${String(date.getMonth()+1).padStart(2,'0')}/${date.getFullYear()}`;
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button onClick={goBack} className="w-9 h-9 flex items-center justify-center bg-surface-raised rounded-xl hover:bg-surface-overlay transition-colors cursor-pointer">
            <ArrowLeft size={18} className="text-text-secondary" />
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-text-primary">{account.Account_Name as string}</h1>
            <p className="text-sm text-text-muted">{account.Email_Domain as string || ''}</p>
          </div>
          <div className="flex items-center gap-2">
            {user?.permissions?.canExportData && (
              <button
                onClick={() => exportFullAccount(account, contacts, invoices, activeAssets, archivedAssets, primaryContact?.id, secondaryContact?.id)}
                className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-success bg-success/10 border border-success/30 rounded-xl hover:bg-success/20 transition-colors cursor-pointer"
              >
                <Download size={14} />
                Export All
              </button>
            )}
            <a href={crmLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-csa-accent bg-csa-accent/10 border border-csa-accent/30 rounded-xl hover:bg-csa-accent/20 transition-colors cursor-pointer">
              <ExternalLink size={14} />
              Open in CRM
            </a>
          </div>
        </div>

        {/* Account Info */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          <InfoCard label="Country" value={account.Billing_Country as string} icon={<MapPin size={14} />} />
          {editingReseller ? (
            <div className="bg-surface border border-csa-accent/50 rounded-xl px-4 py-3 relative">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-csa-accent uppercase tracking-wider">
                  <Building2 size={14} />
                  Reseller
                </div>
                <button onClick={() => { setEditingReseller(false); setResellerSearch(''); }} className="p-0.5 text-text-muted hover:text-text-primary transition-colors cursor-pointer"><X size={14} /></button>
              </div>
              <input
                type="text"
                value={resellerSearch}
                onChange={e => setResellerSearch(e.target.value)}
                placeholder="Search resellers..."
                autoFocus
                className="w-full bg-csa-dark border border-border-subtle px-3 py-1.5 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-lg mb-1"
              />
              {savingReseller ? (
                <div className="flex items-center justify-center py-3">
                  <Loader2 size={16} className="text-csa-accent animate-spin" />
                </div>
              ) : (
                <div className="max-h-[160px] overflow-y-auto space-y-0.5">
                  {resellerOptions
                    .filter(r => !resellerSearch || r.name.toLowerCase().includes(resellerSearch.toLowerCase()))
                    .map(r => (
                      <button
                        key={r.id}
                        onClick={() => saveReseller(r.id)}
                        className={`w-full text-left px-2 py-1.5 text-xs rounded-lg transition-colors cursor-pointer ${
                          (account.Reseller as { id?: string })?.id === r.id
                            ? 'text-csa-accent bg-csa-accent/10'
                            : 'text-text-secondary hover:text-text-primary hover:bg-surface-raised'
                        }`}
                      >
                        {r.name}
                      </button>
                    ))}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-surface border border-border-subtle rounded-xl px-4 py-3 group">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">
                <Building2 size={14} />
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
          <InfoCard label="CSA Sales Rep" value={owner?.name || '—'} icon={<User size={14} />} />
          <InfoCard label="Primary Contact" value={primaryContact?.name || '—'} icon={<User size={14} />} />
          <InfoCard label="Secondary Contact" value={secondaryContact?.name || '—'} icon={<User size={14} />} />
          <InfoCard label="Email Domain" value={account.Email_Domain as string || '—'} icon={<Mail size={14} />} />
          {editingAddress ? (
            <div className="bg-surface border border-csa-accent/50 rounded-xl px-4 py-3 col-span-1 md:col-span-2 lg:col-span-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-csa-accent uppercase tracking-wider">
                  <MapPin size={14} />
                  Edit Address
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setEditingAddress(false)} className="p-1 text-text-muted hover:text-text-primary transition-colors cursor-pointer"><X size={14} /></button>
                  <button onClick={saveAddress} disabled={savingAddress} className="p-1 text-success hover:text-success/80 transition-colors cursor-pointer disabled:opacity-50">
                    {savingAddress ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
                <input type="text" placeholder="Street" value={editAddress.street} onChange={e => setEditAddress(p => ({ ...p, street: e.target.value }))}
                  className="col-span-2 bg-csa-dark border border-border-subtle px-3 py-1.5 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-lg" />
                <input type="text" placeholder="City" value={editAddress.city} onChange={e => setEditAddress(p => ({ ...p, city: e.target.value }))}
                  className="bg-csa-dark border border-border-subtle px-3 py-1.5 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-lg" />
                <input type="text" placeholder="State" value={editAddress.state} onChange={e => setEditAddress(p => ({ ...p, state: e.target.value }))}
                  className="bg-csa-dark border border-border-subtle px-3 py-1.5 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-lg" />
                <input type="text" placeholder="Post Code" value={editAddress.code} onChange={e => setEditAddress(p => ({ ...p, code: e.target.value }))}
                  className="bg-csa-dark border border-border-subtle px-3 py-1.5 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-lg" />
              </div>
            </div>
          ) : (
            <div className="bg-surface border border-border-subtle rounded-xl px-4 py-3 group relative">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">
                <MapPin size={14} />
                Address
                <button onClick={startEditAddress} className="ml-1 text-csa-accent hover:text-csa-highlight transition-colors cursor-pointer opacity-0 group-hover:opacity-100">
                  <Pencil size={10} />
                </button>
              </div>
              <p className="text-sm text-text-primary truncate">
                {[account.Billing_Street, account.Billing_City, account.Billing_State, account.Billing_Code].filter(Boolean).join(', ') || '\u2014'}
              </p>
              {(account.Billing_Street || account.Billing_City || account.Billing_State || account.Billing_Code) ? (
                <div className="absolute left-0 top-full mt-1 z-10 bg-csa-dark border border-border rounded-xl px-4 py-3 shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity w-max max-w-xs">
                  {account.Billing_Street ? <div className="text-xs text-text-secondary mb-1"><span className="text-text-muted">Street:</span> {account.Billing_Street as string}</div> : null}
                  {account.Billing_City ? <div className="text-xs text-text-secondary mb-1"><span className="text-text-muted">City:</span> {account.Billing_City as string}</div> : null}
                  {account.Billing_State ? <div className="text-xs text-text-secondary mb-1"><span className="text-text-muted">State:</span> {account.Billing_State as string}</div> : null}
                  {account.Billing_Code ? <div className="text-xs text-text-secondary"><span className="text-text-muted">Post Code:</span> {account.Billing_Code as string}</div> : null}
                </div>
              ) : null}
            </div>
          )}
        </motion.div>

        {/* Contacts */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
              <User size={18} className="text-csa-accent" />
              Contacts ({contacts.length})
            </h2>
            <div className="flex items-center gap-2">
              {contacts.length > 0 && user?.permissions?.canExportData ? (
                <button onClick={() => exportContacts(contacts, account.Account_Name as string, primaryContact?.id, secondaryContact?.id)} className="p-1.5 text-text-muted hover:text-success transition-colors cursor-pointer" title="Export Contacts">
                  <Download size={14} />
                </button>
              ) : null}
              {!showAddContact ? (
                <button
                  onClick={() => setShowAddContact(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-csa-accent bg-csa-accent/10 border border-csa-accent/30 rounded-xl hover:bg-csa-accent/20 transition-colors cursor-pointer"
                >
                  <Plus size={13} />
                  Add Contact
                </button>
              ) : null}
            </div>
          </div>

          {/* Add Contact Form */}
          {showAddContact ? (
            <div className="bg-surface border border-csa-accent/30 rounded-xl p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-text-primary">New Contact</span>
                <button onClick={() => { setShowAddContact(false); setNewContact({ First_Name: '', Last_Name: '', Email: '', Phone: '' }); }} className="p-1 text-text-muted hover:text-text-primary transition-colors cursor-pointer">
                  <X size={16} />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <input
                  type="text"
                  placeholder="First Name *"
                  value={newContact.First_Name}
                  onChange={(e) => setNewContact(p => ({ ...p, First_Name: e.target.value }))}
                  className="bg-csa-dark border border-border-subtle px-3 py-2 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-lg"
                />
                <input
                  type="text"
                  placeholder="Last Name *"
                  value={newContact.Last_Name}
                  onChange={(e) => setNewContact(p => ({ ...p, Last_Name: e.target.value }))}
                  className="bg-csa-dark border border-border-subtle px-3 py-2 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-lg"
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={newContact.Email}
                  onChange={(e) => setNewContact(p => ({ ...p, Email: e.target.value }))}
                  className="bg-csa-dark border border-border-subtle px-3 py-2 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-lg"
                />
                <input
                  type="tel"
                  placeholder="Phone"
                  value={newContact.Phone}
                  onChange={(e) => setNewContact(p => ({ ...p, Phone: e.target.value }))}
                  className="bg-csa-dark border border-border-subtle px-3 py-2 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-lg"
                />
              </div>
              <button
                onClick={handleAddContact}
                disabled={addingContact || !newContact.First_Name || !newContact.Last_Name}
                className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-success bg-success/10 border border-success/30 rounded-xl hover:bg-success/20 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {addingContact ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {addingContact ? 'Creating...' : 'Create Contact'}
              </button>
            </div>
          ) : null}

          {sortedContacts.length > 0 ? (
            <>
              <div className="border border-border-subtle rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead><tr className="bg-surface-raised">
                    <th>Name</th><th>Email</th><th>Phone</th><th>Title</th><th>Set As</th>
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
                              {isPrimary ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold uppercase rounded bg-warning/20 text-warning">
                                  <Star size={9} />
                                  Primary
                                </span>
                              ) : null}
                              {isSecondary ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold uppercase rounded bg-csa-accent/20 text-csa-accent">
                                  <Star size={9} />
                                  Secondary
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td><span className="flex items-center gap-1 text-text-secondary"><Mail size={12} className="text-text-muted" />{c.Email as string || '\u2014'}</span></td>
                          <td><span className="flex items-center gap-1 text-text-secondary"><Phone size={12} className="text-text-muted" />{c.Phone as string || '\u2014'}</span></td>
                          <td className="text-text-muted">{c.Title as string || '\u2014'}</td>
                          <td>
                            <div className="flex items-center gap-1">
                              {!isPrimary ? (
                                <button
                                  onClick={() => setContactRole(cId, 'primary')}
                                  disabled={updatingRole === cId + 'primary'}
                                  className="px-2 py-0.5 text-[10px] font-semibold text-warning/70 hover:text-warning hover:bg-warning/10 rounded transition-colors cursor-pointer disabled:opacity-40"
                                >
                                  {updatingRole === cId + 'primary' ? '...' : 'Primary'}
                                </button>
                              ) : null}
                              {!isSecondary ? (
                                <button
                                  onClick={() => setContactRole(cId, 'secondary')}
                                  disabled={updatingRole === cId + 'secondary'}
                                  className="px-2 py-0.5 text-[10px] font-semibold text-csa-accent/70 hover:text-csa-accent hover:bg-csa-accent/10 rounded transition-colors cursor-pointer disabled:opacity-40"
                                >
                                  {updatingRole === cId + 'secondary' ? '...' : 'Secondary'}
                                </button>
                              ) : null}
                            </div>
                          </td>
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

        {/* Invoices */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
              <FileText size={18} className="text-csa-purple" />
              Invoices ({invoices.length})
            </h2>
            <div className="flex items-center gap-2">
              {invoices.length > 0 && user?.permissions?.canExportData ? (
                <button onClick={() => exportInvoices(invoices, account.Account_Name as string)} className="p-1.5 text-text-muted hover:text-success transition-colors cursor-pointer" title="Export Invoices">
                  <Download size={14} />
                </button>
              ) : null}
              <button
                onClick={() => {
                  setNewInvoiceContext({
                    account: { name: account.Account_Name as string, id: selectedAccountId },
                  contact: primaryContact ? { name: primaryContact.name, id: primaryContact.id } : null,
                  reseller: reseller ? { name: reseller.name, id: (account.Reseller as { id?: string })?.id } : null,
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
                            inv.Invoice_Type === 'Renewal'
                              ? 'bg-csa-purple/20 text-csa-purple'
                              : 'bg-csa-accent/20 text-csa-accent'
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
                        <td>
                          <ExternalLink size={14} className="text-text-muted" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-text-muted py-4">No invoices found</p>
          )}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <EmailHistory module="Contacts" contactIds={contacts.map(c => c.id as string)} />
        </motion.div>

        {/* Evaluations */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }} className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
              <Beaker size={18} className="text-success" />
              Evaluations ({evaluationAssets.length})
            </h2>
            {user?.permissions?.canCreateEvaluations && (
              <button
                onClick={() => setShowEvalModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-success bg-success/10 border border-success/30 rounded-xl hover:bg-success/20 transition-colors cursor-pointer"
              >
                <Beaker size={13} />
                Create Evaluation
              </button>
            )}
          </div>
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
                          <button onClick={() => setViewingAsset(a)} className="p-1 text-text-muted hover:text-csa-accent transition-colors cursor-pointer">
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
            <p className="text-sm text-text-muted py-4">No evaluations</p>
          )}
        </motion.div>

        {/* Active Assets */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
                <Package size={18} className="text-success" />
                Active Assets ({activeAssets.length})
              </h2>
              {(activeAssets.length > 0 || archivedAssets.length > 0) && user?.permissions?.canExportData ? (
                <button onClick={() => exportAssets(activeAssets, archivedAssets, account.Account_Name as string)} className="p-1.5 text-text-muted hover:text-success transition-colors cursor-pointer" title="Export Assets">
                  <Download size={14} />
                </button>
              ) : null}
            </div>
            {selectedAssets.size > 0 ? (
              <div className="flex items-center gap-2">
                <div className="relative group">
                  <button
                    onClick={generateRenewal}
                    disabled={generatingRenewal || sendingKeys || renewalBlocked}
                    className="flex items-center gap-2 px-4 py-1.5 text-xs font-semibold text-csa-purple bg-csa-purple/10 border border-csa-purple/30 rounded-xl hover:bg-csa-purple/20 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {generatingRenewal ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    {generatingRenewal ? 'Generating...' : `Generate Renewal (${selectedAssets.size})`}
                  </button>
                  {renewalBlocked && (
                    <div className="absolute left-0 top-full mt-1.5 z-20 bg-csa-dark border border-border rounded-xl px-3 py-2 shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity w-72">
                      <p className="text-[10px] font-semibold text-warning mb-1">Cannot generate renewal:</p>
                      {renewalBlockReasons.map((r, i) => (
                        <p key={i} className="text-[10px] text-text-secondary leading-relaxed">&#x2022; {r}</p>
                      ))}
                      <p className="text-[10px] text-text-muted mt-1">Deselect ineligible assets to enable renewals.</p>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setSendKeysConfirm('reseller')}
                  disabled={sendingKeys || generatingRenewal}
                  className="flex items-center gap-2 px-4 py-1.5 text-xs font-semibold text-csa-accent bg-csa-accent/10 border border-csa-accent/30 rounded-xl hover:bg-csa-accent/20 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Send size={13} /> Send Keys to Reseller
                </button>
                <button
                  onClick={() => setSendKeysConfirm('customer')}
                  disabled={sendingKeys || generatingRenewal}
                  className="flex items-center gap-2 px-4 py-1.5 text-xs font-semibold text-warning bg-warning/10 border border-warning/30 rounded-xl hover:bg-warning/20 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Send size={13} /> Send Keys to Customer
                </button>
              </div>
            ) : null}
          </div>
          {activeAssets.length > 0 ? (
            <>
            <div className="border border-border-subtle rounded-xl overflow-hidden">
              <table className="w-full">
                <thead><tr className="bg-surface-raised">
                  <th className="w-10">
                    <input
                      type="checkbox"
                      checked={selectedAssets.size === allAssetIds.length && allAssetIds.length > 0}
                      onChange={toggleAllAssets}
                      className="w-4 h-4 rounded border-border-subtle accent-csa-purple cursor-pointer"
                    />
                  </th>
                  <th>Product</th><th>Qty</th><th>Start</th><th>Renewal</th><th>Serial Key</th><th>Upgraded To</th><th className="w-10"></th>
                </tr></thead>
                <tbody>
                  {activeAssets.slice((activeAssetPage - 1) * assetPageSize, activeAssetPage * assetPageSize).map((a, i) => {
                    const product = a.Product as { name?: string } | null;
                    const assetId = a.id as string;
                    const isSelected = selectedAssets.has(assetId);
                    const upgradedTo = a.Upgraded_To_Key as string | null;
                    return (
                      <tr
                        key={i}
                        onClick={() => toggleAsset(assetId)}
                        className={`transition-colors cursor-pointer ${isSelected ? 'bg-csa-purple/8' : 'hover:bg-csa-accent/5'}`}
                      >
                        <td>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleAsset(assetId)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-4 h-4 rounded border-border-subtle accent-csa-purple cursor-pointer"
                          />
                        </td>
                        <td className="text-text-primary">{product?.name || a.Name as string}</td>
                        <td className="text-text-secondary">{a.Quantity as number}</td>
                        <td className="text-text-secondary">{formatDate(a.Start_Date)}</td>
                        <td className="text-text-secondary">{formatDate(a.Renewal_Date)}</td>
                        <td className="text-text-muted text-xs font-mono">{a.Serial_Key as string || '\u2014'}</td>
                        <td className="text-text-muted text-xs font-mono">{upgradedTo || '\u2014'}</td>
                        <td>
                          <button
                            onClick={(e) => { e.stopPropagation(); setViewingAsset(a); }}
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
            <div className="mt-2">
              <Pagination currentPage={Math.min(activeAssetPage, Math.max(1, Math.ceil(activeAssets.length / assetPageSize)))} totalItems={activeAssets.length} pageSize={assetPageSize} onPageChange={setActiveAssetPage} />
            </div>
            </>
          ) : (
            <p className="text-sm text-text-muted py-4">No active assets</p>
          )}
        </motion.div>

        {/* Archived Assets */}
        {archivedAssets.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
            <h2 className="text-lg font-bold text-text-primary mb-3 flex items-center gap-2">
              <Package size={18} className="text-text-muted" />
              Archived Assets ({archivedAssets.length})
            </h2>
            <div className="border border-border-subtle rounded-xl overflow-hidden opacity-70">
              <table className="w-full">
                <thead><tr className="bg-surface-raised">
                  <th className="w-10">
                    <input
                      type="checkbox"
                      checked={archivedAssets.length > 0 && archivedAssets.every(a => selectedAssets.has(a.id as string))}
                      onChange={() => {
                        const archivedIds = archivedAssets.map(a => a.id as string);
                        const allSelected = archivedIds.every(id => selectedAssets.has(id));
                        const next = new Set(selectedAssets);
                        if (allSelected) { archivedIds.forEach(id => next.delete(id)); }
                        else { archivedIds.forEach(id => next.add(id)); }
                        setSelectedAssets(next);
                      }}
                      className="w-4 h-4 rounded border-border-subtle accent-csa-purple cursor-pointer"
                    />
                  </th><th>Product</th><th>Qty</th><th>Start</th><th>Renewal</th><th>Status</th><th>Upgraded To</th><th className="w-10"></th>
                </tr></thead>
                <tbody>
                  {archivedAssets.slice((archivedAssetPage - 1) * assetPageSize, archivedAssetPage * assetPageSize).map((a, i) => {
                    const product = a.Product as { name?: string } | null;
                    const assetId = a.id as string;
                    const upgradedTo = a.Upgraded_To_Key as string | null;
                    const isSelected = selectedAssets.has(assetId);
                    return (
                      <tr
                        key={i}
                        onClick={() => toggleAsset(assetId)}
                        className={`transition-colors cursor-pointer ${isSelected ? 'bg-csa-purple/8' : 'hover:bg-csa-accent/5'}`}
                      >
                        <td>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleAsset(assetId)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-4 h-4 rounded border-border-subtle accent-csa-purple cursor-pointer"
                          />
                        </td>
                        <td className="text-text-secondary">{product?.name || a.Name as string}</td>
                        <td className="text-text-muted">{a.Quantity as number}</td>
                        <td className="text-text-muted">{formatDate(a.Start_Date)}</td>
                        <td className="text-text-muted">{formatDate(a.Renewal_Date)}</td>
                        <td className="text-text-muted">{a.Status as string}</td>
                        <td className="text-text-muted text-xs font-mono">{upgradedTo || '\u2014'}</td>
                        <td>
                          <button
                            onClick={(e) => { e.stopPropagation(); setViewingAsset(a); }}
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
            <div className="mt-2">
              <Pagination currentPage={Math.min(archivedAssetPage, Math.max(1, Math.ceil(archivedAssets.length / assetPageSize)))} totalItems={archivedAssets.length} pageSize={assetPageSize} onPageChange={setArchivedAssetPage} />
            </div>
          </motion.div>
        )}
      </div>

      {/* Asset Detail Modal */}
      {viewingAsset ? (
        <AssetDetailModal
          assetId={viewingAsset.id as string}
          assetData={viewingAsset}
          onClose={() => setViewingAsset(null)}
          onAssetUpdated={() => {
            // Reload account data to refresh assets
            fetch(`/api/accounts/${selectedAccountId}`)
              .then(res => res.json())
              .then(data => {
                setAccount(data.account);
                setEvaluationAssets(data.evaluationAssets || []);
                setActiveAssets(data.activeAssets || []);
                setArchivedAssets(data.archivedAssets || []);
              })
              .catch(() => {});
          }}
        />
      ) : null}

      {/* Create Evaluation Modal */}
      {showEvalModal && account && (
        <CreateEvaluationModal
          accountId={selectedAccountId!}
          accountName={account.Account_Name as string}
          canExtend={user?.permissions?.canExtendEvaluations ?? false}
          onSuccess={() => {
            setShowEvalModal(false);
            // Reload to show new asset
            fetch(`/api/accounts/${selectedAccountId}`)
              .then(res => res.json())
              .then(data => {
                setActiveAssets(data.activeAssets || []);
                setArchivedAssets(data.archivedAssets || []);
              })
              .catch(() => {});
          }}
          onClose={() => setShowEvalModal(false)}
        />
      )}

      {/* Send Keys Confirmation Dialog */}
      <AnimatePresence>
        {sendKeysConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSendKeysConfirm(null)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-csa-dark border border-border rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-5"
            >
              <h3 className="text-base font-bold text-text-primary mb-2">
                Send Keys to {sendKeysConfirm === 'customer' ? 'Customer' : 'Reseller'}
              </h3>
              <p className="text-sm text-text-secondary mb-1">
                This will email the licence details for <span className="font-semibold text-text-primary">{selectedAssets.size} asset{selectedAssets.size !== 1 ? 's' : ''}</span> to:
              </p>
              <p className="text-sm font-semibold text-csa-accent mb-4">
                {sendKeysConfirm === 'customer'
                  ? (() => {
                      const pc = contacts.find(c => c.id === primaryContact?.id);
                      return pc ? `${pc.Full_Name} (${pc.Email})` : primaryContact?.name || 'Primary contact';
                    })()
                  : reseller?.name || 'Reseller'
                }
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setSendKeysConfirm(null)}
                  className="px-4 py-2 text-xs font-semibold text-text-muted bg-surface-raised border border-border-subtle rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => sendKeys(sendKeysConfirm === 'customer')}
                  disabled={sendingKeys}
                  className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl cursor-pointer disabled:opacity-50 ${
                    sendKeysConfirm === 'customer'
                      ? 'text-warning bg-warning/10 border border-warning/30'
                      : 'text-csa-accent bg-csa-accent/10 border border-csa-accent/30'
                  }`}
                >
                  {sendingKeys ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  {sendingKeys ? 'Sending...' : 'Confirm Send'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Send Keys Result Toast */}
      <AnimatePresence>
        {sendKeysResult && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl border shadow-lg text-sm font-semibold ${
              sendKeysResult.success
                ? 'bg-success/15 border-success/30 text-success'
                : 'bg-error/15 border-error/30 text-error'
            }`}
          >
            {sendKeysResult.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function InfoCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border-subtle rounded-xl px-4 py-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">
        {icon}
        {label}
      </div>
      <p className="text-sm text-text-primary truncate">{value || '—'}</p>
    </div>
  );
}
