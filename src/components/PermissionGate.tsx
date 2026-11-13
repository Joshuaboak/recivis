'use client';

/**
 * PermissionGate — renders children only when the signed-in user holds the
 * given permission. Used by route-segment layouts so every page under a
 * section is covered, since pages stay reachable by URL with the nav hidden.
 * The matching APIs enforce the same permission server-side.
 */

import { useAppStore } from '@/lib/store';
import type { UserPermissions } from '@/lib/types';

type BooleanPermission = {
  [K in keyof UserPermissions]: UserPermissions[K] extends boolean ? K : never;
}[keyof UserPermissions];

export default function PermissionGate({
  permission,
  message,
  children,
}: {
  permission: BooleanPermission;
  message: string;
  children: React.ReactNode;
}) {
  const { user } = useAppStore();

  if (!user?.permissions?.[permission]) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-text-muted">{message}</p>
      </div>
    );
  }

  return <>{children}</>;
}
