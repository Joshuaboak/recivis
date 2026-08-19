'use client';

import { useState, useEffect, useCallback, useMemo, type MouseEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, UserSearch, Loader2, MapPin, ExternalLink, ChevronDown, Building2, User, Beaker, ArrowUp, ArrowDown, Download } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { buildPath } from '@/lib/routes';
import Pagination from '../Pagination';
import { exportLeadsList } from '@/lib/export-lists';

interface UnifiedLead {
  id: string;
  _source: 'lead' | 'prospect';
  name: string;
  contactName: string;
  email: string;
  phone: string;
  country: string;
  leadStatus: string;
  productInterest: string;
  leadSource: string;
  reseller: { name: string; id: string } | null;
  owner: { name: string } | null;
  evaluations: string[];
  createdTime: string;
}

interface ResellerFilter {
  id: string;
  name: string;
  region: string;
}

const REGION_LABELS: Record<string, string> = {
  AF: 'Africa', AS: 'Asia', AU: 'Australia', EU: 'Europe', NA: 'North America', NZ: 'New Zealand', WW: 'Worldwide',
};

const LEAD_STATUSES = [
  'Not Contacted', 'Attempted to Contact', 'Contacted', 'Future Interest',
  'No Interest Ever', 'Dormant', 'Lost Lead', 'Pre-Qualified', 'Suspect', 'Prospect',
];

const EVAL_PRODUCTS = ['Civil Site Design', 'Stringer', 'Corridor EZ', 'Civil Site Design Plus'];

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

