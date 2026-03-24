'use client';

import { useState, useEffect } from 'react';
import { CreditCard, ExternalLink, Loader2, Lock, Info } from 'lucide-react';

interface InvoicePaymentProps {
  invoice: Record<string, unknown>;
  status: string;
  isRefreshing: boolean;
}

export default function InvoicePayment({ invoice, status, isRefreshing }: InvoicePaymentProps) {
  const paymentLink = invoice.Stripe_Payment_Link as string || '';
  const paymentStatus = invoice.Payment_Status as string || '';
  const stripeTotal = invoice.Stripe_Total as string || '';
  const stripeFee = invoice.Stripe_Transaction_Fee as number | null;
  const grandTotalWithFee = invoice.Grand_Total_with_Stripe_Fee as number | null;
  const currency = invoice.Currency as string || 'AUD';

  const symbol = currency === 'AUD' ? '$' : currency === 'EUR' ? '\u20AC' : currency === 'GBP' ? '\u00A3' : currency === 'NZD' ? 'NZ$' : currency === 'INR' ? '\u20B9' : '$';

  const isApproved = status === 'Approved' || status === 'Sent';
  const hasPaymentInfo = paymentLink || paymentStatus || stripeTotal;

  // Payment status badge colors
  const statusColor = (() => {
    const lower = paymentStatus.toLowerCase();
    if (lower === 'paid' || lower === 'succeeded') return 'bg-success/20 text-success';
    if (lower === 'pending' || lower === 'processing') return 'bg-warning/20 text-warning';
    if (lower === 'failed' || lower === 'cancelled') return 'bg-error/20 text-error';
    return 'bg-text-muted/20 text-text-muted';
  })();

  if (!hasPaymentInfo && !isRefreshing) return null;

  return (
    <div className="mb-8">
      <h2 className="text-lg font-bold text-text-primary flex items-center gap-2 mb-3">
        <CreditCard size={18} className="text-csa-purple" />
        Payment Information
      </h2>

      <div className="bg-surface border border-border-subtle rounded-xl p-5">
        {isRefreshing ? (
          <div className="flex items-center gap-3 py-4">
            <Loader2 size={18} className="text-csa-accent animate-spin" />
            <div>
              <p className="text-sm font-semibold text-text-primary">Generating payment details...</p>
              <p className="text-xs text-text-muted">This may take a few seconds while the payment link is created.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              {/* Payment Link */}
              <div>
                <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1.5">Stripe Payment Link</p>
                {paymentLink ? (
                  isApproved ? (
                    <div className="flex items-center gap-2 text-sm text-text-muted">
                      <Lock size={14} />
                      <span className="truncate">Locked (Order {status})</span>
                    </div>
                  ) : (
                    <a
                      href={paymentLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-csa-accent hover:text-csa-highlight transition-colors"
                    >
                      <ExternalLink size={13} />
                      Open Payment Link
                    </a>
                  )
                ) : (
                  <p className="text-sm text-text-muted">{'\u2014'}</p>
                )}
              </div>

              {/* Stripe Total */}
              <div>
                <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1.5">Stripe Total</p>
                <p className="text-sm font-semibold text-text-primary">
                  {stripeTotal ? `${symbol}${stripeTotal}` : grandTotalWithFee ? `${symbol}${grandTotalWithFee.toFixed(2)}` : '\u2014'}
                </p>
                {stripeFee != null && stripeFee > 0 && (
                  <p className="text-[10px] text-text-muted mt-0.5">
                    Includes {symbol}{stripeFee.toFixed(2)} Stripe fee
                  </p>
                )}
              </div>

              {/* Payment Status */}
              <div>
                <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1.5">Payment Status</p>
                {paymentStatus ? (
                  <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-md ${statusColor}`}>
                    {paymentStatus}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-md bg-text-muted/15 text-text-muted">
                    Awaiting Payment
                  </span>
                )}
              </div>
            </div>

            {/* Note about license keys */}
            <div className="flex items-start gap-2 p-3 bg-csa-accent/5 border border-csa-accent/15 rounded-xl">
              <Info size={14} className="text-csa-accent mt-0.5 flex-shrink-0" />
              <p className="text-[11px] text-text-secondary leading-relaxed">
                Once payment has been completed using this link, licence keys will be automatically generated and sent to the payee (reseller or customer, depending on the order routing above).
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
