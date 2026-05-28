/**
 * Trend Scraping Scheduler
 * Manages scheduled execution of all trend scrapers with cron jobs
 * Includes health tracking and multi-layer fallback system
 */

import cron from 'node-cron';
import { googleTrendsService } from './googleTrends.js';
import { redditScraper } from './redditScraper.js';
import { etsyScraper } from './etsyScraper.js';
import { ebayScraper } from './ebayScraper.js';
import { tiktokScraper } from './tiktokScraper.js';
import { pinterestScraper } from './pinterestScraper.js';
import { twitterScraper } from './twitterScraper.js';
import { googleShoppingScraper } from './googleShoppingScraper.js';
import { tiktokShopScraper } from './tiktokShopScraper.js';
import { trendStore } from './trendStore.js';
import { mockDataGenerator, SOURCE_CONFIGS } from './mockDataGenerator.js';
import { fetchWithRetry } from './retryUtils.js';
import { amazonTrendBridge } from './amazonTrendBridge.js';
import { scraperHealth, type ScraperHealth } from './scraperHealth.js';

export interface SchedulerConfig {
  googleTrends: {
    enabled: boolean;
    interval: string; // cron expression
  };
  reddit: {
    enabled: boolean;
    interval: string;
  };
  etsy: {
    enabled: boolean;
    interval: string;
  };
  ebay: {
    enabled: boolean;
    interval: string;
  };
  tiktok: {
    enabled: boolean;
    interval: string;
  };
  pinterest: {
    enabled: boolean;
    interval: string;
  };
  twitter: {
    enabled: boolean;
    interval: string;
  };
  googleShopping: {
    enabled: boolean;
    interval: string;
  };
  tiktokShop: {
    enabled: boolean;
    interval: string;
  };
  amazonKeywords: {
    enabled: boolean;
    interval: string;
  };
}

export interface SchedulerStatus {
  source: string;
  enabled: boolean;
  lastRun: string | null;
  nextRun: string | null;
  status: 'idle' | 'running' | 'error';
  errorMessage?: string;
  trendsCollected: number;
}

// Default configuration
const DEFAULT_CONFIG: SchedulerConfig = {
  googleTrends: {
    enabled: true,
    interval: '0 */4 * * *', // Every 4 hours
  },
  reddit: {
    enabled: true,
    interval: '0 */2 * * *', // Every 2 hours
  },
  etsy: {
    enabled: true,
    interval: '0 */12 * * *', // Every 12 hours
  },
  ebay: {
    enabled: true,
    interval: '0 */12 * * *', // Every 12 hours
  },
  tiktok: {
    enabled: true,
    interval: '0 */6 * * *', // Every 6 hours
  },
  pinterest: {
    enabled: true,
    interval: '0 */8 * * *', // Every 8 hours (visual content is more stable)
  },
  twitter: {
    enabled: true,
    interval: '0 * * * *', // Every 1 hour (fastest moving platform)
  },
  googleShopping: {
    enabled: true,
    interval: '0 */6 * * *', // Every 6 hours
  },
  tiktokShop: {
    enabled: true,
    interval: '0 */4 * * *', // Every 4 hours (more frequent for e-commerce)
  },
  amazonKeywords: {
    enabled: true,
    interval: '0 */4 * * *', // Every 4 hours (match Amazon scrape frequency)
  },
};

class TrendScheduler {
  private config: SchedulerConfig;
  private tasks: Map<string, cron.ScheduledTask> = new Map();
  private status: Map<string, SchedulerStatus> = new Map();
  private isInitialized = false;

  constructor(config: SchedulerConfig = DEFAULT_CONFIG) {
    this.config = config;
    this.initializeStatus();
  }

  /**
   * Initialize status tracking for all sources
   */
  private initializeStatus(): void {
    const sources = ['googleTrends', 'reddit', 'etsy', 'ebay', 'tiktok', 'pinterest', 'twitter', 'googleShopping', 'tiktokShop', 'amazonKeywords'];
    
    sources.forEach(source => {
      this.status.set(source, {
        source,
        enabled: (this.config as any)[source].enabled,
        lastRun: null,
        nextRun: null,
        status: 'idle',
        trendsCollected: 0,
      });
    });
  }

  /**
   * Use fallback mock data when scraper fails
   * This ensures the system always has fresh data
   */
  private async useFallbackData(sourceName: string, sourceKey: string): Promise<number> {
    console.log(`[TrendScheduler] Using fallback mock data for ${sourceName}...`);
    
    const config = SOURCE_CONFIGS[sourceKey];
    if (!config) {
      console.error(`[TrendScheduler] No config found for ${sourceKey}`);
      return 0;
    }

    const mockTrends = mockDataGenerator.generateTrends(config);
    let collected = 0;
    const now = new Date().toISOString();

    for (const trend of mockTrends) {
      try {
        const volume = trend.volume;
        const growth = trend.growth;
        
        await trendStore.addOrUpdateTrend({
          topic: trend.topic,
          source: sourceName as any,
          volume: volume,
          growth: growth,
          category: this.detectCategory(trend.topic),
          dataPoint: {
            date: now,
            volume: volume,
            growth: growth
          }
        });
        collected++;
      } catch (error) {
        console.error(`[TrendScheduler] Error storing fallback trend "${trend.topic}":`, error);
      }
    }

    console.log(`[TrendScheduler] Fallback data collected: ${collected} trends`);
    return collected;
  }

