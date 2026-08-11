import type { Metadata } from 'next';
import AccountDetailView from '@/components/views/AccountDetailView';
import { getRouteTitle } from '@/lib/routes';

export const metadata: Metadata = { title: getRouteTitle('/accounts/[id]') };

export default async function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <AccountDetailView accountId={id} />
  );
}
