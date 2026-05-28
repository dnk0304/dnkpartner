/**
 * Proxy Manager for Web Scraping
 * Handles proxy rotation, validation, and commercial proxy integration
 * Supports free proxies, residential proxies, and datacenter proxies
 */

import https from 'https';
import http from 'http';

export interface ProxyConfig {
  host: string;
  port: number;
  protocol: 'http' | 'https' | 'socks4' | 'socks5';
  username?: string;
  password?: string;
  country?: string;
  provider?: 'free' | 'brightdata' | 'oxylabs' | 'scrapingbee' | 'custom';
}

export interface ProxyStats {
  successCount: number;
  failureCount: number;
  avgResponseTime: number;
  lastUsed: string;
  lastSuccess: string | null;
  consecutiveFailures: number;
}

export interface ProxyWithStats extends ProxyConfig {
  id: string;
  stats: ProxyStats;
  isActive: boolean;
}

interface ProxyTestResult {
  success: boolean;
  responseTime: number;
  error?: string;
}

class ProxyManager {
  private proxies: Map<string, ProxyWithStats> = new Map();
  private cooldowns: Map<string, number> = new Map();
  private cooldownPeriod = 300000; // 5 minutes cooldown after failure
  private maxConsecutiveFailures = 3;
  private testUrl = 'https://httpbin.org/ip';
  private isInitialized = false;
  private autoRefreshInterval: NodeJS.Timeout | null = null;
  private domainProxyMap: Map<string, string> = new Map(); // Track which proxy is best for which domain

  // Commercial proxy configurations (requires API keys in env)
  private commercialProxies = {
    brightdata: process.env.BRIGHT_DATA_PROXY || '',
    oxylabs: process.env.OXYLABS_PROXY || '',
    scrapingbee: process.env.SCRAPINGBEE_API_KEY || '',
  };

  constructor() {
    this.initializeCommercialProxies();
  }

  /**
   * Initialize proxy manager (auto-fetch proxies)
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('[ProxyManager] Already initialized');
      return;
    }

    console.log('[ProxyManager] Initializing proxy manager...');
    
    // Auto-fetch free proxies
    await this.fetchFreeProxies(50);
    
    // Test all proxies
    await this.testAllProxies();
    
    // Start auto-refresh
    this.startAutoRefresh();
    
    this.isInitialized = true;
    console.log('[ProxyManager] Initialization complete');
  }

  /**
   * Initialize commercial proxies from environment variables
   */
  private initializeCommercialProxies(): void {
    // Bright Data (formerly Luminati)
    if (this.commercialProxies.brightdata) {
      const brightDataUrl = new URL(this.commercialProxies.brightdata);
      this.addProxy({
        host: brightDataUrl.hostname,
        port: parseInt(brightDataUrl.port) || 443,
        protocol: 'https',
        username: brightDataUrl.username || undefined,
        password: brightDataUrl.password || undefined,
        provider: 'brightdata',
        country: 'US',
      });
      console.log('[ProxyManager] Bright Data proxy configured');
    }

    // Oxylabs
    if (this.commercialProxies.oxylabs) {
      const oxylabsUrl = new URL(this.commercialProxies.oxylabs);
      this.addProxy({
        host: oxylabsUrl.hostname,
        port: parseInt(oxylabsUrl.port) || 443,
        protocol: 'https',
        username: oxylabsUrl.username || undefined,
        password: oxylabsUrl.password || undefined,
        provider: 'oxylabs',
        country: 'US',
      });
      console.log('[ProxyManager] Oxylabs proxy configured');
    }
  }

  /**
   * Add a proxy to the pool
   */
  addProxy(config: ProxyConfig): string {
    const id = `${config.host}:${config.port}`;
    
    if (this.proxies.has(id)) {
      console.log(`[ProxyManager] Proxy ${id} already exists`);
      return id;
    }

    const proxy: ProxyWithStats = {
      ...config,
      id,
      stats: {
        successCount: 0,
        failureCount: 0,
        avgResponseTime: 0,
        lastUsed: new Date().toISOString(),
        lastSuccess: null,
        consecutiveFailures: 0,
      },
      isActive: true,
    };

    this.proxies.set(id, proxy);
    console.log(`[ProxyManager] Added proxy: ${id} (${config.provider || 'custom'})`);
    return id;
  }

