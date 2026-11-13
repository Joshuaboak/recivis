import PermissionGate from '@/components/PermissionGate';

export default function NewOrderLayout({ children }: { children: React.ReactNode }) {
  return (
    <PermissionGate permission="canCreateInvoices" message="You do not have permission to create orders.">
      {children}
    </PermissionGate>
  );
}
