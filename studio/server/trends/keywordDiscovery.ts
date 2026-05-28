/**
 * Keyword Discovery System
 * Automatically discovers trending keywords/products from multiple sources
 * - Google Trends daily trending searches
 * - Reddit hot posts (product-related)
 * - TikTok trending hashtags
 * - Scraped product titles and categories
 * - Related terms from successful searches
 */

import { googleTrendsService } from './googleTrends.js';
import { redditScraper } from './redditScraper.js';
import { tiktokScraper } from './tiktokScraper.js';
import { getCategoryByKeyword } from './categories.js';

export interface DiscoveredKeyword {
  keyword: string;
  normalizedKeyword: string;
  sources: KeywordSource[];
  firstSeen: string;
  lastSeen: string;
  frequency: number;           // How many times discovered across sources
  score: number;               // Relevance score (0-100)
  category: string;
  isProduct: boolean;          // Validated as product-related
  relatedKeywords: string[];
  searchVolume?: number;       // If available from Google Trends
  growthRate?: number;         // If available from Google Trends
}

export interface KeywordSource {
  platform: 'google-trends' | 'reddit' | 'tiktok' | 'etsy' | 'ebay' | 'amazon' | 'scraped-product' | 'related-term';
  discoveredAt: string;
  context?: string;            // Optional context (e.g., subreddit, hashtag count)
  relevanceScore: number;      // 0-100
}

export interface DiscoveryResult {
  keywords: DiscoveredKeyword[];
  timestamp: string;
  sources: {
    googleTrends: number;
    reddit: number;
    tiktok: number;
    products: number;
    relatedTerms: number;
  };
  topKeywords: string[];       // Top 10 by score
}

class KeywordDiscovery {
  private productKeywords = [
    'book', 'kit', 'set', 'supplies', 'pack', 'collection', 'bundle',
    'coloring', 'craft', 'art', 'diy', 'handmade', 'vintage', 'creative',
    'planner', 'journal', 'notebook', 'sticker', 'print', 'poster',
    'decor', 'gift', 'toy', 'game', 'puzzle', 'activity'
  ];

  private stopWords = [
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
    'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
    'must', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she',
    'it', 'we', 'they', 'what', 'which', 'who', 'when', 'where', 'why', 'how'
  ];

  /**
   * Run full discovery across all sources
   */
  async discover(): Promise<DiscoveryResult> {
    console.log('[KeywordDiscovery] Starting multi-source discovery...');
    
    const discoveryMap = new Map<string, DiscoveredKeyword>();
    const sources = {
      googleTrends: 0,
      reddit: 0,
      tiktok: 0,
      products: 0,
      relatedTerms: 0,
    };

    // Source 1: Google Trends daily trending
    await this.discoverFromGoogleTrends(discoveryMap, sources);

    // Source 2: Reddit hot posts
    await this.discoverFromReddit(discoveryMap, sources);

    // Source 3: TikTok trending hashtags
    await this.discoverFromTikTok(discoveryMap, sources);

    // Convert map to array and calculate scores
    const keywords = Array.from(discoveryMap.values());
    
    // Calculate final scores
    keywords.forEach(kw => {
      kw.score = this.calculateScore(kw);
    });

    // Sort by score
    keywords.sort((a, b) => b.score - a.score);

    // Get top 10
    const topKeywords = keywords.slice(0, 10).map(kw => kw.keyword);

    const result: DiscoveryResult = {
      keywords,
      timestamp: new Date().toISOString(),
      sources,
      topKeywords,
    };

    console.log(`[KeywordDiscovery] Discovery complete: ${keywords.length} unique keywords found`);
    console.log(`[KeywordDiscovery] Top 10:`, topKeywords);
    console.log(`[KeywordDiscovery] Sources: GT=${sources.googleTrends}, Reddit=${sources.reddit}, TikTok=${sources.tiktok}`);

    return result;
  }

