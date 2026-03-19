'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Ticket, Save, Loader2, ChevronDown, Search } from 'lucide-react';
import { useAppStore } from '@/lib/store';

const CURRENCIES = ['AUD', 'USD', 'EUR', 'INR'];
const REGIONS = ['AU', 'EU', 'NA', 'AS', 'NZ', 'WW'];
const REGION_LABELS: Record<string, string> = { AU: 'Australia', EU: 'Europe', NA: 'North America', AS: 'Asia', NZ: 'New Zealand', WW: 'Worldwide' };
const PRODUCTS = ['Civil Site Design', 'Civil Site Design Plus', 'Stringer', 'CorridorEZ'];
const ORDER_TYPES = ['New Product', 'Renewal'];

export default function CreateCouponView() {
  const { user, setCurrentView, setSelectedCouponId } = useAppStore();
  const isAdmin = user?.role === 'admin' || user?.role === 'ibm';

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

  const [saving, setSaving] = useState(false);
  const [attempted, setAttempted] = useState(false);

  // Load resellers for partner restrictions
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

  const isValid = couponCode.trim() && couponName.trim() && discountType &&
    (discountType === 'Percentage Based' ? discountPercentage : discountAmount);

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-text-muted">Only System Admins and International Business Managers can create coupons.</p>
      </div>
    );
  }

  const toggleMulti = (arr: string[], val: string, setter: (v: string[]) => void) => {
    setter(arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val]);
  };

  const handleSave = async () => {
    setAttempted(true);
    if (!isValid) return;
    setSaving(true);

    try {
      const data: Record<string, unknown> = {
        Name: couponCode.trim(),
        Coupon_Name: couponName.trim(),
        Discount_Type: discountType,
        Currency: currency,
        Status: status,
      };

      if (description) data.Coupon_Description = description;
      if (discountType === 'Percentage Based' && discountPercentage) data.Discount_Percentage = parseFloat(discountPercentage);
      if (discountType === 'Fixed Amount' && discountAmount) data.Discount_Amount = parseFloat(discountAmount);
      if (startDate) data.Coupon_Start_Date = startDate;
      if (endDate) data.Coupon_End_Date = endDate;
      if (totalUses) {
        data.Total_Usage_Allowance = parseInt(totalUses);
        data.Remaining_Uses = parseInt(totalUses);
      }

      data.Region_Restrictions = regionRestrictions;
      if (regionRestrictions && selectedRegions.length > 0) data.Regions = selectedRegions.join(';');
      data.Product_Restrictions = productRestrictions;
      if (productRestrictions && selectedProducts.length > 0) data.Allowed_Products = selectedProducts.join(';');
      data.Partner_Restrictions = partnerRestrictions;
      if (partnerRestrictions && selectedPartners.length > 0) data.Partners = selectedPartners.map(p => ({ id: p.id }));
      data.Order_Type_Restrictions = orderTypeRestrictions;
      if (orderTypeRestrictions && selectedOrderTypes.length > 0) data.Order_Type = selectedOrderTypes.join(';');
      data.Usage_Restrictions = usageRestrictions;
      if (usageRestrictions) {
        if (minOrder) data.Minimum_Order_Value = parseFloat(minOrder);
        if (maxOrder) data.Maximum_Order_Value = parseFloat(maxOrder);
      }

      const res = await fetch('/api/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await res.json();

      if (result.id) {
        setSelectedCouponId(result.id);
        setCurrentView('coupon-detail');
      }
    } catch { /* handled */ }
    setSaving(false);
  };

  const inputCls = (valid: boolean) =>
    `w-full bg-surface border-2 px-4 py-2.5 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-xl ${attempted && !valid ? 'border-error' : 'border-border-subtle'}`;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Create Coupon</h1>
            <p className="text-sm text-text-muted mt-1">Create a discount coupon for invoices</p>
          </div>
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-success bg-success/10 border border-success/30 rounded-xl hover:bg-success/20 transition-colors cursor-pointer disabled:opacity-40">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? 'Creating...' : 'Create Coupon'}
          </button>
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
