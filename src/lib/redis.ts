import Redis from "ioredis";

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    const url = process.env.REDIS_URL || "redis://localhost:6379";
    redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
  }
  return redis;
}

// Close the singleton so short-lived processes (reindex cron, scripts) can
// exit cleanly. The Next.js server should never call this.
export async function closeRedis(): Promise<void> {
  if (redis) {
    try {
      await redis.quit();
    } catch {
      // already disconnected or never connected
    }
    redis = null;
  }
}
