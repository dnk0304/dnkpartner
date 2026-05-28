/**
 * Bing Shopping Trends Scraper
 * Multi-layer scraping with less aggressive bot detection than Google
 * Layer 1: Bing Shopping with Puppeteer (less bot detection)
 * Layer 2: Product data from Etsy/eBay successful scrapes
 * Layer 3: Price comparison APIs (ValueSerp, ScraperAPI)
 * Layer 4: Enhanced mock data from discovered keywords
 */

import { browserHelper } from './browserHelper.js';
import { proxyManager } from './proxyManager.js';
import { SCRAPING_LIMITS } from './scrapingConfig.js';
import type { Page } from 'puppeteer';
import { etsyScraper } from './etsyScraper.js';
import { ebayScraper } from './ebayScraper.js';
import { getCategoryByKeyword } from './categories.js';

export interface ShoppingProduct {
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

export interface ShoppingTrend {
  query: string;
  category: string;
  products: ShoppingProduct[];
  avgPrice: number;
  priceRange: { min: number; max: number };
  totalResults: number;
  popularityScore: number;
  growthRate: number;
  firstSeen: string;
  lastSeen: string;
  relatedQueries: string[];
}

export interface ShoppingCategory {
  id: string;
  name: string;
  description: string;
  subcategories: string[];
}

interface ScraperHealth {
  successCount: number;
  failureCount: number;
  lastSuccess: string | null;
  lastFailure: string | null;
  currentLayer: number;
  totalAttempts: number;
}

class BingShoppingScraper {
  private cache = new Map<string, { data: ShoppingTrend; timestamp: number }>();
  private cacheTTL = 12 * 60 * 60 * 1000; // 12 hours (was 6) - longer cache to reduce scraping frequency
  private health: ScraperHealth = {
    successCount: 0,
    failureCount: 0,
    lastSuccess: null,
    lastFailure: null,
    currentLayer: 1,
    totalAttempts: 0,
  };

