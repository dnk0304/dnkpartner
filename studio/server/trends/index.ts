/**
 * Multi-Source Trend Intelligence Module
 * 
 * This module provides a comprehensive trend discovery engine that aggregates
 * data from multiple free sources to identify emerging trends early.
 */

export { googleTrendsService, GOOGLE_TRENDS_CATEGORIES } from './googleTrends.js';
export type { GoogleTrendResult, DataPoint, RelatedQuery, RelatedTopic, TrendSearchOptions } from './googleTrends.js';

export { redditScraper, DEFAULT_SUBREDDITS } from './redditScraper.js';
export type { RedditPost, RedditTrend, SubredditStats } from './redditScraper.js';

export { etsyScraper, ETSY_CATEGORIES } from './etsyScraper.js';
export type { EtsyTrend, EtsyListing, EtsyCategory } from './etsyScraper.js';

export { ebayScraper, EBAY_CATEGORIES } from './ebayScraper.js';
export type { EbayTrend, EbayListing, EbayCategory } from './ebayScraper.js';

export { tiktokScraper, PRODUCT_KEYWORDS } from './tiktokScraper.js';
export type { TikTokTrend, TikTokVideo, TikTokDiscoverItem } from './tiktokScraper.js';

export { pinterestScraper, PINTEREST_CATEGORIES } from './pinterestScraper.js';
export type { PinterestTrend, PinterestPin, PinterestCategory } from './pinterestScraper.js';

export { twitterScraper, TWITTER_LOCATIONS } from './twitterScraper.js';
export type { TwitterTrend, TwitterHashtag, TwitterTweet, TwitterLocation } from './twitterScraper.js';

export { googleShoppingScraper, GOOGLE_SHOPPING_CATEGORIES } from './googleShoppingScraper.js';
export type { GoogleShoppingTrend, GoogleShoppingProduct, GoogleShoppingCategory } from './googleShoppingScraper.js';

export { growthDetector } from './growthDetector.js';
export type { GrowthMetrics, TrendStatus, TrendAnalysis } from './growthDetector.js';

export { trendStore } from './trendStore.js';
export type { ExplodingTrend, TrendSource, TrendCategory, TrendStoreData } from './trendStore.js';

export { trendScheduler, TrendScheduler } from './scheduler.js';
export type { SchedulerConfig, SchedulerStatus } from './scheduler.js';

export { isLikelyProduct, categorizeProduct, filterProductTrends, scoreProductRelevance, PRODUCT_CATEGORIES } from './productValidator.js';

