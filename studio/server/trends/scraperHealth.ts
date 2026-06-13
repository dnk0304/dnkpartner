/**
 * Scraper Health Monitoring Service
 * Tracks detailed health metrics for all trend scrapers
 */

export interface ScraperHealth {
  source: string;
  /**
   * Truthful status (Phase 1, 2026-06-13):
   * - 'degraded-mock': last pull served MOCK fallback — never 'healthy'.
   * - 'no-data': no attempts recorded, or attempts but zero real data in 24h.
   * - 'mock' kept in the union for older serialized payloads; no longer produced.
   */
  status: 'healthy' | 'degraded' | 'failing' | 'mock' | 'degraded-mock' | 'no-data';
  lastSuccessfulScrape: string | null;
  /** Last success that returned REAL (non-mock) data with >0 trends. */
  lastRealDataAt: string | null;
  lastAttempt: string | null;
  consecutiveFailures: number;
  totalScrapes24h: number;
  /** Success rate over REAL successes only — mock fallback counts as failure. */
  successRate24h: number;
  avgResponseTime: number;
  /** Computed from real data only; 'none' = no real data ever recorded. */
  dataFreshness: 'live' | 'stale' | 'mock' | 'none';
  /** Trends from REAL (non-mock) successes only. */
  trendsCollected24h: number;
  /** Trends served by mock fallback in 24h (visibility, never counted above). */
  mockTrendsCollected24h: number;
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
      this.health.set(source, this.emptyHealth(source));
      this.attempts.set(source, []);
    }
  }

  /**
   * Truthful zero-state: a source that has never collected anything must NOT
   * claim 'healthy'/'live'/100% (that was the amazonKeywords lie).
   */
  private emptyHealth(source: string): ScraperHealth {
    return {
      source,
      status: 'no-data',
      lastSuccessfulScrape: null,
      lastRealDataAt: null,
      lastAttempt: null,
      consecutiveFailures: 0,
      totalScrapes24h: 0,
      successRate24h: 0,
      avgResponseTime: 0,
      dataFreshness: 'none',
      trendsCollected24h: 0,
      mockTrendsCollected24h: 0,
      errorMessages: [],
    };
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
    
    if (dataType === 'mock') {
      console.warn(`[ScraperHealth] ${source}: MOCK fallback served ${trendsCollected} trends in ${duration}ms — real pull failed, recorded as degraded-mock (does NOT count toward successRate)`);
    } else {
      console.log(`[ScraperHealth] ${source}: Success - ${trendsCollected} trends in ${duration}ms (${dataType})`);
    }
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
  /**
   * Truthful health computation (Phase 1, 2026-06-13).
   *
   * Core rule: a mock-fallback "success" means the REAL pull failed. Mock
   * attempts therefore count AGAINST successRate, contribute nothing to
   * trendsCollected24h / lastRealDataAt / freshness, and force the status to
   * 'degraded-mock' when they were the most recent pull.
   */
  private updateHealth(source: string): void {
    const sourceAttempts = this.attempts.get(source) || [];
    const currentHealth = this.health.get(source);

    if (!currentHealth) return;

    const isRealSuccess = (a: ScrapeAttempt) => a.success && a.dataType !== 'mock';
    const realSuccesses = sourceAttempts.filter(isRealSuccess);
    const mockSuccesses = sourceAttempts.filter(a => a.success && a.dataType === 'mock');
    const failedAttempts = sourceAttempts.filter(a => !a.success);
    // Real data = a non-mock success that actually returned trends.
    const realDataAttempts = realSuccesses.filter(a => a.trendsCollected > 0);

    // Total scrapes in 24h
    currentHealth.totalScrapes24h = sourceAttempts.length;

    // Success rate over REAL successes — mock fallback never inflates it.
    currentHealth.successRate24h = sourceAttempts.length > 0
      ? (realSuccesses.length / sourceAttempts.length) * 100
      : 0;

    // Average response time (real successes only — mock generation is ~0ms
    // and would flatter the number).
    currentHealth.avgResponseTime = realSuccesses.length > 0
      ? realSuccesses.reduce((sum, a) => sum + a.duration, 0) / realSuccesses.length
      : 0;

    // Trends collected: real vs mock, never mixed.
    currentHealth.trendsCollected24h = realSuccesses.reduce((sum, a) => sum + a.trendsCollected, 0);
    currentHealth.mockTrendsCollected24h = mockSuccesses.reduce((sum, a) => sum + a.trendsCollected, 0);

    const byNewest = (a: ScrapeAttempt, b: ScrapeAttempt) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();

    // Last successful scrape of ANY kind (kept for back-compat with UI).
    const lastSuccess = [...sourceAttempts].filter(a => a.success).sort(byNewest)[0];
    if (lastSuccess) currentHealth.lastSuccessfulScrape = lastSuccess.timestamp;

    // Last REAL data — drives freshness.
    const lastRealData = [...realDataAttempts].sort(byNewest)[0];
    if (lastRealData) currentHealth.lastRealDataAt = lastRealData.timestamp;

    // Last attempt
    const sortedAttempts = [...sourceAttempts].sort(byNewest);
    const lastAttempt = sortedAttempts[0];
    if (lastAttempt) currentHealth.lastAttempt = lastAttempt.timestamp;

    // Consecutive failures of the REAL pull (mock fallback = real pull failed).
    let consecutiveFailures = 0;
    for (const attempt of sortedAttempts) {
      if (!isRealSuccess(attempt)) {
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

    // Data freshness — REAL data only.
    if (currentHealth.lastRealDataAt) {
      const hoursSinceReal = (Date.now() - new Date(currentHealth.lastRealDataAt).getTime()) / (60 * 60 * 1000);
      currentHealth.dataFreshness = hoursSinceReal > HEALTH_THRESHOLDS.STALE_DATA_HOURS ? 'stale' : 'live';
    } else if (mockSuccesses.length > 0) {
      currentHealth.dataFreshness = 'mock';
    } else {
      currentHealth.dataFreshness = 'none';
    }

    // Overall status — order matters:
    // 1. nothing ever attempted -> no-data
    // 2. last pull served mock  -> degraded-mock (NEVER healthy)
    // 3. no real data ever      -> degraded-mock if mock served, else no-data/failing
    // 4. failure thresholds     -> failing / degraded
    if (sourceAttempts.length === 0) {
      currentHealth.status = 'no-data';
    } else if (lastAttempt && lastAttempt.success && lastAttempt.dataType === 'mock') {
      currentHealth.status = 'degraded-mock';
    } else if (currentHealth.dataFreshness === 'mock') {
      currentHealth.status = 'degraded-mock';
    } else if (consecutiveFailures >= HEALTH_THRESHOLDS.CONSECUTIVE_FAILURES_FAILING) {
      currentHealth.status = 'failing';
    } else if (
      consecutiveFailures >= HEALTH_THRESHOLDS.CONSECUTIVE_FAILURES_DEGRADED ||
      (sourceAttempts.length > 0 && currentHealth.successRate24h < HEALTH_THRESHOLDS.SUCCESS_RATE_DEGRADED && failedAttempts.length > 0)
    ) {
      // Active breakage outranks "no data yet": a broken source must read as
      // degraded/failing, never hide behind no-data.
      currentHealth.status = 'degraded';
    } else if (currentHealth.dataFreshness === 'none') {
      // Attempts succeeded but returned zero real trends (e.g. an empty
      // bridge): not an error, but absolutely not 'healthy' either.
      currentHealth.status = 'no-data';
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
    const mockSources = healthValues.filter(h => h.status === 'mock' || h.status === 'degraded-mock').length;
    
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
    this.health.set(source, this.emptyHealth(source));
  }

  /**
   * Get sources that need attention
   */
  getSourcesNeedingAttention(): ScraperHealth[] {
    return Array.from(this.health.values()).filter(
      h => h.status === 'failing' || h.status === 'degraded' || h.status === 'degraded-mock' || h.dataFreshness === 'stale'
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
    if (health.status === 'mock' || health.status === 'degraded-mock') {
      return 'Last pull served mock fallback — real collection is failing, investigate the scraper';
    }
    if (health.status === 'no-data') {
      return 'No real data collected yet — verify the source is configured and scheduled';
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
