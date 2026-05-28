/**
 * Reddit Trending Topics Scraper
 * Uses Reddit's public JSON API (no authentication needed for read-only access)
 */

import { isLikelyProduct, filterProductTrends, scoreProductRelevance } from './productValidator.js';
import { SCRAPING_LIMITS } from './scrapingConfig.js';

export interface RedditPost {
  id: string;
  title: string;
  subreddit: string;
  score: number;
  upvoteRatio: number;
  numComments: number;
  createdUtc: number;
  url: string;
  selftext: string;
  author: string;
  permalink: string;
}

export interface RedditTrend {
  topic: string;
  mentions: number;
  totalScore: number;
  avgScore: number;
  posts: RedditPost[];
  subreddits: string[];
  growthVelocity: number;
  firstSeen: string;
  lastSeen: string;
}

export interface SubredditStats {
  name: string;
  subscribers: number;
  activeUsers: number;
  postsPerDay: number;
  topPosts: RedditPost[];
}

// Subreddits relevant to KDP, coloring books, crafts, and product trends
const DEFAULT_SUBREDDITS = [
  'AmazonKDP',
  'selfpublish',
  'coloring',
  'AdultColoring',
  'crafts',
  'Etsy',
  'FulfillmentByAmazon',
  'smallbusiness',
  'Entrepreneur',
  'sidehustle',
  'printmaking',
  'DigitalArt',
  'illustration',
  'graphicdesign',
  'merch',
  'PrintOnDemand',
];

// Keywords to identify product-related trends
const PRODUCT_KEYWORDS = [
  'trending',
  'viral',
  'popular',
  'selling',
  'bestseller',
  'niche',
  'opportunity',
  'demand',
  'market',
  'profitable',
];

class RedditScraper {
  private baseUrl = 'https://www.reddit.com';
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private cacheTTL = 2 * 60 * 60 * 1000; // 2 hours
  private rateLimitDelay = 6000; // 6 seconds between requests (tripled for more human-like behavior)
  private lastRequestTime = 0;

