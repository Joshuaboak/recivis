import type { Metadata } from 'next';
import AssetsView from '@/components/views/AssetsView';
import { getRouteTitle } from '@/lib/routes';

export const metadata: Metadata = { title: getRouteTitle('/assets/renewals') };

export default function AssetRenewalsPage() {
  return <AssetsView scope="renewals" />;
}
