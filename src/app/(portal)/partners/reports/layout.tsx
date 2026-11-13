import PermissionGate from '@/components/PermissionGate';

export default function FinancialReportsLayout({ children }: { children: React.ReactNode }) {
  return (
    <PermissionGate permission="canViewFinancialReports" message="You do not have permission to view financial reports.">
      {children}
    </PermissionGate>
  );
}