  /**
   * Discover keywords from Google Trends
   */
  private async discoverFromGoogleTrends(
    discoveryMap: Map<string, DiscoveredKeyword>,
    sources: DiscoveryResult['sources']
  ): Promise<void> {
    try {
      console.log('[KeywordDiscovery] Fetching from Google Trends...');
      
      // Get daily trending searches
      const trendingUS = await googleTrendsService.getDailyTrends('US');
      const trendingUK = await googleTrendsService.getDailyTrends('GB');
      
      const allTrending = [...trendingUS, ...trendingUK];
      
      for (const keyword of allTrending) {
        if (!keyword || keyword.length < 3) continue;

        const normalized = this.normalizeKeyword(keyword);
        if (!normalized) continue;

        // Check if product-related
        const isProduct = this.isProductRelated(keyword);
        
        const existing = discoveryMap.get(normalized);
        const source: KeywordSource = {
          platform: 'google-trends',
          discoveredAt: new Date().toISOString(),
          relevanceScore: isProduct ? 90 : 60,
        };

        if (existing) {
          existing.sources.push(source);
          existing.frequency++;
          existing.lastSeen = new Date().toISOString();
        } else {
          discoveryMap.set(normalized, {
            keyword,
            normalizedKeyword: normalized,
            sources: [source],
            firstSeen: new Date().toISOString(),
            lastSeen: new Date().toISOString(),
            frequency: 1,
            score: 0,
            category: this.categorizeKeyword(keyword),
            isProduct,
            relatedKeywords: [],
          });
        }

        sources.googleTrends++;
      }

      console.log(`[KeywordDiscovery] Found ${allTrending.length} keywords from Google Trends`);
    } catch (error: any) {
      console.error('[KeywordDiscovery] Error fetching Google Trends:', error.message);
    }
  }

  /**
   * Discover keywords from Reddit hot posts
   */
  private async discoverFromReddit(
    discoveryMap: Map<string, DiscoveredKeyword>,
    sources: DiscoveryResult['sources']
  ): Promise<void> {
    try {
      console.log('[KeywordDiscovery] Fetching from Reddit...');
      
      // Product-related subreddits
      const subreddits = [
        'crafts', 'DIY', 'coloring', 'artstore', 'booksuggestions',
        'EtsySellers', 'shutupandtakemymoney', 'ProductPorn', 'BuyItForLife',
        'somethingimade', 'Random_Acts_Of_Amazon'
      ];

      for (const subreddit of subreddits) {
        try {
          // FIX: Use getHotPosts instead of non-existent getTrendingPosts
          const posts = await redditScraper.getHotPosts(subreddit, 25);
          
          for (const post of posts) {
            // Extract keywords from title
            const keywords = this.extractKeywords(post.title);
            
            for (const keyword of keywords) {
              const normalized = this.normalizeKeyword(keyword);
              if (!normalized || normalized.length < 3) continue;

              const isProduct = this.isProductRelated(keyword);
              
              const existing = discoveryMap.get(normalized);
              const source: KeywordSource = {
                platform: 'reddit',
                discoveredAt: new Date().toISOString(),
                context: `r/${subreddit}`,
                relevanceScore: isProduct ? 75 : 50,
              };

              if (existing) {
                existing.sources.push(source);
                existing.frequency++;
                existing.lastSeen = new Date().toISOString();
              } else {
                discoveryMap.set(normalized, {
                  keyword,
                  normalizedKeyword: normalized,
                  sources: [source],
                  firstSeen: new Date().toISOString(),
                  lastSeen: new Date().toISOString(),
                  frequency: 1,
                  score: 0,
                  category: this.categorizeKeyword(keyword),
                  isProduct,
                  relatedKeywords: [],
                });
              }

              sources.reddit++;
            }
          }
        } catch (error: any) {
          console.warn(`[KeywordDiscovery] Error fetching r/${subreddit}:`, error.message);
        }
      }

      console.log(`[KeywordDiscovery] Processed ${subreddits.length} subreddits`);
    } catch (error: any) {
      console.error('[KeywordDiscovery] Error fetching Reddit:', error.message);
    }
  }

