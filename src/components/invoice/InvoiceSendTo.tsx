/**
 * InvoiceSendTo — The send-to toggle section (Reseller vs Customer).
 *
 * Controls whether the invoice and licence keys are sent to
 * the reseller (with CSA Geo Sales Rep CC) or directly to the
 * customer (with reseller + CSA Geo Sales Rep CC).
 * Only editable while the invoice is in Draft status.
 */
'use client';

import { motion } from 'framer-motion';
import { Send, Loader2 } from 'lucide-react';

interface InvoiceSendToProps {
  /** The full invoice record (reads Reseller_Direct_Purchase flag) */
  invoice: Record<string, unknown>;
  /** Current invoice status — toggle only allowed when Draft */
  status: string;
  /** Whether a toggle update is in progress */
  updatingDirectPurchase: boolean;
  /** Handler to toggle the Reseller_Direct_Purchase flag */
  onToggleDirectPurchase: (value: boolean) => void;
}

export default function InvoiceSendTo({
  invoice,
  status,
  updatingDirectPurchase,
  onToggleDirectPurchase,
}: InvoiceSendToProps) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="mb-8">
      <div className="bg-surface border border-border-subtle rounded-xl px-5 py-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
          <Send size={14} />
          Order and Licence Keys will be sent to
        </div>

        {/* Reseller vs Customer toggle */}
        <div className="flex gap-3">
          {/* Reseller option */}
          <button
            onClick={() => status === 'Draft' && !updatingDirectPurchase && onToggleDirectPurchase(true)}
            disabled={updatingDirectPurchase || status !== 'Draft'}
            className={`flex-1 px-4 py-3 rounded-xl border-2 text-left transition-all ${
              invoice.Reseller_Direct_Purchase
                ? 'border-csa-accent bg-csa-accent/10'
                : 'border-border-subtle hover:border-border'
            } ${status !== 'Draft' ? 'cursor-default' : 'cursor-pointer'}`}
          >
            <div className={`text-sm font-semibold mb-0.5 ${invoice.Reseller_Direct_Purchase ? 'text-csa-accent' : 'text-text-secondary'}`}>
              Reseller
            </div>
            <p className="text-xs text-text-muted">
              Sent to the reseller, CC the CSA Geo Sales Rep
            </p>
          </button>

          {/* Customer option */}
          <button
            onClick={() => status === 'Draft' && !updatingDirectPurchase && onToggleDirectPurchase(false)}
            disabled={updatingDirectPurchase || status !== 'Draft'}
            className={`flex-1 px-4 py-3 rounded-xl border-2 text-left transition-all ${
              !invoice.Reseller_Direct_Purchase
                ? 'border-csa-accent bg-csa-accent/10'
                : 'border-border-subtle hover:border-border'
            } ${status !== 'Draft' ? 'cursor-default' : 'cursor-pointer'}`}
          >
            <div className={`text-sm font-semibold mb-0.5 ${!invoice.Reseller_Direct_Purchase ? 'text-csa-accent' : 'text-text-secondary'}`}>
              Customer
            </div>
            <p className="text-xs text-text-muted">
              Sent to the customer, CC the reseller and CSA Geo Sales Rep
            </p>
          </button>
        </div>

        {/* Loading indicator */}
        {updatingDirectPurchase ? (
          <div className="flex items-center gap-2 mt-2 text-xs text-text-muted">
            <Loader2 size={12} className="animate-spin" />
            Updating...
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}
