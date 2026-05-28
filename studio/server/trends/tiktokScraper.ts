/**
 * TikTok Trends Scraper
 * Scrapes trending hashtags and viral content from TikTok using Puppeteer
 * Uses browser automation for more reliable scraping of JS-rendered content
 */

import { browserHelper } from './browserHelper.js';
import { SCRAPING_LIMITS } from './scrapingConfig.js';
import type { Page } from 'puppeteer';

export interface TikTokTrend {
  hashtag: string;
  viewCount: number;
  videoCount: number;
  growthRate: number;
  category: string;
  isViral: boolean;
  relatedHashtags: string[];
  topVideos: TikTokVideo[];
  firstDetected: string;
  lastUpdated: string;
}

export interface TikTokVideo {
  id: string;
  description: string;
  author: string;
  authorUrl: string;
  videoUrl: string;
  thumbnailUrl: string;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  viewCount: number;
  hashtags: string[];
  musicTitle: string;
  createdAt: string;
}

export interface TikTokDiscoverItem {
  title: string;
  subtitle: string;
  cover: string;
  id: string;
  type: 'hashtag' | 'sound' | 'effect';
}

// Product-related keywords for filtering
const PRODUCT_KEYWORDS = [
  'must have',
  'viral product',
  'amazon find',
  'tiktok made me buy',
  'trending product',
  'best buy',
  'gift idea',
  'under $',
  'affordable',
  'game changer',
  'worth it',
  'life hack',
  'organization',
  'aesthetic',
];

class TikTokScraper {
  private baseUrl = 'https://www.tiktok.com';
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private cacheTTL = 6 * 60 * 60 * 1000; // 6 hours
  private usePuppeteer = true; // Enable Puppeteer by default

