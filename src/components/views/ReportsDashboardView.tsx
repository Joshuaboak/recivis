'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart3, Building2, UserSearch, FileText, Loader2, TrendingUp, TrendingDown,
  DollarSign, ChevronDown, ChevronLeft, ChevronRight, Users, ArrowRight, ExternalLink,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';

interface RecordRow { id: string; name: string; reseller: string; country: string; date: string }
interface InvoiceRow {
  id: string; ref: string; subject: string; account: string; reseller: string;
  date: string; total: number; listTotal: number; csaRevenue: number;
  distributorOwed: number; resellerOwed: number; currency: string;
  status: string; paymentStatus: string; isResellerDirect: boolean;
}
interface MonthReport {
  month: string; label: string; accounts: number; leads: number; prospects: number;
  invoiceCount: number; invoiceTotal: number; listTotal: number; csaRevenue: number;
  distributorOwed: number; resellerOwed: number;
  invoices: InvoiceRow[]; accountItems: RecordRow[]; leadItems: RecordRow[]; prospectItems: RecordRow[];
}
interface ResellerFilter { id: string; name: string; region: string }

const REGION_LABELS: Record<string, string> = {
  AF: 'Africa', AS: 'Asia', AU: 'Australia', EU: 'Europe', NA: 'North America', NZ: 'New Zealand', WW: 'Worldwide',
};

type Tab = 'overview' | 'accounts' | 'leads' | 'revenue';

