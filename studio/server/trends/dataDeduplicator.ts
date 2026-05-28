/**
 * Data Deduplicator
 * Removes duplicate items based on configurable uniqueness keys
 * Supports multiple merge strategies for handling duplicates
 */

import crypto from 'crypto';

export interface DeduplicationConfig {
  uniqueKeys: string[];           // Fields to use for uniqueness check (e.g., ['id'], ['title', 'price'])
  mergeStrategy: 'newest' | 'oldest' | 'merge' | 'keep-all';
  hashAlgorithm: 'md5' | 'sha256';
  caseSensitive?: boolean;        // Whether string comparison is case-sensitive (default: false)
}

export interface DeduplicationStats {
  total: number;
  unique: number;
  duplicates: number;
  removed: number;
  merged: number;
}

const DEFAULT_CONFIG: DeduplicationConfig = {
  uniqueKeys: ['id'],
  mergeStrategy: 'newest',
  hashAlgorithm: 'md5',
  caseSensitive: false,
};

export class DataDeduplicator {
  private stats: DeduplicationStats = {
    total: 0,
    unique: 0,
    duplicates: 0,
    removed: 0,
    merged: 0,
  };

  /**
   * Deduplicate an array of items
   */
  deduplicate<T extends Record<string, any>>(
    items: T[],
    config: Partial<DeduplicationConfig> = {}
  ): T[] {
    const finalConfig = { ...DEFAULT_CONFIG, ...config };
    this.stats = {
      total: items.length,
      unique: 0,
      duplicates: 0,
      removed: 0,
      merged: 0,
    };

    if (items.length === 0) {
      return [];
    }

    console.log(`[DataDeduplicator] Deduplicating ${items.length} items using keys: ${finalConfig.uniqueKeys.join(', ')}`);

    // Create a map to track unique items by their hash
    const uniqueMap = new Map<string, T>();
    const duplicateMap = new Map<string, T[]>();

    for (const item of items) {
      const hash = this.generateHash(item, finalConfig);
      
      if (uniqueMap.has(hash)) {
        // Duplicate found
        this.stats.duplicates++;
        
        // Track duplicates for merging
        if (!duplicateMap.has(hash)) {
          duplicateMap.set(hash, [uniqueMap.get(hash)!]);
        }
        duplicateMap.get(hash)!.push(item);
      } else {
        // New unique item
        uniqueMap.set(hash, item);
        this.stats.unique++;
      }
    }

    // Handle duplicates based on merge strategy
    let result: T[] = [];
    
    if (finalConfig.mergeStrategy === 'keep-all') {
      result = items;
    } else {
      for (const [hash, item] of uniqueMap.entries()) {
        const duplicates = duplicateMap.get(hash);
        
        if (duplicates && duplicates.length > 1) {
          // Apply merge strategy
          const merged = this.applyMergeStrategy(duplicates, finalConfig.mergeStrategy);
          result.push(merged);
          this.stats.merged++;
          this.stats.removed += duplicates.length - 1;
        } else {
          result.push(item);
        }
      }
    }

    console.log(`[DataDeduplicator] Result: ${result.length} unique items (removed ${this.stats.removed} duplicates, merged ${this.stats.merged})`);
    
    return result;
  }

