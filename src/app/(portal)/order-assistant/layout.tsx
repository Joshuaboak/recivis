import PermissionGate from '@/components/PermissionGate';

export default function OrderAssistantLayout({ children }: { children: React.ReactNode }) {
  return (
    <PermissionGate permission="canUseOrderAssistant" message="You do not have permission to use the Order Assistant.">
      {children}
    </PermissionGate>
  );
}