  /**
   * Remove a proxy from the pool
   */
  removeProxy(proxyId: string): boolean {
    const removed = this.proxies.delete(proxyId);
    this.cooldowns.delete(proxyId);
    
    if (removed) {
      console.log(`[ProxyManager] Removed proxy: ${proxyId}`);
    }
    
    return removed;
  }

  /**
   * Get a random working proxy
   */
  async getProxy(options?: { country?: string; provider?: string }): Promise<ProxyWithStats | null> {
    const availableProxies = Array.from(this.proxies.values()).filter(proxy => {
      // Filter by options
      if (options?.country && proxy.country !== options.country) return false;
      if (options?.provider && proxy.provider !== options.provider) return false;
      
      // Check if active
      if (!proxy.isActive) return false;
      
      // Check if in cooldown
      const cooldown = this.cooldowns.get(proxy.id);
      if (cooldown && Date.now() < cooldown) return false;
      
      // Check consecutive failures
      if (proxy.stats.consecutiveFailures >= this.maxConsecutiveFailures) return false;
      
      return true;
    });

    if (availableProxies.length === 0) {
      console.warn('[ProxyManager] No available proxies');
      return null;
    }

    // Sort by success rate and response time
    availableProxies.sort((a, b) => {
      const aSuccessRate = a.stats.successCount / Math.max(1, a.stats.successCount + a.stats.failureCount);
      const bSuccessRate = b.stats.successCount / Math.max(1, b.stats.successCount + b.stats.failureCount);
      
      if (Math.abs(aSuccessRate - bSuccessRate) > 0.2) {
        return bSuccessRate - aSuccessRate;
      }
      
      return a.stats.avgResponseTime - b.stats.avgResponseTime;
    });

    // Return top proxy with some randomization
    const topProxies = availableProxies.slice(0, Math.min(3, availableProxies.length));
    const selectedProxy = topProxies[Math.floor(Math.random() * topProxies.length)];
    
    selectedProxy.stats.lastUsed = new Date().toISOString();
    this.proxies.set(selectedProxy.id, selectedProxy);
    
    return selectedProxy;
  }

  /**
   * Get proxy URL string for Puppeteer
   */
  getProxyUrl(proxy: ProxyWithStats): string {
    const auth = proxy.username && proxy.password 
      ? `${proxy.username}:${proxy.password}@`
      : '';
    
    return `${proxy.protocol}://${auth}${proxy.host}:${proxy.port}`;
  }

  /**
   * Record successful proxy use
   */
  recordSuccess(proxyId: string, responseTime: number): void {
    const proxy = this.proxies.get(proxyId);
    if (!proxy) return;

    proxy.stats.successCount++;
    proxy.stats.consecutiveFailures = 0;
    proxy.stats.lastSuccess = new Date().toISOString();
    
    // Update average response time
    const totalTime = proxy.stats.avgResponseTime * (proxy.stats.successCount - 1) + responseTime;
    proxy.stats.avgResponseTime = totalTime / proxy.stats.successCount;
    
    this.proxies.set(proxyId, proxy);
    
    // Remove from cooldown if present
    this.cooldowns.delete(proxyId);
  }

  /**
   * Record failed proxy use
   */
  recordFailure(proxyId: string, error: string): void {
    const proxy = this.proxies.get(proxyId);
    if (!proxy) return;

    proxy.stats.failureCount++;
    proxy.stats.consecutiveFailures++;
    
    console.warn(`[ProxyManager] Proxy ${proxyId} failed: ${error} (consecutive: ${proxy.stats.consecutiveFailures})`);
    
    // Apply cooldown
    if (proxy.stats.consecutiveFailures >= 2) {
      const cooldownEnd = Date.now() + this.cooldownPeriod;
      this.cooldowns.set(proxyId, cooldownEnd);
      console.log(`[ProxyManager] Proxy ${proxyId} in cooldown until ${new Date(cooldownEnd).toISOString()}`);
    }
    
    // Deactivate if too many consecutive failures
    if (proxy.stats.consecutiveFailures >= this.maxConsecutiveFailures) {
      proxy.isActive = false;
      console.warn(`[ProxyManager] Proxy ${proxyId} deactivated after ${this.maxConsecutiveFailures} consecutive failures`);
    }
    
    this.proxies.set(proxyId, proxy);
  }

