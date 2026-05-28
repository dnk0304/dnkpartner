/**
 * Keyword Store - Persistent Keyword Learning and Management
 * Stores discovered keywords with metadata, tracks success rates,
 * and provides keyword recommendations for scrapers
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DiscoveredKeyword, KeywordSource } from './keywordDiscovery.js';
import { PRODUCT_CATEGORIES, type ProductCategory } from './categories.js';
import { getSeedKeywordsForCategory } from './categorySeedData.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Central storage for multi-platform discovered keywords
// Individual scraper data (if needed) should go to data/scrapers/{platform}/
const DATA_DIR = path.join(__dirname, '../../data/trends');
const KEYWORDS_FILE = path.join(DATA_DIR, 'discovered-keywords.json');

export interface StoredKeyword extends DiscoveredKeyword {
  successCount: number;        // Number of successful scrapes
  failureCount: number;        // Number of failed scrapes
  totalAttempts: number;       // Total scrape attempts
  successRate: number;         // Percentage (0-100)
  lastUsed: string | null;     // Last time used for scraping
  priority: number;            // Priority score for recommendation (0-100)
  isActive: boolean;           // Whether to use in scraping
  tags: string[];              // User-defined or auto-generated tags
}

export interface KeywordStoreData {
  keywords: StoredKeyword[];
  stats: {
    totalKeywords: number;
    activeKeywords: number;
    averageSuccessRate: number;
    lastDiscovery: string;
    lastUpdate: string;
  };
  version: string;
}

class KeywordStore {
  private data: KeywordStoreData;
  private isDirty: boolean = false;
  private saveDebounceTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.data = this.loadData();
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
  private loadData(): KeywordStoreData {
    this.ensureDataDir();
    
    try {
      if (fs.existsSync(KEYWORDS_FILE)) {
        const content = fs.readFileSync(KEYWORDS_FILE, 'utf-8');
        const data = JSON.parse(content);
        console.log(`[KeywordStore] Loaded ${data.keywords.length} keywords`);
        return data;
      }
    } catch (error) {
      console.error('[KeywordStore] Error loading data:', error);
    }

    // Return default structure
    return {
      keywords: [],
      stats: {
        totalKeywords: 0,
        activeKeywords: 0,
        averageSuccessRate: 0,
        lastDiscovery: new Date().toISOString(),
        lastUpdate: new Date().toISOString(),
      },
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
    }, 5000);
  }

  /**
   * Force immediate save
   */
  private forceSave(): void {
    if (!this.isDirty) return;
    
    this.ensureDataDir();
    
    try {
      // Update stats before saving
      this.updateStats();
      
      fs.writeFileSync(KEYWORDS_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
      this.isDirty = false;
      console.log(`[KeywordStore] Saved ${this.data.keywords.length} keywords`);
    } catch (error) {
      console.error('[KeywordStore] Error saving data:', error);
    }
  }

  /**
   * Update statistics
   */
  private updateStats(): void {
    this.data.stats.totalKeywords = this.data.keywords.length;
    this.data.stats.activeKeywords = this.data.keywords.filter(k => k.isActive).length;
    
    const keywordsWithAttempts = this.data.keywords.filter(k => k.totalAttempts > 0);
    if (keywordsWithAttempts.length > 0) {
      this.data.stats.averageSuccessRate = 
        keywordsWithAttempts.reduce((sum, k) => sum + k.successRate, 0) / keywordsWithAttempts.length;
    } else {
      this.data.stats.averageSuccessRate = 0;
    }
    
    this.data.stats.lastUpdate = new Date().toISOString();
  }

  /**
   * Add or update keywords from discovery
   */
  addDiscoveredKeywords(discovered: DiscoveredKeyword[]): number {
    let newCount = 0;
    let updatedCount = 0;

    for (const disc of discovered) {
      const existing = this.data.keywords.find(
        k => k.normalizedKeyword === disc.normalizedKeyword
      );

      if (existing) {
        // Update existing keyword
        existing.lastSeen = disc.lastSeen;
        existing.frequency = disc.frequency;
        existing.score = disc.score;
        
        // Merge sources (avoid duplicates)
        for (const newSource of disc.sources) {
          const hasSource = existing.sources.some(
            s => s.platform === newSource.platform && 
                 s.discoveredAt === newSource.discoveredAt
          );
          if (!hasSource) {
            existing.sources.push(newSource);
          }
        }

        // Update priority based on new score
        existing.priority = this.calculatePriority(existing);
        
        updatedCount++;
      } else {
        // Add new keyword
        const newKeyword: StoredKeyword = {
          ...disc,
          successCount: 0,
          failureCount: 0,
          totalAttempts: 0,
          successRate: 0,
          lastUsed: null,
          priority: this.calculatePriority(disc as any),
          isActive: disc.isProduct, // Only activate product-related by default
          tags: [disc.category],
        };

        this.data.keywords.push(newKeyword);
        newCount++;
      }
    }

    this.data.stats.lastDiscovery = new Date().toISOString();
    this.saveData();

    console.log(`[KeywordStore] Added ${newCount} new, updated ${updatedCount} existing keywords`);
    return newCount;
  }

  /**
   * Calculate priority score for a keyword
   */
  private calculatePriority(keyword: StoredKeyword): number {
    let priority = 0;

    // Base score from discovery (max 30 points)
    priority += (keyword.score / 100) * 30;

    // Success rate (max 30 points)
    if (keyword.totalAttempts > 0) {
      priority += (keyword.successRate / 100) * 30;
    } else {
      // No attempts yet - give moderate priority to try
      priority += 15;
    }

    // Frequency across sources (max 20 points)
    priority += Math.min(20, keyword.frequency * 4);

    // Recency (max 10 points)
    const daysSinceLastSeen = (Date.now() - new Date(keyword.lastSeen).getTime()) / (1000 * 60 * 60 * 24);
    const recencyScore = Math.max(0, 10 - daysSinceLastSeen);
    priority += recencyScore;

    // Product bonus (10 points)
    if (keyword.isProduct) {
      priority += 10;
    }

    return Math.min(100, Math.round(priority));
  }

  /**
   * Record scrape attempt result
   */
  recordScrapeResult(normalizedKeyword: string, success: boolean, resultsCount?: number): void {
    const keyword = this.data.keywords.find(k => k.normalizedKeyword === normalizedKeyword);
    
    if (!keyword) {
      console.warn(`[KeywordStore] Keyword not found: ${normalizedKeyword}`);
      return;
    }

    keyword.totalAttempts++;
    keyword.lastUsed = new Date().toISOString();

    if (success) {
      keyword.successCount++;
    } else {
      keyword.failureCount++;
    }

    keyword.successRate = (keyword.successCount / keyword.totalAttempts) * 100;

    // Update priority based on performance
    keyword.priority = this.calculatePriority(keyword);

    // Auto-deactivate keywords with very low success rate after many attempts
    if (keyword.totalAttempts >= 10 && keyword.successRate < 10) {
      keyword.isActive = false;
      console.log(`[KeywordStore] Auto-deactivated low-performing keyword: ${keyword.keyword}`);
    }

    // Auto-activate keywords with high success rate
    if (keyword.totalAttempts >= 3 && keyword.successRate >= 70 && !keyword.isActive) {
      keyword.isActive = true;
      console.log(`[KeywordStore] Auto-activated high-performing keyword: ${keyword.keyword}`);
    }

    this.saveData();
  }

  /**
   * Get top keywords for scraping
   */
  getTopKeywords(count: number = 50, options: {
    category?: string;
    productsOnly?: boolean;
    minPriority?: number;
  } = {}): StoredKeyword[] {
    let keywords = this.data.keywords.filter(k => k.isActive);

    // Apply filters
    if (options.category) {
      keywords = keywords.filter(k => k.category === options.category);
    }

    if (options.productsOnly) {
      keywords = keywords.filter(k => k.isProduct);
    }

    if (options.minPriority !== undefined) {
      keywords = keywords.filter(k => k.priority >= options.minPriority);
    }

    // Sort by priority
    keywords.sort((a, b) => b.priority - a.priority);

    return keywords.slice(0, count);
  }

  /**
   * Get keywords by category
   */
  getKeywordsByCategory(): Record<string, StoredKeyword[]> {
    const byCategory: Record<string, StoredKeyword[]> = {};

    for (const keyword of this.data.keywords) {
      if (!byCategory[keyword.category]) {
        byCategory[keyword.category] = [];
      }
      byCategory[keyword.category].push(keyword);
    }

    // Sort each category by priority
    for (const category in byCategory) {
      byCategory[category].sort((a, b) => b.priority - a.priority);
    }

    return byCategory;
  }

  /**
   * Add keywords from scraped product data
   */
  addProductKeywords(productTitles: string[], category: string): number {
    let addedCount = 0;

    for (const title of productTitles) {
      // Extract meaningful words (3+ chars)
      const words = title
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length >= 3);

      // Also extract 2-word phrases
      const phrases: string[] = [];
      for (let i = 0; i < words.length - 1; i++) {
        phrases.push(`${words[i]} ${words[i + 1]}`);
      }

      const allKeywords = [...words, ...phrases];

      for (const kw of allKeywords) {
        const normalized = kw.trim();
        if (!normalized || normalized.length < 3) continue;

        const existing = this.data.keywords.find(k => k.normalizedKeyword === normalized);

        if (existing) {
          // Add source if not already present
          const hasProductSource = existing.sources.some(s => s.platform === 'scraped-product');
          if (!hasProductSource) {
            existing.sources.push({
              platform: 'scraped-product',
              discoveredAt: new Date().toISOString(),
              relevanceScore: 60,
            });
            existing.frequency++;
          }
        } else {
          // Create new keyword
          const newKeyword: StoredKeyword = {
            keyword: kw,
            normalizedKeyword: normalized,
            sources: [{
              platform: 'scraped-product',
              discoveredAt: new Date().toISOString(),
              relevanceScore: 60,
            }],
            firstSeen: new Date().toISOString(),
            lastSeen: new Date().toISOString(),
            frequency: 1,
            score: 50,
            category,
            isProduct: true,
            relatedKeywords: [],
            successCount: 0,
            failureCount: 0,
            totalAttempts: 0,
            successRate: 0,
            lastUsed: null,
            priority: 50,
            isActive: true,
            tags: [category, 'product-derived'],
          };

          this.data.keywords.push(newKeyword);
          addedCount++;
        }
      }
    }

    if (addedCount > 0) {
      this.saveData();
      console.log(`[KeywordStore] Added ${addedCount} product-derived keywords`);
    }

    return addedCount;
  }

  /**
   * Add related terms to a keyword
   */
  addRelatedTerms(normalizedKeyword: string, relatedTerms: string[]): void {
    const keyword = this.data.keywords.find(k => k.normalizedKeyword === normalizedKeyword);
    
    if (!keyword) {
      return;
    }

    // Add new related terms
    const existing = new Set(keyword.relatedKeywords);
    for (const term of relatedTerms) {
      if (term && term !== keyword.keyword) {
        existing.add(term);
      }
    }

    keyword.relatedKeywords = [...existing].slice(0, 30); // Keep top 30

    this.saveData();
  }

  /**
   * Prune old or poorly performing keywords
   */
  pruneKeywords(): { pruned: number } {
    const originalCount = this.data.keywords.length;
    const now = Date.now();
    const sixtyDaysAgo = now - (60 * 24 * 60 * 60 * 1000);

    this.data.keywords = this.data.keywords.filter(keyword => {
      // Keep if recently seen (within 60 days)
      if (new Date(keyword.lastSeen).getTime() > sixtyDaysAgo) {
        return true;
      }

      // Keep if never used (might be useful)
      if (keyword.totalAttempts === 0) {
        return true;
      }

      // Keep if has good success rate
      if (keyword.successRate >= 50) {
        return true;
      }

      // Keep if high priority
      if (keyword.priority >= 60) {
        return true;
      }

      // Otherwise, prune
      console.log(`[KeywordStore] Pruning keyword: ${keyword.keyword} (old, low success)`);
      return false;
    });

    const prunedCount = originalCount - this.data.keywords.length;

    if (prunedCount > 0) {
      this.saveData();
      console.log(`[KeywordStore] Pruned ${prunedCount} keywords`);
    }

    return { pruned: prunedCount };
  }

  /**
   * Get all keywords
   */
  getAllKeywords(): StoredKeyword[] {
    return [...this.data.keywords];
  }

  /**
   * Get statistics
   */
  getStats(): KeywordStoreData['stats'] {
    this.updateStats();
    return { ...this.data.stats };
  }

  /**
   * Activate/deactivate keyword
   */
  setKeywordActive(normalizedKeyword: string, active: boolean): boolean {
    const keyword = this.data.keywords.find(k => k.normalizedKeyword === normalizedKeyword);
    
    if (!keyword) {
      return false;
    }

    keyword.isActive = active;
    this.saveData();
    return true;
  }

  /**
   * Get today's top trending keywords (for UI display)
   */
  getTodayTop10(): StoredKeyword[] {
    const today = new Date().toISOString().split('T')[0];
    
    // Get keywords seen today
    const todayKeywords = this.data.keywords.filter(k => 
      k.lastSeen.startsWith(today)
    );

    // Sort by score and priority
    todayKeywords.sort((a, b) => {
      const scoreA = a.score + a.priority;
      const scoreB = b.score + b.priority;
      return scoreB - scoreA;
    });

    return todayKeywords.slice(0, 10);
  }

  /**
   * Force save immediately
   */
  flush(): void {
    this.forceSave();
  }

  /**
   * Get top N keywords for EACH category
   * Guarantees coverage across all categories
   */
  getTopKeywordsPerCategory(countPerCategory: number = 15): Record<string, StoredKeyword[]> {
    const byCategory = this.getKeywordsByCategory();
    const result: Record<string, StoredKeyword[]> = {};
    
    for (const category of PRODUCT_CATEGORIES) {
      const keywords = byCategory[category.id] || [];
      const activeKeywords = keywords.filter(k => k.isActive);
      
      // If not enough keywords, generate seed keywords from category
      if (activeKeywords.length < countPerCategory) {
        const seedKeywords = this.generateSeedKeywords(category, countPerCategory - activeKeywords.length);
        result[category.id] = [...activeKeywords, ...seedKeywords];
      } else {
        result[category.id] = activeKeywords.slice(0, countPerCategory);
      }
    }
    
    return result;
  }

  /**
   * Generate seed keywords from category definition when not enough discovered
   */
  private generateSeedKeywords(category: ProductCategory, count: number): StoredKeyword[] {
    const seeds: StoredKeyword[] = [];
    const seedKeywords = getSeedKeywordsForCategory(category.id);
    
    // Prioritize seed keywords from categorySeedData
    const allPossible = [...seedKeywords, ...category.keywords, ...category.subcategories];
    
    for (let i = 0; i < Math.min(count, allPossible.length); i++) {
      const keyword = allPossible[i];
      const normalized = keyword.toLowerCase().trim();
      
      // Check if we already have this keyword
      const existing = this.data.keywords.find(k => k.normalizedKeyword === normalized);
      if (existing) {
        seeds.push(existing);
        continue;
      }
      
      // Create new seed keyword
      seeds.push({
        keyword: keyword,
        normalizedKeyword: normalized,
        sources: [{
          platform: 'related-term',
          discoveredAt: new Date().toISOString(),
          relevanceScore: 70,
        }],
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        frequency: 1,
        score: 60,
        category: category.id,
        isProduct: true,
        relatedKeywords: [],
        successCount: 0,
        failureCount: 0,
        totalAttempts: 0,
        successRate: 0,
        lastUsed: null,
        priority: 50,
        isActive: true,
        tags: [category.id, 'seed-keyword'],
      });
    }
    
    return seeds;
  }
}

export const keywordStore = new KeywordStore();