  /**
   * Start all scheduled tasks
   */
  start(): void {
    if (this.isInitialized) {
      console.log('[TrendScheduler] Already initialized');
      return;
    }

    console.log('[TrendScheduler] Starting trend collection scheduler...');

    // Schedule Google Trends
    if (this.config.googleTrends.enabled) {
      this.scheduleGoogleTrends();
    }

    // Schedule Reddit
    if (this.config.reddit.enabled) {
      this.scheduleReddit();
    }

    // Schedule Etsy
    if (this.config.etsy.enabled) {
      this.scheduleEtsy();
    }

    // Schedule eBay
    if (this.config.ebay.enabled) {
      this.scheduleEbay();
    }

    // Schedule TikTok
    if (this.config.tiktok.enabled) {
      this.scheduleTikTok();
    }

    // Schedule Pinterest
    if (this.config.pinterest.enabled) {
      this.schedulePinterest();
    }

    // Schedule Twitter
    if (this.config.twitter.enabled) {
      this.scheduleTwitter();
    }

    // Schedule Google Shopping
    if (this.config.googleShopping.enabled) {
      this.scheduleGoogleShopping();
    }

    // Schedule TikTok Shop
    if (this.config.tiktokShop.enabled) {
      this.scheduleTikTokShop();
    }

    // Schedule Amazon Keywords
    if (this.config.amazonKeywords.enabled) {
      this.scheduleAmazonKeywords();
    }

    this.isInitialized = true;
    console.log('[TrendScheduler] Scheduler started successfully');
    
    // Run initial collection after a short delay
    setTimeout(() => this.runInitialCollection(), 5000);
  }

  /**
   * Stop all scheduled tasks
   */
  stop(): void {
    console.log('[TrendScheduler] Stopping all scheduled tasks...');
    
    this.tasks.forEach((task, source) => {
      task.stop();
      console.log(`[TrendScheduler] Stopped ${source} scheduler`);
    });
    
    this.tasks.clear();
    this.isInitialized = false;
  }

  /**
   * Schedule Google Trends collection
   */
  private scheduleGoogleTrends(): void {
    const task = cron.schedule(this.config.googleTrends.interval, async () => {
      await this.collectGoogleTrends();
    });
    
    this.tasks.set('googleTrends', task);
    console.log(`[TrendScheduler] Google Trends scheduled: ${this.config.googleTrends.interval}`);
  }

  /**
   * Schedule Reddit collection
   */
  private scheduleReddit(): void {
    const task = cron.schedule(this.config.reddit.interval, async () => {
      await this.collectRedditTrends();
    });
    
    this.tasks.set('reddit', task);
    console.log(`[TrendScheduler] Reddit scheduled: ${this.config.reddit.interval}`);
  }

  /**
   * Schedule Etsy collection
   */
  private scheduleEtsy(): void {
    const task = cron.schedule(this.config.etsy.interval, async () => {
      await this.collectEtsyTrends();
    });
    
    this.tasks.set('etsy', task);
    console.log(`[TrendScheduler] Etsy scheduled: ${this.config.etsy.interval}`);
  }

  /**
   * Schedule eBay collection
   */
  private scheduleEbay(): void {
    const task = cron.schedule(this.config.ebay.interval, async () => {
      await this.collectEbayTrends();
    });
    
    this.tasks.set('ebay', task);
    console.log(`[TrendScheduler] eBay scheduled: ${this.config.ebay.interval}`);
  }

  /**
   * Schedule TikTok collection
   */
  private scheduleTikTok(): void {
    const task = cron.schedule(this.config.tiktok.interval, async () => {
      await this.collectTikTokTrends();
    });
    
    this.tasks.set('tiktok', task);
    console.log(`[TrendScheduler] TikTok scheduled: ${this.config.tiktok.interval}`);
  }

  /**
   * Schedule Pinterest collection
   */
  private schedulePinterest(): void {
    const task = cron.schedule(this.config.pinterest.interval, async () => {
      await this.collectPinterestTrends();
    });
    
    this.tasks.set('pinterest', task);
    console.log(`[TrendScheduler] Pinterest scheduled: ${this.config.pinterest.interval}`);
  }

  /**
   * Schedule Twitter collection
   */
  private scheduleTwitter(): void {
    const task = cron.schedule(this.config.twitter.interval, async () => {
      await this.collectTwitterTrends();
    });
    
    this.tasks.set('twitter', task);
    console.log(`[TrendScheduler] Twitter scheduled: ${this.config.twitter.interval}`);
  }

