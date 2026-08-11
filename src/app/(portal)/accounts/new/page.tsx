import type { Metadata } from 'next';
import CreateAccountView from '@/components/views/CreateAccountView';
import { getRouteTitle } from '@/lib/routes';

export const metadata: Metadata = { title: getRouteTitle('/accounts/new') };

export default function CreateAccountPage() {
  return (
    <CreateAccountView />
  );
}
