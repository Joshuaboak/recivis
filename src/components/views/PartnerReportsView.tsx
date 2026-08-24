/**
 * PartnerReportsView — Month-end reconciliation for a partner.
 *
 * Two reports, switched at the top:
 *   Statement — one month of orders and subscriptions, netted against whoever
 *               the partner settles with (their distributor, or CSA).
 *   Schedule  — the forward view: what the active subscription base costs per
 *               month and per year.
 *
 * Read-only. Everything here is derived from orders and assets that live in
 * Zoho; nothing on this page changes them.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Download, FileText, CalendarClock, ChevronDown, TrendingUp } from 'lucide-react';
import { useAppStore } from '@/lib/store';

interface OrderRow {
  id: string;
  date: string;
  reference: string;
  account: string;
  currency: string;
  total: number;
  direction: 'Reseller' | 'Customer';
  owedToPartner: number;
  owedByPartner: number;
}

interface SubscriptionRow {
  id: string;
  account: string;
  product: string;
  quantity: number;
  perpetualPlan: boolean;
  renewalDate: string | null;
  monthlyCost: number;
  monthlyList: number;
}

interface ChildStatement {
  resellerId: string;
  resellerName: string;
  orderCount: number;
  currency: string;
  owedToYou: number;
  youOweThem: number;
  subscriptionCount: number;
  subscriptionCost: number;
}

interface StatementData {
  report: 'statement';
  partner: string;
  counterparty: string;
  isDistributor: boolean;
  month: string;
  monthLabel: string;
  orders: OrderRow[];
  subscriptions: SubscriptionRow[];
  subscriptionCost: number;
  subscriptionCurrency: string;
  orderTotals: Record<string, { owedToYou: number; youOwe: number }>;
  childStatements: ChildStatement[];
}

interface ScheduleData {
  report: 'schedule';
  partner: string;
  counterparty: string;
  subscriptions: SubscriptionRow[];
  monthlyCost: number;
  monthlyList: number;
  annualisedCost: number;
  currency: string;
  childRows: Array<{ resellerId: string; resellerName: string; subscriptions: SubscriptionRow[]; monthlyCost: number }>;
}

/** The last 13 months, newest first — a year of history plus the current month. */
function recentMonths(): Array<{ value: string; label: string }> {
  const out: Array<{ value: string; label: string }> = [];
  const now = new Date();
  for (let i = 0; i < 13; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push({
      value: d.toISOString().slice(0, 7),
      label: d.toLocaleDateString('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
    });
  }
  return out;
}

function money(amount: number, currency: string): string {
  return `${amount.toFixed(2)} ${currency}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
}

/** Flatten whichever report is on screen into CSV for the partner's records. */
function exportCsv(rows: string[][], filename: string) {
  const csv = rows
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function PartnerReportsView() {
  const { user } = useAppStore();
  const months = recentMonths();

  const [report, setReport] = useState<'statement' | 'schedule'>('statement');
  const [month, setMonth] = useState(months[0].value);
  const [statement, setStatement] = useState<StatementData | null>(null);
  const [schedule, setSchedule] = useState<ScheduleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    const url = report === 'statement'
      ? `/api/partner-reports?report=statement&month=${month}`
      : '/api/partner-reports?report=schedule';

    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (data.error) { setError(data.error); return; }
        if (data.report === 'statement') setStatement(data);
        else setSchedule(data);
      })
      .catch(() => setError('Failed to load report'))
      .finally(() => setLoading(false));
  }, [report, month]);

  useEffect(() => { load(); }, [load]);

  const active = report === 'statement' ? statement : schedule;

  const handleExport = () => {
    if (report === 'statement' && statement) {
      const rows: string[][] = [
        ['Statement', statement.partner, statement.monthLabel, `Settled with ${statement.counterparty}`],
        [],
        ['Orders'],
        ['Date', 'Reference', 'Account', 'Sent to', 'Currency', 'Order total', 'Owed to you', 'You owe'],
        ...statement.orders.map(o => [
          o.date, o.reference, o.account, o.direction, o.currency,
          o.total.toFixed(2), o.owedToPartner.toFixed(2), o.owedByPartner.toFixed(2),
        ]),
        [],
        ['Monthly subscriptions'],
        ['Account', 'Product', 'Qty', 'Plan', 'Renewal', 'Monthly cost (USD)'],
        ...statement.subscriptions.map(s => [
          s.account, s.product, String(s.quantity),
          s.perpetualPlan ? 'Perpetual plan' : 'Standard',
          s.renewalDate || '', (s.monthlyCost * s.quantity).toFixed(2),
        ]),
      ];
      exportCsv(rows, `statement-${statement.month}.csv`);
    } else if (schedule) {
      const rows: string[][] = [
        ['Subscription billing schedule', schedule.partner],
        [],
        ['Account', 'Product', 'Qty', 'Plan', 'Next renewal', 'Monthly cost (USD)'],
        ...schedule.subscriptions.map(s => [
          s.account, s.product, String(s.quantity),
          s.perpetualPlan ? 'Perpetual plan' : 'Standard',
          s.renewalDate || '', (s.monthlyCost * s.quantity).toFixed(2),
        ]),
      ];
      exportCsv(rows, 'subscription-schedule.csv');
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <FileText size={22} className="text-csa-accent" />
            Partner Reports
          </h1>
          {active && (
            <p className="text-sm text-text-muted mt-1">
              {active.partner} &bull; settled with <span className="text-text-secondary font-semibold">{active.counterparty}</span>
            </p>
          )}
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div data-tour="partner-report-tabs" className="flex gap-1 p-1 bg-surface border border-border-subtle rounded-xl">
            {([
              { key: 'statement', label: 'Monthly Statement' },
              { key: 'schedule', label: 'Billing Schedule' },
            ] as const).map(tab => (
              <button
                key={tab.key}
                onClick={() => setReport(tab.key)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  report === tab.key ? 'bg-csa-accent/15 text-csa-accent' : 'text-text-muted hover:text-text-secondary'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {report === 'statement' && (
            <div className="relative">
              <select
                value={month}
                onChange={e => setMonth(e.target.value)}
                className="bg-surface border-2 border-border-subtle pl-3 pr-8 py-2 text-sm text-text-primary outline-none focus:border-csa-accent rounded-xl appearance-none cursor-pointer"
              >
                {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            </div>
          )}

          {user?.permissions?.canExportData && active && (
            <button
              onClick={handleExport}
              data-tour="partner-report-export"
              className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-text-muted bg-surface border-2 border-border-subtle rounded-xl hover:border-csa-accent/30 hover:text-csa-accent transition-colors cursor-pointer"
            >
              <Download size={14} /> Export CSV
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-text-muted py-12 justify-center">
            <Loader2 size={16} className="animate-spin" /> Building report...
          </div>
        ) : error ? (
          <p className="text-sm text-error py-12 text-center">{error}</p>
        ) : report === 'statement' && statement ? (
          <Statement data={statement} />
        ) : report === 'schedule' && schedule ? (
          <Schedule data={schedule} />
        ) : null}
      </div>
    </div>
  );
}

function Statement({ data }: { data: StatementData }) {
  const currencies = Object.keys(data.orderTotals);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      {/* Net position */}
      <div>
        <h2 className="text-sm font-bold text-text-primary mb-3">{data.monthLabel} — net position</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {currencies.length === 0 && data.subscriptionCost === 0 ? (
            <p className="text-sm text-text-muted">No approved orders or active subscriptions this month.</p>
          ) : null}
          {currencies.map(currency => {
            const totals = data.orderTotals[currency];
            const net = totals.owedToYou - totals.youOwe;
            return (
              <div key={currency} className="bg-surface border border-border-subtle rounded-xl px-4 py-3">
                <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">Orders &bull; {currency}</p>
                <Line label="Owed to you" value={money(totals.owedToYou, currency)} tone="success" />
                <Line label={`You owe ${data.counterparty}`} value={money(totals.youOwe, currency)} tone="warning" />
                <div className="mt-2 pt-2 border-t border-border-subtle">
                  <Line label="Net" value={money(net, currency)} tone={net >= 0 ? 'success' : 'warning'} bold />
                </div>
              </div>
            );
          })}
          {data.subscriptions.length > 0 && (
            <div className="bg-surface border border-border-subtle rounded-xl px-4 py-3">
              <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-2">
                Monthly subscriptions &bull; {data.subscriptionCurrency}
              </p>
              <Line label={`${data.subscriptions.length} active`} value="" />
              <Line
                label={`You owe ${data.counterparty}`}
                value={money(data.subscriptionCost, data.subscriptionCurrency)}
                tone="warning"
                bold
              />
              <p className="text-[10px] text-text-muted mt-2">
                Billed monthly, separately from orders.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Orders */}
      <Section title={`Orders (${data.orders.length})`}>
        {data.orders.length === 0 ? (
          <p className="text-sm text-text-muted py-3">No approved orders this month.</p>
        ) : (
          <Table
            head={['Date', 'Reference', 'Account', 'Sent to', 'Order total', 'Owed to you', 'You owe']}
            rows={data.orders.map(o => [
              formatDate(o.date),
              o.reference || '—',
              o.account || '—',
              o.direction,
              money(o.total, o.currency),
              o.owedToPartner ? money(o.owedToPartner, o.currency) : '—',
              o.owedByPartner ? money(o.owedByPartner, o.currency) : '—',
            ])}
          />
        )}
      </Section>

      {/* Subscriptions */}
      <Section title={`Monthly subscriptions (${data.subscriptions.length})`}>
        {data.subscriptions.length === 0 ? (
          <p className="text-sm text-text-muted py-3">No active monthly subscriptions.</p>
        ) : (
          <Table
            head={['Account', 'Product', 'Qty', 'Plan', 'Renewal', 'Monthly cost']}
            rows={data.subscriptions.map(s => [
              s.account || '—',
              s.product,
              String(s.quantity),
              s.perpetualPlan ? 'Perpetual plan' : 'Standard',
              formatDate(s.renewalDate),
              s.monthlyCost > 0
                ? money(s.monthlyCost * s.quantity, data.subscriptionCurrency)
                : 'Not priced',
            ])}
          />
        )}
      </Section>

      {/* Child resellers — distributors only */}
      {data.childStatements.length > 0 && (
        <Section title={`Your resellers (${data.childStatements.length})`}>
          <Table
            head={['Reseller', 'Orders', 'Subscriptions', 'Owed to you', 'You owe them']}
            rows={data.childStatements.map(c => [
              c.resellerName,
              String(c.orderCount),
              String(c.subscriptionCount),
              money(c.owedToYou, c.currency),
              money(c.youOweThem, c.currency),
            ])}
          />
        </Section>
      )}
    </motion.div>
  );
}

function Schedule({ data }: { data: ScheduleData }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat label="Active subscriptions" value={String(data.subscriptions.length)} />
        <Stat label="Monthly cost" value={money(data.monthlyCost, data.currency)} />
        <Stat label="Annualised" value={money(data.annualisedCost, data.currency)} icon />
      </div>

      <Section title="Your subscriptions">
        {data.subscriptions.length === 0 ? (
          <p className="text-sm text-text-muted py-3">No active monthly subscriptions.</p>
        ) : (
          <Table
            head={['Account', 'Product', 'Qty', 'Plan', 'Next renewal', 'Monthly cost', 'Recommended sell']}
            rows={data.subscriptions.map(s => [
              s.account || '—',
              s.product,
              String(s.quantity),
              s.perpetualPlan ? 'Perpetual plan' : 'Standard',
              formatDate(s.renewalDate),
              money(s.monthlyCost * s.quantity, data.currency),
              money(s.monthlyList * s.quantity, data.currency),
            ])}
          />
        )}
      </Section>

      {data.childRows.length > 0 && (
        <Section title="Your resellers' subscriptions">
          <Table
            head={['Reseller', 'Subscriptions', 'Monthly cost to them']}
            rows={data.childRows.map(c => [
              c.resellerName,
              String(c.subscriptions.length),
              money(c.monthlyCost, data.currency),
            ])}
          />
        </Section>
      )}
    </motion.div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-sm font-bold text-text-primary mb-3">{title}</h2>
      {children}
    </div>
  );
}

function Line({ label, value, tone, bold }: { label: string; value: string; tone?: 'success' | 'warning'; bold?: boolean }) {
  const toneClass = tone === 'success' ? 'text-success' : tone === 'warning' ? 'text-warning' : 'text-text-secondary';
  return (
    <div className="flex items-center justify-between gap-3 text-xs py-0.5">
      <span className="text-text-muted">{label}</span>
      <span className={`${toneClass} ${bold ? 'font-bold' : 'font-semibold'}`}>{value}</span>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon?: boolean }) {
  return (
    <div className="bg-surface border border-border-subtle rounded-xl px-4 py-3">
      <p className="text-[10px] font-bold text-text-muted uppercase tracking-wider mb-1 flex items-center gap-1.5">
        {icon ? <TrendingUp size={11} /> : <CalendarClock size={11} />}
        {label}
      </p>
      <p className="text-lg font-bold text-text-primary">{value}</p>
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="border border-border-subtle rounded-xl overflow-x-auto">
      <table className="w-full min-w-[720px]">
        <thead>
          <tr className="bg-surface-raised text-left">
            {head.map(h => (
              <th key={h} className="px-4 py-2 text-[10px] font-bold text-text-muted uppercase tracking-wider">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-border-subtle hover:bg-csa-accent/5 transition-colors">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-2.5 text-sm text-text-secondary">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
