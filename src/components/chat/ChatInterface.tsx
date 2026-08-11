'use client';

/**
 * ChatInterface — the AI invoice assistant conversation.
 *
 * Transcript persistence is deliberately **sessionStorage, not localStorage**.
 * A transcript can hold a customer's purchase-order contents, so it must not
 * outlive the tab or land on disk between sessions; but it is also 5-30 minutes
 * of work, and browser Back cannot be intercepted in the App Router. Session
 * scope is the narrow middle: it survives in-app Back, route changes and a
 * reload in the same tab, and dies when the tab closes.
 *
 * This is implemented here rather than with `useDraft` because that hook is
 * localStorage-only. It follows the same rules: no silent rehydration (the user
 * is offered a `DraftRestoreBar` and chooses), and every storage access is
 * try/catch'd so private browsing or disabled storage degrades to a no-op.
 *
 * The staged PO file (`pendingPOFile`) is never persisted — base64 file bodies
 * stay out of storage. Only the parsed text the assistant was given (a message's
 * `apiContent`) is kept.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, RotateCcw, Sparkles, LucideIcon } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import type { ChatMessage } from '@/lib/types';
import { DraftRestoreBar } from '@/components/DraftRestoreBar';
import ChatMessageComponent from './ChatMessage';

interface QuickAction {
  label: string;
  icon: LucideIcon;
  message: string;
}

const CHAT_SESSION_KEY = 'recivis:session:chat';

interface StoredTranscript {
  savedAt: number;
  messages: ChatMessage[];
}

function readStoredTranscript(): StoredTranscript | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(CHAT_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt?: unknown; messages?: unknown };
    if (typeof parsed?.savedAt !== 'number' || !Array.isArray(parsed.messages)) return null;
    if (parsed.messages.length === 0) return null;
    const messages = (parsed.messages as ChatMessage[]).map((m) => ({
      ...m,
      // JSON turned the Date into a string on the way out.
      timestamp: new Date(m.timestamp),
    }));
    return { savedAt: parsed.savedAt, messages };
  } catch {
    return null;
  }
}

function writeStoredTranscript(messages: ChatMessage[]) {
  if (typeof window === 'undefined') return;
  try {
    // An explicit allowlist, not a spread: it keeps file bodies and any future
    // field out of storage by default. `isStreaming` is dropped so a half-streamed
    // bubble can never come back looking live.
    const payload: StoredTranscript = {
      savedAt: Date.now(),
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        apiContent: m.apiContent,
        timestamp: m.timestamp,
        components: m.components,
      })),
    };
    window.sessionStorage.setItem(CHAT_SESSION_KEY, JSON.stringify(payload));
  } catch {
    // Private browsing, quota, disabled storage — persistence is best-effort.
  }
}

function clearStoredTranscript() {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(CHAT_SESSION_KEY);
  } catch {
    // no-op
  }
}

interface ChatInterfaceProps {
  initialMessage?: string;
  placeholder?: string;
  quickActions?: QuickAction[];
}

export default function ChatInterface({ initialMessage, placeholder, quickActions }: ChatInterfaceProps) {
  const { messages, addMessage, updateMessage, clearMessages, user, isLoading, setIsLoading, pendingPOFile, setPendingPOFile } = useAppStore();
  const [input, setInput] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const hasInitialized = useRef(false);

  // Read once, at mount, in the initialiser — never applied to the conversation
  // on its own. Until the user answers, this holds the restore prompt.
  const [pendingTranscript, setPendingTranscript] = useState(readStoredTranscript);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Send initial greeting. Held back while a restore prompt is open so the
  // greeting doesn't end up stacked on top of a restored conversation.
  useEffect(() => {
    if (!hasInitialized.current && !pendingTranscript && messages.length === 0 && initialMessage) {
      hasInitialized.current = true;
      const greeting: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: initialMessage,
        timestamp: new Date(),
      };
      addMessage(greeting);
    }
  }, [initialMessage, messages.length, addMessage, pendingTranscript]);

  // Debounced session write.
  useEffect(() => {
    // Suspended while the restore prompt is open, so a fresh conversation can't
    // overwrite the transcript the user is still deciding about.
    if (pendingTranscript) return;
    // Just the greeting isn't work worth offering back.
    if (messages.length < 2) return;
    const timer = setTimeout(() => writeStoredTranscript(messages), 500);
    return () => clearTimeout(timer);
  }, [messages, pendingTranscript]);

  const restoreTranscript = () => {
    const stored = pendingTranscript;
    setPendingTranscript(null);
    if (!stored) return;
    hasInitialized.current = true;   // the greeting must not also fire
    clearMessages();
    for (const message of stored.messages) addMessage(message);
  };

  const discardTranscript = () => {
    setPendingTranscript(null);
    clearStoredTranscript();
  };

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: content.trim(),
      timestamp: new Date(),
    };
    addMessage(userMessage);
    setInput('');
    setIsLoading(true);

    const assistantId = crypto.randomUUID();
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
    };
    addMessage(assistantMessage);

    try {
      const apiMessages = [...messages, userMessage]
        .filter((m) => m.role !== 'system')
        .map((m) => ({
          role: m.role,
          content: m.apiContent || m.content,
        }));

      await fetchSSE('/api/chat', { messages: apiMessages, user }, assistantId);
    } catch (error) {
      updateMessage(assistantId, {
        content: `Something went wrong: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`,
        isStreaming: false,
      });
    } finally {
      setIsLoading(false);
      setStatusMessage('');
    }
  }, [isLoading, messages, user, addMessage, updateMessage, setIsLoading]);

  /** Auto-attach the pending PO file when an invoice is created */
  const autoAttachPendingFile = useCallback(async (responseContent: string) => {
    const file = useAppStore.getState().pendingPOFile;
    if (!file) return;

    // Check if response contains a newly created invoice link
    const invoiceMatch = responseContent.match(/\/Invoices\/(\d+)/);
    if (!invoiceMatch) return;

    const invoiceId = invoiceMatch[1];
    const lower = responseContent.toLowerCase();
    if (!(lower.includes('invoice created') || lower.includes('created') || lower.includes('success'))) return;

    try {
      const res = await fetch('/api/attach-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recordID: invoiceId,
          fileName: file.fileName,
          base64: file.base64,
          moduleName: 'Invoices',
        }),
      });

      if (res.ok) {
        // Add a system-like message confirming attachment
        addMessage({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `PO document **${file.fileName}** automatically attached to the invoice.`,
          timestamp: new Date(),
        });
      }
    } catch {
      // Non-critical — user can still attach manually
    }

    // Clear the pending file regardless
    useAppStore.getState().setPendingPOFile(null);
  }, [addMessage]);

  /** Stream SSE from the chat API, updating status and final content */
  const fetchSSE = useCallback(async (url: string, body: unknown, assistantId: string) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok || !res.body) {
      throw new Error(`Request failed: ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const event = JSON.parse(line.slice(6));

          if (event.type === 'status') {
            setStatusMessage(event.message);
          } else if (event.type === 'done') {
            updateMessage(assistantId, {
              content: event.content,
              isStreaming: false,
            });
            setStatusMessage('');
            // Auto-attach pending PO file if invoice was just created
            autoAttachPendingFile(event.content);
          } else if (event.type === 'error') {
            updateMessage(assistantId, {
              content: `Error: ${event.error}`,
              isStreaming: false,
            });
            setStatusMessage('');
          }
        } catch {
          // skip malformed events
        }
      }
    }
  }, [updateMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  // Send a file — parse server-side first, then send content to Claude
  const sendFileMessage = useCallback(async (fileName: string, base64: string, mediaType: string, isPdf: boolean) => {
    if (isLoading) return;

    setIsLoading(true);

    // Step 1: Parse the file
    let poMessage: string;
    try {
      const parseRes = await fetch('/api/parse-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, mediaType, fileName }),
      });

      if (!parseRes.ok) throw new Error('Failed to parse file');
      const parsed = await parseRes.json();
      if (parsed.error) throw new Error(parsed.error);

      poMessage = `I have a purchase order to process. The document "${fileName}" has been analysed and here is the extracted data:\n\n---\n${parsed.content}\n---\n\nPlease process this PO: look up the account in CRM, match contacts, identify the products, build the SKU(s), and create the invoice. Follow the PO upload flow.`;
    } catch (error) {
      setIsLoading(false);
      addMessage({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Failed to process the file: ${error instanceof Error ? error.message : 'Unknown error'}. You can paste the PO details as text instead.`,
        timestamp: new Date(),
      });
      return;
    }

    // Step 2: Add user message with apiContent storing the full PO data
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: `Uploaded: ${fileName} — Processing purchase order...`,
      apiContent: poMessage,
      timestamp: new Date(),
    };
    addMessage(userMessage);

    const assistantId = crypto.randomUUID();
    addMessage({
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
    });

    try {
      // Step 3: Build API messages using apiContent when available
      const apiMessages = [
        ...messages.map((m) => ({ role: m.role, content: m.apiContent || m.content })),
        { role: 'user', content: poMessage },
      ].filter((m) => m.role !== 'system');

      await fetchSSE('/api/chat', { messages: apiMessages, user }, assistantId);
    } catch (error) {
      updateMessage(assistantId, {
        content: `Failed to process the file: ${error instanceof Error ? error.message : 'Unknown error'}. You can paste the PO details as text instead.`,
        isStreaming: false,
      });
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, messages, user, addMessage, updateMessage, setIsLoading, fetchSSE]);

  // Listen for option clicks from ChatMessage components
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && typeof detail === 'string') {
        sendMessage(detail);
      }
    };
    window.addEventListener('recivis-send-message', handler);
    return () => window.removeEventListener('recivis-send-message', handler);
  }, [sendMessage]);

  // Listen for file uploads from InvoiceView
  useEffect(() => {
    const handler = (e: Event) => {
      const { fileName, base64, mediaType, isPdf } = (e as CustomEvent).detail;
      sendFileMessage(fileName, base64, mediaType, isPdf);
    };
    window.addEventListener('recivis-send-file', handler);
    return () => window.removeEventListener('recivis-send-file', handler);
  }, [sendFileMessage]);

  const handleNewConversation = () => {
    clearMessages();
    // An explicit reset — drop the stored transcript with it.
    clearStoredTranscript();
    setPendingTranscript(null);
    hasInitialized.current = false;
  };

  // Show quick actions only when there's just the initial greeting (1 message, from assistant)
  const showQuickActions = quickActions && messages.length === 1 && messages[0]?.role === 'assistant' && !isLoading;

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="max-w-5xl mx-auto space-y-1">
          {/* Never rehydrated silently — the user chooses. */}
          {pendingTranscript ? (
            <DraftRestoreBar
              savedAt={pendingTranscript.savedAt}
              label="unsaved conversation"
              onRestore={restoreTranscript}
              onDiscard={discardTranscript}
            />
          ) : null}

          <AnimatePresence initial={false}>
            {messages.map((message, index) => (
              <ChatMessageComponent
                key={message.id}
                message={message}
                index={index}
              />
            ))}
          </AnimatePresence>

          {/* Quick action buttons — shown after initial greeting */}
          <AnimatePresence>
            {showQuickActions && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.3, delay: 0.2 }}
                className="flex gap-3 py-4 pl-11"
              >
                {quickActions.map((action) => (
                  <button
                    key={action.label}
                    onClick={() => sendMessage(action.message)}
                    className="flex items-center gap-2.5 px-5 py-3 bg-surface-raised border-2 border-border-subtle rounded-xl hover:border-csa-accent hover:bg-csa-accent/10 text-text-secondary hover:text-csa-accent transition-all duration-150 group"
                  >
                    <action.icon size={18} className="text-text-muted group-hover:text-csa-accent transition-colors" />
                    <span className="text-sm font-semibold">{action.label}</span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Typing indicator with status */}
          <AnimatePresence>
            {isLoading && messages[messages.length - 1]?.isStreaming && !messages[messages.length - 1]?.content && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-3 py-4 pl-11"
              >
                <div className="flex items-center gap-3 bg-surface-raised px-4 py-3 border-l-4 border-csa-accent rounded-r-xl">
                  <div className="flex items-center gap-1.5">
                    <div className="typing-dot w-1.5 h-1.5 bg-csa-accent rounded-full" />
                    <div className="typing-dot w-1.5 h-1.5 bg-csa-accent rounded-full" />
                    <div className="typing-dot w-1.5 h-1.5 bg-csa-accent rounded-full" />
                  </div>
                  <AnimatePresence mode="wait">
                    {statusMessage && (
                      <motion.span
                        key={statusMessage}
                        initial={{ opacity: 0, x: -4 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 4 }}
                        className="text-xs text-text-muted"
                      >
                        {statusMessage}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="border-t-4 border-border bg-csa-dark px-6 py-4">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-end gap-3">
            <div className="flex-1 relative bg-surface border-2 border-border-subtle focus-within:border-csa-accent transition-colors rounded-xl">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder || 'Type a message...'}
                disabled={isLoading}
                rows={1}
                className="w-full bg-transparent px-4 py-3 pr-12 text-sm text-text-primary placeholder-text-muted resize-none outline-none disabled:opacity-50"
                style={{ minHeight: '48px', maxHeight: '120px' }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = '48px';
                  target.style.height = Math.min(target.scrollHeight, 120) + 'px';
                }}
              />
            </div>

            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isLoading}
              className="h-12 w-12 flex items-center justify-center bg-csa-accent text-white disabled:opacity-30 disabled:cursor-not-allowed hover:bg-csa-primary transition-colors flex-shrink-0 rounded-xl"
            >
              <Send size={18} />
            </button>

            <button
              onClick={handleNewConversation}
              className="h-12 w-12 flex items-center justify-center border-2 border-border-subtle text-text-muted hover:text-csa-accent hover:border-csa-accent transition-colors flex-shrink-0 rounded-xl"
              title="New conversation"
            >
              <RotateCcw size={18} />
            </button>
          </div>

          <div className="flex items-center justify-between mt-2">
            <p className="text-[11px] text-text-muted">
              Press <kbd className="px-1 py-0.5 bg-surface-raised text-text-secondary text-[10px] font-mono rounded">Enter</kbd> to send, <kbd className="px-1 py-0.5 bg-surface-raised text-text-secondary text-[10px] font-mono rounded">Shift+Enter</kbd> for new line
            </p>
            <div className="flex items-center gap-1 text-[11px] text-text-muted">
              <Sparkles size={12} className="text-csa-purple" />
              Powered by Claude
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
