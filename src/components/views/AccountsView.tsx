/**
 * AccountsView — Browse and search customer accounts.
 *
 * Features:
 * - Paginated account list (50 per page) with client-side pagination
 * - Debounced search (400ms) by name, email, or domain
 * - Region filter (admin/ibm only) — filters the reseller dropdown too
 * - Reseller filter (admin sees all; distributors see own + children)
 * - XLSX export with contacts and assets for all visible accounts
 * - Click any row to navigate to AccountDetailView
 *
 * Data: Fetches from /api/accounts with search/reseller query params.
 * The API auto-paginates across Zoho pages; client-side pagination
 * is for display only (all matching records are loaded at once).
 */

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Search, Building2, Loader2, MapPin, ExternalLink, ChevronDown, Download } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import Pagination from '../Pagination';
import { exportAccountsList } from '@/lib/export-lists';

interface Account {
  id: string;
  Account_Name: string;
  Billing_Country: string | null;
  Email_Domain: string | null;
  Reseller?: { name: string; id: string };
  Owner?: { name: string };
}

interface ResellerFilter {
  id: string;
  name: string;
  region: string;
}

const REGION_LABELS: Record<string, string> = {
  AF: 'Africa', AS: 'Asia', AU: 'Australia', EU: 'Europe', NA: 'North America', NZ: 'New Zealand', WW: 'Worldwide',
};

export default function AccountsView() {
  const { user, setCurrentView, setSelectedAccountId } = useAppStore();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [resellers, setResellers] = useState<ResellerFilter[]>([]);
  const [selectedReseller, setSelectedReseller] = useState<string>('');
  const [selectedRegion, setSelectedRegion] = useState<string>('');

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState('');

  const isAdmin = user?.role === 'admin' || user?.role === 'ibm';
  const hasChildResellers = user?.permissions?.canViewChildRecords;
  const canFilterReseller = isAdmin || hasChildResellers;

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  // Load resellers for filter
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

  // Filter resellers by selected region for admin/ibm
  const filteredResellers = useMemo(() => {
    if (selectedRegion && isAdmin) {
      return resellers.filter(r => r.region === selectedRegion);
    }
    return resellers;
  }, [resellers, selectedRegion, isAdmin]);

  // Reset reseller selection when region changes and selected reseller no longer visible
  useEffect(() => {
    if (selectedReseller && filteredResellers.length > 0) {
      const stillVisible = filteredResellers.some(r => r.id === selectedReseller);
      if (!stillVisible) setSelectedReseller('');
    }
  }, [filteredResellers, selectedReseller]);

  // Identify the user's own reseller vs children for distributor view
  const ownReseller = useMemo(
    () => resellers.find(r => r.id === user?.resellerId),
    [resellers, user?.resellerId]
  );
  const childResellers = useMemo(
    () => resellers.filter(r => r.id !== user?.resellerId),
    [resellers, user?.resellerId]
  );

  // Fetch accounts
  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchDebounced) params.set('search', searchDebounced);

      if (selectedReseller) {
        params.set('resellerId', selectedReseller);
      } else if (isAdmin && selectedRegion) {
        // Region selected — get all reseller IDs in that region
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

      const res = await fetch(`/api/accounts?${params}`);
      const data = await res.json();
      setAccounts(data.accounts || []);
    } catch {
      setAccounts([]);
    }
    setLoading(false);
  }, [searchDebounced, selectedReseller, selectedRegion, isAdmin, hasChildResellers, user?.resellerId, resellers]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  // Pagination — clamp page to valid range
  const totalPages = Math.max(1, Math.ceil(accounts.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedAccounts = accounts.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  // Reset to page 1 when filters change
  useEffect(() => { setCurrentPage(1); }, [searchDebounced, selectedReseller, selectedRegion]);

  const openAccount = (id: string) => {
    setSelectedAccountId(id);
    setCurrentView('account-detail');
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* Header + Filters */}
        <div className="flex flex-col gap-4 mb-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-text-primary">Accounts</h1>
            {accounts.length > 0 ? (
              <button
                onClick={async () => {
                  setExporting(true);
                  setExportProgress('Preparing...');
                  await exportAccountsList(accounts, {
                    search: searchDebounced || undefined,
                    region: selectedRegion || undefined,
                    reseller: filteredResellers.find(r => r.id === selectedReseller)?.name || undefined,
                  }, (current, total) => setExportProgress(`${current}/${total} accounts`));
                  setExporting(false);
                  setExportProgress('');
                }}
                disabled={exporting}
                className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-success bg-success/10 border border-success/30 rounded-xl hover:bg-success/20 transition-colors cursor-pointer disabled:opacity-60"
              >
                {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                {exporting ? exportProgress : 'Export'}
              </button>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="flex-1 min-w-[240px] relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search accounts by name, email, or domain..."
                className="w-full bg-surface border-2 border-border-subtle pl-10 pr-4 py-2.5 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-xl"
              />
            </div>

            {/* Region filter (admin/ibm only) — placed before reseller so it filters the reseller list */}
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
                    /* Distributor/reseller with children: structured options */
                    <>
                      <option value="">All (My Network)</option>
                      {ownReseller && (
                        <option value={ownReseller.id}>{ownReseller.name} (Mine)</option>
                      )}
                      {childResellers.length > 0 && childResellers.map(r => (
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
            <span className="text-xs text-text-muted">Loading accounts...</span>
          </div>
        )}

        {/* Pagination (top) */}
        {!loading && accounts.length > 0 && (
          <div className="mb-3">
            <Pagination currentPage={safePage} totalItems={accounts.length} pageSize={pageSize} onPageChange={setCurrentPage} />
          </div>
        )}

        {/* Accounts list */}
        {!loading && paginatedAccounts.length > 0 && (
          <div className="border border-border-subtle rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-surface-raised">
                  <th>Account</th>
                  <th>Country</th>
                  <th>Reseller</th>
                  <th>Owner</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {paginatedAccounts.map((acc) => (
                  <motion.tr
                    key={acc.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    onClick={() => openAccount(acc.id)}
                    className="cursor-pointer hover:bg-csa-accent/5 transition-colors"
                  >
                    <td>
                      <div className="flex items-center gap-2">
                        <Building2 size={14} className="text-csa-accent flex-shrink-0" />
                        <span className="font-semibold text-text-primary">{acc.Account_Name}</span>
                      </div>
                      {acc.Email_Domain && (
                        <span className="text-xs text-text-muted ml-6">{acc.Email_Domain}</span>
                      )}
                    </td>
                    <td className="text-text-secondary">
                      {acc.Billing_Country && (
                        <span className="flex items-center gap-1">
                          <MapPin size={12} className="text-text-muted" />
                          {acc.Billing_Country}
                        </span>
                      )}
                    </td>
                    <td className="text-text-secondary text-sm">
                      {acc.Reseller?.name || '\u2014'}
                    </td>
                    <td className="text-text-muted text-sm">
                      {acc.Owner?.name || '\u2014'}
                    </td>
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
        {!loading && accounts.length > pageSize && (
          <div className="mt-3">
            <Pagination currentPage={safePage} totalItems={accounts.length} pageSize={pageSize} onPageChange={setCurrentPage} />
          </div>
        )}

        {/* Empty */}
        {!loading && accounts.length === 0 && (
          <div className="text-center py-16">
            <Building2 size={32} className="text-text-muted mx-auto mb-3" />
            <p className="text-sm text-text-muted">
              {search ? `No accounts matching "${search}"` : 'No accounts found'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
