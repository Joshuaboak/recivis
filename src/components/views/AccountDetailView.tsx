/**
 * AccountDetailView — Full account profile with contacts, assets, and invoices.
 *
 * Features:
 * - Account info card with editable billing address and reseller assignment
 * - Contacts list with add/remove, primary/secondary role assignment
 * - Active assets table with renewal invoice generation (select assets -> generate)
 * - Archived assets section (collapsed by default)
 * - Invoice history with links to InvoiceDetailView
 * - "New Invoice" button that pre-fills CreateInvoiceView with account context
 * - Asset detail modal (click any asset to view QLM licence details)
 * - XLSX export (full account, contacts only, invoices only, or assets only)
 * - Direct link to the account in Zoho CRM
 *
 * Edit mode presents the same editable fields as one form at /accounts/[id]/edit,
 * saved with a single PATCH /api/accounts/[id]. Inline per-field editing stays
 * available in view mode; both honour the same per-field permissions.
 *
 * Data: Fetches from /api/accounts/[id] which returns account + related records.
 * Permissions: Address editing is admin/ibm only; reseller also allows users who
 * can view child records. Contact role assignment is open to any user who can
 * reach the account.
 */

'use client';

import { useState, useEffect, useCallback, useMemo, useRef, type MouseEvent } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Building2, User, Package, Loader2, ExternalLink, Mail, Phone, MapPin, FileText, Star, Plus, X, RefreshCw, Eye, Save, Download, Beaker, Send, Pencil, Search, ChevronDown, CalendarClock } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { exportFullAccount, exportContacts, exportInvoices, exportAssets } from '@/lib/export-account';
import { useAppStore } from '@/lib/store';
import { buildPath } from '@/lib/routes';
import { useTrackRecentItem } from '@/lib/useRecentItems';
import { useGuardedRouter } from '@/lib/useGuardedRouter';
import { useUnsavedChanges } from '@/components/UnsavedChangesProvider';
import { GuardedLink } from '@/components/GuardedLink';
import Pagination from '../Pagination';
import AssetDetailModal from '../AssetDetailModal';
import CreateEvaluationModal from '../CreateEvaluationModal';
import CreateMonthlySubscriptionModal from '../CreateMonthlySubscriptionModal';
import RenewMonthlySubscriptionsModal, { type RenewableSubscription } from '../RenewMonthlySubscriptionsModal';
import { isRenewable, renewalBlockReason, renewabilityOf } from '@/lib/renewal-eligibility';
import { AssetSubscriptionBadges } from '@/components/SubscriptionBadges';
import { MONTHLY_SUBSCRIPTION_TAG, PERPETUAL_PLAN_TAG } from '@/lib/subscriptions';
import EmailHistory from '../EmailHistory';
import { InlineEditField, InlineEditFieldProvider } from '../InlineEditField';

interface ResellerOption {
  id: string;
  name: string;
  region: string;
}

/** Scope ids for the batch edit forms registered with the dirty registry. */
const SCOPE_ADDRESS = 'account-detail:address';
const SCOPE_NEW_CONTACT = 'account-detail:new-contact';
/** Scope id for the full-page edit form registered with the dirty registry. */
const SCOPE_EDIT = 'account-detail:edit';

