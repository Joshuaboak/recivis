import type { Metadata } from 'next';
import CreateCouponView from '@/components/views/CreateCouponView';
import { getRouteTitle } from '@/lib/routes';

export const metadata: Metadata = { title: getRouteTitle('/coupons/new') };

export default function CreateCouponPage() {
  return (
    <CreateCouponView />
  );
}
