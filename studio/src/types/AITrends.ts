// Marketplace options
export type Marketplace = 'US' | 'UK' | 'DE';
export type SnapshotMode = 'live' | '24h' | '7d';

// Exploding Trends Types
export interface TrendSource {
  name?: 'google' | 'reddit' | 'tiktok' | 'etsy' | 'ebay' | 'amazon' | 'pinterest' | 'twitter' | 'google-shopping' | 'tiktok-shop';
  volume?: number;
  growth?: number;
  lastUpdated: string;
}

export interface TrendDataPoint {
  date: string;
  value: number;
}

export interface ExplodingTrend {
  id: string;
  topic: string;
  category: string;
  sources: TrendSource[];
  volume: number | null;
  growthRate: number | null;
  growthVelocity: number;
  firstDetected: string;
  lastUpdated: string;
  explosionScore: number | null;
  status: 'emerging' | 'exploding' | 'peaked' | 'declining' | 'stable';
  relatedTopics: string[];
  historicalData: TrendDataPoint[];
}

export interface TrendCategory {
  id: string;
  name: string;
  description: string;
  trendCount: number;
}

export interface TrendStoreStats {
  totalTrends: number;
  explodingCount: number;
  emergingCount: number;
  peakedCount: number;
  decliningCount: number;
  multiSourceCount: number;
  categoryCounts: Record<string, number>;
  sourceCounts: Record<string, number>;
  lastUpdate: string;
}

export interface DataSourceStatus {
  name: string;
  status: 'active' | 'inactive' | 'error';
  lastRun: string | null;
  nextRun: string | null;
  trendCount: number;
}

// Scraper Health Types
export interface ScraperHealth {
  source: string;
  status: 'healthy' | 'degraded' | 'failing' | 'mock';
  lastSuccessfulScrape: string | null;
  lastAttempt: string | null;
  consecutiveFailures: number;
  totalScrapes24h: number;
  successRate24h: number;
  avgResponseTime: number;
  dataFreshness: 'live' | 'stale' | 'mock';
  trendsCollected24h: number;
  errorMessages: string[];
}

export interface HealthSummary {
  totalSources: number;
  healthySources: number;
  degradedSources: number;
  failingSources: number;
  mockSources: number;
  overallHealth: 'healthy' | 'degraded' | 'critical';
  totalTrends24h: number;
  avgSuccessRate: number;
}

export interface HealthAlert {
  type: 'scraper_failure' | 'degraded_performance' | 'stale_data' | 'recovery';
  source: string;
  message: string;
  timestamp: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  details?: Record<string, any>;
}

// Core ASIN result from scraping
export interface ASINResult {
  asin: string;
  rank: number;
  rankConfidence: number;
  price: number;
  rating: number;
  reviews: number;
  title: string;
  imageUrl: string;
  estimatedSales: number;
  sponsored: boolean;
}

// Daily snapshot for historical data
export interface DailySnapshot {
  date: string;
  rank: number;
  volume: number;
  avgPrice: number;
}

// Metadata about data quality and source
export interface KeywordMetadata {
  runs: number;
  variance: number;
  lastUpdated: string;
  isSimulated: boolean;
}

// Full keyword search response
export interface KeywordSearchResult {
  keyword: string;
  marketplace: Marketplace;
  volume: number;
  volumeConfidence: number;
  difficulty: number;
  avgPrice: number;
  totalRevenue: number;
  competitorCount: number;
  results: ASINResult[];
  snapshots: DailySnapshot[];  // 30-day history
  metadata: KeywordMetadata;
}

// Backend scraper types
export interface ScrapeResult {
  keyword: string;
  marketplace: Marketplace;
  results: ASINResult[];
  scrapedAt: string;
  totalResults: number;
}

export interface ASINDetails {
  asin: string;
  marketplace: Marketplace;
  title: string;
  price: number;
  rating: number;
  reviews: number;
  rank: number;
  category: string;
  imageUrl: string;
  availability: string;
  scrapedAt: string;
}

