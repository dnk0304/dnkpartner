/**
 * Etsy Trending Scraper - Enhanced v2
 * Multi-layer approach with session persistence and API fallback
 * Layer 1: Session-based Puppeteer scraping with warm-up
 * Layer 2: Etsy Open API (optional, requires API key)
 * Layer 3: Third-party aggregators (eRank, Marmalead concepts)
 * 45-second delays for realistic human browsing patterns
 */

import { browserHelper } from './browserHelper.js';
import { proxyManager } from './proxyManager.js';
import { SCRAPING_LIMITS } from './scrapingConfig.js';
import { adaptiveRateLimiter } from './adaptiveRateLimiter.js';
import type { Page } from 'puppeteer';

export interface EtsyTrend {
  query: string;
  category: string;
  listingCount: number;
  popularityScore: number;
  priceRange: { min: number; max: number };
  topListings: EtsyListing[];
  firstDetected: string;
  lastUpdated: string;
}

export interface EtsyListing {
  id: string;
  title: string;
  price: number;
  currency: string;
  shopName: string;
  url: string;
  imageUrl: string;
  reviewCount: number;
  rating: number;
  isBestseller: boolean;
  tags: string[];
}

export interface EtsyCategory {
  id: string;
  name: string;
  trendingSearches: string[];
  itemCount: number;
}

// Popular Etsy categories relevant to KDP and crafts
const ETSY_CATEGORIES = [
  { id: 'paper-goods', name: 'Paper & Party Supplies', path: '/c/paper-and-party-supplies' },
  { id: 'art-collectibles', name: 'Art & Collectibles', path: '/c/art-and-collectibles' },
  { id: 'craft-supplies', name: 'Craft Supplies', path: '/c/craft-supplies-and-tools' },
  { id: 'books-movies', name: 'Books, Movies & Music', path: '/c/books-movies-and-music' },
  { id: 'home-living', name: 'Home & Living', path: '/c/home-and-living' },
  { id: 'toys-games', name: 'Toys & Games', path: '/c/toys-and-games' },
  { id: 'wedding', name: 'Weddings', path: '/c/weddings' },
];

class EtsyScraper {
  private baseUrl = 'https://www.etsy.com';
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private cacheTTL = 24 * 60 * 60 * 1000; // 24 hours (was 12) - longer cache to reduce scraping frequency
  private rateLimitDelay = 45000; // 45 seconds (realistic human browsing)
  private lastRequestTime = 0;
  private sessionId = 'etsy-main-session'; // Persistent session ID
  private useProxy = false; // Enable if proxies available
  private useEtsyApi = !!process.env.ETSY_API_KEY; // Enable if API key provided
  private etsyApiKey = process.env.ETSY_API_KEY || '';
  private failureCount = 0;
  private maxFailuresBeforeFallback = 2;

  /**
   * Rate-limited delay with randomization
   */
  private async rateLimitedDelay(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.rateLimitDelay) {
      const waitTime = this.rateLimitDelay - timeSinceLastRequest;
      console.log(`[EtsyScraper] Waiting ${Math.round(waitTime / 1000)}s before next request...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    // Add random 0-5 second variation to make it more human-like
    const randomDelay = Math.floor(Math.random() * 5000);
    await new Promise(resolve => setTimeout(resolve, randomDelay));
    
    this.lastRequestTime = Date.now();
  }

  /**
   * Search Etsy for a query with multi-layer fallback
   */
  async search(query: string, options?: { limit?: number; category?: string }): Promise<EtsyListing[]> {
    const { limit = SCRAPING_LIMITS.TOP_PRODUCTS_PER_PLATFORM, category } = options || {};
    const cacheKey = `search-${query}-${category || 'all'}-${limit}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      console.log(`[EtsyScraper] Using cached search results for "${query}"`);
      return cached.data;
    }

    // Layer 1: Try session-based Puppeteer scraping
    if (this.failureCount < this.maxFailuresBeforeFallback) {
      const scrapedResults = await this.searchWithPuppeteer(query, options);
      if (scrapedResults.length > 0) {
        this.failureCount = 0; // Reset on success
        this.cache.set(cacheKey, { data: scrapedResults, timestamp: Date.now() });
        return scrapedResults;
      }
      this.failureCount++;
      console.log(`[EtsyScraper] Puppeteer failed (${this.failureCount}/${this.maxFailuresBeforeFallback})`);
    }

    // Layer 2: Try Etsy Open API if available
    if (this.useEtsyApi) {
      console.log(`[EtsyScraper] Trying Etsy API for "${query}"...`);
      const apiResults = await this.searchWithApi(query, options);
      if (apiResults.length > 0) {
        this.failureCount = 0;
        this.cache.set(cacheKey, { data: apiResults, timestamp: Date.now() });
        return apiResults;
      }
    }

    // Layer 3: Return empty array (scheduler will handle fallback data)
    console.warn(`[EtsyScraper] All layers failed for "${query}"`);
    return [];
  }

