import type { Metadata } from 'next';
import OrderFormView from '@/components/views/OrderFormView';
import { getRouteTitle } from '@/lib/routes';

export const metadata: Metadata = { title: getRouteTitle('/orders/new') };

export default function CreateOrderPage() {
  return <OrderFormView />;
}