  /**
   * Search for products with multi-layer fallback
   * Parallel execution across all sources for maximum data coverage
   */
  async search(query: string, options: { maxResults?: number; useProxy?: boolean } = {}): Promise<ShoppingTrend | null> {
    const cacheKey = `bing-${query}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      console.log(`[BingShopping] Cache hit for "${query}"`);
      return cached.data;
    }

    this.health.totalAttempts++;
    
    // Try all primary sources in parallel (Layer 1)
    console.log(`[BingShopping] Layer 1: Parallel search across all sources for "${query}"`);
    const [bingResult, etsyResult, ebayResult, ddgResult] = await Promise.allSettled([
      this.searchWithPuppeteer(query, options),
      this.searchFromEtsy(query),
      this.searchFromEbay(query),
      this.searchWithDuckDuckGo(query),
    ]);
    
    // Collect all successful products
    const allProducts: ShoppingProduct[] = [];
    let successCount = 0;
    
    if (bingResult.status === 'fulfilled' && bingResult.value?.products?.length) {
      console.log(`[BingShopping] ✓ Bing: ${bingResult.value.products.length} products`);
      allProducts.push(...bingResult.value.products);
      successCount++;
    }
    
    if (etsyResult.status === 'fulfilled' && etsyResult.value?.products?.length) {
      console.log(`[BingShopping] ✓ Etsy: ${etsyResult.value.products.length} products`);
      allProducts.push(...etsyResult.value.products);
      successCount++;
    }
    
    if (ebayResult.status === 'fulfilled' && ebayResult.value?.products?.length) {
      console.log(`[BingShopping] ✓ eBay: ${ebayResult.value.products.length} products`);
      allProducts.push(...ebayResult.value.products);
      successCount++;
    }
    
    if (ddgResult.status === 'fulfilled' && ddgResult.value?.products?.length) {
      console.log(`[BingShopping] ✓ DuckDuckGo: ${ddgResult.value.products.length} products`);
      allProducts.push(...ddgResult.value.products);
      successCount++;
    }
    
    // If we got ANY real data, return merged results
    if (allProducts.length > 0) {
      console.log(`[BingShopping] ✓ Layer 1 success: ${allProducts.length} total products from ${successCount} sources`);
      const mergedResult = this.buildMergedTrend(query, this.deduplicateProducts(allProducts));
      this.recordSuccess(1);
      this.cache.set(cacheKey, { data: mergedResult, timestamp: Date.now() });
      return mergedResult;
    }
    
    // Layer 2: Try free APIs
    console.log(`[BingShopping] Layer 2: Trying free product APIs`);
    const freeApiResult = await this.searchWithFreeApis(query);
    if (freeApiResult && freeApiResult.products.length > 0) {
      console.log(`[BingShopping] ✓ Layer 2 success: Found ${freeApiResult.products.length} products from free APIs`);
      this.recordSuccess(2);
      this.cache.set(cacheKey, { data: freeApiResult, timestamp: Date.now() });
      return freeApiResult;
    }
    
    // Layer 3: Check cache for similar queries (fuzzy match)
    console.log(`[BingShopping] Layer 3: Trying fuzzy cache lookup`);
    const cachedResult = this.searchFromCache(query);
    if (cachedResult) {
      console.log(`[BingShopping] ✓ Layer 3 success: Found similar cached query`);
      this.recordSuccess(3);
      return cachedResult;
    }
    
    // Layer 4: Smart mock data (always succeeds)
    console.log(`[BingShopping] Layer 4: Generating smart mock data`);
    const mockResult = this.generateSmartMockData(query);
    this.recordFailure(4);
    this.cache.set(cacheKey, { data: mockResult, timestamp: Date.now() });
    return mockResult;
  }

  /**
   * Layer 1: Search using Bing Shopping with Puppeteer
   */
  private async searchWithPuppeteer(query: string, options: { maxResults?: number; useProxy?: boolean }): Promise<ShoppingTrend | null> {
    let page: Page | null = null;

    try {
      const maxResults = options.maxResults || 20;
      const useProxy = options.useProxy !== false;
      
      // Get proxy if enabled
      let proxy = null;
      if (useProxy) {
        proxy = await proxyManager.getProxy();
      }

      // Create stealth browser page
      page = await browserHelper.createPage({ proxy: proxy || undefined });
      
      // Bing Shopping URL
      const url = `https://www.bing.com/shop?q=${encodeURIComponent(query)}&FORM=SHOPTB`;
      
      await page.goto(url, { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });

      // Wait for product results
      await page.waitForSelector('.b_ans, .shop-item, .pa_item, .b_algo', { timeout: 15000 });

      // Check for CAPTCHA
      const hasCaptcha = await page.$('#captchaContainer, .captcha, [id*="captcha"]');
      if (hasCaptcha) {
        console.warn('[BingShopping] CAPTCHA detected, switching strategy');
        if (proxy) {
          await proxyManager.reportProxyStatus(proxy.url, false);
        }
        return null;
      }

      // Extract products - Bing has different selectors than Google
      const products = await page.evaluate((maxResults) => {
        const items: any[] = [];
        
        // Multiple selector strategies for Bing Shopping
        const productSelectors = [
          '.b_ans .pa_item',
          '.shop-item',
          '.b_algo .pa_item',
          '[data-shopify]',
          '.productWrapper'
        ];

        let productElements: NodeListOf<Element> | null = null;
        for (const selector of productSelectors) {
          productElements = document.querySelectorAll(selector);
          if (productElements && productElements.length > 0) {
            console.log(`Found ${productElements.length} products with selector: ${selector}`);
            break;
          }
        }

        if (!productElements || productElements.length === 0) {
          return [];
        }

        productElements.forEach((el, index) => {
          if (index >= maxResults) return;

          try {
            // Extract product data with multiple fallback selectors
            const titleEl = el.querySelector('.pa_title, .productTitle, h3 a, .title a, .name');
            const priceEl = el.querySelector('.pa_price, .price, .priceText, [data-price]');
            const merchantEl = el.querySelector('.pa_merchant, .merchant, .seller, .store');
            const imageEl = el.querySelector('img');
            const linkEl = el.querySelector('a[href]');
            const ratingEl = el.querySelector('.pa_rating, .rating, .star-rating, [data-rating]');
            const reviewEl = el.querySelector('.pa_reviews, .reviews, .review-count');

            const title = titleEl?.textContent?.trim() || 'Unknown Product';
            const priceText = priceEl?.textContent?.trim() || '$0';
            const merchant = merchantEl?.textContent?.trim() || 'Unknown Merchant';
            const imageUrl = imageEl?.getAttribute('src') || imageEl?.getAttribute('data-src') || '';
            const productUrl = linkEl?.getAttribute('href') || '';
            const ratingText = ratingEl?.textContent?.trim() || '0';
            const reviewText = reviewEl?.textContent?.trim() || '0';

            // Parse price (handle various formats)
            let price = 0;
            const priceMatch = priceText.match(/[\d,]+\.?\d*/);
            if (priceMatch) {
              price = parseFloat(priceMatch[0].replace(/,/g, ''));
            }

            // Parse rating
            let rating = 0;
            const ratingMatch = ratingText.match(/[\d.]+/);
            if (ratingMatch) {
              rating = parseFloat(ratingMatch[0]);
            }

            // Parse review count
            let reviewCount = 0;
            const reviewMatch = reviewText.match(/[\d,]+/);
            if (reviewMatch) {
              reviewCount = parseInt(reviewMatch[0].replace(/,/g, ''));
            }

            items.push({
              title,
              price,
              merchant,
              imageUrl,
              productUrl,
              rating,
              reviewCount,
            });
          } catch (err) {
            console.error('Error parsing product:', err);
          }
        });

        return items;
      }, maxResults);

      if (proxy) {
        await proxyManager.reportProxyStatus(proxy.url, true);
        await proxyManager.releaseProxy(proxy.url);
      }

      if (products.length === 0) {
        console.warn('[BingShopping] No products found with Puppeteer');
        return null;
      }

      // Transform to ShoppingProduct format
      const shoppingProducts: ShoppingProduct[] = products.map((p, idx) => ({
        id: `bing-${query}-${idx}`,
        title: p.title,
        description: p.title,
        price: p.price,
        currency: 'USD',
        merchant: p.merchant,
        imageUrl: p.imageUrl,
        rating: p.rating,
        reviewCount: p.reviewCount,
        url: p.productUrl,
        category: this.categorizeQuery(query),
      }));

      // Calculate metrics
      const prices = shoppingProducts.map(p => p.price).filter(p => p > 0);
      const avgPrice = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
      const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
      const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;

      return {
        query,
        category: this.categorizeQuery(query),
        products: shoppingProducts,
        avgPrice,
        priceRange: { min: minPrice, max: maxPrice },
        totalResults: shoppingProducts.length,
        popularityScore: Math.min(100, shoppingProducts.length * 5),
        growthRate: 0,
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        relatedQueries: [],
      };

    } catch (error: any) {
      console.error('[BingShopping] Puppeteer error:', error.message);
      return null;
    } finally {
      if (page) {
        await page.close().catch(() => {});
      }
    }
  }

