/**
 * CreateEvaluationButton — the "Create Evaluation" action, shown either way.
 *
 * Both the account page and the prospect page used to render this button only
 * when `canCreateEvaluations` was set, and render nothing at all otherwise.
 * That reads as a missing feature rather than a withheld one: the partner sees
 * an Evaluations section, a count, and no way to add to it, with nothing on
 * screen saying why. The same goes for a partner who has the permission but has
 * already used their per-account allowance.
 *
 * So the button is always present. When it cannot be used it is disabled and
 * carries the reason on hover, which is what /api/evaluations would have said
 * on the way back anyway.
 */

'use client';

import { Beaker } from 'lucide-react';
import type { UserPermissions } from '@/lib/types';

/**
 * Why this partner cannot create an evaluation here, or null when they can.
 *
 * The cap mirrors the check in /api/evaluations: -1 is unlimited, and 0 is the
 * value the permission resolution uses for "not allowed at all".
 *
 * A limit of zero used to be reported as "no permission", which sent
 * administrators to the wrong switch. The two are genuinely different and one
 * of them is a trap: the Restricted Reseller preset ships with the permission
 * off *and* a limit of zero, so turning the permission on for a partner leaves
 * the limit inheriting zero — granted and impossible at the same time. It says
 * which now, because "ask your administrator to enable it" is unhelpful advice
 * when they already did.
 */
export function evaluationBlockedReason(
  permissions: UserPermissions | undefined,
  existingCount: number
): string | null {
  if (!permissions?.canCreateEvaluations) {
    return 'Your account does not have permission to create evaluations. This needs turning on for your partner account and for your user role — both.';
  }
  const max = permissions.maxEvaluationsPerAccount;
  if (max === 0) {
    return 'Evaluations are enabled for your partner account but its limit is set to 0, so none can be created. Ask your administrator to raise the evaluation limit.';
  }
  if (max !== -1 && existingCount >= max) {
    return `This customer already has the maximum of ${max} evaluation${max === 1 ? '' : 's'}. Ask your administrator to raise the limit.`;
  }
  return null;
}

export default function CreateEvaluationButton({
  permissions,
  existingCount,
  onClick,
}: {
  permissions: UserPermissions | undefined;
  /** Evaluations already on this account, for the per-account cap. */
  existingCount: number;
  onClick: () => void;
}) {
  const blocked = evaluationBlockedReason(permissions, existingCount);

  const button = (
    <button
      onClick={blocked ? undefined : onClick}
      disabled={!!blocked}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-success bg-success/10 border border-success/30 rounded-xl hover:bg-success/20 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-success/10"
    >
      <Beaker size={13} />
      Create Evaluation
    </button>
  );

  if (!blocked) return button;

  // Same shape as the Convert to Prospect hint: a hover tooltip rather than a
  // caption, so the disabled control stays in line with its neighbours.
  return (
    <div className="relative group/eval">
      {button}
      <div className="absolute right-0 top-full mt-1.5 z-20 w-64 bg-csa-dark border border-border rounded-xl px-3 py-2 shadow-lg opacity-0 pointer-events-none group-hover/eval:opacity-100 transition-opacity">
        <p className="text-[11px] text-text-secondary leading-relaxed">{blocked}</p>
      </div>
    </div>
  );
}
