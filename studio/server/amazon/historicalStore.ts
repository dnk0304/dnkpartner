import { DailySnapshot, HistoricalEntry, Marketplace } from './types';
import { saveJSON, loadJSON } from './fileStore';

const HISTORICAL_FILE = 'historical.json';

/**
 * Historical data store for 30-day snapshots
 * Stores and merges simulated + real data (real overwrites simulated)
 * Persists to JSON file for durability across restarts
 */
class HistoricalStore {
  private store: Map<string, HistoricalEntry>;

  constructor() {
    this.store = new Map();
    this.loadFromFile();
  }

  /**
   * Load historical data from file on startup
   */
  private loadFromFile(): void {
    try {
      const data = loadJSON<Record<string, HistoricalEntry>>(HISTORICAL_FILE);
      if (data) {
        // Convert plain object back to Map
        for (const [key, entry] of Object.entries(data)) {
          // Restore Date objects
          entry.lastUpdated = new Date(entry.lastUpdated);
          this.store.set(key, entry);
        }
        console.log(`[HistoricalStore] Loaded ${this.store.size} keywords from file`);
      }
    } catch (error) {
      console.error('[HistoricalStore] Failed to load from file:', error);
    }
  }

  /**
   * Save historical data to file
   */
  private saveToFile(): void {
    try {
      // Convert Map to plain object for JSON serialization
      const data: Record<string, HistoricalEntry> = {};
      for (const [key, entry] of this.store.entries()) {
        data[key] = entry;
      }
      saveJSON(HISTORICAL_FILE, data);
    } catch (error) {
      console.error('[HistoricalStore] Failed to save to file:', error);
    }
  }

  /**
   * Generate storage key for keyword + marketplace
   */
  private generateKey(marketplace: string, keyword: string): string {
    return `${marketplace}:${keyword.toLowerCase()}`;
  }

  /**
   * Store historical snapshots for a keyword
   */
  setHistorical(
    marketplace: Marketplace,
    keyword: string,
    snapshots: DailySnapshot[],
    isSimulated: boolean
  ): void {
    const key = this.generateKey(marketplace, keyword);
    const entry: HistoricalEntry = {
      keyword,
      marketplace,
      snapshots: this.sortSnapshots(snapshots),
      lastUpdated: new Date(),
      isSimulated,
    };
    this.store.set(key, entry);
    this.saveToFile();
    console.log(
      `[HistoricalStore] Stored ${snapshots.length} snapshots for ${keyword} (${marketplace}) - ${
        isSimulated ? 'simulated' : 'real'
      }`
    );
  }

  /**
   * Get historical snapshots for a keyword
   */
  getHistorical(marketplace: Marketplace, keyword: string): HistoricalEntry | null {
    const key = this.generateKey(marketplace, keyword);
    const entry = this.store.get(key);

    if (!entry) {
      console.log(`[HistoricalStore] No data found for ${keyword} (${marketplace})`);
      return null;
    }

    console.log(
      `[HistoricalStore] Retrieved ${entry.snapshots.length} snapshots for ${keyword} (${marketplace})`
    );
    return entry;
  }

  /**
   * Merge new snapshot data with existing data
   * Real data overwrites simulated data for the same date
   */
  mergeSnapshot(
    marketplace: Marketplace,
    keyword: string,
    newSnapshot: DailySnapshot,
    isSimulated: boolean
  ): void {
    const key = this.generateKey(marketplace, keyword);
    const existing = this.store.get(key);

    if (!existing) {
      // No existing data, create new entry
      this.setHistorical(marketplace, keyword, [newSnapshot], isSimulated);
      return;
    }

    // Find if snapshot for this date exists
    const dateIndex = existing.snapshots.findIndex((s) => s.date === newSnapshot.date);

    if (dateIndex >= 0) {
      // Date exists - only overwrite if new data is real or existing is simulated
      if (!isSimulated || existing.isSimulated) {
        existing.snapshots[dateIndex] = newSnapshot;
        // If we're adding real data, mark the whole entry as having some real data
        if (!isSimulated) {
          existing.isSimulated = false;
        }
        console.log(
          `[HistoricalStore] Updated snapshot for ${keyword} on ${newSnapshot.date} (${marketplace})`
        );
      }
    } else {
      // New date - add it
      existing.snapshots.push(newSnapshot);
      existing.snapshots = this.sortSnapshots(existing.snapshots);
      // If we're adding real data, mark the whole entry as having some real data
      if (!isSimulated) {
        existing.isSimulated = false;
      }
      console.log(
        `[HistoricalStore] Added new snapshot for ${keyword} on ${newSnapshot.date} (${marketplace})`
      );
    }

    existing.lastUpdated = new Date();
    this.store.set(key, existing);
    this.saveToFile();
  }

