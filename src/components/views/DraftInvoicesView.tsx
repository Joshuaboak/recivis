'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { FileText, Loader2, ExternalLink, ChevronDown } from 'lucide-react';
import { useAppStore } from '@/lib/store';

interface Invoice {
  id: string;
  Subject: string;
  Reference_Number?: string;
  Account_Name?: { name: string; id: string };
  Invoice_Date: string;
  Status: string;
  Grand_Total: number;
  Currency: string;
  Invoice_Type: string;
  Reseller?: { name: string };
}

interface ResellerOption {
  id: string;
  name: string;
  region: string;
}

export default function DraftInvoicesView() {
  const { user, setCurrentView, setSelectedInvoiceId, setInvoiceReturnView } = useAppStore();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('Draft');

  // Filter state
  const [resellers, setResellers] = useState<ResellerOption[]>([]);
  const [selectedReseller, setSelectedReseller] = useState<string>('');
  const [selectedRegion, setSelectedRegion] = useState<string>('');

  // Role checks
  const isAdmin = user?.role === 'admin' || user?.role === 'ibm';
  const hasChildResellers = user?.permissions?.canViewChildRecords;
  const canFilterReseller = isAdmin || hasChildResellers;

  // Load resellers for filter dropdowns
  useEffect(() => {
    if (!canFilterReseller) return;
    async function load() {
      let url = '/api/resellers';
      if (!isAdmin && user?.resellerId) {
        // Distributor/manager: own + children
        url = `/api/resellers?resellerId=${user.resellerId}&includeChildren=true`;
      }
      try {
        const res = await fetch(url);
        const data = await res.json();
        setResellers(data.resellers || []);
      } catch { /* skip */ }
    }
    load();
  }, [isAdmin, user?.resellerId, canFilterReseller]);

  // Available regions (admin/ibm only)
  const regions = useMemo(
    () => [...new Set(resellers.map(r => r.region).filter(Boolean))].sort(),
    [resellers]
  );

  // Filter resellers by selected region (admin/ibm)
  const filteredResellers = useMemo(() => {
    if (selectedRegion && isAdmin) {
      return resellers.filter(r => r.region === selectedRegion);
    }
    return resellers;
  }, [resellers, selectedRegion, isAdmin]);

  // Reset reseller selection when it's no longer visible after region change
  useEffect(() => {
    if (selectedReseller && filteredResellers.length > 0) {
      const stillVisible = filteredResellers.some(r => r.id === selectedReseller);
      if (!stillVisible) setSelectedReseller('');
    }
  }, [filteredResellers, selectedReseller]);

  // Identify own reseller vs children for distributor view
  const ownReseller = useMemo(
    () => resellers.find(r => r.id === user?.resellerId),
    [resellers, user?.resellerId]
  );
  const childResellers = useMemo(
    () => resellers.filter(r => r.id !== user?.resellerId),
    [resellers, user?.resellerId]
  );

  // Build the fetch params based on filters and role
  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status: statusFilter });

      if (selectedReseller) {
        // Specific reseller selected — simple filter
        params.set('resellerId', selectedReseller);
      } else if (isAdmin && selectedRegion) {
        // Admin/IBM with region selected but no specific reseller
        // → filter by all resellers in that region
        const regionResellerIds = resellers
          .filter(r => r.region === selectedRegion)
          .map(r => r.id);
        if (regionResellerIds.length > 0) {
          params.set('resellerIds', regionResellerIds.join(','));
        }
      } else if (!isAdmin && user?.resellerId) {
        // Non-admin user: filter to their allowed resellers
        if (hasChildResellers && resellers.length > 1) {
          // Distributor with children and no specific filter → all their resellers
          params.set('resellerIds', resellers.map(r => r.id).join(','));
        } else {
          // Single reseller user
          params.set('resellerId', user.resellerId);
        }
      }
      // Admin/IBM with no filters → no reseller constraint (sees all)

      const res = await fetch(`/api/invoices?${params}`);
      const data = await res.json();
      setInvoices(data.invoices || []);
    } catch {
      setInvoices([]);
    }
    setLoading(false);
  }, [statusFilter, selectedReseller, selectedRegion, isAdmin, hasChildResellers, user?.resellerId, resellers]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const formatDate = (d: string) => {
    if (!d) return '\u2014';
    const date = new Date(d);
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* Header + Filters */}
        <div className="flex flex-col gap-4 mb-6">
          <h1 className="text-2xl font-bold text-text-primary">Existing Invoices</h1>

          <div className="flex flex-wrap items-center gap-3">
            {/* Status filter */}
            <div className="relative min-w-[140px]">
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

            {/* Region filter — admin/ibm only */}
            {isAdmin && regions.length > 1 && (
              <div className="relative min-w-[140px]">
                <select
                  value={selectedRegion}
                  onChange={(e) => setSelectedRegion(e.target.value)}
                  className="w-full bg-surface border-2 border-border-subtle px-4 py-2.5 text-sm text-text-primary outline-none focus:border-csa-accent rounded-xl appearance-none cursor-pointer pr-10"
                >
                  <option value="">All Regions</option>
                  {regions.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
              </div>
            )}

            {/* Reseller filter */}
            {canFilterReseller && filteredResellers.length > 1 && (
              <div className="relative min-w-[220px]">
                <select
                  value={selectedReseller}
                  onChange={(e) => setSelectedReseller(e.target.value)}
                  className="w-full bg-surface border-2 border-border-subtle px-4 py-2.5 text-sm text-text-primary outline-none focus:border-csa-accent rounded-xl appearance-none cursor-pointer pr-10"
                >
                  {isAdmin ? (
                    <>
                      <option value="">All Resellers</option>
                      {filteredResellers.map(r => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </>
                  ) : (
                    /* Distributor/manager with children: structured options */
                    <>
                      <option value="">All (My Network)</option>
                      {ownReseller && (
                        <option value={ownReseller.id}>{ownReseller.name} (Mine)</option>
                      )}
                      {childResellers.map(r => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </>
                  )}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
              </div>
            )}
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="text-csa-accent animate-spin" />
          </div>
        )}

        {/* Invoice table */}
        {!loading && invoices.length > 0 && (
          <div className="border border-border-subtle rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-surface-raised">
                  <th>Invoice #</th>
                  <th>Subject</th>
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
                    onClick={() => {
                      setSelectedInvoiceId(inv.id);
                      setInvoiceReturnView('draft-invoices');
                      setCurrentView('invoice-detail');
                    }}
                    className="cursor-pointer hover:bg-csa-accent/5 transition-colors"
                  >
                    <td className="text-text-muted text-xs font-mono">{inv.Reference_Number || '\u2014'}</td>
                    <td>
                      <span className="font-semibold text-csa-accent hover:text-csa-highlight transition-colors">
                        {inv.Subject || `Invoice ${inv.id}`}
                      </span>
                    </td>
                    <td className="text-text-secondary">{inv.Account_Name?.name || '\u2014'}</td>
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
                      {inv.Currency === 'AUD' ? '$' : inv.Currency === 'EUR' ? '\u20AC' : inv.Currency === 'GBP' ? '\u00A3' : '$'}
                      {inv.Grand_Total?.toFixed(2)}
                    </td>
                    <td className="text-text-muted text-sm">{inv.Reseller?.name || '\u2014'}</td>
                    <td>
                      <ExternalLink size={14} className="text-text-muted" />
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Empty */}
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
