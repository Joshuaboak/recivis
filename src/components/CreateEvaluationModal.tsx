/**
 * CreateEvaluationModal — Create an evaluation licence for an account/prospect.
 *
 * Evaluation SKUs follow a fixed pattern: {PRODUCT}-SU-CB-EVA-1YR-SUB-WW
 * The user only selects the product (CSD, CSP, STR, CEZ), then sets
 * quantity (default 1) and end date (default today + 30 days).
 *
 * Permission-gated: canCreateEvaluations, canExtendEvaluations (for > 30 days).
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Calendar, Hash, Beaker } from 'lucide-react';

interface CreateEvaluationModalProps {
  accountId: string;
  accountName: string;
  canExtend: boolean;
  onSuccess: (assetId: string) => void;
  onClose: () => void;
}

const EVAL_PRODUCTS = [
  { code: 'CSD', label: 'Civil Site Design' },
  { code: 'CSP', label: 'Civil Site Design Plus' },
  { code: 'STR', label: 'Stringer' },
  { code: 'CEZ', label: 'Corridor EZ' },
];

function buildEvalSku(productCode: string): string {
  return `${productCode}-SU-CB-EVA-1YR-SUB-WW`;
}

function getDefaultEndDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

function getTodayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function CreateEvaluationModal({
  accountId,
  accountName,
  canExtend,
  onSuccess,
  onClose,
}: CreateEvaluationModalProps) {
  const [selectedCode, setSelectedCode] = useState('');
  const [resolvedProduct, setResolvedProduct] = useState<{ id: string; name: string; sku: string } | null>(null);
  const [resolving, setResolving] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [endDate, setEndDate] = useState(getDefaultEndDate());
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const maxEndDate = canExtend ? '' : getDefaultEndDate();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endDateObj = new Date(endDate);
  const daysDiff = Math.ceil((endDateObj.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  const stableClose = useCallback(onClose, [onClose]);
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') stableClose(); };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [stableClose]);

  // Resolve SKU to Zoho product when product code changes
  useEffect(() => {
    if (!selectedCode) {
      setResolvedProduct(null);
      return;
    }

    setResolving(true);
    setError('');
    const sku = buildEvalSku(selectedCode);

    fetch(`/api/products?sku=${encodeURIComponent(sku)}`)
      .then(res => res.json())
      .then(data => {
        const products = data.products || [];
        if (products.length > 0) {
          const p = products[0];
          setResolvedProduct({ id: p.id, name: p.Product_Name || p.Product_Code, sku });
        } else {
          setResolvedProduct(null);
          setError(`No product found for SKU: ${sku}`);
        }
        setResolving(false);
      })
      .catch(() => {
        setError('Failed to look up product');
        setResolving(false);
      });
  }, [selectedCode]);

  const handleCreate = async () => {
    if (!resolvedProduct) return;
    setCreating(true);
    setError('');

    try {
      const res = await fetch('/api/evaluations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          productId: resolvedProduct.id,
          quantity,
          endDate,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to create evaluation');
        setCreating(false);
        return;
      }

      onSuccess(data.id);
    } catch {
      setError('Failed to create evaluation');
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative bg-csa-dark border border-border rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <Beaker size={18} className="text-success" />
            <h2 className="text-base font-bold text-text-primary">Create Evaluation</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-raised transition-colors cursor-pointer">
            <X size={16} className="text-text-muted" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Account */}
          <div>
            <label className="text-[10px] uppercase font-bold text-text-muted tracking-wider">Account</label>
            <p className="text-sm text-text-primary font-semibold">{accountName}</p>
          </div>

          {/* Product Selector */}
          <div>
            <label className="text-[10px] uppercase font-bold text-text-muted tracking-wider mb-1.5 block">Product</label>
            <div className="grid grid-cols-2 gap-2">
              {EVAL_PRODUCTS.map(p => (
                <button
                  key={p.code}
                  type="button"
                  onClick={() => setSelectedCode(p.code)}
                  className={`px-3 py-2.5 text-xs font-semibold rounded-xl border transition-all cursor-pointer text-left ${
                    selectedCode === p.code
                      ? 'bg-success/15 border-success/40 text-success ring-1 ring-success/20'
                      : 'bg-surface border-border-subtle text-text-secondary hover:border-border hover:bg-surface-raised'
                  }`}
                >
                  <span className="block">{p.label}</span>
                  <span className="block text-[10px] font-mono text-text-muted mt-0.5">{p.code}</span>
                </button>
              ))}
            </div>
            {resolving && (
              <div className="flex items-center gap-2 mt-2 text-xs text-text-muted">
                <Loader2 size={12} className="animate-spin" /> Looking up product...
              </div>
            )}
            {resolvedProduct && !resolving && (
              <p className="mt-2 text-[11px] text-text-muted font-mono">{resolvedProduct.sku}</p>
            )}
          </div>

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
              onChange={e => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-24 bg-csa-dark border border-border-subtle px-3 py-2 text-sm text-text-primary rounded-lg"
            />
          </div>

          {/* End Date */}
          <div>
            <label className="text-[10px] uppercase font-bold text-text-muted tracking-wider flex items-center gap-1.5 mb-1.5">
              <Calendar size={11} /> End Date
              <span className="text-text-muted font-normal normal-case">({daysDiff} days)</span>
            </label>
            <input
              type="date"
              min={getTodayStr()}
              max={maxEndDate || undefined}
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-48 bg-csa-dark border border-border-subtle px-3 py-2 text-sm text-text-primary rounded-lg"
            />
            {!canExtend && (
              <p className="text-[10px] text-text-muted mt-1">Maximum 30 days. Contact admin for longer evaluations.</p>
            )}
          </div>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-xs text-error">
                {error}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border-subtle">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-text-muted bg-surface-raised border border-border-subtle rounded-xl cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={creating || !resolvedProduct || resolving}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-success border border-success/50 rounded-xl hover:bg-success/90 transition-colors cursor-pointer disabled:opacity-50"
          >
            {creating ? <Loader2 size={14} className="animate-spin" /> : <Beaker size={14} />}
            {creating ? 'Creating...' : 'Create Evaluation'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