  /**
   * Check if an item is a duplicate of any existing items
   */
  isDuplicate<T extends Record<string, any>>(
    item: T,
    existingItems: T[],
    config: Partial<DeduplicationConfig> = {}
  ): boolean {
    const finalConfig = { ...DEFAULT_CONFIG, ...config };
    const itemHash = this.generateHash(item, finalConfig);
    
    for (const existing of existingItems) {
      const existingHash = this.generateHash(existing, finalConfig);
      if (itemHash === existingHash) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Merge duplicate items based on strategy
   */
  mergeDuplicates<T extends Record<string, any>>(
    items: T[],
    config: Partial<DeduplicationConfig> = {}
  ): T[] {
    return this.deduplicate(items, config);
  }

  /**
   * Get deduplication statistics
   */
  getStats(): DeduplicationStats {
    return { ...this.stats };
  }

  /**
   * Generate a hash for an item based on unique keys
   */
  private generateHash<T extends Record<string, any>>(
    item: T,
    config: DeduplicationConfig
  ): string {
    // Extract values for unique keys
    const values: any[] = [];
    
    for (const key of config.uniqueKeys) {
      let value = item[key];
      
      // Handle nested keys (e.g., 'user.id')
      if (key.includes('.')) {
        const parts = key.split('.');
        value = parts.reduce((obj, part) => obj?.[part], item);
      }
      
      // Normalize string values for comparison
      if (typeof value === 'string' && !config.caseSensitive) {
        value = value.toLowerCase().trim();
      }
      
      values.push(value);
    }
    
    // Create a string representation
    const dataString = JSON.stringify(values);
    
    // Generate hash
    return crypto
      .createHash(config.hashAlgorithm)
      .update(dataString)
      .digest('hex');
  }

  /**
   * Apply merge strategy to duplicate items
   */
  private applyMergeStrategy<T extends Record<string, any>>(
    items: T[],
    strategy: 'newest' | 'oldest' | 'merge'
  ): T {
    if (strategy === 'newest') {
      // Return the newest item (assumes items have a timestamp field)
      return this.getNewestItem(items);
    } else if (strategy === 'oldest') {
      // Return the oldest item
      return this.getOldestItem(items);
    } else if (strategy === 'merge') {
      // Merge all items (combine all unique properties)
      return this.mergeItems(items);
    }
    
    return items[0];
  }

  /**
   * Get the newest item (based on timestamp fields)
   */
  private getNewestItem<T extends Record<string, any>>(items: T[]): T {
    const timestampFields = ['lastUpdated', 'updatedAt', 'createdAt', 'timestamp', 'date', 'firstDetected', 'lastSeen'];
    
    for (const field of timestampFields) {
      if (items[0][field]) {
        return items.reduce((newest, current) => {
          const newestTime = new Date(newest[field]).getTime();
          const currentTime = new Date(current[field]).getTime();
          return currentTime > newestTime ? current : newest;
        });
      }
    }
    
    // No timestamp found, return last item
    return items[items.length - 1];
  }

  /**
   * Get the oldest item (based on timestamp fields)
   */
  private getOldestItem<T extends Record<string, any>>(items: T[]): T {
    const timestampFields = ['firstDetected', 'createdAt', 'timestamp', 'date', 'lastUpdated', 'updatedAt'];
    
    for (const field of timestampFields) {
      if (items[0][field]) {
        return items.reduce((oldest, current) => {
          const oldestTime = new Date(oldest[field]).getTime();
          const currentTime = new Date(current[field]).getTime();
          return currentTime < oldestTime ? current : oldest;
        });
      }
    }
    
    // No timestamp found, return first item
    return items[0];
  }

  /**
   * Merge multiple items into one (combine properties)
   */
  private mergeItems<T extends Record<string, any>>(items: T[]): T {
    const merged: any = { ...items[0] };
    
    for (let i = 1; i < items.length; i++) {
      const item = items[i];
      
      for (const key in item) {
        // Skip if key doesn't exist in merged
        if (!(key in merged)) {
          merged[key] = item[key];
          continue;
        }
        
        // Merge arrays
        if (Array.isArray(merged[key]) && Array.isArray(item[key])) {
          merged[key] = [...new Set([...merged[key], ...item[key]])];
        }
        // Take non-null/undefined values
        else if (item[key] != null && merged[key] == null) {
          merged[key] = item[key];
        }
        // For numbers, take the maximum (e.g., view counts, ratings)
        else if (typeof merged[key] === 'number' && typeof item[key] === 'number') {
          merged[key] = Math.max(merged[key], item[key]);
        }
        // For timestamps, take the newest
        else if (key.includes('updated') || key.includes('lastSeen') || key.includes('timestamp')) {
          const mergedTime = new Date(merged[key]).getTime();
          const itemTime = new Date(item[key]).getTime();
          if (itemTime > mergedTime) {
            merged[key] = item[key];
          }
        }
        // For timestamps, take the oldest for 'first' fields
        else if (key.includes('first') || key.includes('created')) {
          const mergedTime = new Date(merged[key]).getTime();
          const itemTime = new Date(item[key]).getTime();
          if (itemTime < mergedTime) {
            merged[key] = item[key];
          }
        }
      }
    }
    
    return merged as T;
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      total: 0,
      unique: 0,
      duplicates: 0,
      removed: 0,
      merged: 0,
    };
  }
}

// Export singleton instance
export const dataDeduplicator = new DataDeduplicator();
