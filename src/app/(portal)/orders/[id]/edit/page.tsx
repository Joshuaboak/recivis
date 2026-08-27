import type { Metadata } from 'next';
import OrderFormView from '@/components/views/OrderFormView';
import { getRouteTitle } from '@/lib/routes';

export const metadata: Metadata = { title: getRouteTitle('/orders/[id]/edit') };

/**
 * Editing an order.
 *
 * The same form as `/orders/new`, given a record to load: the fields, the
 * pricing, the send-to toggle and licence alignment are the same code, and the
 * only thing that differs is whether saving updates a record or makes one.
 * This used to be the order page in an edit mode of its own, which is how the
 * two drifted into two different pricing models.
 *
 * The UI says "order"; the component, API route and Zoho fields say "invoice".
 */
export default async function OrderEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return <OrderFormView invoiceId={id} />;
}
