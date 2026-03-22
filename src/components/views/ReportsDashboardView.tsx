'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart3, Building2, UserSearch, FileText, Loader2, TrendingUp, TrendingDown,
  DollarSign, ChevronDown, Download,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';

interface RecordRow { id: string; name: string; reseller: string; country: string; date: string }
interface InvoiceRow {
  id: string; ref: string; subject: string; account: string; reseller: string;
  date: string; revenue: number; csaProfit: number;
  distributorOwed: number; resellerOwed: number; currency: string;
  status: string; paymentStatus: string; isResellerDirect: boolean;
}
interface CurrencyTotals { [currency: string]: { revenue: number; csaProfit: number; distributorOwed: number; resellerOwed: number } }
interface MonthReport {
  month: string; label: string; accounts: number; leads: number; prospects: number;
  invoiceCount: number; byCurrency: CurrencyTotals;
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
  const [resellers, setResellers] = useState<ResellerFilter[]>([]);
  const [selectedRegion, setSelectedRegion] = useState('');
  const [selectedReseller, setSelectedReseller] = useState('');

  const isAdminUser = user?.role === 'admin' || user?.role === 'ibm';
  const isDistributor = user?.permissions?.canViewChildRecords;

  useEffect(() => {
    if (!isAdminUser) return;
    fetch('/api/resellers').then(r => r.json()).then(d => setResellers(d.resellers || [])).catch(() => {});
  }, [isAdminUser]);

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

  const aggregated = useMemo(() => {
    if (!data) return null;
    const months = selectedMonths.size > 0
      ? data.months.filter(m => selectedMonths.has(m.month))
      : data.months;
    // Aggregate by currency across selected months
    const byCurrency: CurrencyTotals = {};
    for (const m of months) {
      for (const [cur, vals] of Object.entries(m.byCurrency || {})) {
        if (!byCurrency[cur]) byCurrency[cur] = { revenue: 0, csaProfit: 0, distributorOwed: 0, resellerOwed: 0 };
        byCurrency[cur].revenue += vals.revenue;
        byCurrency[cur].csaProfit += vals.csaProfit;
        byCurrency[cur].distributorOwed += vals.distributorOwed;
        byCurrency[cur].resellerOwed += vals.resellerOwed;
      }
    }

    return {
      months,
      accounts: months.reduce((s, m) => s + m.accounts, 0),
      leads: months.reduce((s, m) => s + m.leads, 0),
      prospects: months.reduce((s, m) => s + m.prospects, 0),
      invoiceCount: months.reduce((s, m) => s + m.invoiceCount, 0),
      byCurrency,
      allInvoices: months.flatMap(m => m.invoices),
      allAccounts: months.flatMap(m => m.accountItems),
      allLeads: months.flatMap(m => m.leadItems),
      allProspects: months.flatMap(m => m.prospectItems),
    };
  }, [data, selectedMonths]);

  const toggleMonth = (m: string) => {
    setSelectedMonths(prev => { const next = new Set(prev); if (next.has(m)) next.delete(m); else next.add(m); return next; });
    setDrillMonth(null);
  };

  const fmt = (v: number) => `$${v.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const monthRevenue = (m: MonthReport) => Object.values(m.byCurrency || {}).reduce((s, c) => s + c.revenue, 0);
  const sym = (c: string) => c === 'EUR' ? '\u20AC' : c === 'GBP' ? '\u00A3' : c === 'INR' ? '\u20B9' : c === 'NZD' ? 'NZ$' : c === 'USD' ? 'US$' : '$';
  const fmtC = (v: number, c: string) => {
    const s = c === 'EUR' ? '\u20AC' : c === 'GBP' ? '\u00A3' : c === 'INR' ? '\u20B9' : c === 'NZD' ? 'NZ$' : '$';
    return `${s}${v.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };
  const fmtDate = (d: string) => { if (!d) return '\u2014'; const dt = new Date(d); return `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}/${dt.getFullYear()}`; };

