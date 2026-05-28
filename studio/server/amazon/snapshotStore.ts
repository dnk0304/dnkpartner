import { ScrapeResult, ASINDetails, SnapshotCacheEntry } from './types';
import { saveJSON, loadJSON } from './fileStore';

const SNAPSHOTS_FILE = 'snapshots.json';

/**
 * In-memory snapshot cache for live scrape results
 * TTL: 5 minutes for fresh data
 * Persists to JSON file for durability across restarts
 */
class SnapshotStore {
  private cache: Map<string, SnapshotCacheEntry>;
  private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

  constructor() {
    this.cache = new Map();
    this.loadFromFile();
    // Clean up expired entries every minute
    setInterval(() => this.cleanExpired(), 60 * 1000);
  }

  /**
   * Load snapshot cache from file on startup
   */
  private loadFromFile(): void {
    try {
      const data = loadJSON<Record<string, SnapshotCacheEntry>>(SNAPSHOTS_FILE);
      if (data) {
        // Convert plain object back to Map and restore Date objects
        let loaded = 0;
        let expired = 0;
        for (const [key, entry] of Object.entries(data)) {
          // Restore Date object
          entry.timestamp = new Date(entry.timestamp);
          
          // Only load non-expired entries
          if (!this.isExpired(entry)) {
            this.cache.set(key, entry);
            loaded++;
          } else {
            expired++;
          }
        }
        console.log(`[SnapshotStore] Loaded ${loaded} cached snapshots from file (${expired} expired)`);
      }
    } catch (error) {
      console.error('[SnapshotStore] Failed to load from file:', error);
    }
  }

  /**
   * Save snapshot cache to file
   */
  private saveToFile(): void {
    try {
      // Convert Map to plain object for JSON serialization
      const data: Record<string, SnapshotCacheEntry> = {};
      for (const [key, entry] of this.cache.entries()) {
        // Only save non-expired entries
        if (!this.isExpired(entry)) {
          data[key] = entry;
        }
      }
      saveJSON(SNAPSHOTS_FILE, data);
    } catch (error) {
      console.error('[SnapshotStore] Failed to save to file:', error);
    }
  }

  /**
   * Generate cache key for keyword or ASIN
   */
  private generateKey(marketplace: string, identifier: string, type: 'keyword' | 'asin'): string {
    return `${marketplace}:${type}:${identifier.toLowerCase()}`;
  }

  /**
   * Store a keyword scrape result
   */
  setKeywordSnapshot(marketplace: string, keyword: string, data: ScrapeResult, ttl?: number): void {
    const key = this.generateKey(marketplace, keyword, 'keyword');
    const entry: SnapshotCacheEntry = {
      key,
      data,
      timestamp: new Date(),
      ttl: ttl || this.DEFAULT_TTL,
    };
    this.cache.set(key, entry);
    this.saveToFile();
    console.log(`[SnapshotStore] Cached keyword: ${keyword} (${marketplace})`);
  }

  /**
   * Store an ASIN lookup result
   */
  setASINSnapshot(marketplace: string, asin: string, data: ASINDetails, ttl?: number): void {
    const key = this.generateKey(marketplace, asin, 'asin');
    const entry: SnapshotCacheEntry = {
      key,
      data,
      timestamp: new Date(),
      ttl: ttl || this.DEFAULT_TTL,
    };
    this.cache.set(key, entry);
    this.saveToFile();
    console.log(`[SnapshotStore] Cached ASIN: ${asin} (${marketplace})`);
  }

  /**
   * Get a cached keyword snapshot
   */
  getKeywordSnapshot(marketplace: string, keyword: string): ScrapeResult | null {
    const key = this.generateKey(marketplace, keyword, 'keyword');
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if expired
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      console.log(`[SnapshotStore] Expired keyword: ${keyword} (${marketplace})`);
      return null;
    }

    console.log(`[SnapshotStore] Cache hit for keyword: ${keyword} (${marketplace})`);
    return entry.data as ScrapeResult;
  }

  /**
   * Get a cached ASIN snapshot
   */
  getASINSnapshot(marketplace: string, asin: string): ASINDetails | null {
    const key = this.generateKey(marketplace, asin, 'asin');
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if expired
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      console.log(`[SnapshotStore] Expired ASIN: ${asin} (${marketplace})`);
      return null;
    }

    console.log(`[SnapshotStore] Cache hit for ASIN: ${asin} (${marketplace})`);
    return entry.data as ASINDetails;
  }

  /**
   * Check if a cache entry is expired
   */
  private isExpired(entry: SnapshotCacheEntry): boolean {
    const now = new Date().getTime();
    const entryTime = entry.timestamp.getTime();
    return (now - entryTime) > entry.ttl;
  }

  /**
   * Clean up expired cache entries
   */
  private cleanExpired(): void {
    let removed = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        this.cache.delete(key);
        removed++;
      }
    }
    if (removed > 0) {
      this.saveToFile();
      console.log(`[SnapshotStore] Cleaned ${removed} expired entries`);
    }
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.saveToFile();
    console.log('[SnapshotStore] Cache cleared');
  }

  /**
   * Get cache statistics
   */
  getStats(): { total: number; expired: number } {
    let expired = 0;
    for (const entry of this.cache.values()) {
      if (this.isExpired(entry)) {
        expired++;
      }
    }
    return {
      total: this.cache.size,
      expired,
    };
  }

  /**
   * Invalidate a specific keyword cache
   */
  invalidateKeyword(marketplace: string, keyword: string): void {
    const key = this.generateKey(marketplace, keyword, 'keyword');
    this.cache.delete(key);
    this.saveToFile();
    console.log(`[SnapshotStore] Invalidated keyword: ${keyword} (${marketplace})`);
  }

  /**
   * Invalidate a specific ASIN cache
   */
  invalidateASIN(marketplace: string, asin: string): void {
    const key = this.generateKey(marketplace, asin, 'asin');
    this.cache.delete(key);
    this.saveToFile();
    console.log(`[SnapshotStore] Invalidated ASIN: ${asin} (${marketplace})`);
  }
}

// Singleton instance
export const snapshotStore = new SnapshotStore();

