import type { Metadata } from 'next';
import DraftInvoicesView from '@/components/views/DraftInvoicesView';
import { getRouteTitle } from '@/lib/routes';

export const metadata: Metadata = { title: getRouteTitle('/orders') };

export default function OrdersPage() {
  return (
    <DraftInvoicesView />
  );
}
