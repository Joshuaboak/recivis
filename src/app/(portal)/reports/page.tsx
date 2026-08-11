import type { Metadata } from 'next';
import ReportsView from '@/components/views/ReportsView';
import { getRouteTitle } from '@/lib/routes';

export const metadata: Metadata = { title: getRouteTitle('/reports') };

export default function ReportsPage() {
  return (
    <ReportsView />
  );
}
