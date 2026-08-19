/**
 * Tests for the demo write guard.
 *
 * There is no Zoho sandbox, so a practice session that reaches the CRM mints
 * real licence keys and emails real customers. This is the rule that stops it,
 * and the prefix matcher is the part most likely to be wrong.
 */
import { describe, it, expect } from 'vitest';
import {
  DemoWriteBlockedError,
  assertNotDemo,
  isDemoSession,
  isMutatingTool,
} from '@/lib/demo/guard';

describe('isMutatingTool', () => {
  it('catches the write verbs the Zoho MCP uses', () => {
    for (const tool of [
      'ZohoCRM_createRecords',
      'ZohoCRM_updateRecords',
      'ZohoCRM_deleteRecords',
      'ZohoCRM_postAddTagsWithId',
      'ZohoCRM_putFieldsWithId',
      'ZohoCRM_massUpdateRecords',
      'ZohoCRM_removeTerritoriesToRecord',
      'ZohoCRM_bulkDeleteKiosks',
    ]) {
      expect(isMutatingTool(tool)).toBe(true);
    }
  });

  it('catches write tools this build has never heard of', () => {
    // Prefix matching, not a list, so the MCP surface can grow without
    // silently opening a hole.
    expect(isMutatingTool('ZohoCRM_createSomethingInventedLater')).toBe(true);
    expect(isMutatingTool('ZohoCRM_updateWidgetsByIdentifier')).toBe(true);
  });

  it('leaves reads alone', () => {
    for (const tool of [
      'ZohoCRM_searchRecords',
      'ZohoCRM_getRecord',
      'ZohoCRM_getRelatedRecords',
      'ZohoCRM_getCurrencies',
      'ZohoCRM_getFields',
    ]) {
      expect(isMutatingTool(tool)).toBe(false);
    }
  });
});

describe('isDemoSession', () => {
  it('is true only for a user the server marked as demo', () => {
    expect(isDemoSession({ isDemo: true })).toBe(true);
    expect(isDemoSession({ isDemo: false })).toBe(false);
  });
});

describe('assertNotDemo', () => {
  it('throws for a demo session', () => {
    expect(() => assertNotDemo({ isDemo: true }, 'create coupon')).toThrow(DemoWriteBlockedError);
  });

  it('names the operation, so a blocked write is diagnosable', () => {
    expect(() => assertNotDemo({ isDemo: true }, 'create coupon')).toThrow(/create coupon/);
  });

  it('allows a real session through', () => {
    expect(() => assertNotDemo({ isDemo: false }, 'create coupon')).not.toThrow();
  });

  it('allows calls with no user behind them', () => {
    // Scripts and jobs are not demo sessions.
    expect(() => assertNotDemo(null, 'seed data')).not.toThrow();
    expect(() => assertNotDemo(undefined, 'seed data')).not.toThrow();
  });
});
