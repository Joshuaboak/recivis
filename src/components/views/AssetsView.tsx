/**
 * AssetsView — The Assets section, in four flavours driven by `scope`.
 *
 *   all           Every asset, filterable by status and renewal window
 *   renewals      Active and renewing within 60 days, soonest first
 *   expired       Lapsed within the last 60 days, most recent first
 *   subscriptions Monthly subscriptions, with renew actions
 *
 * Assets are individual records in Zoho but partners think in customers, so
 * every scope renders as a list of accounts with their assets nested inside.
 *
 * Two actions live here. Renewing a monthly subscription, and — on the two
 * renewal views — raising a renewal order for selected licences, the same
 * call the customer page makes. Selection is per customer rather than across
 * the page: a renewal order belongs to one customer, so letting somebody tick
 * licences from three of them would only produce a failure further down.
 */

'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Package, Loader2, Search, ChevronDown, ChevronRight, RefreshCw,
  AlertTriangle, CalendarClock, Building2, Eye, FileText, ExternalLink,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { buildPath } from '@/lib/routes';
import { useGuardedRouter } from '@/lib/useGuardedRouter';
import { GuardedLink } from '@/components/GuardedLink';
import AssetDetailModal from '../AssetDetailModal';
import RenewMonthlySubscriptionsModal, { type RenewableSubscription } from '../RenewMonthlySubscriptionsModal';
import SubscriptionBadges from '../SubscriptionBadges';

export type AssetScope = 'all' | 'renewals' | 'expired' | 'subscriptions';

interface AssetRow {
  id: string;
  name: string;
  accountId: string;
  accountName: string;
  productName: string;
  productCode: string;
  status: string;
  quantity: number;
  serialKey: string;
  startDate: string | null;
  renewalDate: string | null;
  daysToRenewal: number | null;
  tags: string[];
  isMonthlySubscription: boolean;
  isPerpetualPlan: boolean;
  isEvaluation: boolean;
  /** Why this licence cannot be renewed, or null when it can. */
  renewalBlockedReason: string | null;
  /**
   * This year's renewal order, or null when one has not been generated.
   *
   * The server clears the id when Zoho's Renewal Invoice lookup still points
   * at an earlier cycle, so a value here is always the current renewal.
   */
  renewalOrderId: string | null;
}

interface AccountGroup {
  accountId: string;
  accountName: string;
  assets: AssetRow[];
  nextRenewal: string | null;
}

const SCOPE_META: Record<AssetScope, { title: string; blurb: string; empty: string }> = {
  all: {
    title: 'Assets',
    blurb: 'Every licence you can see, grouped by account.',
    empty: 'No assets found.',
  },
  renewals: {
    title: 'Due for Renewal',
    blurb: 'Active licences renewing within the next 60 days, soonest first.',
    empty: 'Nothing is due for renewal in the next 60 days.',
  },
  expired: {
    title: 'Recently Expired',
    blurb: 'Licences that lapsed in the last 60 days, most recent first.',
    empty: 'Nothing has expired in the last 60 days.',
  },
  subscriptions: {
    title: 'Monthly Subscriptions',
    blurb: 'Rolling 30-day licences. Renew one at a time or a whole account at once.',
    empty: 'No monthly subscriptions yet.',
  },
};

const STATUS_OPTIONS = ['', 'Active', 'Expired', 'Cancelled'];

/** Renewal-window presets for the full assets view. */
const WINDOW_OPTIONS: Array<{ value: string; label: string; test: (days: number | null) => boolean }> = [
  { value: '', label: 'Any renewal date', test: () => true },
  { value: 'overdue', label: 'Overdue', test: d => d !== null && d < 0 },
  { value: '30', label: 'Next 30 days', test: d => d !== null && d >= 0 && d <= 30 },
  { value: '60', label: 'Next 60 days', test: d => d !== null && d >= 0 && d <= 60 },
  { value: '90', label: 'Next 90 days', test: d => d !== null && d >= 0 && d <= 90 },
];

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
}

