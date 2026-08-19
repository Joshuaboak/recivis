/**
 * Tests for reading subscription tags off a licence record.
 *
 * The badge is the only thing on screen that tells a monthly subscription
 * apart from an ordinary licence, and the two are billed and renewed
 * differently. Zoho returns tags as objects on some calls and strings on
 * others, so the reading is where this gets it wrong if it does.
 */
import { describe, it, expect } from 'vitest';
import { assetTagNames, isMonthlySubscription } from '@/components/SubscriptionBadges';
import { MONTHLY_SUBSCRIPTION_TAG, PERPETUAL_PLAN_TAG } from '@/lib/subscriptions';

describe('assetTagNames', () => {
  it('reads tags returned as objects', () => {
    const asset = { Tag: [{ name: MONTHLY_SUBSCRIPTION_TAG, id: '1' }, { name: PERPETUAL_PLAN_TAG }] };
    expect(assetTagNames(asset)).toEqual([MONTHLY_SUBSCRIPTION_TAG, PERPETUAL_PLAN_TAG]);
  });

  it('reads tags returned as plain strings', () => {
    expect(assetTagNames({ Tag: [MONTHLY_SUBSCRIPTION_TAG] })).toEqual([MONTHLY_SUBSCRIPTION_TAG]);
  });

  it('drops entries with no name rather than rendering an empty badge', () => {
    expect(assetTagNames({ Tag: [{ id: '1' }, { name: MONTHLY_SUBSCRIPTION_TAG }] }))
      .toEqual([MONTHLY_SUBSCRIPTION_TAG]);
  });

  it('copes with a record that has no tags at all', () => {
    expect(assetTagNames({})).toEqual([]);
    expect(assetTagNames(null)).toEqual([]);
    expect(assetTagNames(undefined)).toEqual([]);
  });

  it('copes with Tag being something other than a list', () => {
    expect(assetTagNames({ Tag: 'Monthly Subscription' })).toEqual([]);
  });
});

describe('isMonthlySubscription', () => {
  it('is true only for the subscription tag', () => {
    expect(isMonthlySubscription({ Tag: [{ name: MONTHLY_SUBSCRIPTION_TAG }] })).toBe(true);
    expect(isMonthlySubscription({ Tag: [{ name: 'Renewal' }] })).toBe(false);
    expect(isMonthlySubscription({})).toBe(false);
  });

  it('does not match on a near-miss tag name', () => {
    // The tag is matched exactly because the billing report matches it
    // exactly; a licence tagged "Monthly" is not a subscription to it.
    expect(isMonthlySubscription({ Tag: [{ name: 'Monthly' }] })).toBe(false);
  });
});
