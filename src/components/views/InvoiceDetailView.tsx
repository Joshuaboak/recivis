'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  FileText,
  Building2,
  User,
  Calendar,
  DollarSign,
  Globe,
  Package,
  Loader2,
  ExternalLink,
  Hash,
  MapPin,
  Send,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';

export default function InvoiceDetailView() {
  const { user, selectedInvoiceId, invoiceReturnView, setCurrentView, setSelectedAccountId } = useAppStore();
  const [invoice, setInvoice] = useState<Record<string, unknown> | null>(null);
  const [lineItems, setLineItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selectedInvoiceId) return;
    setLoading(true);

    fetch(`/api/invoices/${selectedInvoiceId}`)
      .then(res => res.json())
      .then(data => {
        setInvoice(data.invoice);
        setLineItems(data.lineItems || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedInvoiceId]);

  const goBack = () => {
    if (invoiceReturnView === 'account-detail') {
      setCurrentView('account-detail');
    } else {
      setCurrentView('draft-invoices');
    }
  };

  const crmLink = `https://crm.zoho.com.au/crm/org7002802215/tab/Invoices/${selectedInvoiceId}`;

  const formatDate = (d: unknown) => {
    if (!d || typeof d !== 'string') return '\u2014';
    const date = new Date(d);
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
  };

  const getCurrencySymbol = (c: unknown) => {
    const currency = c as string;
    if (currency === 'EUR') return '\u20AC';
    if (currency === 'GBP') return '\u00A3';
    return '$';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={24} className="text-csa-accent animate-spin" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <p className="text-text-muted">Invoice not found</p>
        <button onClick={goBack} className="text-csa-accent text-sm cursor-pointer">Go back</button>
      </div>
    );
  }

  const account = invoice.Account_Name as { name?: string; id?: string } | null;
  const contact = invoice.Contact_Name as { name?: string; id?: string } | null;
  const reseller = invoice.Reseller as { name?: string } | null;
  const owner = invoice.Owner as { name?: string } | null;
  const status = invoice.Status as string;
  const symbol = getCurrencySymbol(invoice.Currency);

  const statusColor = (status: unknown) => {
    switch (status) {
      case 'Sent': return 'bg-success/20 text-success border-success/30';
      case 'Approved': return 'bg-csa-accent/20 text-csa-accent border-csa-accent/30';
      case 'Draft': return 'bg-warning/20 text-warning border-warning/30';
      default: return 'bg-surface-raised text-text-muted border-border-subtle';
    }
  };

  const typeColor = (type: unknown) => {
    return type === 'Renewal'
      ? 'bg-csa-purple/20 text-csa-purple border-csa-purple/30'
      : 'bg-csa-accent/20 text-csa-accent border-csa-accent/30';
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* Header */}
        <div className="mb-8">
          {/* Top row: back, invoice number badge, actions */}
          <div className="flex items-center gap-3 mb-3">
            <button onClick={goBack} className="w-9 h-9 flex items-center justify-center bg-surface-raised rounded-xl hover:bg-surface-overlay transition-colors cursor-pointer">
              <ArrowLeft size={18} className="text-text-secondary" />
            </button>

            {invoice.Reference_Number ? (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-success/10 border border-success/30 rounded-xl">
                <span className="text-[10px] font-semibold text-success uppercase tracking-wider">Invoice Number</span>
                <span className="text-sm font-bold text-success">#{invoice.Reference_Number as string}</span>
              </div>
            ) : null}

            <span className={`px-2.5 py-1.5 text-[11px] font-bold uppercase rounded-lg border ${statusColor(status)}`}>
              {status}
            </span>
            <span className={`px-2.5 py-1.5 text-[11px] font-bold uppercase rounded-lg border ${typeColor(invoice.Invoice_Type)}`}>
              {invoice.Invoice_Type as string || 'New'}
            </span>

            <div className="flex-1" />

            <div className="flex items-center gap-2">
              {status === 'Draft' ? (() => {
                const isSystemAdmin = user?.role === 'admin' || user?.role === 'ibm';
                const canApprove = isSystemAdmin || user?.permissions?.canApproveInvoices;
                const canSend = isSystemAdmin || user?.permissions?.canSendInvoices;
                return (
                  <>
                    {canApprove ? (
                      <button className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-success bg-success/10 border border-success/30 rounded-xl hover:bg-success/20 transition-colors cursor-pointer">
                        <CheckCircle2 size={14} />
                        Approve
                      </button>
                    ) : null}
                    {canSend ? (
                      <button className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-csa-highlight bg-csa-accent/10 border border-csa-accent/30 rounded-xl hover:bg-csa-accent/20 transition-colors cursor-pointer">
                        <Send size={14} />
                        Send Invoice
                      </button>
                    ) : null}
                  </>
                );
              })() : (
                <div className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-text-muted bg-surface-raised border border-border-subtle rounded-xl">
                  <Lock size={14} />
                  Locked
                </div>
              )}
              <a href={crmLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-csa-accent bg-csa-accent/10 border border-csa-accent/30 rounded-xl hover:bg-csa-accent/20 transition-colors cursor-pointer">
                <ExternalLink size={14} />
                Open in CRM
              </a>
            </div>
          </div>

          {/* Subject */}
          <h1 className="text-2xl font-bold text-text-primary ml-12">
            {invoice.Subject as string || `Invoice ${selectedInvoiceId}`}
          </h1>
        </div>

        {/* Invoice Info Cards */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {account?.id ? (
            <button
              onClick={() => { setSelectedAccountId(account.id as string); setCurrentView('account-detail'); }}
              className="bg-surface border border-border-subtle rounded-xl px-4 py-3 text-left hover:border-csa-accent/50 transition-colors group cursor-pointer"
            >
              <div className="flex items-center gap-1.5 text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">
                <Building2 size={14} />
                Account
              </div>
              <p className="text-sm text-csa-accent group-hover:text-csa-highlight truncate transition-colors">{account.name || '\u2014'}</p>
            </button>
          ) : (
            <InfoCard label="Account" value={account?.name || '\u2014'} icon={<Building2 size={14} />} />
          )}
          <InfoCard label="Contact" value={contact?.name || '\u2014'} icon={<User size={14} />} />
          <InfoCard label="Reseller" value={reseller?.name || '\u2014'} icon={<Globe size={14} />} />
          <InfoCard label="Invoice Date" value={formatDate(invoice.Invoice_Date)} icon={<Calendar size={14} />} />
          <InfoCard label="Due Date" value={formatDate(invoice.Due_Date)} icon={<Calendar size={14} />} />
          <InfoCard label="Currency" value={invoice.Currency as string || '\u2014'} icon={<DollarSign size={14} />} />
          {owner ? <InfoCard label="Owner" value={owner.name || '\u2014'} icon={<User size={14} />} /> : null}
          {invoice.Billing_Country ? <InfoCard label="Billing Country" value={invoice.Billing_Country as string} icon={<MapPin size={14} />} /> : null}
          {invoice.Purchase_Order ? <InfoCard label="Purchase Order" value={invoice.Purchase_Order as string} icon={<FileText size={14} />} /> : null}
        </motion.div>

        {/* Line Items */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-8">
          <h2 className="text-lg font-bold text-text-primary mb-3 flex items-center gap-2">
            <Package size={18} className="text-csa-accent" />
            Line Items ({lineItems.length})
          </h2>
          {lineItems.length > 0 ? (
            <div className="border border-border-subtle rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-surface-raised">
                    <th>Product</th>
                    <th className="text-right">Qty</th>
                    <th className="text-right">List Price</th>
                    <th>Start</th>
                    <th>Renewal</th>
                    <th className="text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((li, i) => {
                    // Invoiced_Items subform fields from Zoho CRM
                    const product = li.Product_Name as { name?: string } | string | null;
                    const productName = typeof product === 'object' && product !== null ? product.name : (product as string);
                    const qty = li.Quantity as number;
                    const unitPrice = li.List_Price as number;
                    const discount = li.Discount as number;
                    const total = li.Net_Total as number;
                    const desc = li.Description as string | undefined;
                    return (
                      <tr key={i}>
                        <td>
                          <div className="font-semibold text-text-primary">{productName || '\u2014'}</div>
                          {desc ? (
                            <p className="text-xs text-text-muted mt-0.5 max-w-md truncate">{desc}</p>
                          ) : null}
                        </td>
                        <td className="text-right text-text-secondary">{qty}</td>
                        <td className="text-right text-text-secondary">{symbol}{unitPrice?.toFixed(2)}</td>
                        <td className="text-text-secondary">{formatDate(li.Start_Date)}</td>
                        <td className="text-text-secondary">{formatDate(li.Renewal_Date)}</td>
                        <td className="text-right text-text-primary font-semibold">{symbol}{total?.toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-text-muted py-4">No line items found</p>
          )}
        </motion.div>

        {/* Totals */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mb-8">
          <div className="max-w-sm ml-auto bg-surface border border-border-subtle rounded-xl overflow-hidden">
            <div className="divide-y divide-border-subtle">
              <TotalRow label="Sub Total" value={invoice.Sub_Total as number} symbol={symbol} />
              {(invoice.Discount as number) > 0 ? (
                <TotalRow label="Discount" value={-(invoice.Discount as number)} symbol={symbol} muted />
              ) : null}
              {(invoice.Tax as number) > 0 ? (
                <TotalRow label="Tax" value={invoice.Tax as number} symbol={symbol} muted />
              ) : null}
              <div className="flex items-center justify-between px-4 py-3 bg-surface-raised">
                <span className="text-sm font-bold text-text-primary uppercase tracking-wider">Grand Total</span>
                <span className="text-lg font-bold text-csa-accent">
                  {symbol}{(invoice.Grand_Total as number)?.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Description / Terms */}
        {(invoice.Description || invoice.Terms_and_Conditions) ? (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {invoice.Description ? (
              <div className="bg-surface border border-border-subtle rounded-xl px-4 py-3">
                <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Description</div>
                <p className="text-sm text-text-secondary whitespace-pre-wrap">{invoice.Description as string}</p>
              </div>
            ) : null}
            {invoice.Terms_and_Conditions ? (
              <div className="bg-surface border border-border-subtle rounded-xl px-4 py-3">
                <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Terms & Conditions</div>
                <p className="text-sm text-text-secondary whitespace-pre-wrap">{invoice.Terms_and_Conditions as string}</p>
              </div>
            ) : null}
          </motion.div>
        ) : null}
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
      <p className="text-sm text-text-primary truncate">{value || '\u2014'}</p>
    </div>
  );
}

function TotalRow({ label, value, symbol, muted }: { label: string; value: number; symbol: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className={`text-sm ${muted ? 'text-text-muted' : 'text-text-secondary'}`}>{label}</span>
      <span className={`text-sm font-semibold ${muted ? 'text-text-muted' : 'text-text-primary'}`}>
        {value < 0 ? `-${symbol}${Math.abs(value).toFixed(2)}` : `${symbol}${value?.toFixed(2)}`}
      </span>
    </div>
  );
}
