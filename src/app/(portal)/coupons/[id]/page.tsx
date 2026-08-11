import type { Metadata } from 'next';
import CouponDetailView from '@/components/views/CouponDetailView';
import { getRouteTitle } from '@/lib/routes';

export const metadata: Metadata = { title: getRouteTitle('/coupons/[id]') };

export default async function CouponDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <CouponDetailView couponId={id} />
  );
}
