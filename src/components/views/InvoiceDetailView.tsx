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

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Building2,
  User,
  Calendar,
  DollarSign,
  Globe,
  Loader2,
  MapPin,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';
import SKUBuilder from '../SKUBuilder';
import InvoiceHeader from '../invoice/InvoiceHeader';
import InvoiceLineItems from '../invoice/InvoiceLineItems';
import InvoicePurchaseOrder from '../invoice/InvoicePurchaseOrder';
import InvoiceSendTo from '../invoice/InvoiceSendTo';
import InvoiceCoupon from '../invoice/InvoiceCoupon';
import InvoicePayment from '../invoice/InvoicePayment';
import OrderActions from '../invoice/OrderActions';
import { InlineEditField, InlineEditFieldProvider } from '../InlineEditField';

export default function InvoiceDetailView() {
  const { user, selectedInvoiceId, invoiceReturnView, setCurrentView, setSelectedAccountId } = useAppStore();
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
  const [canPurchaseOnAccount, setCanPurchaseOnAccount] = useState(false);
  const [canPurchaseOnCredit, setCanPurchaseOnCredit] = useState(false);

  // PO
  const [editingPO, setEditingPO] = useState(false);
  const [editPONumber, setEditPONumber] = useState('');
  const [savingPO, setSavingPO] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadResult, setUploadResult] = useState<string | null>(null);

  // Derived permission flags
  const isEditor = user?.role === 'admin' || user?.role === 'ibm';
  const canEdit = isEditor && invoice?.Status === 'Draft';
  const isRenewal = invoice?.Invoice_Type === 'Renewal';

  // -------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------

  useEffect(() => {
    if (!selectedInvoiceId) return;
    setLoading(true);
    setEditing(false);

    fetch(`/api/invoices/${selectedInvoiceId}`)
      .then(res => res.json())
      .then(data => {
        setInvoice(data.invoice);
        setLineItems(data.lineItems || []);

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
              // Pay on Account = Zoho Can_Purchase_on_Credit → Place Order
              // Pay on Card = PostgreSQL pay_on_card → Pay Now / Pay Later
              setCanPurchaseOnAccount(!!rData.reseller?.Can_Purchase_on_Credit);
              setCanPurchaseOnCredit(!!rData.payOnCard);

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
  }, [selectedInvoiceId]);

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
    if (!selectedInvoiceId) return;
    setSaving(true);

    try {
      const body: Record<string, unknown> = {};

      // Build line items for Zoho — only send fields Zoho accepts
      const updatedItems = editLineItems.map(li => {
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
      }).filter(Boolean);
      body.Invoiced_Items = updatedItems;

      const res = await fetch(`/api/invoices/${selectedInvoiceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const reload = await fetch(`/api/invoices/${selectedInvoiceId}`);
        const data = await reload.json();
        setInvoice(data.invoice);
        setLineItems(data.lineItems || []);
        setEditing(false);

        // Delayed reload to pick up Stripe payment link generated by workflow
        setPaymentRefreshing(true);
        setTimeout(async () => {
          try {
            const refreshed = await fetch(`/api/invoices/${selectedInvoiceId}`);
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
    if (!selectedInvoiceId) throw new Error('No invoice selected');
    const previous = invoice;
    setInvoice(prev => prev ? { ...prev, ...changes } : prev);
    try {
      const res = await fetch(`/api/invoices/${selectedInvoiceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      });
      if (!res.ok) throw new Error('Save failed');
    } catch (err) {
      setInvoice(previous);
      throw err;
    }
  }, [selectedInvoiceId, invoice]);

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
    if (!selectedInvoiceId) return;
    setSavingPO(true);
    try {
      await fetch(`/api/invoices/${selectedInvoiceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Purchase_Order: editPONumber }),
      });
      const res = await fetch(`/api/invoices/${selectedInvoiceId}`);
      const data = await res.json();
      setInvoice(data.invoice);
      setEditingPO(false);
    } catch { /* handled */ }
    setSavingPO(false);
  };

  const handleFileUpload = async (file: File) => {
    if (!selectedInvoiceId) return;
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
            recordID: selectedInvoiceId,
            fileName: file.name,
            base64,
            moduleName: 'Invoices',
          }),
        });
        if (res.ok) {
          setUploadResult(`${file.name} attached`);
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
    if (!couponCode.trim() || !selectedInvoiceId || !invoice) return;
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

      const patchRes = await fetch(`/api/invoices/${selectedInvoiceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Invoiced_Items: updatedItems }),
      });

      if (patchRes.ok) {
        // Reload invoice
        const reload = await fetch(`/api/invoices/${selectedInvoiceId}`);
        const reloadData = await reload.json();
        setInvoice(reloadData.invoice);
        setLineItems(reloadData.lineItems || []);
        setCouponApplied(couponCode.trim().toUpperCase());
        setCouponCode('');
      } else {
        setCouponError('Failed to apply coupon to invoice');
      }
    } catch {
      setCouponError('Failed to validate coupon');
    }
    setCouponValidating(false);
  };

  // -------------------------------------------------------------------
  // Send-to (direct purchase) handler
  // -------------------------------------------------------------------

  const toggleDirectPurchase = async (value: boolean) => {
    if (!selectedInvoiceId) return;
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

      await fetch(`/api/invoices/${selectedInvoiceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patchBody),
      });

      // Reload invoice
      const res = await fetch(`/api/invoices/${selectedInvoiceId}`);
      const data = await res.json();
      setInvoice(data.invoice);
      setLineItems(data.lineItems || []);

      // Delayed reload for Stripe link
      setPaymentRefreshing(true);
      setTimeout(async () => {
        try {
          const refreshed = await fetch(`/api/invoices/${selectedInvoiceId}`);
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
    if (invoiceReturnView === 'account-detail') {
      setCurrentView('account-detail');
    } else {
      setCurrentView('draft-invoices');
    }
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
          selectedInvoiceId={selectedInvoiceId}
          onGoBack={goBack}
          onEdit={enterEditMode}
          onCancelEdit={cancelEdit}
          onSave={saveEdits}
        />

        {/* Invoice Info Cards */}
        <InlineEditFieldProvider>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {account?.id ? (
            <button
              onClick={() => { setSelectedAccountId(account.id as string); setCurrentView('account-detail'); }}
              className="bg-surface border border-border-subtle rounded-xl px-4 py-3 text-left hover:border-csa-accent/50 transition-colors group cursor-pointer"
            >
              <div className="flex items-center gap-1.5 text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">
                <Building2 size={14} />
                Account
              </div>
              <p className="text-sm text-csa-accent group-hover:text-csa-highlight truncate transition-colors">{account.name || '\u2014'}</p>
            </button>
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
        <InvoicePurchaseOrder
          invoice={invoice}
          status={status}
          editingPO={editingPO}
          editPONumber={editPONumber}
          savingPO={savingPO}
          uploadingFile={uploadingFile}
          uploadResult={uploadResult}
          onStartEditPO={() => { setEditPONumber(invoice.Purchase_Order as string || ''); setEditingPO(true); }}
          onCancelEditPO={() => setEditingPO(false)}
          onChangePONumber={setEditPONumber}
          onSavePO={savePO}
          onFileUpload={handleFileUpload}
        />

        {/* Send To toggle */}
        <InvoiceSendTo
          invoice={invoice}
          status={status}
          updatingDirectPurchase={updatingDirectPurchase}
          onToggleDirectPurchase={toggleDirectPurchase}
        />

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

        {/* Order Action Buttons (Pay Now / Pay Later / Place Order) */}
        {!editing && (
          <OrderActions
            invoice={invoice}
            status={status}
            selectedInvoiceId={selectedInvoiceId}
            canPurchaseOnAccount={canPurchaseOnAccount}
            canPurchaseOnCredit={canPurchaseOnCredit}
            canSend={!!(user?.permissions?.canSendInvoices)}
            canApprove={!!(user?.permissions?.canApproveInvoices)}
            hasPONumber={!!(invoice.Purchase_Order)}
            hasPOFile={!!uploadResult || !!(invoice.Purchase_Order_Attachment)}
            onRefresh={() => {
              // Reload invoice data
              fetch(`/api/invoices/${selectedInvoiceId}`)
                .then(res => res.json())
                .then(data => { setInvoice(data.invoice); setLineItems(data.lineItems || []); })
                .catch(() => {});
            }}
          />
        )}

        {/* Coupon */}
        <InvoiceCoupon
          canApply={!!canApplyCoupon}
          couponCode={couponCode}
          couponValidating={couponValidating}
          couponError={couponError}
          couponApplied={couponApplied}
          onChangeCouponCode={(v) => { setCouponCode(v); setCouponError(null); }}
          onApplyCoupon={applyCoupon}
        />

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
      <p className="text-sm text-text-primary truncate">{value || '\u2014'}</p>
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
