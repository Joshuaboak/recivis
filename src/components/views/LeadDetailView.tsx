'use client';

import { useState, useEffect, useMemo, useCallback, useRef, type MouseEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Building2, User, Package, Loader2, ExternalLink, Mail, Phone,
  MapPin, FileText, Star, Plus, X, Eye, Beaker, ArrowRightLeft, Check,
  AlertTriangle, Globe, Briefcase, Tag, Clock, MessageSquare,
  Smartphone, Factory, Send, Pencil, Save, ChevronDown,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { buildPath } from '@/lib/routes';
import { useTrackRecentItem } from '@/lib/useRecentItems';
import { useGuardedRouter } from '@/lib/useGuardedRouter';
import { useUnsavedChanges } from '@/components/UnsavedChangesProvider';
import { GuardedLink } from '@/components/GuardedLink';
import Pagination from '../Pagination';
import AssetDetailModal from '../AssetDetailModal';
import CreateEvaluationModal from '../CreateEvaluationModal';
import CreateEvaluationButton from '../CreateEvaluationButton';
import EmailHistory from '../EmailHistory';
import { InlineEditField, InlineEditFieldProvider } from '../InlineEditField';

interface ResellerOption {
  id: string;
  name: string;
  region: string;
}

const LEAD_STATUSES = [
  'Not Contacted', 'Attempted to Contact', 'Contacted', 'Future Interest',
  'No Interest Ever', 'Dormant', 'Lost Lead', 'Pre-Qualified', 'Suspect',
];

const INDUSTRIES = [
  'Civil Engineering', 'Utilities', 'Academic', 'Architectural', 'Builder',
  'Civil', 'Civil & Structural', 'Developer', 'Educational', 'Government',
  'Mechanical', 'Mining', 'Structural', 'Survey', 'Town Planning',
  'Traffic Engineering', 'Other', 'Management ISV',
];

const PRODUCTS_OF_INTEREST = [
  'Civil Site Design for BricsCAD', 'Civil Site Design for Civil 3D',
  'Corridor EZ for Civil 3D', 'Stringer Topo for BricsCAD',
  'Stringer Topo for Civil 3D', 'Customization Services',
  'Design Services', 'Training Services', 'Software Maintenance Plan',
];

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

/** Scope id for the full-page edit form registered with the dirty registry. */
const SCOPE_EDIT = 'lead-detail:edit';

/** One field the full edit form may write. */
interface EditableField {
  /** Zoho api name. Doubles as the PATCH body key and the form state key. */
  name: string;
  label: string;
  section: (typeof SECTIONS)[number]['id'];
  input: 'text' | 'email' | 'tel' | 'select' | 'lookup';
  options?: readonly string[];
  required?: true;
  /**
   * Mirrors the `canEdit` prop on this field's InlineEditField.
   *
   * `record` — the lead's own columns. The partner the lead is assigned to
   * owns this information and is the one correcting it, so anyone who can see
   * the record and is not read-only may edit it. The route proves the record is
   * theirs before the write lands.
   *
   * `reseller` — which partner the lead belongs to. Reassignment is not the
   * assignee's call, so it stays with CSA and with distributors moving a lead
   * around their own tree.
   */
  gate: 'record' | 'reseller';
}

const SECTIONS = [
  { id: 'contact', label: 'Contact Information', Icon: User },
  { id: 'company', label: 'Company Details', Icon: Building2 },
  { id: 'lead', label: 'Lead Details', Icon: Tag },
  { id: 'assignment', label: 'Assignment', Icon: Briefcase },
] as const;

/**
 * The lead fields the full form may write. Each entry mirrors an
 * InlineEditField in the view below — same api name, same input type, same
 * permission gate — and every name is on the PATCH /api/leads/[id] allowlist.
 * Fields the view shows read-only (Country, Lead_Source, Owner, Created) stay
 * out even where the route would accept them: a form that writes what the
 * inline path refuses is a permissions hole.
 */
const LEAD_FIELDS: readonly EditableField[] = [
  { name: 'First_Name', label: 'First Name', section: 'contact', input: 'text', gate: 'record' },
  { name: 'Last_Name', label: 'Last Name', section: 'contact', input: 'text', required: true, gate: 'record' },
  { name: 'Email', label: 'Email', section: 'contact', input: 'email', gate: 'record' },
  { name: 'Phone', label: 'Phone', section: 'contact', input: 'tel', gate: 'record' },
  { name: 'Mobile', label: 'Mobile', section: 'contact', input: 'tel', gate: 'record' },
  { name: 'Job_Title3', label: 'Job Title', section: 'contact', input: 'text', gate: 'record' },
  { name: 'Company', label: 'Company', section: 'company', input: 'text', required: true, gate: 'record' },
  { name: 'Website', label: 'Website', section: 'company', input: 'text', gate: 'record' },
  { name: 'Industry', label: 'Industry', section: 'company', input: 'select', options: INDUSTRIES, gate: 'record' },
  { name: 'Lead_Status', label: 'Status', section: 'lead', input: 'select', options: LEAD_STATUSES, gate: 'record' },
  { name: 'Product_Interest', label: 'Products of Interest', section: 'lead', input: 'select', options: PRODUCTS_OF_INTEREST, gate: 'record' },
  { name: 'Reseller', label: 'Reseller', section: 'assignment', input: 'lookup', gate: 'reseller' },
];

/**
 * A prospect is an Account, not a lead. The only field either detail view lets
 * a user edit inline on that record is its Reseller — under the same
 * `canEditReseller` gate — and it saves through the Accounts module. The
 * prospect's own columns (billing address, contacts) are read-only here and
 * belong to the account edit route.
 */
const PROSPECT_FIELDS: readonly EditableField[] = [
  { name: 'Reseller', label: 'Reseller', section: 'assignment', input: 'lookup', gate: 'reseller' },
];

const labelCls = 'text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block';
const inputCls = (invalid: boolean) =>
  `w-full bg-csa-dark border px-3 py-2.5 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-lg ${invalid ? 'border-error' : 'border-border-subtle'}`;
const selectCls = 'w-full bg-csa-dark border border-border-subtle px-3 py-2.5 text-sm text-text-primary outline-none focus:border-csa-accent rounded-lg appearance-none cursor-pointer pr-8';

/**
 * `source` comes from the route's `?source=` param. It is optional: a link
 * that knows which module the record lives in passes it, and anything else
 * (a bookmark, a pasted URL) leaves it off, in which case the source is
 * inferred from the record that comes back.
 */
export default function LeadDetailView({
  leadId,
  source: initialSource,
  mode = 'view',
}: {
  leadId: string;
  source?: 'lead' | 'prospect';
  /** `edit` renders the full form. Driven by the route, not local state, so the
   *  form is linkable, survives a refresh, and is exited with the Back button. */
  mode?: 'view' | 'edit';
}) {
  // Every editable field here is an InlineEditField, which registers its own
  // dirty state — this view has no batch form of its own to register.
  const router = useGuardedRouter();
  const { user, setNewInvoiceContext } = useAppStore();
  const { registerDirty } = useUnsavedChanges();

  const [loading, setLoading] = useState(true);
  /** Why the record did not load, in the words the route used. */
  const [loadError, setLoadError] = useState('');
  const [lead, setLead] = useState<Record<string, unknown> | null>(null);
  const [account, setAccount] = useState<Record<string, unknown> | null>(null);
  const [contacts, setContacts] = useState<Record<string, unknown>[]>([]);
  const [evaluationAssets, setEvaluationAssets] = useState<Record<string, unknown>[]>([]);
  const [activeAssets, setActiveAssets] = useState<Record<string, unknown>[]>([]);
  const [archivedAssets, setArchivedAssets] = useState<Record<string, unknown>[]>([]);
  const [invoices, setInvoices] = useState<Record<string, unknown>[]>([]);
  const [source, setSource] = useState<'lead' | 'prospect'>(initialSource || 'lead');

  // Full-form edit state (mode === 'edit')
  const editing = mode === 'edit';
  /** Serialised form state as it was when the record finished loading, so "dirty"
   *  means the user changed something rather than merely opening the edit URL. */
  const pristine = useRef<string | null>(null);
  /** Which record the form mirrors, so a direct hit on /edit populates once. */
  const populatedFor = useRef<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [resellerSearch, setResellerSearch] = useState('');
  const [resellerOpen, setResellerOpen] = useState(false);

  // Convert state
  const [converting, setConverting] = useState(false);
  const [convertResult, setConvertResult] = useState<
    { success: boolean; accountId?: string | null; error?: string; warning?: string } | null
  >(null);
  const [showConvertConfirm, setShowConvertConfirm] = useState(false);

  // Asset detail modal
  const [viewingAsset, setViewingAsset] = useState<Record<string, unknown> | null>(null);
  const [showEvalModal, setShowEvalModal] = useState(false);

  // Asset selection & send keys
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());
  const [sendKeysConfirm, setSendKeysConfirm] = useState<'customer' | 'reseller' | null>(null);
  const [sendingKeys, setSendingKeys] = useState(false);
  const [sendKeysResult, setSendKeysResult] = useState<{ success: boolean; message: string } | null>(null);

  // Pagination
  const [contactPage, setContactPage] = useState(1);
  const contactPageSize = 10;

  // Reseller options for inline lookup field — loaded eagerly so the field
  // is responsive on first click.
  const [resellerOptions, setResellerOptions] = useState<ResellerOption[]>([]);

  const isAdmin = user?.role === 'admin' || user?.role === 'ibm';
  const canConvertLeads = !!user?.permissions?.canConvertLeads;
  const hasChildResellers = !!user?.permissions?.canViewChildRecords;
  const canEditReseller = isAdmin || hasChildResellers;
  /**
   * Whether this user may correct the lead's own details.
   *
   * These used to be admin-only, which left a partner able to see a lead they
   * own and change nothing about it but who it was assigned to — so a wrong
   * phone number or a misspelt company had to be emailed to CSA. Whose lead it
   * is has already been settled by the time the page renders, and again on the
   * route, so the only question left here is read-only or not.
   */
  const canEditRecord = !!user && user.role !== 'viewer';

  /** The fields the full form offers: narrowed to the module the record lives
   *  in, then to the gates this user passes. Empty means there is nothing this
   *  user may edit, which is also what hides the Edit affordance. */
  const fields = useMemo(
    () => (source === 'lead' ? LEAD_FIELDS : PROSPECT_FIELDS)
      .filter(f => (f.gate === 'record' ? canEditRecord : canEditReseller)),
    [source, canEditRecord, canEditReseller],
  );
  const canEditAnything = fields.length > 0;

  /** Fetch the reseller list. Called eagerly on mount and again when the
   *  reseller lookup field is opened, so a freshly-created reseller appears
   *  immediately. */
  const fetchResellerOptions = useCallback(() => {
    if (!canEditReseller) return;
    let url = '/api/resellers';
    if (!isAdmin && user?.resellerId) {
      url = `/api/resellers?resellerId=${user.resellerId}&includeChildren=true`;
    }
    fetch(url)
      .then(res => res.json())
      .then(data => setResellerOptions(data.resellers || []))
      .catch(() => {});
  }, [canEditReseller, isAdmin, user?.resellerId]);

  // Eagerly load on mount so the field shows the cached list immediately.
  useEffect(() => {
    if (resellerOptions.length === 0) fetchResellerOptions();
  }, [fetchResellerOptions, resellerOptions.length]);

  /** Optimistic per-field save: update local state immediately, PATCH the
   *  record, and roll back by throwing on error. `localChanges` is the shape
   *  applied to local state (e.g. lookup objects with name); `apiChanges` is
   *  the body sent to the API (often just a string id). */
  const saveFields = useCallback(async (
    apiChanges: Record<string, unknown>,
    localChanges?: Record<string, unknown>,
  ) => {
    if (!leadId) throw new Error('No lead selected');
    const previous = lead;
    setLead(prev => prev ? { ...prev, ...(localChanges ?? apiChanges) } : prev);
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiChanges),
      });
      if (!res.ok) throw new Error('Save failed');
    } catch (err) {
      setLead(previous);
      throw err;
    }
  }, [leadId, lead]);

  useEffect(() => {
    if (!leadId) return;
    setLoading(true);

    setLoadError('');

    const fetchAs = (s: 'lead' | 'prospect') =>
      fetch(`/api/leads/${leadId}?source=${s}`).then(async res => ({
        ok: res.ok,
        data: await res.json(),
      }));

    // Without a `?source=` param the module is unknown. Ask the Leads
    // module first; a prospect id has no lead record, so an empty answer
    // means the record lives in Accounts.
    (async () => {
      try {
        let result = await fetchAs(initialSource || 'lead');
        if (!initialSource && !result.data?.lead) result = await fetchAs('prospect');
        const { ok, data } = result;

        // A refusal and a missing record are different things, and the route
        // says which. Rendering both as "not found" sends somebody looking for
        // a record that is there and simply is not theirs.
        if (!ok) {
          setLoadError(data?.error || 'This record could not be loaded. Try again.');
          setLoading(false);
          return;
        }

        setSource(data.source || initialSource || 'lead');
        if (data.source === 'prospect') {
          setAccount(data.account);
          setContacts(data.contacts || []);
          setEvaluationAssets(data.evaluationAssets || []);
          setActiveAssets(data.activeAssets || []);
          setArchivedAssets(data.archivedAssets || []);
          setInvoices(data.invoices || []);
        } else {
          setLead(data.lead);
        }
      } catch {
        setLoadError('This record could not be loaded. Try again.');
      }
      setLoading(false);
    })();
  }, [leadId, initialSource]);

  /** The record the form edits — a Leads record or the prospect's Account. */
  const editRecord = source === 'lead' ? lead : account;

  // Feed the header's Recent Items menu once the record has a name.
  useTrackRecentItem(editRecord ? {
    type: 'lead',
    id: leadId,
    title: (editRecord.Company as string)
      || (editRecord.Account_Name as string)
      || (editRecord.Full_Name as string)
      || 'Lead',
    subtitle: (editRecord.Email as string) || undefined,
    href: `${buildPath('lead-detail', leadId)}?source=${source}`,
  } : null);

  /** The value a field currently holds on the record. Lookups keep their id,
   *  which is what the form edits and what the API expects back. */
  const recordValue = useCallback((record: Record<string, unknown>, field: EditableField) =>
    field.input === 'lookup'
      ? (record[field.name] as { id?: string } | null)?.id || ''
      : ((record[field.name] as string) || ''),
  []);

  /** Populate form state from the loaded record. */
  const populateForm = useCallback((record: Record<string, unknown>) => {
    const next: Record<string, string> = {};
    for (const f of source === 'lead' ? LEAD_FIELDS : PROSPECT_FIELDS) {
      next[f.name] = recordValue(record, f);
    }
    setForm(next);
  }, [source, recordValue]);

  /** Populate key. The source is part of it because the two modules share
   *  almost no api names: a form populated as a lead holds field names an
   *  Account does not have, so a resolved source must repopulate rather than
   *  keep lead values under the same id. */
  const populateKey = `${leadId}:${source}`;

  // Arriving straight at /leads/[id]/edit means the record is still loading, so
  // the form is filled here rather than in a click handler.
  useEffect(() => {
    if (editing && editRecord && populatedFor.current !== populateKey) {
      populateForm(editRecord);
      populatedFor.current = populateKey;
      pristine.current = null;
      setAttempted(false);
      setSaveError('');
    }
    if (!editing) populatedFor.current = null;
  }, [editing, editRecord, populateKey, populateForm]);

  /** Every editable field, in a stable order, for the pristine comparison. */
  const formState = useMemo(
    () => JSON.stringify(fields.map(f => form[f.name] ?? '')),
    [fields, form],
  );

  // Runs on the render after populateForm's batched update lands.
  useEffect(() => {
    if (editing && populatedFor.current === populateKey && pristine.current === null) {
      pristine.current = formState;
    }
  }, [editing, populateKey, formState]);

  // Only a changed form counts as unsaved work. Opening /edit and pressing
  // Cancel must not prompt. The inline-edit fields register themselves.
  useEffect(() => {
    const dirty = editing && pristine.current !== null && formState !== pristine.current;
    registerDirty(SCOPE_EDIT, dirty, source === 'prospect' ? 'this prospect' : 'this lead');
    return () => registerDirty(SCOPE_EDIT, false);
  }, [registerDirty, editing, formState, source]);

  /** Detail and edit paths for this record. `?source=` rides along so neither
   *  route has to re-infer which module the record lives in. */
  const detailPath = `${buildPath('lead-detail', leadId)}?source=${source}`;
  const editPath = `${buildPath('lead-edit', leadId)}?source=${source}`;

  const setField = (name: string, value: string) =>
    setForm(prev => ({ ...prev, [name]: value }));

  const missingRequired = fields.some(f => f.required && !(form[f.name] || '').trim());

  const handleEdit = () => router.push(editPath);

  const handleCancel = () => {
    setAttempted(false);
    router.push(detailPath);
  };

  const handleSave = async () => {
    setAttempted(true);
    setSaveError('');
    if (missingRequired || !editRecord) return;

    // Only changed fields go up, so saving never rewrites a field the user
    // left alone. Empty clears the field, matching the inline `v || null` save.
    const changes: Record<string, unknown> = {};
    for (const f of fields) {
      const value = (form[f.name] || '').trim();
      if (value !== recordValue(editRecord, f)) changes[f.name] = value || null;
    }

    if (Object.keys(changes).length === 0) {
      handleCancel();
      return;
    }

    setSaving(true);
    try {
      // A prospect is an Account, so its save target is the Accounts route.
      const url = source === 'prospect' ? `/api/accounts/${leadId}` : `/api/leads/${leadId}`;
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      });
      if (res.ok) {
        // Clear the scope before navigating, or the guard would prompt about
        // work that has just been saved.
        pristine.current = null;
        registerDirty(SCOPE_EDIT, false);
        router.push(detailPath);
      } else {
        const data = await res.json().catch(() => ({}));
        setSaveError(data.error || 'Failed to save changes');
      }
    } catch {
      setSaveError('Failed to save changes');
    }
    setSaving(false);
  };

  const goBack = () => router.push(buildPath('leads'));

  /** Clicking anywhere in a row opens the record. Clicks that land on the
   *  row's own link or any other control belong to that element, so the row
   *  stays out of the way and the browser handles them normally. */
  const openRow = (e: MouseEvent<HTMLTableRowElement>, href: string) => {
    if (e.target instanceof Element && e.target.closest('a,button,input,select,[role="button"]')) return;
    router.push(href);
  };

  const handleConvert = async () => {
    if (!leadId) return;
    setConverting(true);
    setConvertResult(null);

    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();

      // Keyed on `success` alone. Requiring an account id as well meant a
      // conversion Zoho had accepted was reported as a failure whenever the id
      // could not be read out of the reply — and the obvious response to that
      // message is to press the button again.
      if (data.success) {
        setConvertResult({
          success: true,
          accountId: data.accountId ?? null,
          warning: data.warning,
        });
      } else {
        setConvertResult({
          success: false,
          error: data.error || `Zoho rejected the conversion (HTTP ${res.status}).`,
        });
      }
    } catch (err) {
      setConvertResult({ success: false, error: err instanceof Error ? err.message : 'Conversion failed' });
    }
    setConverting(false);
    setShowConvertConfirm(false);
  };

  const crmLink = source === 'lead'
    ? `https://crm.zoho.com.au/crm/org7002802215/tab/Leads/${leadId}`
    : `https://crm.zoho.com.au/crm/org7002802215/tab/Accounts/${leadId}`;

  const formatDate = (d: unknown) => {
    if (!d || typeof d !== 'string') return '\u2014';
    const date = new Date(d);
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
  };

  const sendKeys = async (toCustomer: boolean) => {
    if (selectedAssets.size === 0) return;
    setSendingKeys(true);
    setSendKeysResult(null);
    try {
      const res = await fetch('/api/send-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetIds: Array.from(selectedAssets),
          sendToCustomer: toCustomer,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSendKeysResult({ success: true, message: `Keys sent to ${toCustomer ? 'customer' : 'reseller'} successfully` });
        setSelectedAssets(new Set());
      } else {
        setSendKeysResult({ success: false, message: data.error || 'Failed to send keys' });
      }
    } catch {
      setSendKeysResult({ success: false, message: 'Failed to send keys' });
    }
    setSendingKeys(false);
    setSendKeysConfirm(null);
    setTimeout(() => setSendKeysResult(null), 5000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={24} className="text-csa-accent animate-spin" />
      </div>
    );
  }

  // === EDIT MODE (/leads/[id]/edit) ===
  // Serves both a Leads record and a prospect Account; `fields` is already
  // narrowed to the resolved source and to this user's permissions, and the
  // save below posts to whichever module the record actually lives in.
  if (editing) {
    if (!editRecord) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-3">
          <p className="text-text-muted max-w-md text-center">{loadError || 'This record could not be found.'}</p>
          <button onClick={goBack} className="text-csa-accent text-sm cursor-pointer">Back to Leads</button>
        </div>
      );
    }

    const heading = (editRecord.Company || editRecord.Account_Name || editRecord.Full_Name || leadId) as string;
    const selectedResellerName = resellerOptions.find(r => r.id === form.Reseller)?.name;
    const filteredResellers = resellerSearch
      ? resellerOptions.filter(r => r.name.toLowerCase().includes(resellerSearch.toLowerCase()))
      : resellerOptions;

    const renderField = (f: EditableField) => {
      const value = form[f.name] || '';
      const invalid = !!f.required && attempted && !value.trim();

      if (f.input === 'lookup') {
        return (
          <>
            <input
              type="text"
              value={value ? (selectedResellerName || '') : resellerSearch}
              onChange={e => { setResellerSearch(e.target.value); if (value) setField(f.name, ''); }}
              onFocus={() => setResellerOpen(true)}
              onBlur={() => setTimeout(() => setResellerOpen(false), 200)}
              placeholder="Search resellers..."
              className={inputCls(invalid)}
            />
            {resellerOpen && !value && filteredResellers.length > 0 && (
              <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-csa-dark border border-border rounded-xl max-h-[200px] overflow-y-auto shadow-lg">
                {filteredResellers.slice(0, 30).map(r => (
                  <button key={r.id} onMouseDown={() => { setField(f.name, r.id); setResellerSearch(''); }}
                    className="w-full text-left px-3 py-2 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-raised transition-colors cursor-pointer">
                    {r.name}
                  </button>
                ))}
              </div>
            )}
          </>
        );
      }

      if (f.input === 'select') {
        return (
          <div className="relative">
            <select value={value} onChange={e => setField(f.name, e.target.value)} className={selectCls}>
              <option value="">&mdash; None &mdash;</option>
              {(f.options || []).map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          </div>
        );
      }

      return (
        <input
          type={f.input}
          value={value}
          onChange={e => setField(f.name, e.target.value)}
          placeholder={f.label}
          className={inputCls(invalid)}
        />
      );
    };

    return (
      <div className="h-full overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-text-primary">
                Edit {source === 'prospect' ? 'Prospect' : 'Lead'}
              </h1>
              <p className="text-sm text-text-muted mt-1">Editing {heading}</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleCancel}
                className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-text-muted bg-surface-raised border border-border-subtle rounded-xl hover:bg-surface-overlay transition-colors cursor-pointer">
                <X size={14} /> Cancel
              </button>
              {canEditAnything && (
                <button onClick={handleSave} disabled={saving}
                  className="flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-success bg-success/10 border border-success/30 rounded-xl hover:bg-success/20 transition-colors cursor-pointer disabled:opacity-40">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              )}
            </div>
          </div>

          {attempted && missingRequired ? (
            <div className="mb-5 p-3 bg-error/10 border border-error/20 rounded-xl text-xs text-error">
              Please fill in {fields.filter(f => f.required).map(f => f.label).join(' and ')}.
            </div>
          ) : null}

          {saveError ? (
            <div className="mb-5 p-3 bg-error/10 border border-error/30 rounded-xl flex items-center gap-2 text-sm text-error">
              <AlertTriangle size={16} /> {saveError}
            </div>
          ) : null}

          {canEditAnything ? SECTIONS.map(section => {
            const inSection = fields.filter(f => f.section === section.id);
            if (inSection.length === 0) return null;
            return (
              <motion.div key={section.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className="bg-surface border border-border-subtle rounded-xl p-5 mb-5">
                <h2 className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2">
                  <section.Icon size={15} className="text-csa-accent" /> {section.label}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {inSection.map(f => (
                    <div key={f.name} className="relative">
                      <label className={labelCls}>{f.label}{f.required ? ' *' : ''}</label>
                      {renderField(f)}
                    </div>
                  ))}
                </div>
              </motion.div>
            );
          }) : (
            <div className="bg-surface border border-border-subtle rounded-xl p-5 text-sm text-text-secondary">
              You do not have permission to edit this {source === 'prospect' ? 'prospect' : 'lead'}.
            </div>
          )}
        </div>
      </div>
    );
  }

  // === LEAD VIEW (Zoho Leads module) ===
  if (source === 'lead') {
    if (!lead) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-3">
          <p className="text-text-muted max-w-md text-center">{loadError || 'This record could not be found.'}</p>
          <button onClick={goBack} className="text-csa-accent text-sm cursor-pointer">Back to Leads</button>
        </div>
      );
    }

    const reseller = lead.Reseller as { name?: string; id?: string } | null;
    const owner = lead.Owner as { name?: string } | null;
    const leadStatus = (lead.Lead_Status as string) || '';

    return (
      <div className="h-full overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <div className="flex items-center gap-4 mb-6">
            <button onClick={goBack} className="w-9 h-9 flex-shrink-0 flex items-center justify-center bg-surface-raised rounded-xl hover:bg-surface-overlay transition-colors cursor-pointer">
              <ArrowLeft size={18} className="text-text-secondary" />
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-text-primary truncate" title={(lead.Company as string) || (lead.Full_Name as string) || ''}>{lead.Company as string || lead.Full_Name as string}</h1>
                <div data-tour="lead-badge" className="relative group/badge flex-shrink-0">
                  <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-md bg-csa-accent/15 text-csa-accent cursor-help">
                    Lead
                  </span>
                  <div className="absolute left-0 top-full mt-1.5 z-20 bg-csa-dark border border-border rounded-xl px-3 py-2 shadow-lg opacity-0 pointer-events-none group-hover/badge:opacity-100 group-hover/badge:pointer-events-auto transition-opacity w-64">
                    <p className="text-[11px] text-text-secondary leading-relaxed">
                      Leads are people who have interacted with us through a web form (contact us, demo request, or other marketing forms) but do not yet have an evaluation.
                    </p>
                  </div>
                </div>
              </div>
              <p className="text-sm text-text-muted truncate">{lead.Email as string || ''}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {canConvertLeads && !convertResult?.success && (
                /* The guidance is a hover tooltip rather than a caption. As a
                   caption it sat below the button, which both pushed this control
                   out of line with Edit and Open in CRM and sized the group to the
                   caption's width. */
                <div className="relative group/convert">
                  <button
                    data-tour="lead-convert"
                    onClick={() => setShowConvertConfirm(true)}
                    disabled={converting}
                    className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-success bg-success/10 border border-success/30 rounded-xl hover:bg-success/20 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {converting ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <ArrowRightLeft size={14} />
                    )}
                    {converting ? 'Converting...' : 'Convert to Prospect'}
                  </button>
                  <div className="absolute left-0 top-full mt-1.5 z-20 w-56 bg-csa-dark border border-border rounded-xl px-3 py-2 shadow-lg opacity-0 pointer-events-none group-hover/convert:opacity-100 transition-opacity">
                    <p className="text-[11px] text-text-secondary leading-relaxed">
                      To create evaluations, convert this lead to a prospect first.
                    </p>
                  </div>
                </div>
              )}
              {canEditAnything && (
                <button onClick={handleEdit} className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-csa-accent bg-csa-accent/10 border border-csa-accent/30 rounded-xl hover:bg-csa-accent/20 transition-colors cursor-pointer">
                  <Pencil size={14} />
                  Edit
                </button>
              )}
              {user?.permissions?.canAccessCrm ? (
              <a href={crmLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-csa-accent bg-csa-accent/10 border border-csa-accent/30 rounded-xl hover:bg-csa-accent/20 transition-colors cursor-pointer">
                  <ExternalLink size={14} />
                  Open in CRM
                </a>
            ) : null}
            </div>
          </div>

          <AnimatePresence>
            {showConvertConfirm && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"
                onClick={() => setShowConvertConfirm(false)}
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 10 }}
                  onClick={e => e.stopPropagation()}
                  className="bg-csa-dark border border-border rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-success/15 flex items-center justify-center">
                      <ArrowRightLeft size={20} className="text-success" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-text-primary">Convert to Prospect</h3>
                      <p className="text-xs text-text-muted">This will create an Account and Contact in Zoho CRM</p>
                    </div>
                  </div>

                  <div className="bg-surface rounded-xl p-4 mb-4 space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Building2 size={14} className="text-csa-accent" />
                      <span className="text-text-muted">Company:</span>
                      <span className="text-text-primary font-semibold">{lead.Company as string || '\u2014'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <User size={14} className="text-csa-accent" />
                      <span className="text-text-muted">Contact:</span>
                      <span className="text-text-primary font-semibold">{lead.Full_Name as string || '\u2014'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Mail size={14} className="text-text-muted" />
                      <span className="text-text-muted">Email:</span>
                      <span className="text-text-primary">{lead.Email as string || '\u2014'}</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2 mb-5 p-3 bg-warning/5 border border-warning/20 rounded-xl">
                    <AlertTriangle size={14} className="text-warning mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-text-secondary">
                      This will convert the lead into a prospect account with a contact record.
                      All configured workflows will be triggered on the new records.
                    </p>
                  </div>

                  <div className="flex items-center gap-3 justify-end">
                    <button
                      onClick={() => setShowConvertConfirm(false)}
                      className="px-4 py-2 text-xs font-semibold text-text-muted hover:text-text-primary transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleConvert}
                      disabled={converting}
                      className="flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-success rounded-xl hover:bg-success/90 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {converting ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          Converting...
                        </>
                      ) : (
                        <>
                          <ArrowRightLeft size={14} />
                          Convert to Prospect
                        </>
                      )}
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
            {convertResult && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className={`mb-6 p-4 rounded-xl border ${
                  convertResult.success
                    ? 'bg-success/10 border-success/30'
                    : 'bg-error/10 border-error/30'
                }`}
              >
                {convertResult.success ? (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-success/20 flex items-center justify-center">
                        <Check size={16} className="text-success" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-success">Lead converted to prospect</p>
                        <p className="text-xs text-text-muted">
                          {convertResult.warning
                            || 'Prospect account and contact created. Workflows have been triggered.'}
                        </p>
                      </div>
                    </div>
                    {/* Zoho made an Account; the portal calls it a prospect and
                        shows it on this same view under ?source=prospect. Linking
                        to the account page sent people somewhere the record does
                        not appear as what they just made. No id means no link —
                        the message above says where to look instead. */}
                    <GuardedLink
                      href={convertResult.accountId
                        ? `${buildPath('lead-detail', convertResult.accountId)}?source=prospect`
                        : buildPath('leads')}
                      className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-csa-accent bg-csa-accent/10 border border-csa-accent/30 rounded-xl hover:bg-csa-accent/20 transition-colors cursor-pointer"
                    >
                      <ExternalLink size={14} />
                      {convertResult.accountId ? 'View Prospect' : 'Open Leads'}
                    </GuardedLink>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-error/20 flex items-center justify-center">
                      <AlertTriangle size={16} className="text-error" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-error">Conversion failed</p>
                      <p className="text-xs text-text-muted">{convertResult.error}</p>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <InlineEditFieldProvider>
          <motion.div data-tour="lead-details" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            <InlineEditField fieldId="company" label="Company" icon={<Building2 size={14} />}
              value={(lead.Company as string) || ''} type="text" canEdit={canEditRecord}
              onSave={v => saveFields({ Company: v || null })} />

            <InlineEditField fieldId="first_name" label="First Name" icon={<User size={14} />}
              value={(lead.First_Name as string) || ''} type="text" canEdit={canEditRecord}
              onSave={v => saveFields({ First_Name: v || null })} />

            <InlineEditField fieldId="last_name" label="Last Name" icon={<User size={14} />}
              value={(lead.Last_Name as string) || ''} type="text" canEdit={canEditRecord}
              onSave={v => saveFields({ Last_Name: v || null })} />

            <InlineEditField fieldId="job_title" label="Job Title" icon={<Briefcase size={14} />}
              value={(lead.Job_Title3 as string) || ''} type="text" canEdit={canEditRecord}
              onSave={v => saveFields({ Job_Title3: v || null })} />

            <InlineEditField fieldId="email" label="Email" icon={<Mail size={14} />}
              value={(lead.Email as string) || ''} type="email" canEdit={canEditRecord}
              onSave={v => saveFields({ Email: v || null })} />

            <InlineEditField fieldId="phone" label="Phone" icon={<Phone size={14} />}
              value={(lead.Phone as string) || ''} type="tel" canEdit={canEditRecord}
              onSave={v => saveFields({ Phone: v || null })} />

            <InlineEditField fieldId="mobile" label="Mobile" icon={<Smartphone size={14} />}
              value={(lead.Mobile as string) || ''} type="tel" canEdit={canEditRecord}
              onSave={v => saveFields({ Mobile: v || null })} />

            <InlineEditField fieldId="website" label="Website" icon={<Globe size={14} />}
              value={(lead.Website as string) || ''} type="url" canEdit={canEditRecord}
              onSave={v => saveFields({ Website: v || null })} />

            <InfoCard label="Country" value={lead.Country as string || '\u2014'} icon={<MapPin size={14} />} />

            <InlineEditField fieldId="industry" label="Industry" icon={<Factory size={14} />}
              value={(lead.Industry as string) || ''} type="select"
              options={[{ value: '', label: '— None —' }, ...INDUSTRIES.map(i => ({ value: i, label: i }))]}
              canEdit={canEditRecord} onSave={v => saveFields({ Industry: v || null })} />

            <InlineEditField fieldId="lead_status" label="Status" icon={<Tag size={14} />}
              value={leadStatus} type="select"
              options={[{ value: '', label: '— None —' }, ...LEAD_STATUSES.map(s => ({ value: s, label: s }))]}
              displayValue={leadStatus ? (
                <span className={`inline-block px-2 py-0.5 text-[10px] font-bold uppercase rounded-md ${STATUS_COLORS[leadStatus] || 'bg-text-muted/20 text-text-muted'}`}>
                  {leadStatus}
                </span>
              ) : '\u2014'}
              canEdit={canEditRecord} onSave={v => saveFields({ Lead_Status: v || null })} />

            <InlineEditField fieldId="product_interest" label="Products of Interest" icon={<Package size={14} />}
              value={(lead.Product_Interest as string) || ''} type="select"
              options={[{ value: '', label: '— None —' }, ...PRODUCTS_OF_INTEREST.map(p => ({ value: p, label: p }))]}
              canEdit={canEditRecord} onSave={v => saveFields({ Product_Interest: v || null })} />

            <InfoCard label="Lead Source" value={lead.Lead_Source as string || '\u2014'} icon={<Globe size={14} />} />

            <InlineEditField fieldId="reseller" label="Reseller" icon={<Briefcase size={14} />}
              value={reseller?.id || ''} type="lookup"
              displayValue={reseller?.name || '\u2014'}
              options={[{ value: '', label: '— None —' }, ...resellerOptions.map(r => ({ value: r.id, label: r.name }))]}
              placeholder="Search resellers..."
              canEdit={canEditReseller}
              onOpenEdit={fetchResellerOptions}
              onSave={async v => {
                const found = resellerOptions.find(r => r.id === v);
                // API expects string id; local state needs {id, name} for display
                await saveFields(
                  { Reseller: v || null },
                  { Reseller: v ? { id: v, name: found?.name || '' } : null },
                );
              }} />

            <InfoCard label="CSA Sales Rep" value={owner?.name || '\u2014'} icon={<User size={14} />} />
            <InfoCard label="Created" value={formatDate(lead.Created_Time)} icon={<Clock size={14} />} />
          </motion.div>
          </InlineEditFieldProvider>

          {(lead.Description as string) ? (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-8">
              <h2 className="text-lg font-bold text-text-primary flex items-center gap-2 mb-3">
                <MessageSquare size={18} className="text-csa-accent" />
                Description
              </h2>
              <div className="bg-surface border border-border-subtle rounded-xl p-4">
                <p className="text-sm text-text-secondary whitespace-pre-wrap">{lead.Description as string}</p>
              </div>
            </motion.div>
          ) : null}

          <EmailHistory module="Leads" recordId={leadId} />
        </div>
      </div>
    );
  }

  // === PROSPECT VIEW (Account with type=Prospect) ===
  if (!account) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <p className="text-text-muted max-w-md text-center">{loadError || 'This record could not be found.'}</p>
        <button onClick={goBack} className="text-csa-accent text-sm cursor-pointer">Back to Leads</button>
      </div>
    );
  }

  const reseller = account.Reseller as { name?: string; id?: string } | null;
  const owner = account.Owner as { name?: string } | null;
  const primaryContact = account.Primary_Contact as { name?: string; id?: string } | null;
  const secondaryContact = account.Secondary_Contact as { name?: string; id?: string } | null;

  const sortedContacts = [...contacts].sort((a, b) => {
    const aId = a.id as string;
    const bId = b.id as string;
    if (primaryContact?.id && aId === primaryContact.id) return -1;
    if (primaryContact?.id && bId === primaryContact.id) return 1;
    if (secondaryContact?.id && aId === secondaryContact.id) return -1;
    if (secondaryContact?.id && bId === secondaryContact.id) return 1;
    return 0;
  });

  const contactSafePage = Math.min(contactPage, Math.max(1, Math.ceil(sortedContacts.length / contactPageSize)));
  const paginatedContacts = sortedContacts.slice((contactSafePage - 1) * contactPageSize, contactSafePage * contactPageSize);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="flex items-center gap-4 mb-6">
          <button onClick={goBack} className="w-9 h-9 flex-shrink-0 flex items-center justify-center bg-surface-raised rounded-xl hover:bg-surface-overlay transition-colors cursor-pointer">
            <ArrowLeft size={18} className="text-text-secondary" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-text-primary truncate" title={account.Account_Name as string}>{account.Account_Name as string}</h1>
              <div data-tour="lead-badge" className="relative group/badge flex-shrink-0">
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-md bg-csa-purple/15 text-csa-purple cursor-help">
                  Prospect
                </span>
                <div className="absolute left-0 top-full mt-1.5 z-20 bg-csa-dark border border-border rounded-xl px-3 py-2 shadow-lg opacity-0 pointer-events-none group-hover/badge:opacity-100 group-hover/badge:pointer-events-auto transition-opacity w-64">
                  <p className="text-[11px] text-text-secondary leading-relaxed">
                    Prospects are potential customers who have active evaluations for our products. They have been set up with an account and may have contacts, assets, and orders.
                  </p>
                </div>
              </div>
            </div>
            <p className="text-sm text-text-muted truncate">{account.Email_Domain as string || ''}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {canEditAnything && (
              <button onClick={handleEdit} className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-csa-accent bg-csa-accent/10 border border-csa-accent/30 rounded-xl hover:bg-csa-accent/20 transition-colors cursor-pointer">
                <Pencil size={14} />
                Edit
              </button>
            )}
            {user?.permissions?.canAccessCrm ? (
              <a href={crmLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-csa-accent bg-csa-accent/10 border border-csa-accent/30 rounded-xl hover:bg-csa-accent/20 transition-colors cursor-pointer">
                <ExternalLink size={14} />
                Open in CRM
              </a>
            ) : null}
          </div>
        </div>

        <motion.div data-tour="lead-details" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          <InfoCard label="Country" value={account.Billing_Country as string} icon={<MapPin size={14} />} />
          <InfoCard label="Reseller" value={reseller?.name || '\u2014'} icon={<Building2 size={14} />} />
          <InfoCard label="CSA Sales Rep" value={owner?.name || '\u2014'} icon={<User size={14} />} />
          <InfoCard label="Primary Contact" value={primaryContact?.name || '\u2014'} icon={<User size={14} />} />
          <InfoCard label="Secondary Contact" value={secondaryContact?.name || '\u2014'} icon={<User size={14} />} />
          <InfoCard label="Email Domain" value={account.Email_Domain as string || '\u2014'} icon={<Mail size={14} />} />
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="mb-8" data-tour="lead-evaluations">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
              <Beaker size={18} className="text-success" />
              Evaluations ({evaluationAssets.length})
            </h2>
            <CreateEvaluationButton
              permissions={user?.permissions}
              existingCount={evaluationAssets.length}
              onClick={() => setShowEvalModal(true)}
            />
          </div>
          {evaluationAssets.length > 0 ? (
            <div className="border border-border-subtle rounded-xl overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead><tr className="bg-surface-raised">
                  <th>Product</th><th>Qty</th><th>Start</th><th>Renewal</th><th>Serial Key</th><th>Status</th><th className="w-10"></th>
                </tr></thead>
                <tbody>
                  {evaluationAssets.map((a, i) => {
                    const product = a.Product as { name?: string } | null;
                    return (
                      <tr key={(a.id as string) ?? i}>
                        <td className="text-text-primary">{product?.name || a.Name as string}</td>
                        <td className="text-text-secondary">{a.Quantity as number}</td>
                        <td className="text-text-secondary">{formatDate(a.Start_Date)}</td>
                        <td className="text-text-secondary">{formatDate(a.Renewal_Date)}</td>
                        <td className="text-text-muted text-xs font-mono">{a.Serial_Key as string || '\u2014'}</td>
                        <td>
                          <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-md ${
                            a.Status === 'Active' ? 'bg-success/20 text-success' : 'bg-text-muted/20 text-text-muted'
                          }`}>
                            {a.Status as string}
                          </span>
                        </td>
                        <td>
                          <button
                            onClick={() => setViewingAsset(a)}
                            className="p-1 text-text-muted hover:text-csa-accent transition-colors cursor-pointer"
                          >
                            <Eye size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-text-muted py-4">No evaluation licences</p>
          )}
        </motion.div>

        <motion.div data-tour="prospect-contacts" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-8">
          <h2 className="text-lg font-bold text-text-primary flex items-center gap-2 mb-3">
            <User size={18} className="text-csa-accent" />
            Contacts ({contacts.length})
          </h2>
          {sortedContacts.length > 0 ? (
            <>
              <div className="border border-border-subtle rounded-xl overflow-x-auto">
                <table className="w-full min-w-[560px]">
                  <thead><tr className="bg-surface-raised">
                    <th>Name</th><th>Email</th><th>Phone</th><th>Title</th>
                  </tr></thead>
                  <tbody>
                    {paginatedContacts.map((c) => {
                      const cId = c.id as string;
                      const isPrimary = primaryContact?.id && cId === primaryContact.id;
                      const isSecondary = secondaryContact?.id && cId === secondaryContact.id;
                      return (
                        <tr key={cId}>
                          <td>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-text-primary">{c.Full_Name as string}</span>
                              {isPrimary && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold uppercase rounded bg-warning/20 text-warning">
                                  <Star size={9} /> Primary
                                </span>
                              )}
                              {isSecondary && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold uppercase rounded bg-csa-accent/20 text-csa-accent">
                                  <Star size={9} /> Secondary
                                </span>
                              )}
                            </div>
                          </td>
                          <td><span className="flex items-center gap-1 text-text-secondary"><Mail size={12} className="text-text-muted" />{c.Email as string || '\u2014'}</span></td>
                          <td><span className="flex items-center gap-1 text-text-secondary"><Phone size={12} className="text-text-muted" />{c.Phone as string || '\u2014'}</span></td>
                          <td className="text-text-muted">{c.Title as string || '\u2014'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-2">
                <Pagination currentPage={contactSafePage} totalItems={sortedContacts.length} pageSize={contactPageSize} onPageChange={setContactPage} />
              </div>
            </>
          ) : (
            <p className="text-sm text-text-muted py-4">No contacts found</p>
          )}
        </motion.div>

        <EmailHistory module="Accounts" recordId={leadId} />

        <motion.div data-tour="prospect-orders" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
              <FileText size={18} className="text-csa-purple" />
              Orders ({invoices.length})
            </h2>
            <button
              onClick={() => {
                setNewInvoiceContext({
                  account: { name: account.Account_Name as string, id: leadId },
                  contact: primaryContact ? { name: primaryContact.name, id: primaryContact.id } : null,
                  reseller: reseller ? { name: reseller.name, id: reseller.id } : null,
                  region: (account.Reseller_Region as string) || '',
                  currency: (account.Currency as string) || '',
                  owner: owner ? { name: owner.name, id: (account.Owner as { id?: string })?.id } : null,
                  billingCountry: account.Billing_Country as string || '',
                });
                router.push(buildPath('create-invoice'));
              }}
              data-tour="prospect-new-order"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-csa-accent bg-csa-accent/10 border border-csa-accent/30 rounded-xl hover:bg-csa-accent/20 transition-colors cursor-pointer"
            >
              <Plus size={13} />
              New Product Order
            </button>
          </div>
          {invoices.length > 0 ? (
            <div className="border border-border-subtle rounded-xl overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead><tr className="bg-surface-raised">
                  <th>Order #</th><th>Subject</th><th>Date</th><th>Type</th><th>Status</th><th>Total</th><th className="w-10"></th>
                </tr></thead>
                <tbody>
                  {invoices.map((inv) => {
                    const currency = inv.Currency as string;
                    const symbol = currency === 'AUD' ? '$' : currency === 'EUR' ? '\u20AC' : currency === 'GBP' ? '\u00A3' : '$';
                    return (
                      <tr
                        key={inv.id as string}
                        onClick={(e) => openRow(e, buildPath('invoice-detail', inv.id as string))}
                        className="cursor-pointer hover:bg-csa-accent/5 transition-colors"
                      >
                        <td className="text-text-muted text-xs font-mono">{inv.Reference_Number as string || '\u2014'}</td>
                        <td className="font-semibold text-csa-accent">
                          <GuardedLink href={buildPath('invoice-detail', inv.id as string)}>
                            {inv.Subject as string || `Order ${inv.id as string}`}
                          </GuardedLink>
                        </td>
                        <td className="text-text-secondary">{formatDate(inv.Invoice_Date)}</td>
                        <td>
                          <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-md ${
                            inv.Invoice_Type === 'Renewal' ? 'bg-csa-purple/20 text-csa-purple' : 'bg-csa-accent/20 text-csa-accent'
                          }`}>
                            {inv.Invoice_Type as string || 'New'}
                          </span>
                        </td>
                        <td>
                          <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-md ${
                            inv.Status === 'Sent' ? 'bg-success/20 text-success'
                              : inv.Status === 'Approved' ? 'bg-csa-accent/20 text-csa-accent'
                              : 'bg-warning/20 text-warning'
                          }`}>
                            {inv.Status as string}
                          </span>
                        </td>
                        <td className="text-text-primary font-semibold">{symbol}{(inv.Grand_Total as number)?.toFixed(2)}</td>
                        <td><ExternalLink size={14} className="text-text-muted" /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-text-muted py-4">No orders yet</p>
          )}
        </motion.div>

        {activeAssets.length > 0 && (
          <motion.div data-tour="prospect-assets" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
                <Package size={18} className="text-success" />
                Assets ({activeAssets.length})
              </h2>
              {selectedAssets.size > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSendKeysConfirm('reseller')}
                    disabled={sendingKeys}
                    className="flex items-center gap-2 px-4 py-1.5 text-xs font-semibold text-csa-accent bg-csa-accent/10 border border-csa-accent/30 rounded-xl hover:bg-csa-accent/20 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Send size={13} /> Send Keys to Reseller
                  </button>
                  <button
                    onClick={() => setSendKeysConfirm('customer')}
                    disabled={sendingKeys}
                    className="flex items-center gap-2 px-4 py-1.5 text-xs font-semibold text-warning bg-warning/10 border border-warning/30 rounded-xl hover:bg-warning/20 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Send size={13} /> Send Keys to Customer
                  </button>
                </div>
              )}
            </div>
            <div className="border border-border-subtle rounded-xl overflow-x-auto">
              <table className="w-full min-w-[800px]">
                <thead><tr className="bg-surface-raised">
                  <th className="w-10">
                    <input
                      type="checkbox"
                      checked={selectedAssets.size === activeAssets.length && activeAssets.length > 0}
                      onChange={() => {
                        if (selectedAssets.size === activeAssets.length) {
                          setSelectedAssets(new Set());
                        } else {
                          setSelectedAssets(new Set(activeAssets.map(a => a.id as string)));
                        }
                      }}
                      className="accent-csa-accent cursor-pointer"
                    />
                  </th>
                  <th>Product</th><th>Qty</th><th>Start</th><th>Renewal</th><th>Serial Key</th><th>Status</th><th className="w-10"></th>
                </tr></thead>
                <tbody>
                  {activeAssets.map((a) => {
                    const product = a.Product as { name?: string } | null;
                    const assetId = a.id as string;
                    const isSelected = selectedAssets.has(assetId);
                    return (
                      <tr key={assetId} className={isSelected ? 'bg-csa-accent/5' : ''}>
                        <td>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {
                              const next = new Set(selectedAssets);
                              if (isSelected) next.delete(assetId); else next.add(assetId);
                              setSelectedAssets(next);
                            }}
                            className="accent-csa-accent cursor-pointer"
                          />
                        </td>
                        <td className="text-text-primary">{product?.name || a.Name as string}</td>
                        <td className="text-text-secondary">{a.Quantity as number}</td>
                        <td className="text-text-secondary">{formatDate(a.Start_Date)}</td>
                        <td className="text-text-secondary">{formatDate(a.Renewal_Date)}</td>
                        <td className="text-text-muted text-xs font-mono">{a.Serial_Key as string || '\u2014'}</td>
                        <td>
                          <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-md ${
                            a.Status === 'Active' ? 'bg-success/20 text-success' : 'bg-text-muted/20 text-text-muted'
                          }`}>
                            {a.Status as string}
                          </span>
                        </td>
                        <td>
                          <button
                            onClick={() => setViewingAsset(a)}
                            className="p-1 text-text-muted hover:text-csa-accent transition-colors cursor-pointer"
                          >
                            <Eye size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </div>

      {viewingAsset && (
        <AssetDetailModal
          assetId={viewingAsset.id as string}
          assetData={viewingAsset}
          onClose={() => setViewingAsset(null)}
          onAssetUpdated={() => {
            if (leadId) {
              fetch(`/api/leads/${leadId}?source=${source}`)
                .then(res => res.json())
                .then(data => {
                  if (data.source === 'prospect') {
                    setEvaluationAssets(data.evaluationAssets || []);
                    setActiveAssets(data.activeAssets || []);
                    setArchivedAssets(data.archivedAssets || []);
                  }
                })
                .catch(() => {});
            }
          }}
        />
      )}

      {/* Create Evaluation Modal */}
      {showEvalModal && account && (
        <CreateEvaluationModal
          accountId={leadId}
          accountName={account.Account_Name as string}
          canExtend={user?.permissions?.canExtendEvaluations ?? false}
          onSuccess={() => {
            setShowEvalModal(false);
            // Reload to show new evaluation
            if (leadId) {
              fetch(`/api/leads/${leadId}?source=${source}`)
                .then(res => res.json())
                .then(data => {
                  if (data.source === 'prospect') {
                    setEvaluationAssets(data.evaluationAssets || []);
                    setActiveAssets(data.activeAssets || []);
                    setArchivedAssets(data.archivedAssets || []);
                  }
                })
                .catch(() => {});
            }
          }}
          onClose={() => setShowEvalModal(false)}
        />
      )}

      {/* Send Keys Confirmation Dialog */}
      <AnimatePresence>
        {sendKeysConfirm && account && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSendKeysConfirm(null)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-csa-dark border border-border rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-5"
            >
              <h3 className="text-base font-bold text-text-primary mb-2">
                Send Keys to {sendKeysConfirm === 'customer' ? 'Customer' : 'Reseller'}
              </h3>
              <p className="text-sm text-text-secondary mb-1">
                This will email the licence details for <span className="font-semibold text-text-primary">{selectedAssets.size} asset{selectedAssets.size !== 1 ? 's' : ''}</span> to:
              </p>
              <p className="text-sm font-semibold text-csa-accent mb-4">
                {sendKeysConfirm === 'customer'
                  ? (() => {
                      const pc = contacts.find(c => c.id === primaryContact?.id);
                      return pc ? `${pc.Full_Name} (${pc.Email})` : primaryContact?.name || 'Primary contact';
                    })()
                  : reseller?.name || 'Reseller'
                }
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setSendKeysConfirm(null)}
                  className="px-4 py-2 text-xs font-semibold text-text-muted bg-surface-raised border border-border-subtle rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => sendKeys(sendKeysConfirm === 'customer')}
                  disabled={sendingKeys}
                  className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl cursor-pointer disabled:opacity-50 ${
                    sendKeysConfirm === 'customer'
                      ? 'text-warning bg-warning/10 border border-warning/30'
                      : 'text-csa-accent bg-csa-accent/10 border border-csa-accent/30'
                  }`}
                >
                  {sendingKeys ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  {sendingKeys ? 'Sending...' : 'Confirm Send'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Send Keys Result Toast */}
      <AnimatePresence>
        {sendKeysResult && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className={`fixed bottom-6 right-20 z-50 px-4 py-3 rounded-xl border shadow-lg text-sm font-semibold ${
              sendKeysResult.success
                ? 'bg-success/15 border-success/30 text-success'
                : 'bg-error/15 border-error/30 text-error'
            }`}
          >
            {sendKeysResult.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function InfoCard({ label, value, icon, badge }: { label: string; value: string; icon: React.ReactNode; badge?: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border-subtle rounded-xl px-4 py-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">
        {icon}
        {label}
      </div>
      {badge || <p className="text-sm text-text-primary truncate" title={value || undefined}>{value || '\u2014'}</p>}
    </div>
  );
}