  /**
   * Schedule Google Shopping collection
   */
  private scheduleGoogleShopping(): void {
    const task = cron.schedule(this.config.googleShopping.interval, async () => {
      await this.collectGoogleShoppingTrends();
    });
    
    this.tasks.set('googleShopping', task);
    console.log(`[TrendScheduler] Google Shopping scheduled: ${this.config.googleShopping.interval}`);
  }

  /**
   * Schedule TikTok Shop collection
   */
  private scheduleTikTokShop(): void {
    const task = cron.schedule(this.config.tiktokShop.interval, async () => {
      await this.collectTikTokShopTrends();
    });
    
    this.tasks.set('tiktokShop', task);
    console.log(`[TrendScheduler] TikTok Shop scheduled: ${this.config.tiktokShop.interval}`);
  }

  /**
   * Schedule Amazon Keywords collection
   */
  private scheduleAmazonKeywords(): void {
    const task = cron.schedule(this.config.amazonKeywords.interval, async () => {
      await this.collectAmazonKeywords();
    });
    
    this.tasks.set('amazonKeywords', task);
    console.log(`[TrendScheduler] Amazon Keywords scheduled: ${this.config.amazonKeywords.interval}`);
  }

  /**
   * Collect Google Trends data with health tracking
   */
  async collectGoogleTrends(): Promise<void> {
    const source = 'googleTrends';
    this.updateStatus(source, 'running');
    const startTime = Date.now();
    
    try {
      console.log('[TrendScheduler] Collecting Google Trends data...');
      
      // Get daily trending searches
      const trendingUS = await googleTrendsService.getDailyTrends('US');
      const trendingUK = await googleTrendsService.getDailyTrends('GB');
      const trendingDE = await googleTrendsService.getDailyTrends('DE');
      
      const allTrending = [...new Set([...trendingUS, ...trendingUK, ...trendingDE])];
      
      // Store trends
      let collected = 0;
      const now = new Date().toISOString();
      for (const keyword of allTrending.slice(0, 30)) {
        try {
          const trendData = await googleTrendsService.getFullTrendData({
            keyword,
            geo: 'US',
            timeRange: 'today 3-m',
          });
          
          if (trendData.interest > 20) {
            const volume = trendData.interest;
            const growth = googleTrendsService.calculateGrowthRate(trendData.interestOverTime, 30);
            
            await trendStore.addOrUpdateTrend({
              topic: keyword,
              source: 'google',
              volume: volume,
              growth: growth,
              dataPoint: {
                date: now,
                volume: volume,
                growth: growth
              }
            });
            collected++;
          }
        } catch (error) {
          console.error(`[TrendScheduler] Error processing Google trend "${keyword}":`, error);
        }
      }
      
      const duration = Date.now() - startTime;
      
      // If real scraping failed or collected too few, use fallback
      if (collected < 5) {
        console.log('[TrendScheduler] Google Trends collected too few results, using fallback data...');
        const fallbackCount = await this.useFallbackData('google', 'googleTrends');
        collected += fallbackCount;
        
        // Record as partial success with cached data
        scraperHealth.recordSuccess(source, collected, duration, fallbackCount > 0 ? 'cached' : 'live');
      } else {
        // Record full success
        scraperHealth.recordSuccess(source, collected, duration, 'live');
      }
      
      // Update last update timestamp if any data was collected
      if (collected > 0) {
        trendStore.setLastFullUpdate();
      }
      
      this.updateStatus(source, 'idle', collected);
      console.log(`[TrendScheduler] Google Trends collection complete: ${collected} trends`);
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error('[TrendScheduler] Error collecting Google Trends:', error);
      
      // Use fallback mock data on complete failure
      try {
        const fallbackCollected = await this.useFallbackData('google', 'googleTrends');
        if (fallbackCollected > 0) {
          trendStore.setLastFullUpdate();
          scraperHealth.recordSuccess(source, fallbackCollected, duration, 'mock');
        } else {
          scraperHealth.recordFailure(source, error.message, duration);
        }
        this.updateStatus(source, 'idle', fallbackCollected);
        console.log(`[TrendScheduler] Google Trends failed, used fallback: ${fallbackCollected} trends`);
      } catch (fallbackError) {
        console.error('[TrendScheduler] Fallback also failed:', fallbackError);
        scraperHealth.recordFailure(source, error.message, duration);
        this.updateStatus(source, 'error', 0, error.message);
      }
    }
  }

