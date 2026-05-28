/**
 * Trending Keywords Service
 * 
 * Discovers emerging keywords with high growth + low competition
 * Monitors categories and custom keywords
 * Calculates opportunity scores
 */

import { Marketplace } from './types';
import { historicalStore } from './historicalStore';
import { DailySnapshot } from './types';

// ==================== TYPES ====================

export interface TrendingKeyword {
  keyword: string;
  category: string;
  marketplace: Marketplace;
  searchVolume: number;
  volumeChange7d: number;   // % change over 7 days
  volumeChange30d: number;  // % change over 30 days
  competitionScore: number; // 0-100 (lower = easier)
  opportunityScore: number; // Calculated: growth / competition
  firstSeen: Date;
  lastUpdated: Date;
  isEmerging: boolean;
}

export interface MonitoredCategory {
  id: string;
  name: string;
  marketplace: Marketplace;
  addedAt: Date;
  lastChecked: Date;
  keywordCount: number;
}

export interface KeywordSearchTrack {
  keyword: string;
  category: string;
  marketplace: Marketplace;
  searchCount: number;
  firstSearched: Date;
  lastSearched: Date;
}

// Preset Amazon categories
export const PRESET_CATEGORIES = [
  'Books & Coloring Books',
  'Toys & Games',
  'Home & Kitchen',
  'Electronics',
  'Beauty & Personal Care',
  'Sports & Outdoors',
  'Pet Supplies',
  'Arts, Crafts & Sewing',
  'Clothing & Accessories',
  'Health & Household',
];

// ==================== TRENDING SERVICE ====================

class TrendingService {
  private trendingKeywords: Map<string, TrendingKeyword> = new Map();
  private searchTracks: Map<string, KeywordSearchTrack> = new Map();
  private monitoredCategories: Map<string, MonitoredCategory> = new Map();
  private initialized: boolean = false;

  constructor() {
    this.initializeMonitoredCategories();
  }

  /**
   * Initialize default monitored categories
   */
  private initializeMonitoredCategories(): void {
    if (this.initialized) return;

    // Add default monitored categories
    PRESET_CATEGORIES.slice(0, 3).forEach((cat, idx) => {
      const id = `cat-${idx + 1}`;
      this.monitoredCategories.set(id, {
        id,
        name: cat,
        marketplace: 'US',
        addedAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
        lastChecked: new Date(),
        keywordCount: 0, // Will be calculated from real data
      });
    });

    this.initialized = true;
    console.log('[TrendingService] Initialized with monitored categories');
  }

  /**
   * Calculate volume change percentage
   */
  private calculateVolumeChange(
    currentVolume: number,
    previousVolume: number
  ): number {
    if (previousVolume === 0) return 0;
    return ((currentVolume - previousVolume) / previousVolume) * 100;
  }

  /**
   * Get snapshot from N days ago
   */
  private getSnapshotFromDaysAgo(
    snapshots: DailySnapshot[],
    daysAgo: number
  ): DailySnapshot | null {
    if (snapshots.length === 0) return null;

    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - daysAgo);

    // Find closest snapshot to target date
    let closestSnapshot: DailySnapshot | null = null;
    let minDiff = Infinity;

    for (const snapshot of snapshots) {
      const snapshotDate = new Date(snapshot.date);
      const diff = Math.abs(snapshotDate.getTime() - targetDate.getTime());
      
      if (diff < minDiff) {
        minDiff = diff;
        closestSnapshot = snapshot;
      }
    }

