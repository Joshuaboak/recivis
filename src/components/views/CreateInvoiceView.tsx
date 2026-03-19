'use client';

import { useState, useEffect } from 'react';
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
import SKUBuilder from '../SKUBuilder';

const CURRENCIES = ['AUD', 'USD', 'EUR', 'GBP', 'INR', 'NZD'];

export default function CreateInvoiceView() {
  const { newInvoiceContext, setCurrentView, setSelectedAccountId, setSelectedInvoiceId, setInvoiceReturnView } = useAppStore();

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

  // Fetch reseller currency on load
  useEffect(() => {
    if (!resellerData?.id) return;
    fetch(`/api/resellers?resellerId=${resellerData.id}`)
      .then(res => res.json())
      .then(data => {
        const reseller = data.resellers?.[0];
        if (reseller?.currency) {
          setCurrency(reseller.currency);
        }
        if (reseller?.region) {
          setResellerRegion(reseller.region);
        }
      })
      .catch(() => {});
  }, [resellerData?.id]);
  const [saving, setSaving] = useState(false);
  const [skuBuilderIndex, setSkuBuilderIndex] = useState<number | null>(null);

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
    setLineItems(prev => prev.map((li, i) => {
      if (i !== index) return li;
      return {
        ...li,
        Product_Name: { name: product.name, id: product.id },
        List_Price: product.unitPrice,
        _unitPrice: product.unitPrice,
      };
    }));
    setSkuBuilderIndex(null);
  };

  const goBack = () => {
    setCurrentView('account-detail');
  };

  const createInvoice = async () => {
    if (lineItems.length === 0 || !account?.id) return;
    setSaving(true);

    try {
      const invoiceDateFormatted = formatDateDisplay(invoiceDate);
      const subject = `${account.name} - Invoice - ${invoiceDateFormatted}`;

      const invoicedItems = lineItems.map(li => {
        const item: Record<string, unknown> = {
          Product_Name: li.Product_Name,
          Quantity: li.Quantity,
          List_Price: li.List_Price,
          Start_Date: li.Start_Date,
          Renewal_Date: li.Renewal_Date,
        };
        // If price differs from product unit price, set Contract_Term_Years to 0
        if (li.List_Price !== li._unitPrice) {
          item.Contract_Term_Years = 0;
        } else {
          item.Contract_Term_Years = 1;
        }
        return item;
      });

      // Map reseller region to the SKU region format for Zoho
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
        // Navigate to the created invoice
        setSelectedInvoiceId(data.id);
        setInvoiceReturnView('account-detail');
        setCurrentView('invoice-detail');
      } else {
        // Stay on page
        setSaving(false);
      }
    } catch {
      setSaving(false);
    }
  };

  const subtotal = lineItems.reduce((sum, li) => {
    const qty = (li.Quantity as number) || 0;
    const price = (li.List_Price as number) || 0;
    return sum + qty * price;
  }, 0);

  if (!account) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <p className="text-text-muted">No account selected</p>
        <button onClick={() => setCurrentView('accounts')} className="text-csa-accent text-sm cursor-pointer">Back to Accounts</button>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <button onClick={goBack} className="w-9 h-9 flex items-center justify-center bg-surface-raised rounded-xl hover:bg-surface-overlay transition-colors cursor-pointer">
              <ArrowLeft size={18} className="text-text-secondary" />
            </button>

            <div className="flex items-center gap-2 px-3 py-1.5 bg-csa-accent/10 border border-csa-accent/30 rounded-xl">
              <span className="text-[10px] font-semibold text-csa-accent uppercase tracking-wider">New Invoice</span>
              <span className="text-sm font-bold text-csa-accent">New Product</span>
            </div>

            <span className="px-2.5 py-1.5 text-[11px] font-bold uppercase rounded-lg border bg-warning/20 text-warning border-warning/30">
              Draft
            </span>

            <div className="flex-1" />

            <button
              onClick={createInvoice}
              disabled={saving || lineItems.length === 0 || lineItems.some(li => !li.Product_Name)}
              className="flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-success bg-success/10 border border-success/30 rounded-xl hover:bg-success/20 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? 'Creating...' : 'Create Invoice'}
            </button>
          </div>

          <h1 className="text-2xl font-bold text-text-primary ml-12">
            {account.name} - Invoice - {formatDateDisplay(invoiceDate)}
          </h1>
        </div>

        {/* Invoice Info Cards */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          <InfoCard label="Account" value={account.name || '\u2014'} icon={<Building2 size={14} />} />
          <InfoCard label="Contact" value={contact?.name || '\u2014'} icon={<User size={14} />} />
          <InfoCard label="Reseller" value={resellerData?.name || '\u2014'} icon={<Globe size={14} />} />

          <EditDateCard label="Invoice Date" value={invoiceDate} onChange={setInvoiceDate} icon={<Calendar size={14} />} />
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
            <div className="border border-border-subtle rounded-xl overflow-hidden">
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
                        <td className="text-right text-text-primary font-semibold">{symbol}{lineTotal.toFixed(2)}</td>
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
      <p className="text-sm text-text-primary truncate">{value || '\u2014'}</p>
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
