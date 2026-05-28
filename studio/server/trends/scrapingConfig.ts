/**
 * Central Scraping Configuration
 * Defines limits, categories, and tiers for enterprise scraping
 */

export const SCRAPING_LIMITS = {
  // Products/Items
  TOP_PRODUCTS_PER_PLATFORM: 100,
  TOP_PRODUCTS_PER_CATEGORY: 50,
  
  // Trends/Keywords
  TOP_TRENDING_KEYWORDS: 100,
  TOP_HASHTAGS: 50,
  TOP_TOPICS: 50,
  
  // Categories
  CATEGORIES_TO_SCRAPE: 20,
  SUBCATEGORIES_PER_CATEGORY: 10,
  
  // Cross-region
  TOP_CROSS_REGION_TRENDS: 100,
  REGIONS_TO_MONITOR: 10,
};

export const CATEGORY_TIERS = {
  TIER_1: ['coloring books', 'activity books', 'journals', 'planners'],
  TIER_2: ['craft kits', 'art supplies', 'stickers', 'puzzles'],
  TIER_3: ['home decor', 'wall art', 'seasonal', 'gifts'],
};

// Parallel execution defaults
export const PARALLEL_CONFIG = {
  DEFAULT_CONCURRENCY: 5,
  DEFAULT_BATCH_SIZE: 10,
  DEFAULT_BATCH_DELAY: 2000,
  MAX_RETRIES: 3,
};

// Rate limiting defaults
export const RATE_LIMIT_CONFIG = {
  BASE_DELAY: 3000,
  MIN_DELAY: 1000,
  MAX_DELAY: 60000,
  SUCCESS_SPEEDUP_FACTOR: 0.9,
  FAILURE_SLOWDOWN_FACTOR: 2.0,
  RATE_LIMIT_SLOWDOWN_FACTOR: 3.0,
};

// Proxy configuration
export const PROXY_CONFIG = {
  AUTO_FETCH_ON_STARTUP: true,
  INITIAL_PROXY_COUNT: 50,
  AUTO_REFRESH_INTERVAL: 30 * 60 * 1000, // 30 minutes
  MIN_WORKING_PROXIES: 10,
  TEST_INTERVAL: 15 * 60 * 1000, // 15 minutes
};