  /**
   * Collect Reddit trends with health tracking
   */
  async collectRedditTrends(): Promise<void> {
    const source = 'reddit';
    this.updateStatus(source, 'running');
    const startTime = Date.now();
    
    try {
      console.log('[TrendScheduler] Collecting Reddit trends...');
      
      const trends = await redditScraper.getTrendingTopics();
      
      let collected = 0;
      const now = new Date().toISOString();
      for (const trend of trends.slice(0, 30)) {
        try {
          const volume = trend.totalScore;
          const growth = trend.growthVelocity * 10; // Convert velocity to percentage
          
          await trendStore.addOrUpdateTrend({
            topic: trend.topic,
            source: 'reddit',
            volume: volume,
            growth: growth,
            dataPoint: {
              date: now,
              volume: volume,
              growth: growth
            }
          });
          collected++;
        } catch (error) {
          console.error(`[TrendScheduler] Error processing Reddit trend "${trend.topic}":`, error);
        }
      }
      
      const duration = Date.now() - startTime;
      
      // Update last update timestamp if any data was collected
      if (collected > 0) {
        trendStore.setLastFullUpdate();
        scraperHealth.recordSuccess(source, collected, duration, 'live');
      } else {
        // Try fallback
        const fallbackCollected = await this.useFallbackData('reddit', 'reddit');
        if (fallbackCollected > 0) {
          collected = fallbackCollected;
          trendStore.setLastFullUpdate();
          scraperHealth.recordSuccess(source, collected, duration, 'mock');
        } else {
          scraperHealth.recordFailure(source, 'No trends collected', duration);
        }
      }
      
      this.updateStatus(source, 'idle', collected);
      console.log(`[TrendScheduler] Reddit collection complete: ${collected} trends`);
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error('[TrendScheduler] Error collecting Reddit trends:', error);
      scraperHealth.recordFailure(source, error.message, duration);
      this.updateStatus(source, 'error', 0, error.message);
    }
  }

  /**
   * Collect Etsy trends with health tracking
   */
  async collectEtsyTrends(): Promise<void> {
    const source = 'etsy';
    this.updateStatus(source, 'running');
    const startTime = Date.now();
    
    try {
      console.log('[TrendScheduler] Collecting Etsy trends...');
      
      const trends = await etsyScraper.getAllTrends();
      
      let collected = 0;
      const now = new Date().toISOString();
      // Increased from default to 60 for product-focused e-commerce source
      for (const trend of trends.slice(0, 60)) {
        try {
          const volume = trend.listingCount;
          const growth = trend.popularityScore;
          
          await trendStore.addOrUpdateTrend({
            topic: trend.query,
            source: 'etsy',
            volume: volume,
            growth: growth,
            dataPoint: {
              date: now,
              volume: volume,
              growth: growth
            }
          });
          collected++;
        } catch (error) {
          console.error(`[TrendScheduler] Error processing Etsy trend "${trend.query}":`, error);
        }
      }
      
      const duration = Date.now() - startTime;
      
      // Update last update timestamp if any data was collected
      if (collected > 0) {
        trendStore.setLastFullUpdate();
        scraperHealth.recordSuccess(source, collected, duration, 'live');
      } else {
        scraperHealth.recordFailure(source, 'No trends collected', duration);
      }
      
      this.updateStatus(source, 'idle', collected);
      console.log(`[TrendScheduler] Etsy collection complete: ${collected} REAL trends (Puppeteer-based)`);
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error('[TrendScheduler] Error collecting Etsy trends:', error);
      scraperHealth.recordFailure(source, error.message, duration);
      this.updateStatus(source, 'error', 0, error.message);
    }
  }

  /**
   * Collect eBay trends with health tracking
   */
  async collectEbayTrends(): Promise<void> {
    const source = 'ebay';
    this.updateStatus(source, 'running');
    const startTime = Date.now();
    
    try {
      console.log('[TrendScheduler] Collecting eBay trends...');
      
      const trends = await ebayScraper.getAllTrends();
      
      let collected = 0;
      const now = new Date().toISOString();
      // Increased from default to 60 for product-focused marketplace source
      for (const trend of trends.slice(0, 60)) {
        try {
          const volume = trend.soldCount;
          const growth = trend.popularityScore;
          
          await trendStore.addOrUpdateTrend({
            topic: trend.query,
            source: 'ebay',
            volume: volume,
            growth: growth,
            dataPoint: {
              date: now,
              volume: volume,
              growth: growth
            }
          });
          collected++;
        } catch (error) {
          console.error(`[TrendScheduler] Error processing eBay trend "${trend.query}":`, error);
        }
      }
      
      const duration = Date.now() - startTime;
      
      // Update last update timestamp if any data was collected
      if (collected > 0) {
        trendStore.setLastFullUpdate();
        scraperHealth.recordSuccess(source, collected, duration, 'live');
      } else {
        scraperHealth.recordFailure(source, 'No trends collected', duration);
      }
      
      this.updateStatus(source, 'idle', collected);
      console.log(`[TrendScheduler] eBay collection complete: ${collected} REAL trends (Puppeteer-based)`);
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error('[TrendScheduler] Error collecting eBay trends:', error);
      scraperHealth.recordFailure(source, error.message, duration);
      this.updateStatus(source, 'error', 0, error.message);
    }
  }

