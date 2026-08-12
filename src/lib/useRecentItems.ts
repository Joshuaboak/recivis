/**
 * useRecentItems — the records this user has opened, most recent first.
 *
 * A detail view calls `useTrackRecentItem` once its record has loaded; the
 * header's Recent Items menu reads the same list back with `useRecentItems`.
 *
 * Storage is localStorage, keyed by the signed-in user's email so two accounts
 * on one machine never see each other's history. Only what the portal already
 * shows in a list — record id, title, subtitle and its portal path — is kept.
 * The list is capped at RECENT_ITEM_LIMIT entries.
 *
 * Writes broadcast a window event so a menu that is already mounted updates
 * the moment a record is opened, without polling.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store';

export type RecentItemType = 'account' | 'lead' | 'order' | 'coupon' | 'partner';

export interface RecentItem {
  type: RecentItemType;
  /** Zoho record id. Unique per type, not across types. */
  id: string;
  title: string;
  subtitle?: string;
  /** Portal path the entry navigates to. */
  href: string;
  /** When it was last opened (epoch ms). */
  openedAt: number;
}

/** How many entries the menu keeps. */
export const RECENT_ITEM_LIMIT = 10;

/** Fired on the window whenever the stored list changes in this tab. */
const CHANGE_EVENT = 'recivis:recent-items';

function storageKey(email: string | undefined): string | null {
  return email ? `recivis:recent-items:${email}` : null;
}

function read(key: string | null): RecentItem[] {
  if (!key || typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RecentItem[]) : [];
  } catch {
    return [];
  }
}

function write(key: string, items: RecentItem[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(items));
  } catch { /* quota or private mode — history is not worth failing over */ }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** The stored list plus a way to empty it. Empty until the session resolves. */
export function useRecentItems(): { items: RecentItem[]; clear: () => void } {
  const email = useAppStore(state => state.user?.email);
  const key = storageKey(email);
  const [items, setItems] = useState<RecentItem[]>([]);

  useEffect(() => {
    const sync = () => setItems(read(key));
    sync();
    window.addEventListener(CHANGE_EVENT, sync);
    // `storage` fires only in other tabs, which is exactly the case the
    // in-tab event above does not cover.
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, [key]);

  const clear = useCallback(() => {
    if (key) write(key, []);
  }, [key]);

  return { items, clear };
}

/**
 * Record a visit. Pass null while the record is still loading — the entry is
 * written once, when a titled record is available.
 */
export function useTrackRecentItem(item: Omit<RecentItem, 'openedAt'> | null) {
  const email = useAppStore(state => state.user?.email);
  const key = storageKey(email);
  const { type, id, title, subtitle, href } = item ?? {};

  useEffect(() => {
    if (!key || !type || !id || !title || !href) return;
    const entry: RecentItem = { type, id, title, subtitle, href, openedAt: Date.now() };
    const rest = read(key).filter(i => !(i.type === entry.type && i.id === entry.id));
    write(key, [entry, ...rest].slice(0, RECENT_ITEM_LIMIT));
  }, [key, type, id, title, subtitle, href]);
}