/** "in 12 days" / "14 days ago" / "today" — the number people actually read. */
function relativeDays(days: number | null): string {
  if (days === null) return '—';
  if (days === 0) return 'today';
  if (days > 0) return `in ${days} day${days === 1 ? '' : 's'}`;
  const past = Math.abs(days);
  return `${past} day${past === 1 ? '' : 's'} ago`;
}

/** Shared empty set, so an unticked group does not allocate one per render. */
const EMPTY_SELECTION: Set<string> = new Set();

export default function AssetsView({ scope }: { scope: AssetScope }) {
  const { user } = useAppStore();
  const router = useGuardedRouter();
  const meta = SCOPE_META[scope];

  const [groups, setGroups] = useState<AccountGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [window, setWindow] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [viewingAsset, setViewingAsset] = useState<Record<string, unknown> | null>(null);
  const [renewing, setRenewing] = useState<RenewableSubscription[] | null>(null);
  const [notice, setNotice] = useState('');
  /** Ticked licences, by customer. Cleared whenever the list reloads. */
  const [selected, setSelected] = useState<Record<string, Set<string>>>({});
  /** The customer whose renewal is being generated, so only its button spins. */
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    fetch(`/api/assets/list?scope=${scope}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) { setError(data.error); return; }
        setGroups(data.groups || []);
        setSelected({});
      })
      .catch(() => setError('Failed to load assets'))
      .finally(() => setLoading(false));
  }, [scope]);

  useEffect(() => { load(); }, [load]);

  // Search and the extra filters run client-side: the set is already in memory
  // and re-querying Zoho on every keystroke would be far slower than filtering.
  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    const windowTest = WINDOW_OPTIONS.find(w => w.value === window)?.test ?? (() => true);

    return groups
      .map(group => ({
        ...group,
        assets: group.assets.filter(a => {
          if (status && a.status !== status) return false;
          if (!windowTest(a.daysToRenewal)) return false;
          if (!term) return true;
          return (
            a.accountName.toLowerCase().includes(term) ||
            a.productName.toLowerCase().includes(term) ||
            a.serialKey.toLowerCase().includes(term)
          );
        }),
      }))
      .filter(group => group.assets.length > 0);
  }, [groups, search, status, window]);

  const totalAssets = filtered.reduce((sum, g) => sum + g.assets.length, 0);

  const toggleGroup = (accountId: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(accountId)) next.delete(accountId);
      else next.add(accountId);
      return next;
    });
  };

  const toRenewable = (a: AssetRow): RenewableSubscription => ({
    id: a.id,
    label: a.productName || a.name,
    productCode: a.productCode,
    perpetualPlan: a.isPerpetualPlan,
    quantity: a.quantity,
  });

  const canRenew = !!user?.permissions?.canMonthlySubscriptions;

  /**
   * Renewal orders are only offered on the two renewal views. On All Assets
   * the list is the whole estate and mostly not due, so a column of ticks
   * there is noise; the customer page is the place for a one-off.
   */
  const canGenerateRenewals =
    (scope === 'renewals' || scope === 'expired') && !!user?.permissions?.canCreateInvoices;

  /**
   * The Renewal Order column, on Due for Renewal only. Elsewhere the renewal
   * being looked at is not the one the lookup points to.
   */
  const showRenewalOrder = scope === 'renewals';

  const selectedIn = (accountId: string): Set<string> => selected[accountId] ?? EMPTY_SELECTION;

  const toggleAsset = (accountId: string, assetId: string) => {
    setSelected(prev => {
      const current = new Set(prev[accountId] ?? []);
      if (current.has(assetId)) current.delete(assetId);
      else current.add(assetId);
      return { ...prev, [accountId]: current };
    });
  };

  /** Tick or clear every renewable licence in one customer's group. */
  const toggleGroupSelection = (group: AccountGroup) => {
    const renewable = group.assets.filter(a => !a.renewalBlockedReason).map(a => a.id);
    setSelected(prev => {
      const current = prev[group.accountId] ?? EMPTY_SELECTION;
      const allOn = renewable.length > 0 && renewable.every(id => current.has(id));
      return { ...prev, [group.accountId]: new Set(allOn ? [] : renewable) };
    });
  };

  /**
   * Raise the renewal order and open it.
   *
   * Same endpoint the customer page uses, so the pricing, dates and order type
   * are whatever CSA's renewal function decides — this is a second way in, not
   * a second implementation.
   */
  const generateRenewal = async (accountId: string) => {
    const assetIds = Array.from(selectedIn(accountId));
    if (assetIds.length === 0 || generatingFor) return;

    setGeneratingFor(accountId);
    setNotice('');
    try {
      const res = await fetch('/api/renewals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset_ids: assetIds }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNotice(data.error || 'Could not generate the renewal.');
      } else if (data.invoiceId) {
        router.push(buildPath('invoice-detail', data.invoiceId));
        return;
      } else {
        // The renewal function reported success without an order id. It may
        // still have created one, so say so plainly rather than implying
        // nothing happened.
        setNotice('The renewal was submitted but no order came back. Check the customer before trying again.');
        setSelected(prev => ({ ...prev, [accountId]: new Set() }));
        load();
      }
    } catch {
      setNotice('Could not generate the renewal. Please try again.');
    }
    setGeneratingFor(null);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            {scope === 'subscriptions' ? <CalendarClock size={22} className="text-csa-accent" /> : <Package size={22} className="text-csa-accent" />}
            {meta.title}
          </h1>
          <p className="text-sm text-text-muted mt-1">{meta.blurb}</p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              data-tour="assets-search"
              placeholder="Search account, product or key..."
              className="w-full bg-surface border-2 border-border-subtle pl-10 pr-4 py-2.5 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-xl"
            />
          </div>

          {/* Status and renewal-window filters only make sense on the unfiltered
              view — the other scopes are themselves a status/date filter. */}
          {scope === 'all' && (
            <>
              <div className="relative">
                <select
                  value={status}
                  onChange={e => setStatus(e.target.value)}
                  className="bg-surface border-2 border-border-subtle pl-3 pr-8 py-2.5 text-sm text-text-primary outline-none focus:border-csa-accent rounded-xl appearance-none cursor-pointer"
                >
                  {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s || 'Any status'}</option>)}
                </select>
                <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
              </div>
              <div data-tour="assets-window-filter" className="relative">
                <select
                  value={window}
                  onChange={e => setWindow(e.target.value)}
                  className="bg-surface border-2 border-border-subtle pl-3 pr-8 py-2.5 text-sm text-text-primary outline-none focus:border-csa-accent rounded-xl appearance-none cursor-pointer"
                >
                  {WINDOW_OPTIONS.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
                </select>
                <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
              </div>
            </>
          )}

          <button
            onClick={load}
            className="flex items-center gap-2 px-3 py-2.5 text-xs font-semibold text-text-muted bg-surface border-2 border-border-subtle rounded-xl hover:border-csa-accent/30 hover:text-csa-accent transition-colors cursor-pointer"
          >
            <RefreshCw size={14} /> Refresh
          </button>

          <span className="text-xs text-text-muted ml-auto">
            {totalAssets} asset{totalAssets === 1 ? '' : 's'} across {filtered.length} account{filtered.length === 1 ? '' : 's'}
          </span>
        </div>

        {/* Body */}
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-text-muted py-12 justify-center">
            <Loader2 size={16} className="animate-spin" /> Loading assets...
          </div>
        ) : error ? (
          <p className="text-sm text-error py-12 text-center">{error}</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Package size={32} className="text-text-muted mx-auto mb-3" />
            <p className="text-sm text-text-muted">{meta.empty}</p>
          </div>
        ) : (
          <div data-tour="assets-groups" className="space-y-3">
            {filtered.map((group, i) => {
              const isCollapsed = collapsed.has(group.accountId);
              const renewables = group.assets.filter(a => a.isMonthlySubscription).map(toRenewable);
              const groupSelection = selectedIn(group.accountId);
              const renewableIds = group.assets.filter(a => !a.renewalBlockedReason).map(a => a.id);
              const allSelected =
                renewableIds.length > 0 && renewableIds.every(id => groupSelection.has(id));

              return (
                <motion.div
                  key={group.accountId}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.02, 0.2) }}
                  className="border border-border-subtle rounded-xl overflow-hidden bg-surface"
                >
                  {/* Group header */}
                  <div className="flex items-center gap-3 px-4 py-3 bg-surface-raised">
                    <button
                      onClick={() => toggleGroup(group.accountId)}
                      className="text-text-muted hover:text-text-primary transition-colors cursor-pointer"
                      aria-label={isCollapsed ? 'Expand' : 'Collapse'}
                    >
                      {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                    </button>
                    <Building2 size={15} className="text-csa-accent flex-shrink-0" />
                    <GuardedLink
                      href={buildPath('account-detail', group.accountId)}
                      className="text-sm font-bold text-text-primary hover:text-csa-accent transition-colors truncate cursor-pointer"
                    >
                      {group.accountName}
                    </GuardedLink>
                    <span className="text-xs text-text-muted flex-shrink-0">
                      {group.assets.length} asset{group.assets.length === 1 ? '' : 's'}
                    </span>
                    {group.nextRenewal && (
                      <span className="text-xs text-text-muted flex-shrink-0 hidden sm:inline">
                        &bull; next renewal {formatDate(group.nextRenewal)}
                      </span>
                    )}
                    {canGenerateRenewals && groupSelection.size > 0 && (
                      <button
                        onClick={() => generateRenewal(group.accountId)}
                        disabled={generatingFor !== null}
                        className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-success bg-success/10 border border-success/30 rounded-lg hover:bg-success/20 transition-colors cursor-pointer flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {generatingFor === group.accountId
                          ? <Loader2 size={12} className="animate-spin" />
                          : <FileText size={12} />}
                        {generatingFor === group.accountId
                          ? 'Generating...'
                          : `Generate Renewal (${groupSelection.size})`}
                      </button>
                    )}
                    {canRenew && renewables.length > 0 && (
                      <button
                        onClick={() => setRenewing(renewables)}
                        className={`${canGenerateRenewals && groupSelection.size > 0 ? '' : 'ml-auto '}flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-csa-accent bg-csa-accent/10 border border-csa-accent/30 rounded-lg hover:bg-csa-accent/20 transition-colors cursor-pointer flex-shrink-0`}
                      >
                        <RefreshCw size={12} /> Renew all ({renewables.length})
                      </button>
                    )}
                  </div>

                  {/* Assets */}
                  {!isCollapsed && (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[720px]">
                        <thead>
                          <tr className="bg-surface text-left">
                            {canGenerateRenewals && (
                              <th className="pl-4 pr-1 py-2 w-8">
                                <input
                                  type="checkbox"
                                  checked={allSelected}
                                  onChange={() => toggleGroupSelection(group)}
                                  disabled={renewableIds.length === 0}
                                  aria-label={`Select all renewable licences for ${group.accountName}`}
                                  className="accent-csa-accent cursor-pointer disabled:cursor-not-allowed"
                                />
                              </th>
                            )}
                            <th className="px-4 py-2 text-[10px] font-bold text-text-muted uppercase tracking-wider">Product</th>
                            <th className="px-4 py-2 text-[10px] font-bold text-text-muted uppercase tracking-wider">Qty</th>
                            <th className="px-4 py-2 text-[10px] font-bold text-text-muted uppercase tracking-wider">Status</th>
                            <th className="px-4 py-2 text-[10px] font-bold text-text-muted uppercase tracking-wider">Renewal</th>
                            <th className="px-4 py-2 text-[10px] font-bold text-text-muted uppercase tracking-wider">Serial Key</th>
                            {showRenewalOrder && (
                              <th className="px-4 py-2 text-[10px] font-bold text-text-muted uppercase tracking-wider">Renewal Order</th>
                            )}
                            <th className="px-4 py-2 w-24" />
                          </tr>
                        </thead>
                        <tbody>
                          {group.assets.map(asset => {
                            const overdue = asset.daysToRenewal !== null && asset.daysToRenewal < 0;
                            const soon = asset.daysToRenewal !== null && asset.daysToRenewal >= 0 && asset.daysToRenewal <= 14;
                            return (
                              <tr key={asset.id} className="border-t border-border-subtle hover:bg-csa-accent/5 transition-colors">
                                {canGenerateRenewals && (
                                  <td className="pl-4 pr-1 py-2.5">
                                    <input
                                      type="checkbox"
                                      checked={groupSelection.has(asset.id)}
                                      onChange={() => toggleAsset(group.accountId, asset.id)}
                                      disabled={!!asset.renewalBlockedReason}
                                      title={asset.renewalBlockedReason || 'Select for renewal'}
                                      aria-label={`Select ${asset.productName || asset.name} for renewal`}
                                      className="accent-csa-accent cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                                    />
                                  </td>
                                )}
                                <td className="px-4 py-2.5 text-sm text-text-primary">
                                  {asset.productName || asset.name}
                                  <SubscriptionBadges
                                    monthly={asset.isMonthlySubscription}
                                    perpetual={asset.isPerpetualPlan}
                                    size="xs"
                                  />
                                </td>
                                <td className="px-4 py-2.5 text-sm text-text-secondary">{asset.quantity}</td>
                                <td className="px-4 py-2.5 text-sm text-text-secondary">{asset.status}</td>
                                <td className="px-4 py-2.5 text-sm">
                                  <span className={overdue ? 'text-error' : soon ? 'text-warning' : 'text-text-secondary'}>
                                    {formatDate(asset.renewalDate)}
                                  </span>
                                  <span className="block text-[10px] text-text-muted">{relativeDays(asset.daysToRenewal)}</span>
                                </td>
                                <td className="px-4 py-2.5 text-xs font-mono text-text-muted">{asset.serialKey || '—'}</td>
                                {showRenewalOrder && (
                                  <td className="px-4 py-2.5 text-sm">
                                    {asset.renewalOrderId ? (
                                      <GuardedLink
                                        href={buildPath('invoice-detail', asset.renewalOrderId)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-csa-accent hover:underline cursor-pointer"
                                      >
                                        View order <ExternalLink size={12} />
                                      </GuardedLink>
                                    ) : (
                                      <span className="text-text-muted">Renewal not generated</span>
                                    )}
                                  </td>
                                )}
                                <td className="px-4 py-2.5">
                                  <div className="flex items-center justify-end gap-1">
                                    {canRenew && asset.isMonthlySubscription && (
                                      <button
                                        onClick={() => setRenewing([toRenewable(asset)])}
                                        className="p-1.5 text-text-muted hover:text-csa-accent transition-colors cursor-pointer"
                                        title="Renew this subscription"
                                      >
                                        <RefreshCw size={14} />
                                      </button>
                                    )}
                                    <button
                                      onClick={() => setViewingAsset({
                                        id: asset.id,
                                        Name: asset.name,
                                        Serial_Key: asset.serialKey,
                                        Quantity: asset.quantity,
                                        Status: asset.status,
                                        Start_Date: asset.startDate,
                                        Renewal_Date: asset.renewalDate,
                                      })}
                                      className="p-1.5 text-text-muted hover:text-csa-accent transition-colors cursor-pointer"
                                      title="View asset"
                                    >
                                      <Eye size={14} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {viewingAsset && (
        <AssetDetailModal
          assetId={viewingAsset.id as string}
          assetData={viewingAsset}
          onClose={() => setViewingAsset(null)}
          onAssetUpdated={load}
        />
      )}

      {renewing && (
        <RenewMonthlySubscriptionsModal
          subscriptions={renewing}
          onDone={(renewedIds, failures) => {
            setRenewing(null);
            setNotice(
              failures.length === 0
                ? `Renewed ${renewedIds.length} monthly ${renewedIds.length === 1 ? 'subscription' : 'subscriptions'}.`
                : `Renewed ${renewedIds.length}, ${failures.length} failed: ${failures.map(f => f.reason).join('; ')}`
            );
            load();
          }}
          onClose={() => setRenewing(null)}
        />
      )}

      {notice && (
        <div className="fixed bottom-6 right-20 z-50 max-w-sm bg-csa-dark border border-csa-accent/40 rounded-xl px-4 py-3 shadow-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle size={14} className="text-csa-accent mt-0.5 flex-shrink-0" />
            <p className="text-xs text-text-primary flex-1">{notice}</p>
            <button onClick={() => setNotice('')} className="text-text-muted hover:text-text-primary cursor-pointer text-xs">
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