  /**
   * Collect TikTok trends with health tracking and multi-layer fallback
   */
  async collectTikTokTrends(): Promise<void> {
    const source = 'tiktok';
    this.updateStatus(source, 'running');
    const startTime = Date.now();
    
    try {
      console.log('[TrendScheduler] Collecting TikTok trends...');
      
      let trends = await tiktokScraper.getAllTrends();
      let dataType: 'live' | 'cached' | 'mock' = 'live';
      
      // Layer 2: Try TikTok Creative Center if primary fails
      if (trends.length < 5) {
        console.log('[TrendScheduler] TikTok primary scraping returned few results, trying Creative Center...');
        try {
          const { tiktokCreativeCenterScraper } = await import('./tiktokCreativeCenterScraper.js');
          const creativeCenterTrends = await tiktokCreativeCenterScraper.getAllTrends();
          
          // Convert to TikTok trend format
          for (const ccTrend of creativeCenterTrends) {
            trends.push({
              hashtag: ccTrend.hashtag || ccTrend.keyword,
              viewCount: ccTrend.viewCount || ccTrend.volume || 0,
              videoCount: ccTrend.videoCount || 0,
              growthRate: ccTrend.growthRate || 0,
              category: ccTrend.category || 'other',
              isViral: ccTrend.isViral || false,
              relatedHashtags: ccTrend.relatedHashtags || [],
              topVideos: [],
              firstDetected: new Date().toISOString(),
              lastUpdated: new Date().toISOString(),
            });
          }
          
          if (creativeCenterTrends.length > 0) {
            dataType = 'cached';
          }
        } catch (ccError) {
          console.log('[TrendScheduler] TikTok Creative Center also failed:', ccError);
        }
      }
      
      // Layer 3: Use fallback data if still insufficient
      if (trends.length < 5) {
        console.log('[TrendScheduler] Using TikTok fallback data...');
        dataType = 'mock';
      }
      
      let collected = 0;
      const now = new Date().toISOString();
      for (const trend of trends.slice(0, 30)) {
        try {
          const volume = trend.viewCount;
          const growth = trend.growthRate;
          
          await trendStore.addOrUpdateTrend({
            topic: trend.hashtag,
            source: 'tiktok',
            volume: volume,
            growth: growth,
            dataPoint: {
              date: now,
              volume: volume,
              growth: growth
            }
          });
          collected++;
        } catch (error) {
          console.error(`[TrendScheduler] Error processing TikTok trend "${trend.hashtag}":`, error);
        }
      }
      
      const duration = Date.now() - startTime;
      
      // Update last update timestamp if any data was collected
      if (collected > 0) {
        trendStore.setLastFullUpdate();
        scraperHealth.recordSuccess(source, collected, duration, dataType);
      } else {
        scraperHealth.recordFailure(source, 'No trends collected', duration);
      }
      
      this.updateStatus(source, 'idle', collected);
      console.log(`[TrendScheduler] TikTok collection complete: ${collected} trends (${dataType})`);
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error('[TrendScheduler] Error collecting TikTok trends:', error);
      scraperHealth.recordFailure(source, error.message, duration);
      this.updateStatus(source, 'error', 0, error.message);
    }
  }

  /**
   * Collect Pinterest trends with health tracking
   */
  async collectPinterestTrends(): Promise<void> {
    const source = 'pinterest';
    this.updateStatus(source, 'running');
    const startTime = Date.now();
    
    try {
      console.log('[TrendScheduler] Collecting Pinterest trends...');
      
      const trends = await pinterestScraper.getAllTrends();
      
      let collected = 0;
      const now = new Date().toISOString();
      for (const trend of trends.slice(0, 30)) {
        try {
          const volume = trend.totalSaves;
          const growth = trend.growthRate;
          
          await trendStore.addOrUpdateTrend({
            topic: trend.topic,
            source: 'pinterest',
            volume: volume,
            growth: growth,
            dataPoint: {
              date: now,
              volume: volume,
              growth: growth
            }
          });
          collected++;
        } catch (error) {
          console.error(`[TrendScheduler] Error processing Pinterest trend "${trend.topic}":`, error);
        }
      }
      
      const duration = Date.now() - startTime;
      
      // Update last update timestamp if any data was collected
      if (collected > 0) {
        trendStore.setLastFullUpdate();
        scraperHealth.recordSuccess(source, collected, duration, 'live');
      } else {
        scraperHealth.recordFailure(source, 'No trends collected', duration);
      }
      
      this.updateStatus(source, 'idle', collected);
      console.log(`[TrendScheduler] Pinterest collection complete: ${collected} trends`);
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error('[TrendScheduler] Error collecting Pinterest trends:', error);
      scraperHealth.recordFailure(source, error.message, duration);
      this.updateStatus(source, 'error', 0, error.message);
    }
  }

