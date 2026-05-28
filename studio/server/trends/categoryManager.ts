/**
 * Category Manager
 * Manages category-based scraping across multiple platforms
 * Provides intelligent category-to-keyword mapping
 */

import { SCRAPING_LIMITS, CATEGORY_TIERS } from './scrapingConfig.js';
import { etsyScraper, type EtsyListing } from './etsyScraper.js';
import { ebayScraper, type EbayListing } from './ebayScraper.js';
import { googleShoppingScraper, type GoogleShoppingProduct } from './googleShoppingScraper.js';
import { bingShoppingScraper } from './bingShoppingScraper.js';
import { parallelEngine } from './parallelEngine.js';

export interface CategoryConfig {
  id: string;
  name: string;
  keywords: string[];
  platforms: Platform[];
  scrapeLimit: number;
  priority: number;
  tier: 1 | 2 | 3;
}

export type Platform = 'etsy' | 'ebay' | 'google-shopping' | 'bing-shopping';

export interface Product {
  id: string;
  title: string;
  price: number;
  currency: string;
  platform: Platform;
  category: string;
  url: string;
  imageUrl?: string;
  rating?: number;
  reviewCount?: number;
  source: string;
}

export interface CategoryScrapeResult {
  categoryId: string;
  categoryName: string;
  totalProducts: number;
  productsByPlatform: Record<Platform, number>;
  topProducts: Product[];
  trendingKeywords: string[];
  scrapedAt: string;
  success: boolean;
  errors: string[];
}

// Comprehensive category definitions
export const SCRAPING_CATEGORIES: CategoryConfig[] = [
  // Tier 1: Highest priority
  {
    id: 'coloring-books',
    name: 'Coloring Books',
    keywords: [
      'adult coloring book',
      'mandala coloring',
      'kids coloring book',
      'animal coloring book',
      'nature coloring book',
      'fantasy coloring book',
      'stress relief coloring',
    ],
    platforms: ['etsy', 'ebay', 'google-shopping', 'bing-shopping'],
    scrapeLimit: SCRAPING_LIMITS.TOP_PRODUCTS_PER_CATEGORY,
    priority: 1,
    tier: 1,
  },
  {
    id: 'activity-books',
    name: 'Activity Books',
    keywords: [
      'activity book',
      'puzzle book',
      'workbook',
      'educational activities',
      'brain games book',
    ],
    platforms: ['etsy', 'ebay', 'google-shopping'],
    scrapeLimit: SCRAPING_LIMITS.TOP_PRODUCTS_PER_CATEGORY,
    priority: 1,
    tier: 1,
  },
  {
    id: 'journals-planners',
    name: 'Journals & Planners',
    keywords: [
      'journal notebook',
      'planner 2026',
      'bullet journal',
      'gratitude journal',
      'daily planner',
      'weekly planner',
    ],
    platforms: ['etsy', 'ebay', 'google-shopping', 'bing-shopping'],
    scrapeLimit: SCRAPING_LIMITS.TOP_PRODUCTS_PER_CATEGORY,
    priority: 1,
    tier: 1,
  },
  
  // Tier 2: Medium priority
  {
    id: 'craft-kits',
    name: 'Craft Kits',
    keywords: [
      'craft kit',
      'diy craft kit',
      'craft supplies',
      'hobby kit',
      'art craft kit',
    ],
    platforms: ['etsy', 'ebay', 'google-shopping'],
    scrapeLimit: SCRAPING_LIMITS.TOP_PRODUCTS_PER_CATEGORY,
    priority: 2,
    tier: 2,
  },
  {
    id: 'art-supplies',
    name: 'Art Supplies',
    keywords: [
      'art supplies',
      'drawing set',
      'painting kit',
      'markers set',
      'colored pencils',
    ],
    platforms: ['etsy', 'ebay', 'google-shopping'],
    scrapeLimit: SCRAPING_LIMITS.TOP_PRODUCTS_PER_CATEGORY,
    priority: 2,
    tier: 2,
  },
  {
    id: 'stickers',
    name: 'Stickers & Decals',
    keywords: [
      'sticker pack',
      'planner stickers',
      'vinyl stickers',
      'decorative stickers',
    ],
    platforms: ['etsy', 'ebay', 'google-shopping'],
    scrapeLimit: SCRAPING_LIMITS.TOP_PRODUCTS_PER_CATEGORY,
    priority: 2,
    tier: 2,
  },
  {
    id: 'puzzles',
    name: 'Puzzles',
    keywords: [
      'jigsaw puzzle',
      'puzzle game',
      'brain teaser',
      '1000 piece puzzle',
    ],
    platforms: ['ebay', 'google-shopping'],
    scrapeLimit: SCRAPING_LIMITS.TOP_PRODUCTS_PER_CATEGORY,
    priority: 2,
    tier: 2,
  },
  
  // Tier 3: Lower priority
  {
    id: 'home-decor',
    name: 'Home Decor',
    keywords: [
      'wall art',
      'home decor',
      'decorative print',
      'canvas art',
    ],
    platforms: ['etsy', 'google-shopping'],
    scrapeLimit: SCRAPING_LIMITS.TOP_PRODUCTS_PER_CATEGORY,
    priority: 3,
    tier: 3,
  },
  {
    id: 'seasonal',
    name: 'Seasonal Items',
    keywords: [
      'christmas decoration',
      'halloween decor',
      'easter crafts',
      'valentines gift',
    ],
    platforms: ['etsy', 'ebay', 'google-shopping'],
    scrapeLimit: SCRAPING_LIMITS.TOP_PRODUCTS_PER_CATEGORY,
    priority: 3,
    tier: 3,
  },
  {
    id: 'gifts',
    name: 'Gifts & Novelty',
    keywords: [
      'personalized gift',
      'unique gift',
      'novelty item',
      'gift box',
    ],
    platforms: ['etsy', 'google-shopping'],
    scrapeLimit: SCRAPING_LIMITS.TOP_PRODUCTS_PER_CATEGORY,
    priority: 3,
    tier: 3,
  },
];

