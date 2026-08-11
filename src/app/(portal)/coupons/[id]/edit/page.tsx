import type { Metadata } from 'next';
import CouponDetailView from '@/components/views/CouponDetailView';
import { getRouteTitle } from '@/lib/routes';

export const metadata: Metadata = { title: getRouteTitle('/coupons/[id]/edit') };

/**
 * Full-form edit for a coupon.
 *
 * The same component serves `/coupons/[id]` and `/coupons/[id]/edit`; `mode`
 * decides which. Driving edit mode from the URL rather than local state means the
 * form survives a refresh, can be linked to, and is left by pressing Back —
 * which is also why the unsaved-work guard can protect it.
 */
export default async function CouponEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return <CouponDetailView couponId={id} mode="edit" />;
}
