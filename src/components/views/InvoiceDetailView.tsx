'use client';

/**
 * InvoiceDetailView — Orchestrator for the invoice detail page.
 *
 * Manages all shared state (invoice data, edit mode, line items, PO, coupon)
 * and delegates rendering to focused sub-components:
 *   - InvoiceHeader:       Back button, badges, action buttons
 *   - InvoiceLineItems:    Line items table with edit support
 *   - InvoicePurchaseOrder: PO number + file upload
 *   - InvoiceSendTo:       Reseller vs Customer toggle
 *   - InvoiceCoupon:       Coupon code entry and validation
 *
 * The small InfoCard and TotalRow helpers remain here since they're
 * lightweight and only used in this component. Editable fields use the
 * shared InlineEditField component.
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Building2,
  User,
  Calendar,
  DollarSign,
  Globe,
  Loader2,
  MapPin,
  Send,
  Save,
  X,
  FileText,
  ChevronDown,
  CheckCircle2,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { buildPath } from '@/lib/routes';
import { recipientSentence } from '@/lib/order-recipients';
import type { OrderAttachment } from '../invoice/InvoicePurchaseOrder';
import { useTrackRecentItem } from '@/lib/useRecentItems';
import { useGuardedRouter } from '@/lib/useGuardedRouter';
import { useUnsavedChanges } from '@/components/UnsavedChangesProvider';
import { GuardedLink } from '@/components/GuardedLink';
import SKUBuilder from '../SKUBuilder';
import InvoiceHeader from '../invoice/InvoiceHeader';
import InvoiceLineItems from '../invoice/InvoiceLineItems';
import InvoicePurchaseOrder from '../invoice/InvoicePurchaseOrder';
import InvoiceSendTo from '../invoice/InvoiceSendTo';
import InvoiceCoupon from '../invoice/InvoiceCoupon';
import InvoicePayment from '../invoice/InvoicePayment';
import OrderActions from '../invoice/OrderActions';
import { InlineEditField, InlineEditFieldProvider } from '../InlineEditField';

/** Scope ids for the batch edit states registered with the dirty registry. */
const SCOPE_LINE_ITEMS = 'invoice-detail:line-items';
const SCOPE_PO = 'invoice-detail:purchase-order';
const SCOPE_COUPON = 'invoice-detail:coupon';
/** Scope id for the full-page edit form at /orders/[id]/edit. */
const SCOPE_EDIT = 'invoice-detail:edit';

/** Statuses the portal writes. The route permission-checks `Approved`. */
const STATUS_OPTIONS = ['Draft', 'Approved', 'Sent'];

/** Mirrors the local `CURRENCIES` const in CreateInvoiceView — that one is not
 *  exported, so the list is duplicated here. Worth factoring into one shared
 *  const if a third view ever needs it. */
const CURRENCIES = ['AUD', 'USD', 'EUR', 'GBP', 'INR', 'NZD'];

/**
 * Line items keyed for comparison, with the edit-only `_originalPrice`
 * bookkeeping field dropped — it is added on entering edit mode and would
 * otherwise make a untouched form look dirty. `_deleted` / `_isNew` are kept,
 * since those *are* unsaved edits.
 */
function lineItemFingerprint(items: Record<string, unknown>[]): string {
  return JSON.stringify(items.map(li => {
    const copy = { ...li };
    delete copy._originalPrice;
    return copy;
  }));
}

/**
 * Maps the edit-mode line items onto the `Invoiced_Items` subform payload Zoho
 * accepts. Extracted so the batch line-item edit and the full edit form send
 * exactly the same shape — there is one line-item editing model, not two.
 */
function buildInvoicedItemsPayload(items: Record<string, unknown>[]): Record<string, unknown>[] {
  return items.map(li => {
    const isExisting = !!li.id;

    // Deleted existing items — tell Zoho to remove them
    if (li._deleted && isExisting) {
      return { id: li.id, _delete: true };
    }

    // Skip deleted new items (shouldn't exist, but safety)
    if (li._deleted) return null;

    const priceChanged = li._originalPrice !== li.List_Price;
    const product = li.Product_Name as { id?: string } | null;

    const cleaned: Record<string, unknown> = {};
    if (isExisting) cleaned.id = li.id;
    // Only send Product_Name for NEW items
    if (!isExisting && product?.id) cleaned.Product_Name = { id: product.id };
    cleaned.Quantity = li.Quantity;
    cleaned.List_Price = li.List_Price;
    cleaned.Contract_Term_Years = priceChanged ? 0 : (li.Contract_Term_Years ?? 1);
    if (li.Start_Date) cleaned.Start_Date = li.Start_Date;
    if (li.Renewal_Date) cleaned.Renewal_Date = li.Renewal_Date;
    if (li.Description !== undefined) cleaned.Description = li.Description;
    if (li.Asset_Code) cleaned.Asset_Code = li.Asset_Code;
    if (li.Align_to) cleaned.Align_to = li.Align_to;

    return cleaned;
  }).filter(Boolean) as Record<string, unknown>[];
}