export class CategoryManager {
  /**
   * Get all active categories
   */
  getActiveCategories(): CategoryConfig[] {
    return SCRAPING_CATEGORIES.slice(0, SCRAPING_LIMITS.CATEGORIES_TO_SCRAPE);
  }

  /**
   * Get categories by tier
   */
  getCategoriesByTier(tier: 1 | 2 | 3): CategoryConfig[] {
    return SCRAPING_CATEGORIES.filter(cat => cat.tier === tier);
  }

  /**
   * Get category by ID
   */
  getCategoryById(id: string): CategoryConfig | null {
    return SCRAPING_CATEGORIES.find(cat => cat.id === id) || null;
  }

  /**
   * Get top products for a category across all platforms
   */
  async getTopProductsForCategory(
    categoryId: string,
    limit: number = SCRAPING_LIMITS.TOP_PRODUCTS_PER_CATEGORY
  ): Promise<Product[]> {
    const category = this.getCategoryById(categoryId);
    if (!category) {
      throw new Error(`Category not found: ${categoryId}`);
    }

    console.log(`[CategoryManager] Fetching top ${limit} products for category: ${category.name}`);

    const allProducts: Product[] = [];

    // Scrape from each platform
    for (const platform of category.platforms) {
      const platformProducts = await this.scrapeProductsFromPlatform(
        platform,
        category,
        Math.ceil(limit / category.platforms.length)
      );
      
      allProducts.push(...platformProducts);
    }

    // Sort by relevance/popularity and limit
    const topProducts = allProducts
      .sort((a, b) => (b.rating || 0) * (b.reviewCount || 1) - (a.rating || 0) * (a.reviewCount || 1))
      .slice(0, limit);

    console.log(`[CategoryManager] Found ${topProducts.length} products for ${category.name}`);

    return topProducts;
  }

  /**
   * Get trending keywords for a category
   */
  async getTrendingKeywordsForCategory(
    categoryId: string,
    limit: number = SCRAPING_LIMITS.TOP_TRENDING_KEYWORDS
  ): Promise<string[]> {
    const category = this.getCategoryById(categoryId);
    if (!category) {
      throw new Error(`Category not found: ${categoryId}`);
    }

    // Start with category keywords and expand based on scraping results
    const keywords = [...category.keywords].slice(0, limit);
    
    return keywords;
  }

  /**
   * Scrape all categories in priority order
   */
  async scrapeAllCategories(): Promise<CategoryScrapeResult[]> {
    const categories = this.getActiveCategories()
      .sort((a, b) => a.priority - b.priority);

    console.log(`[CategoryManager] Scraping ${categories.length} categories...`);

    const results: CategoryScrapeResult[] = [];

    // Use parallel engine to scrape multiple categories concurrently
    const scrapeResults = await parallelEngine.processBatch(
      categories,
      async (category) => this.scrapeCategory(category),
      {
        maxConcurrency: 3, // Scrape 3 categories at once
        batchDelay: 5000,
        retryFailedItems: true,
        maxRetries: 2,
      }
    );

    for (const result of scrapeResults) {
      if (result.success) {
        results.push(result.result);
      }
    }

    console.log(`[CategoryManager] Completed scraping ${results.length}/${categories.length} categories`);

    return results;
  }

