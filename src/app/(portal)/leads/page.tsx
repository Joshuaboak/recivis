import type { Metadata } from 'next';
import LeadsView from '@/components/views/LeadsView';
import { getRouteTitle } from '@/lib/routes';

export const metadata: Metadata = { title: getRouteTitle('/leads') };

export default function LeadsPage() {
  return (
    <LeadsView />
  );
}
