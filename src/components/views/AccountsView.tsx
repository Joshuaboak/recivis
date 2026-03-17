'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Search, Building2, Loader2, MapPin, ExternalLink, ChevronDown } from 'lucide-react';
import { useAppStore } from '@/lib/store';

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

export default function AccountsView() {
  const { user, setCurrentView, setSelectedAccountId } = useAppStore();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [resellers, setResellers] = useState<ResellerFilter[]>([]);
  const [selectedReseller, setSelectedReseller] = useState<string>('');
  const [selectedRegion, setSelectedRegion] = useState<string>('');

  const isAdmin = user?.role === 'admin' || user?.role === 'ibm';
  const canFilterReseller = isAdmin || user?.permissions?.canViewChildRecords;

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  // Load resellers for filter
  useEffect(() => {
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
  }, [isAdmin, user?.resellerId]);

  // Fetch accounts
  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchDebounced) params.set('search', searchDebounced);
      if (selectedReseller) params.set('resellerId', selectedReseller);

      const res = await fetch(`/api/accounts?${params}`);
      const data = await res.json();
      let filtered = data.accounts || [];

      // Client-side region filter
      if (selectedRegion && isAdmin) {
        // Region is on the reseller, not directly on account
        // For now, we'll filter post-fetch if reseller data is available
      }

      setAccounts(filtered);
    } catch {
      setAccounts([]);
    }
    setLoading(false);
  }, [searchDebounced, selectedReseller, selectedRegion, isAdmin]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const openAccount = (id: string) => {
    setSelectedAccountId(id);
    setCurrentView('account-detail');
  };

  const regions = [...new Set(resellers.map(r => r.region).filter(Boolean))].sort();

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* Header + Filters */}
        <div className="flex flex-col gap-4 mb-6">
          <h1 className="text-2xl font-bold text-text-primary">Accounts</h1>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="flex-1 min-w-[240px] relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search accounts..."
                className="w-full bg-surface border-2 border-border-subtle pl-10 pr-4 py-2.5 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-xl"
              />
            </div>

            {/* Reseller filter */}
            {canFilterReseller && resellers.length > 1 && (
              <div className="relative min-w-[200px]">
                <select
                  value={selectedReseller}
                  onChange={(e) => setSelectedReseller(e.target.value)}
                  className="w-full bg-surface border-2 border-border-subtle px-4 py-2.5 text-sm text-text-primary outline-none focus:border-csa-accent rounded-xl appearance-none cursor-pointer pr-10"
                >
                  <option value="">All Resellers</option>
                  {resellers.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
              </div>
            )}

            {/* Region filter (admin/ibm only) */}
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
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="text-csa-accent animate-spin" />
          </div>
        )}

        {/* Accounts list */}
        {!loading && accounts.length > 0 && (
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
                {accounts.map((acc, i) => (
                  <motion.tr
                    key={acc.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.02 }}
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
                      {acc.Reseller?.name || '—'}
                    </td>
                    <td className="text-text-muted text-sm">
                      {acc.Owner?.name || '—'}
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

        {/* Empty */}
        {!loading && accounts.length === 0 && (
          <div className="text-center py-16">
            <Building2 size={32} className="text-text-muted mx-auto mb-3" />
            <p className="text-sm text-text-muted">
              {search ? `No accounts matching "${search}"` : 'Search for an account to get started'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
