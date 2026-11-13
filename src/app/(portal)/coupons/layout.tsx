import PermissionGate from '@/components/PermissionGate';

export default function CouponsLayout({ children }: { children: React.ReactNode }) {
  return (
    <PermissionGate permission="canViewCoupons" message="You do not have permission to view coupons.">
      {children}
    </PermissionGate>
  );
}
