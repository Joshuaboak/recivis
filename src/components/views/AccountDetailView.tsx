'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Building2, User, Package, Loader2, ExternalLink, Mail, Phone, MapPin, FileText, Star, Plus, X, RefreshCw, Eye } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import Pagination from '../Pagination';
import AssetDetailModal from '../AssetDetailModal';

export default function AccountDetailView() {
  const { selectedAccountId, setCurrentView, setSelectedInvoiceId, setInvoiceReturnView, setNewInvoiceContext } = useAppStore();
  const [account, setAccount] = useState<Record<string, unknown> | null>(null);
  const [contacts, setContacts] = useState<Record<string, unknown>[]>([]);
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

  useEffect(() => {
    if (!selectedAccountId) return;
    setLoading(true);

    fetch(`/api/accounts/${selectedAccountId}`)
      .then(res => res.json())
      .then(data => {
        setAccount(data.account);
        setContacts(data.contacts || []);
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

  const toggleAllAssets = () => {
    if (selectedAssets.size === activeAssets.length) {
      setSelectedAssets(new Set());
    } else {
      setSelectedAssets(new Set(activeAssets.map(a => a.id as string)));
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
        setActiveAssets(reloadData.activeAssets || []);
        setSelectedAssets(new Set());
      }
    } catch { /* handled by UI */ }
    setGeneratingRenewal(false);
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
          <a href={crmLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-csa-accent bg-csa-accent/10 border border-csa-accent/30 rounded-xl hover:bg-csa-accent/20 transition-colors cursor-pointer">
            <ExternalLink size={14} />
            Open in CRM
          </a>
        </div>

        {/* Account Info */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          <InfoCard label="Country" value={account.Billing_Country as string} icon={<MapPin size={14} />} />
          <InfoCard label="Reseller" value={reseller?.name || '—'} icon={<Building2 size={14} />} />
          <InfoCard label="Owner" value={owner?.name || '—'} icon={<User size={14} />} />
          <InfoCard label="Primary Contact" value={primaryContact?.name || '—'} icon={<User size={14} />} />
          <InfoCard label="Secondary Contact" value={secondaryContact?.name || '—'} icon={<User size={14} />} />
          <InfoCard label="Email Domain" value={account.Email_Domain as string || '—'} icon={<Mail size={14} />} />
        </motion.div>

        {/* Contacts */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
              <User size={18} className="text-csa-accent" />
              Contacts ({contacts.length})
            </h2>
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

        {/* Active Assets */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
              <Package size={18} className="text-success" />
              Active Assets ({activeAssets.length})
            </h2>
            {selectedAssets.size > 0 ? (
              <button
                onClick={generateRenewal}
                disabled={generatingRenewal}
                className="flex items-center gap-2 px-4 py-1.5 text-xs font-semibold text-csa-purple bg-csa-purple/10 border border-csa-purple/30 rounded-xl hover:bg-csa-purple/20 transition-colors cursor-pointer disabled:opacity-50"
              >
                {generatingRenewal ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                {generatingRenewal ? 'Generating...' : `Generate Renewal (${selectedAssets.size})`}
              </button>
            ) : null}
          </div>
          {activeAssets.length > 0 ? (
            <div className="border border-border-subtle rounded-xl overflow-hidden">
              <table className="w-full">
                <thead><tr className="bg-surface-raised">
                  <th className="w-10">
                    <input
                      type="checkbox"
                      checked={selectedAssets.size === activeAssets.length && activeAssets.length > 0}
                      onChange={toggleAllAssets}
                      className="w-4 h-4 rounded border-border-subtle accent-csa-purple cursor-pointer"
                    />
                  </th>
                  <th>Product</th><th>Qty</th><th>Start</th><th>Renewal</th><th>Serial Key</th><th className="w-10"></th>
                </tr></thead>
                <tbody>
                  {activeAssets.map((a, i) => {
                    const product = a.Product as { name?: string } | null;
                    const assetId = a.id as string;
                    const isSelected = selectedAssets.has(assetId);
                    return (
                      <tr
                        key={i}
                        onClick={() => toggleAsset(assetId)}
                        className={`cursor-pointer transition-colors ${isSelected ? 'bg-csa-purple/8' : 'hover:bg-csa-accent/5'}`}
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
                  <th>Product</th><th>Qty</th><th>Start</th><th>Renewal</th><th>Status</th><th className="w-10"></th>
                </tr></thead>
                <tbody>
                  {archivedAssets.map((a, i) => {
                    const product = a.Product as { name?: string } | null;
                    return (
                      <tr key={i}>
                        <td className="text-text-secondary">{product?.name || a.Name as string}</td>
                        <td className="text-text-muted">{a.Quantity as number}</td>
                        <td className="text-text-muted">{formatDate(a.Start_Date)}</td>
                        <td className="text-text-muted">{formatDate(a.Renewal_Date)}</td>
                        <td className="text-text-muted">{a.Status as string}</td>
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

      {/* Asset Detail Modal */}
      {viewingAsset ? (
        <AssetDetailModal
          assetId={viewingAsset.id as string}
          assetData={viewingAsset}
          onClose={() => setViewingAsset(null)}
        />
      ) : null}
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
