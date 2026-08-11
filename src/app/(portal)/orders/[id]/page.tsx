import type { Metadata } from 'next';
import InvoiceDetailView from '@/components/views/InvoiceDetailView';
import { getRouteTitle } from '@/lib/routes';

export const metadata: Metadata = { title: getRouteTitle('/orders/[id]') };

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <InvoiceDetailView invoiceId={id} />
  );
}
