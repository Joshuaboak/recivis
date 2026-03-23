/**
 * CreateEvaluationModal — Create an evaluation licence for an account/prospect.
 *
 * Two-step flow:
 * 1. Select a product via SKUBuilder
 * 2. Set quantity (default 1) and end date (default today + 30 days)
 *
 * Permission-gated: canCreateEvaluations, canExtendEvaluations (for > 30 days).
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, Package, Calendar, Hash, Beaker } from 'lucide-react';
import SKUBuilder from './SKUBuilder';

interface CreateEvaluationModalProps {
  accountId: string;
  accountName: string;
  region: string;
  canExtend: boolean;
  onSuccess: (assetId: string) => void;
  onClose: () => void;
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
  region,
  canExtend,
  onSuccess,
  onClose,
}: CreateEvaluationModalProps) {
  const [step, setStep] = useState<'product' | 'details'>('product');
  const [selectedProduct, setSelectedProduct] = useState<{ id: string; name: string; sku: string; unitPrice: number } | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [endDate, setEndDate] = useState(getDefaultEndDate());
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  // Max end date: 30 days unless canExtend
  const maxEndDate = canExtend ? '' : getDefaultEndDate();

  // Calculate days from today
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

  const handleProductSelect = (product: { id: string; name: string; sku: string; unitPrice: number }) => {
    setSelectedProduct(product);
    setStep('details');
  };

  const handleCreate = async () => {
    if (!selectedProduct) return;
    setCreating(true);
    setError('');

    try {
      const res = await fetch('/api/evaluations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          productId: selectedProduct.id,
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

  // Step 1: Product selection via SKUBuilder
  if (step === 'product') {
    return (
      <SKUBuilder
        region={region}
        onSelect={handleProductSelect}
        onCancel={onClose}
      />
    );
  }

  // Step 2: Quantity and date
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

          {/* Selected Product */}
          <div className="bg-surface rounded-xl px-4 py-3 border border-border-subtle">
            <label className="text-[10px] uppercase font-bold text-text-muted tracking-wider flex items-center gap-1.5">
              <Package size={11} /> Product
            </label>
            <p className="text-sm text-text-primary font-semibold mt-1">{selectedProduct?.name}</p>
            <p className="text-[11px] text-text-muted font-mono">{selectedProduct?.sku}</p>
            <button
              onClick={() => setStep('product')}
              className="mt-2 text-[10px] text-csa-accent hover:text-csa-accent/80 cursor-pointer"
            >
              Change product
            </button>
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
            disabled={creating || !selectedProduct}
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
