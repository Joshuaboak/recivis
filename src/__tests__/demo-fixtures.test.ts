/**
 * Tests for the demo world.
 *
 * A tutorial says "click Northbridge Civil" and "this one is due for renewal",
 * so these fixtures have to stay internally consistent and keep populating the
 * views the tour walks through. A fixture that drifts breaks the script.
 */
import { describe, it, expect } from 'vitest';
import {
  DEMO_ACCOUNTS,
  DEMO_ASSETS,
  DEMO_CONTACTS,
  DEMO_INVOICES,
  demoAccountDetail,
  findDemoRecord,
  isDemoId,
} from '@/lib/demo/fixtures';

/** Whole days from today to an ISO date, matching the assets route. */
function daysUntil(iso: string): number {
  const todayMs = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').getTime();
  return Math.round((new Date(`${iso}T00:00:00Z`).getTime() - todayMs) / 86400000);
}

describe('demo ids', () => {
  it('are prefixed so they can never collide with a Zoho id', () => {
    for (const record of [...DEMO_ACCOUNTS, ...DEMO_CONTACTS, ...DEMO_ASSETS, ...DEMO_INVOICES]) {
      expect(isDemoId(record.id as string)).toBe(true);
    }
  });

  it('does not mistake a real Zoho id for a demo one', () => {
    expect(isDemoId('55779000002965363')).toBe(false);
  });
});

describe('referential integrity', () => {
  it('points every contact at an account that exists', () => {
    const accountIds = new Set(DEMO_ACCOUNTS.map(a => a.id));
    for (const contact of DEMO_CONTACTS) {
      const accountId = (contact.Account_Name as { id?: string })?.id;
      expect(accountIds.has(accountId)).toBe(true);
    }
  });

  it('points every asset and order at an account that exists', () => {
    const accountIds = new Set(DEMO_ACCOUNTS.map(a => a.id));
    for (const asset of DEMO_ASSETS) {
      expect(accountIds.has((asset.Account as { id?: string })?.id)).toBe(true);
    }
    for (const invoice of DEMO_INVOICES) {
      expect(accountIds.has((invoice.Account_Name as { id?: string })?.id)).toBe(true);
    }
  });
});

describe('the demo world populates every Assets view', () => {
  it('has an asset inside the 60-day renewal window', () => {
    const due = DEMO_ASSETS.filter(a => {
      const days = daysUntil(a.Renewal_Date as string);
      return a.Status === 'Active' && days >= 0 && days <= 60;
    });
    expect(due.length).toBeGreaterThan(0);
  });

  it('has an asset that lapsed inside the last 60 days', () => {
    const expired = DEMO_ASSETS.filter(a => {
      const days = daysUntil(a.Renewal_Date as string);
      return days < 0 && days >= -60;
    });
    expect(expired.length).toBeGreaterThan(0);
  });

  it('has a monthly subscription, so the renew button has a row', () => {
    const monthly = DEMO_ASSETS.filter(a =>
      (a.Tag as Array<{ name?: string }> | undefined)?.some(t => t.name === 'Monthly Subscription')
    );
    expect(monthly.length).toBeGreaterThan(0);
  });

  it('spans more than one account, so grouping is visible', () => {
    const accounts = new Set(DEMO_ASSETS.map(a => (a.Account as { id?: string })?.id));
    expect(accounts.size).toBeGreaterThan(1);
  });
});

describe('demoAccountDetail', () => {
  it('returns only the records belonging to that account', () => {
    const detail = demoAccountDetail('demo-account-1');
    expect(detail.account?.id).toBe('demo-account-1');
    for (const contact of detail.contacts) {
      expect((contact.Account_Name as { id?: string })?.id).toBe('demo-account-1');
    }
    for (const asset of detail.activeAssets) {
      expect((asset.Account as { id?: string })?.id).toBe('demo-account-1');
    }
  });

  it('gives an unknown account no record, so the route can 404', () => {
    expect(demoAccountDetail('demo-account-nope').account).toBeNull();
  });
});

describe('findDemoRecord', () => {
  it('finds records across every collection', () => {
    expect(findDemoRecord('demo-account-1')).not.toBeNull();
    expect(findDemoRecord('demo-invoice-1')).not.toBeNull();
    expect(findDemoRecord('demo-asset-1')).not.toBeNull();
  });

  it('returns null for anything else', () => {
    expect(findDemoRecord('55779000002965363')).toBeNull();
  });
});

describe('orders', () => {
  it('ships a draft to practise on and a sent one to look at', () => {
    const statuses = DEMO_INVOICES.map(i => i.Status);
    expect(statuses).toContain('Draft');
    expect(statuses).toContain('Sent');
  });
});