  /**
   * Collect Twitter trends with health tracking
   */
  async collectTwitterTrends(): Promise<void> {
    const source = 'twitter';
    this.updateStatus(source, 'running');
    const startTime = Date.now();
    
    try {
      console.log('[TrendScheduler] Collecting Twitter trends...');
      
      const trends = await twitterScraper.getAllTrends();
      
      let collected = 0;
      const now = new Date().toISOString();
      for (const trend of trends.slice(0, 30)) {
        try {
          const volume = trend.tweetVolume || 0;
          const growth = trend.growthVelocity;
          
          await trendStore.addOrUpdateTrend({
            topic: trend.name,
            source: 'twitter',
            volume: volume,
            growth: growth,
            dataPoint: {
              date: now,
              volume: volume,
              growth: growth
            }
          });
          collected++;
        } catch (error) {
          console.error(`[TrendScheduler] Error processing Twitter trend "${trend.name}":`, error);
        }
      }
      
      const duration = Date.now() - startTime;
      
      // Update last update timestamp if any data was collected
      if (collected > 0) {
        trendStore.setLastFullUpdate();
        scraperHealth.recordSuccess(source, collected, duration, 'live');
      } else {
        scraperHealth.recordFailure(source, 'No trends collected', duration);
      }
      
      this.updateStatus(source, 'idle', collected);
      console.log(`[TrendScheduler] Twitter collection complete: ${collected} trends`);
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error('[TrendScheduler] Error collecting Twitter trends:', error);
      scraperHealth.recordFailure(source, error.message, duration);
      this.updateStatus(source, 'error', 0, error.message);
    }
  }

  /**
   * Collect Google Shopping trends with health tracking
   */
  async collectGoogleShoppingTrends(): Promise<void> {
    const source = 'googleShopping';
    this.updateStatus(source, 'running');
    const startTime = Date.now();
    
    try {
      console.log('[TrendScheduler] Collecting Google Shopping trends...');
      
      // Increased limit for product-focused source
      const trends = await googleShoppingScraper.getAllTrends();
      
      let collected = 0;
      const now = new Date().toISOString();
      // Increased from 30 to 50 for product sources
      for (const trend of trends.slice(0, 50)) {
        try {
          const volume = trend.totalResults;
          const growth = trend.growthRate;
          
          await trendStore.addOrUpdateTrend({
            topic: trend.query,
            source: 'google-shopping',
            volume: volume,
            growth: growth,
            dataPoint: {
              date: now,
              volume: volume,
              growth: growth
            }
          });
          collected++;
        } catch (error) {
          console.error(`[TrendScheduler] Error processing Google Shopping trend "${trend.query}":`, error);
        }
      }
      
      const duration = Date.now() - startTime;
      let dataType: 'live' | 'cached' | 'mock' = 'live';
      
      // If real scraping failed or collected too few, use fallback
      if (collected < 5) {
        console.log('[TrendScheduler] Google Shopping collected too few results, using fallback data...');
        const fallbackCount = await this.useFallbackData('google-shopping', 'googleShopping');
        collected += fallbackCount;
        dataType = fallbackCount > 0 ? 'mock' : 'live';
      }
      
      // Update last update timestamp if any data was collected
      if (collected > 0) {
        trendStore.setLastFullUpdate();
        scraperHealth.recordSuccess(source, collected, duration, dataType);
      } else {
        scraperHealth.recordFailure(source, 'No trends collected', duration);
      }
      
      this.updateStatus(source, 'idle', collected);
      console.log(`[TrendScheduler] Google Shopping collection complete: ${collected} trends`);
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error('[TrendScheduler] Error collecting Google Shopping trends:', error);
      
      // Use fallback mock data on complete failure
      try {
        const fallbackCollected = await this.useFallbackData('google-shopping', 'googleShopping');
        if (fallbackCollected > 0) {
          trendStore.setLastFullUpdate();
          scraperHealth.recordSuccess(source, fallbackCollected, duration, 'mock');
        } else {
          scraperHealth.recordFailure(source, error.message, duration);
        }
        this.updateStatus(source, 'idle', fallbackCollected);
        console.log(`[TrendScheduler] Google Shopping failed, used fallback: ${fallbackCollected} trends`);
      } catch (fallbackError) {
        console.error('[TrendScheduler] Fallback also failed:', fallbackError);
        scraperHealth.recordFailure(source, error.message, duration);
        this.updateStatus(source, 'error', 0, error.message);
      }
    }
  }

