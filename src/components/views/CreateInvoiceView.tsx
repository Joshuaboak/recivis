/**
 * CreateInvoiceView — Build and submit a new product invoice.
 *
 * Pre-populated from newInvoiceContext (set by AccountDetailView):
 * - Account, contact, reseller, owner, billing country
 * - Reseller currency and region (fetched on load)
 *
 * Features:
 * - Editable dates (invoice date, due date) and currency selector
 * - Line item builder with SKUBuilder modal for product selection
 * - Per-line editable quantity and list price
 * - Auto-calculated subtotal
 * - On save: creates Draft invoice in Zoho CRM, then navigates to detail view
 * - Unsaved work is drafted per account (see useDraft) and offered back on
 *   return; it is never rehydrated without the user asking.
 *
 * Contract_Term_Years logic: If the user modifies the list price from the
 * product's default unit price, Contract_Term_Years is set to 0 to signal
 * the Zoho workflow that custom pricing was applied.
 */

'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  FileText,
  Building2,
  User,
  Calendar,
  DollarSign,
  Globe,
  Package,
  Loader2,
  MapPin,
  Save,
  Plus,
  Trash2,
  Replace,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { buildPath } from '@/lib/routes';
import { CURRENCIES as SUPPORTED_CURRENCIES } from '@/lib/constants';
import { useGuardedRouter } from '@/lib/useGuardedRouter';
import { useUnsavedChanges } from '@/components/UnsavedChangesProvider';
import { useDraft } from '@/lib/useDraft';
import { DraftRestoreBar } from '@/components/DraftRestoreBar';
import SKUBuilder from '../SKUBuilder';

// From lib/constants so the list cannot drift per view — it already had.
const CURRENCIES = SUPPORTED_CURRENCIES;

/** Shown on /accounts when this view is opened without an account context. */
const NO_CONTEXT_MESSAGE = 'Pick an account to start an order';

/** Persisted between visits so browser Back doesn't destroy a half-built order. */
interface InvoiceDraft {
  invoiceDate: string;
  dueDate: string;
  currency: string;
  lineItems: Record<string, unknown>[];
}

/**
 * Sentinel for "nothing worth saving". `useDraft` only starts writing once the
 * value differs from what it saw at mount, so handing it this constant while the
 * form is untouched keeps an empty order from ever reaching localStorage.
 */
const EMPTY_INVOICE_DRAFT: InvoiceDraft = {
  invoiceDate: '',
  dueDate: '',
  currency: '',
  lineItems: [],
};

