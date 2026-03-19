/**
 * Tests for the Redis caching layer.
 * Verifies graceful fallback when Redis is unavailable.
 */
import { describe, it, expect } from 'vitest';
import { cacheGet, cacheSet, cacheDel } from '@/lib/cache';

describe('Cache (without Redis)', () => {
  // These tests run without REDIS_URL set, verifying graceful fallback

  it('cacheGet returns null when Redis unavailable', async () => {
    const result = await cacheGet('test-key');
    expect(result).toBeNull();
  });

  it('cacheSet does not throw when Redis unavailable', async () => {
    await expect(cacheSet('test-key', { data: 'test' })).resolves.toBeUndefined();
  });

  it('cacheDel does not throw when Redis unavailable', async () => {
    await expect(cacheDel('test-key')).resolves.toBeUndefined();
  });
});
