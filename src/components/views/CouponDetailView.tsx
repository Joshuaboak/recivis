/**
 * CouponDetailView — View a single coupon's configuration and restrictions.
 *
 * Displays:
 * - Discount type and value (percentage or fixed amount)
 * - Currency, validity period, and usage counts
 * - Restriction sections: regions, partners, products, order types, order value
 * - Link to open the coupon record directly in Zoho CRM
 *
 * Data: Fetches from /api/coupons/[id].
 * Zoho stores multi-select picklists as semicolon-delimited strings or arrays;
 * the toArray() helper normalizes both formats.
 */

'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Ticket, Loader2, ExternalLink, Percent, DollarSign, Calendar, Hash, Globe, Package, ShoppingCart } from 'lucide-react';
import { useAppStore } from '@/lib/store';

const REGION_LABELS: Record<string, string> = { AU: 'Australia', EU: 'Europe', NA: 'North America', AS: 'Asia', NZ: 'New Zealand', WW: 'Worldwide' };

export default function CouponDetailView() {
  const { selectedCouponId, setCurrentView } = useAppStore();
  const [coupon, setCoupon] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selectedCouponId) return;
    setLoading(true);
    fetch(`/api/coupons/${selectedCouponId}`)
      .then(res => res.json())
      .then(data => setCoupon(data.coupon))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedCouponId]);

  const formatDate = (d: unknown) => {
    if (!d || typeof d !== 'string') return '\u2014';
    const date = new Date(d);
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
  };

  const crmLink = `https://crm.zoho.com.au/crm/org7002802215/tab/Coupons/${selectedCouponId}`;

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

  const status = coupon.Status as string;
  const discountType = coupon.Discount_Type as string;
  const toArray = (v: unknown): string[] => {
    if (Array.isArray(v)) return v;
    if (typeof v === 'string') return v.split(';').filter(Boolean);
    return [];
  };
  const regions = toArray(coupon.Regions);
  const products = toArray(coupon.Allowed_Products);
  const orderTypes = toArray(coupon.Order_Type);
  const partners = Array.isArray(coupon.Partners)
    ? (coupon.Partners as { name?: string }[]).map(p => p.name || '').filter(Boolean)
    : [];
  const discountProduct = coupon.Discount_Product as { name?: string; id?: string } | null;

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
              status === 'Active' ? 'bg-success/20 text-success border-success/30'
                : status === 'Draft' ? 'bg-warning/20 text-warning border-warning/30'
                : 'bg-text-muted/20 text-text-muted border-border-subtle'
            }`}>{status}</span>

            <div className="flex-1" />

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
              {discountType === 'Percentage Based' ? <Percent size={14} /> : <DollarSign size={14} />}
              Discount
            </div>
            <p className="text-lg font-bold text-csa-accent">
              {discountType === 'Percentage Based'
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