  // Export
  const exportCsv = useCallback((filename: string, headers: string[], rows: string[][]) => {
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }, []);

  const exportAccounts = () => {
    if (!aggregated) return;
    exportCsv('accounts-report.csv', ['Name', 'Reseller', 'Country', 'Created'],
      aggregated.allAccounts.map(a => [a.name, a.reseller, a.country, fmtDate(a.date)]));
  };
  const exportLeads = () => {
    if (!aggregated) return;
    const rows = [
      ...aggregated.allLeads.map(l => [l.name, 'Lead', l.reseller, l.country, fmtDate(l.date)]),
      ...aggregated.allProspects.map(p => [p.name, 'Prospect', p.reseller, p.country, fmtDate(p.date)]),
    ];
    exportCsv('leads-report.csv', ['Name', 'Type', 'Reseller', 'Country', 'Created'], rows);
  };
  const exportRevenue = () => {
    if (!aggregated) return;
    exportCsv('revenue-report.csv',
      ['Invoice #', 'Account', 'Reseller', 'Date', 'Type', 'Revenue', 'CSA Profit', 'Distributor Owed', 'Reseller Owed', 'Status'],
      aggregated.allInvoices.map(i => [i.ref, i.account, i.reseller, fmtDate(i.date),
        i.isResellerDirect ? 'Reseller Direct' : 'Customer Direct',
        String(i.revenue), String(i.csaProfit), String(i.distributorOwed), String(i.resellerOwed),
        i.paymentStatus?.toLowerCase() === 'paid' ? 'Paid' : i.status]));
  };
  const exportOverview = () => {
    if (!data) return;
    exportCsv('overview-report.csv',
      ['Month', 'Accounts', 'Leads', 'Prospects', 'Invoices', 'Revenue (by currency)', 'CSA Profit', 'Distributor Owed', 'Reseller Owed'],
      data.months.map(m => {
        const rev = Object.entries(m.byCurrency).map(([c,v]) => `${c}: ${v.revenue.toFixed(2)}`).join('; ') || '0';
        const profit = Object.entries(m.byCurrency).map(([c,v]) => `${c}: ${v.csaProfit.toFixed(2)}`).join('; ') || '0';
        const distro = Object.entries(m.byCurrency).map(([c,v]) => `${c}: ${v.distributorOwed.toFixed(2)}`).join('; ') || '0';
        const reseller = Object.entries(m.byCurrency).map(([c,v]) => `${c}: ${v.resellerOwed.toFixed(2)}`).join('; ') || '0';
        return [m.label, String(m.accounts), String(m.leads), String(m.prospects), String(m.invoiceCount), rev, profit, distro, reseller];
      }));
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full gap-3"><Loader2 size={24} className="text-csa-accent animate-spin" /><span className="text-sm text-text-muted">Generating reports...</span></div>;
  }
  if (!data || !aggregated) {
    return <div className="flex items-center justify-center h-full"><p className="text-sm text-text-muted">No report data available</p></div>;
  }