  /**
   * Rate-limited fetch to avoid hitting Reddit's rate limits
   */
  private async rateLimitedFetch(url: string): Promise<any> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.rateLimitDelay) {
      await new Promise(resolve => setTimeout(resolve, this.rateLimitDelay - timeSinceLastRequest));
    }
    
    this.lastRequestTime = Date.now();
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'TrendIntelligence/1.0 (Educational Research Bot)',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Reddit API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get hot posts from a subreddit
   */
  async getHotPosts(subreddit: string, limit: number = SCRAPING_LIMITS.TOP_TOPICS): Promise<RedditPost[]> {
    const cacheKey = `hot-${subreddit}-${limit}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    try {
      const url = `${this.baseUrl}/r/${subreddit}/hot.json?limit=${limit}`;
      const data = await this.rateLimitedFetch(url);
      
      const posts: RedditPost[] = (data.data?.children || []).map((child: any) => ({
        id: child.data.id,
        title: child.data.title,
        subreddit: child.data.subreddit,
        score: child.data.score,
        upvoteRatio: child.data.upvote_ratio,
        numComments: child.data.num_comments,
        createdUtc: child.data.created_utc,
        url: child.data.url,
        selftext: child.data.selftext?.slice(0, 500) || '',
        author: child.data.author,
        permalink: child.data.permalink,
      }));

      this.cache.set(cacheKey, { data: posts, timestamp: Date.now() });
      return posts;
    } catch (error) {
      console.error(`[RedditScraper] Error fetching hot posts from r/${subreddit}:`, error);
      return [];
    }
  }

  /**
   * Get rising posts from a subreddit (early trend detection)
   */
  async getRisingPosts(subreddit: string, limit: number = SCRAPING_LIMITS.TOP_TOPICS): Promise<RedditPost[]> {
    const cacheKey = `rising-${subreddit}-${limit}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    try {
      const url = `${this.baseUrl}/r/${subreddit}/rising.json?limit=${limit}`;
      const data = await this.rateLimitedFetch(url);
      
      const posts: RedditPost[] = (data.data?.children || []).map((child: any) => ({
        id: child.data.id,
        title: child.data.title,
        subreddit: child.data.subreddit,
        score: child.data.score,
        upvoteRatio: child.data.upvote_ratio,
        numComments: child.data.num_comments,
        createdUtc: child.data.created_utc,
        url: child.data.url,
        selftext: child.data.selftext?.slice(0, 500) || '',
        author: child.data.author,
        permalink: child.data.permalink,
      }));

      this.cache.set(cacheKey, { data: posts, timestamp: Date.now() });
      return posts;
    } catch (error) {
      console.error(`[RedditScraper] Error fetching rising posts from r/${subreddit}:`, error);
      return [];
    }
  }

  /**
   * Get top posts from a subreddit for a time period
   */
  async getTopPosts(subreddit: string, timeframe: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all' = 'week', limit: number = SCRAPING_LIMITS.TOP_TOPICS): Promise<RedditPost[]> {
    const cacheKey = `top-${subreddit}-${timeframe}-${limit}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    try {
      const url = `${this.baseUrl}/r/${subreddit}/top.json?t=${timeframe}&limit=${limit}`;
      const data = await this.rateLimitedFetch(url);
      
      const posts: RedditPost[] = (data.data?.children || []).map((child: any) => ({
        id: child.data.id,
        title: child.data.title,
        subreddit: child.data.subreddit,
        score: child.data.score,
        upvoteRatio: child.data.upvote_ratio,
        numComments: child.data.num_comments,
        createdUtc: child.data.created_utc,
        url: child.data.url,
        selftext: child.data.selftext?.slice(0, 500) || '',
        author: child.data.author,
        permalink: child.data.permalink,
      }));

      this.cache.set(cacheKey, { data: posts, timestamp: Date.now() });
      return posts;
    } catch (error) {
      console.error(`[RedditScraper] Error fetching top posts from r/${subreddit}:`, error);
      return [];
    }
  }

  /**
   * Search Reddit for a query
   */
  async search(query: string, options?: { subreddit?: string; sort?: 'relevance' | 'hot' | 'top' | 'new' | 'comments'; time?: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all'; limit?: number }): Promise<RedditPost[]> {
    const { subreddit, sort = 'relevance', time = 'week', limit = SCRAPING_LIMITS.TOP_TOPICS } = options || {};
    const cacheKey = `search-${query}-${subreddit || 'all'}-${sort}-${time}-${limit}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    try {
      const baseUrl = subreddit 
        ? `${this.baseUrl}/r/${subreddit}/search.json`
        : `${this.baseUrl}/search.json`;
      
      const params = new URLSearchParams({
        q: query,
        sort,
        t: time,
        limit: String(limit),
        restrict_sr: subreddit ? 'true' : 'false',
      });
      
      const url = `${baseUrl}?${params}`;
      const data = await this.rateLimitedFetch(url);
      
      const posts: RedditPost[] = (data.data?.children || []).map((child: any) => ({
        id: child.data.id,
        title: child.data.title,
        subreddit: child.data.subreddit,
        score: child.data.score,
        upvoteRatio: child.data.upvote_ratio,
        numComments: child.data.num_comments,
        createdUtc: child.data.created_utc,
        url: child.data.url,
        selftext: child.data.selftext?.slice(0, 500) || '',
        author: child.data.author,
        permalink: child.data.permalink,
      }));

      this.cache.set(cacheKey, { data: posts, timestamp: Date.now() });
      return posts;
    } catch (error) {
      console.error(`[RedditScraper] Error searching Reddit for "${query}":`, error);
      return [];
    }
  }

  /**
   * Get subreddit information
   */
  async getSubredditInfo(subreddit: string): Promise<SubredditStats | null> {
    const cacheKey = `info-${subreddit}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    try {
      const url = `${this.baseUrl}/r/${subreddit}/about.json`;
      const data = await this.rateLimitedFetch(url);
      
      const topPosts = await this.getTopPosts(subreddit, 'week', 10);
      
      const stats: SubredditStats = {
        name: data.data.display_name,
        subscribers: data.data.subscribers,
        activeUsers: data.data.accounts_active || 0,
        postsPerDay: Math.round((data.data.comment_score_hide_mins || 0) / 60), // Approximation
        topPosts,
      };

      this.cache.set(cacheKey, { data: stats, timestamp: Date.now() });
      return stats;
    } catch (error) {
      console.error(`[RedditScraper] Error fetching info for r/${subreddit}:`, error);
      return null;
    }
  }

  /**
   * Extract trending topics from posts
   */
  extractTopics(posts: RedditPost[]): Map<string, { count: number; totalScore: number; posts: RedditPost[] }> {
    const topics = new Map<string, { count: number; totalScore: number; posts: RedditPost[] }>();
    
    // Common words to filter out
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
      'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has', 'had',
      'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must',
      'i', 'you', 'he', 'she', 'it', 'we', 'they', 'my', 'your', 'his', 'her', 'its',
      'our', 'their', 'this', 'that', 'these', 'those', 'what', 'which', 'who', 'whom',
      'how', 'when', 'where', 'why', 'just', 'only', 'also', 'very', 'really', 'so',
      'if', 'then', 'than', 'more', 'most', 'some', 'any', 'all', 'both', 'each',
      'few', 'many', 'much', 'other', 'another', 'such', 'no', 'not', 'can', 'get',
      'got', 'about', 'into', 'over', 'after', 'before', 'between', 'under', 'again',
    ]);

    for (const post of posts) {
      // Extract words from title
      const words = post.title
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 3 && !stopWords.has(word));

      // Extract bigrams (two-word phrases)
      const bigrams: string[] = [];
      for (let i = 0; i < words.length - 1; i++) {
        if (!stopWords.has(words[i]) && !stopWords.has(words[i + 1])) {
          bigrams.push(`${words[i]} ${words[i + 1]}`);
        }
      }

      // Count single words
      for (const word of words) {
        const existing = topics.get(word) || { count: 0, totalScore: 0, posts: [] };
        existing.count++;
        existing.totalScore += post.score;
        existing.posts.push(post);
        topics.set(word, existing);
      }

      // Count bigrams
      for (const bigram of bigrams) {
        const existing = topics.get(bigram) || { count: 0, totalScore: 0, posts: [] };
        existing.count++;
        existing.totalScore += post.score;
        existing.posts.push(post);
        topics.set(bigram, existing);
      }
    }

    return topics;
  }

  /**
   * Get trending topics across multiple subreddits
   */
  async getTrendingTopics(subreddits: string[] = DEFAULT_SUBREDDITS): Promise<RedditTrend[]> {
    const allPosts: RedditPost[] = [];
    
    // Fetch posts from all subreddits
    for (const subreddit of subreddits) {
      const [hot, rising] = await Promise.all([
        this.getHotPosts(subreddit, 15),
        this.getRisingPosts(subreddit, 10),
      ]);
      allPosts.push(...hot, ...rising);
    }

    // Extract and aggregate topics
    const topicMap = this.extractTopics(allPosts);
    
    // Convert to array and sort by relevance
    const trends: RedditTrend[] = Array.from(topicMap.entries())
      .filter(([_, data]) => data.count >= 2) // Minimum 2 mentions
      .map(([topic, data]) => {
        const uniqueSubreddits = [...new Set(data.posts.map(p => p.subreddit))];
        const timestamps = data.posts.map(p => p.createdUtc * 1000);
        
        return {
          topic,
          mentions: data.count,
          totalScore: data.totalScore,
          avgScore: Math.round(data.totalScore / data.count),
          posts: data.posts.slice(0, 5), // Top 5 posts
          subreddits: uniqueSubreddits,
          growthVelocity: this.calculateVelocity(data.posts),
          firstSeen: new Date(Math.min(...timestamps)).toISOString(),
          lastSeen: new Date(Math.max(...timestamps)).toISOString(),
        };
      })
      .sort((a, b) => {
        // Score based on: mentions * avg score * subreddit diversity
        const scoreA = a.mentions * Math.log(a.avgScore + 1) * a.subreddits.length;
        const scoreB = b.mentions * Math.log(b.avgScore + 1) * b.subreddits.length;
        return scoreB - scoreA;
      })
      .slice(0, 50); // Top 50 trends

    return trends;
  }

  /**
   * Calculate velocity (rate of posts over time)
   */
  private calculateVelocity(posts: RedditPost[]): number {
    if (posts.length < 2) return 0;
    
    const timestamps = posts.map(p => p.createdUtc).sort((a, b) => a - b);
    const timeSpanHours = (timestamps[timestamps.length - 1] - timestamps[0]) / 3600;
    
    if (timeSpanHours < 1) return posts.length; // All within an hour
    
    return Math.round((posts.length / timeSpanHours) * 10) / 10; // Posts per hour
  }

  /**
   * Get product-related trends (filtered for e-commerce relevance)
   * Now uses advanced product validation to filter out non-product topics
   */
  async getProductTrends(): Promise<RedditTrend[]> {
    const trends = await this.getTrendingTopics();
    
    // Use product validator with post context for better accuracy
    const productTrends = filterProductTrends(trends, (trend) => {
      // Provide post titles and subreddit names as context
      const postTitles = trend.posts.map(p => p.title).join(' ');
      const subredditContext = trend.subreddits.join(' ');
      return `${postTitles} ${subredditContext}`;
    });
    
    // Additional filtering: boost trends from e-commerce subreddits
    const boostedTrends = productTrends.map(trend => {
      const ecommerceSubreddits = ['AmazonKDP', 'Etsy', 'FulfillmentByAmazon', 'merch', 'PrintOnDemand'];
      const hasEcommerceSubreddit = trend.subreddits.some(sub => ecommerceSubreddits.includes(sub));
      
      if (hasEcommerceSubreddit) {
        // Boost score for trends from e-commerce communities
        return {
          ...trend,
          totalScore: trend.totalScore * 1.5,
        };
      }
      
      return trend;
    });
    
    // Re-sort by boosted scores
    boostedTrends.sort((a, b) => {
      const scoreA = a.mentions * Math.log(a.avgScore + 1) * a.subreddits.length;
      const scoreB = b.mentions * Math.log(b.avgScore + 1) * b.subreddits.length;
      return scoreB - scoreA;
    });
    
    console.log(`[RedditScraper] Filtered ${trends.length} trends to ${productTrends.length} product-related trends`);
    
    return boostedTrends;
  }

  /**
   * Monitor specific keywords across Reddit
   */
  async monitorKeyword(keyword: string): Promise<{ posts: RedditPost[]; velocity: number; sentiment: number }> {
    const posts = await this.search(keyword, { sort: 'new', time: 'week', limit: 50 });
    
    // Calculate velocity
    const velocity = this.calculateVelocity(posts);
    
    // Simple sentiment analysis based on upvote ratio
    const avgUpvoteRatio = posts.length > 0
      ? posts.reduce((sum, p) => sum + p.upvoteRatio, 0) / posts.length
      : 0.5;
    
    // Convert to -100 to 100 scale
    const sentiment = Math.round((avgUpvoteRatio - 0.5) * 200);
    
    return { posts, velocity, sentiment };
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

export const redditScraper = new RedditScraper();
export { DEFAULT_SUBREDDITS };

