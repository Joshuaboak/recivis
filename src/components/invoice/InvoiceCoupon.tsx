/**
 * InvoiceCoupon — The apply-coupon section of the invoice detail view.
 *
 * Lets authorised users enter and validate a coupon code, which adds
 * a discount line item to the invoice. Only visible when the user
 * has permission and the invoice is in Draft status.
 */
'use client';

import { motion } from 'framer-motion';
import { Ticket, Loader2, Check } from 'lucide-react';

interface InvoiceCouponProps {
  /** Whether the coupon section should be shown (permissions + Draft status) */
  canApply: boolean;
  /** Current value of the coupon code input */
  couponCode: string;
  /** Whether coupon validation is in progress */
  couponValidating: boolean;
  /** Error message from failed validation, if any */
  couponError: string | null;
  /** The code of the successfully applied coupon, if any */
  couponApplied: string | null;
  /** Update the coupon code input value */
  onChangeCouponCode: (value: string) => void;
  /** Submit the coupon for validation and application */
  onApplyCoupon: () => void;
}

export default function InvoiceCoupon({
  canApply,
  couponCode,
  couponValidating,
  couponError,
  couponApplied,
  onChangeCouponCode,
  onApplyCoupon,
}: InvoiceCouponProps) {
  // Don't render anything if the user can't apply coupons
  if (!canApply) return null;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="mb-8">
      <div className="bg-surface border border-border-subtle rounded-xl px-5 py-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
          <Ticket size={14} />
          Apply Coupon
        </div>

        {/* Coupon input + apply button */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={couponCode}
            onChange={e => onChangeCouponCode(e.target.value.toUpperCase())}
            placeholder="Enter coupon code"
            className="flex-1 bg-csa-dark border border-border-subtle px-3 py-2 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-lg font-mono"
            onKeyDown={e => e.key === 'Enter' && onApplyCoupon()}
          />
          <button
            onClick={onApplyCoupon}
            disabled={couponValidating || !couponCode.trim()}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-csa-accent bg-csa-accent/10 border border-csa-accent/30 rounded-lg hover:bg-csa-accent/20 transition-colors cursor-pointer disabled:opacity-40"
          >
            {couponValidating ? <Loader2 size={13} className="animate-spin" /> : <Ticket size={13} />}
            {couponValidating ? 'Validating...' : 'Apply'}
          </button>
        </div>

        {/* Error message */}
        {couponError ? (
          <p className="text-xs text-error mt-2">{couponError}</p>
        ) : null}

        {/* Success message */}
        {couponApplied ? (
          <p className="text-xs text-success mt-2 flex items-center gap-1">
            <Check size={12} />
            Coupon {couponApplied} applied
          </p>
        ) : null}
      </div>
    </motion.div>
  );
}
