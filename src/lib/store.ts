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

  currentView: 'dashboard' | 'invoice' | 'reports';
  setCurrentView: (view: 'dashboard' | 'invoice' | 'reports') => void;

  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
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
    }),
    {
      name: 'recivis-storage',
      partialize: (state) => ({ user: state.user }),
    }
  )
);