export default function InvoiceDetailView({
  invoiceId,
  mode = 'view',
}: {
  invoiceId: string;
  /** `edit` renders the full form. Driven by the route, not local state, so the
   *  form is linkable, survives a refresh, and is exited with the Back button. */
  mode?: 'view' | 'edit';
}) {
  const { user } = useAppStore();
  const router = useGuardedRouter();
  const { registerDirty } = useUnsavedChanges();
  const [invoice, setInvoice] = useState<Record<string, unknown> | null>(null);
  const [lineItems, setLineItems] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit mode — only line items are edited via this mode now. Dates and
  // currency use the inline-edit fields and save independently.
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editLineItems, setEditLineItems] = useState<Record<string, unknown>[]>([]);
  const [skuBuilderIndex, setSkuBuilderIndex] = useState<number | null>(null);
  const [updatingDirectPurchase, setUpdatingDirectPurchase] = useState(false);

  // Coupon
  const [couponCode, setCouponCode] = useState('');
  const [couponValidating, setCouponValidating] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponApplied, setCouponApplied] = useState<string | null>(null);

  // Payment refresh (delayed reload after save to wait for Stripe link generation)
  const [paymentRefreshing, setPaymentRefreshing] = useState(false);

  // Reseller pricing — originalListPrices stores the FULL list prices keyed by line item id
  // so we can toggle between reseller/customer pricing without losing the base price
  const [resellerPercentage, setResellerPercentage] = useState<number | null>(null);
  const [originalListPrices, setOriginalListPrices] = useState<Record<string, number>>({});

  // Reseller payment method flags (from Zoho Resellers module)
  /**
   * The partner's payment methods.
   *
   * These were `canPurchaseOnAccount` and `canPurchaseOnCredit`, which is a
   * trap: "on credit" held the card flag, and account terms *are* credit. Named
   * for the buttons they turn on instead.
   */
  const [payOnAccount, setPayOnAccount] = useState(false);
  const [payOnCard, setPayOnCard] = useState(false);

  // PO
  const [editingPO, setEditingPO] = useState(false);
  const [editPONumber, setEditPONumber] = useState('');
  const [savingPO, setSavingPO] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadResult, setUploadResult] = useState<string | null>(null);
  /** Documents already on this order in the CRM, fetched with the order. */
  const [attachments, setAttachments] = useState<OrderAttachment[]>([]);

  // Full-page edit form (/orders/[id]/edit) — URL-driven, never local state.
  const formEditing = mode === 'edit';
  /** Serialised form state as it was when the record finished loading, so "dirty"
   *  means the user changed something rather than merely opening the edit URL. */
  const pristine = useRef<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formInvoiceDate, setFormInvoiceDate] = useState('');
  const [formDueDate, setFormDueDate] = useState('');
  const [formPO, setFormPO] = useState('');
  const [formStatus, setFormStatus] = useState('');
  const [formCurrency, setFormCurrency] = useState('');

  // Approve / Send. `pendingAction` is the one awaiting confirmation,
  // `actionRunning` the one in flight — both approve and send are irreversible
  // and fire customer-facing email, so neither happens on a single click.
  const [pendingAction, setPendingAction] = useState<'approve' | 'send' | null>(null);
  const [actionRunning, setActionRunning] = useState<'approve' | 'send' | null>(null);
  const [actionError, setActionError] = useState('');
  const [actionNotice, setActionNotice] = useState('');

  // Derived permission flags
  const isEditor = user?.role === 'admin' || user?.role === 'ibm';
  // Locked at Approved, matching the route. Both used to stop at Draft, which
  // meant an order sent for payment could not have its PO number corrected —
  // and correcting it is exactly what somebody does between sending an invoice
  // and being paid for it.
  const canEdit = isEditor && invoice?.Status !== 'Approved';
  const isRenewal = invoice?.Invoice_Type === 'Renewal';
  /** PO is editable by any role until the order is approved. */
  const canEditPO = invoice?.Status !== 'Approved';
  /**
   * Setting a status by hand is CSA's, like the Approve button in the header.
   *
   * It was open to anyone with canApproveInvoices, which made the dropdown a
   * third route to Approved that skipped the purchase order and the account
   * terms check. The route refuses that now, so leaving the control in place
   * would only offer a partner an option that fails. Their route is Process
   * Order, which asks for what it needs first.
   */
  const canEditStatus = isEditor;
  /**
   * Whether OrderActions will render a button.
   *
   * Mirrors its own visibility rules so the tutorial's anchor can be dropped
   * when the panel would be empty. Kept here beside the other derived flags
   * rather than inline, where it read as three nested conditions.
   */
  /**
   * Whether a partner may commit an order on account terms.
   *
   * Not `canApproveInvoices`: that resolves to the user role AND the reseller
   * role, and every partner-side user role sets its half to false, so no
   * partner can ever hold it and the button never appeared. Account terms are
   * the arrangement that grants this; a read-only user still may not use it.
   */
  const canProcessOnAccount = payOnAccount && user?.role !== 'viewer';

  const hasOrderActions =
    (invoice?.Status === 'Draft' || invoice?.Status === 'Sent') &&
    ((payOnCard && !!user?.permissions?.canSendInvoices) || canProcessOnAccount);

  // -------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------

  useEffect(() => {
    if (!invoiceId) return;
    setLoading(true);
    setEditing(false);

    fetch(`/api/invoices/${invoiceId}`)
      .then(res => res.json())
      .then(data => {
        setInvoice(data.invoice);
        setLineItems(data.lineItems || []);
        setAttachments(data.attachments || []);

        // Fetch reseller percentage, then calculate original list prices
        const resellerId = (data.invoice?.Reseller as { id?: string })?.id;
        if (resellerId) {
          fetch(`/api/resellers/${resellerId}`)
            .then(r => r.json())
            .then(rData => {
              const pct = rData.reseller?.Reseller_Sale;
              const percentage = pct != null ? Number(pct) : null;
              setResellerPercentage(percentage);

              // Reseller payment method flags
              // Pay on Account = Zoho Can_Purchase_on_Credit → Process Order
              // Pay on Card = PostgreSQL pay_on_card → Pay Now / Pay Later
              setPayOnAccount(!!rData.reseller?.Can_Purchase_on_Credit);
              setPayOnCard(!!rData.payOnCard);

              // Calculate and store original (full) list prices
              // If invoice is currently in reseller mode, current prices ARE discounted
              // so we need to reverse-calculate the full price
              if (percentage != null && data.lineItems?.length) {
                const isResellerMode = !!data.invoice?.Reseller_Direct_Purchase;
                const prices: Record<string, number> = {};
                for (const li of data.lineItems) {
                  const price = li.List_Price as number;
                  if (li.id && price > 0) {
                    if (isResellerMode) {
                      // Currently discounted → reverse to get full price
                      prices[li.id as string] = Math.round(price / ((100 - percentage) / 100) * 100) / 100;
                    } else {
                      // Currently at full price
                      prices[li.id as string] = price;
                    }
                  }
                }
                setOriginalListPrices(prices);
              }
            })
            .catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [invoiceId]);

  // Feed the header's Recent Items menu once the record has loaded.
  useTrackRecentItem(invoice ? {
    type: 'order',
    id: invoiceId,
    title: invoice.Reference_Number
      ? `#${invoice.Reference_Number as string}`
      : (invoice.Subject as string) || 'Order',
    subtitle: (invoice.Account_Name as { name?: string } | null)?.name || undefined,
    href: buildPath('invoice-detail', invoiceId),
  } : null);

  // -------------------------------------------------------------------
  // Unsaved-changes registration
  //
  // Only the batch edit states live here. The inline-edit fields (dates)
  // register themselves from inside InlineEditField.
  // -------------------------------------------------------------------

  const lineItemsDirty = editing
    && lineItemFingerprint(editLineItems) !== lineItemFingerprint(lineItems);
  const poDirty = editingPO && editPONumber !== ((invoice?.Purchase_Order as string) || '');
  const couponDirty = couponCode.trim().length > 0;

  useEffect(() => {
    registerDirty(SCOPE_LINE_ITEMS, lineItemsDirty, 'the order line items');
    registerDirty(SCOPE_PO, poDirty, 'the purchase order number');
    registerDirty(SCOPE_COUPON, couponDirty, 'the coupon code');
    return () => {
      registerDirty(SCOPE_LINE_ITEMS, false);
      registerDirty(SCOPE_PO, false);
      registerDirty(SCOPE_COUPON, false);
    };
  }, [registerDirty, lineItemsDirty, poDirty, couponDirty]);

  // -------------------------------------------------------------------
  // Full edit form — populate, dirty tracking, save
  // -------------------------------------------------------------------

  /** Every form field, in a stable order, for the pristine comparison. */
  const formState = useMemo(() => JSON.stringify([
    formInvoiceDate, formDueDate, formPO, formStatus, formCurrency, lineItemFingerprint(editLineItems),
  ]), [formInvoiceDate, formDueDate, formPO, formStatus, formCurrency, editLineItems]);

  // Only a changed form counts as unsaved work. Opening /edit and pressing Cancel
  // must not prompt. The inline-edit fields in view mode register themselves.
  useEffect(() => {
    const dirty = formEditing && pristine.current !== null && formState !== pristine.current;
    registerDirty(SCOPE_EDIT, dirty, 'this order');
    return () => registerDirty(SCOPE_EDIT, false);
  }, [registerDirty, formEditing, formState]);

  /** Which order the form currently mirrors, so a direct hit on /edit populates once. */
  const populatedFor = useRef<string | null>(null);

  // Arriving straight at /orders/[id]/edit means the record is still loading, so
  // the form is filled here rather than in a click handler.
  useEffect(() => {
    if (formEditing && invoice && populatedFor.current !== invoiceId) {
      setFormInvoiceDate((invoice.Invoice_Date as string)?.slice(0, 10) || '');
      setFormDueDate((invoice.Due_Date as string)?.slice(0, 10) || '');
      setFormPO((invoice.Purchase_Order as string) || '');
      setFormStatus((invoice.Status as string) || '');
      setFormCurrency((invoice.Currency as string) || 'AUD');
      // Same editing model as the batch line-item edit, including the
      // `_originalPrice` bookkeeping that drives Contract_Term_Years.
      setEditLineItems(lineItems.map(li => ({ ...li, _originalPrice: li.List_Price })));
      populatedFor.current = invoiceId;
      pristine.current = null;
      setAttempted(false);
      setFormError(null);
    }
    if (!formEditing) populatedFor.current = null;
  }, [formEditing, invoice, lineItems, invoiceId]);

  // Runs on the render after the populate effect's batched updates land.
  useEffect(() => {
    if (formEditing && populatedFor.current === invoiceId && pristine.current === null) {
      pristine.current = formState;
    }
  }, [formEditing, invoiceId, formState]);

  // -------------------------------------------------------------------
  // Edit mode handlers
  // -------------------------------------------------------------------

  const enterEditMode = () => {
    if (!invoice) return;
    setEditLineItems(lineItems.map(li => ({
      ...li,
      _originalPrice: li.List_Price, // Track original price for Contract_Term_Years logic
    })));
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setSkuBuilderIndex(null);
  };

  const saveEdits = async () => {
    if (!invoiceId) return;
    setSaving(true);

    try {
      const body: Record<string, unknown> = {};

      // Build line items for Zoho — only send fields Zoho accepts
      body.Invoiced_Items = buildInvoicedItemsPayload(editLineItems);

      const res = await fetch(`/api/invoices/${invoiceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const reload = await fetch(`/api/invoices/${invoiceId}`);
        const data = await reload.json();
        setInvoice(data.invoice);
        setLineItems(data.lineItems || []);
        setEditing(false);
        registerDirty(SCOPE_LINE_ITEMS, false);

        // Delayed reload to pick up Stripe payment link generated by workflow
        setPaymentRefreshing(true);
        setTimeout(async () => {
          try {
            const refreshed = await fetch(`/api/invoices/${invoiceId}`);
            const refreshedData = await refreshed.json();
            setInvoice(refreshedData.invoice);
            setLineItems(refreshedData.lineItems || []);
          } catch { /* non-critical */ }
          setPaymentRefreshing(false);
        }, 6000);
      }
    } catch { /* handled by UI */ }
    setSaving(false);
  };

  /** Optimistic per-field save used by InlineEditField. Updates local
   *  invoice state immediately, PATCHes the record, and rolls back on error
   *  by throwing — InlineEditField then triggers its red flash + revert. */
  const saveFields = useCallback(async (changes: Record<string, unknown>) => {
    if (!invoiceId) throw new Error('No invoice selected');
    const previous = invoice;
    setInvoice(prev => prev ? { ...prev, ...changes } : prev);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      });
      if (!res.ok) throw new Error('Save failed');
    } catch (err) {
      setInvoice(previous);
      throw err;
    }
  }, [invoiceId, invoice]);

  // -------------------------------------------------------------------
  // Full edit form handlers
  // -------------------------------------------------------------------

  /** The PATCH route only writes dates when the value is truthy, so an existing
   *  date cannot be cleared through the API. Block the save rather than let the
   *  clear be silently dropped. */
  const clearedDate = (!!invoice?.Invoice_Date && !formInvoiceDate)
    || (!!invoice?.Due_Date && !formDueDate);

  const handleFormCancel = () => {
    setAttempted(false);
    setFormError(null);
    router.push(buildPath('invoice-detail', invoiceId));
  };

  const saveForm = async () => {
    setAttempted(true);
    setFormError(null);
    if (!invoiceId || clearedDate) return;

    const body: Record<string, unknown> = {};
    if (canEdit) {
      if (formInvoiceDate && formInvoiceDate !== ((invoice?.Invoice_Date as string)?.slice(0, 10) || '')) {
        body.Invoice_Date = formInvoiceDate;
      }
      if (formDueDate && formDueDate !== ((invoice?.Due_Date as string)?.slice(0, 10) || '')) {
        body.Due_Date = formDueDate;
      }
      // The route writes Currency only when truthy, which is fine — a currency is
      // never blank. Line item amounts are not converted; only the currency changes.
      if (formCurrency && formCurrency !== ((invoice?.Currency as string) || 'AUD')) {
        body.Currency = formCurrency;
      }
      if (lineItemFingerprint(editLineItems) !== lineItemFingerprint(lineItems)) {
        body.Invoiced_Items = buildInvoicedItemsPayload(editLineItems);
      }
    }
    if (canEditPO && formPO !== ((invoice?.Purchase_Order as string) || '')) {
      body.Purchase_Order = formPO;
    }
    if (canEditStatus && formStatus && formStatus !== (invoice?.Status as string)) {
      body.Status = formStatus;
    }

    // Nothing changed — leave without touching the record.
    if (Object.keys(body).length === 0) {
      handleFormCancel();
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        // Clear the scope before navigating, or the guard would prompt about work
        // that has just been saved.
        pristine.current = null;
        registerDirty(SCOPE_EDIT, false);
        router.push(buildPath('invoice-detail', invoiceId));
      } else {
        const data = await res.json().catch(() => ({}));
        setFormError(data.error || 'Failed to save the order');
      }
    } catch {
      setFormError('Failed to save the order');
    }
    setSaving(false);
  };

  // -------------------------------------------------------------------
  // Line item handlers
  // -------------------------------------------------------------------

  const updateLineItem = (index: number, field: string, value: unknown) => {
    setEditLineItems(prev => prev.map((li, i) => i === index ? { ...li, [field]: value } : li));
  };

  const addLineItem = () => {
    const today = new Date().toISOString().slice(0, 10);
    const nextYear = new Date(Date.now() + 364 * 86400000).toISOString().slice(0, 10);
    setEditLineItems(prev => [...prev, {
      Product_Name: null,
      Quantity: 1,
      List_Price: 0,
      Net_Total: 0,
      Start_Date: today,
      Renewal_Date: nextYear,
      Contract_Term_Years: 1,
      _originalPrice: 0,
      _isNew: true,
    }]);
  };

  const removeLineItem = (index: number) => {
    setEditLineItems(prev => {
      const item = prev[index];
      if (item.id) {
        // Existing item — mark for deletion instead of removing
        return prev.map((li, i) => i === index ? { ...li, _deleted: true } : li);
      }
      // New item — just remove from array
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleProductSelect = (index: number, product: { id: string; name: string; sku: string; unitPrice: number }) => {
    setEditLineItems(prev => prev.map((li, i) => {
      if (i !== index) return li;
      return {
        ...li,
        Product_Name: { name: product.name, id: product.id },
        List_Price: product.unitPrice,
        _originalPrice: li._originalPrice, // Keep original for comparison
      };
    }));
    setSkuBuilderIndex(null);
  };

  // -------------------------------------------------------------------
  // PO handlers
  // -------------------------------------------------------------------

  const savePO = async () => {
    if (!invoiceId) return;
    setSavingPO(true);
    try {
      await fetch(`/api/invoices/${invoiceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Purchase_Order: editPONumber }),
      });
      const res = await fetch(`/api/invoices/${invoiceId}`);
      const data = await res.json();
      setInvoice(data.invoice);
      setEditingPO(false);
      registerDirty(SCOPE_PO, false);
    } catch { /* handled */ }
    setSavingPO(false);
  };

  const handleFileUpload = async (file: File) => {
    if (!invoiceId) return;
    setUploadingFile(true);
    setUploadResult(null);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        const res = await fetch('/api/attach-file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recordID: invoiceId,
            fileName: file.name,
            base64,
            moduleName: 'Invoices',
          }),
        });
        if (res.ok) {
          setUploadResult(`${file.name} attached`);
          // Re-read the order so the new document joins the list rather than
          // living only in `uploadResult` until the next page load.
          fetch(`/api/invoices/${invoiceId}`)
            .then(r => r.json())
            .then(d => setAttachments(d.attachments || []))
            .catch(() => {});
        } else {
          setUploadResult('Upload failed');
        }
        setUploadingFile(false);
      };
      reader.readAsDataURL(file);
    } catch {
      setUploadResult('Upload failed');
      setUploadingFile(false);
    }
  };

  // -------------------------------------------------------------------
  // Coupon handler
  // -------------------------------------------------------------------

  const applyCoupon = async () => {
    if (!couponCode.trim() || !invoiceId || !invoice) return;
    setCouponValidating(true);
    setCouponError(null);

    try {
      const subtotal = invoice.Sub_Total as number || 0;

      const res = await fetch('/api/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: couponCode.trim().toUpperCase(),
          invoiceType: invoice.Invoice_Type as string,
          subtotal,
        }),
      });
      const data = await res.json();

      if (!data.valid) {
        setCouponError(data.error || 'Invalid coupon');
        setCouponValidating(false);
        return;
      }

      if (!data.discountProductId) {
        setCouponError('Coupon has no discount product configured');
        setCouponValidating(false);
        return;
      }

      // Add the discount product as a line item with negative price
      const currentItems = invoice.Invoiced_Items as Record<string, unknown>[] || lineItems;
      const discountItem: Record<string, unknown> = {
        Product_Name: { id: data.discountProductId, name: data.discountProductName },
        Quantity: 1,
        List_Price: -Math.abs(data.discountAmount),
        Contract_Term_Years: 0,
      };

      const updatedItems = [...currentItems, discountItem];

      const patchRes = await fetch(`/api/invoices/${invoiceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Invoiced_Items: updatedItems }),
      });

      if (patchRes.ok) {
        // Reload invoice
        const reload = await fetch(`/api/invoices/${invoiceId}`);
        const reloadData = await reload.json();
        setInvoice(reloadData.invoice);
        setLineItems(reloadData.lineItems || []);
        setCouponApplied(couponCode.trim().toUpperCase());
        setCouponCode('');
        registerDirty(SCOPE_COUPON, false);
      } else {
        setCouponError('Failed to apply coupon to invoice');
      }
    } catch {
      setCouponError('Failed to validate coupon');
    }
    setCouponValidating(false);
  };

  // -------------------------------------------------------------------
  // Approve / Send handlers
  // -------------------------------------------------------------------

  /** Pull the record back after an action so the status badge and lock update. */
  const reloadInvoice = useCallback(async () => {
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`);
      const data = await res.json();
      setInvoice(data.invoice);
      setLineItems(data.lineItems || []);
    } catch { /* the action already succeeded; a stale view is not worth an error */ }
  }, [invoiceId]);

  /** Approve: status to Approved, with CRM workflows firing off the change. */
  const approveInvoice = async () => {
    setActionRunning('approve');
    setActionError('');
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Status: 'Approved' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error || 'Failed to approve the order');
      } else {
        setActionNotice('Order approved. Licence keys will be generated by the CRM.');
        await reloadInvoice();
      }
    } catch {
      setActionError('Failed to approve the order');
    }
    setActionRunning(null);
  };

  /**
   * Send: handled entirely by the CSA send function, which validates the order
   * against its reseller first. Its refusals arrive as readable prose on a 422,
   * so they are shown to the user verbatim rather than replaced with a generic
   * message — they say exactly what is wrong with the order.
   */
  const sendInvoice = async () => {
    setActionRunning('send');
    setActionError('');
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/send`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setActionError(data.error || 'Failed to send the order');
      } else {
        setActionNotice('Order sent.');
        await reloadInvoice();
      }
    } catch {
      setActionError('Failed to send the order');
    }
    setActionRunning(null);
  };

  // -------------------------------------------------------------------
  // Send-to (direct purchase) handler
  // -------------------------------------------------------------------

  const toggleDirectPurchase = async (value: boolean) => {
    if (!invoiceId) return;
    setUpdatingDirectPurchase(true);
    try {
      // Reseller_Direct_Purchase:
      //   true  = reseller is purchasing (invoice goes to reseller) → apply reseller discount
      //   false = customer is purchasing (invoice goes to customer) → full list price
      const patchBody: Record<string, unknown> = { Reseller_Direct_Purchase: value };

      if (resellerPercentage != null && lineItems.length > 0) {
        const updatedItems = lineItems.map(li => {
          const isCouponLine = (li.List_Price as number) < 0;
          if (isCouponLine) {
            // Leave coupon discount lines untouched
            return { id: li.id };
          }

          const liId = li.id as string;
          const fullPrice = originalListPrices[liId] || (li.List_Price as number);
          let newPrice: number;

          if (value) {
            // Reseller mode → apply discount (reseller pays 100% - commission%)
            newPrice = Math.round(fullPrice * (100 - resellerPercentage) / 100 * 100) / 100;
          } else {
            // Customer mode → restore full list price
            newPrice = fullPrice;
          }

          const cleaned: Record<string, unknown> = { id: li.id };
          cleaned.Quantity = li.Quantity;
          cleaned.List_Price = newPrice;
          cleaned.Contract_Term_Years = 0; // Signal custom pricing
          if (li.Start_Date) cleaned.Start_Date = li.Start_Date;
          if (li.Renewal_Date) cleaned.Renewal_Date = li.Renewal_Date;
          return cleaned;
        });

        patchBody.Invoiced_Items = updatedItems;
      }

      await fetch(`/api/invoices/${invoiceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patchBody),
      });

      // Reload invoice
      const res = await fetch(`/api/invoices/${invoiceId}`);
      const data = await res.json();
      setInvoice(data.invoice);
      setLineItems(data.lineItems || []);

      // Delayed reload for Stripe link
      setPaymentRefreshing(true);
      setTimeout(async () => {
        try {
          const refreshed = await fetch(`/api/invoices/${invoiceId}`);
          const refreshedData = await refreshed.json();
          setInvoice(refreshedData.invoice);
          setLineItems(refreshedData.lineItems || []);
        } catch { /* non-critical */ }
        setPaymentRefreshing(false);
      }, 6000);
    } catch { /* handled */ }
    setUpdatingDirectPurchase(false);
  };

  // -------------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------------

  const goBack = () => {
    router.push(buildPath('draft-invoices'));
  };

  // -------------------------------------------------------------------
  // Formatting helpers
  // -------------------------------------------------------------------

  const formatDate = (d: unknown) => {
    if (!d || typeof d !== 'string') return '\u2014';
    const date = new Date(d);
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
  };

  const getCurrencySymbol = (c: string) => {
    if (c === 'EUR') return '\u20AC';
    if (c === 'GBP') return '\u00A3';
    if (c === 'INR') return '\u20B9';
    return '$';
  };

  // -------------------------------------------------------------------
  // Loading / not-found states
  // -------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={24} className="text-csa-accent animate-spin" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <p className="text-text-muted">Order not found</p>
        <button onClick={goBack} className="text-csa-accent text-sm cursor-pointer">Go back</button>
      </div>
    );
  }

  // -------------------------------------------------------------------
  // Derived values for rendering
  // -------------------------------------------------------------------

  const account = invoice.Account_Name as { name?: string; id?: string } | null;
  const contact = invoice.Contact_Name as { name?: string; id?: string } | null;
  const reseller = invoice.Reseller as { name?: string; id?: string } | null;
  const owner = invoice.Owner as { name?: string } | null;
  const status = invoice.Status as string;
  const activeCurrency = (invoice.Currency as string) || 'AUD';
  const symbol = getCurrencySymbol(activeCurrency);
  const resellerRegion = (invoice.Reseller_Region as string) || 'AU';

  const canApplyCoupon = status === 'Draft' && (
    user?.role === 'admin' || user?.role === 'ibm' || user?.permissions?.canModifyPrices
  );

  // In edit mode show the editable items (minus deleted); otherwise show fetched items
  const displayLineItems = editing ? editLineItems.filter(li => !li._deleted) : lineItems;

  // ─── EDIT MODE (/orders/[id]/edit) ───────────────────────────────────
  //
  // Only fields the PATCH route actually writes are offered, each behind the
  // same condition as its inline-edit counterpart. Currency and the Send To
  // flag are shown read-only — see the notes at each.

  if (formEditing) {
    const nothingEditable = !canEdit && !canEditPO && !canEditStatus;

    return (
      <div className="h-full overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-text-primary">Edit Order</h1>
              <p className="text-sm text-text-muted mt-1">
                Editing {invoice.Reference_Number ? `#${invoice.Reference_Number as string}` : (invoice.Subject as string) || invoiceId}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleFormCancel} className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-text-muted bg-surface-raised border border-border-subtle rounded-xl hover:bg-surface-overlay transition-colors cursor-pointer">
                <X size={14} /> Cancel
              </button>
              {!nothingEditable ? (
                <button onClick={saveForm} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-success bg-success/10 border border-success/30 rounded-xl hover:bg-success/20 transition-colors cursor-pointer disabled:opacity-40">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              ) : null}
            </div>
          </div>

          {nothingEditable ? (
            <div className="text-xs text-text-muted bg-surface border border-border-subtle rounded-xl px-4 py-2.5 mb-6">
              This order is {status.toLowerCase()} and you do not have permission to change any of its fields.
            </div>
          ) : null}

          {attempted && clearedDate ? (
            <div className="text-xs text-error bg-error/10 border border-error/20 rounded-xl px-4 py-2.5 mb-6">
              Order Date and Due Date cannot be cleared once set — enter a date or press Cancel.
            </div>
          ) : null}

          {formError ? (
            <div className="text-xs text-error bg-error/10 border border-error/20 rounded-xl px-4 py-2.5 mb-6">
              {formError}
            </div>
          ) : null}

          {/* Order details */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
            <h2 className="text-base font-bold text-text-primary mb-4 flex items-center gap-2">
              <FileText size={16} className="text-csa-accent" />
              Order Details
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {canEdit ? (
                <>
                  <div>
                    <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Order Date</label>
                    <input type="date" value={formInvoiceDate} onChange={e => setFormInvoiceDate(e.target.value)}
                      className={`w-full bg-surface border-2 px-4 py-2.5 text-sm text-text-primary outline-none focus:border-csa-accent transition-colors rounded-xl ${attempted && !!invoice.Invoice_Date && !formInvoiceDate ? 'border-error' : 'border-border-subtle'}`} />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Due Date</label>
                    <input type="date" value={formDueDate} onChange={e => setFormDueDate(e.target.value)}
                      className={`w-full bg-surface border-2 px-4 py-2.5 text-sm text-text-primary outline-none focus:border-csa-accent transition-colors rounded-xl ${attempted && !!invoice.Due_Date && !formDueDate ? 'border-error' : 'border-border-subtle'}`} />
                  </div>
                </>
              ) : (
                <>
                  <ReadOnlyField label="Order Date" value={formatDate(invoice.Invoice_Date)} icon={<Calendar size={14} />} />
                  <ReadOnlyField label="Due Date" value={formatDate(invoice.Due_Date)} icon={<Calendar size={14} />} />
                </>
              )}

              {canEditPO ? (
                <div>
                  <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Purchase Order</label>
                  <input type="text" value={formPO} onChange={e => setFormPO(e.target.value)} placeholder="PO number"
                    className="w-full bg-surface border-2 border-border-subtle px-4 py-2.5 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-xl" />
                  <p className="text-[10px] text-text-muted mt-1">Attach the PO document from the order page.</p>
                </div>
              ) : (
                <ReadOnlyField label="Purchase Order" value={(invoice.Purchase_Order as string) || '—'} icon={<FileText size={14} />} />
              )}

              {canEditStatus ? (
                <div>
                  <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Status</label>
                  <div className="relative">
                    <select value={formStatus} onChange={e => setFormStatus(e.target.value)}
                      className="w-full bg-surface border-2 border-border-subtle px-4 py-2.5 text-sm text-text-primary outline-none focus:border-csa-accent rounded-xl appearance-none cursor-pointer pr-10">
                      {(STATUS_OPTIONS.includes(formStatus) ? STATUS_OPTIONS : [formStatus, ...STATUS_OPTIONS]).map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                  </div>
                </div>
              ) : (
                <ReadOnlyField label="Status" value={status} icon={<FileText size={14} />} />
              )}

              {/* Currency is seeded from the Reseller when the order is created but
                  stays editable — an order can be raised in a currency other than
                  the partner's default. The PATCH route writes it. */}
              {canEdit ? (
                <div>
                  <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Currency</label>
                  <div className="relative">
                    <select value={formCurrency} onChange={e => setFormCurrency(e.target.value)}
                      className="w-full bg-surface border-2 border-border-subtle px-4 py-2.5 text-sm text-text-primary outline-none focus:border-csa-accent rounded-xl appearance-none cursor-pointer pr-10">
                      {(CURRENCIES.includes(formCurrency) || !formCurrency ? CURRENCIES : [formCurrency, ...CURRENCIES]).map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                  </div>
                  <p className="text-[10px] text-text-muted mt-1">Line item amounts are not converted.</p>
                </div>
              ) : (
                <ReadOnlyField label="Currency" value={activeCurrency} icon={<DollarSign size={14} />} />
              )}

              {/* Reseller_Direct_Purchase is writable, but changing it also
                  reprices every line item. That coupled update lives in the
                  Send To toggle on the order page; duplicating it here would be
                  a second pricing model. */}
              <ReadOnlyField
                label="Send Order To"
                value={invoice.Reseller_Direct_Purchase ? 'Reseller' : 'Customer'}
                icon={<Send size={14} />}
                note="Change on the order page — it also reprices line items"
              />
            </div>
          </motion.div>

          {/* Line items — the existing table and editing model, not a second editor */}
          <InvoiceLineItems
            displayLineItems={canEdit ? editLineItems.filter(li => !li._deleted) : lineItems}
            editing={!!canEdit}
            isRenewal={!!isRenewal}
            symbol={symbol}
            formatDate={formatDate}
            onUpdateLineItem={updateLineItem}
            onAddLineItem={addLineItem}
            onRemoveLineItem={removeLineItem}
            onOpenSkuBuilder={setSkuBuilderIndex}
            resellerPercentage={resellerPercentage}
            isResellerPricing={!!invoice.Reseller_Direct_Purchase && resellerPercentage != null}
          />
        </div>

        {/* SKU Builder Modal — product picker for line items */}
        {skuBuilderIndex !== null && (
          <SKUBuilder
            region={resellerRegion}
            onSelect={(product) => handleProductSelect(skuBuilderIndex, product)}
            onCancel={() => setSkuBuilderIndex(null)}
          />
        )}
      </div>
    );
  }

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* Header: back, badges, action buttons */}
        <InvoiceHeader
          invoice={invoice}
          status={status}
          editing={editing}
          saving={saving}
          canEdit={!!canEdit}
          user={user}
          selectedInvoiceId={invoiceId}
          onGoBack={goBack}
          onEdit={() => router.push(buildPath('invoice-edit', invoiceId))}
          onCancelEdit={cancelEdit}
          onSave={saveEdits}
          onApprove={() => setPendingAction('approve')}
          onSend={() => setPendingAction('send')}
          approving={actionRunning === 'approve'}
          sending={actionRunning === 'send'}
        />

        {/* Invoice Info Cards */}
        <InlineEditFieldProvider>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {account?.id ? (
            <GuardedLink
              href={buildPath('account-detail', account.id)}
              className="block bg-surface border border-border-subtle rounded-xl px-4 py-3 text-left hover:border-csa-accent/50 transition-colors group cursor-pointer"
            >
              <div className="flex items-center gap-1.5 text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">
                <Building2 size={14} />
                Account
              </div>
              <p className="text-sm text-csa-accent group-hover:text-csa-highlight truncate transition-colors">{account.name || '\u2014'}</p>
            </GuardedLink>
          ) : (
            <InfoCard label="Account" value={account?.name || '\u2014'} icon={<Building2 size={14} />} />
          )}
          <InfoCard label="Contact" value={contact?.name || '\u2014'} icon={<User size={14} />} />
          <InfoCard label="Reseller" value={reseller?.name || '\u2014'} icon={<Globe size={14} />} />

          <InlineEditField
            fieldId="invoice_date"
            label="Order Date"
            icon={<Calendar size={14} />}
            value={(invoice.Invoice_Date as string)?.slice(0, 10) || ''}
            displayValue={formatDate(invoice.Invoice_Date)}
            type="date"
            canEdit={!!canEdit && !editing}
            onSave={v => saveFields({ Invoice_Date: v || null })}
          />

          <InlineEditField
            fieldId="due_date"
            label="Due Date"
            icon={<Calendar size={14} />}
            value={(invoice.Due_Date as string)?.slice(0, 10) || ''}
            displayValue={formatDate(invoice.Due_Date)}
            type="date"
            canEdit={!!canEdit && !editing}
            onSave={v => saveFields({ Due_Date: v || null })}
          />

          {/* Currency is sourced from the Reseller record and is not directly
              editable here — render as a read-only card with a hover tooltip. */}
          <div
            className="bg-surface border border-border-subtle rounded-xl px-4 py-3"
            title="Currency is set from the Reseller and cannot be edited here"
          >
            <div className="flex items-center gap-1.5 text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">
              <DollarSign size={14} />
              Currency
            </div>
            <p className="text-sm text-text-primary truncate">{activeCurrency}</p>
          </div>

          {owner ? <InfoCard label="Owner" value={owner.name || '\u2014'} icon={<User size={14} />} /> : null}
          {invoice.Billing_Country ? <InfoCard label="Billing Country" value={invoice.Billing_Country as string} icon={<MapPin size={14} />} /> : null}
        </motion.div>
        </InlineEditFieldProvider>

        {/* Purchase Order */}
        <div data-tour="order-po">
        <InvoicePurchaseOrder
          invoice={invoice}
          status={status}
          editingPO={editingPO}
          editPONumber={editPONumber}
          savingPO={savingPO}
          uploadingFile={uploadingFile}
          uploadResult={uploadResult}
          attachments={attachments}
          invoiceId={invoiceId}
          onStartEditPO={() => { setEditPONumber(invoice.Purchase_Order as string || ''); setEditingPO(true); }}
          onCancelEditPO={() => setEditingPO(false)}
          onChangePONumber={setEditPONumber}
          onSavePO={savePO}
          onFileUpload={handleFileUpload}
        />
        </div>

        {/* Send To toggle */}
        <div data-tour="order-send-to">
        <InvoiceSendTo
          invoice={invoice}
          status={status}
          updatingDirectPurchase={updatingDirectPurchase}
          onToggleDirectPurchase={toggleDirectPurchase}
          allowDirectCustomer={!!user?.permissions?.canDirectCustomerComms}
        />
        </div>

        {/* Payment Information */}
        <InvoicePayment
          invoice={invoice}
          status={status}
          isRefreshing={paymentRefreshing}
        />

        {/* Line Items table */}
        {canEdit && !editing && (
          <div className="flex justify-end mb-2">
            <button
              onClick={enterEditMode}
              className="flex items-center gap-2 px-3 py-1.5 text-[11px] font-semibold text-csa-accent bg-csa-accent/10 border border-csa-accent/30 rounded-lg hover:bg-csa-accent/20 transition-colors cursor-pointer"
            >
              Edit Line Items
            </button>
          </div>
        )}
        <div data-tour="order-line-items">
        <InvoiceLineItems
          displayLineItems={displayLineItems}
          editing={editing}
          isRenewal={!!isRenewal}
          symbol={symbol}
          formatDate={formatDate}
          onUpdateLineItem={updateLineItem}
          onAddLineItem={addLineItem}
          onRemoveLineItem={removeLineItem}
          onOpenSkuBuilder={setSkuBuilderIndex}
          resellerPercentage={resellerPercentage}
          isResellerPricing={!!invoice.Reseller_Direct_Purchase && resellerPercentage != null}
        />
        </div>

        {/* Order Action Buttons (Pay Now / Pay Later / Place Order) */}
        {!editing && (
          /* The anchor only exists when a button will actually be under it.
             OrderActions renders nothing outside Draft/Sent, or when the
             partner has no payment method the user is allowed to use, and a
             tour step pointing at an empty wrapper is worse than one that
             skips itself. */
          <div data-tour={hasOrderActions ? 'order-actions' : undefined}>
          <OrderActions
            invoice={invoice}
            status={status}
            selectedInvoiceId={invoiceId}
            payOnAccount={payOnAccount}
            payOnCard={payOnCard}
            canSend={!!(user?.permissions?.canSendInvoices)}
            canApprove={canProcessOnAccount}
            hasPONumber={!!(invoice.Purchase_Order)}
            hasPOFile={attachments.length > 0}
            onRefresh={() => {
              // Reload invoice data
              fetch(`/api/invoices/${invoiceId}`)
                .then(res => res.json())
                .then(data => {
                  setInvoice(data.invoice);
                  setLineItems(data.lineItems || []);
                  setAttachments(data.attachments || []);
                })
                .catch(() => {});
            }}
          />
          </div>
        )}

        {/* Coupon */}
        <div data-tour={canApplyCoupon ? 'order-coupon' : undefined}>
        <InvoiceCoupon
          canApply={!!canApplyCoupon}
          couponCode={couponCode}
          couponValidating={couponValidating}
          couponError={couponError}
          couponApplied={couponApplied}
          onChangeCouponCode={(v) => { setCouponCode(v); setCouponError(null); }}
          onApplyCoupon={applyCoupon}
        />
        </div>

        {/* Totals */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mb-8">
          <div className="max-w-sm ml-auto bg-surface border border-border-subtle rounded-xl overflow-hidden">
            <div className="divide-y divide-border-subtle">
              <TotalRow label="Sub Total" value={invoice.Sub_Total as number} symbol={symbol} />
              {(invoice.Discount as number) > 0 ? (
                <TotalRow label="Discount" value={-(invoice.Discount as number)} symbol={symbol} muted />
              ) : null}
              {(invoice.Tax as number) > 0 ? (
                <TotalRow label="Tax" value={invoice.Tax as number} symbol={symbol} muted />
              ) : null}
              <div className="flex items-center justify-between px-4 py-3 bg-surface-raised">
                <span className="text-sm font-bold text-text-primary uppercase tracking-wider">Grand Total</span>
                <span className="text-lg font-bold text-csa-accent">
                  {symbol}{(invoice.Grand_Total as number)?.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Description / Terms */}
        {(invoice.Description || invoice.Terms_and_Conditions) ? (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {invoice.Description ? (
              <div className="bg-surface border border-border-subtle rounded-xl px-4 py-3">
                <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Description</div>
                <p className="text-sm text-text-secondary whitespace-pre-wrap">{invoice.Description as string}</p>
              </div>
            ) : null}
            {invoice.Terms_and_Conditions ? (
              <div className="bg-surface border border-border-subtle rounded-xl px-4 py-3">
                <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Terms & Conditions</div>
                <p className="text-sm text-text-secondary whitespace-pre-wrap">{invoice.Terms_and_Conditions as string}</p>
              </div>
            ) : null}
          </motion.div>
        ) : null}
      </div>

      {/* SKU Builder Modal — renders as overlay when a line item is being configured */}
      {skuBuilderIndex !== null && (
        <SKUBuilder
          region={resellerRegion}
          onSelect={(product) => handleProductSelect(skuBuilderIndex, product)}
          onCancel={() => setSkuBuilderIndex(null)}
        />
      )}

      {/* Approve / Send confirmation. Both are one-way and both reach the
          customer, so each states its consequence before it runs. */}
      {pendingAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setPendingAction(null)} />
          <div className="relative bg-csa-dark border border-border rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-5 py-4 border-b border-border-subtle">
              <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
                {pendingAction === 'approve' ? <CheckCircle2 size={18} className="text-success" /> : <Send size={18} className="text-csa-accent" />}
                {pendingAction === 'approve'
                  ? 'Approve this order?'
                  : status === 'Sent' ? 'Send this order again?' : 'Send this order?'}
              </h2>
            </div>
            <div className="px-5 py-4">
              <p className="text-xs text-text-secondary leading-relaxed">
                {pendingAction === 'approve'
                  ? `Approving generates the licence keys and emails them to ${recipientSentence(invoice)}. The order locks afterwards and cannot be edited.`
                  : `The order will be emailed to ${recipientSentence(invoice)}${status === 'Sent' ? ' again' : ''}. Licence keys follow when it is paid, not now.`}
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border-subtle">
              <button
                onClick={() => setPendingAction(null)}
                className="px-4 py-2 text-xs font-semibold text-text-muted bg-surface-raised border border-border-subtle rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const action = pendingAction;
                  setPendingAction(null);
                  if (action === 'approve') approveInvoice();
                  else sendInvoice();
                }}
                className={`px-4 py-2 text-xs font-semibold text-white rounded-xl cursor-pointer ${
                  pendingAction === 'approve' ? 'bg-success' : 'bg-csa-accent'
                }`}
              >
                {pendingAction === 'approve'
                  ? 'Approve Order'
                  : status === 'Sent' ? 'Resend Order' : 'Send Order'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Result banner. Refusals from the send function are shown as written —
          they name the exact problem with the order. */}
      {(actionError || actionNotice) && (
        <div className={`fixed bottom-6 right-20 z-50 max-w-md border rounded-xl px-4 py-3 shadow-lg ${
          actionError ? 'bg-csa-dark border-error/40' : 'bg-csa-dark border-success/40'
        }`}>
          <div className="flex items-start gap-3">
            <p className={`text-xs flex-1 whitespace-pre-wrap ${actionError ? 'text-error' : 'text-text-primary'}`}>
              {actionError || actionNotice}
            </p>
            <button
              onClick={() => { setActionError(''); setActionNotice(''); }}
              className="text-text-muted hover:text-text-primary cursor-pointer flex-shrink-0"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small helper components — kept here as they're lightweight and only used
// in the info-cards grid above.
// ---------------------------------------------------------------------------

/** Read-only info card for the invoice metadata grid. */
function InfoCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="bg-surface border border-border-subtle rounded-xl px-4 py-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">
        {icon}
        {label}
      </div>
      <p className="text-sm text-text-primary truncate" title={value || undefined}>{value || '\u2014'}</p>
    </div>
  );
}

/** Field shown in the edit form that the PATCH route will not write from here. */
function ReadOnlyField({ label, value, icon, note }: { label: string; value: string; icon: React.ReactNode; note?: string }) {
  return (
    <div className="bg-surface border border-border-subtle rounded-xl px-4 py-3" title={note}>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1">
        {icon}
        {label}
      </div>
      <p className="text-sm text-text-primary truncate" title={value || undefined}>{value || '—'}</p>
      {note ? <p className="text-[10px] text-text-muted mt-1">{note}</p> : null}
    </div>
  );
}

/** Single row in the totals summary card. */
function TotalRow({ label, value, symbol, muted }: { label: string; value: number; symbol: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className={`text-sm ${muted ? 'text-text-muted' : 'text-text-secondary'}`}>{label}</span>
      <span className={`text-sm font-semibold ${muted ? 'text-text-muted' : 'text-text-primary'}`}>
        {value < 0 ? `-${symbol}${Math.abs(value).toFixed(2)}` : `${symbol}${value?.toFixed(2)}`}
      </span>
    </div>
  );
}
