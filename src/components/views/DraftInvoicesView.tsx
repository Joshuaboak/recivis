/**
 * DraftInvoicesView — Browse, filter, sort, and export invoices.
 *
 * Features:
 * - Status filter (Draft / Approved / Sent) — fetches from API per status
 * - Client-side search across invoice #, subject, and account name
 * - Client-side type filter (New Product, Renewal, Co-Term, Add To Contract)
 * - Region and reseller filters (admin/ibm and distributor views)
 * - Sortable columns: Invoice #, Date, Total (with visual sort indicators)
 * - Paginated (50 per page) with top/bottom pagination controls
 * - XLSX export of current filtered/sorted view
 * - Click any row to navigate to InvoiceDetailView
 *
 * Data: Fetches from /api/invoices with status and reseller params.
 * All matching records are loaded at once; sorting/filtering/search are client-side.
 */

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { FileText, Loader2, ExternalLink, ChevronDown, ArrowUp, ArrowDown, Search, Download } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import Pagination from '../Pagination';
import { exportInvoicesList } from '@/lib/export-lists';

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

const REGION_LABELS: Record<string, string> = {
  AF: 'Africa', AS: 'Asia', AU: 'Australia', EU: 'Europe', NA: 'North America', NZ: 'New Zealand', WW: 'Worldwide',
};

type SortField = 'Reference_Number' | 'Invoice_Date' | 'Grand_Total';
type SortDir = 'asc' | 'desc';

