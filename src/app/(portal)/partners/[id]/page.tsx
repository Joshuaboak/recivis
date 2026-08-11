import type { Metadata } from 'next';
import ResellerManagementView from '@/components/views/ResellerManagementView';
import { getRouteTitle } from '@/lib/routes';

export const metadata: Metadata = { title: getRouteTitle('/partners/[id]') };

/** Same component as /partners — the resellerId prop switches it to detail mode. */
export default async function PartnerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <ResellerManagementView resellerId={id} />
  );
}
