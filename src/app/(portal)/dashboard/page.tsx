import type { Metadata } from 'next';
import DashboardView from '@/components/views/DashboardView';
import { getRouteTitle } from '@/lib/routes';

export const metadata: Metadata = { title: getRouteTitle('/dashboard') };

export default function DashboardPage() {
  return (
    <DashboardView />
  );
}