  /**
   * Search with session-based Puppeteer (warm-up + persistent cookies)
   */
  private async searchWithPuppeteer(query: string, options?: { limit?: number; category?: string }): Promise<EtsyListing[]> {
    const { limit = SCRAPING_LIMITS.TOP_PRODUCTS_PER_PLATFORM, category } = options || {};
    let page: Page | null = null;
    let proxyId: string | null = null;

    try {
      console.log(`[EtsyScraper] Searching for "${query}" with session-based Puppeteer...`);
      
      await this.rateLimitedDelay();

      // Get proxy if enabled
      let proxyUrl: string | undefined;
      if (this.useProxy) {
        const proxy = await proxyManager.getProxy({ country: 'US' });
        if (proxy) {
          proxyUrl = proxyManager.getProxyUrl(proxy);
          proxyId = proxy.id;
          console.log(`[EtsyScraper] Using proxy: ${proxyId}`);
        }
      }

      const startTime = Date.now();
      
      // Apply adaptive rate limiting before creating page
      await adaptiveRateLimiter.waitForDomain('etsy.com');
      
      page = await browserHelper.createPage({ 
        randomizeViewport: true,
        sessionId: this.sessionId, // Load persistent session
        proxyUrl,
      });

      // Warm up session on first request or if session is cold
      const needsWarmup = !this.cache.has('session-warmed-up');
      if (needsWarmup) {
        await browserHelper.warmUpSession(page, 'etsy.com');
        this.cache.set('session-warmed-up', { data: true, timestamp: Date.now() });
      }

      // Build search URL
      const params = new URLSearchParams({
        q: query,
        ref: 'search_bar',
      });
      
      if (category) {
        params.append('explicit', '1');
        params.append('category', category);
      }

      const searchUrl = `${this.baseUrl}/search?${params}`;
      
      const success = await browserHelper.navigateWithRetry(page, searchUrl, {
        waitUntil: 'networkidle2',
        timeout: 45000,
        maxRetries: 2,
      });

      if (!success) {
        console.error(`[EtsyScraper] Failed to search for "${query}"`);
        if (proxyId) proxyManager.recordFailure(proxyId, 'Navigation failed');
        adaptiveRateLimiter.onFailure('etsy.com');
        return [];
      }

      // Save session after successful navigation
      await browserHelper.saveSession(page, this.sessionId);

      // Check for CAPTCHA or bot detection
      const hasCaptcha = await page.evaluate(() => {
        const bodyText = document.body.textContent || '';
        const bodyHtml = document.body.innerHTML || '';
        return (
          document.querySelector('[data-recaptcha]') !== null ||
          document.querySelector('iframe[src*="captcha"]') !== null ||
          document.querySelector('.g-recaptcha') !== null ||
          document.querySelector('[data-cf-challenge]') !== null || // Cloudflare
          bodyText.includes('verify you are human') ||
          bodyText.includes('security check') ||
          bodyText.includes('unusual traffic') ||
          bodyText.includes('Access denied') ||
          bodyHtml.includes('cf-challenge') ||
          bodyHtml.includes('captcha')
        );
      });

      if (hasCaptcha) {
        console.warn(`[EtsyScraper] CAPTCHA/Cloudflare detected for "${query}", skipping...`);
        if (proxyId) proxyManager.recordFailure(proxyId, 'CAPTCHA/Cloudflare');
        adaptiveRateLimiter.onRateLimit('etsy.com'); // Treat CAPTCHA as rate limit
        return [];
      }

      // Validate that we have actual search results (not error page)
      const hasValidContent = await page.evaluate(() => {
        const listingSelectors = [
          '[data-search-results] [data-listing-id]',
          '.wt-grid__item-xs-6',
          '.v2-listing-card',
          '[data-palette-listing-id]',
          'div[data-appears-component-name*="listing"]',
        ];
        
        for (const selector of listingSelectors) {
          if (document.querySelectorAll(selector).length > 0) {
            return true;
          }
        }
        
        return false;
      });

      if (!hasValidContent) {
        console.warn(`[EtsyScraper] No valid content found for "${query}", page may have been blocked`);
        if (proxyId) proxyManager.recordFailure(proxyId, 'No valid content');
        adaptiveRateLimiter.onRateLimit('etsy.com'); // Treat block as rate limit
        return [];
      }

      // Human-like reading and scrolling
      await browserHelper.simulateReading(page);
      await browserHelper.humanScroll(page, 3);

      // Extract listings from the page with updated selectors
      const listings = await page.evaluate((maxItems: number) => {
        const results: any[] = [];
        
        // Updated Etsy selectors for 2025
        const listingSelectors = [
          '[data-search-results] [data-listing-id]',
          '.wt-grid__item-xs-6',
          '.v2-listing-card',
          '[data-palette-listing-id]',
          'div[data-appears-component-name*="listing_card"]',
          'li[data-palette-listing-id]',
        ];

        let listingElements: Element[] = [];
        for (const selector of listingSelectors) {
          listingElements = Array.from(document.querySelectorAll(selector));
          if (listingElements.length > 0) {
            console.log(`Found ${listingElements.length} listings with selector: ${selector}`);
            break;
          }
        }

        listingElements.forEach((elem, index) => {
          if (index >= maxItems) return;

          try {
            // Extract listing data with multiple fallbacks
            const listingId = elem.getAttribute('data-listing-id') || 
                            elem.getAttribute('data-palette-listing-id') || 
                            `listing-${index}`;
            
            const titleElem = elem.querySelector('[data-title], h3, .v2-listing-card__title, .wt-text-body-01');
            const title = titleElem?.textContent?.trim() || 
                         titleElem?.getAttribute('data-title') || '';
            
            // Price extraction with multiple strategies
            const priceElem = elem.querySelector('[data-currency-value], .currency-value, .n-listing-card__price, span.currency-symbol');
            let priceText = priceElem?.getAttribute('data-currency-value') || '';
            
            if (!priceText) {
              // Try to find price in text content
              const priceContainer = elem.querySelector('.n-listing-card__price, [class*="price"]');
              priceText = priceContainer?.textContent?.replace(/[^\d.]/g, '') || '0';
            }
            
            const price = parseFloat(priceText) || 0;
            
            const currencyElem = elem.querySelector('[data-currency-symbol], .currency-symbol');
            const currency = currencyElem?.getAttribute('data-currency-symbol') || 
                           currencyElem?.textContent?.trim() || 
                           'USD';
            
            const shopNameElem = elem.querySelector('[data-shop-name], .v2-listing-card__shop, p.wt-text-caption');
            const shopName = shopNameElem?.getAttribute('data-shop-name') || 
                           shopNameElem?.textContent?.trim() || 
                           '';
            
            const linkElem = elem.querySelector('a[href*="/listing/"]');
            const url = linkElem?.getAttribute('href') || '';
            
            const imageElem = elem.querySelector('img');
            const imageUrl = imageElem?.getAttribute('src') || 
                           imageElem?.getAttribute('data-src') || 
                           imageElem?.getAttribute('data-listing-card-listing-image') || '';
            
            const reviewElem = elem.querySelector('[data-review-count], .wt-text-caption, [aria-label*="star"]');
            const reviewText = reviewElem?.getAttribute('data-review-count') || 
                             reviewElem?.textContent?.trim() || '';
            const reviewCount = parseInt(reviewText.replace(/\D/g, '')) || 0;
            
            const ratingElem = elem.querySelector('[data-rating], [aria-label*="star"]');
            let rating = 0;
            if (ratingElem) {
              const ratingText = ratingElem.getAttribute('data-rating') || 
                               ratingElem.getAttribute('aria-label') || '';
              const ratingMatch = ratingText.match(/[\d.]+/);
              rating = ratingMatch ? parseFloat(ratingMatch[0]) : 0;
            }
            
            const isBestseller = elem.querySelector('.badge-bestseller, [data-bestseller], [aria-label*="Bestseller"]') !== null ||
                               elem.textContent?.toLowerCase().includes('bestseller') || false;

            if (title && listingId) {
              results.push({
                id: listingId,
                title,
                price,
                currency,
                shopName,
                url: url.startsWith('http') ? url : `https://www.etsy.com${url}`,
                imageUrl: imageUrl.replace(/\/il_\d+x\d+\./, '/il_340x270.'), // Standardize image size
                reviewCount,
                rating,
                isBestseller,
                tags: [],
              });
            }
          } catch (error) {
            console.error('Error extracting listing:', error);
          }
        });

        return results;
      }, limit);

      const responseTime = Date.now() - startTime;

      if (proxyId && listings.length > 0) {
        proxyManager.recordSuccess(proxyId, responseTime);
      }
      
      // Record success in adaptive rate limiter
      if (listings.length > 0) {
        adaptiveRateLimiter.onSuccess('etsy.com');
      }

      // Save session after successful scrape
      await browserHelper.saveSession(page, this.sessionId);

      console.log(`[EtsyScraper] Found ${listings.length} listings for "${query}" (${responseTime}ms)`);

      return listings;
    } catch (error: any) {
      console.error(`[EtsyScraper] Error searching for "${query}":`, error.message);
      if (proxyId) {
        proxyManager.recordFailure(proxyId, error.message);
      }
      adaptiveRateLimiter.onFailure('etsy.com');
      return [];
    } finally {
      if (page) {
        await browserHelper.closePage(page);
      }
    }
  }

