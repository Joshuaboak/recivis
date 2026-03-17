'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, FileText, Check, Loader2, X } from 'lucide-react';

interface POAttachmentProps {
  invoiceId: string;
  onComplete: (message: string) => void;
}

export default function POAttachment({ invoiceId, onComplete }: POAttachmentProps) {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) uploadFile(files[0]);
  }, [invoiceId]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) uploadFile(files[0]);
  }, [invoiceId]);

  const uploadFile = async (file: File) => {
    setFileName(file.name);
    setUploading(true);
    setError('');

    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const res = await fetch('/api/attach-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recordID: invoiceId,
          fileName: file.name,
          base64,
          moduleName: 'Invoices',
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Upload failed');
      }

      setDone(true);
      onComplete(`PO document "${file.name}" attached to invoice.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const skip = () => {
    onComplete('No PO document attached.');
  };

  if (done) {
    return (
      <div className="mt-3 flex items-center gap-3 px-4 py-3 bg-success/10 border-2 border-success/30 rounded-xl">
        <Check size={18} className="text-success" />
        <span className="text-sm text-success font-semibold">{fileName} attached</span>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !uploading && fileInputRef.current?.click()}
        className={`
          border-2 border-dashed rounded-xl px-4 py-4 transition-all duration-200 cursor-pointer
          flex items-center gap-4
          ${dragOver
            ? 'border-csa-accent bg-csa-accent/10'
            : uploading
              ? 'border-border-subtle bg-surface opacity-60 cursor-wait'
              : 'border-border-subtle hover:border-csa-accent/50 hover:bg-surface-raised/50'
          }
        `}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx"
          onChange={handleFileSelect}
          className="hidden"
        />

        {uploading ? (
          <>
            <Loader2 size={20} className="text-csa-accent animate-spin" />
            <div>
              <p className="text-sm font-semibold text-text-primary">Uploading {fileName}...</p>
              <p className="text-xs text-text-muted">Attaching to invoice</p>
            </div>
          </>
        ) : (
          <>
            <Upload size={20} className={dragOver ? 'text-csa-accent' : 'text-text-muted'} />
            <div>
              <p className="text-sm text-text-secondary">
                <span className="font-semibold text-csa-accent">Attach PO document</span> — drop here or click
              </p>
              <p className="text-xs text-text-muted">PDF, image, or document</p>
            </div>
          </>
        )}
      </div>

      {error && (
        <p className="text-xs text-error px-2">{error}</p>
      )}

      <button
        onClick={skip}
        className="text-xs text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
      >
        Skip — no document to attach
      </button>
    </div>
  );
}