export default function ReportsDashboardView() {
  const { user, setCurrentView, setSelectedAccountId, setSelectedLeadId, setSelectedLeadSource, setSelectedInvoiceId, setInvoiceReturnView } = useAppStore();
  const [data, setData] = useState<{ months: MonthReport[]; totals: Record<string, number> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');
  const [selectedMonths, setSelectedMonths] = useState<Set<string>>(new Set());
  const [monthCount, setMonthCount] = useState(13);
  const [drillMonth, setDrillMonth] = useState<string | null>(null);

  // Filters (admin only)
  const [resellers, setResellers] = useState<ResellerFilter[]>([]);
  const [selectedRegion, setSelectedRegion] = useState('');
  const [selectedReseller, setSelectedReseller] = useState('');

  const isAdmin = user?.role === 'admin' || user?.role === 'ibm';
  const isDistributor = user?.permissions?.canViewChildRecords;

  // Load resellers for filter
  useEffect(() => {
    if (!isAdmin) return;
    fetch('/api/resellers')
      .then(r => r.json())
      .then(d => setResellers(d.resellers || []))
      .catch(() => {});
  }, [isAdmin]);

  // Fetch report data
  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ months: String(monthCount) });
    if (selectedRegion) params.set('region', selectedRegion);
    if (selectedReseller) params.set('resellerId', selectedReseller);

    fetch(`/api/reports?${params}`)
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [monthCount, selectedRegion, selectedReseller]);

  // Aggregate selected months (or all if none selected)
  const aggregated = useMemo(() => {
    if (!data) return null;
    const months = selectedMonths.size > 0
      ? data.months.filter(m => selectedMonths.has(m.month))
      : data.months;

    return {
      months,
      accounts: months.reduce((s, m) => s + m.accounts, 0),
      leads: months.reduce((s, m) => s + m.leads, 0),
      prospects: months.reduce((s, m) => s + m.prospects, 0),
      invoiceCount: months.reduce((s, m) => s + m.invoiceCount, 0),
      invoiceTotal: Math.round(months.reduce((s, m) => s + m.invoiceTotal, 0) * 100) / 100,
      listTotal: Math.round(months.reduce((s, m) => s + m.listTotal, 0) * 100) / 100,
      csaRevenue: Math.round(months.reduce((s, m) => s + m.csaRevenue, 0) * 100) / 100,
      distributorOwed: Math.round(months.reduce((s, m) => s + m.distributorOwed, 0) * 100) / 100,
      resellerOwed: Math.round(months.reduce((s, m) => s + m.resellerOwed, 0) * 100) / 100,
      allInvoices: months.flatMap(m => m.invoices),
      allAccounts: months.flatMap(m => m.accountItems),
      allLeads: months.flatMap(m => m.leadItems),
      allProspects: months.flatMap(m => m.prospectItems),
    };
  }, [data, selectedMonths]);

  const toggleMonth = (m: string) => {
    setSelectedMonths(prev => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m); else next.add(m);
      return next;
    });
    setDrillMonth(null);
  };

  const formatCurrency = (v: number, currency = 'AUD') => {
    const sym = currency === 'EUR' ? '\u20AC' : currency === 'GBP' ? '\u00A3' : currency === 'INR' ? '\u20B9' : '$';
    return `${sym}${v.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatDate = (d: string) => {
    if (!d) return '\u2014';
    const date = new Date(d);
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
  };

  // Find the max bar value for the chart
  const maxBar = useMemo(() => {
    if (!data) return 1;
    const field = tab === 'accounts' ? 'accounts' : tab === 'leads' ? 'leads' : 'invoiceTotal';
    return Math.max(...data.months.map(m => {
      if (field === 'accounts') return m.accounts;
      if (field === 'leads') return m.leads;
      return m.invoiceTotal;
    }), 1);
  }, [data, tab]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full gap-3">
        <Loader2 size={24} className="text-csa-accent animate-spin" />
        <span className="text-sm text-text-muted">Generating reports...</span>
      </div>
    );
  }

  if (!data || !aggregated) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-text-muted">No report data available</p>
      </div>
    );
  }

  const prevMonth = data.months[1];
  const currMonth = data.months[0];

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Header + Filters */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <BarChart3 size={24} className="text-csa-accent" />
            Reports Dashboard
          </h1>
          {isAdmin && (
            <div className="flex items-center gap-2">
              <select value={selectedRegion} onChange={e => setSelectedRegion(e.target.value)}
                className="bg-surface border-2 border-border-subtle px-3 py-2 text-xs text-text-primary rounded-xl appearance-none cursor-pointer pr-8">
                <option value="">All Regions</option>
                {Object.entries(REGION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <select value={selectedReseller} onChange={e => setSelectedReseller(e.target.value)}
                className="bg-surface border-2 border-border-subtle px-3 py-2 text-xs text-text-primary rounded-xl appearance-none cursor-pointer pr-8 max-w-[200px]">
                <option value="">All Partners</option>
                {resellers.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-1 mb-6 bg-surface rounded-xl p-1 w-fit">
          {(['overview', 'accounts', 'leads', 'revenue'] as Tab[]).map(t => (
            <button key={t} onClick={() => { setTab(t); setDrillMonth(null); }}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer capitalize ${
                tab === t ? 'bg-csa-accent/15 text-csa-accent' : 'text-text-muted hover:text-text-primary'
              }`}>
              {t}
            </button>
          ))}
        </div>

        {/* Month picker */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Months</span>
            {selectedMonths.size > 0 && (
              <button onClick={() => setSelectedMonths(new Set())} className="text-[10px] text-csa-accent cursor-pointer">
                Clear Selection
              </button>
            )}
            <div className="flex-1" />
            <button onClick={() => setMonthCount(c => c + 12)} className="text-[10px] text-text-muted hover:text-text-primary cursor-pointer">
              Load More
            </button>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {data.months.map(m => {
              const active = selectedMonths.has(m.month);
              const isCurrent = m.month === currMonth?.month;
              return (
                <button key={m.month} onClick={() => toggleMonth(m.month)}
                  className={`px-3 py-1.5 text-[10px] font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap flex-shrink-0 ${
                    active ? 'bg-csa-accent/20 text-csa-accent border border-csa-accent/40'
                    : isCurrent ? 'bg-surface-raised text-text-primary border border-border-subtle'
                    : 'bg-surface text-text-muted border border-border-subtle hover:text-text-secondary'
                  }`}>
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* === OVERVIEW TAB === */}
        {tab === 'overview' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {/* Summary cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <SummaryCard label="New Accounts" value={aggregated.accounts} icon={Building2} color="text-csa-accent"
                prev={prevMonth?.accounts} curr={currMonth?.accounts} />
              <SummaryCard label="New Leads" value={aggregated.leads + aggregated.prospects} icon={UserSearch} color="text-success"
                prev={(prevMonth?.leads || 0) + (prevMonth?.prospects || 0)} curr={(currMonth?.leads || 0) + (currMonth?.prospects || 0)} />
              <SummaryCard label="Invoices" value={aggregated.invoiceCount} icon={FileText} color="text-csa-purple"
                prev={prevMonth?.invoiceCount} curr={currMonth?.invoiceCount} />
              <SummaryCard label={isAdmin ? 'CSA Revenue' : isDistributor ? 'Your Earnings' : 'Revenue'}
                value={formatCurrency(isAdmin ? aggregated.csaRevenue : isDistributor ? aggregated.distributorOwed : aggregated.resellerOwed)}
                icon={DollarSign} color="text-warning" isText />
            </div>

            {/* Revenue breakdown (admin) */}
            {isAdmin && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <div className="bg-surface border border-border-subtle rounded-xl px-4 py-3">
                  <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1">Total List Revenue</p>
                  <p className="text-lg font-bold text-text-primary">{formatCurrency(aggregated.listTotal)}</p>
                </div>
                <div className="bg-surface border border-border-subtle rounded-xl px-4 py-3">
                  <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1">Owed to Distributors</p>
                  <p className="text-lg font-bold text-warning">{formatCurrency(aggregated.distributorOwed)}</p>
                </div>
                <div className="bg-surface border border-border-subtle rounded-xl px-4 py-3">
                  <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1">Owed to Resellers</p>
                  <p className="text-lg font-bold text-csa-purple">{formatCurrency(aggregated.resellerOwed)}</p>
                </div>
              </div>
            )}

            {/* Bar chart */}
            <div className="bg-surface border border-border-subtle rounded-xl p-5 mb-8">
              <h3 className="text-sm font-bold text-text-primary mb-4">Monthly Trend — Revenue</h3>
              <div className="flex items-end gap-1.5 h-40">
                {[...data.months].reverse().map(m => {
                  const val = m.invoiceTotal;
                  const height = maxBar > 0 ? (val / maxBar) * 100 : 0;
                  const isSelected = selectedMonths.has(m.month);
                  return (
                    <div key={m.month} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                      <span className="text-[8px] text-text-muted">{val > 0 ? formatCurrency(val) : ''}</span>
                      <div className="w-full relative" style={{ height: '100%' }}>
                        <div
                          className={`absolute bottom-0 w-full rounded-t transition-colors ${
                            isSelected ? 'bg-csa-accent' : 'bg-csa-accent/40'
                          }`}
                          style={{ height: `${Math.max(height, 2)}%` }}
                        />
                      </div>
                      <span className="text-[8px] text-text-muted truncate w-full text-center">{m.label.slice(0, 3)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}

        {/* === ACCOUNTS TAB === */}
        {tab === 'accounts' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <SummaryCard label="Total New Accounts" value={aggregated.accounts} icon={Building2} color="text-csa-accent" />
            </div>
            <MonthTable
              months={aggregated.months} field="accounts"
              onDrill={setDrillMonth} drillMonth={drillMonth}
              columns={['Name', 'Reseller', 'Country', 'Created']}
              renderRows={(m) => m.accountItems.map(a => (
                <tr key={a.id} onClick={() => { setSelectedAccountId(a.id); setCurrentView('account-detail'); }}
                  className="cursor-pointer hover:bg-csa-accent/5 transition-colors">
                  <td className="font-semibold text-text-primary">{a.name}</td>
                  <td className="text-text-secondary text-sm">{a.reseller || '\u2014'}</td>
                  <td className="text-text-secondary text-sm">{a.country || '\u2014'}</td>
                  <td className="text-text-muted text-xs">{formatDate(a.date)}</td>
                </tr>
              ))}
            />
          </motion.div>
        )}

        {/* === LEADS TAB === */}
        {tab === 'leads' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <SummaryCard label="Total Leads" value={aggregated.leads} icon={UserSearch} color="text-csa-accent" />
              <SummaryCard label="Total Prospects" value={aggregated.prospects} icon={Building2} color="text-csa-purple" />
            </div>
            <MonthTable
              months={aggregated.months} field="leads" secondField="prospects"
              onDrill={setDrillMonth} drillMonth={drillMonth}
              columns={['Name', 'Type', 'Reseller', 'Country', 'Created']}
              renderRows={(m) => [
                ...m.leadItems.map(l => (
                  <tr key={`l-${l.id}`} onClick={() => { setSelectedLeadId(l.id); setSelectedLeadSource('lead'); setCurrentView('lead-detail'); }}
                    className="cursor-pointer hover:bg-csa-accent/5 transition-colors">
                    <td className="font-semibold text-text-primary">{l.name}</td>
                    <td><span className="px-1.5 py-0.5 text-[9px] font-bold uppercase rounded bg-csa-accent/15 text-csa-accent">Lead</span></td>
                    <td className="text-text-secondary text-sm">{l.reseller || '\u2014'}</td>
                    <td className="text-text-secondary text-sm">{l.country || '\u2014'}</td>
                    <td className="text-text-muted text-xs">{formatDate(l.date)}</td>
                  </tr>
                )),
                ...m.prospectItems.map(p => (
                  <tr key={`p-${p.id}`} onClick={() => { setSelectedLeadId(p.id); setSelectedLeadSource('prospect'); setCurrentView('lead-detail'); }}
                    className="cursor-pointer hover:bg-csa-accent/5 transition-colors">
                    <td className="font-semibold text-text-primary">{p.name}</td>
                    <td><span className="px-1.5 py-0.5 text-[9px] font-bold uppercase rounded bg-csa-purple/15 text-csa-purple">Prospect</span></td>
                    <td className="text-text-secondary text-sm">{p.reseller || '\u2014'}</td>
                    <td className="text-text-secondary text-sm">{p.country || '\u2014'}</td>
                    <td className="text-text-muted text-xs">{formatDate(p.date)}</td>
                  </tr>
                )),
              ]}
            />
          </motion.div>
        )}

        {/* === REVENUE TAB === */}
        {tab === 'revenue' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <SummaryCard label="Invoices" value={aggregated.invoiceCount} icon={FileText} color="text-csa-accent" />
              <SummaryCard label="List Revenue" value={formatCurrency(aggregated.listTotal)} icon={DollarSign} color="text-text-primary" isText />
              {isAdmin && <SummaryCard label="CSA Revenue" value={formatCurrency(aggregated.csaRevenue)} icon={DollarSign} color="text-success" isText />}
              {(isAdmin || isDistributor) && <SummaryCard label="Distributor Owed" value={formatCurrency(aggregated.distributorOwed)} icon={DollarSign} color="text-warning" isText />}
              {!isDistributor && <SummaryCard label="Reseller Owed" value={formatCurrency(aggregated.resellerOwed)} icon={DollarSign} color="text-csa-purple" isText />}
            </div>
            <MonthTable
              months={aggregated.months} field="invoiceTotal" isCurrency
              onDrill={setDrillMonth} drillMonth={drillMonth}
              columns={['Invoice', 'Account', 'Reseller', 'Date', 'Type', 'List Total', ...(isAdmin ? ['CSA Rev', 'Distro Owed', 'Reseller Owed'] : isDistributor ? ['Your Earnings'] : ['Your Commission']), 'Status']}
              renderRows={(m) => m.invoices.map(inv => (
                <tr key={inv.id} onClick={() => { setSelectedInvoiceId(inv.id); setInvoiceReturnView('draft-invoices'); setCurrentView('invoice-detail'); }}
                  className="cursor-pointer hover:bg-csa-accent/5 transition-colors">
                  <td className="text-text-muted text-xs font-mono">{inv.ref || '\u2014'}</td>
                  <td className="text-text-secondary text-sm">{inv.account || '\u2014'}</td>
                  <td className="text-text-secondary text-sm">{inv.reseller || '\u2014'}</td>
                  <td className="text-text-muted text-xs">{formatDate(inv.date)}</td>
                  <td>
                    <span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase rounded ${inv.isResellerDirect ? 'bg-csa-accent/15 text-csa-accent' : 'bg-csa-purple/15 text-csa-purple'}`}>
                      {inv.isResellerDirect ? 'Reseller' : 'Customer'}
                    </span>
                  </td>
                  <td className="text-text-primary font-semibold text-sm">{formatCurrency(inv.listTotal, inv.currency)}</td>
                  {isAdmin && <>
                    <td className="text-success text-sm font-semibold">{formatCurrency(inv.csaRevenue, inv.currency)}</td>
                    <td className="text-warning text-sm">{formatCurrency(inv.distributorOwed, inv.currency)}</td>
                    <td className="text-csa-purple text-sm">{formatCurrency(inv.resellerOwed, inv.currency)}</td>
                  </>}
                  {isDistributor && !isAdmin && <td className="text-warning text-sm font-semibold">{formatCurrency(inv.distributorOwed, inv.currency)}</td>}
                  {!isDistributor && !isAdmin && <td className="text-csa-purple text-sm font-semibold">{formatCurrency(inv.resellerOwed, inv.currency)}</td>}
                  <td>
                    <span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase rounded ${
                      inv.paymentStatus?.toLowerCase() === 'paid' ? 'bg-success/15 text-success'
                      : inv.status === 'Approved' || inv.status === 'Sent' ? 'bg-csa-accent/15 text-csa-accent'
                      : 'bg-warning/15 text-warning'
                    }`}>
                      {inv.paymentStatus?.toLowerCase() === 'paid' ? 'Paid' : inv.status}
                    </span>
                  </td>
                </tr>
              ))}
            />
          </motion.div>
        )}
      </div>
    </div>
  );
}

// --- Sub-components ---

function SummaryCard({ label, value, icon: Icon, color, prev, curr, isText }: {
  label: string; value: number | string; icon: typeof Building2; color: string;
  prev?: number; curr?: number; isText?: boolean;
}) {
  const growth = prev != null && curr != null && prev > 0
    ? Math.round(((curr - prev) / prev) * 100)
    : null;

  return (
    <div className="bg-surface border border-border-subtle rounded-xl px-4 py-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">{label}</span>
        <Icon size={14} className={color} />
      </div>
      <p className="text-xl font-bold text-text-primary">{isText ? value : value.toLocaleString()}</p>
      {growth !== null && (
        <div className={`flex items-center gap-1 mt-1 text-[10px] font-semibold ${growth >= 0 ? 'text-success' : 'text-error'}`}>
          {growth >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
          {growth >= 0 ? '+' : ''}{growth}% vs prev month
        </div>
      )}
    </div>
  );
}

function MonthTable({ months, field, secondField, isCurrency, onDrill, drillMonth, columns, renderRows }: {
  months: MonthReport[]; field: string; secondField?: string; isCurrency?: boolean;
  onDrill: (m: string | null) => void; drillMonth: string | null;
  columns: string[]; renderRows: (m: MonthReport) => React.ReactNode[];
}) {
  return (
    <div className="space-y-2">
      {months.map(m => {
        const val = (m as unknown as Record<string, number>)[field] || 0;
        const val2 = secondField ? (m as unknown as Record<string, number>)[secondField] || 0 : 0;
        const isDrilling = drillMonth === m.month;

        return (
          <div key={m.month} className="border border-border-subtle rounded-xl overflow-hidden">
            <button onClick={() => onDrill(isDrilling ? null : m.month)}
              className="w-full flex items-center justify-between px-4 py-3 bg-surface hover:bg-surface-raised transition-colors cursor-pointer">
              <span className="text-sm font-semibold text-text-primary">{m.label}</span>
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-csa-accent">
                  {isCurrency ? `$${val.toLocaleString('en-AU', { minimumFractionDigits: 2 })}` : val}
                  {val2 > 0 && !isCurrency ? ` + ${val2}` : ''}
                </span>
                <ChevronDown size={14} className={`text-text-muted transition-transform ${isDrilling ? 'rotate-180' : ''}`} />
              </div>
            </button>
            {isDrilling && (
              <div className="border-t border-border-subtle">
                <table className="w-full">
                  <thead><tr className="bg-surface-raised">
                    {columns.map(c => <th key={c}>{c}</th>)}
                  </tr></thead>
                  <tbody>{renderRows(m)}</tbody>
                </table>
                {renderRows(m).length === 0 && (
                  <p className="text-xs text-text-muted text-center py-4">No records this month</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