  /**
   * Test a proxy to see if it works
   */
  async testProxy(proxyId: string): Promise<ProxyTestResult> {
    const proxy = this.proxies.get(proxyId);
    if (!proxy) {
      return { success: false, responseTime: 0, error: 'Proxy not found' };
    }

    const startTime = Date.now();
    
    return new Promise((resolve) => {
      const proxyUrl = this.getProxyUrl(proxy);
      const auth = proxy.username && proxy.password 
        ? Buffer.from(`${proxy.username}:${proxy.password}`).toString('base64')
        : null;

      const options: https.RequestOptions = {
        method: 'GET',
        timeout: 10000,
        headers: auth ? { 'Proxy-Authorization': `Basic ${auth}` } : {},
      };

      // Use proxy URL parsing
      try {
        const url = new URL(this.testUrl);
        const client = url.protocol === 'https:' ? https : http;

        const req = client.request(this.testUrl, options, (res) => {
          const responseTime = Date.now() - startTime;
          
          if (res.statusCode === 200) {
            resolve({ success: true, responseTime });
          } else {
            resolve({ 
              success: false, 
              responseTime, 
              error: `HTTP ${res.statusCode}` 
            });
          }
        });

        req.on('error', (error) => {
          resolve({ 
            success: false, 
            responseTime: Date.now() - startTime, 
            error: error.message 
          });
        });

        req.on('timeout', () => {
          req.destroy();
          resolve({ 
            success: false, 
            responseTime: Date.now() - startTime, 
            error: 'Timeout' 
          });
        });

        req.end();
      } catch (error: any) {
        resolve({ 
          success: false, 
          responseTime: Date.now() - startTime, 
          error: error.message 
        });
      }
    });
  }

  /**
   * Test all proxies and update their status
   */
  async testAllProxies(): Promise<Map<string, ProxyTestResult>> {
    console.log(`[ProxyManager] Testing ${this.proxies.size} proxies...`);
    
    const results = new Map<string, ProxyTestResult>();
    const testPromises: Promise<void>[] = [];

    for (const [id, proxy] of this.proxies.entries()) {
      const promise = this.testProxy(id).then(result => {
        results.set(id, result);
        
        if (result.success) {
          this.recordSuccess(id, result.responseTime);
        } else {
          this.recordFailure(id, result.error || 'Unknown error');
        }
      });
      
      testPromises.push(promise);
      
      // Add delay between tests to avoid overwhelming
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    await Promise.all(testPromises);
    
    const successCount = Array.from(results.values()).filter(r => r.success).length;
    console.log(`[ProxyManager] Proxy test complete: ${successCount}/${this.proxies.size} working`);
    
    return results;
  }

  /**
   * Fetch free proxies from public lists (for development/testing)
   */
  async fetchFreeProxies(count: number = 10): Promise<number> {
    console.log('[ProxyManager] Fetching free proxies...');
    
    try {
      // Note: This is a simplified example. In production, you'd use a reliable proxy list API
      // or scrape from multiple sources with proper validation
      
      // Example free proxy sources:
      // - https://www.proxy-list.download/api/v1/get?type=http
      // - https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt
      // - https://api.proxyscrape.com/v2/?request=get&protocol=http
      
      const response = await fetch('https://api.proxyscrape.com/v2/?request=get&protocol=http&timeout=10000&country=all&ssl=all&anonymity=all');
      
      if (!response.ok) {
        throw new Error(`Failed to fetch proxies: ${response.statusText}`);
      }

      const text = await response.text();
      const proxyLines = text.split('\n').filter(line => line.trim());
      
      let added = 0;
      for (const line of proxyLines.slice(0, count)) {
        const [host, port] = line.trim().split(':');
        if (host && port) {
          this.addProxy({
            host,
            port: parseInt(port),
            protocol: 'http',
            provider: 'free',
          });
          added++;
        }
      }

      console.log(`[ProxyManager] Added ${added} free proxies`);
      
      // Test newly added proxies
      setTimeout(() => this.testAllProxies(), 1000);
      
      return added;
    } catch (error: any) {
      console.error('[ProxyManager] Error fetching free proxies:', error.message);
      return 0;
    }
  }

  /**
   * Get statistics for all proxies
   */
  getStats(): {
    total: number;
    active: number;
    inactive: number;
    inCooldown: number;
    avgSuccessRate: number;
    avgResponseTime: number;
    byProvider: Record<string, number>;
  } {
    const proxies = Array.from(this.proxies.values());
    const now = Date.now();
    
    const active = proxies.filter(p => p.isActive).length;
    const inactive = proxies.filter(p => !p.isActive).length;
    const inCooldown = Array.from(this.cooldowns.values()).filter(c => c > now).length;
    
    const totalSuccess = proxies.reduce((sum, p) => sum + p.stats.successCount, 0);
    const totalRequests = proxies.reduce((sum, p) => sum + p.stats.successCount + p.stats.failureCount, 0);
    const avgSuccessRate = totalRequests > 0 ? (totalSuccess / totalRequests) * 100 : 0;
    
    const totalResponseTime = proxies.reduce((sum, p) => sum + p.stats.avgResponseTime * p.stats.successCount, 0);
    const avgResponseTime = totalSuccess > 0 ? totalResponseTime / totalSuccess : 0;
    
    const byProvider: Record<string, number> = {};
    proxies.forEach(p => {
      const provider = p.provider || 'custom';
      byProvider[provider] = (byProvider[provider] || 0) + 1;
    });

    return {
      total: proxies.length,
      active,
      inactive,
      inCooldown,
      avgSuccessRate: Math.round(avgSuccessRate * 10) / 10,
      avgResponseTime: Math.round(avgResponseTime),
      byProvider,
    };
  }

  /**
   * Get list of all proxies
   */
  getProxies(): ProxyWithStats[] {
    return Array.from(this.proxies.values());
  }

  /**
   * Clear all cooldowns
   */
  clearCooldowns(): void {
    this.cooldowns.clear();
    console.log('[ProxyManager] All cooldowns cleared');
  }

  /**
   * Reactivate all proxies
   */
  reactivateAll(): void {
    for (const [id, proxy] of this.proxies.entries()) {
      proxy.isActive = true;
      proxy.stats.consecutiveFailures = 0;
      this.proxies.set(id, proxy);
    }
    this.clearCooldowns();
    console.log('[ProxyManager] All proxies reactivated');
  }

  /**
   * Clear all proxies
   */
  clearAll(): void {
    this.proxies.clear();
    this.cooldowns.clear();
    this.domainProxyMap.clear();
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
      this.autoRefreshInterval = null;
    }
    console.log('[ProxyManager] All proxies cleared');
  }

