import type { Metadata } from 'next';
import LeadDetailView from '@/components/views/LeadDetailView';
import { getRouteTitle } from '@/lib/routes';

export const metadata: Metadata = { title: getRouteTitle('/leads/[id]') };

/**
 * A lead is either a Leads-module record or a Prospect account. The view
 * needs to know which, so the distinction rides along as `?source=`. On a
 * cold deep link the param may be missing, in which case the view infers
 * the source from the record it fetches.
 */
export default async function LeadDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ source?: string }>;
}) {
  const { id } = await params;
  const { source } = await searchParams;
  const leadSource =
    source === 'prospect' ? 'prospect' : source === 'lead' ? 'lead' : undefined;

  return (
    <LeadDetailView leadId={id} source={leadSource} />
  );
}