  const prev = data.months[1]; const curr = data.months[0];
  const chartMonths = [...data.months].reverse();

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2"><BarChart3 size={24} className="text-csa-accent" /> Reports Dashboard</h1>
          <div className="flex items-center gap-2">
            {isAdminUser && (
              <>
                <select value={selectedRegion} onChange={e => setSelectedRegion(e.target.value)} className="bg-surface border-2 border-border-subtle px-3 py-2 text-xs text-text-primary rounded-xl appearance-none cursor-pointer pr-8">
                  <option value="">All Regions</option>
                  {Object.entries(REGION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <select value={selectedReseller} onChange={e => setSelectedReseller(e.target.value)} className="bg-surface border-2 border-border-subtle px-3 py-2 text-xs text-text-primary rounded-xl appearance-none cursor-pointer pr-8 max-w-[200px]">
                  <option value="">All Partners</option>
                  {resellers.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </>
            )}
            <button onClick={() => {
              if (tab === 'accounts') exportAccounts();
              else if (tab === 'leads') exportLeads();
              else if (tab === 'revenue') exportRevenue();
              else exportOverview();
            }} className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-success bg-success/10 border border-success/30 rounded-xl hover:bg-success/20 transition-colors cursor-pointer">
              <Download size={13} /> Export
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-6 bg-surface rounded-xl p-1 w-fit">
          {(['overview', 'accounts', 'leads', 'revenue'] as Tab[]).map(t => (
            <button key={t} onClick={() => { setTab(t); setDrillMonth(null); }}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer capitalize ${tab === t ? 'bg-csa-accent/15 text-csa-accent' : 'text-text-muted hover:text-text-primary'}`}>
              {t}
            </button>
          ))}
        </div>

        {/* Month picker */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Months</span>
            {selectedMonths.size > 0 && <button onClick={() => setSelectedMonths(new Set())} className="text-[10px] text-csa-accent cursor-pointer">Clear</button>}
            <div className="flex-1" />
            <button onClick={() => setMonthCount(c => c + 12)} className="text-[10px] text-text-muted hover:text-text-primary cursor-pointer">Load More</button>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {data.months.map(m => (
              <button key={m.month} onClick={() => toggleMonth(m.month)}
                className={`px-3 py-1.5 text-[10px] font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap flex-shrink-0 ${
                  selectedMonths.has(m.month) ? 'bg-csa-accent/20 text-csa-accent border border-csa-accent/40'
                  : m.month === curr?.month ? 'bg-surface-raised text-text-primary border border-border-subtle'
                  : 'bg-surface text-text-muted border border-border-subtle hover:text-text-secondary'
                }`}>{m.label}</button>
            ))}
          </div>
        </div>

        {/* OVERVIEW */}
        {tab === 'overview' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <SummaryCard label="New Accounts" value={aggregated.accounts} icon={Building2} color="text-csa-accent" prev={prev?.accounts} curr={curr?.accounts} />
              <SummaryCard label="New Leads" value={aggregated.leads + aggregated.prospects} icon={UserSearch} color="text-success" prev={(prev?.leads||0)+(prev?.prospects||0)} curr={(curr?.leads||0)+(curr?.prospects||0)} />
              <SummaryCard label="Approved Invoices" value={aggregated.invoiceCount} icon={FileText} color="text-csa-purple" prev={prev?.invoiceCount} curr={curr?.invoiceCount} />
              <div className="bg-surface border border-border-subtle rounded-xl px-4 py-3">
                <div className="flex items-center justify-between mb-1"><span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Revenue</span><DollarSign size={14} className="text-warning" /></div>
                {Object.keys(aggregated.byCurrency).length > 0 ? (
                  <div className="space-y-0.5">
                    {Object.entries(aggregated.byCurrency).sort(([a],[b]) => a.localeCompare(b)).map(([cur, vals]) => (
                      <p key={cur} className="text-sm font-bold text-text-primary">{sym(cur)}{vals.revenue.toLocaleString('en-AU', {minimumFractionDigits: 2})} <span className="text-[9px] font-normal text-text-muted">{cur}</span></p>
                    ))}
                  </div>
                ) : <p className="text-xl font-bold text-text-primary">$0.00</p>}
              </div>
            </div>

            {isAdminUser && Object.keys(aggregated.byCurrency).length > 0 && (
              <div className="bg-surface border border-border-subtle rounded-xl p-4 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">CSA Profit</p>
                    {Object.entries(aggregated.byCurrency).sort(([a],[b]) => a.localeCompare(b)).map(([cur, vals]) => (
                      <p key={cur} className="text-sm font-bold text-success">{sym(cur)}{vals.csaProfit.toLocaleString('en-AU', {minimumFractionDigits: 2})} <span className="text-[9px] font-normal text-text-muted">{cur}</span></p>
                    ))}
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">Distributor Owed</p>
                    {Object.entries(aggregated.byCurrency).sort(([a],[b]) => a.localeCompare(b)).map(([cur, vals]) => (
                      vals.distributorOwed > 0 ? <p key={cur} className="text-sm font-bold text-warning">{sym(cur)}{vals.distributorOwed.toLocaleString('en-AU', {minimumFractionDigits: 2})} <span className="text-[9px] font-normal text-text-muted">{cur}</span></p> : null
                    ))}
                    {Object.values(aggregated.byCurrency).every(v => v.distributorOwed === 0) && <p className="text-sm text-text-muted">$0.00</p>}
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-2">Reseller Owed</p>
                    {Object.entries(aggregated.byCurrency).sort(([a],[b]) => a.localeCompare(b)).map(([cur, vals]) => (
                      vals.resellerOwed > 0 ? <p key={cur} className="text-sm font-bold text-csa-purple">{sym(cur)}{vals.resellerOwed.toLocaleString('en-AU', {minimumFractionDigits: 2})} <span className="text-[9px] font-normal text-text-muted">{cur}</span></p> : null
                    ))}
                    {Object.values(aggregated.byCurrency).every(v => v.resellerOwed === 0) && <p className="text-sm text-text-muted">$0.00</p>}
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-4 mb-6">
              <BarChart title="Revenue (all currencies combined)" months={chartMonths} getValue={monthRevenue} color="bg-csa-accent" format={fmt} />
              <BarChart title="New Accounts" months={chartMonths} getValue={m => m.accounts} color="bg-success" />
              <BarChart title="New Leads & Prospects" months={chartMonths} getValue={m => m.leads + m.prospects} color="bg-csa-purple" />
            </div>
          </motion.div>
        )}

        {/* ACCOUNTS */}
        {tab === 'accounts' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <SummaryCard label="Total New Accounts" value={aggregated.accounts} icon={Building2} color="text-csa-accent" />
            </div>
            <BarChart title="Accounts per Month" months={chartMonths} getValue={m => m.accounts} color="bg-csa-accent" />
            <div className="mt-6">
              <DrillTable months={aggregated.months} field="accounts" drillMonth={drillMonth} onDrill={setDrillMonth}
                columns={['Name', 'Reseller', 'Country', 'Created']}
                renderRows={m => m.accountItems.map(a => (
                  <tr key={a.id} onClick={() => { setSelectedAccountId(a.id); setCurrentView('account-detail'); }} className="cursor-pointer hover:bg-csa-accent/5 transition-colors">
                    <td className="font-semibold text-text-primary">{a.name}</td><td className="text-text-secondary text-sm">{a.reseller||'\u2014'}</td>
                    <td className="text-text-secondary text-sm">{a.country||'\u2014'}</td><td className="text-text-muted text-xs">{fmtDate(a.date)}</td>
                  </tr>
                ))} />
            </div>
          </motion.div>
        )}

        {/* LEADS */}
        {tab === 'leads' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <SummaryCard label="Leads" value={aggregated.leads} icon={UserSearch} color="text-csa-accent" />
              <SummaryCard label="Prospects" value={aggregated.prospects} icon={Building2} color="text-csa-purple" />
            </div>
            <BarChart title="Leads & Prospects per Month" months={chartMonths} getValue={m => m.leads + m.prospects} color="bg-csa-purple" />
            <div className="mt-6">
              <DrillTable months={aggregated.months} field="leads" secondField="prospects" drillMonth={drillMonth} onDrill={setDrillMonth}
                columns={['Name', 'Type', 'Reseller', 'Country', 'Created']}
                renderRows={m => [
                  ...m.leadItems.map(l => (
                    <tr key={`l-${l.id}`} onClick={() => { setSelectedLeadId(l.id); setSelectedLeadSource('lead'); setCurrentView('lead-detail'); }} className="cursor-pointer hover:bg-csa-accent/5 transition-colors">
                      <td className="font-semibold text-text-primary">{l.name}</td>
                      <td><span className="px-1.5 py-0.5 text-[9px] font-bold uppercase rounded bg-csa-accent/15 text-csa-accent">Lead</span></td>
                      <td className="text-text-secondary text-sm">{l.reseller||'\u2014'}</td><td className="text-text-secondary text-sm">{l.country||'\u2014'}</td>
                      <td className="text-text-muted text-xs">{fmtDate(l.date)}</td>
                    </tr>
                  )),
                  ...m.prospectItems.map(p => (
                    <tr key={`p-${p.id}`} onClick={() => { setSelectedLeadId(p.id); setSelectedLeadSource('prospect'); setCurrentView('lead-detail'); }} className="cursor-pointer hover:bg-csa-accent/5 transition-colors">
                      <td className="font-semibold text-text-primary">{p.name}</td>
                      <td><span className="px-1.5 py-0.5 text-[9px] font-bold uppercase rounded bg-csa-purple/15 text-csa-purple">Prospect</span></td>
                      <td className="text-text-secondary text-sm">{p.reseller||'\u2014'}</td><td className="text-text-secondary text-sm">{p.country||'\u2014'}</td>
                      <td className="text-text-muted text-xs">{fmtDate(p.date)}</td>
                    </tr>
                  )),
                ]} />
            </div>
          </motion.div>
        )}

        {/* REVENUE */}
        {tab === 'revenue' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <SummaryCard label="Approved Invoices" value={aggregated.invoiceCount} icon={FileText} color="text-csa-accent" />
              <div className="bg-surface border border-border-subtle rounded-xl px-4 py-3">
                <div className="flex items-center justify-between mb-1"><span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Revenue</span><DollarSign size={14} className="text-text-primary" /></div>
                {Object.entries(aggregated.byCurrency).sort(([a],[b]) => a.localeCompare(b)).map(([cur, vals]) => (
                  <p key={cur} className="text-sm font-bold text-text-primary">{sym(cur)}{vals.revenue.toLocaleString('en-AU', {minimumFractionDigits: 2})} <span className="text-[9px] font-normal text-text-muted">{cur}</span></p>
                ))}
                {Object.keys(aggregated.byCurrency).length === 0 && <p className="text-xl font-bold text-text-primary">$0.00</p>}
              </div>
              {isAdminUser && (
                <div className="bg-surface border border-border-subtle rounded-xl px-4 py-3">
                  <div className="flex items-center justify-between mb-1"><span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">CSA Profit</span><DollarSign size={14} className="text-success" /></div>
                  {Object.entries(aggregated.byCurrency).sort(([a],[b]) => a.localeCompare(b)).map(([cur, vals]) => (
                    <p key={cur} className="text-sm font-bold text-success">{sym(cur)}{vals.csaProfit.toLocaleString('en-AU', {minimumFractionDigits: 2})} <span className="text-[9px] font-normal text-text-muted">{cur}</span></p>
                  ))}
                  {Object.keys(aggregated.byCurrency).length === 0 && <p className="text-xl font-bold text-success">$0.00</p>}
                </div>
              )}
              <div className="bg-surface border border-border-subtle rounded-xl px-4 py-3">
                <div className="flex items-center justify-between mb-1"><span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">{isDistributor && !isAdminUser ? 'Your Earnings' : 'Partner Owed'}</span><DollarSign size={14} className="text-csa-purple" /></div>
                {Object.entries(aggregated.byCurrency).sort(([a],[b]) => a.localeCompare(b)).map(([cur, vals]) => {
                  const owed = isDistributor && !isAdminUser ? vals.distributorOwed : vals.distributorOwed + vals.resellerOwed;
                  return owed > 0 ? <p key={cur} className="text-sm font-bold text-csa-purple">{sym(cur)}{owed.toLocaleString('en-AU', {minimumFractionDigits: 2})} <span className="text-[9px] font-normal text-text-muted">{cur}</span></p> : null;
                })}
                {Object.values(aggregated.byCurrency).every(v => v.distributorOwed + v.resellerOwed === 0) && <p className="text-xl font-bold text-csa-purple">$0.00</p>}
              </div>
            </div>
            <BarChart title="Revenue per Month (all currencies)" months={chartMonths} getValue={monthRevenue} color="bg-csa-accent" format={fmt} />
            <div className="mt-6">
              <DrillTable months={aggregated.months} field="invoiceCount" getDisplayValue={m => Object.entries(m.byCurrency).map(([c,v]) => `${sym(c)}${v.revenue.toLocaleString('en-AU',{minimumFractionDigits:2})}`).join(' / ') || '$0.00'} drillMonth={drillMonth} onDrill={setDrillMonth}
                columns={['Invoice', 'Account', 'Reseller', 'Date', 'Type', 'Revenue', ...(isAdminUser ? ['CSA Profit', 'Distro Owed', 'Reseller Owed'] : isDistributor ? ['Your Earnings'] : ['Your Commission']), 'Status']}
                renderRows={m => m.invoices.map(inv => (
                  <tr key={inv.id} onClick={() => { setSelectedInvoiceId(inv.id); setInvoiceReturnView('draft-invoices'); setCurrentView('invoice-detail'); }} className="cursor-pointer hover:bg-csa-accent/5 transition-colors">
                    <td className="text-text-muted text-xs font-mono">{inv.ref||'\u2014'}</td>
                    <td className="text-text-secondary text-sm">{inv.account||'\u2014'}</td>
                    <td className="text-text-secondary text-sm">{inv.reseller||'\u2014'}</td>
                    <td className="text-text-muted text-xs">{fmtDate(inv.date)}</td>
                    <td><span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase rounded ${inv.isResellerDirect ? 'bg-csa-accent/15 text-csa-accent' : 'bg-csa-purple/15 text-csa-purple'}`}>{inv.isResellerDirect ? 'Reseller' : 'Customer'}</span></td>
                    <td className="text-text-primary font-semibold text-sm">{fmtC(inv.revenue, inv.currency)}</td>
                    {isAdminUser && <><td className="text-success text-sm font-semibold">{fmtC(inv.csaProfit, inv.currency)}</td><td className="text-warning text-sm">{fmtC(inv.distributorOwed, inv.currency)}</td><td className="text-csa-purple text-sm">{fmtC(inv.resellerOwed, inv.currency)}</td></>}
                    {isDistributor && !isAdminUser && <td className="text-warning text-sm font-semibold">{fmtC(inv.distributorOwed, inv.currency)}</td>}
                    {!isDistributor && !isAdminUser && <td className="text-csa-purple text-sm font-semibold">{fmtC(inv.resellerOwed, inv.currency)}</td>}
                    <td><span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase rounded ${inv.paymentStatus?.toLowerCase() === 'paid' ? 'bg-success/15 text-success' : inv.status === 'Approved' || inv.status === 'Sent' ? 'bg-csa-accent/15 text-csa-accent' : 'bg-warning/15 text-warning'}`}>{inv.paymentStatus?.toLowerCase() === 'paid' ? 'Paid' : inv.status}</span></td>
                  </tr>
                ))} />
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, color, prev, curr, isText }: {
  label: string; value: number | string; icon: typeof Building2; color: string; prev?: number; curr?: number; isText?: boolean;
}) {
  const growth = prev != null && curr != null && prev > 0 ? Math.round(((curr - prev) / prev) * 100) : null;
  return (
    <div className="bg-surface border border-border-subtle rounded-xl px-4 py-3">
      <div className="flex items-center justify-between mb-1"><span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">{label}</span><Icon size={14} className={color} /></div>
      <p className="text-xl font-bold text-text-primary">{isText ? value : (value as number).toLocaleString()}</p>
      {growth !== null && (
        <div className={`flex items-center gap-1 mt-1 text-[10px] font-semibold ${growth >= 0 ? 'text-success' : 'text-error'}`}>
          {growth >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />} {growth >= 0 ? '+' : ''}{growth}% vs prev month
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-surface border border-border-subtle rounded-xl px-4 py-3">
      <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}

function BarChart({ title, months, getValue, color, format }: {
  title: string; months: MonthReport[]; getValue: (m: MonthReport) => number;
  color: string; format?: (v: number) => string;
}) {
  const max = Math.max(...months.map(getValue), 1);
  const f = format || ((v: number) => String(v));
  const barHeight = 200;
  return (
    <div className="bg-surface border border-border-subtle rounded-xl p-5">
      <h3 className="text-sm font-bold text-text-primary mb-4">{title}</h3>
      <div className="flex items-end gap-1" style={{ height: `${barHeight}px` }}>
        {months.map(m => {
          const val = getValue(m);
          const pct = max > 0 ? (val / max) * 100 : 0;
          const h = Math.max(Math.round(barHeight * pct / 100), val > 0 ? 4 : 1);
          return (
            <div key={m.month} className="flex-1 flex flex-col items-center min-w-0 group relative" style={{ height: `${barHeight}px` }}>
              <div className="flex-1" />
              <div className={`w-full ${color} rounded-t transition-all group-hover:brightness-125`} style={{ height: `${h}px` }} />
              <div className="absolute bottom-[-20px] left-1/2 -translate-x-1/2 z-10">
                <span className="text-[8px] text-text-muted whitespace-nowrap">{m.label.slice(0, 3)}</span>
              </div>
              <div className="absolute top-0 left-1/2 -translate-x-1/2 z-10 bg-csa-dark border border-border rounded-lg px-2.5 py-1.5 text-[10px] text-text-secondary whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity shadow-lg">
                <span className="font-semibold text-text-primary">{m.label}</span><br />{f(val)}
              </div>
            </div>
          );
        })}
      </div>
      <div className="h-5" />
    </div>
  );
}

function DrillTable({ months, field, secondField, isCurrency, getDisplayValue, drillMonth, onDrill, columns, renderRows }: {
  months: MonthReport[]; field: string; secondField?: string; isCurrency?: boolean;
  getDisplayValue?: (m: MonthReport) => string;
  drillMonth: string | null; onDrill: (m: string | null) => void;
  columns: string[]; renderRows: (m: MonthReport) => React.ReactNode[];
}) {
  return (
    <div className="space-y-2">
      {months.map(m => {
        const val = (m as unknown as Record<string, number>)[field] || 0;
        const val2 = secondField ? (m as unknown as Record<string, number>)[secondField] || 0 : 0;
        const isDrilling = drillMonth === m.month;
        const display = getDisplayValue ? getDisplayValue(m) : (isCurrency ? `$${val.toLocaleString('en-AU', { minimumFractionDigits: 2 })}` : `${val}${val2 > 0 ? ` + ${val2}` : ''}`);
        return (
          <div key={m.month} className="border border-border-subtle rounded-xl overflow-hidden">
            <button onClick={() => onDrill(isDrilling ? null : m.month)} className="w-full flex items-center justify-between px-4 py-3 bg-surface hover:bg-surface-raised transition-colors cursor-pointer">
              <span className="text-sm font-semibold text-text-primary">{m.label}</span>
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-csa-accent">
                  {display}
                </span>
                <ChevronDown size={14} className={`text-text-muted transition-transform ${isDrilling ? 'rotate-180' : ''}`} />
              </div>
            </button>
            {isDrilling && (
              <div className="border-t border-border-subtle">
                <table className="w-full"><thead><tr className="bg-surface-raised">{columns.map(c => <th key={c}>{c}</th>)}</tr></thead>
                  <tbody>{renderRows(m)}{renderRows(m).length === 0 && <tr><td colSpan={columns.length} className="text-xs text-text-muted text-center py-4">No records</td></tr>}</tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
