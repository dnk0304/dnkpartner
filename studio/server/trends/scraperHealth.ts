/**
 * Scraper Health Monitoring Service
 * Tracks detailed health metrics for all trend scrapers
 */

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

export interface ScrapeAttempt {
  source: string;
  timestamp: string;
  success: boolean;
  duration: number;
  trendsCollected: number;
  errorMessage?: string;
  dataType: 'live' | 'cached' | 'mock';
}

export interface HealthAlert {
  type: 'scraper_failure' | 'degraded_performance' | 'stale_data' | 'recovery';
  source: string;
  message: string;
  timestamp: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  details?: Record<string, any>;
}

// All supported scraper sources
const ALL_SOURCES = [
  'googleTrends',
  'reddit',
  'etsy',
  'ebay',
  'tiktok',
  'pinterest',
  'twitter',
  'googleShopping',
  'tiktokShop',
  'amazonKeywords',
  'tiktokCreativeCenter', // New source
] as const;

export type ScraperSource = typeof ALL_SOURCES[number];

// Thresholds for health determination
const HEALTH_THRESHOLDS = {
  CONSECUTIVE_FAILURES_DEGRADED: 2,
  CONSECUTIVE_FAILURES_FAILING: 5,
  SUCCESS_RATE_HEALTHY: 80,
  SUCCESS_RATE_DEGRADED: 50,
  STALE_DATA_HOURS: 24,
  VERY_STALE_DATA_HOURS: 48,
  SLOW_RESPONSE_MS: 30000,
  MAX_ERROR_MESSAGES: 10,
};

class ScraperHealthService {
  private attempts: Map<string, ScrapeAttempt[]> = new Map();
  private health: Map<string, ScraperHealth> = new Map();
  private alerts: HealthAlert[] = [];
  private alertCallbacks: ((alert: HealthAlert) => void)[] = [];

  constructor() {
    this.initializeHealth();
  }

  /**
   * Initialize health tracking for all sources
   */
  private initializeHealth(): void {
    for (const source of ALL_SOURCES) {
      this.health.set(source, {
        source,
        status: 'healthy',
        lastSuccessfulScrape: null,
        lastAttempt: null,
        consecutiveFailures: 0,
        totalScrapes24h: 0,
        successRate24h: 100,
        avgResponseTime: 0,
        dataFreshness: 'live',
        trendsCollected24h: 0,
        errorMessages: [],
      });
      this.attempts.set(source, []);
    }
  }

  /**
   * Record a scrape attempt
   */
  recordAttempt(attempt: ScrapeAttempt): void {
    const sourceAttempts = this.attempts.get(attempt.source) || [];
    
    // Add new attempt
    sourceAttempts.push(attempt);
    
    // Keep only last 24 hours of attempts
    const cutoff = Date.now() - (24 * 60 * 60 * 1000);
    const filteredAttempts = sourceAttempts.filter(
      a => new Date(a.timestamp).getTime() > cutoff
    );
    
    this.attempts.set(attempt.source, filteredAttempts);
    
    // Update health status
    this.updateHealth(attempt.source);
    
    // Check for alerts
    this.checkAlerts(attempt);
  }

  /**
   * Record a successful scrape
   */
  recordSuccess(
    source: string,
    trendsCollected: number,
    duration: number,
    dataType: 'live' | 'cached' | 'mock' = 'live'
  ): void {
    this.recordAttempt({
      source,
      timestamp: new Date().toISOString(),
      success: true,
      duration,
      trendsCollected,
      dataType,
    });
    
    console.log(`[ScraperHealth] ${source}: Success - ${trendsCollected} trends in ${duration}ms (${dataType})`);
  }

  /**
   * Record a failed scrape
   */
  recordFailure(source: string, errorMessage: string, duration: number = 0): void {
    this.recordAttempt({
      source,
      timestamp: new Date().toISOString(),
      success: false,
      duration,
      trendsCollected: 0,
      errorMessage,
      dataType: 'live',
    });
    
    console.error(`[ScraperHealth] ${source}: Failed - ${errorMessage}`);
  }

