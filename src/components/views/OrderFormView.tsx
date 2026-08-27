/**
 * OrderFormView — the order form, for building a new order and for editing one.
 *
 * One component, two jobs, because they were two and drifted: the create page
 * grew currency conversion, the send-to toggle and licence alignment, while the
 * edit form was a different set of fields on the order page that still said
 * "line item amounts are not converted" and offered send-to as a read-only
 * label. An order raised through one and corrected through the other went
 * through two different pricing models.
 *
 * The only difference between the two is where the save goes: POST a new record
 * or PATCH an existing one. Everything above that — the fields, the pricing, the
 * alignment, the validation — is the same code by construction rather than by
 * anyone remembering to change both.
 *
 * Create mode is pre-populated from newInvoiceContext (set by AccountDetailView)
 * and drafts unsaved work per account; edit mode reads the order and its lines
 * from the CRM, and does not draft, because the record is the persistence.
 */

'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
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
  CalendarClock,
  Info,
  X,
} from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { buildPath } from '@/lib/routes';
import { CURRENCIES as SUPPORTED_CURRENCIES } from '@/lib/constants';
import { orderLinePrice, rateFor, contractTermYears } from '@/lib/pricing';
import { isRenewable, renewabilityOf } from '@/lib/renewal-eligibility';
import InvoiceSendTo from '../invoice/InvoiceSendTo';
import { useGuardedRouter } from '@/lib/useGuardedRouter';
import { useUnsavedChanges } from '@/components/UnsavedChangesProvider';
import { useDraft } from '@/lib/useDraft';
import { DraftRestoreBar } from '@/components/DraftRestoreBar';
import SKUBuilder from '../SKUBuilder';

// From lib/constants so the list cannot drift per view — it already had.
const CURRENCIES = SUPPORTED_CURRENCIES;

/** A licence a new line's renewal date can be lined up with. */
interface AlignableAsset {
  id: string;
  product: string;
  renewalDate: string;
  serialKey: string;
}

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

