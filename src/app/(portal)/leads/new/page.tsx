import type { Metadata } from 'next';
import CreateLeadView from '@/components/views/CreateLeadView';
import { getRouteTitle } from '@/lib/routes';

export const metadata: Metadata = { title: getRouteTitle('/leads/new') };

export default function CreateLeadPage() {
  return (
    <CreateLeadView />
  );
}
