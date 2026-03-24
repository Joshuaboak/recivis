/**
 * CouponDetailView — View and edit a single coupon's configuration and restrictions.
 *
 * Displays:
 * - Discount type and value (percentage or fixed amount)
 * - Currency, validity period, and usage counts
 * - Restriction sections: regions, partners, products, order types, order value
 * - Link to open the coupon record directly in Zoho CRM
 *
 * Edit mode (admin/IBM only) presents the same form fields as CreateCouponView,
 * pre-populated from the loaded coupon, and saves via PATCH /api/coupons/[id].
 *
 * Data: Fetches from /api/coupons/[id].
 * Zoho stores multi-select picklists as semicolon-delimited strings or arrays;
 * the toArray() helper normalizes both formats.
 */

'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Ticket, Loader2, ExternalLink, Percent, DollarSign, Calendar, Hash, Globe, Package, ShoppingCart, Pencil, Save, X, Search, ChevronDown } from 'lucide-react';
import { useAppStore } from '@/lib/store';

const CURRENCIES = ['AUD', 'USD', 'EUR', 'INR'];
const REGIONS = ['AU', 'EU', 'NA', 'AS', 'NZ', 'WW'];
const REGION_LABELS: Record<string, string> = { AU: 'Australia', EU: 'Europe', NA: 'North America', AS: 'Asia', NZ: 'New Zealand', WW: 'Worldwide' };
const PRODUCTS = ['Civil Site Design', 'Civil Site Design Plus', 'Stringer', 'CorridorEZ'];
const ORDER_TYPES = ['New Product', 'Renewal'];

function toArray(v: unknown): string[] {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') return v.split(';').filter(Boolean);
  return [];
}

