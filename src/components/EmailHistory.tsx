'use client';

import { useState, useEffect } from 'react';
import { Mail, Send, ArrowDown, Loader2, Eye, MousePointerClick, Paperclip } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import Pagination from './Pagination';
import EmailDetailModal from './EmailDetailModal';

interface EmailMeta {
  message_id: string;
  subject: string;
  from: { user_name?: string; email: string };
  to: Array<{ user_name?: string; email: string }>;
  time: string;
  sent: boolean;
  has_attachment: boolean;
  has_thread_attachment: boolean;
  status: Array<{ type: string; count?: string }>;
  owner?: { name: string; id: string };
}

interface EmailHistoryProps {
  module: string;
  recordId: string;
}

export default function EmailHistory({ module, recordId }: EmailHistoryProps) {
  const { user } = useAppStore();
  const [emails, setEmails] = useState<EmailMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [viewingEmail, setViewingEmail] = useState<EmailMeta | null>(null);
  const pageSize = 10;

  const isAdmin = user?.role === 'admin' || user?.role === 'ibm';

  useEffect(() => {
    if (!isAdmin || !recordId) return;
    setLoading(true);
    setError(null);

    fetch(`/api/emails?module=${module}&recordId=${recordId}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          setError(data.error);
        } else {
          setEmails(data.emails || []);
        }
      })
      .catch(() => setError('Failed to load emails'))
      .finally(() => setLoading(false));
  }, [module, recordId, isAdmin]);

  if (!isAdmin) return null;

  const totalPages = Math.max(1, Math.ceil(emails.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedEmails = emails.slice((safePage - 1) * pageSize, safePage * pageSize);

  const formatDate = (d: string) => {
    if (!d) return '\u2014';
    const date = new Date(d);
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  const getStatusBadges = (status: EmailMeta['status']) => {
    const badges: React.ReactNode[] = [];
    const opened = status?.find(s => s.type === 'opened');
    const clicked = status?.find(s => s.type === 'clicked');

    if (opened) {
      badges.push(
        <span key="opened" className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-bold uppercase rounded bg-success/15 text-success">
          <Eye size={9} /> {opened.count || '1'}x
        </span>
      );
    }
    if (clicked) {
      badges.push(
        <span key="clicked" className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-bold uppercase rounded bg-csa-purple/15 text-csa-purple">
          <MousePointerClick size={9} /> {clicked.count || '1'}x
        </span>
      );
    }
    return badges;
  };

  return (
    <>
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
            <Mail size={18} className="text-csa-accent" />
            Emails ({emails.length})
          </h2>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-8 gap-2">
            <Loader2 size={16} className="text-csa-accent animate-spin" />
            <span className="text-xs text-text-muted">Loading emails...</span>
          </div>
        )}

        {error && (
          <p className="text-sm text-error py-4">{error}</p>
        )}

        {!loading && !error && emails.length === 0 && (
          <p className="text-sm text-text-muted py-4">No emails found</p>
        )}

        {!loading && !error && paginatedEmails.length > 0 && (
          <>
            <div className="border border-border-subtle rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-surface-raised">
                    <th className="w-8"></th>
                    <th>Subject</th>
                    <th>From</th>
                    <th>To</th>
                    <th>Date</th>
                    <th>Tracking</th>
                    <th className="w-8"></th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedEmails.map((email) => (
                    <tr
                      key={email.message_id}
                      onClick={() => setViewingEmail(email)}
                      className="cursor-pointer hover:bg-csa-accent/5 transition-colors"
                    >
                      <td className="text-center">
                        {email.sent ? (
                          <Send size={13} className="text-csa-accent" />
                        ) : (
                          <ArrowDown size={13} className="text-success" />
                        )}
                      </td>
                      <td>
                        <span className="font-semibold text-text-primary text-sm line-clamp-1">
                          {email.subject || '(No subject)'}
                        </span>
                      </td>
                      <td className="text-text-secondary text-xs">
                        {email.from?.user_name || email.from?.email || '\u2014'}
                      </td>
                      <td className="text-text-secondary text-xs">
                        {email.to?.[0]?.user_name || email.to?.[0]?.email || '\u2014'}
                        {email.to?.length > 1 ? ` +${email.to.length - 1}` : ''}
                      </td>
                      <td className="text-text-muted text-xs whitespace-nowrap">
                        {formatDate(email.time)}
                      </td>
                      <td>
                        <div className="flex items-center gap-1">
                          {getStatusBadges(email.status)}
                          {!email.status?.some(s => s.type === 'opened' || s.type === 'clicked') && (
                            <span className="text-[9px] text-text-muted">—</span>
                          )}
                        </div>
                      </td>
                      <td className="text-center">
                        {(email.has_attachment || email.has_thread_attachment) && (
                          <Paperclip size={12} className="text-text-muted" />
                        )}
                      </td>
                      <td>
                        <button
                          onClick={(e) => { e.stopPropagation(); setViewingEmail(email); }}
                          className="p-1 text-text-muted hover:text-csa-accent transition-colors cursor-pointer"
                        >
                          <Eye size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {emails.length > pageSize && (
              <div className="mt-2">
                <Pagination currentPage={safePage} totalItems={emails.length} pageSize={pageSize} onPageChange={setCurrentPage} />
              </div>
            )}
          </>
        )}
      </div>

      {viewingEmail && (
        <EmailDetailModal
          module={module}
          recordId={recordId}
          messageId={viewingEmail.message_id}
          previewSubject={viewingEmail.subject}
          onClose={() => setViewingEmail(null)}
        />
      )}
    </>
  );
}
