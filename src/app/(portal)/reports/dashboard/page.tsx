import type { Metadata } from 'next';
import ReportsDashboardView from '@/components/views/ReportsDashboardView';
import { getRouteTitle } from '@/lib/routes';

export const metadata: Metadata = { title: getRouteTitle('/reports/dashboard') };

export default function ReportsDashboardPage() {
  return (
    <ReportsDashboardView />
  );
}