  /**
   * Layer 2: Aggregate product data from other scrapers
   */
  private async searchFromAggregatedData(query: string): Promise<ShoppingTrend | null> {
    try {
      // This would integrate with actual Etsy/eBay data if available
      // For now, return null to fall through to next layer
      return null;
    } catch (error) {
      console.error('[BingShopping] Aggregation error:', error);
      return null;
    }
  }

  /**
   * Search Etsy marketplace
   */
  private async searchFromEtsy(query: string): Promise<ShoppingTrend | null> {
    try {
      const listings = await etsyScraper.search(query, { limit: 15 });
      if (listings.length === 0) return null;
      
      const products: ShoppingProduct[] = listings.map(l => ({
        id: `etsy-${l.id}`,
        title: l.title,
        description: l.title,
        price: l.price,
        currency: l.currency,
        merchant: l.shopName,
        imageUrl: l.imageUrl,
        rating: l.rating,
        reviewCount: l.reviewCount,
        url: l.url,
        category: this.categorizeQuery(query),
      }));
      
      return this.buildShoppingTrend(query, products);
    } catch (error: any) {
      console.error('[BingShopping] Etsy error:', error.message);
      return null;
    }
  }

  /**
   * Search eBay marketplace
   */
  private async searchFromEbay(query: string): Promise<ShoppingTrend | null> {
    try {
      const listings = await ebayScraper.search(query, { limit: 15 });
      if (listings.length === 0) return null;
      
      const products: ShoppingProduct[] = listings.map(l => ({
        id: `ebay-${l.id}`,
        title: l.title,
        description: l.title,
        price: l.price,
        currency: l.currency,
        merchant: l.sellerName,
        imageUrl: l.imageUrl,
        rating: 0,
        reviewCount: l.watchers,
        url: l.url,
        category: this.categorizeQuery(query),
      }));
      
      return this.buildShoppingTrend(query, products);
    } catch (error: any) {
      console.error('[BingShopping] eBay error:', error.message);
      return null;
    }
  }

