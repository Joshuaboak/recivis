'use client';

/**
 * StylePreview — specimen sheet for the CSA design system as applied to the portal.
 *
 * Rendered only by /style-preview, which 404s in production. Uses the same tokens and
 * the same class vocabulary as the real screens, so what you see here is what the app
 * renders — not a mock-up drawn alongside it.
 */

import { useState } from 'react';
import {
  Building2, Users, FileText, Ticket, Search, Bell, ChevronRight, Check, X,
  AlertTriangle, Loader2, Plus, Download, Pencil,
} from 'lucide-react';
import ThemeToggle from './ThemeToggle';

const BRAND = [
  { name: 'Primary', hex: '#0077B7', token: '--csa-blue', use: 'Buttons, links, rules, icon tiles' },
  { name: 'Dark logo blue', hex: '#0A4C6E', token: '--csa-blue-dark', use: 'Headings, primary hover' },
  { name: 'Light logo blue', hex: '#B1E0F1', token: '--csa-blue-light', use: 'Highlights, focus ring, copy on dark' },
  { name: 'Deep navy', hex: '#042637', token: '--csa-navy', use: 'Darkest bands' },
];

const GREYS = [
  { hex: '#CECECF', token: '--csa-grey-100' },
  { hex: '#878888', token: '--csa-grey-300' },
  { hex: '#474848', token: '--csa-grey-600' },
  { hex: '#333333', token: '--csa-grey-900' },
];

const SEMANTIC = [
  ['surface-page', 'Page background'],
  ['surface-card', 'Cards, header, inputs'],
  ['surface-raised', 'Raised panels, hover'],
  ['border-default', 'Card and field borders'],
  ['border-subtle', 'Table rules, dividers'],
  ['text-primary', 'Body copy'],
  ['text-secondary', 'Supporting copy'],
  ['text-muted', 'Labels, eyebrows'],
];

const TYPE = [
  ['H1', 'text-4xl', '36px'], ['H2', 'text-[28px]', '28px'], ['H3', 'text-2xl', '24px'],
  ['H4', 'text-[21px]', '21px'], ['H5', 'text-lg', '18px'], ['H6', 'text-base', '16px'],
];

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="mb-14">
      <div className="mb-5">
        <h2 className="text-2xl font-bold text-text-heading">{title}</h2>
        {note && <p className="mt-1 text-sm text-text-muted max-w-2xl">{note}</p>}
      </div>
      {children}
    </section>
  );
}

