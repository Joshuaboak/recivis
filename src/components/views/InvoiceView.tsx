'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, FileText, X, FilePlus, RefreshCw } from 'lucide-react';
import ChatInterface from '../chat/ChatInterface';

export default function InvoiceView() {
  const [dragOver, setDragOver] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<{ name: string; size: string } | null>(null);
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
    if (files.length > 0) {
      processFile(files[0]);
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  }, []);

  const processFile = (file: File) => {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    setUploadedFile({ name: file.name, size: `${sizeMB} MB` });

    // Read file as base64 and dispatch with the file data
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1]; // Strip data:... prefix
      const isPdf = file.type === 'application/pdf';
      const mediaType = isPdf ? 'application/pdf' : file.type;

      const event = new CustomEvent('recivis-send-file', {
        detail: {
          fileName: file.name,
          base64,
          mediaType,
          isPdf,
        },
      });
      window.dispatchEvent(event);
    };
    reader.readAsDataURL(file);
  };

  const clearFile = () => {
    setUploadedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const quickActions = [
    { label: 'New Product', icon: FilePlus, message: 'New product invoice' },
    { label: 'Renewal', icon: RefreshCw, message: 'Renewal invoice' },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* PO Upload Zone — always visible at top */}
      <div className="px-6 pt-4 pb-2 flex-shrink-0">
        <div className="max-w-3xl mx-auto">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !uploadedFile && fileInputRef.current?.click()}
            className={`
              relative border-2 border-dashed rounded-xl px-4 py-3 transition-all duration-200 cursor-pointer
              flex items-center gap-4
              ${dragOver
                ? 'border-csa-accent bg-csa-accent/10'
                : uploadedFile
                  ? 'border-success/40 bg-success/5'
                  : 'border-border-subtle hover:border-csa-accent/50 hover:bg-surface-raised/50'
              }
            `}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp"
              onChange={handleFileSelect}
              className="hidden"
            />

            {uploadedFile ? (
              <>
                <div className="w-10 h-10 rounded-xl bg-success/20 flex items-center justify-center flex-shrink-0">
                  <FileText size={20} className="text-success" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-text-primary truncate">{uploadedFile.name}</p>
                  <p className="text-xs text-text-muted">{uploadedFile.size} — Processing...</p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); clearFile(); }}
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-text-muted hover:text-error hover:bg-error/10 transition-colors"
                >
                  <X size={16} />
                </button>
              </>
            ) : (
              <>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors ${dragOver ? 'bg-csa-accent/20' : 'bg-surface-raised'}`}>
                  <Upload size={20} className={dragOver ? 'text-csa-accent' : 'text-text-muted'} />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-text-secondary">
                    <span className="font-semibold text-csa-accent">Drop a PO here</span> or click to upload
                  </p>
                  <p className="text-xs text-text-muted">PDF, PNG, JPG — Purchase orders processed automatically</p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Chat with quick actions */}
      <div className="flex-1 overflow-hidden">
        <ChatInterface
          initialMessage="New product or renewal? Give me an email address, contact name or account name and I'll get started."
          placeholder="Enter an email, contact name, or account name..."
          quickActions={quickActions}
        />
      </div>
    </div>
  );
}
