/**
 * CreateMonthlySubscriptionModal — Create a 30-day subscription licence.
 *
 * Deliberately shaped like CreateEvaluationModal: pick a product, set a
 * quantity, confirm. The differences are that the product list and its prices
 * come from the server (only products with a commercial cloud SKU for the
 * partner's region are offered), the term is fixed at 30 days, and the partner
 * has to acknowledge who is billing them and for how much before it will
 * create anything.
 *
 * Permission-gated upstream on canMonthlySubscriptions.
 */

'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Hash, CalendarClock, Infinity as InfinityIcon } from 'lucide-react';

interface PriceSet {
  usdList: number;
  usdReseller: number;
  localList: number | null;
  localReseller: number | null;
}

interface MonthlyProductOption {
  code: string;
  label: string;
  sku: string;
  productId: string;
  productName: string;
  standard: PriceSet;
  perpetual: PriceSet | null;
}

interface CreateMonthlySubscriptionModalProps {
  accountId: string;
  accountName: string;
  onSuccess: (assetId: string, warning?: string) => void;
  onClose: () => void;
}

/** "$42.00 USD (A$63.64)" — the USD charge with the partner's own currency alongside. */
function formatPrice(usd: number, local: number | null, currency: string): string {
  const usdPart = `$${usd.toFixed(2)} USD`;
  if (local == null || currency === 'USD') return usdPart;
  return `${usdPart} (${local.toFixed(2)} ${currency})`;
}

