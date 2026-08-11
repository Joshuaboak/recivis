import type { Metadata } from 'next';
import CouponsView from '@/components/views/CouponsView';
import { getRouteTitle } from '@/lib/routes';

export const metadata: Metadata = { title: getRouteTitle('/coupons') };

export default function CouponsPage() {
  return (
    <CouponsView />
  );
}
