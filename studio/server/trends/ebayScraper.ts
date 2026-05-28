/**
 * eBay Trending Scraper - Puppeteer Edition
 * Uses real browser automation to bypass bot detection
 * 45-second delays for realistic human browsing patterns
 */

import { browserHelper } from './browserHelper.js';
import { SCRAPING_LIMITS } from './scrapingConfig.js';
import { adaptiveRateLimiter } from './adaptiveRateLimiter.js';
import type { Page } from 'puppeteer';

export interface EbayTrend {
  query: string;
  category: string;
  listingCount: number;
  averagePrice: number;
  priceRange: { min: number; max: number };
  soldCount: number;
  watchCount: number;
  popularityScore: number;
  topListings: EbayListing[];
  firstDetected: string;
  lastUpdated: string;
}

export interface EbayListing {
  id: string;
  title: string;
  price: number;
  currency: string;
  condition: string;
  sellerName: string;
  url: string;
  imageUrl: string;
  watchers: number;
  soldCount: number;
  location: string;
  shippingCost: number;
  isAuction: boolean;
  endsAt?: string;
}

export interface EbayCategory {
  id: string;
  name: string;
  trendingSearches: string[];
  itemCount: number;
}

// eBay category IDs relevant to KDP and crafts
const EBAY_CATEGORIES = [
  { id: '267', name: 'Books & Magazines', path: '/bn_267' },
  { id: '220', name: 'Toys & Hobbies', path: '/bn_220' },
  { id: '11700', name: 'Home & Garden', path: '/bn_11700' },
  { id: '159912', name: 'Crafts', path: '/bn_159912' },
  { id: '11450', name: 'Clothing, Shoes & Accessories', path: '/bn_11450' },
  { id: '1249', name: 'Video Games & Consoles', path: '/bn_1249' },
  { id: '11232', name: 'DVDs & Movies', path: '/bn_11232' },
];

class EbayScraper {
  private baseUrl = 'https://www.ebay.com';
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private cacheTTL = 24 * 60 * 60 * 1000; // 24 hours (was 12) - longer cache to reduce scraping frequency
  private rateLimitDelay = 45000; // 45 seconds (realistic human browsing)
  private lastRequestTime = 0;

