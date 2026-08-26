/**
 * renewal-eligibility.ts — which licences can be renewed, and why not.
 *
 * These rules lived inside the customer page, which was fine while that was
 * the only place a renewal could be raised. The renewal views raise them too
 * now, and two copies of "can this be renewed" drift: one page offers a
 * renewal the other refuses, and the partner finds out from a failure.
 *
 * The reasons are written to be shown. A disabled button with no explanation
 * reads as broken; "Evaluation licences are not eligible for renewal" reads as
 * a rule.
 */

import { MONTHLY_SUBSCRIPTION_TAG } from './subscriptions';

/** The fields a renewal decision is made from, however they were fetched. */
export interface RenewabilityInput {
  /** Superseded by a newer licence. */
  upgraded?: boolean;
  revoked?: boolean;
  revokedReason?: string | null;
  evaluation?: boolean;
  educational?: boolean;
  /**
   * A rolling 30-day subscription, marked by the Monthly Subscription tag.
   *
   * These are renewed by charging the next month through the subscription
   * flow, not by raising a renewal invoice — the two are different billing
   * events, and putting a monthly licence on a renewal invoice bills a year
   * for something sold by the month.
   */
  monthlySubscription?: boolean;
  /** Product name — some categories are only identifiable from it. */
  productName?: string;
}

/**
 * Why this licence cannot be renewed, or null when it can.
 *
 * Product name is checked as well as the flags because educational and
 * evaluation licences are not always flagged as such — some carry it only in
 * the product name, and NFR and home-use licences have no flag at all.
 */
export function renewalBlockReason(asset: RenewabilityInput): string | null {
  if (asset.upgraded) return 'Upgraded assets are not eligible for renewal';
  if (asset.revoked) return `Revoked: ${asset.revokedReason || 'No reason provided'}`;
  if (asset.monthlySubscription) {
    return 'Monthly subscriptions are renewed monthly, not by renewal invoice';
  }

  const name = (asset.productName || '').toLowerCase();
  if (asset.evaluation || name.includes('evaluation')) {
    return 'Evaluation assets are not eligible for renewal';
  }
  if (asset.educational || name.includes('educational')) {
    return 'Educational assets are not eligible for renewal';
  }
  if (name.includes('nfr')) return 'NFR assets are not eligible for renewal';
  // Home Use licences are not renewable, except the Civil Site Design Plus
  // bundle, which happens to carry "home use" in its name.
  if (name.includes('home use') && !name.includes('civil site design plus')) {
    return 'Home Use assets are not eligible for renewal';
  }
  return null;
}

/** True when nothing blocks a renewal. */
export function isRenewable(asset: RenewabilityInput): boolean {
  return renewalBlockReason(asset) === null;
}

/** Read the rule inputs off a raw asset record. */
export function renewabilityOf(asset: Record<string, unknown>): RenewabilityInput {
  return {
    upgraded: !!asset.Upgraded_To_Key,
    revoked: !!asset.Revoked,
    revokedReason: (asset.Revoked_Reason as string) || null,
    evaluation: !!asset.Evaluation_License,
    educational: !!asset.Educational_License,
    monthlySubscription: assetTags(asset).includes(MONTHLY_SUBSCRIPTION_TAG),
    productName:
      (asset.Product as { name?: string } | null)?.name || (asset.Name as string) || '',
  };
}

/**
 * Tag names off a raw asset.
 *
 * Zoho returns tags as objects, but some callers hand this plain strings, so
 * both are read rather than assuming the shape of the day.
 */
export function assetTags(asset: Record<string, unknown>): string[] {
  const tags = asset.Tag;
  if (!Array.isArray(tags)) return [];
  return tags.map(t => (typeof t === 'string' ? t : (t as { name?: string })?.name || ''));
}

/** True when this asset is a rolling monthly subscription. */
export function isMonthlySubscription(asset: Record<string, unknown>): boolean {
  return assetTags(asset).includes(MONTHLY_SUBSCRIPTION_TAG);
}
