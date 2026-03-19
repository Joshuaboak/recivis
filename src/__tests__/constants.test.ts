/**
 * Tests for centralized constants.
 * Verifies that constants are defined correctly and maintain
 * expected relationships (e.g., region labels cover all regions).
 */
import { describe, it, expect } from 'vitest';
import {
  CSA_INTERNAL_ID,
  CSA_ZOHO_ID,
  CRM_BASE_URL,
  REGION_LABELS,
  CURRENCIES,
  PARTNER_CATEGORIES,
  MAX_ZOHO_PAGES,
  ITEMS_PER_PAGE,
  CHAT_MESSAGE_LIMIT,
} from '@/lib/constants';

describe('Constants', () => {
  it('CSA IDs are non-empty strings', () => {
    expect(CSA_INTERNAL_ID).toBe('csa-internal');
    expect(CSA_ZOHO_ID).toMatch(/^\d+$/);
  });

  it('CRM_BASE_URL contains the org ID', () => {
    expect(CRM_BASE_URL).toContain('org');
    expect(CRM_BASE_URL).toContain('zoho.com.au');
  });

  it('REGION_LABELS covers expected regions', () => {
    expect(REGION_LABELS).toHaveProperty('AU');
    expect(REGION_LABELS).toHaveProperty('EU');
    expect(REGION_LABELS).toHaveProperty('NA');
    expect(REGION_LABELS).toHaveProperty('AS');
    expect(REGION_LABELS).toHaveProperty('NZ');
    expect(REGION_LABELS).toHaveProperty('WW');
    expect(REGION_LABELS).toHaveProperty('AF');
  });

  it('CURRENCIES includes major currencies', () => {
    expect(CURRENCIES).toContain('AUD');
    expect(CURRENCIES).toContain('USD');
    expect(CURRENCIES).toContain('EUR');
    expect(CURRENCIES.length).toBeGreaterThanOrEqual(4);
  });

  it('PARTNER_CATEGORIES includes base types', () => {
    expect(PARTNER_CATEGORIES).toContain('Reseller');
    expect(PARTNER_CATEGORIES).toContain('Distributor');
  });

  it('MAX_ZOHO_PAGES is a reasonable number', () => {
    expect(MAX_ZOHO_PAGES).toBeGreaterThanOrEqual(5);
    expect(MAX_ZOHO_PAGES).toBeLessThanOrEqual(50);
  });

  it('ITEMS_PER_PAGE has expected keys', () => {
    expect(ITEMS_PER_PAGE.accounts).toBeGreaterThan(0);
    expect(ITEMS_PER_PAGE.invoices).toBeGreaterThan(0);
    expect(ITEMS_PER_PAGE.contacts).toBeGreaterThan(0);
  });

  it('CHAT_MESSAGE_LIMIT is reasonable', () => {
    expect(CHAT_MESSAGE_LIMIT).toBe(25);
  });
});
