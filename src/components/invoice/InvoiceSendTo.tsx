/**
 * InvoiceSendTo — The send-to toggle section (Reseller vs Customer).
 *
 * Controls whether the invoice and licence keys are sent to
 * the reseller (with CSA Geo Sales Rep CC) or directly to the
 * customer (with reseller + CSA Geo Sales Rep CC).
 * Only editable while the invoice is in Draft status.
 *
 * The Customer option is hidden unless the reseller holds the
 * "Allow Direct Customer Communication" permission.
 */
'use client';

import { motion } from 'framer-motion';
import { Send, Loader2 } from 'lucide-react';
import { orderRecipient } from '@/lib/order-recipients';

// The two routings, described by the same module the confirmation dialogs read,
// so this panel and the dialog before sending cannot say different things.
const RESELLER_ROUTE = orderRecipient({ Reseller_Direct_Purchase: true });
const CUSTOMER_ROUTE = orderRecipient({ Reseller_Direct_Purchase: false });

interface InvoiceSendToProps {
  /** The full invoice record (reads Reseller_Direct_Purchase flag) */
  invoice: Record<string, unknown>;
  /** Current invoice status — toggle only allowed when Draft */
  status: string;
  /** Whether a toggle update is in progress */
  updatingDirectPurchase: boolean;
  /** Handler to toggle the Reseller_Direct_Purchase flag */
  onToggleDirectPurchase: (value: boolean) => void;
  /** Reseller's "Allow Direct Customer Communication" permission. When false the
   *  Customer option is hidden — unless the order is already routed that way, in
   *  which case it stays visible but inert so the routing isn't misrepresented. */
  allowDirectCustomer: boolean;
}

export default function InvoiceSendTo({
  invoice,
  status,
  updatingDirectPurchase,
  onToggleDirectPurchase,
  allowDirectCustomer,
}: InvoiceSendToProps) {
  const isCustomerMode = !invoice.Reseller_Direct_Purchase;
  const showCustomerOption = allowDirectCustomer || isCustomerMode;
  /**
   * Routing is settled when the order is, not when it is sent.
   *
   * This was Draft-only, so an order sent for payment could no longer have its
   * recipient corrected — and the recipient is who the licence keys go to when
   * the order is eventually processed.
   */
  const locked = status === 'Approved';
  const customerSelectable = allowDirectCustomer && !locked;

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
            onClick={() => !locked && !updatingDirectPurchase && onToggleDirectPurchase(true)}
            disabled={updatingDirectPurchase || locked}
            className={`flex-1 px-4 py-3 rounded-xl border-2 text-left transition-all ${
              invoice.Reseller_Direct_Purchase
                ? 'border-csa-accent bg-csa-accent/10'
                : 'border-border-subtle hover:border-border'
            } ${locked ? 'cursor-default' : 'cursor-pointer'}`}
          >
            <div className={`text-sm font-semibold mb-0.5 ${invoice.Reseller_Direct_Purchase ? 'text-csa-accent' : 'text-text-secondary'}`}>
              Reseller
            </div>
            <p className="text-xs text-text-muted">
              Sent to the reseller, CC {RESELLER_ROUTE.copiedTo}
            </p>
          </button>

          {/* Customer option — permission-gated */}
          {showCustomerOption ? (
            <button
              onClick={() => customerSelectable && !updatingDirectPurchase && onToggleDirectPurchase(false)}
              disabled={updatingDirectPurchase || !customerSelectable}
              title={allowDirectCustomer ? undefined : 'Direct customer communication is not enabled for this reseller.'}
              className={`flex-1 px-4 py-3 rounded-xl border-2 text-left transition-all ${
                isCustomerMode
                  ? 'border-csa-accent bg-csa-accent/10'
                  : 'border-border-subtle hover:border-border'
              } ${customerSelectable ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <div className={`text-sm font-semibold mb-0.5 ${isCustomerMode ? 'text-csa-accent' : 'text-text-secondary'}`}>
                Customer
              </div>
              <p className="text-xs text-text-muted">
                Sent to the customer, CC {CUSTOMER_ROUTE.copiedTo}
              </p>
            </button>
          ) : null}
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