export default function CreateMonthlySubscriptionModal({
  accountId,
  accountName,
  onSuccess,
  onClose,
}: CreateMonthlySubscriptionModalProps) {
  const [products, setProducts] = useState<MonthlyProductOption[]>([]);
  const [currency, setCurrency] = useState('USD');
  const [billedBy, setBilledBy] = useState('Civil Survey Applications');
  const [termDays, setTermDays] = useState(30);
  const [loading, setLoading] = useState(true);

  const [selectedCode, setSelectedCode] = useState('');
  const [perpetualPlan, setPerpetualPlan] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [acknowledged, setAcknowledged] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  useEffect(() => {
    fetch('/api/subscriptions')
      .then(res => res.json())
      .then(data => {
        if (data.error) { setError(data.error); return; }
        setProducts(data.products || []);
        setCurrency(data.currency || 'USD');
        setBilledBy(data.billedBy || 'Civil Survey Applications');
        setTermDays(data.termDays || 30);
      })
      .catch(() => setError('Failed to load monthly products'))
      .finally(() => setLoading(false));
  }, []);

  const selected = products.find(p => p.code === selectedCode) || null;
  const canUsePerpetual = !!selected?.perpetual;
  const activePrice = selected
    ? (perpetualPlan && selected.perpetual ? selected.perpetual : selected.standard)
    : null;

  // Changing product must not carry a perpetual choice onto a product that
  // has no plan — the price shown would silently revert to standard.
  const chooseProduct = (code: string) => {
    setSelectedCode(code);
    setAcknowledged(false);
    const next = products.find(p => p.code === code);
    if (!next?.perpetual) setPerpetualPlan(false);
  };

  const lineTotalUsd = activePrice ? activePrice.usdReseller * quantity : 0;
  const lineTotalLocal = activePrice?.localReseller != null ? activePrice.localReseller * quantity : null;

  const handleCreate = async () => {
    if (!selected || !acknowledged) return;
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, productCode: selected.code, quantity, perpetualPlan }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to create monthly subscription');
        setCreating(false);
        return;
      }
      onSuccess(data.id, data.warning);
    } catch {
      setError('Failed to create monthly subscription');
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto py-8">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative my-auto bg-csa-dark border border-border rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[calc(100vh-4rem)] overflow-y-auto"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <CalendarClock size={18} className="text-csa-accent" />
            <h2 className="text-base font-bold text-text-primary">Create Monthly Subscription</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-raised transition-colors cursor-pointer">
            <X size={16} className="text-text-muted" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="text-[10px] uppercase font-bold text-text-muted tracking-wider">Account</label>
            <p className="text-sm text-text-primary font-semibold">{accountName}</p>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-xs text-text-muted py-4">
              <Loader2 size={14} className="animate-spin" /> Loading products and pricing...
            </div>
          ) : products.length === 0 ? (
            <p className="text-xs text-text-muted py-4">
              No monthly products are available for your region.
            </p>
          ) : (
            <>
              {/* Product */}
              <div>
                <label className="text-[10px] uppercase font-bold text-text-muted tracking-wider mb-1.5 block">Product</label>
                <div className="space-y-2">
                  {products.map(p => (
                    <button
                      key={p.code}
                      type="button"
                      onClick={() => chooseProduct(p.code)}
                      className={`w-full px-3 py-2.5 text-xs font-semibold rounded-xl border transition-all cursor-pointer text-left ${
                        selectedCode === p.code
                          ? 'bg-csa-accent/15 border-csa-accent/40 text-csa-accent ring-1 ring-csa-accent/20'
                          : 'bg-surface border-border-subtle text-text-secondary hover:border-border hover:bg-surface-raised'
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span>{p.label}</span>
                        <span className="font-mono text-[11px] text-text-muted">
                          {formatPrice(p.standard.usdReseller, p.standard.localReseller, currency)}/mo
                        </span>
                      </span>
                      <span className="block text-[10px] font-mono text-text-muted mt-0.5">{p.sku}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Perpetual purchase plan — Civil Site Design only */}
              {canUsePerpetual && (
                <label className="flex items-start gap-2.5 px-3 py-2.5 bg-surface border border-border-subtle rounded-xl cursor-pointer">
                  <input
                    type="checkbox"
                    checked={perpetualPlan}
                    onChange={e => { setPerpetualPlan(e.target.checked); setAcknowledged(false); }}
                    className="w-4 h-4 mt-0.5 rounded accent-csa-accent cursor-pointer"
                  />
                  <span>
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-text-primary">
                      <InfinityIcon size={12} /> Perpetual purchase plan
                    </span>
                    <span className="block text-[10px] text-text-muted mt-0.5">
                      Pay monthly towards a perpetual licence at the higher rate.
                    </span>
                  </span>
                </label>
              )}

              {/* Quantity */}
              <div>
                <label className="text-[10px] uppercase font-bold text-text-muted tracking-wider flex items-center gap-1.5 mb-1.5">
                  <Hash size={11} /> Quantity
                </label>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={quantity}
                  onChange={e => { setQuantity(Math.max(1, parseInt(e.target.value) || 1)); setAcknowledged(false); }}
                  className="w-24 bg-csa-dark border border-border-subtle px-3 py-2 text-sm text-text-primary rounded-lg"
                />
              </div>

              {/* Term */}
              <p className="text-[11px] text-text-muted">
                Runs {termDays} days from today and can be renewed {termDays} days at a time.
              </p>

              {/* Billing acknowledgement — the whole point of the confirmation */}
              {activePrice && (
                <label className="flex items-start gap-2.5 px-3 py-3 bg-warning/8 border border-warning/30 rounded-xl cursor-pointer">
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={e => setAcknowledged(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded accent-csa-accent cursor-pointer"
                  />
                  <span className="text-xs text-text-primary">
                    You will be billed by <span className="font-semibold">{billedBy}</span> for{' '}
                    <span className="font-semibold">
                      {formatPrice(lineTotalUsd, lineTotalLocal, currency)}
                    </span>{' '}
                    per month{quantity > 1 ? ` (${quantity} licences)` : ''}.
                    <span className="block text-[10px] text-text-muted mt-1">
                      Recommended sell price to the customer:{' '}
                      {formatPrice(activePrice.usdList * quantity, activePrice.localList != null ? activePrice.localList * quantity : null, currency)}.
                    </span>
                  </span>
                </label>
              )}
            </>
          )}

          <AnimatePresence>
            {error && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-xs text-error">
                {error}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border-subtle">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-text-muted bg-surface-raised border border-border-subtle rounded-xl cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={creating || !selected || !acknowledged}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-csa-accent border border-csa-accent/50 rounded-xl hover:bg-csa-accent/90 transition-colors cursor-pointer disabled:opacity-50"
          >
            {creating ? <Loader2 size={14} className="animate-spin" /> : <CalendarClock size={14} />}
            {creating ? 'Creating...' : 'Create Subscription'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
