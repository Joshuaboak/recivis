import type { Metadata } from 'next';
import AccountsView from '@/components/views/AccountsView';
import { getRouteTitle } from '@/lib/routes';

export const metadata: Metadata = { title: getRouteTitle('/accounts') };

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const { notice } = await searchParams;

  return (
    <AccountsView notice={notice} />
  );
}