  /**
   * Get trending hashtags from TikTok discover page using Puppeteer
   */
  async getTrendingHashtags(): Promise<string[]> {
    const cacheKey = 'trending-hashtags';
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    console.log('[TikTokScraper] Fetching trending hashtags with Puppeteer...');
    
    try {
      const page = await browserHelper.createPage({ randomizeViewport: true });
      
      try {
        const url = `${this.baseUrl}/discover`;
        const success = await browserHelper.navigateWithRetry(page, url, {
          maxRetries: 3,
          timeout: 45000,
          waitUntil: 'networkidle2'
        });

        if (!success) {
          throw new Error('Failed to navigate to TikTok discover page');
        }

        // Human-like scrolling to load more content
        await browserHelper.humanScroll(page, 3);
        await browserHelper.randomDelay(2000, 4000);

        // Extract hashtags from the page
        const hashtags = await page.evaluate(() => {
          const results: string[] = [];
          
          // Try multiple selectors for hashtags
          const selectors = [
            '[data-e2e="trending-hashtag"]',
            '[data-e2e="challenge-item"]',
            'a[href*="/tag/"]',
            '.tiktok-hashtag',
            '[class*="DivChallengeCard"]',
            '[class*="hashtag"]'
          ];

          for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            elements.forEach((el) => {
              const text = el.textContent?.trim() || '';
              const href = (el as HTMLAnchorElement).href || '';
              
              if (text.startsWith('#')) {
                results.push(text.replace('#', ''));
              } else if (href.includes('/tag/')) {
                const match = href.match(/\/tag\/([^?\/]+)/);
                if (match && match[1]) {
                  results.push(decodeURIComponent(match[1]));
                }
              }
            });
          }

          // Also try to extract from JSON data in scripts
          const scripts = document.querySelectorAll('script');
          scripts.forEach((script) => {
            const content = script.textContent || '';
            if (content.includes('__UNIVERSAL_DATA_FOR_REHYDRATION__')) {
              try {
                const match = content.match(/__UNIVERSAL_DATA_FOR_REHYDRATION__\s*=\s*({.*?});/s);
                if (match && match[1]) {
                  const data = JSON.parse(match[1]);
                  const discoverData = data?.__DEFAULT_SCOPE__?.['webapp.discover'];
                  if (discoverData?.discoverList) {
                    discoverData.discoverList.forEach((item: any) => {
                      if (item.type === 1 && item.cardItem?.title) {
                        results.push(item.cardItem.title.replace('#', ''));
                      }
                    });
                  }
                }
              } catch (e) {
                // JSON parsing failed, continue
              }
            }
          });

          return results;
        });

        const uniqueHashtags = [...new Set(hashtags)].slice(0, 50);
        console.log(`[TikTokScraper] Found ${uniqueHashtags.length} trending hashtags`);
        
        this.cache.set(cacheKey, { data: uniqueHashtags, timestamp: Date.now() });
        return uniqueHashtags;
      } finally {
        await browserHelper.closePage(page);
      }
    } catch (error) {
      console.error('[TikTokScraper] Error fetching trending hashtags:', error);
      
      // Fallback to fetch-based method
      return this.getTrendingHashtagsFallback();
    }
  }

  /**
   * Fallback fetch-based method for getting hashtags
   */
  private async getTrendingHashtagsFallback(): Promise<string[]> {
    console.log('[TikTokScraper] Using fallback fetch method...');
    
    try {
      const response = await fetch(`${this.baseUrl}/discover`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
      });

      if (!response.ok) {
        throw new Error(`Fetch failed: ${response.status}`);
      }

      const html = await response.text();
      const hashtags: string[] = [];

      // Extract from JSON data
      const jsonMatch = html.match(/__UNIVERSAL_DATA_FOR_REHYDRATION__\s*=\s*({.*?});/s);
      if (jsonMatch && jsonMatch[1]) {
        try {
          const data = JSON.parse(jsonMatch[1]);
          const discoverData = data?.__DEFAULT_SCOPE__?.['webapp.discover'];
          if (discoverData?.discoverList) {
            discoverData.discoverList.forEach((item: any) => {
              if (item.type === 1 && item.cardItem?.title) {
                hashtags.push(item.cardItem.title.replace('#', ''));
              }
            });
          }
        } catch (e) {
          // JSON parsing failed
        }
      }

      // Extract from HTML
      const tagMatches = html.matchAll(/\/tag\/([^"?\/]+)/g);
      for (const match of tagMatches) {
        if (match[1]) {
          hashtags.push(decodeURIComponent(match[1]));
        }
      }

      return [...new Set(hashtags)].slice(0, 50);
    } catch (error) {
      console.error('[TikTokScraper] Fallback also failed:', error);
      return [];
    }
  }

  /**
   * Get hashtag details using Puppeteer
   */
  async getHashtagDetails(hashtag: string): Promise<TikTokTrend | null> {
    const cleanHashtag = hashtag.replace('#', '');
    const cacheKey = `hashtag-${cleanHashtag}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    console.log(`[TikTokScraper] Fetching details for #${cleanHashtag}...`);

    try {
      const page = await browserHelper.createPage({ randomizeViewport: true });
      
      try {
        const url = `${this.baseUrl}/tag/${encodeURIComponent(cleanHashtag)}`;
        const success = await browserHelper.navigateWithRetry(page, url, {
          maxRetries: 2,
          timeout: 30000,
          waitUntil: 'networkidle2'
        });

        if (!success) {
          throw new Error('Failed to navigate to hashtag page');
        }

        await browserHelper.randomDelay(1000, 2000);

        // Extract hashtag data
        const data = await page.evaluate(() => {
          let viewCount = 0;
          let videoCount = 0;
          const relatedHashtags: string[] = [];

          // Try to extract from JSON data
          const scripts = document.querySelectorAll('script');
          scripts.forEach((script) => {
            const content = script.textContent || '';
            if (content.includes('__UNIVERSAL_DATA_FOR_REHYDRATION__')) {
              try {
                const match = content.match(/__UNIVERSAL_DATA_FOR_REHYDRATION__\s*=\s*({.*?});/s);
                if (match && match[1]) {
                  const jsonData = JSON.parse(match[1]);
                  const challengeData = jsonData?.__DEFAULT_SCOPE__?.['webapp.challenge-detail'];
                  if (challengeData?.challengeInfo?.challenge?.stats) {
                    const stats = challengeData.challengeInfo.challenge.stats;
                    viewCount = parseInt(stats.viewCount || '0');
                    videoCount = parseInt(stats.videoCount || '0');
                  }
                }
              } catch (e) {
                // JSON parsing failed
              }
            }
          });

          // Fallback: extract from DOM
          if (viewCount === 0) {
            const viewElements = document.querySelectorAll('[data-e2e="challenge-view-count"], .view-count, [class*="viewCount"]');
            viewElements.forEach((el) => {
              const text = el.textContent || '';
              const match = text.match(/([\d.]+)([KMB]?)/i);
              if (match) {
                const num = parseFloat(match[1]);
                const multiplier = match[2]?.toUpperCase() === 'K' ? 1000 : 
                                   match[2]?.toUpperCase() === 'M' ? 1000000 : 
                                   match[2]?.toUpperCase() === 'B' ? 1000000000 : 1;
                viewCount = Math.round(num * multiplier);
              }
            });
          }

          // Extract related hashtags
          const hashtagLinks = document.querySelectorAll('a[href*="/tag/"]');
          hashtagLinks.forEach((el) => {
            const href = (el as HTMLAnchorElement).href || '';
            const match = href.match(/\/tag\/([^?\/]+)/);
            if (match && match[1]) {
              relatedHashtags.push(decodeURIComponent(match[1]));
            }
          });

          return { viewCount, videoCount, relatedHashtags };
        });

        // Determine if viral
        const isViral = data.viewCount > 10000000 || data.videoCount > 10000;
        
        // Estimate growth rate
        const growthRate = isViral ? Math.min(100, (data.viewCount / 1000000) * 10) : 
                          data.viewCount > 1000000 ? 20 : 5;
        
        const category = this.detectCategory(cleanHashtag);
        
        const trend: TikTokTrend = {
          hashtag: cleanHashtag,
          viewCount: data.viewCount,
          videoCount: data.videoCount,
          growthRate,
          category,
          isViral,
          relatedHashtags: [...new Set(data.relatedHashtags)].filter(h => h !== cleanHashtag).slice(0, 10),
          topVideos: [],
          firstDetected: new Date().toISOString(),
          lastUpdated: new Date().toISOString(),
        };
        
        this.cache.set(cacheKey, { data: trend, timestamp: Date.now() });
        return trend;
      } finally {
        await browserHelper.closePage(page);
      }
    } catch (error) {
      console.error(`[TikTokScraper] Error fetching hashtag "${hashtag}":`, error);
      return null;
    }
  }

  /**
   * Get all trending topics with analysis
   */
  async getAllTrends(): Promise<TikTokTrend[]> {
    const hashtags = await this.getTrendingHashtags();
    const trends: TikTokTrend[] = [];

    // Analyze top 20 hashtags
    for (const hashtag of hashtags.slice(0, SCRAPING_LIMITS.TOP_HASHTAGS)) {
      try {
        const trend = await this.getHashtagDetails(hashtag);
        if (trend && trend.viewCount > 100000) {
          trends.push(trend);
        }
        
        // Small delay between requests
        await browserHelper.randomDelay(1000, 2000);
      } catch (error) {
        console.error(`[TikTokScraper] Error analyzing hashtag "${hashtag}":`, error);
      }
    }

    console.log(`[TikTokScraper] Collected ${trends.length} TikTok trends`);
    return trends.sort((a, b) => b.viewCount - a.viewCount);
  }

  /**
   * Get product-related trends
   */
  async getProductTrends(): Promise<TikTokTrend[]> {
    const allTrends = await this.getAllTrends();
    
    return allTrends.filter(trend => {
      const hashtagLower = trend.hashtag.toLowerCase();
      
      return PRODUCT_KEYWORDS.some(keyword => 
        hashtagLower.includes(keyword.toLowerCase().replace(/\s+/g, ''))
      ) || 
      ['product', 'musthave', 'viral', 'amazon', 'haul', 'review', 'unboxing', 'gift'].some(kw => 
        hashtagLower.includes(kw)
      );
    });
  }

  /**
   * Search for hashtags
   */
  async searchHashtags(query: string): Promise<string[]> {
    const cacheKey = `search-${query}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    try {
      const allHashtags = await this.getTrendingHashtags();
      const queryLower = query.toLowerCase();
      const matching = allHashtags.filter(tag => 
        tag.toLowerCase().includes(queryLower)
      );
      
      this.cache.set(cacheKey, { data: matching, timestamp: Date.now() });
      return matching;
    } catch (error) {
      console.error(`[TikTokScraper] Error searching for "${query}":`, error);
      return [];
    }
  }

  /**
   * Detect category from hashtag
   */
  private detectCategory(hashtag: string): string {
    const hashtagLower = hashtag.toLowerCase();
    
    const categoryKeywords: Record<string, string[]> = {
      'fashion': ['fashion', 'style', 'outfit', 'ootd', 'clothing', 'shoes', 'accessories'],
      'beauty': ['beauty', 'makeup', 'skincare', 'hair', 'cosmetics', 'nails'],
      'food': ['food', 'recipe', 'cooking', 'baking', 'foodie', 'eat', 'dinner'],
      'home': ['home', 'decor', 'interior', 'organization', 'cleaning', 'diy'],
      'fitness': ['fitness', 'workout', 'gym', 'exercise', 'health', 'yoga'],
      'tech': ['tech', 'technology', 'gadget', 'phone', 'app', 'gaming'],
      'books': ['book', 'reading', 'booktok', 'author', 'novel', 'literature'],
      'art': ['art', 'drawing', 'painting', 'creative', 'artist', 'design'],
      'kids': ['kids', 'baby', 'parenting', 'toy', 'children', 'family'],
      'lifestyle': ['lifestyle', 'vlog', 'daily', 'morning', 'routine', 'life'],
    };

    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      if (keywords.some(kw => hashtagLower.includes(kw))) {
        return category;
      }
    }

    return 'other';
  }

  /**
   * Calculate trend velocity
   */
  calculateVelocity(trend: TikTokTrend): number {
    if (trend.videoCount === 0) return 0;
    
    const viewsPerVideo = trend.viewCount / trend.videoCount;
    
    if (viewsPerVideo > 100000) return 10;
    if (viewsPerVideo > 50000) return 7;
    if (viewsPerVideo > 10000) return 5;
    if (viewsPerVideo > 1000) return 3;
    
    return 1;
  }

  /**
   * Get discover page items
   */
  async getDiscoverItems(): Promise<TikTokDiscoverItem[]> {
    const cacheKey = 'discover-items';
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    try {
      const page = await browserHelper.createPage({ randomizeViewport: true });
      
      try {
        const url = `${this.baseUrl}/discover`;
        await browserHelper.navigateWithRetry(page, url);
        await browserHelper.humanScroll(page, 2);

        const items = await page.evaluate(() => {
          const results: { title: string; subtitle: string; cover: string; id: string; type: string }[] = [];
          
          // Try to extract from JSON
          const scripts = document.querySelectorAll('script');
          scripts.forEach((script) => {
            const content = script.textContent || '';
            if (content.includes('__UNIVERSAL_DATA_FOR_REHYDRATION__')) {
              try {
                const match = content.match(/__UNIVERSAL_DATA_FOR_REHYDRATION__\s*=\s*({.*?});/s);
                if (match && match[1]) {
                  const data = JSON.parse(match[1]);
                  const discoverData = data?.__DEFAULT_SCOPE__?.['webapp.discover'];
                  if (discoverData?.discoverList) {
                    discoverData.discoverList.forEach((item: any) => {
                      if (item.cardItem) {
                        results.push({
                          title: item.cardItem.title || '',
                          subtitle: item.cardItem.description || '',
                          cover: item.cardItem.cover || '',
                          id: item.cardItem.id || '',
                          type: item.type === 1 ? 'hashtag' : item.type === 2 ? 'sound' : 'effect',
                        });
                      }
                    });
                  }
                }
              } catch (e) {
                // JSON parsing failed
              }
            }
          });

          return results;
        }) as TikTokDiscoverItem[];

        this.cache.set(cacheKey, { data: items, timestamp: Date.now() });
        return items;
      } finally {
        await browserHelper.closePage(page);
      }
    } catch (error) {
      console.error('[TikTokScraper] Error fetching discover items:', error);
      return [];
    }
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

export const tiktokScraper = new TikTokScraper();
export { PRODUCT_KEYWORDS };
