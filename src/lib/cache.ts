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
  REALTIME: 5 * 60 * 1000,
  PRICES: 60 * 60 * 1000,
  CAPACITY: 24 * 60 * 60 * 1000,
  FLOWS: 5 * 60 * 1000,
  STORAGE: 60 * 60 * 1000,
  WEATHER: 30 * 60 * 1000,
  EIA: 60 * 60 * 1000,
  FORECAST: 60 * 60 * 1000,
  BALANCING: 5 * 60 * 1000,
  STATIC_DATA: 24 * 60 * 60 * 1000,
  AUCTION: 60 * 60 * 1000,
  ANCILLARY: 60 * 60 * 1000,
  OUTAGES: 15 * 60 * 1000,
  FREQUENCY: 30 * 1000,
  INTRADAY: 15 * 60 * 1000,
} as const;
