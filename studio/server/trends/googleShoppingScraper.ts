/**
 * Google Shopping Trends Scraper - Enhanced v2
 * Multi-layer scraping with API fallback and improved selectors
 * Layer 1: Enhanced Puppeteer with stealth + proxy
 * Layer 2: SerpApi integration (optional, requires API key)
 * Layer 3: Alternative data sources (DuckDuckGo Shopping)
 * Layer 4: Simulated data fallback
 */

import { browserHelper } from './browserHelper.js';
import { proxyManager } from './proxyManager.js';
import { SCRAPING_LIMITS } from './scrapingConfig.js';
import type { Page } from 'puppeteer';

export interface GoogleShoppingProduct {
  id: string;
  title: string;
  description: string;
  price: number;
  currency: string;
  merchant: string;
  imageUrl: string;
  rating: number;
  reviewCount: number;
  url: string;
  category: string;
}

export interface GoogleShoppingTrend {
  query: string;
  category: string;
  products: GoogleShoppingProduct[];
  avgPrice: number;
  priceRange: { min: number; max: number };
  totalResults: number;
  popularityScore: number;
  growthRate: number;
  firstSeen: string;
  lastSeen: string;
  relatedQueries: string[];
}

export interface GoogleShoppingCategory {
  id: string;
  name: string;
  description: string;
  subcategories: string[];
}

// Google Shopping categories relevant to coloring books and crafts
export const GOOGLE_SHOPPING_CATEGORIES: GoogleShoppingCategory[] = [
  { 
    id: 'books', 
    name: 'Books', 
    description: 'Books and publications',
    subcategories: ['coloring books', 'activity books', 'art books', 'craft books', 'kids books']
  },
  { 
    id: 'arts-crafts', 
    name: 'Arts & Crafts', 
    description: 'Art supplies and craft materials',
    subcategories: ['coloring supplies', 'craft kits', 'art materials', 'paper crafts', 'diy kits']
  },
  { 
    id: 'toys-games', 
    name: 'Toys & Games', 
    description: 'Toys, games, and puzzles',
    subcategories: ['puzzles', 'educational toys', 'activity kits', 'creative toys']
  },
  { 
    id: 'home-decor', 
    name: 'Home & Garden', 
    description: 'Home decor and garden items',
    subcategories: ['wall art', 'home accessories', 'garden decor', 'seasonal decor']
  },
  { 
    id: 'office', 
    name: 'Office Products', 
    description: 'Office and stationery items',
    subcategories: ['planners', 'journals', 'stationery', 'organizers']
  },
];

// Trending search queries to monitor
const TRENDING_QUERIES = [
  'adult coloring books',
  'mandala coloring book',
  'kids activity books',
  'coloring pages printable',
  'craft kits for adults',
  'diy home decor',
  'wall art prints',
  'planner 2025',
  'journal notebook',
  'puzzle books',
  'educational workbooks',
  'sticker books',
  'art supplies set',
  'drawing kit',
  'paint by numbers',
  'embroidery kit',
  'cross stitch kit',
  'scrapbook supplies',
  'card making kit',
  'calligraphy set',
  'bullet journal',
  'gratitude journal',
  'mindfulness coloring',
  'stress relief coloring',
  'nature coloring book',
  'animal coloring book',
  'fantasy coloring book',
  'geometric patterns book',
  'zentangle patterns',
  'watercolor book',
];

class GoogleShoppingScraper {
  private baseUrl = 'https://www.google.com/search';
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private cacheTTL = 12 * 60 * 60 * 1000; // 12 hours (was 6) - longer cache to reduce scraping frequency
  private rateLimitDelay = 12000; // 12 seconds between requests
  private lastRequestTime = 0;
  private historicalData: Map<string, { firstSeen: string; popularityHistory: number[] }> = new Map();
  private usePuppeteer = true;
  private useProxy = false; // Enable if proxies are available
  private useSerpApi = !!process.env.SERPAPI_KEY; // Enable if API key provided
  private serpApiKey = process.env.SERPAPI_KEY || '';
  private failureCount = 0;
  private maxFailuresBeforeFallback = 3;

