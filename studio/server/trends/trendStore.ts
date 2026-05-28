/**
 * Trend Store with Persistence
 * Stores historical trend data in JSON files with deduplication and tracking
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { growthDetector, TrendAnalysis, DataPoint } from './growthDetector';
import { PRODUCT_CATEGORIES, getCategoryByKeyword } from './categories.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Data directory structure:
// - data/trends/ - Centralized multi-platform aggregated trend data
// - data/scrapers/{platform}/ - Platform-specific raw scraper data
//   (amazon, etsy, ebay, google, tiktok, reddit, pinterest, twitter)
const DATA_DIR = path.join(__dirname, '../../data/trends');
// Historical archive for seasonal pattern analysis
const ARCHIVE_DIR = path.join(DATA_DIR, 'archive');
const ARCHIVE_FILE = path.join(ARCHIVE_DIR, 'historical-archive.json');

export interface TrendSource {
  name: 'google' | 'reddit' | 'tiktok' | 'etsy' | 'ebay' | 'amazon' | 'pinterest' | 'twitter' | 'google-shopping' | 'tiktok-shop';
  volume: number;
  growth: number;
  lastUpdated: string;
}

export interface ExplodingTrend {
  id: string;
  topic: string;
  normalizedTopic: string; // For deduplication
  category: string;
  sources: TrendSource[];
  volume: number;
  growthRate: number;
  growthVelocity: number;
  firstDetected: string;
  lastUpdated: string;
  explosionScore: number;
  status: 'emerging' | 'exploding' | 'peaked' | 'declining' | 'stable';
  relatedTopics: string[];
  historicalData: DataPoint[];
  analysis?: TrendAnalysis;
}

export interface TrendCategory {
  id: string;
  name: string;
  description: string;
  keywords: string[];
  trendCount: number;
}

export interface TrendStoreData {
  trends: ExplodingTrend[];
  categories: TrendCategory[];
  lastFullUpdate: string;
  version: string;
}

// Default categories for trend classification - now imported from central categories
const DEFAULT_CATEGORIES: TrendCategory[] = PRODUCT_CATEGORIES.map(cat => ({
  id: cat.id,
  name: cat.name,
  description: cat.description,
  keywords: cat.keywords,
  trendCount: 0,
}));

class TrendStore {
  private data: TrendStoreData;
  private dataFile: string;
  private isDirty: boolean = false;
  private saveDebounceTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.dataFile = path.join(DATA_DIR, 'exploding-trends.json');
    this.data = this.loadData();
    
    // Run data repair on startup to fix any corrupted data
    const repairResult = this.repairData();
    if (repairResult.fixed > 0 || repairResult.removed > 0) {
      console.log('[TrendStore] Automatic repair completed on startup');
    }
  }

  /**
   * Ensure data directory exists
   */
  private ensureDataDir(): void {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  /**
   * Load data from disk
   */
  private loadData(): TrendStoreData {
    this.ensureDataDir();
    
    try {
      if (fs.existsSync(this.dataFile)) {
        const content = fs.readFileSync(this.dataFile, 'utf-8');
        return JSON.parse(content);
      }
    } catch (error) {
      console.error('[TrendStore] Error loading data:', error);
    }

    // Return default data structure
    return {
      trends: [],
      categories: DEFAULT_CATEGORIES,
      lastFullUpdate: new Date().toISOString(),
      version: '1.0.0',
    };
  }

  /**
   * Save data to disk (debounced)
   */
  private saveData(): void {
    this.isDirty = true;
    
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }

    this.saveDebounceTimer = setTimeout(() => {
      this.forceSave();
    }, 5000); // Save after 5 seconds of inactivity
  }

  /**
   * Force immediate save
   */
  forceSave(): void {
    if (!this.isDirty) return;
    
    this.ensureDataDir();
    
    try {
      fs.writeFileSync(this.dataFile, JSON.stringify(this.data, null, 2));
      this.isDirty = false;
      console.log('[TrendStore] Data saved successfully');
    } catch (error) {
      console.error('[TrendStore] Error saving data:', error);
    }
  }

  /**
   * Archive trend for seasonal pattern analysis
   * Stores complete trend history for future pattern detection
   */
  private archiveTrend(trend: ExplodingTrend): void {
    try {
      // Ensure archive directory exists
      if (!fs.existsSync(ARCHIVE_DIR)) {
        fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
      }

      // Load existing archive
      let archive: { trend: ExplodingTrend; archivedAt: string }[] = [];
      if (fs.existsSync(ARCHIVE_FILE)) {
        const data = fs.readFileSync(ARCHIVE_FILE, 'utf-8');
        archive = JSON.parse(data);
      }

      // Add trend to archive with timestamp
      archive.push({
        trend: trend,
        archivedAt: new Date().toISOString()
      });

      // Save archive
      fs.writeFileSync(ARCHIVE_FILE, JSON.stringify(archive, null, 2));
      console.log(`[TrendStore] Archived trend: ${trend.topic}`);
    } catch (error) {
      console.error('[TrendStore] Error archiving trend:', error);
    }
  }

  /**
   * Normalize topic for deduplication
   */
  private normalizeTopic(topic: string): string {
    return topic
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Generate unique ID for a trend
   */
  private generateId(topic: string): string {
    const normalized = this.normalizeTopic(topic);
    const hash = normalized.split('').reduce((acc, char) => {
      return ((acc << 5) - acc) + char.charCodeAt(0);
    }, 0);
    return `trend_${Math.abs(hash).toString(36)}`;
  }

  /**
   * Classify topic into a category using central categories
   */
  private classifyTopic(topic: string): string {
    const category = getCategoryByKeyword(topic);
    return category?.id || 'other';
  }

  /**
   * Find similar existing trend
   */
  private findSimilarTrend(normalizedTopic: string): ExplodingTrend | undefined {
    return this.data.trends.find(t => {
      // Exact match
      if (t.normalizedTopic === normalizedTopic) return true;
      
      // Fuzzy match (one contains the other)
      if (t.normalizedTopic.includes(normalizedTopic) || normalizedTopic.includes(t.normalizedTopic)) {
        // Only match if significant overlap
        const shorter = t.normalizedTopic.length < normalizedTopic.length ? t.normalizedTopic : normalizedTopic;
        const longer = t.normalizedTopic.length >= normalizedTopic.length ? t.normalizedTopic : normalizedTopic;
        return shorter.length / longer.length > 0.7;
      }
      
      return false;
    });
  }

  /**
   * Validate source before adding
   */
  private isValidSource(source: any): boolean {
    return source && 
           typeof source === 'object' &&
           source.name &&
           typeof source.name === 'string' &&
           source.volume !== undefined &&
           source.volume !== null &&
           typeof source.volume === 'number' &&
           source.growth !== undefined &&
           source.growth !== null &&
           typeof source.growth === 'number';
  }

  /**
   * Add or update a trend
   */
  addOrUpdateTrend(input: {
    topic: string;
    source: TrendSource['name'];
    volume: number;
    growth: number;
    relatedTopics?: string[];
    dataPoint?: DataPoint;
  }): ExplodingTrend {
    // Validate input
    if (!input.source || !input.topic) {
      console.error('[TrendStore] Invalid input: missing source or topic');
      throw new Error('Invalid trend input: source and topic are required');
    }

    if (typeof input.volume !== 'number' || typeof input.growth !== 'number') {
      console.error('[TrendStore] Invalid input: volume and growth must be numbers');
      throw new Error('Invalid trend input: volume and growth must be numbers');
    }

    const normalizedTopic = this.normalizeTopic(input.topic);
    const existingTrend = this.findSimilarTrend(normalizedTopic);
    const now = new Date().toISOString();

    if (existingTrend) {
      // Update existing trend
      const sourceIndex = existingTrend.sources.findIndex(s => s.name === input.source);
      
      const newSource: TrendSource = {
        name: input.source,
        volume: input.volume,
        growth: input.growth,
        lastUpdated: now,
      };

      // Validate new source
      if (!this.isValidSource(newSource)) {
        console.error('[TrendStore] Invalid source data, skipping update:', newSource);
        return existingTrend;
      }
      
      if (sourceIndex >= 0) {
        existingTrend.sources[sourceIndex] = newSource;
      } else {
        existingTrend.sources.push(newSource);
      }

      // Update aggregated metrics - filter out invalid sources
      const validSources = existingTrend.sources.filter(s => this.isValidSource(s));
      existingTrend.volume = validSources.length > 0 
        ? validSources.reduce((sum, s) => sum + (s.volume || 0), 0)
        : 0;
      existingTrend.growthRate = validSources.length > 0
        ? validSources.reduce((sum, s) => sum + (s.growth || 0), 0) / validSources.length
        : 0;
      existingTrend.lastUpdated = now;

      // Add data point if provided
      if (input.dataPoint) {
        existingTrend.historicalData.push(input.dataPoint);
        // Keep only last 365 days of data
        const cutoff = Date.now() - (365 * 24 * 60 * 60 * 1000);
        existingTrend.historicalData = existingTrend.historicalData.filter(
          d => new Date(d.date).getTime() > cutoff
        );
      }

      // Update related topics
      if (input.relatedTopics) {
        const existingRelated = new Set(existingTrend.relatedTopics);
        input.relatedTopics.forEach(t => existingRelated.add(t));
        existingTrend.relatedTopics = [...existingRelated].slice(0, 20);
      }

      // Recalculate analysis
      if (existingTrend.historicalData.length >= 7) {
        existingTrend.analysis = growthDetector.analyzeTrend(existingTrend.historicalData);
        existingTrend.explosionScore = existingTrend.analysis.metrics.explosionScore;
        existingTrend.status = existingTrend.analysis.status.status;
        existingTrend.growthVelocity = existingTrend.analysis.metrics.accelerationFactor;
      }

      this.saveData();
      return existingTrend;
    }

    // Create new trend
    const newSource: TrendSource = {
      name: input.source,
      volume: input.volume,
      growth: input.growth,
      lastUpdated: now,
    };

    // Validate new source
    if (!this.isValidSource(newSource)) {
      console.error('[TrendStore] Invalid source data for new trend:', newSource);
      throw new Error('Invalid source data');
    }

    const newTrend: ExplodingTrend = {
      id: this.generateId(input.topic),
      topic: input.topic,
      normalizedTopic,
      category: this.classifyTopic(input.topic),
      sources: [newSource],
      volume: input.volume,
      growthRate: input.growth,
      growthVelocity: 0,
      firstDetected: now,
      lastUpdated: now,
      explosionScore: Math.min(100, Math.max(0, input.growth / 2)),
      status: input.growth > 50 ? 'emerging' : 'stable',
      relatedTopics: input.relatedTopics || [],
      historicalData: input.dataPoint ? [input.dataPoint] : [],
    };

    this.data.trends.push(newTrend);
    this.updateCategoryCounts();
    this.saveData();

    return newTrend;
  }

  /**
   * Bulk add trends from a source
   */
  bulkAddTrends(trends: Array<{
    topic: string;
    source: TrendSource['name'];
    volume: number;
    growth: number;
    relatedTopics?: string[];
    historicalData?: DataPoint[];
  }>): ExplodingTrend[] {
    const results: ExplodingTrend[] = [];

    for (const trend of trends) {
      // Add each data point
      if (trend.historicalData && trend.historicalData.length > 0) {
        for (const dataPoint of trend.historicalData) {
          this.addOrUpdateTrend({
            ...trend,
            dataPoint,
          });
        }
        // Get the final updated trend
        const normalizedTopic = this.normalizeTopic(trend.topic);
        const updated = this.findSimilarTrend(normalizedTopic);
        if (updated) results.push(updated);
      } else {
        results.push(this.addOrUpdateTrend(trend));
      }
    }

    return results;
  }

  /**
   * Import trends from external providers (Helium 10, Exploding Topics, etc.)
   * Supports various data formats and normalizes them
   */
  importExternalTrends(input: {
    provider: 'helium10' | 'exploding-topics' | 'semrush' | 'ahrefs' | 'custom';
    data: Array<{
      topic: string;
      volume?: number;
      searchVolume?: number; // Alternative field name
      growth?: number;
      growthRate?: number; // Alternative field name
      growthPercent?: number; // Alternative field name
      category?: string;
      source?: string;
      timestamp?: string;
      date?: string;
      relatedTopics?: string[];
      metadata?: Record<string, any>;
    }>;
    sourceName?: TrendSource['name']; // Override source name
  }): { success: number; failed: number; errors: string[] } {
    const results = { success: 0, failed: 0, errors: [] as string[] };
    
    console.log(`[TrendStore] Importing ${input.data.length} trends from ${input.provider}`);

    for (const item of input.data) {
      try {
        // Normalize field names from different providers
        const volume = item.volume ?? item.searchVolume ?? 0;
        const growth = item.growth ?? item.growthRate ?? item.growthPercent ?? 0;
        const timestamp = item.timestamp ?? item.date ?? new Date().toISOString();
        
        // Determine source - use provider name or override
        const sourceName = input.sourceName ?? this.mapProviderToSource(input.provider);
        
        // Create data point for historical tracking
        const dataPoint: DataPoint = {
          date: timestamp,
          volume: volume,
          growth: growth
        };

        // Add or update trend
        const trend = this.addOrUpdateTrend({
          topic: item.topic,
          source: sourceName,
          volume: volume,
          growth: growth,
          relatedTopics: item.relatedTopics,
          dataPoint: dataPoint
        });

        // Update category if provided
        if (item.category && trend) {
          trend.category = this.normalizeCategoryName(item.category);
        }

        results.success++;
      } catch (error: any) {
        results.failed++;
        results.errors.push(`Failed to import "${item.topic}": ${error.message}`);
        console.error(`[TrendStore] Import error for "${item.topic}":`, error);
      }
    }

    this.forceSave();
    console.log(`[TrendStore] Import complete: ${results.success} success, ${results.failed} failed`);
    
    return results;
  }

  /**
   * Map external provider names to internal source names
   */
  private mapProviderToSource(provider: string): TrendSource['name'] {
    const mapping: Record<string, TrendSource['name']> = {
      'helium10': 'amazon',
      'exploding-topics': 'google',
      'semrush': 'google',
      'ahrefs': 'google',
      'custom': 'google'
    };
    return mapping[provider] || 'google';
  }

  /**
   * Normalize category names from external providers
   */
  private normalizeCategoryName(category: string): string {
    const normalized = category.toLowerCase().trim();
    
    // Try to find matching category by keyword
    const matchedCategory = getCategoryByKeyword(normalized);
    if (matchedCategory && matchedCategory.id !== 'other') {
      return matchedCategory.id;
    }
    
    // Fallback to keyword-based classification
    return this.classifyTopic(normalized);
  }

  /**
   * Repair corrupted data in the store
   * Fixes null values, missing fields, and invalid sources
   */
  repairData(): { fixed: number; removed: number } {
    console.log('[TrendStore] Starting data repair...');
    
    let fixed = 0;
    let removed = 0;
    const validTrends: ExplodingTrend[] = [];

    for (const trend of this.data.trends) {
      let needsRepair = false;

      // Fix null or undefined volume
      if (trend.volume === null || trend.volume === undefined) {
        const validSources = trend.sources.filter(s => s.name && s.volume !== undefined);
        trend.volume = validSources.length > 0 
          ? validSources.reduce((sum, s) => sum + s.volume, 0)
          : 0;
        needsRepair = true;
      }

      // Fix null or undefined growthRate
      if (trend.growthRate === null || trend.growthRate === undefined) {
        const validSources = trend.sources.filter(s => s.name && s.growth !== undefined);
        trend.growthRate = validSources.length > 0
          ? validSources.reduce((sum, s) => sum + s.growth, 0) / validSources.length
          : 0;
        needsRepair = true;
      }

      // Fix null or undefined explosionScore
      if (trend.explosionScore === null || trend.explosionScore === undefined) {
        trend.explosionScore = Math.min(100, Math.max(0, trend.growthRate / 2));
        needsRepair = true;
      }

      // Remove invalid sources (missing name)
      const beforeCount = trend.sources.length;
      trend.sources = trend.sources.filter(s => s.name && s.volume !== undefined);
      if (trend.sources.length < beforeCount) {
        needsRepair = true;
      }

      // If no valid sources remain, skip this trend
      if (trend.sources.length === 0) {
        removed++;
        console.log(`[TrendStore] Removed trend with no valid sources: ${trend.topic}`);
        continue;
      }

      // Initialize empty arrays if missing
      if (!trend.historicalData) {
        trend.historicalData = [];
        needsRepair = true;
      }
      if (!trend.relatedTopics) {
        trend.relatedTopics = [];
        needsRepair = true;
      }

      if (needsRepair) {
        fixed++;
      }

      validTrends.push(trend);
    }

    this.data.trends = validTrends;
    this.updateCategoryCounts();
    this.forceSave();

    console.log(`[TrendStore] Repair complete: ${fixed} fixed, ${removed} removed`);
    return { fixed, removed };
  }

  /**
   * Create historical data point from current trend state
   * Used to build time-series data from periodic scrapes
   */
  createHistoricalSnapshot(): number {
    console.log('[TrendStore] Creating historical snapshot...');
    let count = 0;
    const now = new Date().toISOString();

    for (const trend of this.data.trends) {
      // Only create snapshot if we have valid data and haven't created one recently
      if (trend.volume > 0 && trend.sources.length > 0) {
        // Check if we already have a data point from today
        const today = new Date().toISOString().split('T')[0];
        const hasToday = trend.historicalData.some(dp => 
          dp.date.startsWith(today)
        );

        if (!hasToday) {
          trend.historicalData.push({
            date: now,
            volume: trend.volume,
            growth: trend.growthRate
          });
          
          // Re-analyze if we have enough data
          if (trend.historicalData.length >= 7) {
            trend.analysis = growthDetector.analyzeTrend(trend.historicalData);
            trend.explosionScore = trend.analysis.metrics.explosionScore;
            trend.status = trend.analysis.status.status;
            trend.growthVelocity = trend.analysis.metrics.accelerationFactor;
          }
          
          count++;
        }
      }
    }

    this.forceSave();
    console.log(`[TrendStore] Created ${count} historical snapshots`);
    return count;
  }

  /**
   * Update category counts
   */
  private updateCategoryCounts(): void {
    for (const category of this.data.categories) {
      category.trendCount = this.data.trends.filter(t => t.category === category.id).length;
    }
  }

  /**
   * Get all trends
   */
  getAllTrends(): ExplodingTrend[] {
    return this.data.trends;
  }

  /**
   * Get exploding trends (sorted by explosion score)
   */
  getExplodingTrends(options?: {
    minScore?: number;
    maxScore?: number;
    category?: string;
    status?: ExplodingTrend['status'];
    source?: TrendSource['name'];
    limit?: number;
  }): ExplodingTrend[] {
    let trends = [...this.data.trends];

    // Apply filters
    if (options?.minScore !== undefined) {
      trends = trends.filter(t => t.explosionScore >= options.minScore!);
    }
    if (options?.maxScore !== undefined) {
      trends = trends.filter(t => t.explosionScore <= options.maxScore!);
    }
    if (options?.category) {
      trends = trends.filter(t => t.category === options.category);
    }
    if (options?.status) {
      trends = trends.filter(t => t.status === options.status);
    }
    if (options?.source) {
      trends = trends.filter(t => t.sources.some(s => s.name === options.source));
    }

    // Sort by explosion score
    trends.sort((a, b) => b.explosionScore - a.explosionScore);

    // Apply limit
    if (options?.limit) {
      trends = trends.slice(0, options.limit);
    }

    return trends;
  }

  /**
   * Get trends by category
   */
  getTrendsByCategory(categoryId: string): ExplodingTrend[] {
    return this.data.trends
      .filter(t => t.category === categoryId)
      .sort((a, b) => b.explosionScore - a.explosionScore);
  }

  /**
   * Get trend by ID
   */
  getTrendById(id: string): ExplodingTrend | undefined {
    return this.data.trends.find(t => t.id === id);
  }

  /**
   * Get trend by topic name
   */
  getTrend(topic: string): ExplodingTrend | undefined {
    const normalized = this.normalizeTopic(topic);
    return this.findSimilarTrend(normalized);
  }

  /**
   * Search trends
   */
  searchTrends(query: string): ExplodingTrend[] {
    const normalizedQuery = this.normalizeTopic(query);
    
    return this.data.trends
      .filter(t => 
        t.normalizedTopic.includes(normalizedQuery) ||
        t.relatedTopics.some(rt => rt.toLowerCase().includes(normalizedQuery))
      )
      .sort((a, b) => b.explosionScore - a.explosionScore);
  }

  /**
   * Get all categories
   */
  getCategories(): TrendCategory[] {
    this.updateCategoryCounts();
    return this.data.categories;
  }

  /**
   * Get trends confirmed across multiple sources
   */
  getMultiSourceTrends(minSources: number = 2): ExplodingTrend[] {
    return this.data.trends
      .filter(t => t.sources.length >= minSources)
      .sort((a, b) => {
        // Sort by source count first, then explosion score
        if (b.sources.length !== a.sources.length) {
          return b.sources.length - a.sources.length;
        }
        return b.explosionScore - a.explosionScore;
      });
  }

  /**
   * Get recently detected trends
   */
  getRecentTrends(days: number = 7): ExplodingTrend[] {
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    
    return this.data.trends
      .filter(t => new Date(t.firstDetected).getTime() > cutoff)
      .sort((a, b) => new Date(b.firstDetected).getTime() - new Date(a.firstDetected).getTime());
  }

  /**
   * Get trending up (positive momentum)
   */
  getTrendingUp(): ExplodingTrend[] {
    return this.data.trends
      .filter(t => t.growthRate > 0 && (t.status === 'emerging' || t.status === 'exploding'))
      .sort((a, b) => b.growthRate - a.growthRate);
  }

  /**
   * Remove old/stale trends (disabled by default for seasonal pattern analysis)
   * Only removes trends that are explicitly marked for deletion
   * All removed trends are archived for future pattern detection
   */
  pruneOldTrends(maxAgeDays: number = Infinity): number {
    // No automatic pruning by default - keeping all trends for seasonal analysis
    if (maxAgeDays === Infinity) {
      console.log('[TrendStore] Pruning disabled - keeping all trends for seasonal pattern analysis');
      return 0;
    }

    const cutoff = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);
    const beforeCount = this.data.trends.length;
    
    // Archive trends before removing them
    const toArchive = this.data.trends.filter(t => {
      const lastUpdate = new Date(t.lastUpdated).getTime();
      return lastUpdate <= cutoff && t.explosionScore <= 50;
    });
    
    // Archive each trend for seasonal analysis
    toArchive.forEach(trend => this.archiveTrend(trend));
    
    this.data.trends = this.data.trends.filter(t => {
      const lastUpdate = new Date(t.lastUpdated).getTime();
      // Keep if updated recently or has high explosion score
      return lastUpdate > cutoff || t.explosionScore > 50;
    });

    const pruned = beforeCount - this.data.trends.length;
    if (pruned > 0) {
      console.log(`[TrendStore] Pruned ${pruned} trends, archived for seasonal analysis`);
      this.updateCategoryCounts();
      this.saveData();
    }

    return pruned;
  }

  /**
   * Get store statistics
   */
  getStats(): {
    totalTrends: number;
    explodingCount: number;
    emergingCount: number;
    peakedCount: number;
    decliningCount: number;
    multiSourceCount: number;
    categoryCounts: Record<string, number>;
    sourceCounts: Record<string, number>;
    lastUpdate: string;
  } {
    const trends = this.data.trends;
    
    const sourceCounts: Record<string, number> = {};
    for (const trend of trends) {
      for (const source of trend.sources) {
        sourceCounts[source.name] = (sourceCounts[source.name] || 0) + 1;
      }
    }

    const categoryCounts: Record<string, number> = {};
    for (const trend of trends) {
      categoryCounts[trend.category] = (categoryCounts[trend.category] || 0) + 1;
    }

    return {
      totalTrends: trends.length,
      explodingCount: trends.filter(t => t.status === 'exploding').length,
      emergingCount: trends.filter(t => t.status === 'emerging').length,
      peakedCount: trends.filter(t => t.status === 'peaked').length,
      decliningCount: trends.filter(t => t.status === 'declining').length,
      multiSourceCount: trends.filter(t => t.sources.length >= 2).length,
      categoryCounts,
      sourceCounts,
      lastUpdate: this.data.lastFullUpdate,
    };
  }

  /**
   * Get storage metrics and tracking info
   */
  getStorageMetrics(): {
    activeTrendsSizeMB: number;
    archiveSizeMB: number;
    amazonDataSizeMB: number;
    totalSizeMB: number;
    trendCount: number;
    archivedTrendCount: number;
    oldestTrendDate: string | null;
    trackingStartDate: string | null;
    dataFiles: {
      name: string;
      sizeMB: number;
      lastModified: string;
      category: string;
    }[];
  } {
    const metrics = {
      activeTrendsSizeMB: 0,
      archiveSizeMB: 0,
      amazonDataSizeMB: 0,
      totalSizeMB: 0,
      trendCount: this.data.trends.length,
      archivedTrendCount: 0,
      oldestTrendDate: null as string | null,
      trackingStartDate: null as string | null,
      dataFiles: [] as { name: string; sizeMB: number; lastModified: string; category: string }[],
    };

    try {
      // Get active trends file size
      if (fs.existsSync(this.dataFile)) {
        const stats = fs.statSync(this.dataFile);
        metrics.activeTrendsSizeMB = stats.size / (1024 * 1024);
        metrics.dataFiles.push({
          name: 'exploding-trends.json',
          sizeMB: metrics.activeTrendsSizeMB,
          lastModified: stats.mtime.toISOString(),
          category: 'Multi-Platform Trends'
        });
      }

      // Get archive file size (handle if doesn't exist yet)
      if (fs.existsSync(ARCHIVE_FILE)) {
        const stats = fs.statSync(ARCHIVE_FILE);
        metrics.archiveSizeMB = stats.size / (1024 * 1024);
        metrics.dataFiles.push({
          name: 'historical-archive.json',
          sizeMB: metrics.archiveSizeMB,
          lastModified: stats.mtime.toISOString(),
          category: 'Multi-Platform Trends'
        });

        // Count archived trends
        try {
          const archiveData = JSON.parse(fs.readFileSync(ARCHIVE_FILE, 'utf-8'));
          metrics.archivedTrendCount = archiveData.length;

          // Find oldest trend in archive
          if (archiveData.length > 0) {
            const oldestArchived = archiveData.reduce((oldest: any, current: any) => {
              const currentDate = new Date(current.trend.firstDetected);
              const oldestDate = new Date(oldest.trend.firstDetected);
              return currentDate < oldestDate ? current : oldest;
            });
            metrics.trackingStartDate = oldestArchived.trend.firstDetected;
          }
        } catch (parseError) {
          console.warn('[TrendStore] Could not parse archive file:', parseError);
        }
      }

      // Get Amazon keyword data
      const amazonDir = path.join(__dirname, '../../data/scrapers/amazon');
      if (fs.existsSync(amazonDir)) {
        const amazonFiles = fs.readdirSync(amazonDir);
        for (const file of amazonFiles) {
          const filePath = path.join(amazonDir, file);
          if (fs.statSync(filePath).isFile()) {
            const stats = fs.statSync(filePath);
            const sizeMB = stats.size / (1024 * 1024);
            metrics.amazonDataSizeMB += sizeMB;
            metrics.dataFiles.push({
              name: `amazon/${file}`,
              sizeMB: sizeMB,
              lastModified: stats.mtime.toISOString(),
              category: 'Amazon Keywords'
            });
          }
        }
      }

      // Calculate total
      metrics.totalSizeMB = metrics.activeTrendsSizeMB + metrics.archiveSizeMB + metrics.amazonDataSizeMB;

      // Find oldest trend in active data
      if (this.data.trends.length > 0) {
        const oldestTrend = this.data.trends.reduce((oldest, current) => {
          const currentDate = new Date(current.firstDetected);
          const oldestDate = new Date(oldest.firstDetected);
          return currentDate < oldestDate ? current : oldest;
        });
        metrics.oldestTrendDate = oldestTrend.firstDetected;
        
        // If no archive, oldest active trend is tracking start
        if (!metrics.trackingStartDate) {
          metrics.trackingStartDate = metrics.oldestTrendDate;
        } else {
          // Use the earlier of the two
          const activeDate = new Date(metrics.oldestTrendDate);
          const archiveDate = new Date(metrics.trackingStartDate);
          metrics.trackingStartDate = activeDate < archiveDate ? metrics.oldestTrendDate : metrics.trackingStartDate;
        }
      }

    } catch (error) {
      console.error('[TrendStore] Error calculating storage metrics:', error);
      // Return metrics with whatever we have so far instead of failing
    }

    return metrics;
  }

  /**
   * Update last full update timestamp
   */
  setLastFullUpdate(): void {
    this.data.lastFullUpdate = new Date().toISOString();
    this.saveData();
  }

  /**
   * Export data for backup
   */
  exportData(): TrendStoreData {
    return { ...this.data };
  }

  /**
   * Import data from backup
   */
  importData(data: TrendStoreData): void {
    this.data = data;
    this.forceSave();
  }

  /**
   * Clear all data
   */
  clearAll(): void {
    this.data = {
      trends: [],
      categories: DEFAULT_CATEGORIES,
      lastFullUpdate: new Date().toISOString(),
      version: '1.0.0',
    };
    this.forceSave();
  }
}

export const trendStore = new TrendStore();