export default function LeadsView() {
  const router = useRouter();
  const { user } = useAppStore();
  const [leads, setLeads] = useState<UnifiedLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [resellers, setResellers] = useState<ResellerFilter[]>([]);
  const [selectedReseller, setSelectedReseller] = useState<string>('');
  const [selectedRegion, setSelectedRegion] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [selectedEval, setSelectedEval] = useState<string>('');

  const [currentPage, setCurrentPage] = useState(1);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const pageSize = 50;

  const isAdmin = user?.role === 'admin' || user?.role === 'ibm';
  const hasChildResellers = user?.permissions?.canViewChildRecords;
  const canFilterReseller = isAdmin || hasChildResellers;

  // Gates the lead fetch until the reseller list is settled. Users who can't
  // filter by reseller never load one, so for them it starts open. `user` is
  // resolved before this view mounts, so this reads its final value.
  const [resellersReady, setResellersReady] = useState(!canFilterReseller);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  // Load resellers for filter. This opens the `resellersReady` gate when it
  // settles, so the two loads don't overlap — a lead request fired before the
  // list arrives would be scoped wrong and immediately superseded.
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
      setResellersReady(true);
    }
    load();
  }, [isAdmin, user?.resellerId, canFilterReseller]);

  // Available regions
  const regions = useMemo(
    () => [...new Set(resellers.map(r => r.region).filter(Boolean))].sort(),
    [resellers]
  );

  // Filter resellers by selected region
  const filteredResellers = useMemo(() => {
    if (selectedRegion && isAdmin) {
      return resellers.filter(r => r.region === selectedRegion);
    }
    return resellers;
  }, [resellers, selectedRegion, isAdmin]);

  // Reset reseller selection when region changes
  useEffect(() => {
    if (selectedReseller && filteredResellers.length > 0) {
      const stillVisible = filteredResellers.some(r => r.id === selectedReseller);
      if (!stillVisible) setSelectedReseller('');
    }
  }, [filteredResellers, selectedReseller]);

  const ownReseller = useMemo(
    () => resellers.find(r => r.id === user?.resellerId),
    [resellers, user?.resellerId]
  );
  const childResellers = useMemo(
    () => resellers.filter(r => r.id !== user?.resellerId),
    [resellers, user?.resellerId]
  );

  // Reseller scoping for the lead query, resolved to a query string. The fetch
  // depends on this string rather than on `resellers` itself: the reseller list
  // arriving can't change the callback's identity unless it actually changes the
  // query, so it can no longer abort an in-flight lead request.
  const resellerScope = useMemo(() => {
    const scope = new URLSearchParams();
    if (selectedReseller) {
      scope.set('resellerId', selectedReseller);
    } else if (isAdmin && selectedRegion) {
      const regionResellerIds = resellers
        .filter(r => r.region === selectedRegion)
        .map(r => r.id);
      if (regionResellerIds.length > 0) {
        scope.set('resellerIds', regionResellerIds.join(','));
      }
    } else if (!isAdmin && user?.resellerId) {
      if (hasChildResellers && resellers.length > 1) {
        scope.set('resellerIds', resellers.map(r => r.id).join(','));
      } else {
        scope.set('resellerId', user.resellerId);
      }
    }
    return scope.toString();
  }, [resellers, selectedReseller, selectedRegion, isAdmin, hasChildResellers, user?.resellerId]);

  // Fetch leads — aborts any in-flight request when deps change so
  // stale responses can't clobber fresher ones (paste / fast typing race).
  const fetchLeads = useCallback((signal: AbortSignal) => {
    setLoading(true);
    const params = new URLSearchParams(resellerScope);
    if (searchDebounced) params.set('search', searchDebounced);
    if (selectedStatus) params.set('status', selectedStatus);
    if (selectedEval) params.set('evaluation', selectedEval);

    fetch(`/api/leads?${params}`, { signal })
      .then(res => res.json())
      .then(data => {
        if (signal.aborted) return;
        setLeads(data.leads || []);
        setLoading(false);
      })
      .catch(err => {
        if (err.name === 'AbortError') return;
        setLeads([]);
        setLoading(false);
      });
  }, [searchDebounced, selectedStatus, selectedEval, resellerScope]);

  useEffect(() => {
    if (!resellersReady) return;
    const controller = new AbortController();
    fetchLeads(controller.signal);
    return () => controller.abort();
  }, [fetchLeads, resellersReady]);

  // Sort by created date
  const sortedLeads = useMemo(() => {
    return [...leads].sort((a, b) => {
      const dateA = a.createdTime ? new Date(a.createdTime).getTime() : 0;
      const dateB = b.createdTime ? new Date(b.createdTime).getTime() : 0;
      return sortDir === 'asc' ? dateA - dateB : dateB - dateA;
    });
  }, [leads, sortDir]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sortedLeads.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedLeads = sortedLeads.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  useEffect(() => { setCurrentPage(1); }, [searchDebounced, selectedReseller, selectedRegion, selectedStatus, selectedEval, sortDir]);

  /** Detail route for a lead. The module it lives in rides along as `?source=`. */
  const leadHref = (lead: UnifiedLead) =>
    `${buildPath('lead-detail', lead.id)}?source=${lead._source}`;

  /** Clicking anywhere in a row opens the lead. Clicks that land on the row's
   *  own link or any other control belong to that element, so the row stays
   *  out of the way and the browser handles them normally. */
  const openRow = (e: MouseEvent<HTMLTableRowElement>, href: string) => {
    if (e.target instanceof Element && e.target.closest('a,button,input,select,[role="button"]')) return;
    router.push(href);
  };

  // Count by source for the header
  const leadCount = leads.filter(l => l._source === 'lead').length;
  const prospectCount = leads.filter(l => l._source === 'prospect').length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* Header + Filters */}
        <div className="flex flex-col gap-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-text-primary">Leads</h1>
              {!loading && leads.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-md bg-csa-accent/15 text-csa-accent">
                    {leadCount} Lead{leadCount !== 1 ? 's' : ''}
                  </span>
                  <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-md bg-csa-purple/15 text-csa-purple">
                    {prospectCount} Prospect{prospectCount !== 1 ? 's' : ''}
                  </span>
                </div>
              )}
            </div>
            {!loading && sortedLeads.length > 0 && user?.permissions?.canExportData && (
              <button
                onClick={() => exportLeadsList(sortedLeads, {
                  status: selectedStatus || undefined,
                  evaluation: selectedEval || undefined,
                  region: selectedRegion || undefined,
                  reseller: resellers.find(r => r.id === selectedReseller)?.name,
                  search: searchDebounced || undefined,
                })}
                className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-csa-accent bg-csa-accent/10 border border-csa-accent/30 rounded-xl hover:bg-csa-accent/20 transition-colors cursor-pointer"
              >
                <Download size={14} /> Export
              </button>
            )}
          </div>

          {/* Search + Filters Row 1 */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="flex-1 min-w-[240px] relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-tour="leads-search"
                placeholder="Search leads by name, email, or company..."
                className="w-full bg-surface border-2 border-border-subtle pl-10 pr-4 py-2.5 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-xl"
              />
            </div>

            {/* Lead Status filter */}
            <div className="relative min-w-[170px]">
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full bg-surface border-2 border-border-subtle px-4 py-2.5 text-sm text-text-primary outline-none focus:border-csa-accent rounded-xl appearance-none cursor-pointer pr-10"
              >
                <option value="">All Statuses</option>
                {LEAD_STATUSES.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            </div>

            {/* Evaluation filter */}
            <div className="relative min-w-[180px]">
              <select
                value={selectedEval}
                onChange={(e) => setSelectedEval(e.target.value)}
                className="w-full bg-surface border-2 border-border-subtle px-4 py-2.5 text-sm text-text-primary outline-none focus:border-csa-accent rounded-xl appearance-none cursor-pointer pr-10"
              >
                <option value="">With &amp; Without Evals</option>
                <option value="has-evaluation">Has Evaluation</option>
                <option value="no-evaluation">No Evaluation</option>
                {EVAL_PRODUCTS.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            </div>
          </div>

          {/* Filters Row 2 (region + reseller) */}
          {canFilterReseller && (
            <div className="flex flex-wrap items-center gap-3">
              {/* Region filter (admin only) */}
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
              {filteredResellers.length > 1 && (
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
          )}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 size={24} className="text-csa-accent animate-spin" />
            <span className="text-xs text-text-muted">Loading leads...</span>
          </div>
        )}

        {/* Pagination (top) */}
        {!loading && sortedLeads.length > 0 && (
          <div className="mb-3">
            <Pagination currentPage={safePage} totalItems={sortedLeads.length} pageSize={pageSize} onPageChange={setCurrentPage} />
          </div>
        )}

        {/* Leads list */}
        {!loading && paginatedLeads.length > 0 && (
          <div className="border border-border-subtle rounded-xl overflow-x-auto">
            <table data-tour="leads-results" className="w-full min-w-[900px]">
              <thead>
                <tr className="bg-surface-raised">
                  <th>Name</th>
                  <th>Reseller</th>
                  <th>Lead Source</th>
                  <th>Status</th>
                  <th>Evaluations</th>
                  <th>Product of Interest</th>
                  <th>Country</th>
                  <th onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')} className="cursor-pointer select-none group">
                    <span className="inline-flex items-center gap-1 whitespace-nowrap transition-colors text-csa-accent">
                      Created
                      {sortDir === 'asc'
                        ? <ArrowUp size={13} strokeWidth={2.5} className="text-csa-accent" />
                        : <ArrowDown size={13} strokeWidth={2.5} className="text-csa-accent" />
                      }
                    </span>
                  </th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {paginatedLeads.map((lead) => (
                  <motion.tr
                    key={`${lead._source}-${lead.id}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    onClick={(e) => openRow(e, leadHref(lead))}
                    className="cursor-pointer hover:bg-csa-accent/5 transition-colors"
                  >
                    <td>
                      <Link href={leadHref(lead)} className="flex items-center gap-2">
                        {lead._source === 'lead' ? (
                          <UserSearch size={14} className="text-csa-accent flex-shrink-0" />
                        ) : (
                          <Building2 size={14} className="text-csa-purple flex-shrink-0" />
                        )}
                        <div className="min-w-0">
                          <span className="font-semibold text-text-primary block truncate">{lead.name}</span>
                          {lead.email && (
                            <span className="text-xs text-text-muted block truncate">{lead.email}</span>
                          )}
                        </div>
                      </Link>
                    </td>
                    <td className="text-text-secondary text-sm">
                      {lead.reseller?.name || '\u2014'}
                    </td>
                    <td className="text-text-secondary text-sm">
                      {lead.leadSource || '\u2014'}
                    </td>
                    <td>
                      {lead.leadStatus ? (
                        <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-md ${STATUS_COLORS[lead.leadStatus] || 'bg-text-muted/20 text-text-muted'}`}>
                          {lead.leadStatus}
                        </span>
                      ) : '\u2014'}
                    </td>
                    <td>
                      {lead._source === 'prospect' ? (
                        lead.evaluations.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {lead.evaluations.map(e => (
                              <span key={e} className="px-1.5 py-0.5 text-[9px] font-bold uppercase rounded bg-success/15 text-success whitespace-nowrap">
                                {e.replace('Civil Site Design', 'CSD').replace('Corridor EZ', 'CEZ')}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-text-muted">None</span>
                        )
                      ) : (
                        <span className="text-xs text-text-muted">{'\u2014'}</span>
                      )}
                    </td>
                    <td className="text-text-secondary text-sm">
                      {lead._source === 'prospect' ? (
                        lead.evaluations.length > 0 ? lead.evaluations.join(', ') : '\u2014'
                      ) : (
                        lead.productInterest || '\u2014'
                      )}
                    </td>
                    <td className="text-text-secondary text-sm">
                      {lead.country || '\u2014'}
                    </td>
                    <td className="text-text-muted text-xs whitespace-nowrap">
                      {lead.createdTime ? (() => { const d = new Date(lead.createdTime); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`; })() : '\u2014'}
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
        {!loading && sortedLeads.length > pageSize && (
          <div className="mt-3">
            <Pagination currentPage={safePage} totalItems={sortedLeads.length} pageSize={pageSize} onPageChange={setCurrentPage} />
          </div>
        )}

        {/* Empty */}
        {!loading && leads.length === 0 && (
          <div className="text-center py-16">
            <UserSearch size={32} className="text-text-muted mx-auto mb-3" />
            <p className="text-sm text-text-muted">
              {search ? `No leads matching "${search}"` : 'No leads found'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
