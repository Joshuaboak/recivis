import type { Metadata } from 'next';
import InvoiceView from '@/components/views/InvoiceView';
import { getRouteTitle } from '@/lib/routes';

export const metadata: Metadata = { title: getRouteTitle('/order-assistant') };

export default function OrderAssistantPage() {
  return (
    <InvoiceView />
  );
}
