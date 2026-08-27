/**
 * Tests for why the Create Evaluation button is unavailable.
 *
 * The message is the whole value of this: an administrator who has already
 * turned the permission on and is told "ask your administrator to enable it"
 * has been sent to the switch they just flipped. The Restricted Reseller preset
 * makes that easy to hit — it ships with evaluations off *and* a limit of zero,
 * so granting the permission leaves the limit inheriting zero behind it.
 */
import { describe, it, expect } from 'vitest';
import { evaluationBlockedReason } from '@/components/CreateEvaluationButton';
import type { UserPermissions } from '@/lib/types';

function perms(over: Partial<UserPermissions>): UserPermissions {
  return {
    canCreateInvoices: false, canApproveInvoices: false, canSendInvoices: false,
    canViewAllRecords: false, canViewChildRecords: false, canModifyPrices: false,
    canUploadPO: false, canManageUsers: false, canViewReports: false,
    canExportData: false, canCreateEvaluations: false, canConvertLeads: false,
    maxEvaluationsPerAccount: 0, canExtendEvaluations: false,
    canDirectCustomerComms: false, canMonthlySubscriptions: false,
    canAccessCrm: false,
    ...over,
  };
}

describe('evaluationBlockedReason', () => {
  it('allows it when the permission is held and there is room', () => {
    expect(
      evaluationBlockedReason(perms({ canCreateEvaluations: true, maxEvaluationsPerAccount: 2 }), 0)
    ).toBeNull();
  });

  it('allows it without limit when the allowance is unlimited', () => {
    expect(
      evaluationBlockedReason(perms({ canCreateEvaluations: true, maxEvaluationsPerAccount: -1 }), 99)
    ).toBeNull();
  });

  it('points at the partner account, which is the only switch there is', () => {
    // It used to be ANDed with the user role, whose column was never
    // backfilled and so was false everywhere. One setting now, named.
    const reason = evaluationBlockedReason(perms({}), 0);
    expect(reason).toContain('partner account');
    expect(reason).not.toContain('user role');
  });

  it('says the limit is zero rather than blaming the permission', () => {
    const reason = evaluationBlockedReason(
      perms({ canCreateEvaluations: true, maxEvaluationsPerAccount: 0 }), 0
    );
    expect(reason).toContain('limit is set to 0');
    expect(reason).not.toContain('does not have permission');
  });

  it('reports an exhausted allowance as exhausted', () => {
    const reason = evaluationBlockedReason(
      perms({ canCreateEvaluations: true, maxEvaluationsPerAccount: 2 }), 2
    );
    expect(reason).toContain('maximum of 2 evaluations');
  });

  it('counts a single evaluation in the singular', () => {
    expect(
      evaluationBlockedReason(perms({ canCreateEvaluations: true, maxEvaluationsPerAccount: 1 }), 1)
    ).toContain('maximum of 1 evaluation.');
  });

  it('refuses when there are no permissions at all', () => {
    expect(evaluationBlockedReason(undefined, 0)).not.toBeNull();
  });
});
