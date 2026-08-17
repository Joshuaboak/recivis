/**
 * RenewMonthlySubscriptionsModal — Confirm and run a monthly renewal.
 *
 * Renewing is a billable act, so it carries the same "you will be billed by X
 * for Y" acknowledgement as creating one. Prices come from /api/subscriptions
 * so the figures always match what the create form quoted; an asset whose
 * product is no longer on the monthly price list is still renewable, it just
 * cannot be priced here and is called out rather than quietly counted as zero.
 */

'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Loader2, RefreshCw, AlertTriangle } from 'lucide-react';

/** The minimum an asset needs to be priced and renewed. */
export interface RenewableSubscription {
  id: string;
  /** Display label — usually the product name. */
  label: string;
  /** Full SKU, e.g. CSD-SU-CL-COM-1YR-SUB-ANZ. The product code is its head. */
  productCode: string;
  /** Whether the asset carries the perpetual purchase plan tag. */
  perpetualPlan: boolean;
  quantity: number;
}

interface PriceSet {
  usdList: number;
  usdReseller: number;
  localList: number | null;
  localReseller: number | null;
}

interface MonthlyProductOption {
  code: string;
  standard: PriceSet;
  perpetual: PriceSet | null;
}

interface RenewMonthlySubscriptionsModalProps {
  subscriptions: RenewableSubscription[];
  onDone: (renewedIds: string[], failures: Array<{ id: string; reason: string }>) => void;
  onClose: () => void;
}

function formatPrice(usd: number, local: number | null, currency: string): string {
  const usdPart = `$${usd.toFixed(2)} USD`;
  if (local == null || currency === 'USD') return usdPart;
  return `${usdPart} (${local.toFixed(2)} ${currency})`;
}

export default function RenewMonthlySubscriptionsModal({
  subscriptions,
  onDone,
  onClose,
}: RenewMonthlySubscriptionsModalProps) {
  const [products, setProducts] = useState<MonthlyProductOption[]>([]);
  const [currency, setCurrency] = useState('USD');
  const [billedBy, setBilledBy] = useState('Civil Survey Applications');
  const [termDays, setTermDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [acknowledged, setAcknowledged] = useState(false);
  const [renewing, setRenewing] = useState(false);
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
      .catch(() => setError('Failed to load subscription pricing'))
      .finally(() => setLoading(false));
  }, []);

  // Price each selected subscription off its SKU's leading product code.
  let totalUsd = 0;
  let totalLocal: number | null = 0;
  const unpriced: string[] = [];

  for (const sub of subscriptions) {
    const code = sub.productCode.split('-')[0];
    const product = products.find(p => p.code === code);
    const price = product && sub.perpetualPlan ? product.perpetual : product?.standard;
    if (!price) {
      unpriced.push(sub.label);
      continue;
    }
    totalUsd += price.usdReseller * sub.quantity;
    if (totalLocal != null && price.localReseller != null) totalLocal += price.localReseller * sub.quantity;
    else totalLocal = null;
  }

  const handleRenew = async () => {
    setRenewing(true);
    setError('');
    try {
      const res = await fetch('/api/subscriptions/renew', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetIds: subscriptions.map(s => s.id) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to renew');
        setRenewing(false);
        return;
      }
      onDone(
        (data.renewed || []).map((r: { id: string }) => r.id),
        data.failed || []
      );
    } catch {
      setError('Failed to renew');
      setRenewing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto py-8">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative my-auto bg-csa-dark border border-border rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[calc(100vh-4rem)] overflow-y-auto"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <RefreshCw size={18} className="text-csa-accent" />
            <h2 className="text-base font-bold text-text-primary">
              Renew Monthly {subscriptions.length === 1 ? 'Subscription' : 'Subscriptions'}
            </h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-raised transition-colors cursor-pointer">
            <X size={16} className="text-text-muted" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="space-y-1">
            {subscriptions.map(s => (
              <div key={s.id} className="flex items-center justify-between gap-3 text-xs">
                <span className="text-text-primary truncate">{s.label}</span>
                <span className="text-text-muted flex-shrink-0">
                  {s.quantity > 1 ? `x${s.quantity}` : ''}{s.perpetualPlan ? ' · perpetual plan' : ''}
                </span>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-text-muted">
            Each subscription is extended by {termDays} days. Ones still in date extend from their
            current renewal date; ones that have lapsed extend from today.
          </p>

          {loading ? (
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <Loader2 size={14} className="animate-spin" /> Loading pricing...
            </div>
          ) : (
            <>
              {unpriced.length > 0 && (
                <p className="flex items-start gap-2 text-[11px] text-warning">
                  <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
                  <span>
                    Not on the current monthly price list, so excluded from the total below but still
                    renewed: {unpriced.join(', ')}.
                  </span>
                </p>
              )}
              <label className="flex items-start gap-2.5 px-3 py-3 bg-warning/8 border border-warning/30 rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={e => setAcknowledged(e.target.checked)}
                  className="w-4 h-4 mt-0.5 rounded accent-csa-accent cursor-pointer"
                />
                <span className="text-xs text-text-primary">
                  You will be billed by <span className="font-semibold">{billedBy}</span> for{' '}
                  <span className="font-semibold">{formatPrice(totalUsd, totalLocal, currency)}</span>{' '}
                  for this renewal.
                </span>
              </label>
            </>
          )}

          {error && <p className="text-xs text-error">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border-subtle">
          <button onClick={onClose} className="px-4 py-2 text-xs font-semibold text-text-muted bg-surface-raised border border-border-subtle rounded-xl cursor-pointer">
            Cancel
          </button>
          <button
            onClick={handleRenew}
            disabled={renewing || !acknowledged || subscriptions.length === 0}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-csa-accent border border-csa-accent/50 rounded-xl hover:bg-csa-accent/90 transition-colors cursor-pointer disabled:opacity-50"
          >
            {renewing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {renewing ? 'Renewing...' : 'Confirm Renewal'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