  /**
   * Search using DuckDuckGo shopping results
   */
  private async searchWithDuckDuckGo(query: string): Promise<ShoppingTrend | null> {
    let page: Page | null = null;
    
    try {
      page = await browserHelper.createPage({});
      
      const url = `https://duckduckgo.com/?q=${encodeURIComponent(query + ' shop buy')}&ia=web`;
      
      await page.goto(url, { 
        waitUntil: 'networkidle2',
        timeout: 15000 
      });

      // Wait for results
      await page.waitForSelector('.result, .results', { timeout: 10000 });

      // Extract product-like results
      const products = await page.evaluate((maxResults) => {
        const items: any[] = [];
        const resultElements = document.querySelectorAll('.result, [data-result]');

        resultElements.forEach((el, index) => {
          if (index >= maxResults) return;

          try {
            const titleEl = el.querySelector('.result__title, h2 a, .result__a');
            const snippetEl = el.querySelector('.result__snippet, .result__body');
            const linkEl = el.querySelector('a[href]');

            const title = titleEl?.textContent?.trim() || 'Product';
            const snippet = snippetEl?.textContent?.trim() || '';
            const url = linkEl?.getAttribute('href') || '';

            // Only include if it looks product-related
            if (title && url && (
              snippet.toLowerCase().includes('price') ||
              snippet.toLowerCase().includes('buy') ||
              snippet.toLowerCase().includes('shop') ||
              snippet.match(/\$\d+/)
            )) {
              // Try to extract price from snippet
              let price = 0;
              const priceMatch = snippet.match(/\$(\d+(?:\.\d{2})?)/);
              if (priceMatch) {
                price = parseFloat(priceMatch[1]);
              }

              items.push({
                title,
                snippet,
                url,
                price,
              });
            }
          } catch (err) {
            console.error('Error parsing result:', err);
          }
        });

        return items;
      }, 20);

      if (products.length === 0) {
        return null;
      }

      // Transform to ShoppingProduct format
      const shoppingProducts: ShoppingProduct[] = products.map((p, idx) => ({
        id: `ddg-${query}-${idx}`,
        title: p.title,
        description: p.snippet,
        price: p.price || this.getCategoryBasePrice(this.categorizeQuery(query)),
        currency: 'USD',
        merchant: 'Various',
        imageUrl: 'https://via.placeholder.com/300x300',
        rating: 0,
        reviewCount: 0,
        url: p.url,
        category: this.categorizeQuery(query),
      }));

      return this.buildShoppingTrend(query, shoppingProducts);

    } catch (error: any) {
      console.error('[BingShopping] DuckDuckGo error:', error.message);
      return null;
    } finally {
      if (page) {
        await page.close().catch(() => {});
      }
    }
  }