  /**
   * Rate-limited delay with randomization
   */
  private async rateLimitedDelay(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.rateLimitDelay) {
      const waitTime = this.rateLimitDelay - timeSinceLastRequest;
      console.log(`[EbayScraper] Waiting ${Math.round(waitTime / 1000)}s before next request...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    // Add random 0-5 second variation to make it more human-like
    const randomDelay = Math.floor(Math.random() * 5000);
    await new Promise(resolve => setTimeout(resolve, randomDelay));
    
    this.lastRequestTime = Date.now();
  }

  /**
   * Get trending searches from eBay homepage
   */
  async getTrendingSearches(): Promise<string[]> {
    const cacheKey = 'trending-searches';
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      console.log('[EbayScraper] Using cached trending searches');
      return cached.data;
    }

    let page: Page | null = null;

    try {
      console.log('[EbayScraper] Fetching trending searches with Puppeteer...');
      
      await this.rateLimitedDelay();
      
      page = await browserHelper.createPage({ randomizeViewport: true });
      
      const success = await browserHelper.navigateWithRetry(page, this.baseUrl, {
        waitUntil: 'networkidle2',
        timeout: 45000,
      });

      if (!success) {
        throw new Error('Failed to navigate to eBay homepage');
      }

      // Scroll a bit to look human
      await browserHelper.humanScroll(page, 2);

      // Extract trending searches from the page
      const trendingSearches = await page.evaluate(() => {
        const searches: string[] = [];
        
        // Look for various trending elements
        const selectors = [
          '[data-trending]',
          '.trending-search',
          '[data-search-term]',
          '.srp-carousel-list a', // Carousel items
          '.navigation-desktop-2 a', // Navigation links
          '.hl-cat-nav__js-tab', // Category tabs
        ];

        selectors.forEach(selector => {
          const elements = document.querySelectorAll(selector);
          elements.forEach(elem => {
            const text = elem.textContent?.trim() || elem.getAttribute('data-search-term');
            if (text && text.length > 2 && text.length < 50) {
              searches.push(text);
            }
          });
        });

        // Also extract from popular categories
        const categoryLinks = document.querySelectorAll('a[href*="/sch/"]');
        categoryLinks.forEach(link => {
          const href = link.getAttribute('href');
          if (href) {
            const match = href.match(/[?&]_nkw=([^&]+)/);
            if (match && match[1]) {
              const query = decodeURIComponent(match[1].replace(/\+/g, ' '));
              if (query.length > 2 && query.length < 50) {
                searches.push(query);
              }
            }
          }
        });

        // Remove duplicates and return
        return [...new Set(searches)];
      });

      console.log(`[EbayScraper] Found ${trendingSearches.length} trending searches`);

      const result = trendingSearches.slice(0, 50);
      this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
      
      return result;
    } catch (error: any) {
      console.error('[EbayScraper] Error fetching trending searches:', error.message);
      return [];
    } finally {
      if (page) {
        await browserHelper.closePage(page);
      }
    }
  }

  /**
   * Search eBay for listings
   */
  async search(query: string, options?: { limit?: number; category?: string }): Promise<EbayListing[]> {
    const { limit = SCRAPING_LIMITS.TOP_PRODUCTS_PER_PLATFORM, category } = options || {};
    const cacheKey = `search-${query}-${category || 'all'}-${limit}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      console.log(`[EbayScraper] Using cached search results for "${query}"`);
      return cached.data;
    }

    let page: Page | null = null;

    try {
      console.log(`[EbayScraper] Searching for "${query}" with Puppeteer...`);
      
      await this.rateLimitedDelay();
      
      page = await browserHelper.createPage({ randomizeViewport: true });

      // Build search URL
      const params = new URLSearchParams({
        _nkw: query,
        _ipg: String(Math.min(limit, 60)), // eBay max per page
        _sop: '12', // Sort by best match
      });
      
      if (category) {
        params.append('_sacat', category);
      }

      const searchUrl = `${this.baseUrl}/sch/i.html?${params}`;
      
      const success = await browserHelper.navigateWithRetry(page, searchUrl, {
        waitUntil: 'networkidle2',
        timeout: 45000,
      });

      if (!success) {
        console.error(`[EbayScraper] Failed to search for "${query}"`);
        return [];
      }

      // Scroll to load more items
      await browserHelper.humanScroll(page, 2);

      // Extract listings
      const listings = await page.evaluate((maxItems: number) => {
        const results: EbayListing[] = [];
        
        const items = document.querySelectorAll('.s-item, .srp-results .s-item');
        
        items.forEach((item, index) => {
          if (index >= maxItems) return;

          // Skip "Shop on eBay" placeholder
          const title = item.querySelector('.s-item__title')?.textContent?.trim();
          if (!title || title === 'Shop on eBay') return;

          const priceText = item.querySelector('.s-item__price')?.textContent?.replace(/[^\d.]/g, '') || '0';
          const price = parseFloat(priceText) || 0;
          
          const id = item.getAttribute('data-listing-id') || item.getAttribute('data-view') || `item-${index}`;
          const url = item.querySelector('.s-item__link')?.getAttribute('href') || '';
          const imageUrl = item.querySelector('.s-item__image-img, img')?.getAttribute('src') || '';
          const condition = item.querySelector('.SECONDARY_INFO')?.textContent?.trim() || 'New';
          const sellerName = item.querySelector('.s-item__seller-info-text')?.textContent?.trim() || '';
          
          const watchersText = item.querySelector('.s-item__watchCount')?.textContent || '';
          const watchers = parseInt(watchersText.replace(/\D/g, '')) || 0;
          
          const soldText = item.querySelector('.s-item__quantitySold, .s-item__dynamic')?.textContent || '';
          const soldCount = parseInt(soldText.replace(/\D/g, '')) || 0;
          
          const shippingText = item.querySelector('.s-item__shipping')?.textContent?.replace(/[^\d.]/g, '') || '0';
          const shippingCost = parseFloat(shippingText) || 0;
          
          const isAuction = item.querySelector('.s-item__purchase-options-with-icon')?.textContent?.toLowerCase().includes('auction') || false;

          results.push({
            id,
            title,
            price,
            currency: 'USD',
            condition,
            sellerName,
            url: url.split('?')[0], // Clean URL
            imageUrl,
            watchers,
            soldCount,
            location: '',
            shippingCost,
            isAuction,
          });
        });

        return results;
      }, limit);

      console.log(`[EbayScraper] Found ${listings.length} listings for "${query}"`);

      this.cache.set(cacheKey, { data: listings, timestamp: Date.now() });
      return listings;
    } catch (error: any) {
      console.error(`[EbayScraper] Error searching for "${query}":`, error.message);
      return [];
    } finally {
      if (page) {
        await browserHelper.closePage(page);
      }
    }
  }