export default function OrderFormView({ invoiceId }: { invoiceId?: string } = {}) {
  /** Editing an existing order rather than building a new one. */
  const isEdit = !!invoiceId;
  const { newInvoiceContext, user } = useAppStore();
  /** The order being edited, once it has loaded. */
  const [existing, setExisting] = useState<Record<string, unknown> | null>(null);
  const [loadingOrder, setLoadingOrder] = useState(isEdit);
  const [loadError, setLoadError] = useState('');
  const router = useGuardedRouter();
  const { registerDirty } = useUnsavedChanges();

  // In edit mode the parties come off the record; in create mode from the
  // context the account page set on the way in.
  const account = (isEdit
    ? (existing?.Account_Name as { name?: string; id?: string } | null)
    : (newInvoiceContext?.account as { name?: string; id?: string } | null)) || null;
  const contact = (isEdit
    ? (existing?.Contact_Name as { name?: string; id?: string } | null)
    : (newInvoiceContext?.contact as { name?: string; id?: string } | null)) || null;
  const resellerData = (isEdit
    ? (existing?.Reseller as { name?: string; id?: string } | null)
    : (newInvoiceContext?.reseller as { name?: string; id?: string } | null)) || null;
  const [resellerRegion, setResellerRegion] = useState((newInvoiceContext?.region as string) || 'AU');
  const ownerData = (isEdit
    ? (existing?.Owner as { name?: string; id?: string } | null)
    : (newInvoiceContext?.owner as { name?: string; id?: string } | null)) || null;
  const billingCountry = (isEdit
    ? (existing?.Billing_Country as string)
    : (newInvoiceContext?.billingCountry as string)) || '';

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
  // Editing does not draft: the record is the persistence, and restoring a
  // stale half-edit over a saved order would be worse than losing it.
  const isDirty = !isEdit && (lineItems.length > 0 || invoiceDate !== today || dueDate !== plus30);

  const { pendingDraft, pendingDraftSavedAt, restore, discard, clear } =
    useDraft<InvoiceDraft>(draftKey, isDirty ? draft : EMPTY_INVOICE_DRAFT);

  // Drafts survive browser Back; this makes in-app navigation prompt first.
  useEffect(() => {
    const label = isEdit ? 'your changes to this order' : 'this new order';
    registerDirty('order-form', isDirty, label);
    return () => registerDirty('order-form', false);
  }, [registerDirty, isDirty, isEdit]);

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
  /**
   * Whether this user may address an order to the end customer at all.
   *
   * Without it there is only one routing and only one price, so the toggle is
   * not rendered — a control with one reachable value is just something to
   * misread. The prices are the reseller ones in that case, which is what
   * routing everything via the partner means.
   */
  const canChooseCustomer = !!user?.permissions?.canDirectCustomerComms;
  /**
   * Exchange rates from the CRM, target-currency-per-AUD.
   *
   * Every product price in Zoho is in AUD, so nothing can be priced until
   * these arrive. Fetched once and re-read whenever the currency changes.
   */
  const [rates, setRates] = useState<Array<{ code: string; rate: number }>>([]);
  /**
   * Licences on this customer whose renewal date a new line could be lined up
   * with — active, still in date, and an ordinary commercial licence.
   *
   * Aligning is only meaningful against something that is actually running:
   * an expired licence has no renewal date worth matching, and an evaluation
   * or an NFR is not on a renewal cycle at all. `isRenewable` already draws
   * that line for renewals, so alignment uses the same one rather than a
   * second opinion about what counts as a real licence.
   */
  const [alignableAssets, setAlignableAssets] = useState<AlignableAsset[]>([]);
  /** Which line's alignment picker is open, if any. */
  const [aligningIndex, setAligningIndex] = useState<number | null>(null);
  /**
   * The order type. A co-term is not a different flow, it is this flow with a
   * renewal date borrowed from an existing licence — so the type follows the
   * dates rather than being chosen up front.
   */
  const [invoiceType, setInvoiceType] = useState('New Product');

  /**
   * Load the order being edited, and the AUD price behind each of its lines.
   *
   * The line only stores a converted figure, so repricing it for a new currency
   * or a new routing needs the product's AUD price back — which is why each
   * line's product is read here rather than the numbers on screen being scaled.
   */
  useEffect(() => {
    if (!invoiceId) return;
    setLoadingOrder(true);
    fetch(`/api/invoices/${invoiceId}`)
      .then(async res => ({ ok: res.ok, data: await res.json() }))
      .then(async ({ ok, data }) => {
        if (!ok || !data.invoice) {
          setLoadError(data.error || 'This order could not be loaded.');
          return;
        }
        const inv = data.invoice as Record<string, unknown>;
        setExisting(inv);
        setInvoiceDate(((inv.Invoice_Date as string) || '').slice(0, 10) || today);
        setDueDate(((inv.Due_Date as string) || '').slice(0, 10) || plus30);
        setCurrency((inv.Currency as string) || 'AUD');
        setInvoiceType((inv.Invoice_Type as string) || 'New Product');
        setResellerDirect(!!inv.Reseller_Direct_Purchase);

        const lines = (data.lineItems || []) as Record<string, unknown>[];
        const withAud = await Promise.all(lines.map(async li => {
          const productId = (li.Product_Name as { id?: string } | null)?.id;
          let aud = 0;
          if (productId) {
            try {
              const r = await fetch(`/api/products?id=${encodeURIComponent(productId)}`);
              const d = await r.json();
              aud = Number(d.products?.[0]?.Unit_Price) || 0;
            } catch { /* leave at 0 — the line simply will not reprice */ }
          }
          return {
            ...li,
            _audUnitPrice: aud,
            _listPrice: li.List_Price,
            // A saved price is not something this session typed, so it stays
            // eligible for repricing until somebody edits the field.
            _priceEditedByHand: false,
            _alignedTo: (li.Align_to as { id?: string } | null)?.id,
          };
        }));
        setLineItems(withAud);
      })
      .catch(() => setLoadError('This order could not be loaded.'))
      .finally(() => setLoadingOrder(false));
  }, [invoiceId, today, plus30]);

  // The customer's licences, for the alignment picker.
  useEffect(() => {
    if (!account?.id) return;
    fetch(`/api/accounts/${account.id}`)
      .then(res => res.json())
      .then(data => {
        const active = (data.activeAssets || []) as Array<Record<string, unknown>>;
        setAlignableAssets(
          active
            .filter(a => {
              if (!isRenewable(renewabilityOf(a))) return false;
              const renewal = a.Renewal_Date as string | undefined;
              // "End date after today" — a licence that lapses today or earlier
              // has nothing left to line up with.
              return !!renewal && renewal > today;
            })
            .map(a => ({
              id: a.id as string,
              product: (a.Product as { name?: string } | null)?.name || (a.Name as string) || 'Licence',
              renewalDate: a.Renewal_Date as string,
              serialKey: (a.Serial_Key as string) || '',
            }))
            .sort((x, y) => x.renewalDate.localeCompare(y.renewalDate))
        );
      })
      .catch(() => {});
  }, [account?.id, today]);

  useEffect(() => {
    fetch('/api/currencies')
      .then(res => res.json())
      .then(data => setRates(data.currencies || []))
      .catch(() => {});
  }, []);

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
        // The partner's own preference sets the default: one that does not deal
        // with customers directly takes everything itself. A partner without
        // the direct-customer permission has no choice to make, so the default
        // is the only answer — see `canChooseCustomer`.
        setResellerDirect(canChooseCustomer ? !reseller?.Direct_Customer_Contact : true);
      })
      .catch(() => {});
  }, [resellerData?.id, canChooseCustomer]);
  const [saving, setSaving] = useState(false);
  /** Why the last Create Order attempt failed, shown beside the button. */
  const [createError, setCreateError] = useState('');
  const [skuBuilderIndex, setSkuBuilderIndex] = useState<number | null>(null);

  // The account context only ever lives in the store, so a cold deep link to
  // this route has nothing to build an order from. Send the user back to pick
  // an account rather than showing an empty form.
  useEffect(() => {
    // Only in create mode: an edit gets its account from the record, so a
    // missing one there means the order is still loading, not that somebody
    // arrived without picking a customer.
    if (!isEdit && !account) {
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
      _audUnitPrice: 0,
      _listPrice: 0,
      _priceEditedByHand: false,
    }]);
  };

  /**
   * Line a line item up with an existing licence's renewal date.
   *
   * Borrowing the date is the whole of it: the period becomes short, the order
   * becomes a Co-Term, and the CRM pro-rates the price from those dates when
   * the order is saved. Nothing here works out a price — see the notice this
   * puts on screen.
   */
  const alignLineTo = (index: number, asset: AlignableAsset) => {
    setLineItems(prev => prev.map((li, i) => (
      i === index
        // `Align_to` is a lookup to the licence on the line item, and the CRM
        // fills Renewal_Date from it. The date is set here as well so the form
        // shows the period it is about to charge for, rather than leaving a
        // blank until the record comes back.
        ? { ...li, Align_to: { id: asset.id }, Renewal_Date: asset.renewalDate, _alignedTo: asset.id }
        : li
    )));
    setInvoiceType('Co-Term');
    setAligningIndex(null);
  };

  /** Drop an alignment, and the Co-Term type with it if nothing else is aligned. */
  const clearAlignment = (index: number) => {
    setLineItems(prev => {
      const next = prev.map((li, i) => (
        i === index
          ? { ...li, Align_to: null, Renewal_Date: plus364, _alignedTo: undefined }
          : li
      ));
      if (!next.some(li => li._alignedTo)) setInvoiceType('New Product');
      return next;
    });
  };

  const anyAligned = lineItems.some(li => li._alignedTo && !li._deleted);

  /**
   * Remove a line.
   *
   * A line that has never been saved just goes. One that exists in the CRM is
   * marked instead, because a subform is updated by id: dropping it from the
   * array leaves it on the record, and the removal would appear to work and
   * then not have. It is filtered out of the display and sent as a deletion.
   */
  const removeLineItem = (index: number) => {
    setLineItems(prev => prev.flatMap((li, i) => {
      if (i !== index) return [li];
      return li.id ? [{ ...li, _deleted: true }] : [];
    }));
  };

  /** The lines on screen — everything except the ones queued for deletion. */
  const visibleLineItems = lineItems.filter(li => !li._deleted);

  const updateLineItem = (index: number, field: string, value: unknown) => {
    setLineItems(prev => prev.map((li, i) => i === index ? { ...li, [field]: value } : li));
  };

  const handleProductSelect = (index: number, product: { id: string; name: string; sku: string; unitPrice: number }) => {
    // `unitPrice` off the product is in AUD, whatever region the SKU is for.
    const priced = orderLinePrice({
      audListPrice: product.unitPrice,
      rate: rateFor(rates, currency),
      resellerPercentage,
      resellerDirect: !!resellerDirect,
    });

    setLineItems(prev => prev.map((li, i) => {
      if (i !== index) return li;
      return {
        ...li,
        Product_Name: { name: product.name, id: product.id },
        List_Price: priced.price,
        _audUnitPrice: product.unitPrice,
        _listPrice: priced.listPrice,
        // Reset: picking a product replaces whatever was in the price field.
        _priceEditedByHand: false,
      };
    }));
    setSkuBuilderIndex(null);
  };

  /**
   * Reprice every line that has not been hand-edited.
   *
   * Runs when the currency changes or the routing does, because both move the
   * answer: the rate converts the AUD list price, and the routing decides
   * whether the partner's commission comes off it. A line somebody has typed a
   * price into is left alone — that figure was a decision, not a calculation.
   */
  useEffect(() => {
    const rate = rateFor(rates, currency);
    setLineItems(prev => prev.map(li => {
      // A line queued for deletion is about to stop existing; repricing it
      // would only put a changed figure into the delete payload.
      if (li._deleted || li._priceEditedByHand) return li;
      const aud = Number(li._audUnitPrice);
      if (!Number.isFinite(aud) || aud <= 0) return li;
      const priced = orderLinePrice({
        audListPrice: aud,
        rate,
        resellerPercentage,
        resellerDirect: !!resellerDirect,
      });
      if (priced.price === li.List_Price && priced.listPrice === li._listPrice) return li;
      return { ...li, List_Price: priced.price, _listPrice: priced.listPrice };
    }));
  }, [currency, rates, resellerPercentage, resellerDirect]);

  const goBack = () => {
    // Leaving an edit goes back to the order, not to the customer: the order is
    // where you came from and what you were looking at.
    if (isEdit && invoiceId) {
      router.push(buildPath('invoice-detail', invoiceId));
      return;
    }
    router.push(account?.id ? buildPath('account-detail', account.id) : buildPath('accounts'));
  };

  const createInvoice = async () => {
    if (visibleLineItems.length === 0 || !account?.id) return;
    setSaving(true);

    try {
      const invoiceDateFormatted = formatDateDisplay(invoiceDate);
      const subject = `${account.name} - Order - ${invoiceDateFormatted}`;

      const invoicedItems = lineItems.map(li => {
        // An existing line the user removed. Zoho takes the id and the flag.
        if (li._deleted) return { id: li.id, _delete: true };

        const item: Record<string, unknown> = {
          Quantity: li.Quantity,
          List_Price: li.List_Price,
          Start_Date: li.Start_Date,
          Renewal_Date: li.Renewal_Date,
        };
        // An existing line is updated by id; Zoho rejects a product change on
        // one, so the lookup only goes up for a line being added.
        if (li.id) item.id = li.id;
        else item.Product_Name = li.Product_Name;
        // The licence this line renews alongside, when one was picked.
        if (li.Align_to !== undefined) item.Align_to = li.Align_to;
        if (li.Asset_Code) item.Asset_Code = li.Asset_Code;
        // 1 pro-rates the price across the dates; 0 bills it exactly as sent.
        // This used to compare List_Price against the product's Unit_Price and
        // send 0 whenever they differed — and the reseller discount makes them
        // differ on every partner order, so pro-ration was switched off across
        // the board. A discounted price is still a calculated one; only a price
        // somebody typed is final.
        item.Contract_Term_Years = contractTermYears(!!li._priceEditedByHand);
        return item;
      });

      // Map reseller region codes (AU, NZ) to SKU region codes (ANZ) for Zoho
      const REGION_MAP: Record<string, string> = {
        AU: 'ANZ', NZ: 'ANZ', AF: 'AF', AS: 'AS', EU: 'EU', NA: 'NA', WW: 'WW',
      };
      const skuRegion = REGION_MAP[resellerRegion] || resellerRegion;

      // What both modes write. An edit sends only these: the record already
      // has its subject, parties and status, and the PATCH route accepts a
      // deliberately short list of fields anyway.
      const invoiceData: Record<string, unknown> = {
        Invoice_Date: invoiceDate,
        Due_Date: dueDate,
        Currency: currency,
        Reseller_Direct_Purchase: resellerDirect ?? false,
        Invoiced_Items: invoicedItems,
      };

      if (!isEdit) {
        invoiceData.Subject = subject;
        invoiceData.Account_Name = { id: account.id };
        invoiceData.Status = 'Draft';
        invoiceData.Invoice_Type = invoiceType;
        invoiceData.Reseller_Region = skuRegion;
        invoiceData.Send_Invoice = false;
        invoiceData.Don_t_Make_Keys = false;
        invoiceData.Automatically_Send_Email = false;
        if (contact?.id) invoiceData.Contact_Name = { id: contact.id };
        if (resellerData?.id) invoiceData.Reseller = { id: resellerData.id };
        if (ownerData?.id) invoiceData.Owner = { id: ownerData.id };
        if (billingCountry) invoiceData.Billing_Country = billingCountry;
      } else if (invoiceType !== ((existing?.Invoice_Type as string) || '')) {
        // Aligning a line during an edit turns the order into a co-term, so
        // the type has to travel with it.
        invoiceData.Invoice_Type = invoiceType;
      }

      // The one difference between the two modes: update the record, or make
      // one. Everything above this line is identical either way.
      const res = await fetch(
        isEdit ? `/api/invoices/${invoiceId}` : '/api/invoices',
        {
          method: isEdit ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(invoiceData),
        }
      );

      const data = await res.json();
      const savedId = isEdit ? invoiceId : data.id;
      if (res.ok && savedId) {
        clear();
        registerDirty('order-form', false);
        router.push(buildPath('invoice-detail', savedId));
      } else {
        // Both routes permission-check on the server rather than on this
        // button, so saying what came back beats the spinner simply stopping.
        setCreateError(
          data.error || (isEdit ? 'The order could not be saved.' : 'The order could not be created.')
        );
        setSaving(false);
      }
    } catch {
      setCreateError(
        isEdit ? 'The order could not be saved. Please try again.'
               : 'The order could not be created. Please try again.'
      );
      setSaving(false);
    }
  };

  const subtotal = visibleLineItems.reduce((sum, li) => {
    const qty = (li.Quantity as number) || 0;
    const price = (li.List_Price as number) || 0;
    return sum + qty * price;
  }, 0);

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
        <p className="text-text-muted max-w-md">{loadError}</p>
        <button onClick={() => router.push(buildPath('draft-invoices'))} className="text-csa-accent text-sm cursor-pointer">
          Back to Orders
        </button>
      </div>
    );
  }

  // Loading the record, or redirecting because no customer was picked.
  if (loadingOrder || !account) {
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
        {!isEdit && pendingDraft && pendingDraftSavedAt !== null ? (
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
              <span className="text-[10px] font-semibold text-csa-accent uppercase tracking-wider">
                {isEdit ? `Editing #${(existing?.Reference_Number as string) || ''}` : 'New Order'}
              </span>
              <span className="text-sm font-bold text-csa-accent">New Product</span>
            </div>

            <span className="px-2.5 py-1.5 text-[11px] font-bold uppercase rounded-lg border bg-warning/20 text-warning border-warning/30">
              Draft
            </span>

            <div className="flex-1" />

            <button
              onClick={() => { setCreateError(''); createInvoice(); }}
              disabled={saving || visibleLineItems.length === 0 || visibleLineItems.some(li => !li.Product_Name)}
              className="flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-success bg-success/10 border border-success/30 rounded-xl hover:bg-success/20 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving
                ? (isEdit ? 'Saving...' : 'Creating...')
                : (isEdit ? 'Save Changes' : 'Create Order')}
            </button>
          </div>

          {createError ? (
            <p className="ml-12 mt-2 text-xs text-error">{createError}</p>
          ) : null}

          {/* An existing order keeps the subject it was saved with; a new one
              is titled the way it is about to be. */}
          {(() => {
            const heading = isEdit
              ? ((existing?.Subject as string) || `${account.name} - Order`)
              : `${account.name} - Order - ${formatDateDisplay(invoiceDate)}`;
            return (
              <h1 className="text-2xl font-bold text-text-primary ml-12 truncate" title={heading}>
                {heading}
              </h1>
            );
          })()}
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

        {/* Where the order goes — and therefore what it costs. Shown here rather
            than only on the saved order, because it decides whether the prices
            below are list or the partner's, and reading them without it is
            reading half the answer. Hidden entirely for a partner who may not
            address an order to a customer: one reachable value is not a choice. */}
        {canChooseCustomer && resellerDirect !== null && (
          <InvoiceSendTo
            invoice={{ Reseller_Direct_Purchase: resellerDirect }}
            status="Draft"
            updatingDirectPurchase={false}
            onToggleDirectPurchase={setResellerDirect}
            allowDirectCustomer={canChooseCustomer}
          />
        )}

        {/* Line Items */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-8">
          <h2 className="text-lg font-bold text-text-primary mb-3 flex items-center gap-2">
            <Package size={18} className="text-csa-accent" />
            Line Items ({visibleLineItems.length})
          </h2>

          {/* Said while the order is being built, not after. The figure on
              screen is the annual price; the short-period one is worked out by
              the CRM on save, and somebody who does not know that reads the
              total as wrong. */}
          {anyAligned && (
            <div className="mb-3 flex items-start gap-2 px-4 py-3 bg-csa-highlight/10 border border-csa-accent/30 rounded-xl">
              <Info size={14} className="text-csa-accent flex-shrink-0 mt-0.5" />
              <p className="text-xs text-text-secondary leading-relaxed">
                This order is a <span className="font-semibold text-text-primary">Co-Term</span>: an
                aligned line runs to the licence&apos;s existing renewal date rather than a full
                year. The prices shown are the annual ones —{' '}
                <span className="font-semibold text-text-primary">the pro-rated amount is
                calculated when the order is saved</span>.
              </p>
            </div>
          )}
          {/* The table carries no scroller of its own: an order has a handful of
              lines and all of them should be on screen. The overflow that used
              to be here clipped the alignment popover and turned the panel into
              a scrolling box. */}
          {visibleLineItems.length > 0 ? (
            <div className="border border-border-subtle rounded-xl">
              <table className="w-full">
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
                    // Mapped over the full list so `i` still addresses the line
                    // the handlers will update; the removed ones just do not
                    // render.
                    if (li._deleted) return null;
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
                                // Typed, so it stops being recalculated and is
                                // billed as written.
                                updateLineItem(i, '_priceEditedByHand', true);
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
                          {/* The align control sits beside the date, not under
                              it: stacked, it grew the row and shifted the date
                              up whenever a customer had a licence to align to. */}
                          <div className="flex items-center gap-2">
                            {alignableAssets.length > 0 && (
                              li._alignedTo ? (
                                <button
                                  onClick={() => clearAlignment(i)}
                                  title="Stop aligning this line and go back to a full year"
                                  aria-label="Stop aligning this line"
                                  className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-lg bg-success/20 border border-success/50 text-success hover:bg-success/30 transition-colors cursor-pointer"
                                >
                                  <CalendarClock size={13} />
                                </button>
                              ) : (
                                <button
                                  onClick={() => setAligningIndex(i)}
                                  title="Line this up with a licence the customer already holds"
                                  aria-label="Align to an existing licence"
                                  className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-lg bg-success/10 border border-success/30 text-success/70 hover:bg-success/20 hover:text-success transition-colors cursor-pointer"
                                >
                                  <CalendarClock size={13} />
                                </button>
                              )
                            )}
                            <input
                              type="date"
                              value={li.Renewal_Date as string || ''}
                              onChange={(e) => updateLineItem(i, 'Renewal_Date', e.target.value)}
                              className="bg-surface border border-csa-accent/50 rounded-lg px-2 py-1 text-sm text-text-primary outline-none focus:border-csa-accent w-[130px]"
                            />
                          </div>
                        </td>
                        <td className="text-right">
                          <span className="relative group/total">
                            <span className="text-text-primary font-semibold">{symbol}{lineTotal.toFixed(2)}</span>
                            {resellerPercentage != null && (li._listPrice as number) > 0 && unitPrice !== (li._listPrice as number) && (
                              <span className="absolute right-0 top-full mt-1 z-10 bg-csa-dark border border-border rounded-lg px-2.5 py-1.5 text-[10px] text-text-secondary whitespace-nowrap opacity-0 pointer-events-none group-hover/total:opacity-100 transition-opacity shadow-lg">
                                List: {symbol}{((li._listPrice as number) * qty).toFixed(2)} &minus; {resellerPercentage}% commission
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
        {visibleLineItems.length > 0 ? (
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

      {/* Licence alignment picker.
          A dialog rather than a dropdown in the cell: inside the table it was
          clipped by the row and turned the line items into a scrolling panel,
          and a customer can hold several licences worth showing properly. */}
      {aligningIndex !== null ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setAligningIndex(null)} />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="relative bg-csa-dark border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[calc(100vh-4rem)] flex flex-col"
          >
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-border-subtle">
              <div>
                <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
                  <CalendarClock size={16} className="text-success" />
                  Renew together with
                </h2>
                <p className="text-xs text-text-muted mt-1">
                  The new licence will run to the date you pick, and the price is pro-rated
                  when the order is saved.
                </p>
              </div>
              <button
                onClick={() => setAligningIndex(null)}
                className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg hover:bg-surface-raised transition-colors cursor-pointer"
                aria-label="Close"
              >
                <X size={16} className="text-text-muted" />
              </button>
            </div>

            <div className="overflow-y-auto p-3 space-y-2">
              {alignableAssets.map(asset => (
                <button
                  key={asset.id}
                  onClick={() => alignLineTo(aligningIndex, asset)}
                  className="w-full text-left px-4 py-3 bg-surface border border-border-subtle rounded-xl hover:border-success/50 hover:bg-success/5 transition-colors cursor-pointer"
                >
                  <span className="block text-sm font-semibold text-text-primary">{asset.product}</span>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-xs text-text-muted">
                    <span className="flex items-center gap-1">
                      <CalendarClock size={11} />
                      Renews {formatDateDisplay(asset.renewalDate)}
                    </span>
                    {asset.serialKey ? <span className="font-mono">{asset.serialKey}</span> : null}
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        </div>
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
