interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

/** Simple in-memory TTL cache */
export class TtlCache {
  private store = new Map<string, CacheEntry<unknown>>();

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttlMs: number): void {
    this.store.set(key, { data, expiresAt: Date.now() + ttlMs });
  }

  clear(): void {
    this.store.clear();
  }
}

/** Cache TTL constants in milliseconds */
export const TTL = {
  REALTIME: 5 * 60 * 1000, // 5 min
  PRICES: 60 * 60 * 1000, // 1 hour
  CAPACITY: 24 * 60 * 60 * 1000, // 24 hours
  FLOWS: 5 * 60 * 1000, // 5 min
  STORAGE: 60 * 60 * 1000, // 1 hour
  WEATHER: 30 * 60 * 1000, // 30 min
  EIA: 60 * 60 * 1000, // 1 hour
  FORECAST: 60 * 60 * 1000, // 1 hour
  BALANCING: 5 * 60 * 1000, // 5 min
  STATIC_DATA: 24 * 60 * 60 * 1000, // 24 hours
  AUCTION: 60 * 60 * 1000, // 1 hour
} as const;
