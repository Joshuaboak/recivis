'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Building2, User, Package, Loader2, ExternalLink, Mail, Phone, MapPin, FileText } from 'lucide-react';
import { useAppStore } from '@/lib/store';

export default function AccountDetailView() {
  const { selectedAccountId, setCurrentView, setSelectedInvoiceId, setInvoiceReturnView } = useAppStore();
  const [account, setAccount] = useState<Record<string, unknown> | null>(null);
  const [contacts, setContacts] = useState<Record<string, unknown>[]>([]);
  const [activeAssets, setActiveAssets] = useState<Record<string, unknown>[]>([]);
  const [archivedAssets, setArchivedAssets] = useState<Record<string, unknown>[]>([]);
  const [invoices, setInvoices] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

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
          <InfoCard label="Address" value={[account.Billing_Street, account.Billing_City, account.Billing_State, account.Billing_Code].filter(Boolean).join(', ') || '—'} icon={<MapPin size={14} />} />
          <InfoCard label="Email Domain" value={account.Email_Domain as string || '—'} icon={<Mail size={14} />} />
        </motion.div>

        {/* Contacts */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-8">
          <h2 className="text-lg font-bold text-text-primary mb-3 flex items-center gap-2">
            <User size={18} className="text-csa-accent" />
            Contacts ({contacts.length})
          </h2>
          {contacts.length > 0 ? (
            <div className="border border-border-subtle rounded-xl overflow-hidden">
              <table className="w-full">
                <thead><tr className="bg-surface-raised">
                  <th>Name</th><th>Email</th><th>Phone</th><th>Title</th>
                </tr></thead>
                <tbody>
                  {contacts.map((c, i) => (
                    <tr key={i}>
                      <td className="font-semibold text-text-primary">{c.Full_Name as string}</td>
                      <td><span className="flex items-center gap-1 text-text-secondary"><Mail size={12} className="text-text-muted" />{c.Email as string || '—'}</span></td>
                      <td><span className="flex items-center gap-1 text-text-secondary"><Phone size={12} className="text-text-muted" />{c.Phone as string || '—'}</span></td>
                      <td className="text-text-muted">{c.Title as string || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-text-muted py-4">No contacts found</p>
          )}
        </motion.div>

        {/* Invoices */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="mb-8">
          <h2 className="text-lg font-bold text-text-primary mb-3 flex items-center gap-2">
            <FileText size={18} className="text-csa-purple" />
            Invoices ({invoices.length})
          </h2>
          {invoices.length > 0 ? (
            <div className="border border-border-subtle rounded-xl overflow-hidden">
              <table className="w-full">
                <thead><tr className="bg-surface-raised">
                  <th>Subject</th><th>Date</th><th>Type</th><th>Status</th><th>Total</th><th className="w-10"></th>
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
          <h2 className="text-lg font-bold text-text-primary mb-3 flex items-center gap-2">
            <Package size={18} className="text-success" />
            Active Assets ({activeAssets.length})
          </h2>
          {activeAssets.length > 0 ? (
            <div className="border border-border-subtle rounded-xl overflow-hidden">
              <table className="w-full">
                <thead><tr className="bg-surface-raised">
                  <th>Product</th><th>Qty</th><th>Start</th><th>Renewal</th><th>Serial Key</th>
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
                        <td className="text-text-muted text-xs font-mono">{a.Serial_Key as string || '—'}</td>
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
                  <th>Product</th><th>Qty</th><th>Start</th><th>Renewal</th><th>Status</th>
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
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </div>
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
