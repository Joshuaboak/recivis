import type { Metadata } from 'next';
import LeadDetailView from '@/components/views/LeadDetailView';
import { getRouteTitle } from '@/lib/routes';

export const metadata: Metadata = { title: getRouteTitle('/leads/[id]/edit') };

/**
 * Full-form edit for a lead or prospect.
 *
 * The same component serves `/leads/[id]` and `/leads/[id]/edit`; `mode`
 * decides which. Driving edit mode from the URL rather than local state means the
 * form survives a refresh, can be linked to, and is left by pressing Back —
 * which is also why the unsaved-work guard can protect it.
 *
 * `?source=` rides along exactly as it does on the detail route: a link that
 * knows which module the record lives in passes it, and a cold deep link
 * leaves it off, in which case the view infers it from the fetched record.
 */
export default async function LeadEditPage({
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

  return <LeadDetailView leadId={id} source={leadSource} mode="edit" />;
}