  /**
   * Scrape a single category
   */
  private async scrapeCategory(category: CategoryConfig): Promise<CategoryScrapeResult> {
    console.log(`[CategoryManager] Scraping category: ${category.name}`);

    const result: CategoryScrapeResult = {
      categoryId: category.id,
      categoryName: category.name,
      totalProducts: 0,
      productsByPlatform: {} as Record<Platform, number>,
      topProducts: [],
      trendingKeywords: category.keywords,
      scrapedAt: new Date().toISOString(),
      success: true,
      errors: [],
    };

    try {
      const products = await this.getTopProductsForCategory(
        category.id,
        category.scrapeLimit
      );

      result.totalProducts = products.length;
      result.topProducts = products.slice(0, 20); // Top 20 for storage

      // Count products by platform
      for (const product of products) {
        result.productsByPlatform[product.platform] = 
          (result.productsByPlatform[product.platform] || 0) + 1;
      }
    } catch (error: any) {
      result.success = false;
      result.errors.push(error.message);
      console.error(`[CategoryManager] Error scraping ${category.name}:`, error);
    }

    return result;
  }

  /**
   * Scrape products from a specific platform for a category
   */
  private async scrapeProductsFromPlatform(
    platform: Platform,
    category: CategoryConfig,
    limit: number
  ): Promise<Product[]> {
    const products: Product[] = [];

    try {
      // Use first few keywords from category
      const keywordsToUse = category.keywords.slice(0, 3);

      for (const keyword of keywordsToUse) {
        let platformProducts: Product[] = [];

        switch (platform) {
          case 'etsy':
            const etsyResults = await etsyScraper.search(keyword, { 
              limit: Math.ceil(limit / keywordsToUse.length) 
            });
            platformProducts = this.convertEtsyToProduct(etsyResults, category.id);
            break;

          case 'ebay':
            const ebayResults = await ebayScraper.search(keyword, { 
              limit: Math.ceil(limit / keywordsToUse.length) 
            });
            platformProducts = this.convertEbayToProduct(ebayResults, category.id);
            break;

          case 'google-shopping':
            const googleResults = await googleShoppingScraper.search(
              keyword, 
              Math.ceil(limit / keywordsToUse.length)
            );
            platformProducts = this.convertGoogleToProduct(googleResults, category.id);
            break;

          case 'bing-shopping':
            const bingResult = await bingShoppingScraper.search(keyword);
            if (bingResult?.products) {
              platformProducts = bingResult.products.slice(0, Math.ceil(limit / keywordsToUse.length)).map(p => ({
                id: p.id,
                title: p.title,
                price: p.price,
                currency: p.currency,
                platform: 'bing-shopping' as Platform,
                category: category.id,
                url: p.url,
                imageUrl: p.imageUrl,
                rating: p.rating,
                reviewCount: p.reviewCount,
                source: 'bing',
              }));
            }
            break;
        }

        products.push(...platformProducts);
      }
    } catch (error: any) {
      console.error(`[CategoryManager] Error scraping ${platform} for ${category.name}:`, error.message);
    }

    return products;
  }

  /**
   * Convert Etsy listings to generic Product format
   */
  private convertEtsyToProduct(listings: EtsyListing[], categoryId: string): Product[] {
    return listings.map(listing => ({
      id: listing.id,
      title: listing.title,
      price: listing.price,
      currency: listing.currency,
      platform: 'etsy' as Platform,
      category: categoryId,
      url: listing.url,
      imageUrl: listing.imageUrl,
      rating: listing.rating,
      reviewCount: listing.reviewCount,
      source: 'etsy',
    }));
  }

  /**
   * Convert eBay listings to generic Product format
   */
  private convertEbayToProduct(listings: EbayListing[], categoryId: string): Product[] {
    return listings.map(listing => ({
      id: listing.id,
      title: listing.title,
      price: listing.price,
      currency: listing.currency,
      platform: 'ebay' as Platform,
      category: categoryId,
      url: listing.url,
      imageUrl: listing.imageUrl,
      rating: listing.rating,
      reviewCount: listing.reviewCount,
      source: 'ebay',
    }));
  }

  /**
   * Convert Google Shopping products to generic Product format
   */
  private convertGoogleToProduct(products: GoogleShoppingProduct[], categoryId: string): Product[] {
    return products.map(product => ({
      id: product.id,
      title: product.title,
      price: product.price,
      currency: product.currency,
      platform: 'google-shopping' as Platform,
      category: categoryId,
      url: product.url,
      imageUrl: product.imageUrl,
      rating: product.rating,
      reviewCount: product.reviewCount,
      source: 'google',
    }));
  }
}

// Export singleton instance
export const categoryManager = new CategoryManager();
