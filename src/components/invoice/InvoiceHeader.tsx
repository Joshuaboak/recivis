/**
 * InvoiceHeader — Header section of the invoice detail view.
 *
 * Renders the back button, invoice number badge, status/type badges,
 * and action buttons (Edit, Save, Cancel, Approve, Send, Lock, CRM link).
 * All state and handlers are passed from the parent InvoiceDetailView.
 */
'use client';

import {
  ArrowLeft,
  ExternalLink,
  Send,
  CheckCircle2,
  Lock,
  Pencil,
  Save,
  X,
  Loader2,
} from 'lucide-react';
import type { User } from '@/lib/types';

interface InvoiceHeaderProps {
  /** The full invoice record from Zoho */
  invoice: Record<string, unknown>;
  /** Current invoice status (Draft, Sent, Approved, etc.) */
  status: string;
  /** Whether the user is currently in edit mode */
  editing: boolean;
  /** Whether a save operation is in progress */
  saving: boolean;
  /** Whether the invoice is editable (Draft + user has permission) */
  canEdit: boolean;
  /** The currently logged-in user */
  user: User | null;
  /** The Zoho CRM record ID for building the CRM link */
  selectedInvoiceId: string | null;
  /** Navigate back to the previous view */
  onGoBack: () => void;
  /** Enter edit mode */
  onEdit: () => void;
  /** Cancel editing and discard changes */
  onCancelEdit: () => void;
  /** Save all pending changes */
  onSave: () => void;
}

/** Colour class for invoice status badges */
function statusColor(s: unknown) {
  switch (s) {
    case 'Sent': return 'bg-success/20 text-success border-success/30';
    case 'Approved': return 'bg-csa-accent/20 text-csa-accent border-csa-accent/30';
    case 'Draft': return 'bg-warning/20 text-warning border-warning/30';
    default: return 'bg-surface-raised text-text-muted border-border-subtle';
  }
}

/** Colour class for invoice type badges (Renewal vs New) */
function typeColor(type: unknown) {
  return type === 'Renewal'
    ? 'bg-csa-purple/20 text-csa-purple border-csa-purple/30'
    : 'bg-csa-accent/20 text-csa-accent border-csa-accent/30';
}

export default function InvoiceHeader({
  invoice,
  status,
  editing,
  saving,
  canEdit,
  user,
  selectedInvoiceId,
  onGoBack,
  onEdit,
  onCancelEdit,
  onSave,
}: InvoiceHeaderProps) {
  const crmLink = `https://crm.zoho.com.au/crm/org7002802215/tab/Invoices/${selectedInvoiceId}`;
  const isEditor = user?.role === 'admin' || user?.role === 'ibm';

  return (
    <div className="mb-8">
      <div className="flex items-center gap-3 mb-3">
        {/* Back button */}
        <button onClick={onGoBack} className="w-9 h-9 flex items-center justify-center bg-surface-raised rounded-xl hover:bg-surface-overlay transition-colors cursor-pointer">
          <ArrowLeft size={18} className="text-text-secondary" />
        </button>

        {/* Invoice number badge */}
        {invoice.Reference_Number ? (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-success/10 border border-success/30 rounded-xl">
            <span className="text-[10px] font-semibold text-success uppercase tracking-wider">Order Number</span>
            <span className="text-sm font-bold text-success">#{invoice.Reference_Number as string}</span>
          </div>
        ) : null}

        {/* Status & type badges */}
        <span className={`px-2.5 py-1.5 text-[11px] font-bold uppercase rounded-lg border ${statusColor(status)}`}>
          {status}
        </span>
        <span className={`px-2.5 py-1.5 text-[11px] font-bold uppercase rounded-lg border ${typeColor(invoice.Invoice_Type)}`}>
          {invoice.Invoice_Type as string || 'New'}
        </span>

        <div className="flex-1" />

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {/* Edit button — only when not already editing and invoice is editable */}
          {canEdit && !editing ? (
            <button onClick={onEdit} className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-warning bg-warning/10 border border-warning/30 rounded-xl hover:bg-warning/20 transition-colors cursor-pointer">
              <Pencil size={14} />
              Edit
            </button>
          ) : null}

          {/* Save/Cancel buttons — visible only in edit mode */}
          {editing ? (
            <>
              <button onClick={onCancelEdit} className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-text-muted bg-surface-raised border border-border-subtle rounded-xl hover:bg-surface-overlay transition-colors cursor-pointer">
                <X size={14} />
                Cancel
              </button>
              <button onClick={onSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-success bg-success/10 border border-success/30 rounded-xl hover:bg-success/20 transition-colors cursor-pointer disabled:opacity-50">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </>
          ) : null}

          {/* Approve / Send — only for Draft invoices when not editing */}
          {!editing && status === 'Draft' ? (() => {
            const canApprove = isEditor || user?.permissions?.canApproveInvoices;
            const canSend = isEditor || user?.permissions?.canSendInvoices;
            return (
              <>
                {canApprove ? (
                  <button className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-success bg-success/10 border border-success/30 rounded-xl hover:bg-success/20 transition-colors cursor-pointer">
                    <CheckCircle2 size={14} />
                    Approve
                  </button>
                ) : null}
                {canSend ? (
                  <button className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-csa-highlight bg-csa-accent/10 border border-csa-accent/30 rounded-xl hover:bg-csa-accent/20 transition-colors cursor-pointer">
                    <Send size={14} />
                    Send Order
                  </button>
                ) : null}
              </>
            );
          })() : null}

          {/* Locked badge — non-Draft invoices when not editing */}
          {!editing && status !== 'Draft' ? (
            <div className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-text-muted bg-surface-raised border border-border-subtle rounded-xl">
              <Lock size={14} />
              Locked
            </div>
          ) : null}

          {/* CRM link */}
          <a href={crmLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-csa-accent bg-csa-accent/10 border border-csa-accent/30 rounded-xl hover:bg-csa-accent/20 transition-colors cursor-pointer">
            <ExternalLink size={14} />
            Open in CRM
          </a>
        </div>
      </div>

      {/* Invoice subject / title */}
      <h1 className="text-2xl font-bold text-text-primary ml-12">
        {invoice.Subject as string || `Order ${selectedInvoiceId}`}
      </h1>
    </div>
  );
}
