import type { Metadata } from 'next';
import PartnerResourcesView from '@/components/views/PartnerResourcesView';
import { getRouteTitle } from '@/lib/routes';

export const metadata: Metadata = { title: getRouteTitle('/partner-resources') };

export default function PartnerResourcesPage() {
  return (
    <PartnerResourcesView />
  );
}
