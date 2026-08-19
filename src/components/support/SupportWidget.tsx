/**
 * SupportWidget — the support assistant, in the bottom-right corner.
 *
 * Deliberately does not reuse ChatInterface. That component is the invoice
 * assistant: it scrapes the model's prose for phrases like "does this look
 * correct" to decide which buttons to render, which would misfire badly on
 * support answers, and it shares one message store that the sidebar clears on
 * every navigation. A support conversation has to survive moving around the
 * app, since moving around the app is usually the answer.
 */

'use client';

import { useState, useRef, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircleQuestion, X, Send, Loader2 } from 'lucide-react';
import SupportMessage from './SupportMessage';

interface SupportMessage {
  role: 'user' | 'assistant';
  content: string;
}

const GREETING =
  'Ask me anything about using the portal — placing an order, chasing a renewal, ' +
  'or why something is not showing up.';

const SUGGESTIONS = [
  'How do I place an order?',
  'Why can I not approve an order?',
  'How do renewals work?',
];

export default function SupportWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || sending) return;

    const next = [...messages, { role: 'user' as const, content: question }];
    setMessages(next);
    setInput('');
    setSending(true);
    setError('');

    try {
      const res = await fetch('/api/support-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The page is sent so answers can be specific about where they are.
        body: JSON.stringify({ messages: next, pathname }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'The assistant is unavailable right now.');
      } else {
        setMessages([...next, { role: 'assistant', content: data.reply }]);
      }
    } catch {
      setError('The assistant is unavailable right now.');
    }
    setSending(false);
  };

  return (
    <>
      {/* Launcher */}
      <button
        data-tour="support-launcher"
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Close the support assistant' : 'Open the support assistant'}
        className="fixed bottom-6 right-6 z-40 w-12 h-12 flex items-center justify-center bg-csa-accent text-white rounded-full shadow-lg hover:opacity-90 transition-opacity cursor-pointer"
      >
        {open ? <X size={20} /> : <MessageCircleQuestion size={20} />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            // Sits below the app's modal layer on purpose: an open dialog
            // should cover the widget, not compete with it.
            className="fixed bottom-24 right-6 z-40 w-[min(24rem,calc(100vw-3rem))] max-h-[min(32rem,calc(100vh-8rem))] flex flex-col bg-csa-dark border border-border rounded-xl shadow-2xl overflow-hidden"
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border-subtle flex-shrink-0">
              <MessageCircleQuestion size={16} className="text-csa-accent" />
              <span className="text-sm font-bold text-text-primary flex-1">Portal help</span>
              {messages.length > 0 && (
                <button
                  onClick={() => { setMessages([]); setError(''); }}
                  className="text-[10px] font-semibold text-text-muted hover:text-text-primary transition-colors cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {messages.length === 0 ? (
                <>
                  <p className="text-xs text-text-secondary leading-relaxed">{GREETING}</p>
                  <div className="space-y-1.5 pt-1">
                    {SUGGESTIONS.map(s => (
                      <button
                        key={s}
                        onClick={() => send(s)}
                        className="w-full text-left px-3 py-2 text-xs text-text-secondary bg-surface border border-border-subtle rounded-lg hover:border-csa-accent/40 hover:text-text-primary transition-colors cursor-pointer"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                messages.map((message, i) => (
                  <div
                    key={i}
                    className={`text-xs leading-relaxed rounded-lg px-3 py-2 ${
                      message.role === 'user'
                        ? 'bg-csa-accent/15 text-text-primary ml-6'
                        : 'bg-surface text-text-secondary mr-2 whitespace-pre-wrap'
                    }`}
                  >
                    {message.role === 'assistant'
                      ? <SupportMessage content={message.content} />
                      : message.content}
                  </div>
                ))
              )}

              {sending && (
                <div className="flex items-center gap-2 text-xs text-text-muted">
                  <Loader2 size={12} className="animate-spin" /> Thinking...
                </div>
              )}
              {error && <p className="text-xs text-error">{error}</p>}
            </div>

            <div className="flex items-end gap-2 px-3 py-3 border-t border-border-subtle flex-shrink-0">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                rows={1}
                placeholder="Ask a question..."
                className="flex-1 resize-none bg-csa-dark border border-border-subtle px-3 py-2 text-xs text-text-primary placeholder-text-muted/50 outline-none focus:border-csa-accent rounded-lg max-h-24"
              />
              <button
                onClick={() => send(input)}
                disabled={sending || !input.trim()}
                aria-label="Send"
                className="w-8 h-8 flex items-center justify-center bg-csa-accent text-white rounded-lg disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex-shrink-0"
              >
                <Send size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
