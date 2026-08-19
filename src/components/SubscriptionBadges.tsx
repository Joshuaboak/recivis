/**
 * SubscriptionBadges — marks a licence as a monthly subscription.
 *
 * A subscription looks like any other licence until you notice its renewal
 * date is a month away, which is not something anybody notices. It matters
 * because the two are billed differently and renewed differently: a yearly
 * licence lapsing is a phone call, a subscription lapsing is next month's
 * invoice being wrong.
 *
 * So the badge goes everywhere a licence is listed, from one component, and
 * reads the tags off whatever shape that list happens to hold them in — the
 * account page carries raw records, the asset views carry mapped rows.
 */

'use client';

import { MONTHLY_SUBSCRIPTION_TAG, PERPETUAL_PLAN_TAG } from '@/lib/subscriptions';

/** Tag names off a record, however Zoho returned them. */
export function assetTagNames(asset: Record<string, unknown> | null | undefined): string[] {
  const tags = asset?.Tag;
  if (!Array.isArray(tags)) return [];
  return tags
    .map(t => (typeof t === 'string' ? t : (t as { name?: string })?.name || ''))
    .filter(Boolean);
}

export function isMonthlySubscription(asset: Record<string, unknown> | null | undefined): boolean {
  return assetTagNames(asset).includes(MONTHLY_SUBSCRIPTION_TAG);
}

interface SubscriptionBadgesProps {
  /** True when the licence is a rolling monthly subscription. */
  monthly: boolean;
  /** True when it is on the perpetual purchase plan. */
  perpetual?: boolean;
  /** Tighter type for dense tables. */
  size?: 'sm' | 'xs';
}

export default function SubscriptionBadges({ monthly, perpetual, size = 'sm' }: SubscriptionBadgesProps) {
  if (!monthly) return null;
  const text = size === 'xs' ? 'text-[9px]' : 'text-[10px]';

  return (
    <>
      <span
        title="Rolling 30-day subscription — renews monthly"
        className={`ml-2 px-1.5 py-0.5 ${text} font-bold uppercase rounded bg-csa-accent/15 text-csa-accent align-middle`}
      >
        Monthly
      </span>
      {perpetual && (
        <span
          title="On the perpetual purchase plan — payments work towards owning the licence"
          className={`ml-1 px-1.5 py-0.5 ${text} font-bold uppercase rounded bg-success/15 text-success align-middle`}
        >
          Perpetual plan
        </span>
      )}
    </>
  );
}

/** Convenience for the common case: a raw record with its tags attached. */
export function AssetSubscriptionBadges({
  asset,
  size,
}: {
  asset: Record<string, unknown>;
  size?: 'sm' | 'xs';
}) {
  const tags = assetTagNames(asset);
  return (
    <SubscriptionBadges
      monthly={tags.includes(MONTHLY_SUBSCRIPTION_TAG)}
      perpetual={tags.includes(PERPETUAL_PLAN_TAG)}
      size={size}
    />
  );
}
