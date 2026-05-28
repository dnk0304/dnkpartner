import googleTrends from 'google-trends-api';

export interface GoogleTrendResult {
  topic: string;
  interest: number;
  interestOverTime: DataPoint[];
  relatedQueries: RelatedQuery[];
  relatedTopics: RelatedTopic[];
  geo: string;
  timeRange: string;
  lastUpdated: string;
}

export interface DataPoint {
  date: string;
  value: number;
}

export interface RelatedQuery {
  query: string;
  value: number;
  type: 'rising' | 'top';
}

export interface RelatedTopic {
  topic: string;
  value: number;
  type: 'rising' | 'top';
}

export interface TrendSearchOptions {
  keyword: string;
  geo?: string; // e.g., 'US', 'GB', 'DE'
  timeRange?: 'now 1-H' | 'now 4-H' | 'now 1-d' | 'now 7-d' | 'today 1-m' | 'today 3-m' | 'today 12-m' | 'today 5-y';
  category?: number; // Google Trends category ID
}

// Category IDs for Google Trends
export const GOOGLE_TRENDS_CATEGORIES = {
  ALL: 0,
  ARTS_ENTERTAINMENT: 3,
  BOOKS_LITERATURE: 22,
  BUSINESS: 12,
  COMPUTERS_ELECTRONICS: 5,
  FINANCE: 7,
  FOOD_DRINK: 71,
  GAMES: 8,
  HEALTH: 45,
  HOBBIES_LEISURE: 65,
  HOME_GARDEN: 11,
  INTERNET_TELECOM: 13,
  JOBS_EDUCATION: 958,
  NEWS: 16,
  ONLINE_COMMUNITIES: 299,
  PEOPLE_SOCIETY: 14,
  PETS_ANIMALS: 66,
  REAL_ESTATE: 29,
  REFERENCE: 533,
  SCIENCE: 174,
  SHOPPING: 18,
  SPORTS: 20,
  TRAVEL: 67,
};

class GoogleTrendsService {
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private cacheTTL = 4 * 60 * 60 * 1000; // 4 hours
  private maxRetries = 3;
  private retryDelay = 2000; // 2 seconds

  private getCacheKey(options: TrendSearchOptions): string {
    return `${options.keyword}-${options.geo || 'US'}-${options.timeRange || 'today 12-m'}-${options.category || 0}`;
  }

  private isCacheValid(timestamp: number): boolean {
    return Date.now() - timestamp < this.cacheTTL;
  }

