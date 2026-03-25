/**
 * OrderActions — Pay Now / Pay Later / Place Order buttons for invoice detail.
 *
 * Visibility is controlled by reseller payment method flags:
 * - Pay on Card → Pay Now + Pay Later
 * - Pay on Account → Place Order
 *
 * Each action has a double confirmation dialog explaining what will happen.
 * Button visibility also gated by user permissions (canSendInvoices, canApproveInvoices).
 *
 * Pay Now fetches the latest Stripe link before opening to ensure it's current.
 * After returning from the payment tab, polls for payment completion and shows
 * a success popup with recipient info.
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CreditCard, Clock, ShoppingCart, Loader2, AlertTriangle, X, CheckCircle2 } from 'lucide-react';

interface OrderActionsProps {
  invoice: Record<string, unknown>;
  status: string;
  selectedInvoiceId: string | null;
  canPurchaseOnAccount: boolean;
  canPurchaseOnCredit: boolean;
  canSend: boolean;
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
}

const initialDialog: ConfirmDialogState = {
  open: false, title: '', message: '', confirmLabel: '', confirmColor: '', onConfirm: () => {}, step: 1,
};

export default function OrderActions({
  invoice, status, selectedInvoiceId,
  canPurchaseOnAccount, canPurchaseOnCredit,
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

  // Determine recipient label from the SendTo toggle
  const getRecipientLabel = useCallback(() => {
    const isReseller = !!invoice.Reseller_Direct_Purchase;
    const reseller = invoice.Reseller as { name?: string } | null;
    const contact = invoice.Contact_Name as { name?: string } | null;
    if (isReseller) {
      return reseller?.name || 'the reseller';
    }
    return contact?.name || 'the customer';
  }, [invoice]);

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

  // Only show on Draft or Sent invoices
  if (status !== 'Draft' && status !== 'Sent') return null;
  // Need at least one payment method enabled
  if (!canPurchaseOnAccount && !canPurchaseOnCredit) return null;

  const closeDialog = () => setDialog(initialDialog);

  // ── Pay Now ──────────────────────────────────────────────────────────

  const handlePayNow = () => {
    setError('');
    setDialog({
      open: true,
      step: 1,
      title: 'Open Payment Page',
      message: 'This will open the Stripe payment page in a new tab. The customer will receive licence keys automatically after payment is confirmed.',
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
      title: 'Send Order for Payment',
      message: `This will send the order to ${recipient} for payment. Licence keys will be sent automatically after payment is received.`,
      confirmLabel: 'Send for Payment',
      confirmColor: 'bg-warning',
      onConfirm: async () => {
        closeDialog();
        setLoading(true);
        try {
          const res = await fetch(`/api/invoices/${selectedInvoiceId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ Send_Invoice: true }),
          });
          if (!res.ok) {
            const data = await res.json();
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

  // ── Place Order ──────────────────────────────────────────────────────

  const handlePlaceOrder = () => {
    setError('');
    if (!hasPONumber) {
      setError('Please enter a Purchase Order number before placing the order.');
      return;
    }
    if (!hasPOFile) {
      setError('Please attach a Purchase Order document before placing the order.');
      return;
    }
    const recipient = getRecipientLabel();
    setDialog({
      open: true,
      step: 1,
      title: 'Place Order on Account',
      message: `This will approve the order and generate licence keys. A copy of the order will be sent to ${recipient}.`,
      confirmLabel: 'Place Order',
      confirmColor: 'bg-csa-accent',
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
            setError(data.error || 'Failed to place order');
          } else {
            onRefresh();
          }
        } catch {
          setError('Failed to place order');
        }
        setLoading(false);
      },
    });
  };

  // ── Dialog handler ───────────────────────────────────────────────────

  const handleDialogConfirm = () => {
    if (dialog.step === 1) {
      const onConfirm = dialog.onConfirm;
      setDialog(prev => ({
        ...prev,
        step: 2,
        title: 'Are you sure?',
        message: 'This action cannot be undone.',
        confirmLabel: 'Yes, proceed',
        onConfirm,
      }));
    } else {
      dialog.onConfirm();
    }
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
        <div className="flex items-center justify-end gap-3">
          {canPurchaseOnCredit && canSend && (
            <>
              <button
                onClick={handlePayLater}
                disabled={loading}
                className="flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-warning bg-warning/10 border border-warning/30 rounded-xl hover:bg-warning/20 transition-colors cursor-pointer disabled:opacity-40"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Clock size={14} />}
                Pay Later
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

          {canPurchaseOnAccount && canApprove && (
            <button
              onClick={handlePlaceOrder}
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-csa-accent border border-csa-accent/50 rounded-xl hover:bg-csa-accent/90 transition-colors cursor-pointer disabled:opacity-40"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <ShoppingCart size={14} />}
              Place Order
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
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeDialog} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-csa-dark border border-border rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
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
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSuccessPopup(null)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-csa-dark border border-success/30 rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden"
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
