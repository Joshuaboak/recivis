import type { Metadata } from 'next';
import ResellerManagementView from '@/components/views/ResellerManagementView';
import { getRouteTitle } from '@/lib/routes';

export const metadata: Metadata = { title: getRouteTitle('/partners/[id]/edit') };

/**
 * Full-form edit for a partner.
 *
 * The same component serves `/partners`, `/partners/[id]` and
 * `/partners/[id]/edit`; `resellerId` picks list vs record and `mode` picks
 * read-only vs form. Driving edit mode from the URL rather than local state
 * means the form survives a refresh, can be linked to, and is left by pressing
 * Back — which is also why the unsaved-work guard can protect it.
 */
export default async function PartnerEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return <ResellerManagementView resellerId={id} mode="edit" />;
}