  /**
   * Analyze a search trend
   */
  async analyzeTrend(query: string): Promise<EbayTrend | null> {
    const cacheKey = `analyze-${query}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    try {
      const listings = await this.search(query, { limit: 48 });
      
      if (listings.length === 0) return null;

      // Calculate metrics
      const prices = listings.map(l => l.price).filter(p => p > 0);
      const averagePrice = prices.length > 0 
        ? prices.reduce((sum, p) => sum + p, 0) / prices.length 
        : 0;
      
      const priceRange = {
        min: Math.min(...prices),
        max: Math.max(...prices),
      };

      const totalSold = listings.reduce((sum, l) => sum + l.soldCount, 0);
      const totalWatchers = listings.reduce((sum, l) => sum + l.watchers, 0);

      // Popularity score based on engagement
      const popularityScore = Math.min(100, Math.round(
        (totalSold / listings.length) * 40 + // Sold items weight 40%
        (totalWatchers / listings.length / 10) * 30 + // Watchers weight 30%
        (listings.length / 48) * 30 // Result density 30%
      ));

      const category = this.detectCategory(query, listings);

      const trend: EbayTrend = {
        query,
        category,
        listingCount: listings.length,
        averagePrice: Math.round(averagePrice * 100) / 100,
        priceRange,
        soldCount: totalSold,
        watchCount: totalWatchers,
        popularityScore,
        topListings: listings.slice(0, 10),
        firstDetected: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
      };

      this.cache.set(cacheKey, { data: trend, timestamp: Date.now() });
      return trend;
    } catch (error: any) {
      console.error(`[EbayScraper] Error analyzing trend "${query}":`, error.message);
      return null;
    }
  }

  /**
   * Get all trending topics with full analysis
   */
  async getAllTrends(): Promise<EbayTrend[]> {
    const trendingSearches = await this.getTrendingSearches();
    const trends: EbayTrend[] = [];

    // Analyze top 20 trending searches (with 45s delays, this takes ~15 minutes)
    console.log(`[EbayScraper] Analyzing ${Math.min(20, trendingSearches.length)} trending searches...`);
    
    for (const query of trendingSearches.slice(0, SCRAPING_LIMITS.TOP_TRENDING_KEYWORDS)) {
      try {
        const trend = await this.analyzeTrend(query);
        if (trend && trend.popularityScore > 20) {
          trends.push(trend);
        }
      } catch (error: any) {
        console.error(`[EbayScraper] Error analyzing "${query}":`, error.message);
      }
    }

    return trends.sort((a, b) => b.popularityScore - a.popularityScore);
  }

  /**
   * Get category trending
   */
  async getCategoryTrending(categoryId?: string): Promise<EbayCategory[]> {
    const categories = categoryId
      ? EBAY_CATEGORIES.filter(c => c.id === categoryId)
      : EBAY_CATEGORIES;

    const results: EbayCategory[] = [];
    let page: Page | null = null;

    for (const category of categories) {
      const cacheKey = `category-${category.id}`;
      const cached = this.cache.get(cacheKey);
      
      if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
        results.push(cached.data);
        continue;
      }

      try {
        await this.rateLimitedDelay();
        
        page = await browserHelper.createPage({ randomizeViewport: true });
        const url = `${this.baseUrl}${category.path}`;
        
        const success = await browserHelper.navigateWithRetry(page, url, {
          waitUntil: 'networkidle2',
          timeout: 45000,
        });

        if (!success) {
          console.error(`[EbayScraper] Failed to load category ${category.name}`);
          continue;
        }

        await browserHelper.humanScroll(page, 2);

        const trendingSearches = await page.evaluate(() => {
          const searches: string[] = [];
          
          document.querySelectorAll('.trending-search, [data-trending]').forEach(elem => {
            const search = elem.textContent?.trim();
            if (search) {
              searches.push(search);
            }
          });

          return searches.slice(0, 10);
        });

        const categoryData: EbayCategory = {
          id: category.id,
          name: category.name,
          trendingSearches,
          itemCount: 0,
        };

        this.cache.set(cacheKey, { data: categoryData, timestamp: Date.now() });
        results.push(categoryData);
        
        await browserHelper.closePage(page);
        page = null;
      } catch (error: any) {
        console.error(`[EbayScraper] Error fetching category ${category.name}:`, error.message);
        if (page) {
          await browserHelper.closePage(page);
          page = null;
        }
      }
    }

    return results;
  }

  /**
   * Detect category from query and listings
   */
  private detectCategory(query: string, listings: EbayListing[]): string {
    const queryLower = query.toLowerCase();
    
    const categoryKeywords: Record<string, string[]> = {
      'books': ['book', 'novel', 'textbook', 'magazine', 'comic'],
      'toys': ['toy', 'action figure', 'doll', 'game', 'puzzle'],
      'home': ['home', 'decor', 'furniture', 'garden', 'kitchen'],
      'crafts': ['craft', 'handmade', 'diy', 'supplies', 'material'],
      'electronics': ['electronics', 'phone', 'computer', 'tablet', 'camera'],
      'fashion': ['clothing', 'shoes', 'fashion', 'dress', 'shirt'],
      'video-games': ['video game', 'console', 'playstation', 'xbox', 'nintendo'],
    };

    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      if (keywords.some(kw => queryLower.includes(kw))) {
        return category;
      }
    }

    return 'other';
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

export const ebayScraper = new EbayScraper();
export { EBAY_CATEGORIES };
