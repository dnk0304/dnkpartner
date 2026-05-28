// Marketplace options
export type Marketplace = 'US' | 'UK' | 'DE';

// Job types for the queue
export type JobType = 'KEYWORD_SNAPSHOT' | 'ASIN_LOOKUP' | 'RANK_CHECK';
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

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

// Scrape result from Puppeteer
export interface ScrapeResult {
  keyword: string;
  marketplace: Marketplace;
  results: ASINResult[];
  scrapedAt: string;
  totalResults: number;
  runId: string;
}

// ASIN details lookup
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

// Job queue entry
export interface ScrapeJob {
  id: string;
  type: JobType;
  payload: {
    keyword?: string;
    asin?: string;
    marketplace: Marketplace;
  };
  status: JobStatus;
  retries: number;
  maxRetries: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  result?: ScrapeResult | ASINDetails;
}

// Daily snapshot for historical data
export interface DailySnapshot {
  date: string;
  rank: number;
  volume: number;
  avgPrice: number;
}

// Metadata about data quality
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
  snapshots: DailySnapshot[];
  metadata: KeywordMetadata;
}

// Snapshot cache entry
export interface SnapshotCacheEntry {
  key: string;
  data: ScrapeResult | ASINDetails;
  timestamp: Date;
  ttl: number; // in milliseconds
}

// Historical data entry
export interface HistoricalEntry {
  keyword: string;
  marketplace: Marketplace;
  snapshots: DailySnapshot[];
  lastUpdated: Date;
  isSimulated: boolean;
}