export default function CreateInvoiceView() {
  const { newInvoiceContext } = useAppStore();
  const router = useGuardedRouter();
  const { registerDirty } = useUnsavedChanges();

  const account = newInvoiceContext?.account as { name?: string; id?: string } | null;
  const contact = newInvoiceContext?.contact as { name?: string; id?: string } | null;
  const resellerData = newInvoiceContext?.reseller as { name?: string; id?: string } | null;
  const [resellerRegion, setResellerRegion] = useState((newInvoiceContext?.region as string) || 'AU');
  const ownerData = newInvoiceContext?.owner as { name?: string; id?: string } | null;
  const billingCountry = newInvoiceContext?.billingCountry as string || '';

  const today = new Date().toISOString().slice(0, 10);
  const plus30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const plus364 = new Date(Date.now() + 364 * 86400000).toISOString().slice(0, 10);

  const [invoiceDate, setInvoiceDate] = useState(today);
  const [dueDate, setDueDate] = useState(plus30);
  const [currency, setCurrency] = useState('AUD');
  const [lineItems, setLineItems] = useState<Record<string, unknown>[]>([]);

  // Scoped by account: two half-built orders for different accounts must not
  // overwrite each other.
  const draftKey = `orders:new:${account?.id || 'none'}`;

  const draft = useMemo<InvoiceDraft>(
    () => ({ invoiceDate, dueDate, currency, lineItems }),
    [invoiceDate, dueDate, currency, lineItems],
  );

  // Currency is stored in the draft but deliberately left out of this test: the
  // reseller fetch below overwrites it, and a form nobody touched must not look
  // dirty or leave a draft behind.
  const isDirty = lineItems.length > 0 || invoiceDate !== today || dueDate !== plus30;

  const { pendingDraft, pendingDraftSavedAt, restore, discard, clear } =
    useDraft<InvoiceDraft>(draftKey, isDirty ? draft : EMPTY_INVOICE_DRAFT);

  // Drafts survive browser Back; this makes in-app navigation prompt first.
  useEffect(() => {
    registerDirty('create-invoice', isDirty, 'this new order');
    return () => registerDirty('create-invoice', false);
  }, [registerDirty, isDirty]);

  const [resellerPercentage, setResellerPercentage] = useState<number | null>(null);
  /**
   * Whether this order goes to the partner rather than to the end customer.
   *
   * The same flag the order page shows as "Order and Licence Keys will be sent
   * to", and it comes from the partner's own record: a partner whose
   * Direct_Customer_Contact is false does not deal with customers directly, so
   * everything goes via them.
   *
   * This was never set at all when an order was created, so every new order
   * arrived with the flag absent — which the order page reads as Customer. A
   * partner set up to receive everything themselves saw their orders addressed
   * to their customer, and the prices were the reseller ones regardless, so the
   * two halves of the same decision disagreed.
   */
  const [resellerDirect, setResellerDirect] = useState<boolean | null>(null);

  // Fetch reseller currency, percentage and routing on load
  useEffect(() => {
    if (!resellerData?.id) return;
    fetch(`/api/resellers/${resellerData.id}`)
      .then(res => res.json())
      .then(data => {
        const reseller = data.reseller;
        if (reseller?.Currency) setCurrency(reseller.Currency);
        if (reseller?.Region) setResellerRegion(reseller.Region);
        const pct = reseller?.Reseller_Sale;
        if (pct != null) setResellerPercentage(Number(pct));
        setResellerDirect(!reseller?.Direct_Customer_Contact);
      })
      .catch(() => {});
  }, [resellerData?.id]);
  const [saving, setSaving] = useState(false);
  /** Why the last Create Order attempt failed, shown beside the button. */
  const [createError, setCreateError] = useState('');
  const [skuBuilderIndex, setSkuBuilderIndex] = useState<number | null>(null);

  // The account context only ever lives in the store, so a cold deep link to
  // this route has nothing to build an order from. Send the user back to pick
  // an account rather than showing an empty form.
  useEffect(() => {
    if (!account) {
      router.replace(`${buildPath('accounts')}?notice=${encodeURIComponent(NO_CONTEXT_MESSAGE)}`);
    }
  }, [account, router]);

  const getCurrencySymbol = (c: string) => {
    if (c === 'EUR') return '\u20AC';
    if (c === 'GBP') return '\u00A3';
    if (c === 'INR') return '\u20B9';
    return '$';
  };

  const symbol = getCurrencySymbol(currency);

  const formatDateDisplay = (d: string) => {
    if (!d) return '\u2014';
    const date = new Date(d);
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
  };

  const addLineItem = () => {
    setLineItems(prev => [...prev, {
      Product_Name: null,
      Quantity: 1,
      List_Price: 0,
      Start_Date: today,
      Renewal_Date: plus364,
      Contract_Term_Years: 1,
      _unitPrice: 0,
    }]);
  };

  const removeLineItem = (index: number) => {
    setLineItems(prev => prev.filter((_, i) => i !== index));
  };

  const updateLineItem = (index: number, field: string, value: unknown) => {
    setLineItems(prev => prev.map((li, i) => i === index ? { ...li, [field]: value } : li));
  };

  const handleProductSelect = (index: number, product: { id: string; name: string; sku: string; unitPrice: number }) => {
    // The reseller discount applies when the reseller is the one buying, which
    // is what `resellerDirect` says. It used to be applied to every order
    // regardless, so an order addressed to the end customer still carried the
    // partner's discounted price — the order page's send-to toggle reprices on
    // exactly this rule, so the two disagreed until somebody touched it.
    const discountedPrice = resellerDirect && resellerPercentage != null
      ? Math.round(product.unitPrice * (100 - resellerPercentage) / 100 * 100) / 100
      : product.unitPrice;

    setLineItems(prev => prev.map((li, i) => {
      if (i !== index) return li;
      return {
        ...li,
        Product_Name: { name: product.name, id: product.id },
        List_Price: discountedPrice,
        _unitPrice: product.unitPrice, // Store original for reference
      };
    }));
    setSkuBuilderIndex(null);
  };

  const goBack = () => {
    router.push(account?.id ? buildPath('account-detail', account.id) : buildPath('accounts'));
  };

  const createInvoice = async () => {
    if (lineItems.length === 0 || !account?.id) return;
    setSaving(true);

    try {
      const invoiceDateFormatted = formatDateDisplay(invoiceDate);
      const subject = `${account.name} - Order - ${invoiceDateFormatted}`;

      const invoicedItems = lineItems.map(li => {
        const item: Record<string, unknown> = {
          Product_Name: li.Product_Name,
          Quantity: li.Quantity,
          List_Price: li.List_Price,
          Start_Date: li.Start_Date,
          Renewal_Date: li.Renewal_Date,
        };
        // If price differs from product unit price (manual edit or reseller discount), signal custom pricing
        if (li.List_Price !== li._unitPrice) {
          item.Contract_Term_Years = 0;
        } else {
          item.Contract_Term_Years = 1;
        }
        return item;
      });

      // Map reseller region codes (AU, NZ) to SKU region codes (ANZ) for Zoho
      const REGION_MAP: Record<string, string> = {
        AU: 'ANZ', NZ: 'ANZ', AF: 'AF', AS: 'AS', EU: 'EU', NA: 'NA', WW: 'WW',
      };
      const skuRegion = REGION_MAP[resellerRegion] || resellerRegion;

      const invoiceData: Record<string, unknown> = {
        Subject: subject,
        Account_Name: { id: account.id },
        Invoice_Date: invoiceDate,
        Due_Date: dueDate,
        Status: 'Draft',
        Invoice_Type: 'New Product',
        Currency: currency,
        Reseller_Region: skuRegion,
        // Absent before, so every new order read as "send to customer".
        Reseller_Direct_Purchase: resellerDirect ?? false,
        Send_Invoice: false,
        Don_t_Make_Keys: false,
        Automatically_Send_Email: false,
        Invoiced_Items: invoicedItems,
      };

      if (contact?.id) invoiceData.Contact_Name = { id: contact.id };
      if (resellerData?.id) invoiceData.Reseller = { id: resellerData.id };
      if (ownerData?.id) invoiceData.Owner = { id: ownerData.id };
      if (billingCountry) invoiceData.Billing_Country = billingCountry;

      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invoiceData),
      });

      const data = await res.json();
      if (data.id) {
        // It's a real record now — drop the draft and the dirty flag so the
        // navigation below doesn't prompt.
        clear();
        registerDirty('create-invoice', false);
        // Navigate to the created invoice
        router.push(buildPath('invoice-detail', data.id));
      } else {
        // Creating an order needs canCreateInvoices, which is enforced on the
        // server and not on this button. Saying so beats the spinner simply
        // stopping, which is what used to happen.
        setCreateError(data.error || 'The order could not be created.');
        setSaving(false);
      }
    } catch {
      setCreateError('The order could not be created. Please try again.');
      setSaving(false);
    }
  };

  const subtotal = lineItems.reduce((sum, li) => {
    const qty = (li.Quantity as number) || 0;
    const price = (li.List_Price as number) || 0;
    return sum + qty * price;
  }, 0);

  // Redirecting — see the effect above.
  if (!account) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={24} className="text-csa-accent animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* Never rehydrated silently — a stale order that reappears on its own
            gets submitted by accident. The user chooses. */}
        {pendingDraft && pendingDraftSavedAt !== null ? (
          <DraftRestoreBar
            savedAt={pendingDraftSavedAt}
            label="unsaved order"
            onRestore={() => {
              const d = restore();
              if (!d) return;
              setInvoiceDate(d.invoiceDate);
              setDueDate(d.dueDate);
              setCurrency(d.currency);
              setLineItems(d.lineItems);
            }}
            onDiscard={discard}
          />
        ) : null}

        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <button onClick={goBack} className="w-9 h-9 flex-shrink-0 flex items-center justify-center bg-surface-raised rounded-xl hover:bg-surface-overlay transition-colors cursor-pointer">
              <ArrowLeft size={18} className="text-text-secondary" />
            </button>

            <div className="flex items-center gap-2 px-3 py-1.5 bg-csa-accent/10 border border-csa-accent/30 rounded-xl">
              <span className="text-[10px] font-semibold text-csa-accent uppercase tracking-wider">New Order</span>
              <span className="text-sm font-bold text-csa-accent">New Product</span>
            </div>

            <span className="px-2.5 py-1.5 text-[11px] font-bold uppercase rounded-lg border bg-warning/20 text-warning border-warning/30">
              Draft
            </span>

            <div className="flex-1" />

            <button
              onClick={() => { setCreateError(''); createInvoice(); }}
              disabled={saving || lineItems.length === 0 || lineItems.some(li => !li.Product_Name)}
              className="flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-success bg-success/10 border border-success/30 rounded-xl hover:bg-success/20 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? 'Creating...' : 'Create Order'}
            </button>
          </div>

          {createError ? (
            <p className="ml-12 mt-2 text-xs text-error">{createError}</p>
          ) : null}

          <h1
            className="text-2xl font-bold text-text-primary ml-12 truncate"
            title={`${account.name} - Order - ${formatDateDisplay(invoiceDate)}`}
          >
            {account.name} - Order - {formatDateDisplay(invoiceDate)}
          </h1>
        </div>

        {/* Invoice Info Cards */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          <InfoCard label="Account" value={account.name || '\u2014'} icon={<Building2 size={14} />} />
          <InfoCard label="Contact" value={contact?.name || '\u2014'} icon={<User size={14} />} />
          <InfoCard label="Reseller" value={resellerData?.name || '\u2014'} icon={<Globe size={14} />} />

          <EditDateCard label="Order Date" value={invoiceDate} onChange={setInvoiceDate} icon={<Calendar size={14} />} />
          <EditDateCard label="Due Date" value={dueDate} onChange={setDueDate} icon={<Calendar size={14} />} />

          <div className="bg-surface border border-csa-accent/50 rounded-xl px-4 py-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-csa-accent uppercase tracking-wider mb-1">
              <DollarSign size={14} />
              Currency
            </div>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="bg-transparent border-none text-sm text-text-primary outline-none w-full cursor-pointer"
            >
              {CURRENCIES.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {ownerData ? <InfoCard label="Owner" value={ownerData.name || '\u2014'} icon={<User size={14} />} /> : null}
          {billingCountry ? <InfoCard label="Billing Country" value={billingCountry} icon={<MapPin size={14} />} /> : null}
        </motion.div>

        {/* Line Items */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-8">
          <h2 className="text-lg font-bold text-text-primary mb-3 flex items-center gap-2">
            <Package size={18} className="text-csa-accent" />
            Line Items ({lineItems.length})
          </h2>
          {lineItems.length > 0 ? (
            <div className="border border-border-subtle rounded-xl overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr className="bg-surface-raised">
                    <th>Product</th>
                    <th className="text-right">Qty</th>
                    <th className="text-right">List Price</th>
                    <th>Start</th>
                    <th>Renewal</th>
                    <th className="text-right">Total</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((li, i) => {
                    const product = li.Product_Name as { name?: string } | null;
                    const qty = li.Quantity as number;
                    const unitPrice = li.List_Price as number;
                    const lineTotal = qty * unitPrice;
                    return (
                      <tr key={i}>
                        <td>
                          {product?.name ? (
                            <button onClick={() => setSkuBuilderIndex(i)} className="text-left group cursor-pointer">
                              <div className="font-semibold text-csa-accent group-hover:text-csa-highlight transition-colors flex items-center gap-1.5">
                                {product.name}
                                <Replace size={12} className="text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                              </div>
                            </button>
                          ) : (
                            <button onClick={() => setSkuBuilderIndex(i)} className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-csa-accent bg-csa-accent/10 border border-csa-accent/30 border-dashed rounded-lg hover:bg-csa-accent/20 transition-colors cursor-pointer">
                              <Plus size={12} />
                              Select Product
                            </button>
                          )}
                        </td>
                        <td className="text-right">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={qty}
                            onChange={(e) => updateLineItem(i, 'Quantity', parseInt(e.target.value.replace(/\D/g, '')) || 1)}
                            className="bg-surface border border-csa-accent/50 rounded-lg px-3 py-1.5 text-sm text-text-primary outline-none focus:border-csa-accent w-[60px] text-right"
                          />
                        </td>
                        <td className="text-right">
                          <div className="inline-flex items-center bg-surface border border-csa-accent/50 rounded-lg overflow-hidden focus-within:border-csa-accent">
                            <span className="text-xs text-text-muted pl-2.5">{symbol}</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={unitPrice}
                              onChange={(e) => {
                                const val = e.target.value.replace(/[^\d.]/g, '');
                                updateLineItem(i, 'List_Price', val === '' ? 0 : parseFloat(val));
                              }}
                              style={{ outline: 'none', boxShadow: 'none' }}
                              className="bg-transparent border-none px-1.5 py-1.5 text-sm text-text-primary w-[80px] text-right"
                            />
                          </div>
                        </td>
                        <td>
                          <input
                            type="date"
                            value={li.Start_Date as string || ''}
                            onChange={(e) => updateLineItem(i, 'Start_Date', e.target.value)}
                            className="bg-surface border border-csa-accent/50 rounded-lg px-2 py-1 text-sm text-text-primary outline-none focus:border-csa-accent w-[130px]"
                          />
                        </td>
                        <td>
                          <input
                            type="date"
                            value={li.Renewal_Date as string || ''}
                            onChange={(e) => updateLineItem(i, 'Renewal_Date', e.target.value)}
                            className="bg-surface border border-csa-accent/50 rounded-lg px-2 py-1 text-sm text-text-primary outline-none focus:border-csa-accent w-[130px]"
                          />
                        </td>
                        <td className="text-right">
                          <span className="relative group/total">
                            <span className="text-text-primary font-semibold">{symbol}{lineTotal.toFixed(2)}</span>
                            {resellerPercentage != null && (li._unitPrice as number) > 0 && unitPrice !== (li._unitPrice as number) && (
                              <span className="absolute right-0 top-full mt-1 z-10 bg-csa-dark border border-border rounded-lg px-2.5 py-1.5 text-[10px] text-text-secondary whitespace-nowrap opacity-0 pointer-events-none group-hover/total:opacity-100 transition-opacity shadow-lg">
                                List: {symbol}{((li._unitPrice as number) * qty).toFixed(2)} &minus; {resellerPercentage}% commission
                              </span>
                            )}
                          </span>
                        </td>
                        <td>
                          <button onClick={() => removeLineItem(i)} className="p-1 text-text-muted hover:text-error transition-colors cursor-pointer">
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          <button
            onClick={addLineItem}
            className="mt-3 flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-csa-accent bg-csa-accent/10 border border-csa-accent/30 border-dashed rounded-xl hover:bg-csa-accent/20 transition-colors cursor-pointer w-full justify-center"
          >
            <Plus size={14} />
            Add Line Item
          </button>
        </motion.div>

        {/* Totals */}
        {lineItems.length > 0 ? (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mb-8">
            <div className="max-w-sm ml-auto bg-surface border border-border-subtle rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-surface-raised">
                <span className="text-sm font-bold text-text-primary uppercase tracking-wider">Sub Total</span>
                <span className="text-lg font-bold text-csa-accent">{symbol}{subtotal.toFixed(2)}</span>
              </div>
            </div>
          </motion.div>
        ) : null}
      </div>

      {/* SKU Builder Modal */}
      {skuBuilderIndex !== null ? (
        <SKUBuilder
          region={resellerRegion}
          onSelect={(product) => handleProductSelect(skuBuilderIndex, product)}
          onCancel={() => setSkuBuilderIndex(null)}
        />
      ) : null}
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
      <p className="text-sm text-text-primary truncate" title={value || undefined}>{value || '\u2014'}</p>
    </div>
  );
}

function EditDateCard({ label, value, onChange, icon }: { label: string; value: string; onChange: (v: string) => void; icon: React.ReactNode }) {
  return (
    <div className="bg-surface border border-csa-accent/50 rounded-xl px-4 py-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-csa-accent uppercase tracking-wider mb-1">
        {icon}
        {label}
      </div>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent border-none text-sm text-text-primary outline-none w-full"
      />
    </div>
  );
}
