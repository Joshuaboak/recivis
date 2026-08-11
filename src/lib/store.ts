/**
 * store.ts — Global client-side state for ReCivis (Zustand).
 *
 * Manages all UI state across the single-page app:
 * - Authentication (user session)
 * - Chat messages (AI invoice assistant conversation)
 * - UI controls (sidebar, loading, pending PO file)
 *
 * Nothing here is persisted. The `recivis-token` cookie is the only session:
 * the portal layout rehydrates `user` from GET /api/auth on mount. Keeping
 * a copy in localStorage used to desynchronise the server and client on the
 * first render, which is why the app had to opt out of SSR entirely.
 *
 * One deliberate, narrow exception — do not "fix" this back:
 * `ChatInterface` persists the chat transcript to **sessionStorage**. Once the
 * app gained real routing, browser Back could destroy 5-30 minutes of work, and
 * Back cannot be intercepted in the App Router. Session scope was chosen because
 * a transcript can contain a customer's purchase-order contents: it survives
 * in-app Back, route changes and a reload in the same tab, then dies with the
 * tab. It is **never written to localStorage** and never persists across
 * sessions or to disk. The store itself stays plain in-memory state — the
 * persistence lives in `ChatInterface`, not here.
 */

import { create } from 'zustand';
import type { User, ChatMessage } from './types';
import { CHAT_MESSAGE_LIMIT } from './constants';

interface AppState {
  // --- Authentication ---
  /** Currently logged-in user (null = unauthenticated). Persisted to localStorage. */
  user: User | null;
  setUser: (user: User | null) => void;

  // --- AI Chat (Invoice Assistant) ---
  /** Conversation history with the AI invoice assistant. Capped at CHAT_MESSAGE_LIMIT. */
  messages: ChatMessage[];
  addMessage: (message: ChatMessage) => void;
  updateMessage: (id: string, updates: Partial<ChatMessage>) => void;
  clearMessages: () => void;

  // --- Layout ---
  /** Whether the sidebar navigation panel is expanded. */
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;

  /** Pre-populated context for the Create Invoice form (account, contact, reseller, etc). */
  newInvoiceContext: Record<string, unknown> | null;
  setNewInvoiceContext: (ctx: Record<string, unknown> | null) => void;

  // --- Global UI ---
  /** Global loading flag for cross-view loading states. */
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;

  /** Purchase order file staged for upload (base64-encoded). */
  pendingPOFile: { fileName: string; base64: string } | null;
  setPendingPOFile: (file: { fileName: string; base64: string } | null) => void;

}

export const useAppStore = create<AppState>()((set) => ({
  user: null,
  setUser: (user) => set({ user }),

  messages: [],
  addMessage: (message) =>
    set((state) => {
      const messages = [...state.messages, message];
      // Keep only the last CHAT_MESSAGE_LIMIT messages to prevent memory bloat
      return { messages: messages.slice(-CHAT_MESSAGE_LIMIT) };
    }),
  updateMessage: (id, updates) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === id ? { ...m, ...updates } : m
      ),
    })),
  clearMessages: () => set({ messages: [] }),

  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  isLoading: false,
  setIsLoading: (loading) => set({ isLoading: loading }),

  pendingPOFile: null,
  setPendingPOFile: (file) => set({ pendingPOFile: file }),

  newInvoiceContext: null,
  setNewInvoiceContext: (ctx) => set({ newInvoiceContext: ctx }),

}));