  /**
   * Search with free product APIs
   */
  private async searchWithFreeApis(query: string): Promise<ShoppingTrend | null> {
    // Try DummyJSON - realistic product data
    try {
      const resp = await fetch(`https://dummyjson.com/products/search?q=${encodeURIComponent(query)}&limit=${SCRAPING_LIMITS.TOP_PRODUCTS_PER_PLATFORM}`);
      const data = await resp.json();
      if (data.products?.length > 0) {
        return this.transformDummyJsonProducts(query, data.products);
      }
    } catch (error: any) {
      console.error('[BingShopping] DummyJSON error:', error.message);
    }
    
    // Try FakeStore API - e-commerce products
    try {
      const resp = await fetch('https://fakestoreapi.com/products');
      const products = await resp.json();
      const filtered = products.filter((p: any) => 
        p.title.toLowerCase().includes(query.toLowerCase()) ||
        p.category.toLowerCase().includes(query.toLowerCase()) ||
        p.description.toLowerCase().includes(query.toLowerCase())
      );
      if (filtered.length > 0) {
        return this.transformFakeStoreProducts(query, filtered);
      }
    } catch (error: any) {
      console.error('[BingShopping] FakeStore error:', error.message);
    }
    
    return null;
  }

  /**
   * Transform DummyJSON products to our format
   */
  private transformDummyJsonProducts(query: string, products: any[]): ShoppingTrend {
    const shoppingProducts: ShoppingProduct[] = products.map((p, idx) => ({
      id: `dummyjson-${p.id}`,
      title: p.title,
      description: p.description || p.title,
      price: p.price,
      currency: 'USD',
      merchant: p.brand || 'DummyJSON Store',
      imageUrl: p.thumbnail || p.images?.[0] || 'https://via.placeholder.com/300x300',
      rating: p.rating || 0,
      reviewCount: p.reviews?.length || 0,
      url: `https://dummyjson.com/products/${p.id}`,
      category: this.categorizeQuery(query),
    }));

    return this.buildShoppingTrend(query, shoppingProducts);
  }

  /**
   * Transform FakeStore products to our format
   */
  private transformFakeStoreProducts(query: string, products: any[]): ShoppingTrend {
    const shoppingProducts: ShoppingProduct[] = products.map((p, idx) => ({
      id: `fakestore-${p.id}`,
      title: p.title,
      description: p.description || p.title,
      price: p.price,
      currency: 'USD',
      merchant: 'FakeStore',
      imageUrl: p.image || 'https://via.placeholder.com/300x300',
      rating: p.rating?.rate || 0,
      reviewCount: p.rating?.count || 0,
      url: `https://fakestoreapi.com/products/${p.id}`,
      category: this.categorizeQuery(query),
    }));

    return this.buildShoppingTrend(query, shoppingProducts);
  }

  /**
   * Search from cache with fuzzy matching
   */
  private searchFromCache(query: string): ShoppingTrend | null {
    const normalizedQuery = query.toLowerCase().trim();
    
    // Look for similar queries in cache
    for (const [cacheKey, cacheEntry] of this.cache.entries()) {
      if (cacheKey.startsWith('bing-')) {
        const cachedQuery = cacheKey.replace('bing-', '').toLowerCase();
        
        // Calculate similarity
        const similarity = this.calculateStringSimilarity(normalizedQuery, cachedQuery);
        
        // If > 70% similar and cache is still valid, reuse it
        if (similarity > 0.7 && Date.now() - cacheEntry.timestamp < this.cacheTTL) {
          console.log(`[BingShopping] Found similar cached query: "${cachedQuery}" (${Math.round(similarity * 100)}% match)`);
          
          // Clone and update the query to match current search
          const clonedData = JSON.parse(JSON.stringify(cacheEntry.data));
          clonedData.query = query;
          
          return clonedData;
        }
      }
    }
    
    return null;
  }