  /**
   * Merge multiple snapshots at once
   */
  mergeSnapshots(
    marketplace: Marketplace,
    keyword: string,
    newSnapshots: DailySnapshot[],
    isSimulated: boolean
  ): void {
    for (const snapshot of newSnapshots) {
      this.mergeSnapshot(marketplace, keyword, snapshot, isSimulated);
    }
  }

  /**
   * Sort snapshots by date (oldest first)
   */
  private sortSnapshots(snapshots: DailySnapshot[]): DailySnapshot[] {
    return snapshots.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  /**
   * Get the most recent snapshot for a keyword
   */
  getLatestSnapshot(marketplace: Marketplace, keyword: string): DailySnapshot | null {
    const entry = this.getHistorical(marketplace, keyword);
    if (!entry || entry.snapshots.length === 0) {
      return null;
    }
    return entry.snapshots[entry.snapshots.length - 1];
  }

  /**
   * Check if data exists for a keyword
   */
  hasData(marketplace: Marketplace, keyword: string): boolean {
    const key = this.generateKey(marketplace, keyword);
    return this.store.has(key);
  }

  /**
   * Check if data is simulated or real
   */
  isSimulated(marketplace: Marketplace, keyword: string): boolean {
    const entry = this.getHistorical(marketplace, keyword);
    return entry?.isSimulated ?? true;
  }

  /**
   * Get snapshots within a date range
   */
  getSnapshotsInRange(
    marketplace: Marketplace,
    keyword: string,
    startDate: string,
    endDate: string
  ): DailySnapshot[] {
    const entry = this.getHistorical(marketplace, keyword);
    if (!entry) {
      return [];
    }

    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();

    return entry.snapshots.filter((snapshot) => {
      const date = new Date(snapshot.date).getTime();
      return date >= start && date <= end;
    });
  }

  /**
   * Clear historical data for a specific keyword
   */
  clearKeyword(marketplace: Marketplace, keyword: string): void {
    const key = this.generateKey(marketplace, keyword);
    this.store.delete(key);
    this.saveToFile();
    console.log(`[HistoricalStore] Cleared data for ${keyword} (${marketplace})`);
  }

  /**
   * Clear all historical data
   */
  clear(): void {
    this.store.clear();
    this.saveToFile();
    console.log('[HistoricalStore] All historical data cleared');
  }

  /**
   * Get storage statistics
   */
  getStats(): {
    totalKeywords: number;
    totalSnapshots: number;
    simulatedKeywords: number;
    realKeywords: number;
  } {
    let totalSnapshots = 0;
    let simulatedKeywords = 0;
    let realKeywords = 0;

    for (const entry of this.store.values()) {
      totalSnapshots += entry.snapshots.length;
      if (entry.isSimulated) {
        simulatedKeywords++;
      } else {
        realKeywords++;
      }
    }

    return {
      totalKeywords: this.store.size,
      totalSnapshots,
      simulatedKeywords,
      realKeywords,
    };
  }

  /**
   * Get all stored keywords for a marketplace
   */
  getKeywords(marketplace: Marketplace): string[] {
    const keywords: string[] = [];
    for (const [key, entry] of this.store.entries()) {
      if (key.startsWith(`${marketplace}:`)) {
        keywords.push(entry.keyword);
      }
    }
    return keywords;
  }
}

// Singleton instance
export const historicalStore = new HistoricalStore();