export default function StylePreview() {
  const [tab, setTab] = useState('details');
  const [checked, setChecked] = useState(true);
  const [on, setOn] = useState(true);

  return (
    <div className="min-h-screen bg-csa-deep">
      {/* Header — mirrors the real portal header */}
      <header className="h-16 border-b-4 border-border bg-csa-dark flex items-center justify-between px-6 sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-text-primary">Design System</h1>
          <span className="h-4 w-px bg-border-subtle" />
          <span className="text-xs text-text-muted">Civil Survey Applications Partner Portal</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2.5 px-4 py-2 bg-surface border border-border-subtle rounded-xl text-text-muted hover:text-text-primary hover:border-csa-accent/50 transition-colors">
            <Search size={15} />
            <span className="text-xs font-medium">Search</span>
            <kbd className="hidden sm:inline-flex px-1.5 py-0.5 text-[10px] font-mono font-semibold text-text-muted/60 bg-csa-dark border border-border-subtle rounded ml-2">Ctrl K</kbd>
          </button>
          <button className="w-9 h-9 flex items-center justify-center rounded-md text-text-muted bg-surface-raised border border-border-subtle"><Bell size={16} /></button>
          <ThemeToggle />
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-10">
        <p className="mb-12 text-sm text-text-secondary max-w-3xl">
          Flip the theme with the control in the header. Every element below uses the same
          tokens as the real screens, so both themes can be judged at once. The light theme is
          the CSA style guide; the dark theme is derived from the guide&apos;s own deep navy and
          light logo blue, since the guide itself is light-only.
        </p>

        <Section title="Brand colour" note="Three blues do nearly all the work. Status colours are not in the brand guide — they are derived and used sparingly.">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {BRAND.map(c => (
              <div key={c.token} className="bg-surface border border-border rounded-xl overflow-hidden">
                <div className="h-20" style={{ background: c.hex }} />
                <div className="p-4">
                  <p className="text-sm font-bold text-text-primary">{c.name}</p>
                  <p className="text-xs font-mono text-text-muted mt-0.5">{c.hex}</p>
                  <p className="text-xs text-text-secondary mt-2">{c.use}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            {GREYS.map(g => (
              <div key={g.token} className="flex items-center gap-3 bg-surface border border-border rounded-xl px-4 py-3">
                <span className="w-8 h-8 rounded-md border border-border-subtle" style={{ background: g.hex }} />
                <span className="text-xs font-mono text-text-muted">{g.hex}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Semantic surfaces" note="These are the tokens that flip between themes. Components reference these, never a raw hex.">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {SEMANTIC.map(([token, use]) => (
              <div key={token} className="bg-surface border border-border rounded-xl p-4">
                <p className="text-xs font-mono text-csa-accent">{token}</p>
                <p className="text-xs text-text-muted mt-1">{use}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Type" note="Encode Sans Semi Condensed throughout. Bold for every heading, regular for body, 1.2 line height on headings.">
          <div className="bg-surface border border-border rounded-xl p-6 space-y-4">
            {TYPE.map(([label, cls, px]) => (
              <div key={label} className="flex items-baseline gap-4 border-b border-border-subtle pb-3 last:border-0 last:pb-0">
                <span className="w-10 text-[10px] font-mono uppercase tracking-widest text-text-muted">{label}</span>
                <span className={`${cls} font-bold text-text-heading`}>Stringer Topo</span>
                <span className="ml-auto text-xs font-mono text-text-muted">{px}</span>
              </div>
            ))}
            <div className="pt-2 space-y-2">
              <p className="text-[21px] text-text-primary leading-relaxed">Body B1 — 21px. Stringer Topo streamlines the reduction and presentation of survey observations.</p>
              <p className="text-base text-text-secondary leading-relaxed">Body B3 — 16px. Developed by surveyors with over 20 years experience in the industry.</p>
              <p className="text-[10px] uppercase tracking-[0.16em] text-text-muted font-bold">Eyebrow — uppercase, 0.16em tracking</p>
            </div>
          </div>
        </Section>

        <Section title="Buttons" note="Primary darkens on hover in light, lightens in dark. Uppercase with 0.04em tracking. Radii are 3px — nothing is a pill.">
          <div className="bg-surface border border-border rounded-xl p-6 flex flex-wrap items-center gap-3">
            <button className="px-8 py-4 bg-csa-accent text-white text-xs font-bold uppercase tracking-[0.04em] rounded-md hover:bg-csa-primary transition-colors duration-[120ms]">Free trial</button>
            <button className="px-8 py-4 border-2 border-csa-accent text-csa-accent text-xs font-bold uppercase tracking-[0.04em] rounded-md hover:bg-csa-accent hover:text-white transition-colors duration-[120ms]">Ask an expert</button>
            <button className="px-4 py-2.5 bg-surface-raised border border-border-subtle text-text-muted text-xs font-semibold rounded-md hover:text-text-primary transition-colors duration-[120ms]">Cancel</button>
            <button className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-csa-accent bg-csa-accent/10 border border-csa-accent/30 rounded-md hover:bg-csa-accent/20 transition-colors duration-[120ms]"><Pencil size={13} /> Edit</button>
            <button className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-error bg-error/10 border border-error/30 rounded-md transition-colors duration-[120ms]"><X size={13} /> Delete</button>
            <button disabled className="px-8 py-4 bg-csa-accent/40 text-white/60 text-xs font-bold uppercase tracking-[0.04em] rounded-md cursor-not-allowed">Disabled</button>
            <button className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-text-muted"><Loader2 size={13} className="animate-spin" /> Saving…</button>
          </div>
        </Section>

        <Section title="Cards" note="Flat by default, 1px border, 3–4px radius. A 4px blue top rule marks emphasis. Interactive cards lift 2px and take a blue border — no scale, no glow.">
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="bg-surface border border-border rounded-xl p-6">
              <p className="text-sm font-bold text-text-primary">Flat</p>
              <p className="text-xs text-text-muted mt-1">The default.</p>
            </div>
            <div className="bg-surface border border-border rounded-xl p-6 card-accent-top">
              <p className="text-sm font-bold text-text-primary">Accent rule</p>
              <p className="text-xs text-text-muted mt-1">4px blue top rule.</p>
            </div>
            <button className="text-left bg-surface border border-border rounded-xl p-6 hover:border-csa-accent hover:-translate-y-0.5 transition-all duration-[120ms]">
              <p className="text-sm font-bold text-text-primary flex items-center justify-between">Interactive <ChevronRight size={14} className="text-csa-accent" /></p>
              <p className="text-xs text-text-muted mt-1">Lifts 2px on hover.</p>
            </button>
          </div>
        </Section>

        <Section title="Forms" note="3px radius, 1px border, 3px light-blue focus ring plus a blue border. The ring is never removed.">
          <div className="bg-surface border border-border rounded-xl p-6 grid sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted mb-2">Account name</label>
              <input defaultValue="Acme Surveying" className="w-full bg-csa-dark border border-border rounded-md px-3 py-2.5 text-sm text-text-primary focus:border-csa-accent outline-none" />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted mb-2">Region</label>
              <select className="w-full bg-csa-dark border border-border rounded-md px-3 py-2.5 text-sm text-text-primary focus:border-csa-accent outline-none">
                <option>Australia</option><option>New Zealand</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.08em] text-text-muted mb-2">With error</label>
              <input defaultValue="not-an-email" className="w-full bg-csa-dark border-2 border-error rounded-md px-3 py-2.5 text-sm text-text-primary outline-none" />
              <p className="mt-1.5 text-xs text-error flex items-center gap-1"><AlertTriangle size={11} /> Enter a valid email address.</p>
            </div>
            <div className="flex flex-col gap-3 justify-end">
              <label className="flex items-center gap-2.5 text-sm text-text-primary">
                <button onClick={() => setChecked(!checked)} className={`w-4 h-4 rounded-sm border flex items-center justify-center transition-colors duration-[120ms] ${checked ? 'bg-csa-accent border-csa-accent' : 'bg-csa-dark border-border'}`}>
                  {checked && <Check size={11} className="text-white" strokeWidth={3} />}
                </button>
                Pay on account
              </label>
              <label className="flex items-center gap-2.5 text-sm text-text-primary">
                <button onClick={() => setOn(!on)} className={`w-9 h-5 rounded-sm border flex items-center px-0.5 transition-colors duration-[120ms] ${on ? 'bg-csa-accent border-csa-accent justify-end' : 'bg-surface-raised border-border justify-start'}`}>
                  <span className="w-3.5 h-3.5 bg-white rounded-sm" />
                </button>
                Notifications
              </label>
            </div>
          </div>
        </Section>

        <Section title="Status" note="Derived, not from the brand guide. Lifted in the dark theme to stay legible on navy.">
          <div className="flex flex-wrap gap-2">
            {[
              ['Paid', 'text-success bg-success/10 border-success/30'],
              ['Draft', 'text-text-muted bg-surface-raised border-border'],
              ['Pending', 'text-warning bg-warning/10 border-warning/30'],
              ['Overdue', 'text-error bg-error/10 border-error/30'],
              ['Renewal', 'text-csa-accent bg-csa-accent/10 border-csa-accent/30'],
            ].map(([label, cls]) => (
              <span key={label} className={`px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.06em] border rounded-sm ${cls}`}>{label}</span>
            ))}
          </div>
        </Section>

        <Section title="Tabs" note="Underline only. The active tab takes a 4px blue rule.">
          <div className="bg-surface border border-border rounded-xl">
            <div className="flex border-b border-border-subtle px-2">
              {['details', 'orders', 'assets', 'contacts'].map(t => (
                <button key={t} onClick={() => setTab(t)} className={`px-4 py-3 text-xs font-bold uppercase tracking-[0.06em] border-b-4 -mb-px transition-colors duration-[120ms] ${tab === t ? 'text-csa-accent border-csa-accent' : 'text-text-muted border-transparent hover:text-text-primary'}`}>{t}</button>
              ))}
            </div>
            <div className="p-6 text-sm text-text-secondary capitalize">{tab} panel</div>
          </div>
        </Section>

        <Section title="Table" note="Uppercase eyebrow headers over a 4px rule, hairline row rules, tinted row hover. Rows are links and clickable.">
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <table>
              <thead><tr><th>Account</th><th>Country</th><th>Partner</th><th>Created</th></tr></thead>
              <tbody>
                {[
                  ['Acme Surveying', 'Australia', 'CSS Melbourne', '12 Aug 2026'],
                  ['Northline Civil', 'New Zealand', 'CSS Auckland', '09 Aug 2026'],
                  ['Ridgeway Group', 'Australia', 'CADApps', '02 Aug 2026'],
                ].map(r => (
                  <tr key={r[0]} className="cursor-pointer">
                    <td><span className="flex items-center gap-2"><Building2 size={14} className="text-csa-accent" /><span className="font-semibold text-text-primary">{r[0]}</span></span></td>
                    <td className="text-text-secondary">{r[1]}</td><td className="text-text-secondary">{r[2]}</td><td className="text-text-muted">{r[3]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Empty and loading" note="Loading placeholders pulse opacity on a flat surface — the old gradient shimmer is prohibited.">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="bg-surface border border-border rounded-xl p-10 text-center">
              <Ticket size={28} className="mx-auto text-text-muted mb-3" />
              <p className="text-sm font-bold text-text-primary">No coupons yet</p>
              <p className="text-xs text-text-muted mt-1 mb-4">Create one to get started.</p>
              <button className="inline-flex items-center gap-2 px-4 py-2 bg-csa-accent text-white text-xs font-bold uppercase tracking-[0.04em] rounded-md"><Plus size={13} /> New coupon</button>
            </div>
            <div className="bg-surface border border-border rounded-xl p-6 space-y-3">
              {[3, 4, 2].map((w, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-8 h-8 skeleton rounded-md" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 skeleton rounded-sm" style={{ width: `${w * 18}%` }} />
                    <div className="h-2.5 skeleton rounded-sm" style={{ width: `${w * 12}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Section>

        <Section title="Sidebar navigation" note="Active item takes a 4px blue left rule and a tinted surface. Derived from the pathname, so a deep link highlights correctly.">
          <div className="bg-csa-dark border border-border rounded-xl p-3 max-w-xs">
            {[
              [Building2, 'Accounts', true], [Users, 'Leads', false],
              [FileText, 'Orders', false], [Ticket, 'Coupons', false], [Download, 'Resources', false],
            ].map(([Icon, label, active], i) => {
              const I = Icon as typeof Building2;
              return (
                <button key={i} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-semibold border-l-4 transition-colors duration-[120ms] ${active ? 'text-csa-accent bg-csa-accent/10 border-csa-accent' : 'text-text-secondary border-transparent hover:text-text-primary hover:bg-surface-raised'}`}>
                  <I size={16} /> {label as string}
                </button>
              );
            })}
          </div>
        </Section>
      </div>
    </div>
  );
}
