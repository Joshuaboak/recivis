import type { Metadata } from 'next';
import InvoiceDetailView from '@/components/views/InvoiceDetailView';
import { getRouteTitle } from '@/lib/routes';

export const metadata: Metadata = { title: getRouteTitle('/orders/[id]/edit') };

/**
 * Full-form edit for an order.
 *
 * The same component serves `/orders/[id]` and `/orders/[id]/edit`; `mode`
 * decides which. Driving edit mode from the URL rather than local state means the
 * form survives a refresh, can be linked to, and is left by pressing Back —
 * which is also why the unsaved-work guard can protect it.
 *
 * The UI says "order"; the component, API route and Zoho fields say "invoice".
 */
export default async function OrderEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return <InvoiceDetailView invoiceId={id} mode="edit" />;
}
