/**
 * Tests for the renewal rules.
 *
 * Two screens offer renewals now — the customer page and the renewal views —
 * and both ask this module. A rule that loosens here lets somebody raise a
 * renewal order against a licence CSA will not renew, which is discovered
 * after the customer has been told a price.
 */
import { describe, it, expect } from 'vitest';
import { renewalBlockReason, isRenewable, renewabilityOf } from '@/lib/renewal-eligibility';

describe('renewalBlockReason', () => {
  it('allows an ordinary commercial licence', () => {
    expect(renewalBlockReason({ productName: 'Civil Site Design Pro' })).toBeNull();
    expect(isRenewable({ productName: 'Civil Site Design Pro' })).toBe(true);
  });

  it('refuses one that has been upgraded', () => {
    expect(renewalBlockReason({ upgraded: true, productName: 'Stringer Topo' }))
      .toBe('Upgraded assets are not eligible for renewal');
  });

  it('gives the reason a revoked licence was revoked', () => {
    expect(renewalBlockReason({ revoked: true, revokedReason: 'Chargeback' }))
      .toBe('Revoked: Chargeback');
  });

  it('says so plainly when a revocation has no reason recorded', () => {
    expect(renewalBlockReason({ revoked: true })).toBe('Revoked: No reason provided');
  });

  it('refuses evaluations, whether flagged or only named as one', () => {
    expect(renewalBlockReason({ evaluation: true, productName: 'Civil Site Design' }))
      .toBe('Evaluation assets are not eligible for renewal');
    expect(renewalBlockReason({ productName: 'Civil Site Design Evaluation' }))
      .toBe('Evaluation assets are not eligible for renewal');
  });

  it('refuses educational licences', () => {
    expect(renewalBlockReason({ educational: true, productName: 'Stringer' }))
      .toBe('Educational assets are not eligible for renewal');
    expect(renewalBlockReason({ productName: 'Stringer Topo Educational' }))
      .toBe('Educational assets are not eligible for renewal');
  });

  it('refuses NFR licences', () => {
    expect(renewalBlockReason({ productName: 'Corridor EZ NFR' }))
      .toBe('NFR assets are not eligible for renewal');
  });

  it('refuses home use licences', () => {
    expect(renewalBlockReason({ productName: 'Civil Site Design Home Use' }))
      .toBe('Home Use assets are not eligible for renewal');
  });

  it('makes the one home-use exception, which is a real product', () => {
    // "Civil Site Design Plus Home Use" is a commercial bundle, not a home
    // licence, and it does renew.
    expect(renewalBlockReason({ productName: 'Civil Site Design Plus Home Use' })).toBeNull();
  });

  it('reports the most serious reason first', () => {
    // An upgraded evaluation is really an upgrade problem: telling somebody
    // "it is an evaluation" sends them to ask for a different licence.
    expect(renewalBlockReason({ upgraded: true, evaluation: true }))
      .toBe('Upgraded assets are not eligible for renewal');
  });

  it('does not care about case in the product name', () => {
    expect(renewalBlockReason({ productName: 'STRINGER TOPO NFR' })).toBeTruthy();
  });

  it('handles a licence with no product name at all', () => {
    expect(renewalBlockReason({})).toBeNull();
  });
});

describe('renewabilityOf', () => {
  it('reads the rule inputs off a record', () => {
    const asset = {
      Upgraded_To_Key: '55779000001234567',
      Revoked: false,
      Revoked_Reason: null,
      Evaluation_License: false,
      Educational_License: false,
      Product: { name: 'Civil Site Design' },
      Name: 'ignored when Product has a name',
    };
    expect(renewabilityOf(asset)).toEqual({
      upgraded: true,
      revoked: false,
      revokedReason: null,
      evaluation: false,
      educational: false,
      productName: 'Civil Site Design',
    });
  });

  it('falls back to the record name when there is no product', () => {
    expect(renewabilityOf({ Name: 'Stringer Topo NFR' }).productName).toBe('Stringer Topo NFR');
  });

  it('treats a missing field as not set rather than as unknown', () => {
    // Zoho omits false booleans, so an absent Revoked means "not revoked".
    expect(isRenewable(renewabilityOf({ Product: { name: 'Corridor EZ' } }))).toBe(true);
  });
});