  /**
   * Search using Etsy Open API (requires API key)
   */
  private async searchWithApi(query: string, options?: { limit?: number; category?: string }): Promise<EtsyListing[]> {
    const { limit = SCRAPING_LIMITS.TOP_PRODUCTS_PER_PLATFORM } = options || {};

    try {
      // Etsy Open API v3 endpoint
      const params = new URLSearchParams({
        keywords: query,
        limit: limit.toString(),
        includes: 'Images,Shop',
      });

      const response = await fetch(`https://openapi.etsy.com/v3/application/listings/active?${params}`, {
        headers: {
          'x-api-key': this.etsyApiKey,
        },
      });

      if (!response.ok) {
        throw new Error(`Etsy API error: ${response.statusText}`);
      }

      const data = await response.json();
      const listings: EtsyListing[] = [];

      if (data.results && Array.isArray(data.results)) {
        data.results.forEach((item: any) => {
          const image = item.images?.[0];
          listings.push({
            id: item.listing_id?.toString() || '',
            title: item.title || '',
            price: parseFloat(item.price?.amount) / 100 || 0, // Price in cents
            currency: item.price?.currency_code || 'USD',
            shopName: item.shop?.shop_name || '',
            url: item.url || '',
            imageUrl: image?.url_340x270 || image?.url_570xN || '',
            reviewCount: item.num_favorers || 0,
            rating: 0, // Not available in API v3
            isBestseller: false,
            tags: item.tags || [],
          });
        });
      }

      console.log(`[EtsyScraper] Etsy API returned ${listings.length} listings for "${query}"`);
      return listings;
    } catch (error: any) {
      console.error(`[EtsyScraper] Etsy API error:`, error.message);
      return [];
    }
  }

