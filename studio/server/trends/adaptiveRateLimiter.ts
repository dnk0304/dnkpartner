/**
 * Adaptive Rate Limiter
 * Dynamically adjusts request delays based on response codes and success rates
 * Automatically slows down on rate limits and speeds up on consecutive successes
 */

export interface RateLimiterConfig {
  baseDelay: number;              // Base delay in ms (default: 3000)
  minDelay: number;               // Minimum delay in ms (default: 1000)
  maxDelay: number;               // Maximum delay in ms (default: 60000)
  successSpeedupFactor: number;   // Factor to speed up on success (default: 0.9)
  failureSlowdownFactor: number;  // Factor to slow down on failure (default: 2.0)
  rateLimitSlowdownFactor: number; // Factor to slow down on rate limit (default: 3.0)
}

export interface DomainRateConfig {
  domain: string;
  currentDelay: number;
  lastRequestTime: number;
  consecutiveSuccesses: number;
  consecutiveFailures: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  rateLimitsHit: number;
}

export interface RateLimiterStats {
  domains: DomainRateConfig[];
  totalRequests: number;
  totalSuccesses: number;
  totalFailures: number;
  totalRateLimits: number;
  averageSuccessRate: number;
}

const DEFAULT_CONFIG: RateLimiterConfig = {
  baseDelay: 5000,        // 5s base (was 3s) - more conservative default
  minDelay: 3000,         // 3s min (was 1s) - never go below 3s
  maxDelay: 120000,       // 120s max (was 60s) - allow longer cooldowns
  successSpeedupFactor: 0.95, // 0.95 (was 0.9) - slower speedup
  failureSlowdownFactor: 2.5, // 2.5x (was 2.0x) - more aggressive slowdown
  rateLimitSlowdownFactor: 4.0, // 4x (was 3x) - much more aggressive on rate limits
};

export class AdaptiveRateLimiter {
  private config: RateLimiterConfig;
  private domainDelays: Map<string, DomainRateConfig> = new Map();

