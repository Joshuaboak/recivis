import type { Metadata } from 'next';
import CreateInvoiceView from '@/components/views/CreateInvoiceView';
import { getRouteTitle } from '@/lib/routes';

export const metadata: Metadata = { title: getRouteTitle('/orders/new') };

export default function CreateOrderPage() {
  return (
    <CreateInvoiceView />
  );
}