export default function AccountDetailView({
  accountId,
  mode = 'view',
}: {
  accountId: string;
  /** `edit` renders the full form. Driven by the route, not local state, so the
   *  form is linkable, survives a refresh, and is exited with the Back button. */
  mode?: 'view' | 'edit';
}) {
  const router = useGuardedRouter();
  const { registerDirty } = useUnsavedChanges();
  const { user, setNewInvoiceContext } = useAppStore();
  const [account, setAccount] = useState<Record<string, unknown> | null>(null);
  const [contacts, setContacts] = useState<Record<string, unknown>[]>([]);
  const [evaluationAssets, setEvaluationAssets] = useState<Record<string, unknown>[]>([]);
  const [activeAssets, setActiveAssets] = useState<Record<string, unknown>[]>([]);
  const [archivedAssets, setArchivedAssets] = useState<Record<string, unknown>[]>([]);
  const [invoices, setInvoices] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [contactPage, setContactPage] = useState(1);
  const contactPageSize = 10;

  // Add contact form
  const [showAddContact, setShowAddContact] = useState(false);
  const [newContact, setNewContact] = useState({ First_Name: '', Last_Name: '', Email: '', Phone: '' });
  const [addingContact, setAddingContact] = useState(false);
  const [updatingRole, setUpdatingRole] = useState<string | null>(null);

  // Renewal generation
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());
  const [generatingRenewal, setGeneratingRenewal] = useState(false);
  const [viewingAsset, setViewingAsset] = useState<Record<string, unknown> | null>(null);
  const [showEvalModal, setShowEvalModal] = useState(false);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [renewingSubscriptions, setRenewingSubscriptions] = useState<RenewableSubscription[] | null>(null);
  /** Result banner for asset actions — subscriptions, renewals, key sends. */
  const [actionNotice, setActionNotice] = useState('');

  // Send keys state
  const [sendKeysConfirm, setSendKeysConfirm] = useState<'customer' | 'reseller' | null>(null);
  const [sendingKeys, setSendingKeys] = useState(false);
  const [sendKeysResult, setSendKeysResult] = useState<{ success: boolean; message: string } | null>(null);

  // Asset pagination
  const [activeAssetPage, setActiveAssetPage] = useState(1);
  const [archivedAssetPage, setArchivedAssetPage] = useState(1);
  const assetPageSize = 20;

  // Address editing
  const [editingAddress, setEditingAddress] = useState(false);
  const [editAddress, setEditAddress] = useState({ street: '', city: '', state: '', code: '', country: '' });
  const [savingAddress, setSavingAddress] = useState(false);

  // Reseller options for inline lookup field — loaded eagerly so the field
  // is responsive on first click.
  const [resellerOptions, setResellerOptions] = useState<ResellerOption[]>([]);

  const isAdmin = user?.role === 'admin' || user?.role === 'ibm';
  const hasChildResellers = !!user?.permissions?.canViewChildRecords;
  const canEditReseller = isAdmin || hasChildResellers;

  // ─── Full-form edit mode ─────────────────────────────────────────────
  const editing = mode === 'edit';
  /** Serialised form state as it was when the record finished loading, so "dirty"
   *  means the user changed something rather than merely opening the edit URL. */
  const pristine = useRef<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  // Form fields. Only fields the inline path lets this user edit are rendered,
  // and only fields PATCH /api/accounts/[id] accepts appear at all.
  const [formStreet, setFormStreet] = useState('');
  const [formCity, setFormCity] = useState('');
  const [formAddrState, setFormAddrState] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formReseller, setFormReseller] = useState('');
  const [formResellerSearch, setFormResellerSearch] = useState('');
  const [formPrimary, setFormPrimary] = useState('');
  const [formSecondary, setFormSecondary] = useState('');

  /** Optimistic per-field save: update local state immediately, PATCH the
   *  record, and roll back by throwing on error. `localChanges` is the shape
   *  applied to local state for display (e.g. lookup objects with name);
   *  `apiChanges` is the body sent to the API (often just a string id). */
  const saveFields = useCallback(async (
    apiChanges: Record<string, unknown>,
    localChanges?: Record<string, unknown>,
  ) => {
    if (!accountId) throw new Error('No account selected');
    const previous = account;
    setAccount(prev => prev ? { ...prev, ...(localChanges ?? apiChanges) } : prev);
    try {
      const res = await fetch(`/api/accounts/${accountId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiChanges),
      });
      if (!res.ok) throw new Error('Save failed');
    } catch (err) {
      setAccount(previous);
      throw err;
    }
  }, [accountId, account]);

  useEffect(() => {
    if (!accountId) return;
    setLoading(true);

    fetch(`/api/accounts/${accountId}`)
      .then(res => res.json())
      .then(data => {
        setAccount(data.account);
        setContacts(data.contacts || []);
        setEvaluationAssets(data.evaluationAssets || []);
        setActiveAssets(data.activeAssets || []);
        setArchivedAssets(data.archivedAssets || []);
        setInvoices(data.invoices || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [accountId]);

  // Feed the header's Recent Items menu once the record has a name.
  useTrackRecentItem(account ? {
    type: 'account',
    id: accountId,
    title: (account.Account_Name as string) || 'Account',
    subtitle: (account.Email_Domain as string) || undefined,
    href: buildPath('account-detail', accountId),
  } : null);

  const goBack = () => router.push(buildPath('accounts'));

  /** Clicking anywhere in a row opens the record. Clicks that land on the
   *  row's own link or any other control belong to that element, so the row
   *  stays out of the way and the browser handles them normally. */
  const openRow = (e: MouseEvent<HTMLTableRowElement>, href: string) => {
    if (e.target instanceof Element && e.target.closest('a,button,input,select,[role="button"]')) return;
    router.push(href);
  };

  const handleAddContact = async () => {
    if (!newContact.First_Name || !newContact.Last_Name) return;
    setAddingContact(true);
    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newContact,
          Account_Name: { id: accountId },
        }),
      });
      if (res.ok) {
        // Reload account data to get fresh contacts
        const reload = await fetch(`/api/accounts/${accountId}`);
        const data = await reload.json();
        setContacts(data.contacts || []);
        setNewContact({ First_Name: '', Last_Name: '', Email: '', Phone: '' });
        setShowAddContact(false);
        registerDirty(SCOPE_NEW_CONTACT, false);
      }
    } catch { /* handled by UI */ }
    setAddingContact(false);
  };

  const toggleAsset = (id: string) => {
    setSelectedAssets(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isEligibleForRenewal = (a: Record<string, unknown>) => isRenewable(renewabilityOf(a));

  const getIneligibleReason = (a: Record<string, unknown>): string | null =>
    renewalBlockReason(renewabilityOf(a));

  /** Zoho returns record tags as objects; only the names matter here. */
  const assetTagNames = (a: Record<string, unknown>): string[] => {
    const tags = a.Tag;
    if (!Array.isArray(tags)) return [];
    return tags.map(t => (typeof t === 'string' ? t : (t as { name?: string })?.name || ''));
  };

  /** Active assets carrying the Monthly Subscription tag, in renewal order. */
  const monthlySubscriptions: RenewableSubscription[] = activeAssets
    .filter(a => assetTagNames(a).includes(MONTHLY_SUBSCRIPTION_TAG))
    .map(a => ({
      id: a.id as string,
      label: (a.Product as { name?: string } | null)?.name || (a.Name as string) || 'Subscription',
      productCode: (a.Product_Code as string) || '',
      perpetualPlan: assetTagNames(a).includes(PERPETUAL_PLAN_TAG),
      quantity: Number(a.Quantity) || 1,
    }));

  const allAssetIds = [...activeAssets, ...archivedAssets].map(a => a.id as string);
  const allAssetsMap = Object.fromEntries([...activeAssets, ...archivedAssets].map(a => [a.id as string, a]));

  // Check if any selected asset is ineligible for renewal
  const selectedIneligible = Array.from(selectedAssets)
    .map(id => allAssetsMap[id])
    .filter(a => a && !isEligibleForRenewal(a));
  const renewalBlocked = selectedIneligible.length > 0;
  const renewalBlockReasons = [...new Set(selectedIneligible.map(a => getIneligibleReason(a)).filter(Boolean))] as string[];

  const toggleAllAssets = () => {
    if (selectedAssets.size === allAssetIds.length) {
      setSelectedAssets(new Set());
    } else {
      setSelectedAssets(new Set(allAssetIds));
    }
  };

  const generateRenewal = async () => {
    if (selectedAssets.size === 0) return;
    setGeneratingRenewal(true);
    try {
      const res = await fetch('/api/renewals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ asset_ids: Array.from(selectedAssets) }),
      });
      const data = await res.json();
      // Renewals need canCreateInvoices, which is enforced on the server and
      // not on this button. Without this branch a partner who lacks it saw the
      // spinner stop and nothing else — the failure was invisible.
      if (!res.ok) {
        setActionNotice(data.error || 'Could not generate the renewal.');
      } else if (data.invoiceId) {
        router.push(buildPath('invoice-detail', data.invoiceId));
      } else {
        // Reload account to see the new invoice in the list
        const reload = await fetch(`/api/accounts/${accountId}`);
        const reloadData = await reload.json();
        setAccount(reloadData.account);
        setInvoices(reloadData.invoices || []);
        setEvaluationAssets(reloadData.evaluationAssets || []);
        setActiveAssets(reloadData.activeAssets || []);
        setSelectedAssets(new Set());
      }
    } catch {
      setActionNotice('Could not generate the renewal. Please try again.');
    }
    setGeneratingRenewal(false);
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

  const setContactRole = async (contactId: string, role: 'primary' | 'secondary') => {
    setUpdatingRole(contactId + role);
    try {
      const body: Record<string, unknown> = {};
      if (role === 'primary') body.Primary_Contact = contactId;
      else body.Secondary_Contact = contactId;

      const res = await fetch(`/api/accounts/${accountId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        // Reload account to get updated primary/secondary
        const reload = await fetch(`/api/accounts/${accountId}`);
        const data = await reload.json();
        setAccount(data.account);
        setContacts(data.contacts || []);
      }
    } catch { /* handled by UI */ }
    setUpdatingRole(null);
  };

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

  const startEditAddress = () => {
    if (!account) return;
    setEditAddress({
      street: account.Billing_Street as string || '',
      city: account.Billing_City as string || '',
      state: account.Billing_State as string || '',
      code: account.Billing_Code as string || '',
      country: account.Billing_Country as string || '',
    });
    setEditingAddress(true);
  };

  const saveAddress = async () => {
    setSavingAddress(true);
    try {
      const res = await fetch(`/api/accounts/${accountId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          Billing_Street: editAddress.street,
          Billing_City: editAddress.city,
          Billing_State: editAddress.state,
          Billing_Code: editAddress.code,
          Billing_Country: editAddress.country,
        }),
      });
      if (res.ok) {
        const reload = await fetch(`/api/accounts/${accountId}`);
        const data = await reload.json();
        setAccount(data.account);
        setEditingAddress(false);
        registerDirty(SCOPE_ADDRESS, false);
      }
    } catch { /* handled */ }
    setSavingAddress(false);
  };

  // Unsaved-changes registration for the two batch forms on this page. The
  // inline-edit fields (reseller) register themselves from InlineEditField.
  const addressDirty = editingAddress && (
    editAddress.street !== (account?.Billing_Street as string || '')
    || editAddress.city !== (account?.Billing_City as string || '')
    || editAddress.state !== (account?.Billing_State as string || '')
    || editAddress.code !== (account?.Billing_Code as string || '')
    || editAddress.country !== (account?.Billing_Country as string || '')
  );
  const newContactDirty = showAddContact
    && Object.values(newContact).some(v => v.trim().length > 0);

  useEffect(() => {
    registerDirty(SCOPE_ADDRESS, addressDirty, 'the billing address');
    registerDirty(SCOPE_NEW_CONTACT, newContactDirty, 'the new contact');
    return () => {
      registerDirty(SCOPE_ADDRESS, false);
      registerDirty(SCOPE_NEW_CONTACT, false);
    };
  }, [registerDirty, addressDirty, newContactDirty]);

  /** The account's values for every field the form can write, in a stable order. */
  const savedFormValues = useMemo(() => ({
    street: (account?.Billing_Street as string) || '',
    city: (account?.Billing_City as string) || '',
    state: (account?.Billing_State as string) || '',
    code: (account?.Billing_Code as string) || '',
    reseller: (account?.Reseller as { id?: string })?.id || '',
    primary: (account?.Primary_Contact as { id?: string })?.id || '',
    secondary: (account?.Secondary_Contact as { id?: string })?.id || '',
  }), [account]);

  /** Every form field, in a stable order, for the pristine comparison. */
  const formState = useMemo(() => JSON.stringify([
    formStreet, formCity, formAddrState, formCode, formReseller, formPrimary, formSecondary,
  ]), [formStreet, formCity, formAddrState, formCode, formReseller, formPrimary, formSecondary]);

  /** Which account the form currently mirrors, so a direct hit on /edit populates once. */
  const populatedFor = useRef<string | null>(null);

  // Arriving straight at /accounts/[id]/edit means the record is still loading, so
  // the form is filled here rather than in a click handler.
  useEffect(() => {
    if (editing && account && populatedFor.current !== accountId) {
      setFormStreet(savedFormValues.street);
      setFormCity(savedFormValues.city);
      setFormAddrState(savedFormValues.state);
      setFormCode(savedFormValues.code);
      setFormReseller(savedFormValues.reseller);
      setFormPrimary(savedFormValues.primary);
      setFormSecondary(savedFormValues.secondary);
      setFormResellerSearch('');
      populatedFor.current = accountId;
      pristine.current = null;
      setSaveError(false);
    }
    if (!editing) populatedFor.current = null;
  }, [editing, account, accountId, savedFormValues]);

  // Runs on the render after the populate effect's batched updates land.
  useEffect(() => {
    if (editing && populatedFor.current === accountId && pristine.current === null) {
      pristine.current = formState;
    }
  }, [editing, accountId, formState]);

  // Only a changed form counts as unsaved work. Opening /edit and pressing Cancel
  // must not prompt. The inline-edit fields in view mode register themselves.
  useEffect(() => {
    const dirty = editing && pristine.current !== null && formState !== pristine.current;
    registerDirty(SCOPE_EDIT, dirty, 'this account');
    return () => registerDirty(SCOPE_EDIT, false);
  }, [registerDirty, editing, formState]);

  const handleEdit = () => router.push(buildPath('account-edit', accountId));

  const handleCancel = () => {
    setSaveError(false);
    router.push(buildPath('account-detail', accountId));
  };

  /** One PATCH with only the fields this user changed — and only fields their
   *  inline-edit permissions already allow them to write. */
  const handleSave = async () => {
    if (!accountId) return;
    setSaving(true);
    setSaveError(false);

    const changes: Record<string, unknown> = {};
    if (isAdmin) {
      if (formStreet !== savedFormValues.street) changes.Billing_Street = formStreet;
      if (formCity !== savedFormValues.city) changes.Billing_City = formCity;
      if (formAddrState !== savedFormValues.state) changes.Billing_State = formAddrState;
      if (formCode !== savedFormValues.code) changes.Billing_Code = formCode;
    }
    if (canEditReseller && formReseller !== savedFormValues.reseller) {
      changes.Reseller = formReseller || null;
    }
    if (formPrimary !== savedFormValues.primary) changes.Primary_Contact = formPrimary || null;
    if (formSecondary !== savedFormValues.secondary) changes.Secondary_Contact = formSecondary || null;

    // Nothing changed — no request, just leave the form.
    if (Object.keys(changes).length === 0) {
      setSaving(false);
      handleCancel();
      return;
    }

    try {
      const res = await fetch(`/api/accounts/${accountId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      });
      if (!res.ok) throw new Error('Save failed');

      const reload = await fetch(`/api/accounts/${accountId}`);
      const data = await reload.json();
      setAccount(data.account);
      setContacts(data.contacts || []);
      // Clear the scope before navigating, or the guard would prompt about work
      // that has just been saved.
      pristine.current = null;
      registerDirty(SCOPE_EDIT, false);
      router.push(buildPath('account-detail', accountId));
    } catch {
      setSaveError(true);
    }
    setSaving(false);
  };

  const crmLink = `https://crm.zoho.com.au/crm/org7002802215/tab/Accounts/${accountId}`;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={24} className="text-csa-accent animate-spin" />
      </div>
    );
  }

  if (!account) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <p className="text-text-muted">Account not found</p>
        <button onClick={goBack} className="text-csa-accent text-sm cursor-pointer">Back to Accounts</button>
      </div>
    );
  }

  const reseller = account.Reseller as { id?: string; name?: string } | null;
  const owner = account.Owner as { name?: string } | null;
  const primaryContact = account.Primary_Contact as { name?: string; id?: string } | null;
  const secondaryContact = account.Secondary_Contact as { name?: string; id?: string } | null;

  // Sort contacts: primary first, secondary second, then rest
  const sortedContacts = [...contacts].sort((a, b) => {
    const aId = a.id as string;
    const bId = b.id as string;
    const aIsPrimary = primaryContact?.id && aId === primaryContact.id;
    const bIsPrimary = primaryContact?.id && bId === primaryContact.id;
    const aIsSecondary = secondaryContact?.id && aId === secondaryContact.id;
    const bIsSecondary = secondaryContact?.id && bId === secondaryContact.id;
    if (aIsPrimary) return -1;
    if (bIsPrimary) return 1;
    if (aIsSecondary) return -1;
    if (bIsSecondary) return 1;
    return 0;
  });

  const contactSafePage = Math.min(contactPage, Math.max(1, Math.ceil(sortedContacts.length / contactPageSize)));
  const paginatedContacts = sortedContacts.slice((contactSafePage - 1) * contactPageSize, contactSafePage * contactPageSize);

  const formatDate = (d: unknown) => {
    if (!d || typeof d !== 'string') return '—';
    const date = new Date(d);
    return `${String(date.getDate()).padStart(2,'0')}/${String(date.getMonth()+1).padStart(2,'0')}/${date.getFullYear()}`;
  };

  // ─── EDIT MODE ───────────────────────────────────────────────────────

  if (editing) {
    const formResellerName = formReseller
      ? (resellerOptions.find(r => r.id === formReseller)?.name
        || (formReseller === savedFormValues.reseller ? reseller?.name || '' : ''))
      : '';
    const filteredResellers = formResellerSearch
      ? resellerOptions.filter(r => r.name.toLowerCase().includes(formResellerSearch.toLowerCase()))
      : resellerOptions;
    const contactOptions = sortedContacts.map(c => ({
      id: c.id as string,
      name: (c.Full_Name as string) || [c.First_Name, c.Last_Name].filter(Boolean).join(' '),
    }));

    return (
      <div className="h-full overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-text-primary">Edit Account</h1>
              <p className="text-sm text-text-muted mt-1">Editing {account.Account_Name as string}</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleCancel} className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-text-muted bg-surface-raised border border-border-subtle rounded-xl hover:bg-surface-overlay transition-colors cursor-pointer">
                <X size={14} /> Cancel
              </button>
              <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-success bg-success/10 border border-success/30 rounded-xl hover:bg-success/20 transition-colors cursor-pointer disabled:opacity-40">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>

          {saveError ? (
            <div className="flex items-center gap-2 text-xs text-error bg-error/10 border border-error/20 rounded-xl px-4 py-2.5 mb-6">
              Could not save this account. Please try again.
            </div>
          ) : null}

          {/* Account Details */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
            <h2 className="text-base font-bold text-text-primary mb-4 flex items-center gap-2">
              <Building2 size={16} className="text-csa-accent" />
              Account Details
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Account Name and Country are not writable by PATCH /api/accounts/[id],
                  so they are shown as they are rather than offered as inputs. */}
              <div>
                <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Account Name</label>
                <div className="bg-surface border-2 border-border-subtle px-4 py-2.5 text-sm text-text-secondary rounded-xl truncate">
                  {account.Account_Name as string}
                </div>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Country</label>
                <div className="bg-surface border-2 border-border-subtle px-4 py-2.5 text-sm text-text-secondary rounded-xl truncate">
                  {(account.Billing_Country as string) || '—'}
                </div>
              </div>

              {/* Reseller — admin/ibm, or users who can view child records */}
              {canEditReseller ? (
                <div className="md:col-span-2">
                  <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Reseller</label>
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                    <input
                      type="text"
                      value={formReseller ? formResellerName : formResellerSearch}
                      onChange={e => { setFormResellerSearch(e.target.value); setFormReseller(''); }}
                      onFocus={() => { if (formReseller) { setFormResellerSearch(formResellerName); setFormReseller(''); } fetchResellerOptions(); }}
                      placeholder="Search resellers..."
                      className="w-full bg-surface border-2 border-border-subtle pl-9 pr-4 py-2.5 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-xl"
                    />
                    {!formReseller && formResellerSearch ? (
                      <div className="absolute left-0 right-0 top-full mt-1 z-10 bg-csa-dark border border-border rounded-xl max-h-[200px] overflow-y-auto shadow-lg">
                        {filteredResellers.map(r => (
                          <button
                            key={r.id}
                            onClick={() => { setFormReseller(r.id); setFormResellerSearch(''); }}
                            className="w-full text-left px-3 py-2 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-raised transition-colors cursor-pointer"
                          >
                            {r.name}
                          </button>
                        ))}
                        {filteredResellers.length === 0 ? (
                          <div className="px-3 py-2 text-xs text-text-muted">No resellers found</div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  {savedFormValues.reseller && !formReseller && !formResellerSearch ? (
                    <p className="text-[10px] text-warning mt-1">Saving now removes the reseller from this account.</p>
                  ) : null}
                </div>
              ) : (
                <div className="md:col-span-2">
                  <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Reseller</label>
                  <div className="bg-surface border-2 border-border-subtle px-4 py-2.5 text-sm text-text-secondary rounded-xl truncate">
                    {reseller?.name || '—'}
                  </div>
                </div>
              )}
            </div>

            {/* Address — admin/ibm only, matching the inline address card */}
            {isAdmin ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
                <div className="md:col-span-2">
                  <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Street</label>
                  <input type="text" value={formStreet} onChange={e => setFormStreet(e.target.value)} placeholder="Street address"
                    className="w-full bg-surface border-2 border-border-subtle px-4 py-2.5 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-xl" />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">City</label>
                  <input type="text" value={formCity} onChange={e => setFormCity(e.target.value)} placeholder="City"
                    className="w-full bg-surface border-2 border-border-subtle px-4 py-2.5 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-xl" />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">State</label>
                    <input type="text" value={formAddrState} onChange={e => setFormAddrState(e.target.value)} placeholder="State"
                      className="w-full bg-surface border-2 border-border-subtle px-4 py-2.5 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-xl" />
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Post Code</label>
                    <input type="text" value={formCode} onChange={e => setFormCode(e.target.value)} placeholder="Code"
                      className="w-full bg-surface border-2 border-border-subtle px-4 py-2.5 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-xl" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-3">
                <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Address</label>
                <div className="bg-surface border-2 border-border-subtle px-4 py-2.5 text-sm text-text-secondary rounded-xl truncate">
                  {[account.Billing_Street, account.Billing_City, account.Billing_State, account.Billing_Code].filter(Boolean).join(', ') || '—'}
                </div>
              </div>
            )}
          </motion.div>

          {/* Contact Roles — same reach as the Primary/Secondary buttons in the contacts table */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
            <h2 className="text-base font-bold text-text-primary mb-4 flex items-center gap-2">
              <User size={16} className="text-csa-accent" />
              Contact Roles
            </h2>
            {contactOptions.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Primary Contact</label>
                  <div className="relative">
                    <select value={formPrimary} onChange={e => setFormPrimary(e.target.value)}
                      className="w-full bg-surface border-2 border-border-subtle px-4 py-2.5 text-sm text-text-primary outline-none focus:border-csa-accent rounded-xl appearance-none cursor-pointer pr-10">
                      <option value="">&mdash; None &mdash;</option>
                      {contactOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Secondary Contact</label>
                  <div className="relative">
                    <select value={formSecondary} onChange={e => setFormSecondary(e.target.value)}
                      className="w-full bg-surface border-2 border-border-subtle px-4 py-2.5 text-sm text-text-primary outline-none focus:border-csa-accent rounded-xl appearance-none cursor-pointer pr-10">
                      <option value="">&mdash; None &mdash;</option>
                      {contactOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-text-muted">This account has no contacts to assign.</p>
            )}
          </motion.div>
        </div>
      </div>
    );
  }

  // ─── VIEW MODE ───────────────────────────────────────────────────────

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button onClick={goBack} className="w-9 h-9 flex-shrink-0 flex items-center justify-center bg-surface-raised rounded-xl hover:bg-surface-overlay transition-colors cursor-pointer">
            <ArrowLeft size={18} className="text-text-secondary" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-text-primary truncate" title={account.Account_Name as string}>{account.Account_Name as string}</h1>
            <p className="text-sm text-text-muted truncate">{account.Email_Domain as string || ''}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {user?.permissions?.canExportData && (
              <button
                onClick={() => exportFullAccount(account, contacts, invoices, activeAssets, archivedAssets, primaryContact?.id, secondaryContact?.id)}
                className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-success bg-success/10 border border-success/30 rounded-xl hover:bg-success/20 transition-colors cursor-pointer"
              >
                <Download size={14} />
                Export All
              </button>
            )}
            <button onClick={handleEdit} className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-csa-accent bg-csa-accent/10 border border-csa-accent/30 rounded-xl hover:bg-csa-accent/20 transition-colors cursor-pointer">
              <Pencil size={14} />
              Edit
            </button>
            <a href={crmLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-csa-accent bg-csa-accent/10 border border-csa-accent/30 rounded-xl hover:bg-csa-accent/20 transition-colors cursor-pointer">
              <ExternalLink size={14} />
              Open in CRM
            </a>
          </div>
        </div>

        {/* Account Info */}
        <InlineEditFieldProvider>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          <InfoCard label="Country" value={account.Billing_Country as string} icon={<MapPin size={14} />} />

          <InlineEditField
            fieldId="reseller"
            label="Reseller"
            icon={<Building2 size={14} />}
            value={reseller?.id || ''}
            displayValue={reseller?.name || '\u2014'}
            type="lookup"
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
            }}
          />

          <InfoCard label="CSA Sales Rep" value={owner?.name || '—'} icon={<User size={14} />} />
          <InfoCard label="Primary Contact" value={primaryContact?.name || '—'} icon={<User size={14} />} />
          <InfoCard label="Secondary Contact" value={secondaryContact?.name || '—'} icon={<User size={14} />} />
          <InfoCard label="Email Domain" value={account.Email_Domain as string || '—'} icon={<Mail size={14} />} />

          {/* Address — composite field, opens existing inline form on click */}
          {editingAddress ? (
            <div className="bg-success/10 border border-success/40 rounded-xl px-4 py-3 col-span-1 md:col-span-2 lg:col-span-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-success uppercase tracking-wider">
                  <MapPin size={14} />
                  Edit Address
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setEditingAddress(false)} className="p-1 text-text-muted hover:text-text-primary transition-colors cursor-pointer"><X size={14} /></button>
                  <button onClick={saveAddress} disabled={savingAddress} className="p-1 text-success hover:text-success/80 transition-colors cursor-pointer disabled:opacity-50">
                    {savingAddress ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
                <input type="text" placeholder="Street" value={editAddress.street} onChange={e => setEditAddress(p => ({ ...p, street: e.target.value }))}
                  className="col-span-2 bg-csa-dark border border-border-subtle px-3 py-1.5 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-lg" />
                <input type="text" placeholder="City" value={editAddress.city} onChange={e => setEditAddress(p => ({ ...p, city: e.target.value }))}
                  className="bg-csa-dark border border-border-subtle px-3 py-1.5 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-lg" />
                <input type="text" placeholder="State" value={editAddress.state} onChange={e => setEditAddress(p => ({ ...p, state: e.target.value }))}
                  className="bg-csa-dark border border-border-subtle px-3 py-1.5 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-lg" />
                <input type="text" placeholder="Post Code" value={editAddress.code} onChange={e => setEditAddress(p => ({ ...p, code: e.target.value }))}
                  className="bg-csa-dark border border-border-subtle px-3 py-1.5 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-lg" />
              </div>
            </div>
          ) : (
            <div
              onClick={isAdmin ? startEditAddress : undefined}
              className={`bg-surface border border-border-subtle rounded-xl px-4 py-3 group relative transition-colors ${isAdmin ? 'cursor-pointer hover:border-csa-accent/40' : ''}`}
            >
              <div className="flex items-center gap-1.5 text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">
                <MapPin size={14} />
                Address
              </div>
              <p className="text-sm text-text-primary truncate">
                {[account.Billing_Street, account.Billing_City, account.Billing_State, account.Billing_Code].filter(Boolean).join(', ') || '\u2014'}
              </p>
              {(account.Billing_Street || account.Billing_City || account.Billing_State || account.Billing_Code) ? (
                <div className="absolute left-0 top-full mt-1 z-10 bg-csa-dark border border-border rounded-xl px-4 py-3 shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity w-max max-w-xs">
                  {account.Billing_Street ? <div className="text-xs text-text-secondary mb-1"><span className="text-text-muted">Street:</span> {account.Billing_Street as string}</div> : null}
                  {account.Billing_City ? <div className="text-xs text-text-secondary mb-1"><span className="text-text-muted">City:</span> {account.Billing_City as string}</div> : null}
                  {account.Billing_State ? <div className="text-xs text-text-secondary mb-1"><span className="text-text-muted">State:</span> {account.Billing_State as string}</div> : null}
                  {account.Billing_Code ? <div className="text-xs text-text-secondary"><span className="text-text-muted">Post Code:</span> {account.Billing_Code as string}</div> : null}
                </div>
              ) : null}
            </div>
          )}
        </motion.div>
        </InlineEditFieldProvider>

        {/* Contacts */}
        <motion.div data-tour="account-contacts" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
              <User size={18} className="text-csa-accent" />
              Contacts ({contacts.length})
            </h2>
            <div className="flex items-center gap-2">
              {contacts.length > 0 && user?.permissions?.canExportData ? (
                <button onClick={() => exportContacts(contacts, account.Account_Name as string, primaryContact?.id, secondaryContact?.id)} className="p-1.5 text-text-muted hover:text-success transition-colors cursor-pointer" title="Export Contacts">
                  <Download size={14} />
                </button>
              ) : null}
              {!showAddContact ? (
                <button
                  data-tour="account-add-contact"
                  onClick={() => setShowAddContact(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-csa-accent bg-csa-accent/10 border border-csa-accent/30 rounded-xl hover:bg-csa-accent/20 transition-colors cursor-pointer"
                >
                  <Plus size={13} />
                  Add Contact
                </button>
              ) : null}
            </div>
          </div>

          {/* Add Contact Form */}
          {showAddContact ? (
            <div className="bg-surface border border-csa-accent/30 rounded-xl p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-text-primary">New Contact</span>
                <button onClick={() => { setShowAddContact(false); setNewContact({ First_Name: '', Last_Name: '', Email: '', Phone: '' }); }} className="p-1 text-text-muted hover:text-text-primary transition-colors cursor-pointer">
                  <X size={16} />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <input
                  type="text"
                  placeholder="First Name *"
                  value={newContact.First_Name}
                  onChange={(e) => setNewContact(p => ({ ...p, First_Name: e.target.value }))}
                  className="bg-csa-dark border border-border-subtle px-3 py-2 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-lg"
                />
                <input
                  type="text"
                  placeholder="Last Name *"
                  value={newContact.Last_Name}
                  onChange={(e) => setNewContact(p => ({ ...p, Last_Name: e.target.value }))}
                  className="bg-csa-dark border border-border-subtle px-3 py-2 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-lg"
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={newContact.Email}
                  onChange={(e) => setNewContact(p => ({ ...p, Email: e.target.value }))}
                  className="bg-csa-dark border border-border-subtle px-3 py-2 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-lg"
                />
                <input
                  type="tel"
                  placeholder="Phone"
                  value={newContact.Phone}
                  onChange={(e) => setNewContact(p => ({ ...p, Phone: e.target.value }))}
                  className="bg-csa-dark border border-border-subtle px-3 py-2 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-lg"
                />
              </div>
              <button
                onClick={handleAddContact}
                disabled={addingContact || !newContact.First_Name || !newContact.Last_Name}
                className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-success bg-success/10 border border-success/30 rounded-xl hover:bg-success/20 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {addingContact ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {addingContact ? 'Creating...' : 'Create Contact'}
              </button>
            </div>
          ) : null}

          {sortedContacts.length > 0 ? (
            <>
              <div className="border border-border-subtle rounded-xl overflow-x-auto">
                <table className="w-full min-w-[560px]">
                  <thead><tr className="bg-surface-raised">
                    <th>Name</th><th>Email</th><th>Phone</th><th>Title</th><th>Set As</th>
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
                              {isPrimary ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold uppercase rounded bg-warning/20 text-warning">
                                  <Star size={9} />
                                  Primary
                                </span>
                              ) : null}
                              {isSecondary ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold uppercase rounded bg-csa-accent/20 text-csa-accent">
                                  <Star size={9} />
                                  Secondary
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td><span className="flex items-center gap-1 text-text-secondary"><Mail size={12} className="text-text-muted" />{c.Email as string || '\u2014'}</span></td>
                          <td><span className="flex items-center gap-1 text-text-secondary"><Phone size={12} className="text-text-muted" />{c.Phone as string || '\u2014'}</span></td>
                          <td className="text-text-muted">{c.Title as string || '\u2014'}</td>
                          <td>
                            <div className="flex items-center gap-1">
                              {!isPrimary ? (
                                <button
                                  onClick={() => setContactRole(cId, 'primary')}
                                  disabled={updatingRole === cId + 'primary'}
                                  className="px-2 py-0.5 text-[10px] font-semibold text-warning/70 hover:text-warning hover:bg-warning/10 rounded transition-colors cursor-pointer disabled:opacity-40"
                                >
                                  {updatingRole === cId + 'primary' ? '...' : 'Primary'}
                                </button>
                              ) : null}
                              {!isSecondary ? (
                                <button
                                  onClick={() => setContactRole(cId, 'secondary')}
                                  disabled={updatingRole === cId + 'secondary'}
                                  className="px-2 py-0.5 text-[10px] font-semibold text-csa-accent/70 hover:text-csa-accent hover:bg-csa-accent/10 rounded transition-colors cursor-pointer disabled:opacity-40"
                                >
                                  {updatingRole === cId + 'secondary' ? '...' : 'Secondary'}
                                </button>
                              ) : null}
                            </div>
                          </td>
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

        {/* Invoices */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} data-tour="account-orders" className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
              <FileText size={18} className="text-csa-purple" />
              Orders ({invoices.length})
            </h2>
            <div className="flex items-center gap-2">
              {invoices.length > 0 && user?.permissions?.canExportData ? (
                <button onClick={() => exportInvoices(invoices, account.Account_Name as string)} className="p-1.5 text-text-muted hover:text-success transition-colors cursor-pointer" title="Export Orders">
                  <Download size={14} />
                </button>
              ) : null}
              <button
                onClick={() => {
                  setNewInvoiceContext({
                    account: { name: account.Account_Name as string, id: accountId },
                  contact: primaryContact ? { name: primaryContact.name, id: primaryContact.id } : null,
                  reseller: reseller ? { name: reseller.name, id: (account.Reseller as { id?: string })?.id } : null,
                  region: (account.Reseller_Region as string) || '',
                  currency: (account.Currency as string) || '',
                  owner: owner ? { name: owner.name, id: (account.Owner as { id?: string })?.id } : null,
                  billingCountry: account.Billing_Country as string || '',
                });
                router.push(buildPath('create-invoice'));
              }}
              data-tour="new-order-button"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-csa-accent bg-csa-accent/10 border border-csa-accent/30 rounded-xl hover:bg-csa-accent/20 transition-colors cursor-pointer"
            >
              <Plus size={13} />
              New Product Order
              </button>
            </div>
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
                            inv.Invoice_Type === 'Renewal'
                              ? 'bg-csa-purple/20 text-csa-purple'
                              : 'bg-csa-accent/20 text-csa-accent'
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
                        <td>
                          <ExternalLink size={14} className="text-text-muted" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-text-muted py-4">No orders found</p>
          )}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <EmailHistory module="Contacts" contactIds={contacts.map(c => c.id as string)} />
        </motion.div>

        {/* Evaluations */}
        <motion.div data-tour="account-evaluations" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }} className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
              <Beaker size={18} className="text-success" />
              Evaluations ({evaluationAssets.length})
            </h2>
            {user?.permissions?.canCreateEvaluations && (
              <button
                onClick={() => setShowEvalModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-success bg-success/10 border border-success/30 rounded-xl hover:bg-success/20 transition-colors cursor-pointer"
              >
                <Beaker size={13} />
                Create Evaluation
              </button>
            )}
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
                        <td className="text-text-primary">
                          {product?.name || a.Name as string}
                          <AssetSubscriptionBadges asset={a} />
                        </td>
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
                          <button onClick={() => setViewingAsset(a)} className="p-1 text-text-muted hover:text-csa-accent transition-colors cursor-pointer">
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
            <p className="text-sm text-text-muted py-4">No evaluations</p>
          )}
        </motion.div>
        {/* Active Assets */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} data-tour="account-assets" className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
                <Package size={18} className="text-success" />
                Active Assets ({activeAssets.length})
              </h2>
              {(activeAssets.length > 0 || archivedAssets.length > 0) && user?.permissions?.canExportData ? (
                <button onClick={() => exportAssets(activeAssets, archivedAssets, account.Account_Name as string)} className="p-1.5 text-text-muted hover:text-success transition-colors cursor-pointer" title="Export Assets">
                  <Download size={14} />
                </button>
              ) : null}
            </div>
            {selectedAssets.size === 0 && user?.permissions?.canMonthlySubscriptions ? (
              <div className="flex items-center gap-2">
                {monthlySubscriptions.length > 0 && (
                  <button
                    onClick={() => setRenewingSubscriptions(monthlySubscriptions)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-csa-accent bg-csa-accent/10 border border-csa-accent/30 rounded-xl hover:bg-csa-accent/20 transition-colors cursor-pointer"
                  >
                    <RefreshCw size={13} />
                    Renew Monthly ({monthlySubscriptions.length})
                  </button>
                )}
                <button
                  data-tour="account-new-subscription"
                  onClick={() => setShowSubscriptionModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-csa-accent bg-csa-accent/10 border border-csa-accent/30 rounded-xl hover:bg-csa-accent/20 transition-colors cursor-pointer"
                >
                  <CalendarClock size={13} />
                  Create Monthly Subscription
                </button>
              </div>
            ) : null}
            {selectedAssets.size > 0 ? (
              <div className="flex items-center gap-2">
                <div className="relative group">
                  <button
                    onClick={generateRenewal}
                    disabled={generatingRenewal || sendingKeys || renewalBlocked}
                    className="flex items-center gap-2 px-4 py-1.5 text-xs font-semibold text-csa-purple bg-csa-purple/10 border border-csa-purple/30 rounded-xl hover:bg-csa-purple/20 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {generatingRenewal ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    {generatingRenewal ? 'Generating...' : `Generate Renewal (${selectedAssets.size})`}
                  </button>
                  {renewalBlocked && (
                    <div className="absolute left-0 top-full mt-1.5 z-20 bg-csa-dark border border-border rounded-xl px-3 py-2 shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity w-72">
                      <p className="text-[10px] font-semibold text-warning mb-1">Cannot generate renewal:</p>
                      {renewalBlockReasons.map((r, i) => (
                        <p key={i} className="text-[10px] text-text-secondary leading-relaxed">&#x2022; {r}</p>
                      ))}
                      <p className="text-[10px] text-text-muted mt-1">Deselect ineligible assets to enable renewals.</p>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setSendKeysConfirm('reseller')}
                  disabled={sendingKeys || generatingRenewal}
                  className="flex items-center gap-2 px-4 py-1.5 text-xs font-semibold text-csa-accent bg-csa-accent/10 border border-csa-accent/30 rounded-xl hover:bg-csa-accent/20 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Send size={13} /> Send Keys to Reseller
                </button>
                <button
                  onClick={() => setSendKeysConfirm('customer')}
                  disabled={sendingKeys || generatingRenewal}
                  className="flex items-center gap-2 px-4 py-1.5 text-xs font-semibold text-warning bg-warning/10 border border-warning/30 rounded-xl hover:bg-warning/20 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Send size={13} /> Send Keys to Customer
                </button>
              </div>
            ) : null}
          </div>
          {activeAssets.length > 0 ? (
            <>
            <div className="border border-border-subtle rounded-xl overflow-x-auto">
              <table className="w-full min-w-[800px]">
                <thead><tr className="bg-surface-raised">
                  <th className="w-10">
                    <input
                      type="checkbox"
                      checked={selectedAssets.size === allAssetIds.length && allAssetIds.length > 0}
                      onChange={toggleAllAssets}
                      className="w-4 h-4 rounded border-border-subtle accent-csa-purple cursor-pointer"
                    />
                  </th>
                  <th>Product</th><th>Qty</th><th>Start</th><th>Renewal</th><th>Serial Key</th><th>Upgraded To</th><th className="w-10"></th>
                </tr></thead>
                <tbody>
                  {activeAssets.slice((activeAssetPage - 1) * assetPageSize, activeAssetPage * assetPageSize).map((a) => {
                    const product = a.Product as { name?: string } | null;
                    const assetId = a.id as string;
                    const isSelected = selectedAssets.has(assetId);
                    const upgradedTo = a.Upgraded_To_Key as string | null;
                    return (
                      <tr
                        key={assetId}
                        onClick={() => toggleAsset(assetId)}
                        className={`transition-colors cursor-pointer ${isSelected ? 'bg-csa-purple/8' : 'hover:bg-csa-accent/5'}`}
                      >
                        <td>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleAsset(assetId)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-4 h-4 rounded border-border-subtle accent-csa-purple cursor-pointer"
                          />
                        </td>
                        <td className="text-text-primary">
                          {product?.name || a.Name as string}
                          <AssetSubscriptionBadges asset={a} />
                        </td>
                        <td className="text-text-secondary">{a.Quantity as number}</td>
                        <td className="text-text-secondary">{formatDate(a.Start_Date)}</td>
                        <td className="text-text-secondary">{formatDate(a.Renewal_Date)}</td>
                        <td className="text-text-muted text-xs font-mono">{a.Serial_Key as string || '\u2014'}</td>
                        <td className="text-text-muted text-xs font-mono">{upgradedTo || '\u2014'}</td>
                        <td>
                          <button
                            onClick={(e) => { e.stopPropagation(); setViewingAsset(a); }}
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
            <div className="mt-2">
              <Pagination currentPage={Math.min(activeAssetPage, Math.max(1, Math.ceil(activeAssets.length / assetPageSize)))} totalItems={activeAssets.length} pageSize={assetPageSize} onPageChange={setActiveAssetPage} />
            </div>
            </>
          ) : (
            <p className="text-sm text-text-muted py-4">No active assets</p>
          )}
        </motion.div>

        {/* Archived Assets */}
        {archivedAssets.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
            <h2 className="text-lg font-bold text-text-primary mb-3 flex items-center gap-2">
              <Package size={18} className="text-text-muted" />
              Archived Assets ({archivedAssets.length})
            </h2>
            <div className="border border-border-subtle rounded-xl overflow-x-auto opacity-70">
              <table className="w-full min-w-[800px]">
                <thead><tr className="bg-surface-raised">
                  <th className="w-10">
                    <input
                      type="checkbox"
                      checked={archivedAssets.length > 0 && archivedAssets.every(a => selectedAssets.has(a.id as string))}
                      onChange={() => {
                        const archivedIds = archivedAssets.map(a => a.id as string);
                        const allSelected = archivedIds.every(id => selectedAssets.has(id));
                        const next = new Set(selectedAssets);
                        if (allSelected) { archivedIds.forEach(id => next.delete(id)); }
                        else { archivedIds.forEach(id => next.add(id)); }
                        setSelectedAssets(next);
                      }}
                      className="w-4 h-4 rounded border-border-subtle accent-csa-purple cursor-pointer"
                    />
                  </th><th>Product</th><th>Qty</th><th>Start</th><th>Renewal</th><th>Status</th><th>Upgraded To</th><th className="w-10"></th>
                </tr></thead>
                <tbody>
                  {archivedAssets.slice((archivedAssetPage - 1) * assetPageSize, archivedAssetPage * assetPageSize).map((a) => {
                    const product = a.Product as { name?: string } | null;
                    const assetId = a.id as string;
                    const upgradedTo = a.Upgraded_To_Key as string | null;
                    const isSelected = selectedAssets.has(assetId);
                    return (
                      <tr
                        key={assetId}
                        onClick={() => toggleAsset(assetId)}
                        className={`transition-colors cursor-pointer ${isSelected ? 'bg-csa-purple/8' : 'hover:bg-csa-accent/5'}`}
                      >
                        <td>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleAsset(assetId)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-4 h-4 rounded border-border-subtle accent-csa-purple cursor-pointer"
                          />
                        </td>
                        <td className="text-text-secondary">{product?.name || a.Name as string}</td>
                        <td className="text-text-muted">{a.Quantity as number}</td>
                        <td className="text-text-muted">{formatDate(a.Start_Date)}</td>
                        <td className="text-text-muted">{formatDate(a.Renewal_Date)}</td>
                        <td className="text-text-muted">{a.Status as string}</td>
                        <td className="text-text-muted text-xs font-mono">{upgradedTo || '\u2014'}</td>
                        <td>
                          <button
                            onClick={(e) => { e.stopPropagation(); setViewingAsset(a); }}
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
            <div className="mt-2">
              <Pagination currentPage={Math.min(archivedAssetPage, Math.max(1, Math.ceil(archivedAssets.length / assetPageSize)))} totalItems={archivedAssets.length} pageSize={assetPageSize} onPageChange={setArchivedAssetPage} />
            </div>
          </motion.div>
        )}
      </div>

      {/* Asset Detail Modal */}
      {viewingAsset ? (
        <AssetDetailModal
          assetId={viewingAsset.id as string}
          assetData={viewingAsset}
          onClose={() => setViewingAsset(null)}
          onAssetUpdated={() => {
            // Reload account data to refresh assets
            fetch(`/api/accounts/${accountId}`)
              .then(res => res.json())
              .then(data => {
                setAccount(data.account);
                setEvaluationAssets(data.evaluationAssets || []);
                setActiveAssets(data.activeAssets || []);
                setArchivedAssets(data.archivedAssets || []);
              })
              .catch(() => {});
          }}
        />
      ) : null}

      {/* Create Evaluation Modal */}
      {showEvalModal && account && (
        <CreateEvaluationModal
          accountId={accountId}
          accountName={account.Account_Name as string}
          canExtend={user?.permissions?.canExtendEvaluations ?? false}
          onSuccess={() => {
            setShowEvalModal(false);
            // Reload to show new asset
            fetch(`/api/accounts/${accountId}`)
              .then(res => res.json())
              .then(data => {
                setActiveAssets(data.activeAssets || []);
                setArchivedAssets(data.archivedAssets || []);
              })
              .catch(() => {});
          }}
          onClose={() => setShowEvalModal(false)}
        />
      )}

      {/* Create Monthly Subscription Modal */}
      {showSubscriptionModal && account && (
        <CreateMonthlySubscriptionModal
          accountId={accountId}
          accountName={account.Account_Name as string}
          onSuccess={(assetIds, warning) => {
            setShowSubscriptionModal(false);
            setActionNotice(
              warning ||
                `${assetIds.length} monthly ${assetIds.length === 1 ? 'subscription' : 'subscriptions'} created.`
            );
            // Reload before scrolling: the new licences are what they are being
            // sent to look at, and scrolling to a stale table is worse than not
            // scrolling at all.
            fetch(`/api/accounts/${accountId}`)
              .then(res => res.json())
              .then(data => {
                setActiveAssets(data.activeAssets || []);
                setArchivedAssets(data.archivedAssets || []);
                // A frame for the table to render its new rows.
                requestAnimationFrame(() => {
                  document
                    .querySelector('[data-tour="account-assets"]')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                });
              })
              .catch(() => {});
          }}
          onClose={() => setShowSubscriptionModal(false)}
        />
      )}

      {/* Renew Monthly Subscriptions Modal */}
      {renewingSubscriptions && (
        <RenewMonthlySubscriptionsModal
          subscriptions={renewingSubscriptions}
          onDone={(renewedIds, failures) => {
            setRenewingSubscriptions(null);
            setActionNotice(
              failures.length === 0
                ? `Renewed ${renewedIds.length} monthly ${renewedIds.length === 1 ? 'subscription' : 'subscriptions'}.`
                : `Renewed ${renewedIds.length}, ${failures.length} failed: ${failures.map(f => f.reason).join('; ')}`
            );
            fetch(`/api/accounts/${accountId}`)
              .then(res => res.json())
              .then(data => {
                setActiveAssets(data.activeAssets || []);
                setArchivedAssets(data.archivedAssets || []);
              })
              .catch(() => {});
          }}
          onClose={() => setRenewingSubscriptions(null)}
        />
      )}

      {/* Subscription result banner */}
      {actionNotice && (
        <div className="fixed bottom-6 right-20 z-50 max-w-sm bg-csa-dark border border-csa-accent/40 rounded-xl px-4 py-3 shadow-lg">
          <div className="flex items-start gap-3">
            <p className="text-xs text-text-primary flex-1">{actionNotice}</p>
            <button onClick={() => setActionNotice('')} className="text-text-muted hover:text-text-primary cursor-pointer">
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Send Keys Confirmation Dialog */}
      <AnimatePresence>
        {sendKeysConfirm && (
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

function InfoCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border-subtle rounded-xl px-4 py-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">
        {icon}
        {label}
      </div>
      <p className="text-sm text-text-primary truncate" title={value || undefined}>{value || '—'}</p>
    </div>
  );
}
