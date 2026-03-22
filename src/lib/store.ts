/**
 * store.ts — Global client-side state for ReCivis (Zustand).
 *
 * Manages all UI state across the single-page app:
 * - Authentication (user session)
 * - Navigation (current view, selected record IDs)
 * - Chat messages (AI invoice assistant conversation)
 * - UI controls (sidebar, loading, pending PO file)
 *
 * Only the `user` object is persisted to localStorage (via Zustand's
 * persist middleware). Everything else resets on page reload, which is
 * intentional — stale record IDs and messages should not survive a refresh.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
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

  // --- Navigation ---
  /** Active view in the SPA — drives which component AppShell renders. */
  currentView: 'dashboard' | 'leads' | 'lead-detail' | 'create-lead' | 'accounts' | 'account-detail' | 'create-account' | 'invoice' | 'invoice-detail' | 'create-invoice' | 'draft-invoices' | 'reports' | 'reports-dashboard' | 'coupons' | 'create-coupon' | 'coupon-detail' | 'resellers' | 'reseller-detail' | 'partner-resources';
  setCurrentView: (view: 'dashboard' | 'leads' | 'lead-detail' | 'create-lead' | 'accounts' | 'account-detail' | 'create-account' | 'invoice' | 'invoice-detail' | 'create-invoice' | 'draft-invoices' | 'reports' | 'reports-dashboard' | 'coupons' | 'create-coupon' | 'coupon-detail' | 'resellers' | 'reseller-detail' | 'partner-resources') => void;

  // --- Selected Record IDs (for detail views) ---
  /** Zoho CRM record ID of the currently selected reseller. */
  selectedResellerId: string | null;
  setSelectedResellerId: (id: string | null) => void;

  /** Zoho CRM record ID of the currently selected coupon. */
  selectedCouponId: string | null;
  setSelectedCouponId: (id: string | null) => void;

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

  /** Zoho CRM record ID of the currently selected lead/prospect. */
  selectedLeadId: string | null;
  setSelectedLeadId: (id: string | null) => void;

  /** Source of the selected lead — 'lead' (Leads module) or 'prospect' (Account with type Prospect). */
  selectedLeadSource: 'lead' | 'prospect' | null;
  setSelectedLeadSource: (source: 'lead' | 'prospect' | null) => void;

  /** Zoho CRM record ID of the currently selected account. */
  selectedAccountId: string | null;
  setSelectedAccountId: (id: string | null) => void;

  /** Zoho CRM record ID of the currently selected invoice. */
  selectedInvoiceId: string | null;
  setSelectedInvoiceId: (id: string | null) => void;

  /** Tracks which view to return to when leaving the invoice detail page. */
  invoiceReturnView: 'draft-invoices' | 'account-detail' | null;
  setInvoiceReturnView: (view: 'draft-invoices' | 'account-detail' | null) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
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

      currentView: 'dashboard',
      setCurrentView: (view) => set({ currentView: view }),

      isLoading: false,
      setIsLoading: (loading) => set({ isLoading: loading }),

      pendingPOFile: null,
      setPendingPOFile: (file) => set({ pendingPOFile: file }),

      selectedLeadId: null,
      setSelectedLeadId: (id) => set({ selectedLeadId: id }),

      selectedLeadSource: null,
      setSelectedLeadSource: (source) => set({ selectedLeadSource: source }),

      selectedAccountId: null,
      setSelectedAccountId: (id) => set({ selectedAccountId: id }),

      selectedInvoiceId: null,
      setSelectedInvoiceId: (id) => set({ selectedInvoiceId: id }),

      invoiceReturnView: null,
      setInvoiceReturnView: (view) => set({ invoiceReturnView: view }),

      newInvoiceContext: null,
      setNewInvoiceContext: (ctx) => set({ newInvoiceContext: ctx }),

      selectedCouponId: null,
      setSelectedCouponId: (id) => set({ selectedCouponId: id }),

      selectedResellerId: null,
      setSelectedResellerId: (id) => set({ selectedResellerId: id }),
    }),
    {
      name: 'recivis-storage',
      // Only persist the user session — all other state is transient
      partialize: (state) => ({ user: state.user }),
    }
  )
);