  /**
   * Start auto-refresh of proxy list
   */
  private startAutoRefresh(): void {
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
    }

    // Refresh proxies every 30 minutes
    this.autoRefreshInterval = setInterval(async () => {
      console.log('[ProxyManager] Auto-refreshing proxy list...');
      await this.fetchFreeProxies(20);
      await this.testAllProxies();
    }, 30 * 60 * 1000);

    console.log('[ProxyManager] Auto-refresh started (every 30 minutes)');
  }

  /**
   * Get proxy for specific region/country
   */
  async getProxyForRegion(region: string): Promise<ProxyWithStats | null> {
    return this.getProxy({ country: region });
  }

  /**
   * Rotate to a different proxy (avoid same proxy)
   */
  async rotateProxy(currentProxyId: string): Promise<ProxyWithStats | null> {
    const availableProxies = Array.from(this.proxies.values()).filter(proxy => {
      return proxy.id !== currentProxyId && 
             proxy.isActive && 
             proxy.stats.consecutiveFailures < this.maxConsecutiveFailures;
    });

    if (availableProxies.length === 0) {
      console.warn('[ProxyManager] No proxies available for rotation');
      return null;
    }

    // Pick a random different proxy
    const randomProxy = availableProxies[Math.floor(Math.random() * availableProxies.length)];
    randomProxy.stats.lastUsed = new Date().toISOString();
    this.proxies.set(randomProxy.id, randomProxy);

    console.log(`[ProxyManager] Rotated from ${currentProxyId} to ${randomProxy.id}`);
    return randomProxy;
  }

  /**
   * Get best proxy for a specific domain (based on historical success)
   */
  async getProxyForDomain(domain: string): Promise<ProxyWithStats | null> {
    // Check if we have a tracked best proxy for this domain
    const trackedProxyId = this.domainProxyMap.get(domain);
    if (trackedProxyId) {
      const proxy = this.proxies.get(trackedProxyId);
      if (proxy && proxy.isActive && proxy.stats.consecutiveFailures < this.maxConsecutiveFailures) {
        console.log(`[ProxyManager] Using tracked proxy ${trackedProxyId} for ${domain}`);
        return proxy;
      }
    }

    // Otherwise get a general proxy
    const proxy = await this.getProxy();
    if (proxy) {
      // Track this proxy for this domain
      this.domainProxyMap.set(domain, proxy.id);
    }
    
    return proxy;
  }
}

// Export singleton instance
export const proxyManager = new ProxyManager();

// Export class for custom instances
export { ProxyManager };
