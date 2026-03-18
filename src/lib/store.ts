import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, ChatMessage } from './types';

interface AppState {
  user: User | null;
  setUser: (user: User | null) => void;

  messages: ChatMessage[];
  addMessage: (message: ChatMessage) => void;
  updateMessage: (id: string, updates: Partial<ChatMessage>) => void;
  clearMessages: () => void;

  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;

  currentView: 'dashboard' | 'accounts' | 'account-detail' | 'invoice' | 'invoice-detail' | 'create-invoice' | 'draft-invoices' | 'reports';
  setCurrentView: (view: 'dashboard' | 'accounts' | 'account-detail' | 'invoice' | 'invoice-detail' | 'create-invoice' | 'draft-invoices' | 'reports') => void;

  newInvoiceContext: Record<string, unknown> | null;
  setNewInvoiceContext: (ctx: Record<string, unknown> | null) => void;

  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;

  pendingPOFile: { fileName: string; base64: string } | null;
  setPendingPOFile: (file: { fileName: string; base64: string } | null) => void;

  selectedAccountId: string | null;
  setSelectedAccountId: (id: string | null) => void;

  selectedInvoiceId: string | null;
  setSelectedInvoiceId: (id: string | null) => void;

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
        set((state) => ({ messages: [...state.messages, message] })),
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

      selectedAccountId: null,
      setSelectedAccountId: (id) => set({ selectedAccountId: id }),

      selectedInvoiceId: null,
      setSelectedInvoiceId: (id) => set({ selectedInvoiceId: id }),

      invoiceReturnView: null,
      setInvoiceReturnView: (view) => set({ invoiceReturnView: view }),

      newInvoiceContext: null,
      setNewInvoiceContext: (ctx) => set({ newInvoiceContext: ctx }),
    }),
    {
      name: 'recivis-storage',
      partialize: (state) => ({ user: state.user }),
    }
  )
);
