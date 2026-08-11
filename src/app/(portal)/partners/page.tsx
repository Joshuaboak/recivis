import type { Metadata } from 'next';
import ResellerManagementView from '@/components/views/ResellerManagementView';
import { getRouteTitle } from '@/lib/routes';

export const metadata: Metadata = { title: getRouteTitle('/partners') };

export default function PartnersPage() {
  return (
    <ResellerManagementView />
  );
}