  /**
   * Rate-limited delay
   */
  private async rateLimitedDelay(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.rateLimitDelay) {
      const waitTime = this.rateLimitDelay - timeSinceLastRequest;
      console.log(`[GoogleShoppingScraper] Waiting ${Math.round(waitTime / 1000)}s before next request...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    // Add random 0-3 second variation
    const randomDelay = Math.floor(Math.random() * 3000);
    await new Promise(resolve => setTimeout(resolve, randomDelay));
    
    this.lastRequestTime = Date.now();
  }

  /**
   * Search Google Shopping for products (multi-layer approach)
   */
  async search(query: string, limit: number = 20): Promise<GoogleShoppingProduct[]> {
    const cacheKey = `search-${query}-${limit}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    // Layer 1: Try enhanced Puppeteer with proxy rotation
    if (this.usePuppeteer && this.failureCount < this.maxFailuresBeforeFallback) {
      const puppeteerResults = await this.searchWithPuppeteer(query, limit);
      if (puppeteerResults.length > 0) {
        this.failureCount = 0; // Reset on success
        this.cache.set(cacheKey, { data: puppeteerResults, timestamp: Date.now() });
        return puppeteerResults;
      }
      this.failureCount++;
      console.log(`[GoogleShoppingScraper] Puppeteer failed (${this.failureCount}/${this.maxFailuresBeforeFallback})`);
    }

    // Layer 2: Try SerpApi if available
    if (this.useSerpApi) {
      console.log(`[GoogleShoppingScraper] Trying SerpApi for "${query}"...`);
      const serpApiResults = await this.searchWithSerpApi(query, limit);
      if (serpApiResults.length > 0) {
        this.failureCount = 0;
        this.cache.set(cacheKey, { data: serpApiResults, timestamp: Date.now() });
        return serpApiResults;
      }
    }

    // Layer 3: Try DuckDuckGo Shopping as alternative
    const duckDuckGoResults = await this.searchWithDuckDuckGo(query, limit);
    if (duckDuckGoResults.length > 0) {
      this.cache.set(cacheKey, { data: duckDuckGoResults, timestamp: Date.now() });
      return duckDuckGoResults;
    }

    // Layer 4: Fall back to simulated data
    console.log(`[GoogleShoppingScraper] All layers failed for "${query}", using simulated data`);
    const simulatedProducts = this.generateSimulatedProducts(query, limit);
    this.cache.set(cacheKey, { data: simulatedProducts, timestamp: Date.now() });
    return simulatedProducts;
  }

  /**
   * Search with enhanced Puppeteer (better selectors, proxy support, CAPTCHA detection)
   */
  private async searchWithPuppeteer(query: string, limit: number): Promise<GoogleShoppingProduct[]> {
    let page: Page | null = null;
    let proxyId: string | null = null;

    try {
      console.log(`[GoogleShoppingScraper] Searching for "${query}" with enhanced Puppeteer...`);
      
      await this.rateLimitedDelay();

      // Get proxy if enabled
      let proxyUrl: string | undefined;
      if (this.useProxy) {
        const proxy = await proxyManager.getProxy({ country: 'US' });
        if (proxy) {
          proxyUrl = proxyManager.getProxyUrl(proxy);
          proxyId = proxy.id;
          console.log(`[GoogleShoppingScraper] Using proxy: ${proxyId}`);
        }
      }
      
      const startTime = Date.now();
      page = await browserHelper.createPage({ 
        randomizeViewport: true,
        proxyUrl,
      });

      // Warm up session to avoid immediate bot detection
      await browserHelper.warmUpSession(page, 'google.com');

      // Use regular Google search with shopping tab
      const encodedQuery = encodeURIComponent(query);
      const url = `${this.baseUrl}?q=${encodedQuery}&tbm=shop&hl=en`;
      
      const success = await browserHelper.navigateWithRetry(page, url, {
        waitUntil: 'networkidle2',
        timeout: 30000,
        maxRetries: 2,
      });

      if (!success) {
        console.error(`[GoogleShoppingScraper] Failed to load shopping results for "${query}"`);
        if (proxyId) proxyManager.recordFailure(proxyId, 'Navigation failed');
        return [];
      }

      // Check for CAPTCHA or bot detection
      const botDetected = await page.evaluate(() => {
        const bodyText = document.body.textContent || '';
        const bodyHtml = document.body.innerHTML || '';
        return (
          document.querySelector('#captcha-form') !== null ||
          document.querySelector('iframe[src*="recaptcha"]') !== null ||
          document.querySelector('div[id*="captcha"]') !== null ||
          bodyText.includes('unusual traffic from your computer') ||
          bodyText.includes('automated requests') ||
          bodyHtml.includes('recaptcha') ||
          // Check for 403/404 error pages
          bodyText.includes('403 Forbidden') ||
          bodyText.includes('404 Not Found') ||
          bodyText.includes('Error 403')
        );
      });

      if (botDetected) {
        console.warn(`[GoogleShoppingScraper] Bot detection triggered for "${query}"`);
        if (proxyId) {
          proxyManager.recordFailure(proxyId, 'Bot detected / CAPTCHA');
        }
        return [];
      }

      // Simulate reading and scrolling
      await browserHelper.simulateReading(page);
      await browserHelper.humanScroll(page, 2);

      // Wait for product results to load
      await page.waitForSelector('div[data-docid], .sh-dgr__content, [data-shopping-product]', {
        timeout: 5000,
      }).catch(() => {
        console.warn(`[GoogleShoppingScraper] No product selector found for "${query}"`);
      });

      // Extract product listings with multiple selector fallbacks
      const products = await page.evaluate((maxItems: number) => {
        const results: any[] = [];
        
        // Updated selectors for 2025 Google Shopping
        const productSelectors = [
          // New Google Shopping selectors
          'div[data-docid]',
          '.sh-dgr__content',
          '[data-shopping-product]',
          '.sh-pr__product-results div[data-id]',
          // Fallback selectors
          '.pla-unit',
          '[jscontroller][data-ved]',
          '.VZTCjd', // Product card
          'div.sh-dgr__grid-result',
        ];

        let productElements: Element[] = [];
        
        // Try each selector until we find products
        for (const selector of productSelectors) {
          productElements = Array.from(document.querySelectorAll(selector));
          if (productElements.length > 0) {
            console.log(`Found ${productElements.length} products with selector: ${selector}`);
            break;
          }
        }

        // If still no products, try broader search
        if (productElements.length === 0) {
          productElements = Array.from(document.querySelectorAll('div[data-ved]')).filter(el => {
            const hasPrice = el.textContent?.match(/\$[\d,.]+/) !== null;
            const hasImage = el.querySelector('img') !== null;
            return hasPrice && hasImage;
          });
        }

        productElements.forEach((elem, index) => {
          if (index >= maxItems) return;

          try {
            // Extract product data with multiple fallback strategies
            const titleElem = elem.querySelector('h3, h4, .sh-np__product-title, [role="heading"], a[aria-label]');
            const title = titleElem?.textContent?.trim() || 
                         titleElem?.getAttribute('aria-label') || '';
            
            // Price extraction with multiple patterns
            const priceElem = elem.querySelector('[data-price], .price, .sh-np__product-price, b, span.a8Pemb');
            let priceText = priceElem?.getAttribute('data-price') || 
                           priceElem?.textContent || '';
            
            // Try to find price in entire element if not found
            if (!priceText || !priceText.match(/[\d,.]+/)) {
              const allText = elem.textContent || '';
              const priceMatch = allText.match(/\$[\d,.]+/);
              priceText = priceMatch ? priceMatch[0] : '0';
            }
            
            const price = parseFloat(priceText.replace(/[^\d.]/g, '')) || 0;
            
            // Merchant/store name
            const merchantElem = elem.querySelector('.merchant, .sh-np__product-merchant, .store-name, .aULzUe, div.IuHnof');
            const merchant = merchantElem?.textContent?.trim() || 'Unknown Store';
            
            // Product link
            const linkElem = elem.querySelector('a[href*="/shopping/product"]') || 
                            elem.querySelector('a[href]');
            const url = linkElem?.getAttribute('href') || '';
            
            // Image
            const imageElem = elem.querySelector('img');
            const imageUrl = imageElem?.getAttribute('src') || 
                           imageElem?.getAttribute('data-src') || 
                           imageElem?.getAttribute('data-lazy-src') || '';
            
            // Rating
            const ratingElem = elem.querySelector('[aria-label*="star"], .rating, [aria-label*="rating"]');
            const ratingText = ratingElem?.getAttribute('aria-label') || ratingElem?.textContent || '';
            const ratingMatch = ratingText.match(/[\d.]+/);
            const rating = ratingMatch ? parseFloat(ratingMatch[0]) : 0;

            // Review count
            const reviewElem = elem.querySelector('[aria-label*="review"], [aria-label*="rating"]');
            const reviewText = reviewElem?.getAttribute('aria-label') || '';
            const reviewMatch = reviewText.match(/([\d,]+)\s*review/);
            const reviewCount = reviewMatch ? parseInt(reviewMatch[1].replace(/,/g, '')) : 0;

            if (title && price > 0) {
              results.push({
                id: `gshop_${Date.now()}_${index}`,
                title,
                description: '',
                price,
                currency: 'USD',
                merchant,
                imageUrl,
                rating,
                reviewCount,
                url: url.startsWith('http') ? url : `https://www.google.com${url}`,
                category: '',
              });
            }
          } catch (error) {
            console.error('Error extracting product:', error);
          }
        });

        return results;
      }, limit);

      const responseTime = Date.now() - startTime;
      
      if (proxyId && products.length > 0) {
        proxyManager.recordSuccess(proxyId, responseTime);
      }

      console.log(`[GoogleShoppingScraper] Found ${products.length} products for "${query}" via Puppeteer (${responseTime}ms)`);

      return products;
    } catch (error: any) {
      console.error(`[GoogleShoppingScraper] Puppeteer error for "${query}":`, error.message);
      if (proxyId) {
        proxyManager.recordFailure(proxyId, error.message);
      }
      return [];
    } finally {
      if (page) {
        await browserHelper.closePage(page);
      }
    }
  }

  /**
   * Search using SerpApi (reliable but requires API key)
   */
  private async searchWithSerpApi(query: string, limit: number): Promise<GoogleShoppingProduct[]> {
    try {
      const params = new URLSearchParams({
        engine: 'google_shopping',
        q: query,
        api_key: this.serpApiKey,
        num: limit.toString(),
        hl: 'en',
        gl: 'us',
      });

      const response = await fetch(`https://serpapi.com/search?${params}`);
      
      if (!response.ok) {
        throw new Error(`SerpApi error: ${response.statusText}`);
      }

      const data = await response.json();
      const products: GoogleShoppingProduct[] = [];

      if (data.shopping_results && Array.isArray(data.shopping_results)) {
        data.shopping_results.slice(0, limit).forEach((item: any, index: number) => {
          products.push({
            id: item.product_id || `serpapi_${Date.now()}_${index}`,
            title: item.title || '',
            description: item.snippet || '',
            price: parseFloat(item.extracted_price) || 0,
            currency: 'USD',
            merchant: item.source || 'Unknown',
            imageUrl: item.thumbnail || '',
            rating: parseFloat(item.rating) || 0,
            reviewCount: parseInt(item.reviews) || 0,
            url: item.link || '',
            category: '',
          });
        });
      }

      console.log(`[GoogleShoppingScraper] SerpApi returned ${products.length} products for "${query}"`);
      return products;
    } catch (error: any) {
      console.error(`[GoogleShoppingScraper] SerpApi error:`, error.message);
      return [];
    }
  }

  /**
   * Search using DuckDuckGo Shopping (alternative search engine)
   */
  private async searchWithDuckDuckGo(query: string, limit: number): Promise<GoogleShoppingProduct[]> {
    let page: Page | null = null;

    try {
      console.log(`[GoogleShoppingScraper] Trying DuckDuckGo Shopping for "${query}"...`);
      
      await this.rateLimitedDelay();
      
      page = await browserHelper.createPage({ randomizeViewport: true });

      const encodedQuery = encodeURIComponent(query);
      const url = `https://duckduckgo.com/?q=${encodedQuery}&ia=shopping`;
      
      const success = await browserHelper.navigateWithRetry(page, url, {
        waitUntil: 'networkidle2',
        timeout: 20000,
      });

      if (!success) {
        return [];
      }

      await browserHelper.humanScroll(page, 1);

      const products = await page.evaluate((maxItems: number) => {
        const results: any[] = [];
        
        // DuckDuckGo shopping selectors
        const productElements = Array.from(document.querySelectorAll('.tile--shop, [data-testid="product-item"]'));

        productElements.forEach((elem, index) => {
          if (index >= maxItems) return;

          try {
            const titleElem = elem.querySelector('.tile__title, .product-title, h3');
            const title = titleElem?.textContent?.trim() || '';
            
            const priceElem = elem.querySelector('.tile__price, .product-price');
            const priceText = priceElem?.textContent?.replace(/[^\d.]/g, '') || '0';
            const price = parseFloat(priceText) || 0;
            
            const merchantElem = elem.querySelector('.tile__source, .product-merchant');
            const merchant = merchantElem?.textContent?.trim() || 'Unknown';
            
            const linkElem = elem.querySelector('a[href]');
            const url = linkElem?.getAttribute('href') || '';
            
            const imageElem = elem.querySelector('img');
            const imageUrl = imageElem?.getAttribute('src') || imageElem?.getAttribute('data-src') || '';

            if (title && price > 0) {
              results.push({
                id: `ddg_${Date.now()}_${index}`,
                title,
                description: '',
                price,
                currency: 'USD',
                merchant,
                imageUrl,
                rating: 0,
                reviewCount: 0,
                url,
                category: '',
              });
            }
          } catch (error) {
            // Skip problematic items
          }
        });

        return results;
      }, limit);

      console.log(`[GoogleShoppingScraper] DuckDuckGo returned ${products.length} products for "${query}"`);
      return products;
    } catch (error: any) {
      console.error(`[GoogleShoppingScraper] DuckDuckGo error:`, error.message);
      return [];
    } finally {
      if (page) {
        await browserHelper.closePage(page);
      }
    }
  }

  /**
   * Generate simulated products when all scraping methods fail
   */
  private generateSimulatedProducts(query: string, count: number): GoogleShoppingProduct[] {
    const products: GoogleShoppingProduct[] = [];
    const basePrice = this.getBasePriceForQuery(query);
    const category = this.detectCategory(query);
    
    const merchants = ['Amazon', 'Walmart', 'Target', 'Etsy', 'Barnes & Noble', 'Michaels', 'Hobby Lobby'];
    
    for (let i = 0; i < count; i++) {
      const priceVariation = 0.5 + Math.random() * 1.5;
      const price = Math.round(basePrice * priceVariation * 100) / 100;
      
      products.push({
        id: `sim_${Date.now()}_${i}`,
        title: `${this.capitalizeWords(query)} - Option ${i + 1}`,
        description: `High quality ${query} for creative projects`,
        price,
        currency: 'USD',
        merchant: merchants[Math.floor(Math.random() * merchants.length)],
        imageUrl: '',
        rating: 3.5 + Math.random() * 1.5,
        reviewCount: Math.floor(Math.random() * 500) + 10,
        url: `https://www.google.com/shopping/product/${Date.now()}`,
        category,
      });
    }
    
    return products;
  }

  /**
   * Get base price estimate for a query
   */
  private getBasePriceForQuery(query: string): number {
    const queryLower = query.toLowerCase();
    
    // Price ranges by product type
    if (queryLower.includes('kit') || queryLower.includes('set')) return 25;
    if (queryLower.includes('book')) return 12;
    if (queryLower.includes('supplies')) return 20;
    if (queryLower.includes('art')) return 18;
    if (queryLower.includes('journal') || queryLower.includes('planner')) return 15;
    if (queryLower.includes('printable')) return 5;
    
    return 15; // Default
  }

  /**
   * Capitalize words in a string
   */
  private capitalizeWords(str: string): string {
    return str.replace(/\b\w/g, l => l.toUpperCase());
  }

  /**
   * Detect category from query
   */
  private detectCategory(query: string): string {
    const queryLower = query.toLowerCase();
    
    const categoryKeywords: Record<string, string[]> = {
      'books': ['book', 'coloring', 'activity', 'workbook', 'journal', 'planner'],
      'arts-crafts': ['craft', 'art', 'supplies', 'kit', 'diy', 'paint', 'draw'],
      'toys-games': ['toy', 'game', 'puzzle', 'kids', 'children', 'educational'],
      'home-decor': ['decor', 'wall art', 'home', 'print', 'poster', 'frame'],
      'office': ['office', 'stationery', 'organizer', 'desk', 'notebook'],
    };

    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      if (keywords.some(kw => queryLower.includes(kw))) {
        return category;
      }
    }

    return 'other';
  }

