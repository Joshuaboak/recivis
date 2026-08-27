/**
 * InvoicePurchaseOrder — The PO number field, its documents, and the uploader.
 *
 * Allows editing the PO number (inline edit with save/cancel) and uploading PO
 * documents as attachments to the invoice record in Zoho.
 *
 * The documents already on the order are listed, which they were not before:
 * the panel only ever acknowledged an upload it had watched happen, so
 * reopening the order made its purchase order look missing. They are links —
 * a purchase order nobody can open is a filename, not a document.
 */
'use client';

import { motion } from 'framer-motion';
import {
  FileText,
  Pencil,
  Save,
  X,
  Loader2,
  Upload,
  Check,
  Paperclip,
} from 'lucide-react';

/** One file already attached to this order. */
export interface OrderAttachment {
  id: string;
  fileName: string;
  size: number | null;
  createdTime: string;
  createdBy: string;
}

/** Bytes as something a person reads, or empty when Zoho gave no size. */
function formatSize(bytes: number | null): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface InvoicePurchaseOrderProps {
  /** The full invoice record */
  invoice: Record<string, unknown>;
  /** Current invoice status — PO editing only allowed when Draft */
  status: string;
  /** Whether the PO number is being edited */
  editingPO: boolean;
  /** Current value of the PO number input */
  editPONumber: string;
  /** Whether a PO save is in progress */
  savingPO: boolean;
  /** Whether a file upload is in progress */
  uploadingFile: boolean;
  /** Result message after file upload (e.g. "invoice.pdf attached") */
  uploadResult: string | null;
  /** Documents already attached to this order in the CRM. */
  attachments: OrderAttachment[];
  /** Record id, for building download links. */
  invoiceId: string;
  /** Start editing the PO number */
  onStartEditPO: () => void;
  /** Cancel PO editing */
  onCancelEditPO: () => void;
  /** Update the PO number input value */
  onChangePONumber: (value: string) => void;
  /** Save the PO number to Zoho */
  onSavePO: () => void;
  /** Handle a file upload */
  onFileUpload: (file: File) => void;
}

export default function InvoicePurchaseOrder({
  invoice,
  status,
  editingPO,
  editPONumber,
  savingPO,
  uploadingFile,
  uploadResult,
  attachments,
  invoiceId,
  onStartEditPO,
  onCancelEditPO,
  onChangePONumber,
  onSavePO,
  onFileUpload,
}: InvoicePurchaseOrderProps) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="mb-8">
      <div className="bg-surface border border-border-subtle rounded-xl px-5 py-4">
        {/* Section header with edit trigger */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-text-muted uppercase tracking-wider">
            <FileText size={14} />
            Purchase Order
          </div>
          {/* Editable until the order is approved, matching the route's lock.
              Stopping at Draft meant an order already sent for payment could
              not have its PO number corrected. */}
          {status !== 'Approved' && !editingPO && (
            <button
              onClick={onStartEditPO}
              className="text-csa-accent hover:text-csa-highlight transition-colors cursor-pointer"
            >
              <Pencil size={12} />
            </button>
          )}
        </div>

        {/* PO Number — inline edit or display */}
        {editingPO ? (
          <div className="flex items-center gap-2 mb-3">
            <input
              type="text"
              value={editPONumber}
              onChange={e => onChangePONumber(e.target.value)}
              placeholder="Enter PO number..."
              className="flex-1 bg-csa-dark border border-border-subtle px-3 py-2 text-sm text-text-primary placeholder-text-muted/40 outline-none focus:border-csa-accent transition-colors rounded-lg"
              autoFocus
            />
            <button onClick={onSavePO} disabled={savingPO} className="p-2 text-success hover:text-success/80 transition-colors cursor-pointer disabled:opacity-50">
              {savingPO ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            </button>
            <button onClick={onCancelEditPO} className="p-2 text-text-muted hover:text-text-primary transition-colors cursor-pointer">
              <X size={14} />
            </button>
          </div>
        ) : (
          <p className="text-sm text-text-primary mb-3">
            {invoice.Purchase_Order as string || <span className="text-text-muted">No PO number set</span>}
          </p>
        )}

        {/* Documents already on the order */}
        {attachments.length > 0 && (
          <div className="border-t border-border-subtle pt-3 mb-3">
            <ul className="space-y-1.5">
              {attachments.map(file => (
                <li key={file.id}>
                  <a
                    href={`/api/attachments?module=Invoices&recordId=${encodeURIComponent(invoiceId)}&attachmentId=${encodeURIComponent(file.id)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-xs text-csa-accent hover:text-csa-highlight transition-colors group"
                  >
                    <Paperclip size={12} className="flex-shrink-0" />
                    <span className="truncate underline underline-offset-2">{file.fileName}</span>
                    {formatSize(file.size) ? (
                      <span className="text-text-muted flex-shrink-0">{formatSize(file.size)}</span>
                    ) : null}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* File Upload */}
        <div className="border-t border-border-subtle pt-3">
          <label className="flex items-center gap-3 cursor-pointer group">
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.doc,.docx"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) onFileUpload(file);
                e.target.value = '';
              }}
              disabled={uploadingFile}
            />
            <div className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg border border-dashed transition-colors ${
              uploadingFile
                ? 'text-text-muted border-border-subtle'
                : 'text-csa-accent border-csa-accent/30 hover:bg-csa-accent/10 group-hover:border-csa-accent/50'
            }`}>
              {uploadingFile ? (
                <><Loader2 size={13} className="animate-spin" /> Uploading...</>
              ) : (
                <><Upload size={13} /> Attach PO Document</>
              )}
            </div>
            {uploadResult ? (
              <span className={`text-xs flex items-center gap-1 ${uploadResult.includes('failed') ? 'text-error' : 'text-success'}`}>
                {uploadResult.includes('failed') ? null : <Check size={12} />}
                {uploadResult}
              </span>
            ) : (
              <span className="text-xs text-text-muted">PDF, images, or documents</span>
            )}
          </label>
        </div>
      </div>
    </motion.div>
  );
}
