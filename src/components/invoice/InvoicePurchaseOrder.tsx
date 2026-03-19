/**
 * InvoicePurchaseOrder — The PO number field and file upload section.
 *
 * Allows editing the PO number (inline edit with save/cancel) and
 * uploading PO documents as attachments to the invoice record in Zoho.
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
} from 'lucide-react';

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
          {status === 'Draft' && !editingPO && (
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
