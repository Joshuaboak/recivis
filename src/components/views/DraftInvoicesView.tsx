'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FileText, Loader2, ExternalLink, ChevronDown } from 'lucide-react';
import { useAppStore } from '@/lib/store';

interface Invoice {
  id: string;
  Subject: string;
  Account_Name?: { name: string; id: string };
  Invoice_Date: string;
  Status: string;
  Grand_Total: number;
  Currency: string;
  Invoice_Type: string;
  Reseller?: { name: string };
}

export default function DraftInvoicesView() {
  const { user } = useAppStore();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('Draft');

  const isAdmin = user?.role === 'admin' || user?.role === 'ibm';

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ status: statusFilter });
    if (!isAdmin && user?.resellerId) {
      params.set('resellerId', user.resellerId);
    }

    fetch(`/api/invoices?${params}`)
      .then(res => res.json())
      .then(data => setInvoices(data.invoices || []))
      .catch(() => setInvoices([]))
      .finally(() => setLoading(false));
  }, [statusFilter, isAdmin, user?.resellerId]);

  const formatDate = (d: string) => {
    if (!d) return '—';
    const date = new Date(d);
    return `${String(date.getDate()).padStart(2,'0')}/${String(date.getMonth()+1).padStart(2,'0')}/${date.getFullYear()}`;
  };

  const crmLink = (id: string) =>
    `https://crm.zoho.com.au/crm/org7002802215/tab/Invoices/${id}`;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-text-primary">Existing Invoices</h1>
          <div className="relative min-w-[160px]">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full bg-surface border-2 border-border-subtle px-4 py-2.5 text-sm text-text-primary outline-none focus:border-csa-accent rounded-xl appearance-none cursor-pointer pr-10"
            >
              <option value="Draft">Draft</option>
              <option value="Approved">Approved</option>
              <option value="Sent">Sent</option>
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="text-csa-accent animate-spin" />
          </div>
        )}

        {!loading && invoices.length > 0 && (
          <div className="border border-border-subtle rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-surface-raised">
                  <th>Invoice</th>
                  <th>Account</th>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Total</th>
                  <th>Reseller</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv, i) => (
                  <motion.tr
                    key={inv.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.02 }}
                  >
                    <td>
                      <a href={crmLink(inv.id)} target="_blank" rel="noopener noreferrer" className="font-semibold text-csa-accent hover:text-csa-highlight transition-colors cursor-pointer">
                        {inv.Subject || `Invoice ${inv.id}`}
                      </a>
                    </td>
                    <td className="text-text-secondary">{inv.Account_Name?.name || '—'}</td>
                    <td className="text-text-secondary">{formatDate(inv.Invoice_Date)}</td>
                    <td>
                      <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-md ${
                        inv.Invoice_Type === 'Renewal'
                          ? 'bg-csa-purple/20 text-csa-purple'
                          : 'bg-csa-accent/20 text-csa-accent'
                      }`}>
                        {inv.Invoice_Type || 'New'}
                      </span>
                    </td>
                    <td className="text-text-primary font-semibold">
                      {inv.Currency === 'AUD' ? '$' : inv.Currency === 'EUR' ? '€' : inv.Currency === 'GBP' ? '£' : '$'}
                      {inv.Grand_Total?.toFixed(2)}
                    </td>
                    <td className="text-text-muted text-sm">{inv.Reseller?.name || '—'}</td>
                    <td>
                      <a href={crmLink(inv.id)} target="_blank" rel="noopener noreferrer">
                        <ExternalLink size={14} className="text-text-muted hover:text-csa-accent transition-colors" />
                      </a>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && invoices.length === 0 && (
          <div className="text-center py-16">
            <FileText size={32} className="text-text-muted mx-auto mb-3" />
            <p className="text-sm text-text-muted">No {statusFilter.toLowerCase()} invoices found</p>
          </div>
        )}
      </div>
    </div>
  );
}
