/**
 * In-memory cache for hot auction queries
 * Reduces database load for frequently accessed data
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

class AuctionCache {
  private cache: Map<string, CacheEntry<any>>;
  private defaultTTL: number; // Time to live in milliseconds
  
  constructor(defaultTTL = 30000) { // 30 seconds default
    this.cache = new Map();
    this.defaultTTL = defaultTTL;
    
    // Clean up expired entries every minute
    setInterval(() => this.cleanup(), 60000);
  }
  
  /**
   * Generate cache key from query parameters
   */
  private generateKey(params: Record<string, any>): string {
    const sortedKeys = Object.keys(params).sort();
    return sortedKeys.map(key => `${key}:${params[key]}`).join('|');
  }
  
  /**
   * Get cached data if it exists and hasn't expired
   */
  get<T>(params: Record<string, any>): T | null {
    const key = this.generateKey(params);
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }
    
    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data as T;
  }
  
  /**
   * Store data in cache
   */
  set<T>(params: Record<string, any>, data: T, ttl?: number): void {
    const key = this.generateKey(params);
    const now = Date.now();
    
    this.cache.set(key, {
      data,
      timestamp: now,
      expiresAt: now + (ttl || this.defaultTTL)
    });
  }
  
  /**
   * Invalidate specific cache entry
   */
  invalidate(params: Record<string, any>): void {
    const key = this.generateKey(params);
    this.cache.delete(key);
  }
  
  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }
  
  /**
   * Invalidate all entries that match a pattern
   * Useful when data changes (e.g., after scraper runs)
   */
  invalidatePattern(pattern: Partial<Record<string, any>>): void {
    const patternKey = this.generateKey(pattern);
    
    for (const key of this.cache.keys()) {
      if (key.includes(patternKey)) {
        this.cache.delete(key);
      }
    }
  }
  
  /**
   * Remove expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let removed = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        removed++;
      }
    }
    
    if (removed > 0) {
      console.log(`🧹 Cache cleanup: removed ${removed} expired entries`);
    }
  }
  
  /**
   * Get cache statistics
   */
  getStats() {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys())
    };
  }
}

// Global cache instance (shared across requests)
const globalForCache = globalThis as unknown as {
  auctionCache: AuctionCache | undefined;
};

export const auctionCache = globalForCache.auctionCache ?? new AuctionCache(30000); // 30 second TTL

if (process.env.NODE_ENV !== 'production') {
  globalForCache.auctionCache = auctionCache;
}

// Export helper to invalidate cache when data changes
export function invalidateAuctionCache() {
  auctionCache.clear();
  console.log('🔄 Auction cache cleared');
}