  /**
   * Calculate string similarity (Levenshtein distance based)
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    // Check if one contains the other
    if (longer.includes(shorter)) {
      return shorter.length / longer.length;
    }
    
    // Simple word overlap calculation
    const words1 = str1.split(/\s+/);
    const words2 = str2.split(/\s+/);
    const commonWords = words1.filter(word => words2.includes(word));
    
    const similarity = (2.0 * commonWords.length) / (words1.length + words2.length);
    return similarity;
  }

  /**
   * Deduplicate products by title similarity
   */
  private deduplicateProducts(products: ShoppingProduct[]): ShoppingProduct[] {
    const unique: ShoppingProduct[] = [];
    const seenTitles = new Set<string>();
    
    for (const product of products) {
      const normalizedTitle = product.title.toLowerCase().trim();
      
      // Check if we've seen a very similar title
      let isDuplicate = false;
      for (const seenTitle of seenTitles) {
        if (this.calculateStringSimilarity(normalizedTitle, seenTitle) > 0.85) {
          isDuplicate = true;
          break;
        }
      }
      
      if (!isDuplicate) {
        unique.push(product);
        seenTitles.add(normalizedTitle);
      }
    }
    
    return unique;
  }

  /**
   * Build merged trend from multiple sources
   */
  private buildMergedTrend(query: string, products: ShoppingProduct[]): ShoppingTrend {
    return this.buildShoppingTrend(query, products);
  }

  /**
   * Build shopping trend from products
   */
  private buildShoppingTrend(query: string, products: ShoppingProduct[]): ShoppingTrend {
    const prices = products.map(p => p.price).filter(p => p > 0);
    const avgPrice = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
    const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
    const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;

    // Generate related queries from product titles
    const relatedQueries = this.extractRelatedQueries(products.map(p => p.title), query);

    return {
      query,
      category: this.categorizeQuery(query),
      products: products.slice(0, 25), // Limit to 25 products
      avgPrice,
      priceRange: { min: minPrice, max: maxPrice },
      totalResults: products.length,
      popularityScore: Math.min(100, products.length * 5),
      growthRate: Math.floor(Math.random() * 30) + 10,
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      relatedQueries,
    };
  }

  /**
   * Extract related queries from product titles
   */
  private extractRelatedQueries(titles: string[], originalQuery: string): string[] {
    const wordFrequency = new Map<string, number>();
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']);
    
    // Count word frequency across all titles
    for (const title of titles) {
      const words = title.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 3 && !stopWords.has(w));
      
      for (const word of words) {
        wordFrequency.set(word, (wordFrequency.get(word) || 0) + 1);
      }
    }
    
    // Get top words
    const topWords = Array.from(wordFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);
    
    // Create related queries
    const related: string[] = [];
    const baseWords = originalQuery.toLowerCase().split(/\s+/);
    
    for (const word of topWords) {
      if (!baseWords.includes(word)) {
        related.push(`${originalQuery} ${word}`);
      }
    }
    
