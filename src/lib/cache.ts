import { getRedis } from "./redis";

export interface CacheEntry {
  key: string;
  value: Buffer;
  created_at: Date;
}

// Redis-backed cache for the docs CMS API responses. Shared across the
// Next.js server process and the reindex cron, so the cron warms the same
// cache the SSR reads from. Also survives container restarts and is shared
// across web replicas if we ever scale out.
//
// Keys live under `docscache:` to avoid colliding with pagefind's
// `pagefind:` namespace. We store each entry as a Redis hash with two
// fields: `value` (the raw bytes) and `ts` (creation timestamp as ISO
// string), then put a long Redis-level TTL on top as a janitor. App-level
// freshness is still controlled by `isExpired` against the entry's
// `created_at`, so stale-while-revalidate keeps working.
const CACHE_PREFIX = "docscache:";
const REDIS_TTL_SECONDS = 7 * 24 * 3600; // 7 days, outlives the 4000s cacheTTL

class RedisCache {
  async get(key: string): Promise<CacheEntry | null> {
    try {
      const raw = await getRedis().hgetallBuffer(`${CACHE_PREFIX}${key}`);
      // ioredis returns {} for a missing key, not null.
      if (!raw || !raw.value || !raw.ts) return null;
      return {
        key,
        value: raw.value,
        created_at: new Date(raw.ts.toString("utf8")),
      };
    } catch (e) {
      // Redis blip → degrade to cache-miss, the caller will refetch.
      console.warn(`cache.get failed for ${key}:`, e instanceof Error ? e.message : e);
      return null;
    }
  }

  async set(key: string, value: Buffer): Promise<void> {
    try {
      const redisKey = `${CACHE_PREFIX}${key}`;
      const ts = new Date().toISOString();
      await getRedis()
        .pipeline()
        .hset(redisKey, "value", value, "ts", ts)
        .expire(redisKey, REDIS_TTL_SECONDS)
        .exec();
    } catch (e) {
      console.warn(`cache.set failed for ${key}:`, e instanceof Error ? e.message : e);
    }
  }
}

export const cache = new RedisCache();

export function isExpired(entry: CacheEntry, expirySeconds: number): boolean {
  const now = new Date();
  const expiryTime = new Date(entry.created_at.getTime() + expirySeconds * 1000);
  return now > expiryTime;
}
