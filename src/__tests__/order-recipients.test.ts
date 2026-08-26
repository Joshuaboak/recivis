/**
 * Tests for order recipient wording.
 *
 * This text appears in two places — the send-to panel and the confirmation
 * before licence keys go out — and the confirmation is the one somebody reads
 * while deciding. If the two ever disagree, the wrong one is believed.
 */
import { describe, it, expect } from 'vitest';
import { orderRecipient, recipientSentence } from '@/lib/order-recipients';

describe('orderRecipient', () => {
  it('routes to the reseller when the order is a reseller purchase', () => {
    expect(
      orderRecipient({ Reseller_Direct_Purchase: true, Reseller: { name: 'Northbridge Survey' } })
    ).toEqual({
      kind: 'reseller',
      name: 'Northbridge Survey',
      copiedTo: 'the CSA Geo Sales Rep',
    });
  });

  it('routes to the customer otherwise, copying the reseller in', () => {
    expect(
      orderRecipient({ Contact_Name: { name: 'Dana Whitlock' } })
    ).toEqual({
      kind: 'customer',
      name: 'Dana Whitlock',
      copiedTo: 'the reseller and the CSA Geo Sales Rep',
    });
  });

  it('falls back to the role when the record carries no name', () => {
    expect(orderRecipient({ Reseller_Direct_Purchase: true }).name).toBe('the reseller');
    expect(orderRecipient({}).name).toBe('the customer');
  });

  it('treats a missing flag as a customer purchase, as the CRM does', () => {
    expect(orderRecipient({}).kind).toBe('customer');
    expect(orderRecipient({ Reseller_Direct_Purchase: false }).kind).toBe('customer');
  });
});

describe('recipientSentence', () => {
  it('names the person, not just the role', () => {
    // "sent to the customer" is not something anybody can check before
    // pressing the button.
    expect(recipientSentence({ Contact_Name: { name: 'Dana Whitlock' } })).toBe(
      'Dana Whitlock, copying the reseller and the CSA Geo Sales Rep'
    );
  });

  it('names the partner on a reseller purchase', () => {
    expect(
      recipientSentence({ Reseller_Direct_Purchase: true, Reseller: { name: 'Northbridge Survey' } })
    ).toBe('Northbridge Survey, copying the CSA Geo Sales Rep');
  });
});