  /**
   * Discover keywords from TikTok trending hashtags
   */
  private async discoverFromTikTok(
    discoveryMap: Map<string, DiscoveredKeyword>,
    sources: DiscoveryResult['sources']
  ): Promise<void> {
    try {
      console.log('[KeywordDiscovery] Fetching from TikTok...');
      
      const trending = await tiktokScraper.getTrendingHashtags();
      
      for (const hashtag of trending) {
        if (!hashtag || hashtag.length < 3) continue;

        // Remove # and clean
        const keyword = hashtag.replace(/^#/, '');
        const normalized = this.normalizeKeyword(keyword);
        if (!normalized) continue;

        const isProduct = this.isProductRelated(keyword);
        
        const existing = discoveryMap.get(normalized);
        const source: KeywordSource = {
          platform: 'tiktok',
          discoveredAt: new Date().toISOString(),
          relevanceScore: isProduct ? 70 : 45,
        };

        if (existing) {
          existing.sources.push(source);
          existing.frequency++;
          existing.lastSeen = new Date().toISOString();
        } else {
          discoveryMap.set(normalized, {
            keyword,
            normalizedKeyword: normalized,
            sources: [source],
            firstSeen: new Date().toISOString(),
            lastSeen: new Date().toISOString(),
            frequency: 1,
            score: 0,
            category: this.categorizeKeyword(keyword),
            isProduct,
            relatedKeywords: [],
          });
        }

        sources.tiktok++;
      }

      console.log(`[KeywordDiscovery] Found ${trending.length} hashtags from TikTok`);
    } catch (error: any) {
      console.error('[KeywordDiscovery] Error fetching TikTok:', error.message);
    }
  }

  /**
   * Extract keywords from text
   */
  private extractKeywords(text: string): string[] {
    // Remove special characters and split
    const words = text
      .toLowerCase()
      .replace(/[^\w\s-]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2);

    // Remove stop words
    const filtered = words.filter(word => !this.stopWords.includes(word));

    // Look for multi-word phrases (2-3 words)
    const phrases: string[] = [];
    
    for (let i = 0; i < filtered.length - 1; i++) {
      // 2-word phrases
      phrases.push(`${filtered[i]} ${filtered[i + 1]}`);
      
      // 3-word phrases
      if (i < filtered.length - 2) {
        phrases.push(`${filtered[i]} ${filtered[i + 1]} ${filtered[i + 2]}`);
      }
    }

    // Combine single words and phrases
    return [...filtered, ...phrases];
  }

  /**
   * Normalize keyword for deduplication
   */
  private normalizeKeyword(keyword: string): string {
    return keyword
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Check if keyword is product-related
   */
  private isProductRelated(keyword: string): boolean {
    const lower = keyword.toLowerCase();
    
    // Check for product keywords
    for (const productKeyword of this.productKeywords) {
      if (lower.includes(productKeyword)) {
        return true;
      }
    }

    // Check for pricing indicators
    if (lower.match(/\$\d+|\d+\s*(dollar|usd|price|cheap|expensive|affordable)/)) {
      return true;
    }

    // Check for shopping-related words
    const shoppingWords = ['buy', 'purchase', 'shop', 'sale', 'deal', 'discount', 'amazon', 'etsy'];
    for (const word of shoppingWords) {
      if (lower.includes(word)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Categorize keyword using central categories
   */
  private categorizeKeyword(keyword: string): string {
    const category = getCategoryByKeyword(keyword);
    return category?.id || 'other';
  }

  /**
   * Calculate relevance score for a keyword
   */
  private calculateScore(keyword: DiscoveredKeyword): number {
    let score = 0;

    // Frequency across sources (max 30 points)
    score += Math.min(30, keyword.frequency * 10);

    // Number of unique sources (max 25 points)
    const uniqueSources = new Set(keyword.sources.map(s => s.platform)).size;
    score += uniqueSources * 5;

    // Average source relevance (max 30 points)
    const avgRelevance = keyword.sources.reduce((sum, s) => sum + s.relevanceScore, 0) / keyword.sources.length;
    score += (avgRelevance / 100) * 30;

    // Product bonus (15 points)
    if (keyword.isProduct) {
      score += 15;
    }

    return Math.min(100, Math.round(score));
  }

  /**
   * Add product-derived keywords
   */
  addProductKeywords(productTitles: string[]): string[] {
    const keywords: string[] = [];

    for (const title of productTitles) {
      const extracted = this.extractKeywords(title);
      keywords.push(...extracted);
    }

    return [...new Set(keywords)].filter(k => k.length >= 3);
  }

  /**
   * Add related terms from a search
   */
  addRelatedTerms(mainKeyword: string, relatedTerms: string[]): string[] {
    return relatedTerms
      .map(term => this.normalizeKeyword(term))
      .filter(term => term && term.length >= 3 && term !== this.normalizeKeyword(mainKeyword));
  }
}

export const keywordDiscovery = new KeywordDiscovery();