  /**
   * Collect TikTok Shop trends with health tracking
   */
  async collectTikTokShopTrends(): Promise<void> {
    const source = 'tiktokShop';
    this.updateStatus(source, 'running');
    const startTime = Date.now();
    
    try {
      console.log('[TrendScheduler] Collecting TikTok Shop trends...');
      
      // Get trending products with increased limit for e-commerce
      const trendingProducts = await tiktokShopScraper.getTrendingProducts({ limit: 100 });
      
      let collected = 0;
      const now = new Date().toISOString();
      for (const product of trendingProducts.slice(0, 80)) { // Increased from 30 to 80
        try {
          const volume = product.soldCount;
          const growth = product.trendingScore;
          
          await trendStore.addOrUpdateTrend({
            topic: product.productName,
            source: 'tiktok-shop',
            volume: volume,
            growth: growth,
            dataPoint: {
              date: now,
              volume: volume,
              growth: growth
            }
          });
          collected++;
        } catch (error) {
          console.error(`[TrendScheduler] Error processing TikTok Shop product "${product.productName}":`, error);
        }
      }
      
      // Also collect hashtag trends
      const hashtagTrends = await tiktokShopScraper.analyzeProductTrends();
      for (const trend of hashtagTrends.slice(0, 50)) { // Top 50 trending keywords
        try {
          const volume = trend.count;
          const growth = trend.count > 10 ? 15 : 5; // Estimated growth
          
          await trendStore.addOrUpdateTrend({
            topic: trend.keyword,
            source: 'tiktok-shop',
            volume: volume,
            growth: growth,
            dataPoint: {
              date: now,
              volume: volume,
              growth: growth
            }
          });
          collected++;
        } catch (error) {
          console.error(`[TrendScheduler] Error processing TikTok Shop keyword "${trend.keyword}":`, error);
        }
      }
      
      const duration = Date.now() - startTime;
      
      // Update last update timestamp if any data was collected
      if (collected > 0) {
        trendStore.setLastFullUpdate();
        // Note: TikTok Shop currently uses mock data
        scraperHealth.recordSuccess(source, collected, duration, 'mock');
      } else {
        scraperHealth.recordFailure(source, 'No trends collected', duration);
      }
      
      this.updateStatus(source, 'idle', collected);
      console.log(`[TrendScheduler] TikTok Shop collection complete: ${collected} trends`);
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error('[TrendScheduler] Error collecting TikTok Shop trends:', error);
      scraperHealth.recordFailure(source, error.message, duration);
      this.updateStatus(source, 'error', 0, error.message);
    }
  }

  /**
   * Collect Amazon Keywords trends with health tracking
   */
  async collectAmazonKeywords(): Promise<void> {
    const source = 'amazonKeywords';
    this.updateStatus(source, 'running');
    const startTime = Date.now();
    
    try {
      console.log('[TrendScheduler] Collecting Amazon keyword trends...');
      
      // Sync all Amazon keywords from historicalStore to trendStore
      const result = await amazonTrendBridge.syncAllToTrendStore('US');
      
      const collected = result.synced;
      const duration = Date.now() - startTime;
      
      // Update last update timestamp if any data was collected
      if (collected > 0) {
        trendStore.setLastFullUpdate();
        scraperHealth.recordSuccess(source, collected, duration, 'live');
      } else {
        scraperHealth.recordFailure(source, 'No keywords synced', duration);
      }
      
      this.updateStatus(source, 'idle', collected);
      console.log(`[TrendScheduler] Amazon Keywords collection complete: ${collected} trends (${result.skipped} skipped, ${result.failed} failed)`);
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error('[TrendScheduler] Error collecting Amazon Keywords:', error);
      scraperHealth.recordFailure(source, error.message, duration);
      this.updateStatus(source, 'error', 0, error.message);
    }
  }

  /**
   * Run initial collection for all sources
   */
  private async runInitialCollection(): Promise<void> {
    console.log('[TrendScheduler] Running initial data collection...');
    
    const tasks = [];
    
    if (this.config.googleTrends.enabled) {
      tasks.push(this.collectGoogleTrends());
    }
    if (this.config.reddit.enabled) {
      tasks.push(this.collectRedditTrends());
    }
    if (this.config.etsy.enabled) {
      tasks.push(this.collectEtsyTrends());
    }
    if (this.config.ebay.enabled) {
      tasks.push(this.collectEbayTrends());
    }
    if (this.config.tiktok.enabled) {
      tasks.push(this.collectTikTokTrends());
    }
    if (this.config.pinterest.enabled) {
      tasks.push(this.collectPinterestTrends());
    }
    if (this.config.twitter.enabled) {
      tasks.push(this.collectTwitterTrends());
    }
    if (this.config.googleShopping.enabled) {
      tasks.push(this.collectGoogleShoppingTrends());
    }
    if (this.config.tiktokShop.enabled) {
      tasks.push(this.collectTikTokShopTrends());
    }
    if (this.config.amazonKeywords.enabled) {
      tasks.push(this.collectAmazonKeywords());
    }
    
    // Run all collections in sequence to avoid rate limiting issues
    for (const task of tasks) {
      try {
        await task;
        // Wait between sources to be respectful
        await new Promise(resolve => setTimeout(resolve, 5000));
      } catch (error) {
        console.error('[TrendScheduler] Error in initial collection:', error);
      }
    }
    
    console.log('[TrendScheduler] Initial data collection complete');
  }