  /**
   * Get trending searches from Etsy's explore page
   */
  async getTrendingSearches(): Promise<string[]> {
    const cacheKey = 'trending-searches';
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      console.log('[EtsyScraper] Using cached trending searches');
      return cached.data;
    }

    let page: Page | null = null;

    try {
      console.log('[EtsyScraper] Fetching trending searches with Puppeteer...');
      
      await this.rateLimitedDelay();
      
      page = await browserHelper.createPage({ randomizeViewport: true });
      
      // Try multiple URLs to find trending data
      const urls = [
        `${this.baseUrl}/trending`,
        `${this.baseUrl}`,
        `${this.baseUrl}/featured/trending-items`,
      ];

      let trendingSearches: string[] = [];
      
      for (const url of urls) {
        const success = await browserHelper.navigateWithRetry(page, url, {
          waitUntil: 'networkidle2',
          timeout: 45000,
        });

        if (!success) continue;

        // Check for CAPTCHA
        const hasCaptcha = await page.evaluate(() => {
          const bodyText = document.body.textContent || '';
          return (
            document.querySelector('[data-recaptcha]') !== null ||
            document.querySelector('iframe[src*="captcha"]') !== null ||
            bodyText.includes('verify you are human') ||
            bodyText.includes('security check')
          );
        });

        if (hasCaptcha) {
          console.warn('[EtsyScraper] CAPTCHA detected on trending page, skipping URL...');
          continue;
        }

        // Scroll to trigger lazy loading
        await browserHelper.humanScroll(page, 3);

        // Extract trending terms
        const searches = await page.evaluate(() => {
          const trends: string[] = [];
          
          // Look for various trending elements
          const selectors = [
            '[data-trending-query]',
            '.trending-search-item',
            '[data-search-query]',
            'a[href*="/search?q="]',
            '[data-search-input]',
            '.wt-tag',
          ];

          selectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(elem => {
              const query = elem.textContent?.trim() || 
                          elem.getAttribute('data-trending-query') || 
                          elem.getAttribute('data-search-query');
              
              if (query && query.length > 2 && query.length < 50) {
                trends.push(query);
              }
            });
          });

          // Extract from search links
          document.querySelectorAll('a[href*="/search?q="]').forEach(link => {
            const href = link.getAttribute('href');
            if (href) {
              const match = href.match(/[?&]q=([^&]+)/);
              if (match && match[1]) {
                const query = decodeURIComponent(match[1].replace(/\+/g, ' '));
                if (query.length > 2 && query.length < 50) {
                  trends.push(query);
                }
              }
            }
          });

          // Remove duplicates
          return [...new Set(trends)];
        });

