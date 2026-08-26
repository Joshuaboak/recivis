/**
 * OrderActions — how an order gets paid for, and how it gets processed.
 *
 * Three buttons, and which of them appear is decided by what the partner is
 * allowed to do rather than by what the user feels like:
 *
 * - **Pay on Card** → Pay Now (Stripe, in a new tab) and Pay Later (email the
 *   invoice). Pay Later sends an invoice and nothing else: no keys are issued
 *   and the order is not processed until the money arrives.
 * - **Pay on Account** → Process Order. Account terms mean CSA issues the
 *   licence keys before the money arrives, so this is the one button that
 *   commits the order, and it needs a purchase order — number and document —
 *   standing in for the payment.
 *
 * Process Order confirms twice, because it is irreversible and it puts licence
 * keys in somebody's inbox. Pay Now and Pay Later confirm once: opening a
 * payment page can be closed again, and an invoice can be resent. A second
 * "are you sure" on those was noise, and noise is what makes the one that
 * matters get clicked through.
 *
 * Pay Now fetches the latest Stripe link before opening to ensure it's current.
 * After returning from the payment tab, polls for payment completion and shows
 * a success popup with recipient info.
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CreditCard, Clock, ShoppingCart, Loader2, AlertTriangle, X, CheckCircle2 } from 'lucide-react';
import { orderRecipient, recipientSentence } from '@/lib/order-recipients';

interface OrderActionsProps {
  invoice: Record<string, unknown>;
  status: string;
  selectedInvoiceId: string | null;
  /** Account terms: CSA issues keys before payment, against a purchase order. */
  payOnAccount: boolean;
  /** Card payment: Stripe now, or an emailed invoice to pay later. */
  payOnCard: boolean;
  canSend: boolean;
  /** Whether this user may commit the order on account terms. */
  canApprove: boolean;
  hasPONumber: boolean;
  hasPOFile: boolean;
  onRefresh: () => void;
}

interface ConfirmDialogState {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  confirmColor: string;
  onConfirm: () => void;
  step: 1 | 2;
  /**
   * What the second press is asked to confirm, or null for a one-step dialog.
   *
   * Only the irreversible action asks twice, and it asks something specific.
   * "This action cannot be undone" on every button trained people to click
   * through it.
   */
  confirmAgain: { title: string; message: string; confirmLabel: string } | null;
}

const initialDialog: ConfirmDialogState = {
  open: false, title: '', message: '', confirmLabel: '', confirmColor: '',
  onConfirm: () => {}, step: 1, confirmAgain: null,
};