  /**
   * Update health status for a source
   */
  private updateHealth(source: string): void {
    const sourceAttempts = this.attempts.get(source) || [];
    const currentHealth = this.health.get(source);
    
    if (!currentHealth) return;
    
    // Calculate metrics
    const successfulAttempts = sourceAttempts.filter(a => a.success);
    const failedAttempts = sourceAttempts.filter(a => !a.success);
    
    // Total scrapes in 24h
    currentHealth.totalScrapes24h = sourceAttempts.length;
    
    // Success rate
    currentHealth.successRate24h = sourceAttempts.length > 0
      ? (successfulAttempts.length / sourceAttempts.length) * 100
      : 100;
    
    // Average response time
    if (successfulAttempts.length > 0) {
      currentHealth.avgResponseTime = successfulAttempts.reduce((sum, a) => sum + a.duration, 0) / successfulAttempts.length;
    }
    
    // Trends collected in 24h
    currentHealth.trendsCollected24h = successfulAttempts.reduce((sum, a) => sum + a.trendsCollected, 0);
    
    // Last successful scrape
    const lastSuccess = successfulAttempts.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )[0];
    
    if (lastSuccess) {
      currentHealth.lastSuccessfulScrape = lastSuccess.timestamp;
    }
    
    // Last attempt
    const lastAttempt = sourceAttempts.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )[0];
    
    if (lastAttempt) {
      currentHealth.lastAttempt = lastAttempt.timestamp;
    }
    
    // Consecutive failures
    let consecutiveFailures = 0;
    const sortedAttempts = [...sourceAttempts].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    
    for (const attempt of sortedAttempts) {
      if (!attempt.success) {
        consecutiveFailures++;
      } else {
        break;
      }
    }
    currentHealth.consecutiveFailures = consecutiveFailures;
    
    // Error messages (keep most recent)
    currentHealth.errorMessages = failedAttempts
      .filter(a => a.errorMessage)
      .map(a => a.errorMessage!)
      .slice(-HEALTH_THRESHOLDS.MAX_ERROR_MESSAGES);
    
    // Determine data freshness
    if (lastSuccess) {
      const hoursSinceSuccess = (Date.now() - new Date(lastSuccess.timestamp).getTime()) / (60 * 60 * 1000);
      
      if (lastSuccess.dataType === 'mock') {
        currentHealth.dataFreshness = 'mock';
      } else if (hoursSinceSuccess > HEALTH_THRESHOLDS.VERY_STALE_DATA_HOURS) {
        currentHealth.dataFreshness = 'stale';
      } else if (hoursSinceSuccess > HEALTH_THRESHOLDS.STALE_DATA_HOURS) {
        currentHealth.dataFreshness = 'stale';
      } else {
        currentHealth.dataFreshness = 'live';
      }
    } else {
      currentHealth.dataFreshness = 'mock';
    }
    
    // Determine overall status
    if (currentHealth.dataFreshness === 'mock') {
      currentHealth.status = 'mock';
    } else if (consecutiveFailures >= HEALTH_THRESHOLDS.CONSECUTIVE_FAILURES_FAILING) {
      currentHealth.status = 'failing';
    } else if (
      consecutiveFailures >= HEALTH_THRESHOLDS.CONSECUTIVE_FAILURES_DEGRADED ||
      currentHealth.successRate24h < HEALTH_THRESHOLDS.SUCCESS_RATE_DEGRADED
    ) {
      currentHealth.status = 'degraded';
    } else if (currentHealth.successRate24h < HEALTH_THRESHOLDS.SUCCESS_RATE_HEALTHY) {
      currentHealth.status = 'degraded';
    } else {
      currentHealth.status = 'healthy';
    }
    
    this.health.set(source, currentHealth);
  }

  /**
   * Check and emit alerts based on health status
   */
  private checkAlerts(attempt: ScrapeAttempt): void {
    const health = this.health.get(attempt.source);
    if (!health) return;
    
    // Check for consecutive failures
    if (health.consecutiveFailures === HEALTH_THRESHOLDS.CONSECUTIVE_FAILURES_FAILING) {
      this.emitAlert({
        type: 'scraper_failure',
        source: attempt.source,
        message: `${attempt.source} scraper has failed ${health.consecutiveFailures} times consecutively`,
        timestamp: new Date().toISOString(),
        severity: 'critical',
        details: {
          consecutiveFailures: health.consecutiveFailures,
          lastError: health.errorMessages[health.errorMessages.length - 1],
        },
      });
    } else if (health.consecutiveFailures === HEALTH_THRESHOLDS.CONSECUTIVE_FAILURES_DEGRADED) {
      this.emitAlert({
        type: 'degraded_performance',
        source: attempt.source,
        message: `${attempt.source} scraper is experiencing issues (${health.consecutiveFailures} failures)`,
        timestamp: new Date().toISOString(),
        severity: 'warning',
        details: {
          consecutiveFailures: health.consecutiveFailures,
          successRate24h: health.successRate24h,
        },
      });
    }
    
    // Check for recovery
    if (attempt.success && health.consecutiveFailures === 0) {
      const previousAttempts = this.attempts.get(attempt.source) || [];
      const hadFailures = previousAttempts.length > 1 && 
        !previousAttempts[previousAttempts.length - 2]?.success;
      
      if (hadFailures) {
        this.emitAlert({
          type: 'recovery',
          source: attempt.source,
          message: `${attempt.source} scraper has recovered`,
          timestamp: new Date().toISOString(),
          severity: 'info',
          details: {
            trendsCollected: attempt.trendsCollected,
          },
        });
      }
    }
    
    // Check for stale data
    if (health.dataFreshness === 'stale' && attempt.success) {
      this.emitAlert({
        type: 'stale_data',
        source: attempt.source,
        message: `${attempt.source} data is stale (using cached/fallback)`,
        timestamp: new Date().toISOString(),
        severity: 'warning',
        details: {
          lastSuccessfulScrape: health.lastSuccessfulScrape,
        },
      });
    }
  }

  /**
   * Emit an alert
   */
  private emitAlert(alert: HealthAlert): void {
    // Keep only last 100 alerts
    this.alerts = [...this.alerts.slice(-99), alert];
    
    // Call registered callbacks
    for (const callback of this.alertCallbacks) {
      try {
        callback(alert);
      } catch (error) {
        console.error('[ScraperHealth] Alert callback error:', error);
      }
    }
    
    // Log the alert
    const logLevel = alert.severity === 'critical' ? 'error' : 
                     alert.severity === 'error' ? 'error' :
                     alert.severity === 'warning' ? 'warn' : 'log';
    console[logLevel](`[ScraperHealth Alert] [${alert.severity.toUpperCase()}] ${alert.message}`);
  }

  /**
   * Register an alert callback
   */
  onAlert(callback: (alert: HealthAlert) => void): void {
    this.alertCallbacks.push(callback);
  }

  /**
   * Get health status for all sources
   */
  getAllHealth(): ScraperHealth[] {
    return Array.from(this.health.values());
  }

  /**
   * Get health status for a specific source
   */
  getHealth(source: string): ScraperHealth | undefined {
    return this.health.get(source);
  }

  /**
   * Get recent alerts
   */
  getAlerts(limit: number = 50): HealthAlert[] {
    return this.alerts.slice(-limit);
  }

  /**
   * Get summary statistics
   */
  getSummary(): {
    totalSources: number;
    healthySources: number;
    degradedSources: number;
    failingSources: number;
    mockSources: number;
    overallHealth: 'healthy' | 'degraded' | 'critical';
    totalTrends24h: number;
    avgSuccessRate: number;
  } {
    const healthValues = Array.from(this.health.values());
    
    const healthySources = healthValues.filter(h => h.status === 'healthy').length;
    const degradedSources = healthValues.filter(h => h.status === 'degraded').length;
    const failingSources = healthValues.filter(h => h.status === 'failing').length;
    const mockSources = healthValues.filter(h => h.status === 'mock').length;
    
    const totalTrends24h = healthValues.reduce((sum, h) => sum + h.trendsCollected24h, 0);
    const avgSuccessRate = healthValues.length > 0
      ? healthValues.reduce((sum, h) => sum + h.successRate24h, 0) / healthValues.length
      : 100;
    
    let overallHealth: 'healthy' | 'degraded' | 'critical' = 'healthy';
    if (failingSources >= 3 || (failingSources / healthValues.length) > 0.3) {
      overallHealth = 'critical';
    } else if (degradedSources >= 2 || failingSources >= 1) {
      overallHealth = 'degraded';
    }
    
    return {
      totalSources: healthValues.length,
      healthySources,
      degradedSources,
      failingSources,
      mockSources,
      overallHealth,
      totalTrends24h,
      avgSuccessRate,
    };
  }

  /**
   * Manually test a scraper
   */
  async testScraper(source: string, testFn: () => Promise<number>): Promise<{
    success: boolean;
    duration: number;
    trendsCollected: number;
    error?: string;
  }> {
    const startTime = Date.now();
    
    try {
      const trendsCollected = await testFn();
      const duration = Date.now() - startTime;
      
      this.recordSuccess(source, trendsCollected, duration, 'live');
      
      return {
        success: true,
        duration,
        trendsCollected,
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      const errorMessage = error.message || 'Unknown error';
      
      this.recordFailure(source, errorMessage, duration);
      
      return {
        success: false,
        duration,
        trendsCollected: 0,
        error: errorMessage,
      };
    }
  }

  /**
   * Clear health data for a source (for testing)
   */
  clearSource(source: string): void {
    this.attempts.set(source, []);
    this.initializeHealthForSource(source);
  }

  /**
   * Initialize health for a single source
   */
  private initializeHealthForSource(source: string): void {
    this.health.set(source, {
      source,
      status: 'healthy',
      lastSuccessfulScrape: null,
      lastAttempt: null,
      consecutiveFailures: 0,
      totalScrapes24h: 0,
      successRate24h: 100,
      avgResponseTime: 0,
      dataFreshness: 'live',
      trendsCollected24h: 0,
      errorMessages: [],
    });
  }

  /**
   * Get sources that need attention
   */
  getSourcesNeedingAttention(): ScraperHealth[] {
    return Array.from(this.health.values()).filter(
      h => h.status === 'failing' || h.status === 'degraded' || h.dataFreshness === 'stale'
    );
  }

  /**
   * Check if a source is healthy enough to skip fallback
   */
  isSourceHealthy(source: string): boolean {
    const health = this.health.get(source);
    return health?.status === 'healthy' && health?.dataFreshness === 'live';
  }

  /**
   * Get recommended action for a source
   */
  getRecommendedAction(source: string): string {
    const health = this.health.get(source);
    if (!health) return 'Unknown source';
    
    if (health.status === 'failing') {
      return 'Increase retry frequency or use fallback data';
    }
    if (health.status === 'degraded') {
      return 'Monitor closely, consider reducing scrape frequency';
    }
    if (health.dataFreshness === 'stale') {
      return 'Trigger manual refresh or check scraper configuration';
    }
    if (health.status === 'mock') {
      return 'Implement real scraping for this source';
    }
    return 'No action needed';
  }
}

// Export singleton instance
export const scraperHealth = new ScraperHealthService();

// Export class for custom instances
export { ScraperHealthService };

// Export constants
export { ALL_SOURCES, HEALTH_THRESHOLDS };
