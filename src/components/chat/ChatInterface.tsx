'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Paperclip, RotateCcw, Sparkles } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import type { ChatMessage } from '@/lib/types';
import ChatMessageComponent from './ChatMessage';

interface ChatInterfaceProps {
  initialMessage?: string;
  placeholder?: string;
}

export default function ChatInterface({ initialMessage, placeholder }: ChatInterfaceProps) {
  const { messages, addMessage, updateMessage, clearMessages, user, isLoading, setIsLoading } = useAppStore();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const hasInitialized = useRef(false);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Send initial greeting
  useEffect(() => {
    if (!hasInitialized.current && messages.length === 0 && initialMessage) {
      hasInitialized.current = true;
      const greeting: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: initialMessage,
        timestamp: new Date(),
      };
      addMessage(greeting);
    }
  }, [initialMessage, messages.length, addMessage]);

  const sendMessage = async (content: string) => {
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

    // Create placeholder for assistant response
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
      // Build conversation history for API
      const apiMessages = [...messages, userMessage]
        .filter((m) => m.role !== 'system')
        .map((m) => ({
          role: m.role,
          content: m.content,
        }));

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages, user }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to get response');
      }

      const data = await res.json();
      updateMessage(assistantId, {
        content: data.content,
        isStreaming: false,
      });
    } catch (error) {
      updateMessage(assistantId, {
        content: `Something went wrong: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`,
        isStreaming: false,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

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
  });

  const handleNewConversation = () => {
    clearMessages();
    hasInitialized.current = false;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="max-w-3xl mx-auto space-y-1">
          <AnimatePresence initial={false}>
            {messages.map((message, index) => (
              <ChatMessageComponent
                key={message.id}
                message={message}
                index={index}
              />
            ))}
          </AnimatePresence>

          {/* Typing indicator */}
          <AnimatePresence>
            {isLoading && messages[messages.length - 1]?.isStreaming && !messages[messages.length - 1]?.content && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2 py-4 px-4"
              >
                <div className="flex items-center gap-1.5 bg-surface-raised px-4 py-3 border-l-4 border-csa-accent rounded-r-lg">
                  <div className="typing-dot w-2 h-2 bg-csa-accent" />
                  <div className="typing-dot w-2 h-2 bg-csa-accent" />
                  <div className="typing-dot w-2 h-2 bg-csa-accent" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="border-t-4 border-border bg-csa-dark px-6 py-4">
        <div className="max-w-3xl mx-auto">
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
              Press <kbd className="px-1 py-0.5 bg-surface-raised text-text-secondary text-[10px] font-mono">Enter</kbd> to send, <kbd className="px-1 py-0.5 bg-surface-raised text-text-secondary text-[10px] font-mono">Shift+Enter</kbd> for new line
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