export default function OrderActions({
  invoice, status, selectedInvoiceId,
  payOnAccount, payOnCard,
  canSend, canApprove,
  hasPONumber, hasPOFile,
  onRefresh,
}: OrderActionsProps) {
  const [dialog, setDialog] = useState<ConfirmDialogState>(initialDialog);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successPopup, setSuccessPopup] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const paymentWindowRef = useRef(false);

  // Read from lib/order-recipients so this and the "Order and Licence Keys
  // will be sent to" panel above cannot say different things.
  const getRecipientLabel = useCallback(() => orderRecipient(invoice).name, [invoice]);

  // Poll for payment completion after Pay Now
  const startPaymentPolling = useCallback(() => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    paymentWindowRef.current = true;

    const checkPayment = async () => {
      try {
        const res = await fetch(`/api/invoices/${selectedInvoiceId}`);
        const data = await res.json();
        const paymentStatus = (data.invoice?.Payment_Status as string || '').toLowerCase();
        if (paymentStatus === 'paid' || paymentStatus === 'succeeded') {
          // Payment complete!
          if (pollingRef.current) clearInterval(pollingRef.current);
          pollingRef.current = null;
          paymentWindowRef.current = false;
          const recipient = getRecipientLabel();
          setSuccessPopup(`The licence keys and a copy of the order have been sent to ${recipient}.`);
          onRefresh();
        }
      } catch { /* continue polling */ }
    };

    // Poll every 5 seconds
    pollingRef.current = setInterval(checkPayment, 5000);
  }, [selectedInvoiceId, getRecipientLabel, onRefresh]);

  // Listen for window focus to start polling when user returns from payment tab
  useEffect(() => {
    const handleFocus = () => {
      if (paymentWindowRef.current && !pollingRef.current) {
        startPaymentPolling();
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [startPaymentPolling]);

  // Escape closes whichever overlay is open. Declared here rather than beside
  // closeDialog because that helper lives below the early returns and hooks
  // cannot.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setSuccessPopup(null);
      setDialog(initialDialog);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // Only show on Draft or Sent invoices. An approved order is finished with,
  // and nothing here applies to it.
  if (status !== 'Draft' && status !== 'Sent') return null;

  /**
   * Which buttons this partner and this user can actually reach.
   *
   * Kept as named values rather than inline conditions because when the answer
   * is "none of them" the panel has to say why. Rendering nothing at all is
   * what made an unreachable button indistinguishable from a missing feature —
   * there was no way to tell, from the page, whether account terms were off,
   * the user was read-only, or the thing simply had not been built.
   */
  const showCardButtons = payOnCard && canSend;
  const showProcessOrder = payOnAccount && canApprove;

  /** Why there is nothing to press, or null when there is. */
  const nothingAvailable = (() => {
    if (showCardButtons || showProcessOrder) return null;
    if (!payOnAccount && !payOnCard) {
      return 'No payment method is enabled for your partner account, so this order cannot be paid for or processed here. Ask CSA to enable card payment, account terms, or both.';
    }
    if (payOnCard && !canSend) {
      return 'Your partner account pays by card, but your user account does not have permission to send orders. Ask your administrator for the Send Orders permission.';
    }
    if (payOnAccount && !canApprove) {
      return 'Your partner account has payment terms, but your user account is read-only and cannot commit an order.';
    }
    return 'There is nothing to do on this order from here.';
  })();

  const closeDialog = () => setDialog(initialDialog);

  // Sending again is fine — /api/invoices/[id]/send resends rather than
  // no-opping — so the button says which it is doing rather than pretending
  // the first send never happened.
  const alreadySent = status === 'Sent';

  // ── Pay Now ──────────────────────────────────────────────────────────

  const handlePayNow = () => {
    setError('');
    setDialog({
      open: true,
      step: 1,
      // One step: this opens a payment page, which can be closed again.
      confirmAgain: null,
      title: 'Open Payment Page',
      message: `This opens the Stripe payment page in a new tab. Once the payment clears, the order is processed and the licence keys go to ${recipientSentence(invoice)}.`,
      confirmLabel: 'Open Payment Page',
      confirmColor: 'bg-success',
      onConfirm: async () => {
        closeDialog();
        setLoading(true);
        try {
          // Fetch the latest invoice to get the most up-to-date Stripe link
          const res = await fetch(`/api/invoices/${selectedInvoiceId}`);
          const data = await res.json();
          const freshLink = data.invoice?.Stripe_Payment_Link as string;
          if (!freshLink) {
            setError('Payment link not yet generated. Please save the order first.');
            setLoading(false);
            return;
          }
          window.open(freshLink, '_blank');
          // Start polling for payment completion
          paymentWindowRef.current = true;
          startPaymentPolling();
        } catch {
          setError('Failed to fetch payment link.');
        }
        setLoading(false);
      },
    });
  };

  // ── Pay Later ────────────────────────────────────────────────────────

  const handlePayLater = () => {
    setError('');
    const recipient = getRecipientLabel();
    setDialog({
      open: true,
      step: 1,
      // One step: an invoice can be resent, and nothing is issued by sending it.
      confirmAgain: null,
      title: alreadySent ? 'Send the invoice again?' : 'Send Order for Payment',
      message: `This ${alreadySent ? 'sends the invoice to' : 'emails the invoice to'} ${recipient} ${alreadySent ? 'again' : 'so they can pay it later'}. It does not process the order — no licence keys are issued until the payment arrives.`,
      confirmLabel: alreadySent ? 'Resend Invoice' : 'Send Invoice',
      confirmColor: 'bg-warning',
      onConfirm: async () => {
        closeDialog();
        setLoading(true);
        try {
          // Goes through the CSA send function rather than writing
          // Send_Invoice directly, so the order is validated against its
          // reseller first and a second press resends instead of no-opping.
          const res = await fetch(`/api/invoices/${selectedInvoiceId}/send`, { method: 'POST' });
          const data = await res.json();
          if (!res.ok) {
            setError(data.error || 'Failed to send order');
          } else {
            onRefresh();
          }
        } catch {
          setError('Failed to send order');
        }
        setLoading(false);
      },
    });
  };

  // ── Process Order ────────────────────────────────────────────────────

  const handleProcessOrder = () => {
    setError('');
    // The purchase order is what stands in for the payment on account terms, so
    // it is required rather than encouraged. Both halves: a number to bill
    // against, and the document itself as the authority for it.
    if (!hasPONumber) {
      setError('Enter a Purchase Order number before processing this order.');
      return;
    }
    if (!hasPOFile) {
      setError('Attach the Purchase Order document before processing this order.');
      return;
    }
    setDialog({
      open: true,
      step: 1,
      title: 'Process this order?',
      message: `This processes the order on account. The invoice and the licence keys will be emailed to ${recipientSentence(invoice)}. The order is committed once this runs and cannot be edited afterwards.`,
      confirmLabel: 'Process Order',
      confirmColor: 'bg-csa-accent',
      // The one action that asks twice: keys are issued, an email goes out, and
      // neither can be recalled.
      confirmAgain: {
        title: 'Send the invoice and issue licence keys?',
        message: `Licence keys will be generated and emailed to ${recipientSentence(invoice)}. This cannot be undone.`,
        confirmLabel: 'Yes, process the order',
      },
      onConfirm: async () => {
        closeDialog();
        setLoading(true);
        try {
          const res = await fetch(`/api/invoices/${selectedInvoiceId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ Status: 'Approved' }),
          });
          if (!res.ok) {
            const data = await res.json();
            setError(data.error || 'Could not process the order');
          } else {
            onRefresh();
          }
        } catch {
          setError('Could not process the order');
        }
        setLoading(false);
      },
    });
  };

  // ── Dialog handler ───────────────────────────────────────────────────

  const handleDialogConfirm = () => {
    // Only an action that supplied a second question asks one. Everything else
    // runs on the first press, having already said what it was going to do.
    if (dialog.step === 1 && dialog.confirmAgain) {
      const { title, message, confirmLabel } = dialog.confirmAgain;
      setDialog(prev => ({ ...prev, step: 2, title, message, confirmLabel }));
      return;
    }
    dialog.onConfirm();
  };

  return (
    <>
      {/* Action Buttons */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="mb-8"
      >
        {nothingAvailable && (
          <div className="flex items-start gap-2 text-xs text-text-muted bg-surface border border-border-subtle rounded-xl px-4 py-3 max-w-xl ml-auto">
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5 text-warning" />
            <p className="leading-relaxed">{nothingAvailable}</p>
          </div>
        )}

        <div className="flex items-center justify-end gap-3">
          {showCardButtons && (
            <>
              <button
                onClick={handlePayLater}
                disabled={loading}
                className="flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-warning bg-warning/10 border border-warning/30 rounded-xl hover:bg-warning/20 transition-colors cursor-pointer disabled:opacity-40"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Clock size={14} />}
                {alreadySent ? 'Resend Invoice' : 'Pay Later'}
              </button>
              <button
                onClick={handlePayNow}
                disabled={loading}
                className="flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-success bg-success/10 border border-success/30 rounded-xl hover:bg-success/20 transition-colors cursor-pointer disabled:opacity-40"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
                Pay Now
              </button>
            </>
          )}

          {showProcessOrder && (
            <button
              onClick={handleProcessOrder}
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-csa-accent border border-csa-accent/50 rounded-xl hover:bg-csa-accent/90 transition-colors cursor-pointer disabled:opacity-40"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <ShoppingCart size={14} />}
              Process Order
            </button>
          )}
        </div>

        {/* Error message */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3"
            >
              <div className="flex items-center gap-2 text-xs text-error bg-error/10 border border-error/20 rounded-xl px-4 py-2.5 max-w-md ml-auto">
                <AlertTriangle size={14} className="flex-shrink-0" />
                {error}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Double Confirmation Dialog */}
      <AnimatePresence>
        {dialog.open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto py-8">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeDialog} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative my-auto bg-csa-dark border border-border rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[calc(100vh-4rem)] overflow-y-auto"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
                <h2 className="text-base font-bold text-text-primary">{dialog.title}</h2>
                <button onClick={closeDialog} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-raised transition-colors cursor-pointer">
                  <X size={16} className="text-text-muted" />
                </button>
              </div>

              <div className="px-5 py-5">
                <p className="text-sm text-text-secondary leading-relaxed">{dialog.message}</p>
              </div>

              <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border-subtle">
                <button
                  onClick={closeDialog}
                  className="px-4 py-2 text-xs font-semibold text-text-muted bg-surface-raised border border-border-subtle rounded-xl cursor-pointer hover:bg-surface-overlay transition-colors"
                >
                  {dialog.step === 2 ? 'Go Back' : 'Cancel'}
                </button>
                <button
                  onClick={handleDialogConfirm}
                  className={`px-5 py-2 text-xs font-semibold text-white ${dialog.confirmColor} rounded-xl cursor-pointer hover:opacity-90 transition-opacity`}
                >
                  {dialog.confirmLabel}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Payment Success Popup */}
      <AnimatePresence>
        {successPopup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto py-8">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSuccessPopup(null)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative my-auto bg-csa-dark border border-success/30 rounded-2xl shadow-2xl w-full max-w-sm mx-4 max-h-[calc(100vh-4rem)] overflow-y-auto"
            >
              <div className="flex flex-col items-center text-center px-6 py-8">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
                >
                  <CheckCircle2 size={56} className="text-success mb-4" />
                </motion.div>
                <h2 className="text-xl font-bold text-text-primary mb-2">Payment Complete!</h2>
                <p className="text-sm text-text-secondary leading-relaxed">{successPopup}</p>
              </div>
              <div className="flex items-center justify-center px-6 pb-6">
                <button
                  onClick={() => setSuccessPopup(null)}
                  className="px-6 py-2.5 text-xs font-semibold text-white bg-success rounded-xl cursor-pointer hover:bg-success/90 transition-colors"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