  /**
   * Safe JSON parse wrapper with validation
   */
  private safeJsonParse(data: string, context: string): any {
    try {
      // Validate input
      if (!data || typeof data !== 'string') {
        console.warn(`[GoogleTrends] Invalid data for ${context}: empty or not a string`);
        return null;
      }

      // Trim whitespace
      let trimmed = data.trim();
      
      // Strip anti-XSSI prefix that Google sometimes adds (like )]}'\n)
      // This is a security measure to prevent JSON hijacking
      const xssiPrefixes = [")]}'\n", ")]}',\n", ")]}'", ")]}"];
      for (const prefix of xssiPrefixes) {
        if (trimmed.startsWith(prefix)) {
          trimmed = trimmed.substring(prefix.length).trim();
          console.log(`[GoogleTrends] Stripped XSSI prefix for ${context}`);
          break;
        }
      }
      
      // Also handle cases where response starts with whitespace then the prefix
      if (trimmed.startsWith(')')) {
        const jsonStart = trimmed.indexOf('{');
        const arrayStart = trimmed.indexOf('[');
        const start = jsonStart >= 0 && arrayStart >= 0 
          ? Math.min(jsonStart, arrayStart)
          : Math.max(jsonStart, arrayStart);
        if (start > 0) {
          trimmed = trimmed.substring(start);
          console.log(`[GoogleTrends] Extracted JSON from position ${start} for ${context}`);
        }
      }
      
      if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
        console.warn(`[GoogleTrends] Invalid JSON format for ${context}: doesn't start with { or [`);
        console.warn(`[GoogleTrends] Data preview: ${data.substring(0, 100)}...`);
        return null;
      }

      return JSON.parse(trimmed);
    } catch (error: any) {
      console.error(`[GoogleTrends] JSON parse error in ${context}:`, error.message);
      // Log first 200 chars of problematic data for debugging
      if (data) {
        console.error(`[GoogleTrends] Problematic data preview:`, data.substring(0, 200));
      }
      return null;
    }
  }

  /**
   * Retry wrapper with exponential backoff
   */
  private async withRetry<T>(
    fn: () => Promise<T>,
    context: string,
    attempt: number = 1
  ): Promise<T | null> {
    try {
      return await fn();
    } catch (error: any) {
      if (attempt < this.maxRetries) {
        const delay = this.retryDelay * Math.pow(2, attempt - 1);
        console.warn(`[GoogleTrends] ${context} failed (attempt ${attempt}/${this.maxRetries}), retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.withRetry(fn, context, attempt + 1);
      }
      console.error(`[GoogleTrends] ${context} failed after ${this.maxRetries} attempts:`, error.message);
      return null;
    }
  }

  /**
   * Get interest over time for a keyword
   */
  async getInterestOverTime(options: TrendSearchOptions): Promise<DataPoint[]> {
    const cacheKey = `interest-${this.getCacheKey(options)}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && this.isCacheValid(cached.timestamp)) {
      return cached.data;
    }

    const result = await this.withRetry(async () => {
      const results = await googleTrends.interestOverTime({
        keyword: options.keyword,
        geo: options.geo || 'US',
        startTime: this.getStartTime(options.timeRange || 'today 12-m'),
        category: options.category || 0,
      });

      const parsed = this.safeJsonParse(results, `interestOverTime(${options.keyword})`);
      if (!parsed || !parsed.default) {
        console.warn(`[GoogleTrends] No valid data for interestOverTime: ${options.keyword}`);
        return [];
      }

      const timeline = parsed.default.timelineData || [];
      
      const dataPoints: DataPoint[] = timeline.map((point: any) => ({
        date: point.formattedTime || new Date(point.time * 1000).toISOString(),
        value: point.value?.[0] || 0,
      }));

      return dataPoints;
    }, `getInterestOverTime(${options.keyword})`);

    const dataPoints = result || [];
    this.cache.set(cacheKey, { data: dataPoints, timestamp: Date.now() });
    return dataPoints;
  }

  /**
   * Get related queries for a keyword
   */
  async getRelatedQueries(options: TrendSearchOptions): Promise<{ rising: RelatedQuery[]; top: RelatedQuery[] }> {
    const cacheKey = `related-${this.getCacheKey(options)}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && this.isCacheValid(cached.timestamp)) {
      return cached.data;
    }

    const result = await this.withRetry(async () => {
      const results = await googleTrends.relatedQueries({
        keyword: options.keyword,
        geo: options.geo || 'US',
        startTime: this.getStartTime(options.timeRange || 'today 12-m'),
        category: options.category || 0,
      });

      const parsed = this.safeJsonParse(results, `relatedQueries(${options.keyword})`);
      if (!parsed || !parsed.default) {
        console.warn(`[GoogleTrends] No valid data for relatedQueries: ${options.keyword}`);
        return { rising: [], top: [] };
      }

      const data = parsed.default.rankedList || [];
      
      const rising: RelatedQuery[] = (data[0]?.rankedKeyword || []).map((item: any) => ({
        query: item.query,
        value: item.value,
        type: 'rising' as const,
      }));

      const top: RelatedQuery[] = (data[1]?.rankedKeyword || []).map((item: any) => ({
        query: item.query,
        value: item.value,
        type: 'top' as const,
      }));

      return { rising, top };
    }, `getRelatedQueries(${options.keyword})`);

    const queries = result || { rising: [], top: [] };
    this.cache.set(cacheKey, { data: queries, timestamp: Date.now() });
    return queries;
  }

  /**
   * Get related topics for a keyword
   */
  async getRelatedTopics(options: TrendSearchOptions): Promise<{ rising: RelatedTopic[]; top: RelatedTopic[] }> {
    const cacheKey = `topics-${this.getCacheKey(options)}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && this.isCacheValid(cached.timestamp)) {
      return cached.data;
    }

    const result = await this.withRetry(async () => {
      const results = await googleTrends.relatedTopics({
        keyword: options.keyword,
        geo: options.geo || 'US',
        startTime: this.getStartTime(options.timeRange || 'today 12-m'),
        category: options.category || 0,
      });

      const parsed = this.safeJsonParse(results, `relatedTopics(${options.keyword})`);
      if (!parsed || !parsed.default) {
        console.warn(`[GoogleTrends] No valid data for relatedTopics: ${options.keyword}`);
        return { rising: [], top: [] };
      }

      const data = parsed.default.rankedList || [];
      
      const rising: RelatedTopic[] = (data[0]?.rankedKeyword || []).map((item: any) => ({
        topic: item.topic?.title || item.query || 'Unknown',
        value: item.value,
        type: 'rising' as const,
      }));

      const top: RelatedTopic[] = (data[1]?.rankedKeyword || []).map((item: any) => ({
        topic: item.topic?.title || item.query || 'Unknown',
        value: item.value,
        type: 'top' as const,
      }));

      return { rising, top };
    }, `getRelatedTopics(${options.keyword})`);

    const topics = result || { rising: [], top: [] };
    this.cache.set(cacheKey, { data: topics, timestamp: Date.now() });
    return topics;
  }

  /**
   * Get daily trending searches for a region
   */
  async getDailyTrends(geo: string = 'US'): Promise<string[]> {
    const cacheKey = `daily-${geo}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && this.isCacheValid(cached.timestamp)) {
      return cached.data;
    }

    const result = await this.withRetry(async () => {
      const results = await googleTrends.dailyTrends({
        geo: geo,
      });

      const parsed = this.safeJsonParse(results, `dailyTrends(${geo})`);
      if (!parsed || !parsed.default) {
        console.warn(`[GoogleTrends] No valid data for dailyTrends: ${geo}`);
        return [];
      }

      const trendingSearches = parsed.default.trendingSearchesDays?.[0]?.trendingSearches || [];
      
      const trends = trendingSearches.map((item: any) => item.title?.query || '').filter(Boolean);
      
      return trends;
    }, `getDailyTrends(${geo})`);

    const trends = result || [];
    this.cache.set(cacheKey, { data: trends, timestamp: Date.now() });
    return trends;
  }

  /**
   * Get real-time trending searches
   */
  async getRealTimeTrends(geo: string = 'US', category: string = 'all'): Promise<string[]> {
    const cacheKey = `realtime-${geo}-${category}`;
    const cached = this.cache.get(cacheKey);
    
    // Shorter cache for real-time (30 minutes)
    if (cached && Date.now() - cached.timestamp < 30 * 60 * 1000) {
      return cached.data;
    }

    const result = await this.withRetry(async () => {
      const results = await googleTrends.realTimeTrends({
        geo: geo,
        category: category,
      });

      const parsed = this.safeJsonParse(results, `realTimeTrends(${geo}, ${category})`);
      if (!parsed || !parsed.storySummaries) {
        console.warn(`[GoogleTrends] No valid data for realTimeTrends: ${geo}, ${category}`);
        return [];
      }

      const stories = parsed.storySummaries.trendingStories || [];
      
      const trends = stories.map((story: any) => story.entityNames?.[0] || story.title || '').filter(Boolean);
      
      return trends;
    }, `getRealTimeTrends(${geo}, ${category})`);

    const trends = result || [];
    this.cache.set(cacheKey, { data: trends, timestamp: Date.now() });
    return trends;
  }

  /**
   * Get comprehensive trend data for a keyword
   */
  async getFullTrendData(options: TrendSearchOptions): Promise<GoogleTrendResult> {
    const [interestOverTime, relatedQueries, relatedTopics] = await Promise.all([
      this.getInterestOverTime(options),
      this.getRelatedQueries(options),
      this.getRelatedTopics(options),
    ]);

    // Calculate current interest (average of last 3 data points)
    const recentData = interestOverTime.slice(-3);
    const currentInterest = recentData.length > 0 
      ? Math.round(recentData.reduce((sum, d) => sum + d.value, 0) / recentData.length)
      : 0;

    return {
      topic: options.keyword,
      interest: currentInterest,
      interestOverTime,
      relatedQueries: [...relatedQueries.rising, ...relatedQueries.top],
      relatedTopics: [...relatedTopics.rising, ...relatedTopics.top],
      geo: options.geo || 'US',
      timeRange: options.timeRange || 'today 12-m',
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Search multiple keywords and compare their trends
   */
  async compareKeywords(keywords: string[], options?: Omit<TrendSearchOptions, 'keyword'>): Promise<Map<string, DataPoint[]>> {
    const results = new Map<string, DataPoint[]>();
    
    // Google Trends API can compare up to 5 keywords at once
    // For now, we'll fetch them individually
    for (const keyword of keywords.slice(0, 5)) {
      const data = await this.getInterestOverTime({ keyword, ...options });
      results.set(keyword, data);
    }
    
    return results;
  }

  /**
   * Calculate growth rate from interest over time data
   */
  calculateGrowthRate(data: DataPoint[], windowDays: number = 30): number {
    if (data.length < 2) return 0;

    const sortedData = [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    // Get data points from the specified window
    const now = Date.now();
    const windowStart = now - (windowDays * 24 * 60 * 60 * 1000);
    
    const recentData = sortedData.filter(d => new Date(d.date).getTime() >= windowStart);
    
    if (recentData.length < 2) {
      // Fall back to all data if not enough in window
      const firstValue = sortedData[0].value;
      const lastValue = sortedData[sortedData.length - 1].value;
      if (firstValue === 0) return lastValue > 0 ? 100 : 0;
      return Math.round(((lastValue - firstValue) / firstValue) * 100);
    }

    const firstValue = recentData[0].value;
    const lastValue = recentData[recentData.length - 1].value;
    
    if (firstValue === 0) return lastValue > 0 ? 100 : 0;
    return Math.round(((lastValue - firstValue) / firstValue) * 100);
  }

  /**
   * Detect if a trend is "exploding" (hockey stick pattern)
   */
  detectHockeyStick(data: DataPoint[]): { isExploding: boolean; accelerationFactor: number } {
    if (data.length < 10) return { isExploding: false, accelerationFactor: 0 };

    const sortedData = [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    // Split data into two halves
    const midpoint = Math.floor(sortedData.length / 2);
    const firstHalf = sortedData.slice(0, midpoint);
    const secondHalf = sortedData.slice(midpoint);

    // Calculate average growth in each half
    const firstHalfAvg = firstHalf.reduce((sum, d) => sum + d.value, 0) / firstHalf.length;
    const secondHalfAvg = secondHalf.reduce((sum, d) => sum + d.value, 0) / secondHalf.length;

    // Calculate recent acceleration (last quarter vs previous quarter)
    const quarterPoint = Math.floor(sortedData.length * 0.75);
    const lastQuarter = sortedData.slice(quarterPoint);
    const prevQuarter = sortedData.slice(midpoint, quarterPoint);

    const lastQuarterAvg = lastQuarter.reduce((sum, d) => sum + d.value, 0) / lastQuarter.length;
    const prevQuarterAvg = prevQuarter.reduce((sum, d) => sum + d.value, 0) / prevQuarter.length;

    const accelerationFactor = prevQuarterAvg > 0 
      ? (lastQuarterAvg - prevQuarterAvg) / prevQuarterAvg 
      : 0;

    // Criteria for "hockey stick":
    // 1. Second half average is significantly higher than first half
    // 2. Recent acceleration is positive and significant
    const isExploding = secondHalfAvg > firstHalfAvg * 1.5 && accelerationFactor > 0.2;

    return {
      isExploding,
      accelerationFactor: Math.round(accelerationFactor * 100),
    };
  }

  private getStartTime(timeRange: string): Date {
    const now = new Date();
    
    switch (timeRange) {
      case 'now 1-H':
        return new Date(now.getTime() - 60 * 60 * 1000);
      case 'now 4-H':
        return new Date(now.getTime() - 4 * 60 * 60 * 1000);
      case 'now 1-d':
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      case 'now 7-d':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case 'today 1-m':
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      case 'today 3-m':
        return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      case 'today 12-m':
        return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      case 'today 5-y':
        return new Date(now.getTime() - 5 * 365 * 24 * 60 * 60 * 1000);
      default:
        return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    }
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

export const googleTrendsService = new GoogleTrendsService();

