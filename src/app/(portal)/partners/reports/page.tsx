import type { Metadata } from 'next';
import PartnerReportsView from '@/components/views/PartnerReportsView';
import { getRouteTitle } from '@/lib/routes';

export const metadata: Metadata = { title: getRouteTitle('/partners/reports') };

export default function PartnerReportsPage() {
  return <PartnerReportsView />;
}
