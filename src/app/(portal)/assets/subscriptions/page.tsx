import type { Metadata } from 'next';
import AssetsView from '@/components/views/AssetsView';
import { getRouteTitle } from '@/lib/routes';

export const metadata: Metadata = { title: getRouteTitle('/assets/subscriptions') };

export default function MonthlySubscriptionsPage() {
  return <AssetsView scope="subscriptions" />;
}
