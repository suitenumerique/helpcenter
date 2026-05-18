export interface CacheEntry {
  key: string;
  value: Buffer;
  created_at: Date;
}

const store = new Map<string, CacheEntry>();

class InMemoryCache {
  async get(key: string): Promise<CacheEntry | null> {
    return store.get(key) || null;
  }

  async set(key: string, value: Buffer): Promise<void> {
    store.set(key, { key, value, created_at: new Date() });
  }

  async delete(key: string): Promise<void> {
    store.delete(key);
  }

  async clear(): Promise<void> {
    store.clear();
  }
}

export const cache = new InMemoryCache();

export function isExpired(entry: CacheEntry, expirySeconds: number): boolean {
  const now = new Date();
  const expiryTime = new Date(entry.created_at.getTime() + expirySeconds * 1000);
  return now > expiryTime;
}
