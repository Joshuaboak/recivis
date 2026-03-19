/**
 * Redis caching layer for stable Zoho CRM data.
 *
 * Caches responses from Zoho API calls that don't change frequently
 * (resellers, products) to reduce API calls and improve response times.
 * Falls back gracefully if Redis is unavailable.
 */
import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL;

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (!REDIS_URL) return null;
  if (!redis) {
    redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      lazyConnect: true,
    });
    redis.on('error', () => {}); // Suppress connection errors — we fall back gracefully
  }
  return redis;
}

/**
 * Get a cached value. Returns null on miss or if Redis unavailable.
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const client = getRedis();
    if (!client) return null;
    const val = await client.get(`recivis:${key}`);
    return val ? JSON.parse(val) : null;
  } catch {
    return null;
  }
}

/**
 * Set a cached value with TTL in seconds.
 */
export async function cacheSet(key: string, value: unknown, ttlSeconds: number = 300): Promise<void> {
  try {
    const client = getRedis();
    if (!client) return;
    await client.set(`recivis:${key}`, JSON.stringify(value), 'EX', ttlSeconds);
  } catch {
    // Non-critical — proceed without cache
  }
}

/**
 * Delete a cached key (for cache invalidation).
 */
export async function cacheDel(key: string): Promise<void> {
  try {
    const client = getRedis();
    if (!client) return;
    await client.del(`recivis:${key}`);
  } catch {}
}

/**
 * Delete all keys matching a pattern (e.g. 'resellers:*').
 */
export async function cacheInvalidatePattern(pattern: string): Promise<void> {
  try {
    const client = getRedis();
    if (!client) return;
    const keys = await client.keys(`recivis:${pattern}`);
    if (keys.length > 0) await client.del(...keys);
  } catch {}
}
