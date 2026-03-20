'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Loader2, Mail, Send, ArrowDown, Eye, MousePointerClick, Paperclip, Download, Clock } from 'lucide-react';

interface EmailDetailModalProps {
  module: string;
  recordId: string;
  messageId: string;
  previewSubject?: string;
  onClose: () => void;
}

interface EmailDetail {
  subject: string;
  content: string;
  mail_format: string;
  from: { user_name?: string; email: string };
  to: Array<{ user_name?: string; email: string }>;
  cc?: Array<{ user_name?: string; email: string }> | null;
  sent_time: string;
  status: Array<{ type: string; count?: string; first_open?: string; last_open?: string; first_click?: string; last_click?: string }>;
  attachments: Array<{ id: string; file_name: string; size?: number }>;
  owner?: { name: string };
}

export default function EmailDetailModal({ module, recordId, messageId, previewSubject, onClose }: EmailDetailModalProps) {
  const [email, setEmail] = useState<EmailDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const loadEmail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/emails?module=${module}&recordId=${recordId}&messageId=${encodeURIComponent(messageId)}`);
      const data = await res.json();
      if (data.email) {
        setEmail(data.email);
      } else {
        setError('Email not found');
      }
    } catch {
      setError('Failed to load email');
    }
    setLoading(false);
  }, [module, recordId, messageId]);

  useEffect(() => { loadEmail(); }, [loadEmail]);

  const formatDateTime = (d: string) => {
    if (!d) return '\u2014';
    const date = new Date(d);
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  const formatContact = (c: { user_name?: string; email: string }) =>
    c.user_name ? `${c.user_name} <${c.email}>` : c.email;

  const openStatus = email?.status?.find(s => s.type === 'opened');
  const clickStatus = email?.status?.find(s => s.type === 'clicked');

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-csa-dark border border-border rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-9 h-9 rounded-xl bg-csa-accent/15 flex items-center justify-center flex-shrink-0">
              <Mail size={18} className="text-csa-accent" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-text-primary truncate">
                {email?.subject || previewSubject || 'Loading...'}
              </h3>
              {email && (
                <p className="text-xs text-text-muted truncate">
                  {formatContact(email.from)} &rarr; {email.to.map(formatContact).join(', ')}
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-text-muted hover:text-text-primary transition-colors cursor-pointer flex-shrink-0">
            <X size={18} />
          </button>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="text-csa-accent animate-spin" />
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center py-16">
            <p className="text-sm text-error">{error}</p>
          </div>
        )}

        {email && !loading && (
          <>
            {/* Email metadata */}
            <div className="px-6 py-3 border-b border-border-subtle flex-shrink-0 space-y-1.5">
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
                <span className="text-text-muted">
                  <span className="font-semibold text-text-secondary">From:</span>{' '}
                  {formatContact(email.from)}
                </span>
                <span className="text-text-muted">
                  <span className="font-semibold text-text-secondary">To:</span>{' '}
                  {email.to.map(formatContact).join(', ')}
                </span>
                {email.cc && email.cc.length > 0 && (
                  <span className="text-text-muted">
                    <span className="font-semibold text-text-secondary">CC:</span>{' '}
                    {email.cc.map(formatContact).join(', ')}
                  </span>
                )}
                <span className="text-text-muted">
                  <span className="font-semibold text-text-secondary">Date:</span>{' '}
                  {formatDateTime(email.sent_time)}
                </span>
              </div>

              {/* Tracking badges */}
              <div className="flex flex-wrap gap-2">
                {email.status?.some(s => s.type === 'sent') && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase rounded-md bg-csa-accent/15 text-csa-accent">
                    <Send size={10} /> Sent
                  </span>
                )}
                {openStatus && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase rounded-md bg-success/15 text-success" title={`First: ${formatDateTime(openStatus.first_open || '')}\nLast: ${formatDateTime(openStatus.last_open || '')}`}>
                    <Eye size={10} /> Opened {openStatus.count ? `(${openStatus.count}x)` : ''}
                  </span>
                )}
                {clickStatus && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase rounded-md bg-csa-purple/15 text-csa-purple" title={`First: ${formatDateTime(clickStatus.first_click || '')}\nLast: ${formatDateTime(clickStatus.last_click || '')}`}>
                    <MousePointerClick size={10} /> Clicked {clickStatus.count ? `(${clickStatus.count}x)` : ''}
                  </span>
                )}
              </div>

              {/* Attachments */}
              {email.attachments && email.attachments.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Paperclip size={12} className="text-text-muted" />
                  {email.attachments.map((att) => (
                    <a
                      key={att.id}
                      href={`/api/emails?module=${module}&recordId=${recordId}&attachmentId=${att.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold text-csa-accent bg-surface border border-border-subtle rounded-lg hover:bg-surface-raised transition-colors cursor-pointer"
                    >
                      <Download size={10} />
                      {att.file_name}
                    </a>
                  ))}
                </div>
              )}
            </div>

            {/* Email body */}
            <div className="flex-1 overflow-hidden">
              {email.mail_format === 'html' ? (
                <iframe
                  srcDoc={email.content}
                  className="w-full h-full border-0"
                  sandbox="allow-same-origin"
                  title="Email content"
                  style={{ minHeight: '400px' }}
                />
              ) : (
                <div className="p-6 overflow-y-auto h-full">
                  <pre className="text-sm text-text-secondary whitespace-pre-wrap font-sans">{email.content}</pre>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
