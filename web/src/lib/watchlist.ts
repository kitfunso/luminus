/**
 * Watchlist: local-first pin/unpin model with localStorage persistence.
 * Covers plants, countries, and corridors (from/to country pairs).
 *
 * Storage key: luminus:watchlist (JSON array of WatchlistItem)
 */

export type WatchlistAssetType = 'plant' | 'country' | 'corridor';

export interface WatchlistItem {
  id: string;          // unique stable key
  type: WatchlistAssetType;
  label: string;       // display name
  subLabel?: string;   // e.g. country for plant, or fuel type
  iso2?: string;       // for country or plant's home country
  from?: string;       // corridor from iso2
  to?: string;         // corridor to iso2
  pinnedAt: string;    // ISO timestamp
}

const STORAGE_KEY = 'luminus:watchlist';

function load(): WatchlistItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as WatchlistItem[];
  } catch {
    return [];
  }
}

function save(items: WatchlistItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // storage quota exceeded or private mode – degrade silently
  }
}

export function getWatchlist(): WatchlistItem[] {
  return load();
}

export function isWatched(id: string): boolean {
  return load().some((item) => item.id === id);
}

export function pinItem(item: Omit<WatchlistItem, 'pinnedAt'>): WatchlistItem[] {
  const current = load();
  if (current.some((i) => i.id === item.id)) return current; // already pinned
  const next = [{ ...item, pinnedAt: new Date().toISOString() }, ...current];
  save(next);
  return next;
}

export function unpinItem(id: string): WatchlistItem[] {
  const next = load().filter((i) => i.id !== id);
  save(next);
  return next;
}

export function togglePin(item: Omit<WatchlistItem, 'pinnedAt'>): { items: WatchlistItem[]; pinned: boolean } {
  if (isWatched(item.id)) {
    return { items: unpinItem(item.id), pinned: false };
  }
  return { items: pinItem(item), pinned: true };
}

export function clearWatchlist(): WatchlistItem[] {
  save([]);
  return [];
}

/** Build a stable ID for each asset type. */
export function plantId(name: string): string {
  return `plant:${name.toLowerCase().replace(/\s+/g, '-')}`;
}

export function countryId(iso2: string): string {
  return `country:${iso2.toUpperCase()}`;
}

export function corridorId(from: string, to: string): string {
  // canonical: alphabetical order so DE-FR === FR-DE
  const [a, b] = [from, to].sort();
  return `corridor:${a}-${b}`;
}