export default function DraftInvoicesView() {
  const { user, setCurrentView, setSelectedInvoiceId, setInvoiceReturnView } = useAppStore();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('Draft');

  // Filter state
  const [resellers, setResellers] = useState<ResellerOption[]>([]);
  const [selectedReseller, setSelectedReseller] = useState<string>('');
  const [selectedRegion, setSelectedRegion] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('');

  // Sort state
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Search state
  const [searchText, setSearchText] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

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
        params.set('resellerId', selectedReseller);
      } else if (isAdmin && selectedRegion) {
        const regionResellerIds = resellers
          .filter(r => r.region === selectedRegion)
          .map(r => r.id);
        if (regionResellerIds.length > 0) {
          params.set('resellerIds', regionResellerIds.join(','));
        }
      } else if (!isAdmin && user?.resellerId) {
        if (hasChildResellers && resellers.length > 1) {
          params.set('resellerIds', resellers.map(r => r.id).join(','));
        } else {
          params.set('resellerId', user.resellerId);
        }
      }

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

  // Client-side type filter, search + sort
  const processedInvoices = useMemo(() => {
    let result = [...invoices];

    // Type filter
    if (typeFilter) {
      result = result.filter(inv => (inv.Invoice_Type || '') === typeFilter);
    }

    // Search filter — searches across invoice #, subject, and account name
    if (searchText) {
      const q = searchText.toLowerCase();
      result = result.filter(inv =>
        (inv.Reference_Number || '').toLowerCase().includes(q) ||
        (inv.Subject || '').toLowerCase().includes(q) ||
        (inv.Account_Name?.name || '').toLowerCase().includes(q)
      );
    }

    // Sort
    if (sortField) {
      result.sort((a, b) => {
        let cmp = 0;
        if (sortField === 'Reference_Number') {
          const aNum = parseInt((a.Reference_Number || '0').replace(/\D/g, '')) || 0;
          const bNum = parseInt((b.Reference_Number || '0').replace(/\D/g, '')) || 0;
          cmp = aNum - bNum;
        } else if (sortField === 'Invoice_Date') {
          cmp = new Date(a.Invoice_Date || 0).getTime() - new Date(b.Invoice_Date || 0).getTime();
        } else if (sortField === 'Grand_Total') {
          cmp = (a.Grand_Total || 0) - (b.Grand_Total || 0);
        }
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }

    return result;
  }, [invoices, typeFilter, sortField, sortDir, searchText]);

  // Pagination derived values — clamp page to valid range
  const totalPages = Math.max(1, Math.ceil(processedInvoices.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedInvoices = processedInvoices.slice((safePage - 1) * pageSize, safePage * pageSize);

  // Sync currentPage if it's out of range (e.g. switching from large to small result set)
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  // Reset to page 1 when filters/search/sort change
  useEffect(() => { setCurrentPage(1); }, [statusFilter, selectedReseller, selectedRegion, typeFilter, searchText, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

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
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-text-primary">Existing Invoices</h1>
            {processedInvoices.length > 0 ? (
              <button
                onClick={() => exportInvoicesList(processedInvoices, {
                  status: statusFilter,
                  type: typeFilter || undefined,
                  region: selectedRegion || undefined,
                  reseller: filteredResellers.find(r => r.id === selectedReseller)?.name || undefined,
                  search: searchText || undefined,
                })}
                className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-success bg-success/10 border border-success/30 rounded-xl hover:bg-success/20 transition-colors cursor-pointer"
              >
                <Download size={14} />
                Export
              </button>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="flex-1 min-w-[220px] relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Search by invoice #, subject, or account..."
                className="w-full bg-surface border-2 border-border-subtle pl-10 pr-4 py-2.5 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-xl"
              />
            </div>

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

            {/* Type filter */}
            <div className="relative min-w-[160px]">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full bg-surface border-2 border-border-subtle px-4 py-2.5 text-sm text-text-primary outline-none focus:border-csa-accent rounded-xl appearance-none cursor-pointer pr-10"
              >
                <option value="">All Types</option>
                <option value="New Product">New Product</option>
                <option value="Renewal">Renewal</option>
                <option value="Co-Term">Co-Term</option>
                <option value="Add To Contract">Add To Contract</option>
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
                    <option key={r} value={r}>{REGION_LABELS[r] || r}</option>
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
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 size={24} className="text-csa-accent animate-spin" />
            <span className="text-xs text-text-muted">Loading invoices...</span>
          </div>
        )}

        {/* Pagination (top) */}
        {!loading && processedInvoices.length > 0 && (
          <div className="mb-3">
            <Pagination currentPage={safePage} totalItems={processedInvoices.length} pageSize={pageSize} onPageChange={setCurrentPage} />
          </div>
        )}

        {/* Invoice table */}
        {!loading && paginatedInvoices.length > 0 && (
          <div className="border border-border-subtle rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-surface-raised">
                  <SortHeader label="Invoice #" field="Reference_Number" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <th>Subject</th>
                  <th>Account</th>
                  <SortHeader label="Date" field="Invoice_Date" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <th>Type</th>
                  <SortHeader label="Total" field="Grand_Total" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                  <th>Reseller</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {paginatedInvoices.map((inv) => (
                  <motion.tr
                    key={inv.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    onClick={() => {
                      setSelectedInvoiceId(inv.id);
                      setInvoiceReturnView('draft-invoices');
                      setCurrentView('invoice-detail');
                    }}
                    className="cursor-pointer hover:bg-csa-accent/5 transition-colors"
                  >
                    <td className="text-text-muted text-xs font-mono whitespace-nowrap">{inv.Reference_Number || '\u2014'}</td>
                    <td>
                      <span className="font-semibold text-csa-accent hover:text-csa-highlight transition-colors">
                        {inv.Subject || `Invoice ${inv.id}`}
                      </span>
                    </td>
                    <td className="text-text-secondary">{inv.Account_Name?.name || '\u2014'}</td>
                    <td className="text-text-secondary whitespace-nowrap">{formatDate(inv.Invoice_Date)}</td>
                    <td>
                      <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-md whitespace-nowrap ${
                        inv.Invoice_Type === 'Renewal'
                          ? 'bg-csa-purple/20 text-csa-purple'
                          : 'bg-csa-accent/20 text-csa-accent'
                      }`}>
                        {inv.Invoice_Type || 'New'}
                      </span>
                    </td>
                    <td className="text-text-primary font-semibold whitespace-nowrap">
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

        {/* Pagination (bottom) */}
        {!loading && processedInvoices.length > pageSize && (
          <div className="mt-3">
            <Pagination currentPage={safePage} totalItems={processedInvoices.length} pageSize={pageSize} onPageChange={setCurrentPage} />
          </div>
        )}

        {/* Empty */}
        {!loading && processedInvoices.length === 0 && (
          <div className="text-center py-16">
            <FileText size={32} className="text-text-muted mx-auto mb-3" />
            <p className="text-sm text-text-muted">
              {searchText
                ? `No invoices matching "${searchText}"`
                : `No ${statusFilter.toLowerCase()} invoices found`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/** Sortable column header */
function SortHeader({ label, field, sortField, sortDir, onSort }: {
  label: string;
  field: SortField;
  sortField: SortField | null;
  sortDir: SortDir;
  onSort: (f: SortField) => void;
}) {
  const active = sortField === field;
  return (
    <th
      onClick={() => onSort(field)}
      className="cursor-pointer select-none group"
    >
      <span className={`inline-flex items-center gap-1 whitespace-nowrap transition-colors ${active ? 'text-csa-accent' : 'group-hover:text-text-primary'}`}>
        {label}
        {active ? (
          sortDir === 'asc'
            ? <ArrowUp size={13} strokeWidth={2.5} className="text-csa-accent" />
            : <ArrowDown size={13} strokeWidth={2.5} className="text-csa-accent" />
        ) : (
          <ArrowDown size={13} strokeWidth={2} className="text-text-secondary opacity-50 group-hover:opacity-80" />
        )}
      </span>
    </th>
  );
}