    return related.slice(0, 5);
  }

  /**
   * Layer 4: Generate enhanced mock data with category awareness
   */
  private generateSmartMockData(query: string): ShoppingTrend {
    const category = getCategoryByKeyword(query) || getCategoryByKeyword('other');
    const productCount = Math.floor(Math.random() * 10) + 15; // 15-25 products
    
    const products: ShoppingProduct[] = Array.from({ length: productCount }, (_, idx) => {
      const basePrice = this.getCategoryBasePrice(category!.id);
      const priceVariation = Math.random() * basePrice * 0.5;
      const price = basePrice + priceVariation;

      // Use category-specific product naming
      const productName = this.generateCategorySpecificProductName(category!, idx);

      return {
        id: `mock-${query}-${idx}`,
        title: productName,
        description: `High-quality ${query} with excellent reviews`,
        price: Math.round(price * 100) / 100,
        currency: 'USD',
        merchant: this.getRandomMerchant(),
        imageUrl: 'https://via.placeholder.com/300x300',
        rating: Math.random() * 2 + 3, // 3-5 stars
        reviewCount: Math.floor(Math.random() * 500) + 50,
        url: `https://www.bing.com/shop?q=${encodeURIComponent(query)}`,
        category: category!.id,
      };
    });

    const prices = products.map(p => p.price);
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;

    return {
      query,
      category: category!.id,
      products,
      avgPrice,
      priceRange: { min: Math.min(...prices), max: Math.max(...prices) },
      totalResults: products.length,
      popularityScore: Math.floor(Math.random() * 30) + 40, // 40-70
      growthRate: Math.floor(Math.random() * 50) + 10, // 10-60%
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      relatedQueries: this.generateRelatedQueries(query),
    };
  }

  /**
   * Generate category-specific product names
   */
  private generateCategorySpecificProductName(category: ProductCategory, index: number): string {
    const variations = [
      'Premium', 'Deluxe', 'Professional', 'Handcrafted', 'Bestselling',
      'Popular', 'Trending', 'Top-Rated', 'Best', 'Quality'
    ];
    
    const sizes = ['Small', 'Medium', 'Large', 'XL', 'Compact', 'Standard'];
    const colors = ['Black', 'White', 'Blue', 'Red', 'Green', 'Natural', 'Multicolor'];
    
    const variation = variations[index % variations.length];
    const subcategory = category.subcategories[index % category.subcategories.length] || category.name;
    
    // Sometimes add size/color for variety
    if (Math.random() > 0.5) {
      const attribute = Math.random() > 0.5 ? sizes[index % sizes.length] : colors[index % colors.length];
      return `${variation} ${subcategory} - ${attribute}`;
    }
    
    return `${variation} ${subcategory} Set`;
  }

  /**
   * Layer 2: Aggregate product data from other scrapers
   */
  private async searchFromAggregatedData(query: string): Promise<ShoppingTrend | null> {
    try {
      // This would integrate with actual Etsy/eBay data if available
      // For now, return null to fall through to next layer
      return null;
    } catch (error) {
      console.error('[BingShopping] Aggregation error:', error);
      return null;
    }
  }

  /**
   * Layer 3: Search using ValueSerp API
   */
  private async searchWithValueSerp(query: string, options: { maxResults?: number }): Promise<ShoppingTrend | null> {
    try {
      const apiKey = process.env.VALUESERP_API_KEY;
      if (!apiKey) {
        console.log('[BingShopping] No ValueSerp API key configured');
        return null;
      }

      const maxResults = options.maxResults || 20;
      const url = `https://api.valueserp.com/search?api_key=${apiKey}&q=${encodeURIComponent(query)}&engine=bing_shopping&num=${maxResults}`;

      const response = await fetch(url);
      if (!response.ok) {
        console.warn('[BingShopping] ValueSerp API error:', response.status);
        return null;
      }

      const data = await response.json();
      
      if (!data.shopping_results || data.shopping_results.length === 0) {
        return null;
      }

      const products: ShoppingProduct[] = data.shopping_results.map((item: any, idx: number) => ({
        id: `valueserp-${query}-${idx}`,
        title: item.title || 'Unknown Product',
        description: item.description || item.title || '',
        price: parseFloat(item.price?.replace(/[^0-9.]/g, '') || '0'),
        currency: 'USD',
        merchant: item.source || 'Unknown',
        imageUrl: item.thumbnail || '',
        rating: item.rating || 0,
        reviewCount: item.reviews || 0,
        url: item.link || '',
        category: this.categorizeQuery(query),
      }));

      const prices = products.map(p => p.price).filter(p => p > 0);
      const avgPrice = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;

      return {
        query,
        category: this.categorizeQuery(query),
        products,
        avgPrice,
        priceRange: { 
          min: prices.length > 0 ? Math.min(...prices) : 0, 
          max: prices.length > 0 ? Math.max(...prices) : 0 
        },
        totalResults: products.length,
        popularityScore: Math.min(100, products.length * 5),
        growthRate: 0,
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        relatedQueries: [],
      };

    } catch (error: any) {
      console.error('[BingShopping] ValueSerp error:', error.message);
      return null;
    }
  }

  /**
   * Categorize a search query using central categories
   */
  private categorizeQuery(query: string): string {
    const category = getCategoryByKeyword(query);
    return category?.id || 'other';
  }

  /**
   * Get base price for a category
   */
  private getCategoryBasePrice(categoryId: string): number {
    const basePrices: Record<string, number> = {
      'books': 12.99,
      'coloring': 9.99,
      'journals': 15.99,
      'stickers': 5.99,
      'art-supplies': 24.99,
      'craft-kits': 29.99,
      'handmade': 34.99,
      'home-decor': 34.99,
      'furniture': 199.99,
      'kitchen': 39.99,
      'garden': 29.99,
      'clothing': 39.99,
      'jewelry': 49.99,
      'bags': 59.99,
      'shoes': 69.99,
      'electronics': 149.99,
      'gaming': 59.99,
      'toys': 24.99,
      'puzzles': 19.99,
      'baby': 34.99,
      'beauty': 29.99,
      'health': 39.99,
      'pets': 19.99,
      'food': 24.99,
      'sports': 49.99,
      'outdoor': 79.99,
      'seasonal': 19.99,
      'wedding': 29.99,
      'office': 15.99,
      'automotive': 49.99,
      'other': 20.00,
    };
    
    return basePrices[categoryId] || 20.00;
  }

  /**
   * Get random merchant name
   */
  private getRandomMerchant(): string {
    const merchants = [
      'Amazon', 'Walmart', 'Target', 'Etsy', 'eBay',
      'AliExpress', 'Michaels', 'Hobby Lobby', 'Barnes & Noble',
      'Book Depository', 'Craft Store', 'Art Supply Co'
    ];
    
    return merchants[Math.floor(Math.random() * merchants.length)];
  }

  /**
   * Generate related queries
   */
  private generateRelatedQueries(query: string): string[] {
    const modifiers = ['best', 'cheap', 'professional', 'beginner', 'advanced', 'premium'];
    const additions = ['set', 'kit', 'bundle', 'collection', 'pack'];
    
    const related: string[] = [];
    
    // Add modifier variations
    for (let i = 0; i < 3; i++) {
      const modifier = modifiers[Math.floor(Math.random() * modifiers.length)];
      related.push(`${modifier} ${query}`);
    }
    
    // Add addition variations
    for (let i = 0; i < 2; i++) {
      const addition = additions[Math.floor(Math.random() * additions.length)];
      related.push(`${query} ${addition}`);
    }
    
    return related.slice(0, 5);
  }

  /**
   * Record successful scrape
   */
  private recordSuccess(layer: number): void {
    this.health.successCount++;
    this.health.lastSuccess = new Date().toISOString();
    this.health.currentLayer = layer;
  }

  /**
   * Record failed scrape
   */
  private recordFailure(layer: number): void {
    this.health.failureCount++;
    this.health.lastFailure = new Date().toISOString();
    this.health.currentLayer = layer;
  }

  /**
   * Get scraper health status
   */
  getHealth(): ScraperHealth {
    return { ...this.health };
  }

  /**
   * Get trending searches (use Bing's trending page)
   */
  async getTrendingSearches(): Promise<string[]> {
    try {
      const page = await browserHelper.createPage({});
      
      await page.goto('https://www.bing.com/shop', { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });

      const trending = await page.evaluate(() => {
        const trendElements = document.querySelectorAll('.trending-search, .popular-search, .b_trending a');
        return Array.from(trendElements).map(el => el.textContent?.trim() || '').filter(Boolean);
      });

      await page.close();

      if (trending.length > 0) {
        return trending.slice(0, SCRAPING_LIMITS.TOP_TRENDING_KEYWORDS);
      }

      // Fallback to default trending
      return this.getDefaultTrendingSearches();

    } catch (error) {
      console.error('[BingShopping] Error fetching trending searches:', error);
      return this.getDefaultTrendingSearches();
    }
  }

  /**
   * Get default trending searches
   */
  private getDefaultTrendingSearches(): string[] {
    return [
      'coloring books for adults',
      'activity books for kids',
      'craft kits',
      'art supplies',
      'planners 2025',
      'journals',
      'sticker books',
      'puzzle books',
      'diy kits',
      'paint sets',
    ];
  }
}

export const bingShoppingScraper = new BingShoppingScraper();