  constructor(config: Partial<RateLimiterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Wait before making a request to a domain
   */
  async waitForDomain(domain: string): Promise<void> {
    let domainConfig = this.domainDelays.get(domain);
    
    if (!domainConfig) {
      domainConfig = {
        domain,
        currentDelay: this.config.baseDelay,
        lastRequestTime: 0,
        consecutiveSuccesses: 0,
        consecutiveFailures: 0,
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        rateLimitsHit: 0,
      };
      this.domainDelays.set(domain, domainConfig);
    }
    
    const now = Date.now();
    const timeSinceLastRequest = now - domainConfig.lastRequestTime;
    
    if (timeSinceLastRequest < domainConfig.currentDelay) {
      const waitTime = domainConfig.currentDelay - timeSinceLastRequest;
      console.log(`[AdaptiveRateLimiter] ${domain}: Waiting ${Math.round(waitTime / 1000)}s (current delay: ${Math.round(domainConfig.currentDelay / 1000)}s)`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    domainConfig.lastRequestTime = Date.now();
    domainConfig.totalRequests++;
    this.domainDelays.set(domain, domainConfig);
  }

  /**
   * Record a successful request
   */
  onSuccess(domain: string): void {
    const domainConfig = this.domainDelays.get(domain);
    if (!domainConfig) return;
    
    domainConfig.consecutiveSuccesses++;
    domainConfig.consecutiveFailures = 0;
    domainConfig.successfulRequests++;
    
    // Speed up after consecutive successes (but don't go below minimum)
    if (domainConfig.consecutiveSuccesses >= 3) {
      const newDelay = Math.max(
        this.config.minDelay,
        domainConfig.currentDelay * this.config.successSpeedupFactor
      );
      
      if (newDelay !== domainConfig.currentDelay) {
        console.log(`[AdaptiveRateLimiter] ${domain}: Speeding up ${Math.round(domainConfig.currentDelay / 1000)}s → ${Math.round(newDelay / 1000)}s (${domainConfig.consecutiveSuccesses} consecutive successes)`);
        domainConfig.currentDelay = newDelay;
      }
    }
    
    this.domainDelays.set(domain, domainConfig);
  }

  /**
   * Record a failed request
   */
  onFailure(domain: string, statusCode?: number): void {
    const domainConfig = this.domainDelays.get(domain);
    if (!domainConfig) return;
    
    domainConfig.consecutiveFailures++;
    domainConfig.consecutiveSuccesses = 0;
    domainConfig.failedRequests++;
    
    // Slow down on failures (but don't exceed maximum)
    const newDelay = Math.min(
      this.config.maxDelay,
      domainConfig.currentDelay * this.config.failureSlowdownFactor
    );
    
    if (newDelay !== domainConfig.currentDelay) {
      console.log(`[AdaptiveRateLimiter] ${domain}: Slowing down ${Math.round(domainConfig.currentDelay / 1000)}s → ${Math.round(newDelay / 1000)}s (status: ${statusCode || 'unknown'})`);
      domainConfig.currentDelay = newDelay;
    }
    
    this.domainDelays.set(domain, domainConfig);
  }

  /**
   * Record a rate limit hit (429, 503, etc.)
   */
  onRateLimit(domain: string): void {
    const domainConfig = this.domainDelays.get(domain);
    if (!domainConfig) return;
    
    domainConfig.consecutiveFailures++;
    domainConfig.consecutiveSuccesses = 0;
    domainConfig.failedRequests++;
    domainConfig.rateLimitsHit++;
    
    // Aggressive slowdown on rate limits
    const newDelay = Math.min(
      this.config.maxDelay,
      domainConfig.currentDelay * this.config.rateLimitSlowdownFactor
    );
    
    console.warn(`[AdaptiveRateLimiter] ${domain}: Rate limit hit! Slowing down ${Math.round(domainConfig.currentDelay / 1000)}s → ${Math.round(newDelay / 1000)}s`);
    domainConfig.currentDelay = newDelay;
    
    this.domainDelays.set(domain, domainConfig);
  }

  /**
   * Get current delay for a domain
   */
  getCurrentDelay(domain: string): number {
    const domainConfig = this.domainDelays.get(domain);
    return domainConfig ? domainConfig.currentDelay : this.config.baseDelay;
  }

  /**
   * Get statistics for all domains
   */
  getStats(): RateLimiterStats {
    const domains = Array.from(this.domainDelays.values());
    
    const totalRequests = domains.reduce((sum, d) => sum + d.totalRequests, 0);
    const totalSuccesses = domains.reduce((sum, d) => sum + d.successfulRequests, 0);
    const totalFailures = domains.reduce((sum, d) => sum + d.failedRequests, 0);
    const totalRateLimits = domains.reduce((sum, d) => sum + d.rateLimitsHit, 0);
    
    return {
      domains,
      totalRequests,
      totalSuccesses,
      totalFailures,
      totalRateLimits,
      averageSuccessRate: totalRequests > 0 ? (totalSuccesses / totalRequests) * 100 : 0,
    };
  }

  /**
   * Reset rate limiter for a domain
   */
  resetDomain(domain: string): void {
    const domainConfig = this.domainDelays.get(domain);
    if (!domainConfig) return;
    
    domainConfig.currentDelay = this.config.baseDelay;
    domainConfig.consecutiveSuccesses = 0;
    domainConfig.consecutiveFailures = 0;
    
    this.domainDelays.set(domain, domainConfig);
    console.log(`[AdaptiveRateLimiter] ${domain}: Reset to base delay (${Math.round(this.config.baseDelay / 1000)}s)`);
  }

  /**
   * Reset all domains
   */
  resetAll(): void {
    for (const domain of this.domainDelays.keys()) {
      this.resetDomain(domain);
    }
    console.log('[AdaptiveRateLimiter] Reset all domains');
  }

  /**
   * Get domain configuration
   */
  getDomainConfig(domain: string): DomainRateConfig | null {
    return this.domainDelays.get(domain) || null;
  }
}

// Export singleton instance with default config
export const adaptiveRateLimiter = new AdaptiveRateLimiter();