        trendingSearches = [...trendingSearches, ...searches];
        
        if (trendingSearches.length >= 20) break;
      }

      // Remove duplicates
      trendingSearches = [...new Set(trendingSearches)];

      console.log(`[EtsyScraper] Found ${trendingSearches.length} trending searches`);

      const result = trendingSearches.slice(0, 50);
      this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
      
      return result;
    } catch (error: any) {
      console.error('[EtsyScraper] Error fetching trending searches:', error.message);
      return [];
    } finally {
      if (page) {
        await browserHelper.closePage(page);
      }
    }
  }

  /**
   * Get trending items by category
   */
  async getTrendingByCategory(categoryPath?: string): Promise<EtsyCategory[]> {
    const categories = categoryPath 
      ? ETSY_CATEGORIES.filter(c => c.path === categoryPath)
      : ETSY_CATEGORIES;

    const results: EtsyCategory[] = [];
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
          console.error(`[EtsyScraper] Failed to load category ${category.name}`);
          continue;
        }

        await browserHelper.humanScroll(page, 2);

        const trendingSearches = await page.evaluate(() => {
          const searches: string[] = [];
          
          document.querySelectorAll('[data-trending-search], .trending-term, [data-category-trending]').forEach(elem => {
            const search = elem.textContent?.trim();
            if (search && search.length > 2) {
              searches.push(search);
            }
          });

          return searches.slice(0, 10);
        });

        // Estimate item count from results text
        const itemCount = await page.evaluate(() => {
          const resultsText = document.querySelector('.search-results-count, [data-results-count]')?.textContent || '';
          const match = resultsText.match(/[\d,]+/);
          return match ? parseInt(match[0].replace(/,/g, '')) : 0;
        });

        const categoryData: EtsyCategory = {
          id: category.id,
          name: category.name,
          trendingSearches,
          itemCount,
        };

        this.cache.set(cacheKey, { data: categoryData, timestamp: Date.now() });
        results.push(categoryData);
        
        await browserHelper.closePage(page);
        page = null;
      } catch (error: any) {
        console.error(`[EtsyScraper] Error fetching category ${category.name}:`, error.message);
        if (page) {
          await browserHelper.closePage(page);
          page = null;
        }
      }
    }

    return results;
  }

  /**
   * Analyze search volume and popularity for a query
   */
  async analyzeTrend(query: string): Promise<EtsyTrend | null> {
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
      const priceRange = {
        min: Math.min(...prices),
        max: Math.max(...prices),
      };

      const avgReviews = listings.reduce((sum, l) => sum + l.reviewCount, 0) / listings.length;
      const bestsellersCount = listings.filter(l => l.isBestseller).length;

      // Popularity score based on multiple factors
      const popularityScore = Math.min(100, Math.round(
        (avgReviews / 100) * 30 + // Reviews contribute 30%
        (bestsellersCount / listings.length) * 40 + // Bestseller ratio 40%
        (listings.length / 48) * 30 // Result density 30%
      ));

      // Determine category from listings
      const category = this.detectCategory(query, listings);

      const trend: EtsyTrend = {
        query,
        category,
        listingCount: listings.length,
        popularityScore,
        priceRange,
        topListings: listings.slice(0, 10),
        firstDetected: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
      };

      this.cache.set(cacheKey, { data: trend, timestamp: Date.now() });
      return trend;
    } catch (error: any) {
      console.error(`[EtsyScraper] Error analyzing trend "${query}":`, error.message);
      return null;
    }
  }

  /**
   * Get multiple trending topics with full analysis
   */
  async getAllTrends(): Promise<EtsyTrend[]> {
    const trendingSearches = await this.getTrendingSearches();
    const trends: EtsyTrend[] = [];

    // Analyze top trending searches
    console.log(`[EtsyScraper] Analyzing ${Math.min(SCRAPING_LIMITS.TOP_TRENDING_KEYWORDS, trendingSearches.length)} trending searches...`);
    
    for (const query of trendingSearches.slice(0, SCRAPING_LIMITS.TOP_TRENDING_KEYWORDS)) {
      try {
        const trend = await this.analyzeTrend(query);
        if (trend && trend.popularityScore > 30) {
          trends.push(trend);
        }
      } catch (error: any) {
        console.error(`[EtsyScraper] Error analyzing "${query}":`, error.message);
      }
    }

    return trends.sort((a, b) => b.popularityScore - a.popularityScore);
  }

  /**
   * Detect category from query and listings
   */
  private detectCategory(query: string, listings: EtsyListing[]): string {
    const queryLower = query.toLowerCase();
    
    // Category keywords
    const categoryKeywords: Record<string, string[]> = {
      'books': ['book', 'journal', 'planner', 'notebook', 'diary'],
      'art': ['art', 'print', 'poster', 'painting', 'illustration', 'drawing'],
      'home': ['home', 'decor', 'wall', 'living', 'room', 'house'],
      'paper': ['paper', 'card', 'sticker', 'stationery', 'invitation'],
      'craft': ['craft', 'diy', 'handmade', 'supplies', 'material'],
      'toys': ['toy', 'game', 'play', 'kids', 'children'],
      'wedding': ['wedding', 'bride', 'groom', 'marriage', 'ceremony'],
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

export const etsyScraper = new EtsyScraper();
export { ETSY_CATEGORIES };
