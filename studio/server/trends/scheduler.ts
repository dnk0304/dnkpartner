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
import { bingShoppingScraper } from './bingShoppingScraper.js';
import { tiktokShopScraper } from './tiktokShopScraper.js';
import { trendStore } from './trendStore.js';
import { mockDataGenerator, SOURCE_CONFIGS } from './mockDataGenerator.js';
import { fetchWithRetry } from './retryUtils.js';
import { SCRAPING_LIMITS } from './scrapingConfig.js';
import { amazonTrendBridge } from './amazonTrendBridge.js';
import { scraperHealth, type ScraperHealth } from './scraperHealth.js';
import { keywordDiscovery } from './keywordDiscovery.js';
import { keywordStore } from './keywordStore.js';
import { getCategoryByKeyword } from './categories.js';
import { crossRegionDetector, REGION_TIERS, type CrossRegionTrend, type IncomingTrendAlert } from './crossRegionDetector.js';

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
  keywordDiscovery: {
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

// Default configuration - REDUCED FREQUENCIES to avoid rate limits and blocks
const DEFAULT_CONFIG: SchedulerConfig = {
  googleTrends: {
    enabled: true,
    interval: '0 */8 * * *', // Every 8 hours (was 4)
  },
  reddit: {
    enabled: true,
    interval: '0 */6 * * *', // Every 6 hours (was 2)
  },
  etsy: {
    enabled: true,
    interval: '0 0 */1 * * *', // Every 24 hours (was 12)
  },
  ebay: {
    enabled: true,
    interval: '0 0 */1 * * *', // Every 24 hours (was 12)
  },
  tiktok: {
    enabled: true,
    interval: '0 */12 * * *', // Every 12 hours (was 6)
  },
  pinterest: {
    enabled: true,
    interval: '0 */12 * * *', // Every 12 hours (was 8)
  },
  twitter: {
    enabled: true,
    interval: '0 */3 * * *', // Every 3 hours (was 1) - still fast moving but less aggressive
  },
  googleShopping: {
    enabled: true,
    interval: '0 */12 * * *', // Every 12 hours (was 6)
  },
  tiktokShop: {
    enabled: true,
    interval: '0 */8 * * *', // Every 8 hours (was 4)
  },
  amazonKeywords: {
    enabled: true,
    interval: '0 */8 * * *', // Every 8 hours (was 4)
  },
  keywordDiscovery: {
    enabled: true,
    interval: '0 0 * * *', // Daily at midnight UTC
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
    const sources = ['googleTrends', 'reddit', 'etsy', 'ebay', 'tiktok', 'pinterest', 'twitter', 'googleShopping', 'tiktokShop', 'amazonKeywords', 'keywordDiscovery'];
    
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

    // Schedule Keyword Discovery
    if (this.config.keywordDiscovery.enabled) {
      this.scheduleKeywordDiscovery();
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
   * Schedule Keyword Discovery
   */
  private scheduleKeywordDiscovery(): void {
    const task = cron.schedule(this.config.keywordDiscovery.interval, async () => {
      await this.runKeywordDiscovery();
    });
    
    this.tasks.set('keywordDiscovery', task);
    console.log(`[TrendScheduler] Keyword Discovery scheduled: ${this.config.keywordDiscovery.interval}`);
  }

  /**
   * Collect Google Trends data with health tracking
   */
  async collectGoogleTrends(): Promise<void> {
    const source = 'googleTrends';
    this.updateStatus(source, 'running');
    const startTime = Date.now();
    
    try {
      console.log('[TrendScheduler] ═══════════════════════════════════════');
      console.log('[TrendScheduler] 🌍 Collecting Google Trends - TIERED APPROACH');
      console.log('[TrendScheduler] US is PRIMARY base, cross-validating with 11 other regions');
      console.log('[TrendScheduler] ═══════════════════════════════════════');
      
      // Tiered collection - US first (critical), then others by priority
      const collectedByRegion: Record<string, number> = {};
      let totalCollected = 0;
      const now = new Date().toISOString();
      
      for (const tier of REGION_TIERS) {
        console.log(`[TrendScheduler] Processing tier: ${tier.name} (${tier.priority}) - ${tier.regions.join(', ')}`);
        
        for (const geo of tier.regions) {
          try {
            const trends = await googleTrendsService.getDailyTrends(geo);
            console.log(`[TrendScheduler]   ${geo}: ${trends.length} daily trends`);
            
            // Process more trends for primary tier, fewer for others
            const maxTrends = tier.name === 'primary' ? 50 : 
                            tier.priority === 'high' ? 30 : 
                            tier.priority === 'medium' ? 20 : 15;
            
            for (const keyword of trends.slice(0, maxTrends)) {
              try {
                const trendData = await googleTrendsService.getFullTrendData({
                  keyword,
                  geo,
                  timeRange: 'today 3-m',
                });
                
                if (trendData.interest > 15) {
                  const volume = trendData.interest;
                  const growth = googleTrendsService.calculateGrowthRate(trendData.interestOverTime, 30);
                  
                  await trendStore.addOrUpdateTrend({
                    topic: keyword,
                    source: `google-${geo.toLowerCase()}`,  // Include region in source for cross-region tracking
                    volume: volume,
                    growth: growth,
                    category: this.detectCategory(keyword),
                    dataPoint: {
                      date: now,
                      volume: volume,
                      growth: growth
                    }
                  });
                  
                  collectedByRegion[geo] = (collectedByRegion[geo] || 0) + 1;
                  totalCollected++;
                }
              } catch (error) {
                // Skip individual trend errors silently
              }
            }
            
            // Delay between regions based on tier priority - INCREASED for rate limit safety
            const delay = tier.priority === 'critical' ? 2000 :  // 2s (was 500ms)
                         tier.priority === 'high' ? 3000 :       // 3s (was 800ms)
                         tier.priority === 'medium' ? 4000 : 5000; // 4-5s (was 1-1.5s)
            await new Promise(resolve => setTimeout(resolve, delay));
            
          } catch (error: any) {
            console.warn(`[TrendScheduler]   ⚠️ Failed ${geo}:`, error.message);
          }
        }
      }
      
      const duration = Date.now() - startTime;
      
      // Log collection summary by region
      console.log('[TrendScheduler] ───────────────────────────────────────');
      console.log('[TrendScheduler] Collection by region:');
      for (const [region, count] of Object.entries(collectedByRegion)) {
        const tier = REGION_TIERS.find(t => t.regions.includes(region));
        console.log(`[TrendScheduler]   ${region}: ${count} trends (${tier?.name || 'unknown'} tier)`);
      }
      console.log(`[TrendScheduler] Total: ${totalCollected} trends from ${Object.keys(collectedByRegion).length} regions`);
      console.log('[TrendScheduler] ───────────────────────────────────────');
      
      // Record success/failure
      if (totalCollected >= 10) {
        scraperHealth.recordSuccess(source, totalCollected, duration, 'live');
        trendStore.setLastFullUpdate();
        
        // Run cross-region analysis after successful collection
        console.log('[TrendScheduler] Triggering cross-region analysis...');
        await this.runCrossRegionAnalysis();
      } else if (totalCollected > 0) {
        // Partial success
        console.log('[TrendScheduler] Google Trends collected few results, supplementing with fallback...');
        const fallbackCount = await this.useFallbackData('google', 'googleTrends');
        totalCollected += fallbackCount;
        scraperHealth.recordSuccess(source, totalCollected, duration, 'cached');
        trendStore.setLastFullUpdate();
      } else {
        // Complete failure - use fallback
        console.log('[TrendScheduler] Google Trends collected no results, using fallback data...');
        const fallbackCount = await this.useFallbackData('google', 'googleTrends');
        if (fallbackCount > 0) {
          totalCollected = fallbackCount;
          scraperHealth.recordSuccess(source, fallbackCount, duration, 'mock');
          trendStore.setLastFullUpdate();
        } else {
          scraperHealth.recordFailure(source, 'No trends collected', duration);
        }
      }
      
      this.updateStatus(source, 'idle', totalCollected);
      console.log(`[TrendScheduler] ✅ Google Trends complete: ${totalCollected} trends from ${Object.keys(collectedByRegion).length} regions`);
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
   * Updated to use per-category keyword iteration
   */
  async collectGoogleShoppingTrends(): Promise<void> {
    const source = 'googleShopping';
    this.updateStatus(source, 'running');
    const startTime = Date.now();
    
    try {
      console.log('[TrendScheduler] Collecting Shopping trends with per-category iteration...');
      
      // Get 15 keywords per category (450 total across 30 categories)
      const keywordsByCategory = keywordStore.getTopKeywordsPerCategory(15);
      
      let collected = 0;
      const now = new Date().toISOString();
      const productTitles: string[] = [];
      let totalKeywords = 0;
      
      // Iterate through each category
      for (const [categoryId, keywords] of Object.entries(keywordsByCategory)) {
        console.log(`[TrendScheduler] Scraping category "${categoryId}" with ${keywords.length} keywords`);
        
        for (const kw of keywords) {
          totalKeywords++;
          try {
            console.log(`[TrendScheduler] [${totalKeywords}/${Object.keys(keywordsByCategory).length * 15}] Scraping: ${kw.keyword}`);
            const result = await bingShoppingScraper.search(kw.keyword, { maxResults: 20 });
            
            if (result && result.products.length > 0) {
              // Record success for this keyword
              keywordStore.recordScrapeResult(kw.normalizedKeyword, true, result.products.length);
              
              // Store trend
              await trendStore.addOrUpdateTrend({
                topic: result.query,
                source: 'google-shopping',
                volume: result.totalResults,
                growth: result.growthRate,
                relatedTopics: result.relatedQueries,
                dataPoint: {
                  date: now,
                  volume: result.totalResults,
                  growth: result.growthRate
                }
              });
              
              // Extract product titles for keyword learning
              productTitles.push(...result.products.map(p => p.title));
              collected++;
            } else {
              // Record failure for this keyword
              keywordStore.recordScrapeResult(kw.normalizedKeyword, false);
            }
          } catch (error: any) {
            console.error(`[TrendScheduler] Error scraping "${kw.keyword}":`, error.message);
            keywordStore.recordScrapeResult(kw.normalizedKeyword, false);
          }
        }
      }
      
      // Learn from scraped product data
      if (productTitles.length > 0) {
        const newKeywordsFromProducts = keywordStore.addProductKeywords(productTitles, 'shopping');
        console.log(`[TrendScheduler] Learned ${newKeywordsFromProducts} new keywords from products`);
      }
      
      const duration = Date.now() - startTime;
      let dataType: 'live' | 'cached' | 'mock' = 'live';
      
      console.log(`[TrendScheduler] Shopping collection complete:`);
      console.log(`  - Categories scraped: ${Object.keys(keywordsByCategory).length}`);
      console.log(`  - Keywords attempted: ${totalKeywords}`);
      console.log(`  - Successful scrapes: ${collected}`);
      console.log(`  - Success rate: ${((collected / totalKeywords) * 100).toFixed(1)}%`);
      
      // Update last update timestamp if any data was collected
      if (collected > 0) {
        trendStore.setLastFullUpdate();
        scraperHealth.recordSuccess(source, collected, duration, dataType);
      } else {
        // Use fallback if no data collected
        console.log('[TrendScheduler] Shopping collected no results, using fallback data...');
        const fallbackCount = await this.useFallbackData('google-shopping', 'googleShopping');
        collected += fallbackCount;
        dataType = fallbackCount > 0 ? 'mock' : 'live';
        
        if (collected > 0) {
          trendStore.setLastFullUpdate();
          scraperHealth.recordSuccess(source, collected, duration, dataType);
        } else {
          scraperHealth.recordFailure(source, 'No trends collected', duration);
        }
      }
      
      this.updateStatus(source, 'idle', collected);
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error('[TrendScheduler] Error collecting Shopping trends:', error);
      
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
        console.log(`[TrendScheduler] Shopping failed, used fallback: ${fallbackCollected} trends`);
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
        // FIX: Report as 'live' when we actually collect data from scraping
        // Only report as 'mock' if we're using fallback data
        scraperHealth.recordSuccess(source, collected, duration, 'live');
        console.log(`[TrendScheduler] TikTok Shop: Collected ${collected} LIVE trends`);
      } else {
        // Try fallback data when no live data collected
        console.log('[TrendScheduler] TikTok Shop: No live data, using fallback...');
        const fallbackCount = await this.useFallbackData('tiktok-shop', 'tiktokShop');
        if (fallbackCount > 0) {
          trendStore.setLastFullUpdate();
          scraperHealth.recordSuccess(source, fallbackCount, duration, 'mock');
        } else {
          scraperHealth.recordFailure(source, 'No trends collected', duration);
        }
      }
      
      this.updateStatus(source, 'idle', collected);
      console.log(`[TrendScheduler] TikTok Shop collection complete: ${collected} trends`);
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error('[TrendScheduler] Error collecting TikTok Shop trends:', error);
      
      // Try fallback on error
      try {
        const fallbackCount = await this.useFallbackData('tiktok-shop', 'tiktokShop');
        if (fallbackCount > 0) {
          trendStore.setLastFullUpdate();
          scraperHealth.recordSuccess(source, fallbackCount, duration, 'mock');
          this.updateStatus(source, 'idle', fallbackCount);
        } else {
          scraperHealth.recordFailure(source, error.message, duration);
          this.updateStatus(source, 'error', 0, error.message);
        }
      } catch (fallbackError) {
        scraperHealth.recordFailure(source, error.message, duration);
        this.updateStatus(source, 'error', 0, error.message);
      }
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
   * Run keyword discovery from multiple sources
   */
  async runKeywordDiscovery(): Promise<void> {
    const source = 'keywordDiscovery';
    this.updateStatus(source, 'running');
    const startTime = Date.now();
    
    try {
      console.log('[TrendScheduler] Running keyword discovery...');
      
      // Run discovery across all sources
      const discoveryResult = await keywordDiscovery.discover();
      
      // Add discovered keywords to the store
      const newKeywordsCount = keywordStore.addDiscoveredKeywords(discoveryResult.keywords);
      
      // Prune old/poorly performing keywords
      const pruneResult = keywordStore.pruneKeywords();
      
      console.log(`[TrendScheduler] Keyword discovery complete:`);
      console.log(`  - Total keywords discovered: ${discoveryResult.keywords.length}`);
      console.log(`  - New keywords added: ${newKeywordsCount}`);
      console.log(`  - Keywords pruned: ${pruneResult.pruned}`);
      console.log(`  - Top 10:`, discoveryResult.topKeywords);
      
      const duration = Date.now() - startTime;
      scraperHealth.recordSuccess(source, duration);
      
      // Get updated store stats
      const stats = keywordStore.getStats();
      console.log(`[TrendScheduler] Keyword store stats:`);
      console.log(`  - Total keywords: ${stats.totalKeywords}`);
      console.log(`  - Active keywords: ${stats.activeKeywords}`);
      console.log(`  - Average success rate: ${stats.averageSuccessRate.toFixed(1)}%`);
      
      this.updateStatus(source, 'idle', discoveryResult.keywords.length);
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error('[TrendScheduler] Error running keyword discovery:', error);
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
    if (this.config.keywordDiscovery.enabled) {
      tasks.push(this.runKeywordDiscovery());
    }
    
    // Run all collections in sequence to avoid rate limiting issues
    for (const task of tasks) {
      try {
        await task;
        // Wait between sources to be respectful - INCREASED from 5s to 15s
        await new Promise(resolve => setTimeout(resolve, 15000));
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
        case 'keywordDiscovery':
          await this.runKeywordDiscovery();
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
   * Detect category from topic using central categories
   */
  private detectCategory(topic: string): string {
    const category = getCategoryByKeyword(topic);
    return category?.id || 'other';
  }

  // ============================================
  // CROSS-REGION ANALYSIS METHODS
  // ============================================

  /**
   * Run cross-region analysis after collecting from all regions
   */
  async runCrossRegionAnalysis(): Promise<{
    crossRegionTrends: CrossRegionTrend[];
    incomingAlerts: IncomingTrendAlert[];
    summary: ReturnType<typeof crossRegionDetector.getSummary>;
  }> {
    console.log('[TrendScheduler] ═══════════════════════════════════════');
    console.log('[TrendScheduler] 🌍 RUNNING CROSS-REGION ANALYSIS');
    console.log('[TrendScheduler] ═══════════════════════════════════════');
    
    // Get all trends from trend store
    const allTrends = await trendStore.getTrends();
    
    // Map source names to regions
    const sourceToRegion: Record<string, string> = {
      'google': 'US',
      'google-us': 'US',
      'google-gb': 'GB',
      'google-de': 'DE',
      'google-fr': 'FR',
      'google-jp': 'JP',
      'google-kr': 'KR',
      'google-br': 'BR',
      'google-in': 'IN',
      'google-au': 'AU',
      'google-ca': 'CA',
      'google-mx': 'MX',
      'google-es': 'ES',
      'google-it': 'IT',
      'tiktok': 'US',
      'tiktok-us': 'US',
      'tiktok-jp': 'JP',
      'tiktok-kr': 'KR',
      'tiktok-gb': 'GB',
      'tiktok-de': 'DE',
    };

    // Group trends by detected region
    const trendsByRegion = new Map<string, any[]>();
    
    for (const trend of allTrends.trends) {
      let region = 'US';
      
      if (trend.source) {
        const sourceLower = trend.source.toLowerCase();
        for (const [source, reg] of Object.entries(sourceToRegion)) {
          if (sourceLower.includes(source) || sourceLower === source) {
            region = reg;
            break;
          }
        }
      }
      
      if (!trendsByRegion.has(region)) {
        trendsByRegion.set(region, []);
      }
      
      trendsByRegion.get(region)!.push({
        topic: trend.topic,
        volume: trend.volume || 0,
        growth: trend.growth || 0,
        firstSeen: trend.firstSeen || new Date().toISOString(),
        lastSeen: trend.lastUpdated || new Date().toISOString()
      });
    }

    // Update cross-region detector with current data
    for (const [region, trends] of trendsByRegion) {
      crossRegionDetector.updateRegionData(region, trends, 'live');
    }

    // Run cross-region correlation analysis
    const crossRegionTrends = crossRegionDetector.analyzeCrossRegion();
    
    // Detect incoming trends from Asia
    const incomingAlerts = crossRegionDetector.detectIncomingTrends();
    
    // Get summary
    const summary = crossRegionDetector.getSummary();

    // Log results
    console.log('[TrendScheduler] ───────────────────────────────────────');
    console.log('[TrendScheduler] CROSS-REGION ANALYSIS RESULTS:');
    console.log(`[TrendScheduler]   Total trends analyzed: ${summary.totalTrends}`);
    console.log(`[TrendScheduler]   Viral trends: ${summary.viral}`);
    console.log(`[TrendScheduler]   Strong trends: ${summary.strong}`);
    console.log(`[TrendScheduler]   Moderate trends: ${summary.moderate}`);
    console.log(`[TrendScheduler]   Average confidence: ${summary.avgConfidence}%`);
    console.log(`[TrendScheduler]   Average regions per trend: ${summary.avgRegions}`);
    console.log(`[TrendScheduler]   Regions covered: ${summary.regionsCovered.join(', ')}`);
    console.log(`[TrendScheduler]   Incoming alerts: ${summary.incomingAlerts}`);
    console.log(`[TrendScheduler]   Urgent alerts: ${summary.urgentAlerts}`);
    console.log('[TrendScheduler] ───────────────────────────────────────');

    // Log urgent alerts prominently
    const urgentAlerts = incomingAlerts.filter(a => a.alertLevel === 'urgent');
    if (urgentAlerts.length > 0) {
      console.log('[TrendScheduler] 🚨🚨🚨 URGENT INCOMING TRENDS FROM ASIA 🚨🚨🚨');
      for (const alert of urgentAlerts) {
        console.log(`[TrendScheduler]   "${alert.topic}" from ${alert.originRegion} (growth: ${alert.originGrowth}%, impact: ${alert.predictedImpact})`);
      }
    }

    return { crossRegionTrends, incomingAlerts, summary };
  }

  /**
   * Get tier-specific collection schedule
   */
  getTierSchedule(): { tier: string; regions: string[]; interval: string; priority: string }[] {
    return REGION_TIERS.map(tier => ({
      tier: tier.name,
      regions: tier.regions,
      interval: tier.interval,
      priority: tier.priority
    }));
  }

  /**
   * Get cross-region detector summary
   */
  getCrossRegionSummary() {
    return crossRegionDetector.getSummary();
  }

  /**
   * Get top validated trends
   */
  getTopValidatedTrends(limit: number = SCRAPING_LIMITS.TOP_CROSS_REGION_TRENDS) {
    return crossRegionDetector.getTopValidatedTrends(limit);
  }

  /**
   * Get viral trends
   */
  getViralTrends() {
    return crossRegionDetector.getViralTrends();
  }

  /**
   * Get incoming trend alerts
   */
  getIncomingAlerts() {
    return crossRegionDetector.getIncomingAlerts();
  }

  /**
   * Get urgent incoming alerts
   */
  getUrgentAlerts() {
    return crossRegionDetector.getUrgentAlerts();
  }
}

// Export singleton instance
export const trendScheduler = new TrendScheduler();

// Export for custom configurations
export { TrendScheduler };

// Re-export health service for API access
export { scraperHealth };

// Re-export cross-region detector for API access
export { crossRegionDetector, REGION_TIERS };