export default function CouponDetailView() {
  const { selectedCouponId, setCurrentView, user } = useAppStore();
  const isAdminUser = user?.role === 'admin' || user?.role === 'ibm';
  const [coupon, setCoupon] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  // Edit mode state
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [attempted, setAttempted] = useState(false);

  // Form fields
  const [couponCode, setCouponCode] = useState('');
  const [couponName, setCouponName] = useState('');
  const [description, setDescription] = useState('');
  const [discountType, setDiscountType] = useState('Percentage Based');
  const [discountPercentage, setDiscountPercentage] = useState('');
  const [discountAmount, setDiscountAmount] = useState('');
  const [currency, setCurrency] = useState('AUD');
  const [status, setStatus] = useState('Draft');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [totalUses, setTotalUses] = useState('');
  const [regionRestrictions, setRegionRestrictions] = useState(false);
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  const [productRestrictions, setProductRestrictions] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [partnerRestrictions, setPartnerRestrictions] = useState(false);
  const [selectedPartners, setSelectedPartners] = useState<{ id: string; name: string }[]>([]);
  const [partnerSearch, setPartnerSearch] = useState('');
  const [allResellers, setAllResellers] = useState<{ id: string; name: string }[]>([]);
  const [orderTypeRestrictions, setOrderTypeRestrictions] = useState(false);
  const [selectedOrderTypes, setSelectedOrderTypes] = useState<string[]>([]);
  const [usageRestrictions, setUsageRestrictions] = useState(false);
  const [minOrder, setMinOrder] = useState('');
  const [maxOrder, setMaxOrder] = useState('');

  useEffect(() => {
    if (!selectedCouponId) return;
    setLoading(true);
    fetch(`/api/coupons/${selectedCouponId}`)
      .then(res => res.json())
      .then(data => setCoupon(data.coupon))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedCouponId]);

  // Load resellers when partner restrictions toggled on
  useEffect(() => {
    if (!partnerRestrictions || allResellers.length > 0) return;
    fetch('/api/resellers')
      .then(res => res.json())
      .then(data => setAllResellers((data.resellers || []).map((r: { id: string; name: string }) => ({ id: r.id, name: r.name }))))
      .catch(() => {});
  }, [partnerRestrictions, allResellers.length]);

  const filteredPartners = useMemo(() => {
    if (!partnerSearch) return allResellers;
    return allResellers.filter(r => r.name.toLowerCase().includes(partnerSearch.toLowerCase()));
  }, [allResellers, partnerSearch]);

  /** Populate form state from the loaded coupon record. */
  const populateForm = (c: Record<string, unknown>) => {
    setCouponCode((c.Name as string) || '');
    setCouponName((c.Coupon_Name as string) || '');
    setDescription((c.Coupon_Description as string) || '');
    setDiscountType((c.Discount_Type as string) || 'Percentage Based');
    setDiscountPercentage(c.Discount_Percentage != null ? String(c.Discount_Percentage) : '');
    setDiscountAmount(c.Discount_Amount != null ? String(c.Discount_Amount) : '');
    setCurrency((c.Currency as string) || 'AUD');
    setStatus((c.Status as string) || 'Draft');
    setStartDate((c.Coupon_Start_Date as string)?.slice(0, 10) || '');
    setEndDate((c.Coupon_End_Date as string)?.slice(0, 10) || '');
    setTotalUses(c.Total_Usage_Allowance != null ? String(c.Total_Usage_Allowance) : '');

    const rr = !!c.Region_Restrictions;
    setRegionRestrictions(rr);
    setSelectedRegions(rr ? toArray(c.Regions) : []);

    const pr = !!c.Product_Restrictions;
    setProductRestrictions(pr);
    setSelectedProducts(pr ? toArray(c.Allowed_Products) : []);

    const ptr = !!c.Partner_Restrictions;
    setPartnerRestrictions(ptr);
    setSelectedPartners(
      ptr && Array.isArray(c.Partners)
        ? (c.Partners as { id?: string; name?: string }[])
            .filter(p => p.id)
            .map(p => ({ id: p.id!, name: p.name || '' }))
        : []
    );

    const otr = !!c.Order_Type_Restrictions;
    setOrderTypeRestrictions(otr);
    setSelectedOrderTypes(otr ? toArray(c.Order_Type) : []);

    const ur = !!c.Usage_Restrictions;
    setUsageRestrictions(ur);
    setMinOrder(c.Minimum_Order_Value != null ? String(c.Minimum_Order_Value) : '');
    setMaxOrder(c.Maximum_Order_Value != null ? String(c.Maximum_Order_Value) : '');
  };

  const handleEdit = () => {
    if (!coupon) return;
    populateForm(coupon);
    setAttempted(false);
    setEditing(true);
  };

  const handleCancel = () => {
    setEditing(false);
    setAttempted(false);
  };

  const isValid = couponCode.trim() && couponName.trim() && discountType &&
    (discountType === 'Percentage Based' ? discountPercentage : discountAmount);

  const handleSave = async () => {
    setAttempted(true);
    if (!isValid || !selectedCouponId) return;
    setSaving(true);

    try {
      const data: Record<string, unknown> = {
        Name: couponCode.trim(),
        Coupon_Name: couponName.trim(),
        Discount_Type: discountType,
        Currency: currency,
        Status: status,
      };

      data.Coupon_Description = description || null;
      if (discountType === 'Percentage Based' && discountPercentage) data.Discount_Percentage = parseFloat(discountPercentage);
      if (discountType === 'Fixed Amount' && discountAmount) data.Discount_Amount = parseFloat(discountAmount);
      data.Coupon_Start_Date = startDate || null;
      data.Coupon_End_Date = endDate || null;
      if (totalUses) {
        data.Total_Usage_Allowance = parseInt(totalUses);
        data.Remaining_Uses = parseInt(totalUses);
      }

      data.Region_Restrictions = regionRestrictions;
      if (regionRestrictions && selectedRegions.length > 0) data.Regions = selectedRegions;
      else data.Regions = null;
      data.Product_Restrictions = productRestrictions;
      if (productRestrictions && selectedProducts.length > 0) data.Allowed_Products = selectedProducts;
      else data.Allowed_Products = null;
      data.Partner_Restrictions = partnerRestrictions;
      if (partnerRestrictions && selectedPartners.length > 0) data.Partners = selectedPartners.map(p => ({ id: p.id }));
      else data.Partners = null;
      data.Order_Type_Restrictions = orderTypeRestrictions;
      if (orderTypeRestrictions && selectedOrderTypes.length > 0) data.Order_Type = selectedOrderTypes;
      else data.Order_Type = null;
      data.Usage_Restrictions = usageRestrictions;
      if (usageRestrictions) {
        if (minOrder) data.Minimum_Order_Value = parseFloat(minOrder);
        else data.Minimum_Order_Value = null;
        if (maxOrder) data.Maximum_Order_Value = parseFloat(maxOrder);
        else data.Maximum_Order_Value = null;
      } else {
        data.Minimum_Order_Value = null;
        data.Maximum_Order_Value = null;
      }

      const res = await fetch(`/api/coupons/${selectedCouponId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        // Reload coupon data
        const refreshRes = await fetch(`/api/coupons/${selectedCouponId}`);
        const refreshData = await refreshRes.json();
        setCoupon(refreshData.coupon);
        setEditing(false);
      }
    } catch { /* handled */ }
    setSaving(false);
  };

  const formatDate = (d: unknown) => {
    if (!d || typeof d !== 'string') return '\u2014';
    const date = new Date(d);
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
  };

  const crmLink = `https://crm.zoho.com.au/crm/org7002802215/tab/Coupons/${selectedCouponId}`;

  const toggleMulti = (arr: string[], val: string, setter: (v: string[]) => void) => {
    setter(arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val]);
  };

  const inputCls = (valid: boolean) =>
    `w-full bg-surface border-2 px-4 py-2.5 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-xl ${attempted && !valid ? 'border-error' : 'border-border-subtle'}`;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={24} className="text-csa-accent animate-spin" />
      </div>
    );
  }

  if (!coupon) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <p className="text-text-muted">Coupon not found</p>
        <button onClick={() => setCurrentView('coupons')} className="text-csa-accent text-sm cursor-pointer">Back to Coupons</button>
      </div>
    );
  }

  const couponStatus = coupon.Status as string;
  const couponDiscountType = coupon.Discount_Type as string;
  const regions = toArray(coupon.Regions);
  const products = toArray(coupon.Allowed_Products);
  const orderTypes = toArray(coupon.Order_Type);
  const partners = Array.isArray(coupon.Partners)
    ? (coupon.Partners as { name?: string }[]).map(p => p.name || '').filter(Boolean)
    : [];
  const discountProduct = coupon.Discount_Product as { name?: string; id?: string } | null;

  // ─── EDIT MODE ───────────────────────────────────────────────────────

  if (editing) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-text-primary">Edit Coupon</h1>
              <p className="text-sm text-text-muted mt-1">Editing {coupon.Name as string}</p>
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

          {attempted && !isValid ? (
            <div className="flex items-center gap-2 text-xs text-error bg-error/10 border border-error/20 rounded-xl px-4 py-2.5 mb-6">
              Please fill in Coupon Code, Coupon Name, and Discount value.
            </div>
          ) : null}

          {/* Basic Info */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
            <h2 className="text-base font-bold text-text-primary mb-4 flex items-center gap-2">
              <Ticket size={16} className="text-csa-accent" />
              Coupon Details
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Coupon Code *</label>
                <input type="text" value={couponCode} onChange={e => setCouponCode(e.target.value.toUpperCase())} placeholder="e.g. SAVE20" className={inputCls(!!couponCode.trim())} />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Coupon Name *</label>
                <input type="text" value={couponName} onChange={e => setCouponName(e.target.value)} placeholder="Display name" className={inputCls(!!couponName.trim())} />
              </div>
              <div className="md:col-span-2">
                <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Description</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description" rows={2}
                  className="w-full bg-surface border-2 border-border-subtle px-4 py-2.5 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-xl resize-none" />
              </div>
            </div>
          </motion.div>

          {/* Discount */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="mb-8">
            <h2 className="text-base font-bold text-text-primary mb-4">Discount</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Discount Type *</label>
                <div className="relative">
                  <select value={discountType} onChange={e => setDiscountType(e.target.value)}
                    className="w-full bg-surface border-2 border-border-subtle px-4 py-2.5 text-sm text-text-primary outline-none focus:border-csa-accent rounded-xl appearance-none cursor-pointer pr-10">
                    <option value="Percentage Based">Percentage Based</option>
                    <option value="Fixed Amount">Fixed Amount</option>
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                </div>
              </div>
              {discountType === 'Percentage Based' ? (
                <div>
                  <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Percentage *</label>
                  <input type="text" inputMode="decimal" value={discountPercentage} onChange={e => setDiscountPercentage(e.target.value.replace(/[^\d.]/g, ''))} placeholder="e.g. 20"
                    className={inputCls(!!discountPercentage)} />
                </div>
              ) : (
                <div>
                  <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Amount *</label>
                  <input type="text" inputMode="decimal" value={discountAmount} onChange={e => setDiscountAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder="e.g. 500"
                    className={inputCls(!!discountAmount)} />
                </div>
              )}
              <div>
                <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Currency</label>
                <div className="relative">
                  <select value={currency} onChange={e => setCurrency(e.target.value)}
                    className="w-full bg-surface border-2 border-border-subtle px-4 py-2.5 text-sm text-text-primary outline-none focus:border-csa-accent rounded-xl appearance-none cursor-pointer pr-10">
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                </div>
              </div>
            </div>
          </motion.div>

          {/* Validity */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-8">
            <h2 className="text-base font-bold text-text-primary mb-4">Validity</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Status</label>
                <div className="relative">
                  <select value={status} onChange={e => setStatus(e.target.value)}
                    className="w-full bg-surface border-2 border-border-subtle px-4 py-2.5 text-sm text-text-primary outline-none focus:border-csa-accent rounded-xl appearance-none cursor-pointer pr-10">
                    <option value="Draft">Draft</option>
                    <option value="Active">Active</option>
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Start Date</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                  className="w-full bg-surface border-2 border-border-subtle px-4 py-2.5 text-sm text-text-primary outline-none focus:border-csa-accent rounded-xl" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">End Date</label>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                  className="w-full bg-surface border-2 border-border-subtle px-4 py-2.5 text-sm text-text-primary outline-none focus:border-csa-accent rounded-xl" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Total Uses</label>
                <input type="text" inputMode="numeric" value={totalUses} onChange={e => setTotalUses(e.target.value.replace(/\D/g, ''))} placeholder="Unlimited"
                  className="w-full bg-surface border-2 border-border-subtle px-4 py-2.5 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent rounded-xl" />
              </div>
            </div>
          </motion.div>

          {/* Restrictions */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <h2 className="text-base font-bold text-text-primary mb-4">Restrictions</h2>
            <div className="space-y-4">
              {/* Region */}
              <RestrictionToggle label="Region Restrictions" enabled={regionRestrictions} onToggle={setRegionRestrictions}>
                <div className="flex flex-wrap gap-2">
                  {REGIONS.map(r => (
                    <ToggleChip key={r} label={REGION_LABELS[r] || r} active={selectedRegions.includes(r)} onClick={() => toggleMulti(selectedRegions, r, setSelectedRegions)} />
                  ))}
                </div>
              </RestrictionToggle>

              {/* Partners */}
              <RestrictionToggle label="Partner Restrictions" enabled={partnerRestrictions} onToggle={setPartnerRestrictions}>
                <div className="space-y-2">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                    <input
                      type="text"
                      value={partnerSearch}
                      onChange={e => setPartnerSearch(e.target.value)}
                      placeholder="Search resellers..."
                      className="w-full bg-csa-dark border border-border-subtle pl-9 pr-4 py-2 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-lg"
                    />
                  </div>
                  {selectedPartners.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-1">
                      {selectedPartners.map(p => (
                        <button key={p.id} onClick={() => setSelectedPartners(prev => prev.filter(x => x.id !== p.id))}
                          className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-csa-accent/15 text-csa-accent border border-csa-accent/40 hover:bg-error/15 hover:text-error hover:border-error/40 transition-colors cursor-pointer">
                          {p.name} &times;
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="max-h-[140px] overflow-y-auto space-y-0.5">
                    {filteredPartners.filter(r => !selectedPartners.some(s => s.id === r.id)).map(r => (
                      <button key={r.id} onClick={() => setSelectedPartners(prev => [...prev, r])}
                        className="w-full text-left px-2 py-1.5 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-raised rounded-lg transition-colors cursor-pointer">
                        {r.name}
                      </button>
                    ))}
                  </div>
                </div>
              </RestrictionToggle>

              {/* Products */}
              <RestrictionToggle label="Product Restrictions" enabled={productRestrictions} onToggle={setProductRestrictions}>
                <div className="flex flex-wrap gap-2">
                  {PRODUCTS.map(p => (
                    <ToggleChip key={p} label={p} active={selectedProducts.includes(p)} onClick={() => toggleMulti(selectedProducts, p, setSelectedProducts)} />
                  ))}
                </div>
              </RestrictionToggle>

              {/* Order Type */}
              <RestrictionToggle label="Order Type Restrictions" enabled={orderTypeRestrictions} onToggle={setOrderTypeRestrictions}>
                <div className="flex flex-wrap gap-2">
                  {ORDER_TYPES.map(t => (
                    <ToggleChip key={t} label={t} active={selectedOrderTypes.includes(t)} onClick={() => toggleMulti(selectedOrderTypes, t, setSelectedOrderTypes)} />
                  ))}
                </div>
              </RestrictionToggle>

              {/* Usage */}
              <RestrictionToggle label="Order Value Restrictions" enabled={usageRestrictions} onToggle={setUsageRestrictions}>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Min Order Value</label>
                    <input type="text" inputMode="decimal" value={minOrder} onChange={e => setMinOrder(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0"
                      className="w-full bg-csa-dark border border-border-subtle px-3 py-2 text-sm text-text-primary outline-none focus:border-csa-accent rounded-lg" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Max Order Value</label>
                    <input type="text" inputMode="decimal" value={maxOrder} onChange={e => setMaxOrder(e.target.value.replace(/[^\d.]/g, ''))} placeholder="Unlimited"
                      className="w-full bg-csa-dark border border-border-subtle px-3 py-2 text-sm text-text-primary outline-none focus:border-csa-accent rounded-lg" />
                  </div>
                </div>
              </RestrictionToggle>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  // ─── READ-ONLY MODE ──────────────────────────────────────────────────

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-6">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <button onClick={() => setCurrentView('coupons')} className="w-9 h-9 flex items-center justify-center bg-surface-raised rounded-xl hover:bg-surface-overlay transition-colors cursor-pointer">
              <ArrowLeft size={18} className="text-text-secondary" />
            </button>

            <div className="flex items-center gap-2 px-3 py-1.5 bg-csa-purple/10 border border-csa-purple/30 rounded-xl">
              <Ticket size={14} className="text-csa-purple" />
              <span className="text-sm font-bold text-csa-purple font-mono">{coupon.Name as string}</span>
            </div>

            <span className={`px-2.5 py-1.5 text-[11px] font-bold uppercase rounded-lg border ${
              couponStatus === 'Active' ? 'bg-success/20 text-success border-success/30'
                : couponStatus === 'Draft' ? 'bg-warning/20 text-warning border-warning/30'
                : 'bg-text-muted/20 text-text-muted border-border-subtle'
            }`}>{couponStatus}</span>

            <div className="flex-1" />

            {isAdminUser && (
              <button onClick={handleEdit} className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-csa-accent bg-csa-accent/10 border border-csa-accent/30 rounded-xl hover:bg-csa-accent/20 transition-colors cursor-pointer">
                <Pencil size={14} />
                Edit
              </button>
            )}

            <a href={crmLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-csa-accent bg-csa-accent/10 border border-csa-accent/30 rounded-xl hover:bg-csa-accent/20 transition-colors cursor-pointer">
              <ExternalLink size={14} />
              Open in CRM
            </a>
          </div>

          <h1 className="text-2xl font-bold text-text-primary ml-12">
            {coupon.Coupon_Name as string || coupon.Name as string}
          </h1>
          {coupon.Coupon_Description ? (
            <p className="text-sm text-text-muted ml-12 mt-1">{coupon.Coupon_Description as string}</p>
          ) : null}
        </div>

        {/* Info Cards */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          <div className="bg-surface border border-border-subtle rounded-xl px-4 py-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">
              {couponDiscountType === 'Percentage Based' ? <Percent size={14} /> : <DollarSign size={14} />}
              Discount
            </div>
            <p className="text-lg font-bold text-csa-accent">
              {couponDiscountType === 'Percentage Based'
                ? `${coupon.Discount_Percentage}%`
                : `$${(coupon.Discount_Amount as number)?.toFixed(2)} ${coupon.Currency}`}
            </p>
          </div>

          <InfoCard label="Currency" value={coupon.Currency as string || '\u2014'} icon={<DollarSign size={14} />} />

          <div className="bg-surface border border-border-subtle rounded-xl px-4 py-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">
              <Calendar size={14} />
              Validity Period
            </div>
            <p className="text-sm text-text-primary">
              {formatDate(coupon.Coupon_Start_Date)} &ndash; {formatDate(coupon.Coupon_End_Date)}
            </p>
          </div>

          <div className="bg-surface border border-border-subtle rounded-xl px-4 py-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-text-muted uppercase tracking-wider mb-1">
              <Hash size={14} />
              Usage
            </div>
            <p className="text-sm text-text-primary">
              {coupon.Remaining_Uses != null
                ? `${coupon.Remaining_Uses} remaining of ${coupon.Total_Usage_Allowance}`
                : 'Unlimited'}
            </p>
          </div>

          {discountProduct ? (
            <InfoCard label="Discount Product" value={discountProduct.name || '\u2014'} icon={<Package size={14} />} />
          ) : null}
        </motion.div>

        {/* Restrictions */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-8">
          <h2 className="text-base font-bold text-text-primary mb-4">Restrictions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Regions */}
            <div className="bg-surface border border-border-subtle rounded-xl px-4 py-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                <Globe size={14} />
                Regions
              </div>
              {coupon.Region_Restrictions ? (
                <div className="flex flex-wrap gap-1.5">
                  {regions.map(r => (
                    <span key={r} className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-md bg-csa-accent/15 text-csa-accent">
                      {REGION_LABELS[r] || r}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-text-secondary">All regions</p>
              )}
            </div>

            {/* Partners */}
            <div className="bg-surface border border-border-subtle rounded-xl px-4 py-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                <Globe size={14} />
                Partners
              </div>
              {coupon.Partner_Restrictions && partners.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {partners.map(p => (
                    <span key={p} className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-md bg-success/15 text-success">{p}</span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-text-secondary">{coupon.Partner_Restrictions ? 'None specified' : 'All partners'}</p>
              )}
            </div>

            {/* Products */}
            <div className="bg-surface border border-border-subtle rounded-xl px-4 py-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                <Package size={14} />
                Products
              </div>
              {coupon.Product_Restrictions ? (
                <div className="flex flex-wrap gap-1.5">
                  {products.map(p => (
                    <span key={p} className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-md bg-csa-purple/15 text-csa-purple">{p}</span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-text-secondary">All products</p>
              )}
            </div>

            {/* Order Types */}
            <div className="bg-surface border border-border-subtle rounded-xl px-4 py-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                <ShoppingCart size={14} />
                Order Types
              </div>
              {coupon.Order_Type_Restrictions ? (
                <div className="flex flex-wrap gap-1.5">
                  {orderTypes.map(t => (
                    <span key={t} className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-md bg-warning/15 text-warning">{t}</span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-text-secondary">All order types</p>
              )}
            </div>

            {/* Order Value */}
            {coupon.Usage_Restrictions ? (
              <div className="bg-surface border border-border-subtle rounded-xl px-4 py-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                  <DollarSign size={14} />
                  Order Value
                </div>
                <p className="text-sm text-text-primary">
                  {coupon.Minimum_Order_Value ? `Min: $${(coupon.Minimum_Order_Value as number).toFixed(2)}` : ''}
                  {coupon.Minimum_Order_Value && coupon.Maximum_Order_Value ? ' \u2022 ' : ''}
                  {coupon.Maximum_Order_Value ? `Max: $${(coupon.Maximum_Order_Value as number).toFixed(2)}` : ''}
                </p>
              </div>
            ) : null}
          </div>
        </motion.div>
      </div>
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

function RestrictionToggle({ label, enabled, onToggle, children }: { label: string; enabled: boolean; onToggle: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <div className={`bg-surface border rounded-xl px-4 py-3 transition-colors ${enabled ? 'border-csa-accent/40' : 'border-border-subtle'}`}>
      <label className="flex items-center justify-between cursor-pointer mb-0">
        <span className="text-sm font-semibold text-text-primary">{label}</span>
        <button
          onClick={() => onToggle(!enabled)}
          className={`w-10 h-5 rounded-full transition-colors relative ${enabled ? 'bg-csa-accent' : 'bg-border'} cursor-pointer`}
        >
          <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
      </label>
      {enabled ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

function ToggleChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
        active
          ? 'bg-csa-accent/15 text-csa-accent border-csa-accent/40'
          : 'bg-surface text-text-secondary border-border-subtle hover:border-border'
      }`}
    >
      {label}
    </button>
  );
}