    return closestSnapshot;
  }

  /**
   * Calculate competition score from historical data
   */
  private calculateCompetitionScore(
    snapshots: DailySnapshot[]
  ): number {
    if (snapshots.length === 0) return 50;

    const latestSnapshot = snapshots[snapshots.length - 1];
    
    // Use rank as a proxy for competition (lower rank = higher competition)
    // Normalize to 0-100 scale (higher score = more competition)
    if (latestSnapshot.rank === 0) return 50; // Default if no rank data
    
    // Rank 1-10 = very high competition (80-100)
    // Rank 11-50 = high competition (60-80)
    // Rank 51-100 = medium competition (40-60)
    // Rank 100+ = low competition (0-40)
    
    if (latestSnapshot.rank <= 10) {
      return 90 - (latestSnapshot.rank - 1);
    } else if (latestSnapshot.rank <= 50) {
      return 80 - ((latestSnapshot.rank - 10) / 40) * 20;
    } else if (latestSnapshot.rank <= 100) {
      return 60 - ((latestSnapshot.rank - 50) / 50) * 20;
    } else {
      return Math.max(0, 40 - ((latestSnapshot.rank - 100) / 100) * 40);
    }
  }

  /**
   * Generate trending keywords from real historical data
   */
  private generateTrendingKeywordsFromHistorical(
    marketplace: Marketplace = 'US'
  ): TrendingKeyword[] {
    const keywords: TrendingKeyword[] = [];
    const allKeywords = historicalStore.getKeywords(marketplace);

    for (const keyword of allKeywords) {
      const historical = historicalStore.getHistorical(marketplace, keyword);
      
      if (!historical || historical.snapshots.length === 0) {
        continue;
      }

      const snapshots = historical.snapshots;
      const latestSnapshot = snapshots[snapshots.length - 1];
      
      // Skip keywords with very low volume
      if (latestSnapshot.volume < 100) {
        continue;
      }

      // Calculate volume changes
      const snapshot7d = this.getSnapshotFromDaysAgo(snapshots, 7);
      const snapshot30d = this.getSnapshotFromDaysAgo(snapshots, 30);

      const volumeChange7d = snapshot7d
        ? this.calculateVolumeChange(latestSnapshot.volume, snapshot7d.volume)
        : 0;
      
      const volumeChange30d = snapshot30d
        ? this.calculateVolumeChange(latestSnapshot.volume, snapshot30d.volume)
        : 0;

      // Calculate competition score
      const competitionScore = this.calculateCompetitionScore(snapshots);

      // Calculate opportunity score
      const opportunityScore = this.calculateOpportunityScore({
        keyword,
        category: this.detectCategory(keyword),
        marketplace,
        searchVolume: latestSnapshot.volume,
        volumeChange7d,
        volumeChange30d,
        competitionScore,
        opportunityScore: 0, // Will be calculated
        firstSeen: new Date(historical.lastUpdated),
        lastUpdated: new Date(),
        isEmerging: false, // Will be calculated
      });

      // Determine if emerging
      const isEmerging = volumeChange7d > 50 && competitionScore < 30;

      keywords.push({
        keyword,
        category: this.detectCategory(keyword),
        marketplace,
        searchVolume: latestSnapshot.volume,
        volumeChange7d: Math.round(volumeChange7d * 10) / 10,
        volumeChange30d: Math.round(volumeChange30d * 10) / 10,
        competitionScore: Math.round(competitionScore),
        opportunityScore,
        firstSeen: new Date(historical.lastUpdated),
        lastUpdated: new Date(),
        isEmerging,
      });
    }

    // Sort by opportunity score descending
    return keywords.sort((a, b) => b.opportunityScore - a.opportunityScore);
  }

  /**
   * Detect category for keyword
   */
  private detectCategory(keyword: string): string {
    const keywordLower = keyword.toLowerCase();
    
    const categoryKeywords: Record<string, string[]> = {
      'Books & Coloring Books': ['book', 'coloring', 'activity', 'workbook', 'reading', 'novel'],
      'Toys & Games': ['toy', 'game', 'play', 'kids', 'puzzle', 'fidget', 'building'],
      'Home & Kitchen': ['kitchen', 'home', 'organizer', 'decor', 'cooking', 'cleaning'],
      'Electronics': ['electronic', 'gadget', 'tech', 'computer', 'phone', 'headset'],
      'Beauty & Personal Care': ['beauty', 'makeup', 'skincare', 'hair', 'cosmetic'],
      'Sports & Outdoors': ['sport', 'outdoor', 'fitness', 'exercise', 'camping', 'hiking'],
      'Pet Supplies': ['pet', 'dog', 'cat', 'animal', 'fish', 'bird'],
      'Arts, Crafts & Sewing': ['craft', 'art', 'diy', 'sewing', 'creative'],
      'Clothing & Accessories': ['clothing', 'fashion', 'accessories', 'wear', 'shirt'],
      'Health & Household': ['health', 'wellness', 'medical', 'household', 'vitamin'],
    };

    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      if (keywords.some(kw => keywordLower.includes(kw))) {
        return category;
      }
    }

    return 'Other';
  }

  /**
   * Track a keyword search (user activity tracking)
   */
  trackKeywordSearch(keyword: string, category: string, marketplace: Marketplace = 'US'): void {
    const key = `${keyword.toLowerCase()}-${marketplace}`;
    const existing = this.searchTracks.get(key);

    if (existing) {
      existing.searchCount++;
      existing.lastSearched = new Date();
    } else {
      this.searchTracks.set(key, {
        keyword: keyword.toLowerCase(),
        category,
        marketplace,
        searchCount: 1,
        firstSearched: new Date(),
        lastSearched: new Date(),
      });
    }
  }

  /**
   * Get trending keywords with optional filters
   */
  getTrendingKeywords(options: {
    category?: string;
    marketplace?: Marketplace;
    limit?: number;
    minOpportunityScore?: number;
    emergingOnly?: boolean;
  } = {}): TrendingKeyword[] {
    const { category, marketplace = 'US', limit = 50, minOpportunityScore = 0, emergingOnly = false } = options;

    // Generate trending keywords from real historical data
    const realKeywords = this.generateTrendingKeywordsFromHistorical(marketplace);
    
    // Cache them for quick access
    this.trendingKeywords.clear();
    realKeywords.forEach(kw => {
      const key = `${kw.keyword}-${kw.marketplace}`;
      this.trendingKeywords.set(key, kw);
    });

    let results = realKeywords;

    // Apply filters
    if (category) {
      results = results.filter(kw => kw.category === category);
    }
    if (minOpportunityScore > 0) {
      results = results.filter(kw => kw.opportunityScore >= minOpportunityScore);
    }
    if (emergingOnly) {
      results = results.filter(kw => kw.isEmerging);
    }

    // Already sorted by opportunity score in generateTrendingKeywordsFromHistorical
    return results.slice(0, limit);
  }

  /**
   * Calculate opportunity score for a keyword
   */
  calculateOpportunityScore(keyword: TrendingKeyword): number {
    const { volumeChange7d, volumeChange30d, competitionScore } = keyword;
    
    if (competitionScore === 0) return 0;
    
    // Formula: (7d change weighted 2x + 30d change) / competition
    const score = ((volumeChange7d * 2 + volumeChange30d) / competitionScore) * 10;
    return Math.round(score * 100) / 100;
  }

  /**
   * Detect emerging opportunities (high growth + low competition)
   */
  detectEmergingOpportunities(marketplace?: Marketplace): TrendingKeyword[] {
    return this.getTrendingKeywords({
      marketplace,
      emergingOnly: true,
      limit: 20,
    });
  }

  /**
   * Get top opportunities by category
   */
  getTopOpportunitiesByCategory(marketplace: Marketplace = 'US'): Record<string, TrendingKeyword[]> {
    const results: Record<string, TrendingKeyword[]> = {};
    
    PRESET_CATEGORIES.forEach(category => {
      results[category] = this.getTrendingKeywords({
        category,
        marketplace,
        limit: 5,
      });
    });

    return results;
  }

  /**
   * Add a category to monitor
   */
  addMonitoredCategory(name: string, marketplace: Marketplace = 'US'): MonitoredCategory {
    const id = `cat-${Date.now()}`;
    const category: MonitoredCategory = {
      id,
      name,
      marketplace,
      addedAt: new Date(),
      lastChecked: new Date(),
      keywordCount: 0,
    };
    
    this.monitoredCategories.set(id, category);
    return category;
  }

  /**
   * Remove a monitored category
   */
  removeMonitoredCategory(id: string): boolean {
    return this.monitoredCategories.delete(id);
  }

  /**
   * Get all monitored categories
   */
  getMonitoredCategories(): MonitoredCategory[] {
    return Array.from(this.monitoredCategories.values());
  }

  /**
   * Get search activity stats
   */
  getSearchStats(): {
    totalSearches: number;
    uniqueKeywords: number;
    topSearched: KeywordSearchTrack[];
  } {
    const tracks = Array.from(this.searchTracks.values());
    const totalSearches = tracks.reduce((sum, t) => sum + t.searchCount, 0);
    const topSearched = tracks
      .sort((a, b) => b.searchCount - a.searchCount)
      .slice(0, 10);

    return {
      totalSearches,
      uniqueKeywords: tracks.length,
      topSearched,
    };
  }

  /**
   * Get available categories (preset + custom)
   */
  getAvailableCategories(): string[] {
    const customCategories = Array.from(this.monitoredCategories.values())
      .map(c => c.name)
      .filter(name => !PRESET_CATEGORIES.includes(name));
    
    return [...PRESET_CATEGORIES, ...customCategories];
  }

  /**
   * Refresh trending data (connects to real historicalStore data)
   */
  async refreshTrendingData(): Promise<void> {
    // Generate fresh trending keywords from historical data
    const keywords = this.generateTrendingKeywordsFromHistorical('US');
    
    // Update cache
    this.trendingKeywords.clear();
    keywords.forEach(kw => {
      const key = `${kw.keyword}-${kw.marketplace}`;
      this.trendingKeywords.set(key, kw);
    });

    // Update monitored category counts
    this.monitoredCategories.forEach(cat => {
      cat.keywordCount = keywords.filter(kw => kw.category === cat.name).length;
      cat.lastChecked = new Date();
    });

    console.log('[TrendingService] Trending data refreshed from historicalStore');
  }
}

// Export singleton instance
export const trendingService = new TrendingService();

