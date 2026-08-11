import type { Metadata } from 'next';
import AccountDetailView from '@/components/views/AccountDetailView';
import { getRouteTitle } from '@/lib/routes';

export const metadata: Metadata = { title: getRouteTitle('/accounts/[id]/edit') };

/**
 * Full-form edit for an account.
 *
 * The same component serves `/accounts/[id]` and `/accounts/[id]/edit`; `mode`
 * decides which. Driving edit mode from the URL rather than local state means the
 * form survives a refresh, can be linked to, and is left by pressing Back —
 * which is also why the unsaved-work guard can protect it.
 */
export default async function AccountEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return <AccountDetailView accountId={id} mode="edit" />;
}