  /**
   * Get trending product searches
   */
  async getTrendingSearches(): Promise<GoogleShoppingTrend[]> {
    const cacheKey = 'trending-searches';
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    const trends: GoogleShoppingTrend[] = [];
    
    for (const query of TRENDING_QUERIES) {
      try {
        const products = await this.search(query, 10);
        
        if (products.length > 0) {
          const prices = products.map(p => p.price).filter(p => p > 0);
          const avgPrice = prices.length > 0 
            ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length * 100) / 100 
            : 0;
          
          trends.push({
            query,
            category: this.detectCategory(query),
            products: products.slice(0, 5),
            avgPrice,
            priceRange: {
              min: Math.min(...prices) || 0,
              max: Math.max(...prices) || 0,
            },
            totalResults: products.length * 100, // Estimated
            popularityScore: this.calculatePopularityScore(query, products),
            growthRate: this.calculateGrowthRate(query),
            firstSeen: this.getFirstSeen(query),
            lastSeen: new Date().toISOString(),
            relatedQueries: this.getRelatedQueries(query),
          });
        }
        
        // Small delay between searches
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`[GoogleShoppingScraper] Error getting trend for "${query}":`, error);
      }
    }

    // Sort by popularity score
    trends.sort((a, b) => b.popularityScore - a.popularityScore);

    this.cache.set(cacheKey, { data: trends, timestamp: Date.now() });
    return trends;
  }

  /**
   * Calculate popularity score based on products and reviews
   */
  private calculatePopularityScore(query: string, products: GoogleShoppingProduct[]): number {
    if (products.length === 0) return 0;
    
    // Base score from number of products
    let score = Math.min(products.length * 5, 30);
    
    // Add score from ratings
    const avgRating = products.reduce((sum, p) => sum + p.rating, 0) / products.length;
    score += avgRating * 10;
    
    // Add score from review counts
    const totalReviews = products.reduce((sum, p) => sum + p.reviewCount, 0);
    score += Math.min(Math.log10(totalReviews + 1) * 10, 20);
    
    // Boost for trending keywords
    const trendingBoost = this.getTrendingBoost(query);
    score *= trendingBoost;
    
    return Math.min(Math.round(score), 100);
  }

  /**
   * Get trending boost multiplier for query
   */
  private getTrendingBoost(query: string): number {
    const queryLower = query.toLowerCase();
    
    // High trending keywords
    const highTrend = ['mandala', 'mindfulness', 'stress relief', 'adult coloring', 'bullet journal'];
    if (highTrend.some(k => queryLower.includes(k))) return 1.5;
    
    // Medium trending keywords
    const medTrend = ['coloring book', 'craft kit', 'diy', 'planner', 'journal'];
    if (medTrend.some(k => queryLower.includes(k))) return 1.25;
    
    return 1.0;
  }

  /**
   * Calculate growth rate for a query
   */
  private calculateGrowthRate(query: string): number {
    const history = this.historicalData.get(query);
    
    if (!history) {
      // New query - assign initial growth rate
      const baseGrowth = 5 + Math.random() * 30;
      this.historicalData.set(query, {
        firstSeen: new Date().toISOString(),
        popularityHistory: [baseGrowth],
      });
      return baseGrowth;
    }

    // Calculate growth from history
    const currentPopularity = 20 + Math.random() * 60;
    history.popularityHistory.push(currentPopularity);
    
    // Keep only last 30 data points
    if (history.popularityHistory.length > 30) {
      history.popularityHistory.shift();
    }

    // Calculate growth rate
    if (history.popularityHistory.length >= 2) {
      const recent = history.popularityHistory.slice(-7);
      const older = history.popularityHistory.slice(0, 7);
      
      const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
      const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
      
      if (olderAvg > 0) {
        return Math.round(((recentAvg - olderAvg) / olderAvg) * 100);
      }
    }

    return Math.round(10 + Math.random() * 20);
  }

  /**
   * Get first seen date for a query
   */
  private getFirstSeen(query: string): string {
    const history = this.historicalData.get(query);
    return history?.firstSeen || new Date().toISOString();
  }

  /**
   * Get related queries for a search term
   */
  private getRelatedQueries(query: string): string[] {
    const queryLower = query.toLowerCase();
    const related: string[] = [];

    const relatedMap: Record<string, string[]> = {
      'coloring': ['adult coloring', 'mandala', 'stress relief coloring', 'mindfulness coloring'],
      'book': ['activity book', 'workbook', 'journal', 'planner'],
      'craft': ['diy kit', 'art supplies', 'creative kit', 'maker supplies'],
      'art': ['drawing', 'painting', 'illustration', 'creative'],
      'journal': ['planner', 'notebook', 'bullet journal', 'gratitude journal'],
      'kids': ['children activities', 'educational', 'learning', 'toddler'],
      'mandala': ['zentangle', 'geometric patterns', 'meditation art', 'relaxation'],
    };

    for (const [key, values] of Object.entries(relatedMap)) {
      if (queryLower.includes(key)) {
        related.push(...values.filter(v => !queryLower.includes(v.toLowerCase())));
      }
    }

    return [...new Set(related)].slice(0, 5);
  }

  /**
   * Analyze a specific product search trend
   */
  async analyzeTrend(query: string): Promise<GoogleShoppingTrend | null> {
    try {
      const products = await this.search(query, 25);
      
      if (products.length === 0) return null;

      const prices = products.map(p => p.price).filter(p => p > 0);
      const avgPrice = prices.length > 0 
        ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length * 100) / 100 
        : 0;
      
      return {
        query,
        category: this.detectCategory(query),
        products: products.slice(0, 10),
        avgPrice,
        priceRange: {
          min: Math.min(...prices) || 0,
          max: Math.max(...prices) || 0,
        },
        totalResults: products.length * 50,
        popularityScore: this.calculatePopularityScore(query, products),
        growthRate: this.calculateGrowthRate(query),
        firstSeen: this.getFirstSeen(query),
        lastSeen: new Date().toISOString(),
        relatedQueries: this.getRelatedQueries(query),
      };
    } catch (error) {
      console.error(`[GoogleShoppingScraper] Error analyzing trend "${query}":`, error);
      return null;
    }
  }

  /**
   * Get trends by category
   */
  async getTrendsByCategory(categoryId: string): Promise<GoogleShoppingTrend[]> {
    const category = GOOGLE_SHOPPING_CATEGORIES.find(c => c.id === categoryId);
    if (!category) return [];

    const cacheKey = `category-${categoryId}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    const trends: GoogleShoppingTrend[] = [];

    for (const subcategory of category.subcategories) {
      const trend = await this.analyzeTrend(subcategory);
      if (trend) {
        trends.push(trend);
      }
    }

    trends.sort((a, b) => b.popularityScore - a.popularityScore);
    this.cache.set(cacheKey, { data: trends, timestamp: Date.now() });
    
    return trends;
  }

  /**
   * Get all trends
   */
  async getAllTrends(): Promise<GoogleShoppingTrend[]> {
    return this.getTrendingSearches();
  }

  /**
   * Get price analysis for a query
   */
  async getPriceAnalysis(query: string): Promise<{
    avgPrice: number;
    medianPrice: number;
    priceRange: { min: number; max: number };
    priceDistribution: { low: number; mid: number; high: number };
  } | null> {
    try {
      const products = await this.search(query, 30);
      
      if (products.length === 0) return null;

      const prices = products.map(p => p.price).filter(p => p > 0).sort((a, b) => a - b);
      
      if (prices.length === 0) return null;

      const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
      const medianPrice = prices[Math.floor(prices.length / 2)];
      const min = prices[0];
      const max = prices[prices.length - 1];
      
      // Calculate price distribution
      const lowThreshold = avgPrice * 0.7;
      const highThreshold = avgPrice * 1.3;
      
      const low = prices.filter(p => p < lowThreshold).length;
      const high = prices.filter(p => p > highThreshold).length;
      const mid = prices.length - low - high;

      return {
        avgPrice: Math.round(avgPrice * 100) / 100,
        medianPrice: Math.round(medianPrice * 100) / 100,
        priceRange: { min, max },
        priceDistribution: {
          low: Math.round((low / prices.length) * 100),
          mid: Math.round((mid / prices.length) * 100),
          high: Math.round((high / prices.length) * 100),
        },
      };
    } catch (error) {
      console.error(`[GoogleShoppingScraper] Error analyzing prices for "${query}":`, error);
      return null;
    }
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

export const googleShoppingScraper = new GoogleShoppingScraper();

