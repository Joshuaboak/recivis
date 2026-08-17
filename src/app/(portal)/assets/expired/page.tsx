import type { Metadata } from 'next';
import AssetsView from '@/components/views/AssetsView';
import { getRouteTitle } from '@/lib/routes';

export const metadata: Metadata = { title: getRouteTitle('/assets/expired') };

export default function ExpiredAssetsPage() {
  return <AssetsView scope="expired" />;
}
