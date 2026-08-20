/**
 * Tests for the support assistant's knowledge base.
 *
 * The assistant answers only from this material, so a topic that drifts into
 * internal vocabulary teaches a reseller the wrong words, and one that goes
 * missing means a question it should have answered gets a shrug instead.
 */
import { describe, it, expect } from 'vitest';
import { HELP_TOPICS, knowledgeAsPrompt } from '@/lib/support/knowledge';
import { ROUTES } from '@/lib/routes';
import type { UserPermissions } from '@/lib/types';

function permissions(overrides: Partial<UserPermissions> = {}): UserPermissions {
  return {
    canCreateInvoices: false,
    canApproveInvoices: false,
    canSendInvoices: false,
    canViewAllRecords: false,
    canViewChildRecords: false,
    canModifyPrices: false,
    canUploadPO: false,
    canManageUsers: false,
    canViewReports: false,
    canExportData: false,
    canCreateEvaluations: false,
    canConvertLeads: false,
    maxEvaluationsPerAccount: 0,
    canExtendEvaluations: false,
    canDirectCustomerComms: false,
    canMonthlySubscriptions: false,
    ...overrides,
  };
}

describe('help topics', () => {
  it('gives every topic a unique id', () => {
    const ids = HELP_TOPICS.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('tells the reader where each thing happens', () => {
    for (const topic of HELP_TOPICS) {
      expect(topic.where.trim().length).toBeGreaterThan(0);
      expect(topic.body.trim().length).toBeGreaterThan(40);
    }
  });

  it('covers the questions partners actually arrive with', () => {
    const ids = HELP_TOPICS.map(t => t.id);
    for (const expected of [
      'placing-an-order',
      'sending-an-order',
      'renewals',
      'permissions',
      'getting-help',
    ]) {
      expect(ids).toContain(expected);
    }
  });

  it('describes every module, not only the popular workflows', () => {
    const ids = HELP_TOPICS.map(t => t.id);
    // One "what can I do here" topic per section of the sidebar. Without these
    // the assistant answers "I do not have information on that" for whole
    // parts of the portal.
    for (const expected of [
      'dashboard',
      'leads-module',
      'accounts-module',
      'assets-views',
      'orders-module',
      'order-assistant',
      'coupons-module',
      'reports-module',
      'partners-module',
      'partner-resources',
    ]) {
      expect(ids, `no topic covering ${expected}`).toContain(expected);
    }
  });

  it('only points at pages that exist', () => {
    const known = new Set<string>(ROUTES.map(r => r.path));
    for (const topic of HELP_TOPICS) {
      if (topic.path) expect(known.has(topic.path), `${topic.path} is not a route`).toBe(true);
    }
  });

  it('stays in partner vocabulary, not internal vocabulary', () => {
    // A reseller does not know what Assets1 is, and should never be told.
    const forbidden = [
      'zoho', 'assets1', 'mcp', 'deluge', 'crm record', 'api',
      'invoiced_items', 'record_status', 'reseller_role', 'postgres',
    ];
    for (const topic of HELP_TOPICS) {
      const text = `${topic.title} ${topic.where} ${topic.body}`.toLowerCase();
      for (const term of forbidden) {
        expect(text.includes(term), `"${term}" leaked into topic "${topic.id}"`).toBe(false);
      }
    }
  });

  it('points at the real helpdesk for anything it cannot answer', () => {
    const all = HELP_TOPICS.map(t => t.body).join(' ');
    expect(all).toContain('helpdesk.civilsurveyapplications.com');
  });
});

describe('knowledgeAsPrompt', () => {
  it('includes every topic', () => {
    const prompt = knowledgeAsPrompt();
    for (const topic of HELP_TOPICS) {
      expect(prompt).toContain(topic.title);
    }
  });

  it('marks a gated topic as unavailable to someone without the permission', () => {
    const prompt = knowledgeAsPrompt(permissions());
    expect(prompt).toContain('create and renew monthly subscriptions: NO');
    expect(prompt).toContain('create orders: NO');
  });

  it('marks it available once the permission is held', () => {
    const prompt = knowledgeAsPrompt(permissions({ canMonthlySubscriptions: true }));
    expect(prompt).toContain('create and renew monthly subscriptions: YES');
  });

  it('annotates every topic that declares permissions', () => {
    const prompt = knowledgeAsPrompt(permissions());
    const gated = HELP_TOPICS.filter(t => t.requires?.length).length;
    expect(prompt.split('Permissions in play —').length - 1).toBe(gated);
  });

  it('carries the page path so answers can link it', () => {
    expect(knowledgeAsPrompt(permissions())).toContain('(/accounts)');
  });
});