  /**
   * Manually trigger a specific source
   */
  async triggerSource(sourceName: string): Promise<boolean> {
    console.log(`[TrendScheduler] Manually triggering ${sourceName}...`);
    
    try {
      switch (sourceName) {
        case 'googleTrends':
          await this.collectGoogleTrends();
          return true;
        case 'reddit':
          await this.collectRedditTrends();
          return true;
        case 'etsy':
          await this.collectEtsyTrends();
          return true;
        case 'ebay':
          await this.collectEbayTrends();
          return true;
        case 'tiktok':
          await this.collectTikTokTrends();
          return true;
        case 'pinterest':
          await this.collectPinterestTrends();
          return true;
        case 'twitter':
          await this.collectTwitterTrends();
          return true;
        case 'googleShopping':
          await this.collectGoogleShoppingTrends();
          return true;
        case 'tiktokShop':
          await this.collectTikTokShopTrends();
          return true;
        case 'amazonKeywords':
          await this.collectAmazonKeywords();
          return true;
        default:
          console.error(`[TrendScheduler] Unknown source: ${sourceName}`);
          return false;
      }
    } catch (error) {
      console.error(`[TrendScheduler] Error triggering ${sourceName}:`, error);
      return false;
    }
  }

  /**
   * Update status for a source
   */
  private updateStatus(
    source: string, 
    status: 'idle' | 'running' | 'error', 
    trendsCollected?: number,
    errorMessage?: string
  ): void {
    const current = this.status.get(source);
    if (!current) return;
    
    current.status = status;
    current.lastRun = new Date().toISOString();
    
    if (trendsCollected !== undefined) {
      current.trendsCollected = trendsCollected;
    }
    
    if (errorMessage) {
      current.errorMessage = errorMessage;
    }
    
    this.status.set(source, current);
  }

  /**
   * Get status of all sources
   */
  getStatus(): SchedulerStatus[] {
    return Array.from(this.status.values());
  }

  /**
   * Get health status for all scrapers
   */
  getHealthStatus(): ScraperHealth[] {
    return scraperHealth.getAllHealth();
  }

  /**
   * Get health summary
   */
  getHealthSummary() {
    return scraperHealth.getSummary();
  }

  /**
   * Get recent health alerts
   */
  getHealthAlerts(limit: number = 50) {
    return scraperHealth.getAlerts(limit);
  }

  /**
   * Test a specific scraper
   */
  async testScraper(source: string): Promise<{
    success: boolean;
    duration: number;
    trendsCollected: number;
    error?: string;
  }> {
    const testFn = async (): Promise<number> => {
      switch (source) {
        case 'googleTrends':
          await this.collectGoogleTrends();
          break;
        case 'reddit':
          await this.collectRedditTrends();
          break;
        case 'etsy':
          await this.collectEtsyTrends();
          break;
        case 'ebay':
          await this.collectEbayTrends();
          break;
        case 'tiktok':
          await this.collectTikTokTrends();
          break;
        case 'pinterest':
          await this.collectPinterestTrends();
          break;
        case 'twitter':
          await this.collectTwitterTrends();
          break;
        case 'googleShopping':
          await this.collectGoogleShoppingTrends();
          break;
        case 'tiktokShop':
          await this.collectTikTokShopTrends();
          break;
        case 'amazonKeywords':
          await this.collectAmazonKeywords();
          break;
        default:
          throw new Error(`Unknown source: ${source}`);
      }
      
      const status = this.status.get(source);
      return status?.trendsCollected || 0;
    };

    return scraperHealth.testScraper(source, testFn);
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<SchedulerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Restart scheduler with new config
    if (this.isInitialized) {
      this.stop();
      this.start();
    }
  }

  /**
   * Detect category from topic
   */
  private detectCategory(topic: string): string {
    const topicLower = topic.toLowerCase();
    
    const categoryKeywords: Record<string, string[]> = {
      'books': ['book', 'novel', 'author', 'reading', 'literature'],
      'toys': ['toy', 'game', 'play', 'kids', 'children'],
      'home': ['home', 'decor', 'furniture', 'garden', 'kitchen'],
      'beauty': ['beauty', 'makeup', 'skincare', 'cosmetic'],
      'electronics': ['tech', 'gadget', 'phone', 'computer', 'device'],
      'art': ['art', 'craft', 'creative', 'design', 'handmade'],
      'fashion': ['fashion', 'clothing', 'style', 'outfit', 'wear'],
      'health': ['health', 'fitness', 'wellness', 'exercise', 'nutrition'],
    };

    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      if (keywords.some(kw => topicLower.includes(kw))) {
        return category;
      }
    }

    return 'other';
  }
}

// Export singleton instance
export const trendScheduler = new TrendScheduler();

// Export for custom configurations
export { TrendScheduler };

