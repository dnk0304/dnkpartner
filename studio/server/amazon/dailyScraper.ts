/**
 * Daily Amazon Keyword Scraper
 * Automatically scrapes tracked keywords on a daily schedule
 */

import cron from 'node-cron';
import { historicalStore } from './historicalStore';
import { queueWorker } from './queueWorker';
import { Marketplace } from './types';

interface DailyScraperConfig {
  enabled: boolean;
  schedule: string; // cron expression
  marketplace: Marketplace;
  maxConcurrent: number; // Max keywords to scrape per run
}

const DEFAULT_CONFIG: DailyScraperConfig = {
  enabled: true,
  schedule: '0 3 * * *', // Daily at 3 AM
  marketplace: 'US',
  maxConcurrent: 50, // Limit to prevent overload
};

class DailyScraper {
  private config: DailyScraperConfig;
  private task: cron.ScheduledTask | null = null;
  private isRunning = false;
  private lastRun: Date | null = null;
  private lastRunStats: {
    queued: number;
    skipped: number;
    duration: number;
  } | null = null;

  constructor(config: DailyScraperConfig = DEFAULT_CONFIG) {
    this.config = config;
  }

  /**
   * Start the daily scraping scheduler
   */
  start(): void {
    if (this.task) {
      console.log('[DailyScraper] Already running');
      return;
    }

    if (!this.config.enabled) {
      console.log('[DailyScraper] Disabled in configuration');
      return;
    }

    console.log(`[DailyScraper] Starting daily scraper with schedule: ${this.config.schedule}`);

    this.task = cron.schedule(this.config.schedule, async () => {
      await this.runDailyScrape();
    });

    console.log(`[DailyScraper] Daily scraper scheduled successfully`);
  }

  /**
   * Stop the daily scraping scheduler
   */
  stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
      console.log('[DailyScraper] Daily scraper stopped');
    }
  }

  /**
   * Run a manual scrape immediately
   */
  async runManual(): Promise<{ queued: number; skipped: number; duration: number }> {
    if (this.isRunning) {
      throw new Error('Daily scrape is already running');
    }

    console.log('[DailyScraper] Starting manual daily scrape...');
    return await this.runDailyScrape();
  }

  /**
   * Execute the daily scrape
   */
  private async runDailyScrape(): Promise<{ queued: number; skipped: number; duration: number }> {
    if (this.isRunning) {
      console.log('[DailyScraper] Scrape already in progress, skipping...');
      return { queued: 0, skipped: 0, duration: 0 };
    }

    this.isRunning = true;
    this.lastRun = new Date();
    const startTime = Date.now();

    let queued = 0;
    let skipped = 0;

    try {
      console.log(`[DailyScraper] Starting daily scrape for marketplace: ${this.config.marketplace}`);

      // Get all tracked keywords
      const keywords = historicalStore.getKeywords(this.config.marketplace);
      console.log(`[DailyScraper] Found ${keywords.length} tracked keywords`);

      if (keywords.length === 0) {
        console.log('[DailyScraper] No keywords to scrape');
        return { queued: 0, skipped: 0, duration: 0 };
      }

      // Limit to maxConcurrent to prevent overwhelming the queue
      const keywordsToScrape = keywords.slice(0, this.config.maxConcurrent);
      
      if (keywords.length > this.config.maxConcurrent) {
        console.log(
          `[DailyScraper] Limiting to ${this.config.maxConcurrent} keywords ` +
          `(${keywords.length - this.config.maxConcurrent} will be scraped next run)`
        );
      }

      // Check if keyword was recently scraped (skip if scraped today)
      for (const keyword of keywordsToScrape) {
        const historical = historicalStore.getHistorical(this.config.marketplace, keyword);
        
        if (historical && historical.snapshots.length > 0) {
          const latestSnapshot = historical.snapshots[historical.snapshots.length - 1];
          const latestDate = new Date(latestSnapshot.date);
          const today = new Date();
          
          // Skip if already scraped today
          if (
            latestDate.getFullYear() === today.getFullYear() &&
            latestDate.getMonth() === today.getMonth() &&
            latestDate.getDate() === today.getDate()
          ) {
            console.log(`[DailyScraper] Skipping "${keyword}" - already scraped today`);
            skipped++;
            continue;
          }
        }

        // Queue scrape job
        try {
          queueWorker.enqueue('KEYWORD_SNAPSHOT', {
            keyword,
            marketplace: this.config.marketplace,
          });
          
          queued++;
          console.log(`[DailyScraper] Queued scrape for: ${keyword}`);
        } catch (error) {
          console.error(`[DailyScraper] Failed to queue "${keyword}":`, error);
        }

        // Add small delay between queuing to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const duration = Date.now() - startTime;
      this.lastRunStats = { queued, skipped, duration };

      console.log(
        `[DailyScraper] Daily scrape complete - ` +
        `Queued: ${queued}, Skipped: ${skipped}, Duration: ${duration}ms`
      );

      return { queued, skipped, duration };
    } catch (error) {
      console.error('[DailyScraper] Error during daily scrape:', error);
      const duration = Date.now() - startTime;
      return { queued, skipped, duration };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Get scraper status
   */
  getStatus(): {
    enabled: boolean;
    isRunning: boolean;
    schedule: string;
    lastRun: Date | null;
    lastRunStats: { queued: number; skipped: number; duration: number } | null;
    trackedKeywords: number;
  } {
    const keywords = historicalStore.getKeywords(this.config.marketplace);
    
    return {
      enabled: this.config.enabled,
      isRunning: this.isRunning,
      schedule: this.config.schedule,
      lastRun: this.lastRun,
      lastRunStats: this.lastRunStats,
      trackedKeywords: keywords.length,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<DailyScraperConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // Restart scheduler with new config
    if (this.task) {
      this.stop();
      this.start();
    }
  }
}

// Export singleton instance
export const dailyScraper = new DailyScraper();
