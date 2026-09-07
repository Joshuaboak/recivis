'use client';

import { useCallback, useEffect, useState } from 'react';
import type { User } from './types';

export interface ResellerOption {
  value: string;
  label: string;
}

/**
 * The resellers a user may put on an order.
 *
 * Mirrors what the invoice routes enforce server-side (`canManageReseller`), so
 * the picker never offers an option the save would reject:
 *   - admin/ibm      — every active reseller
 *   - distributor    — itself plus its active children
 *   - everyone else  — no choice at all, so no options and no picker
 *
 * A distributor is recognised by its allowed set having more than one entry
 * rather than by role name, because the same shape covers both the
 * 'Distributor' and 'Distributor/Reseller' partner categories.
 */
export function useAssignableResellers(user: User | null | undefined) {
  const [options, setOptions] = useState<ResellerOption[]>([]);
  const [loading, setLoading] = useState(false);

  const isAdmin = user?.role === 'admin' || user?.role === 'ibm';
  const ownResellerId = user?.resellerId;
  const hasChildren = (user?.allowedResellerIds?.length ?? 0) > 1;
  const canChoose = !!user && (isAdmin || hasChildren);

  const load = useCallback(async () => {
    if (!canChoose) {
      setOptions([]);
      return;
    }
    setLoading(true);
    try {
      const url = isAdmin
        ? '/api/resellers'
        : `/api/resellers?resellerId=${ownResellerId}&includeChildren=true`;
      const res = await fetch(url);
      const data = await res.json();
      const list = (data.resellers || []) as Array<{ id: string; name: string }>;
      setOptions(list.map(r => ({ value: r.id, label: r.name })));
    } catch {
      // A picker with no options falls back to the read-only card, which is the
      // same thing the user saw before this existed.
      setOptions([]);
    } finally {
      setLoading(false);
    }
  }, [canChoose, isAdmin, ownResellerId]);

  useEffect(() => { load(); }, [load]);

  return { options, loading, canChoose, reload: load };
}
