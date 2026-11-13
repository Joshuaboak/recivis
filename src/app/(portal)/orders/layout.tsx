import PermissionGate from '@/components/PermissionGate';

export default function OrdersLayout({ children }: { children: React.ReactNode }) {
  return (
    <PermissionGate permission="canViewOrders" message="You do not have permission to view orders.">
      {children}
    </PermissionGate>
  );
}
