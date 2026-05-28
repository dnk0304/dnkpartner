import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Browser, Page } from 'puppeteer';

// Add stealth plugin
puppeteer.use(StealthPlugin());

/**
 * Resilient Browser Manager
 * Manages Puppeteer browser lifecycle with auto-recovery and health monitoring
 */
class BrowserManager {
  private browser: Browser | null = null;
  private isInitializing = false;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private memoryCheckInterval: NodeJS.Timeout | null = null;
  private lastHealthCheck: Date | null = null;
  private failureCount = 0;
  private readonly MAX_FAILURES = 3;
  private readonly HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
  private readonly MEMORY_CHECK_INTERVAL = 60000; // 1 minute
  private readonly MAX_MEMORY_MB = 500; // 500MB threshold
  private monitoringStarted = false;

  constructor() {
    // Defer health monitoring until first browser initialization
    // This prevents issues during module import/server startup
    
    // Graceful shutdown on process termination
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
  }

  /**
   * Start health monitoring (called on first browser init)
   */
  private startHealthMonitoring(): void {
    if (this.monitoringStarted) return;
    
    // Health check interval
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, this.HEALTH_CHECK_INTERVAL);

    // Memory check interval
    this.memoryCheckInterval = setInterval(async () => {
      await this.checkMemoryUsage();
    }, this.MEMORY_CHECK_INTERVAL);

    this.monitoringStarted = true;
    console.log('[BrowserManager] Health monitoring started');
  }

  /**
   * Get or initialize browser instance
   */
  async getBrowser(): Promise<Browser> {
    // If browser exists and is connected, return it
    if (this.browser && this.browser.isConnected()) {
      return this.browser;
    }

    // If initialization is in progress, wait for it
    if (this.isInitializing) {
      await this.waitForInitialization();
      if (this.browser && this.browser.isConnected()) {
        return this.browser;
      }
    }

    // Initialize new browser
    return await this.initializeBrowser();
  }

  /**
   * Initialize browser with optimal settings
   */
  private async initializeBrowser(): Promise<Browser> {
    this.isInitializing = true;

    // Start monitoring on first init
    if (!this.monitoringStarted) {
      this.startHealthMonitoring();
    }

    try {
      console.log('[BrowserManager] Initializing Puppeteer browser...');
      
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--window-size=1920,1080',
          '--disable-blink-features=AutomationControlled', // Hide automation
          '--disable-features=IsolateOrigins,site-per-process',
          '--disable-web-security',
          '--disable-features=BlockInsecurePrivateNetworkRequests',
        ],
        defaultViewport: {
          width: 1920,
          height: 1080,
        },
      }) as Browser;

      // Set up disconnect handler for auto-recovery
      this.browser.on('disconnected', () => {
        console.warn('[BrowserManager] Browser disconnected unexpectedly');
        this.handleBrowserCrash();
      });

      this.failureCount = 0; // Reset failure count on success
      this.lastHealthCheck = new Date();
      
      console.log('[BrowserManager] ✓ Browser initialized successfully');
      
      return this.browser;
    } catch (error) {
      console.error('[BrowserManager] Failed to initialize browser:', error);
      this.failureCount++;
      
      if (this.failureCount >= this.MAX_FAILURES) {
        console.error('[BrowserManager] Max initialization failures reached. Manual intervention may be required.');
      }
      
      throw error;
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Wait for ongoing initialization to complete
   */
  private async waitForInitialization(): Promise<void> {
    const maxWait = 30000; // 30 seconds
    const startTime = Date.now();
    
    while (this.isInitializing && (Date.now() - startTime) < maxWait) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * Handle browser crash with auto-recovery
   */
  private handleBrowserCrash(): void {
    console.log('[BrowserManager] Attempting auto-recovery...');
    this.browser = null;
    
    // Try to reinitialize after a delay
    setTimeout(async () => {
      try {
        await this.initializeBrowser();
        console.log('[BrowserManager] ✓ Auto-recovery successful');
      } catch (error) {
        console.error('[BrowserManager] Auto-recovery failed:', error);
      }
    }, 5000); // 5 second delay before retry
  }

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    if (this.monitoringStarted) return;
    
    // Health check interval
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, this.HEALTH_CHECK_INTERVAL);

    // Memory check interval
    this.memoryCheckInterval = setInterval(async () => {
      await this.checkMemoryUsage();
    }, this.MEMORY_CHECK_INTERVAL);

    this.monitoringStarted = true;
    console.log('[BrowserManager] Health monitoring started');
  }

  /**
   * Perform health check
   */
  private async performHealthCheck(): Promise<void> {
    if (!this.browser || !this.browser.isConnected()) {
      console.log('[BrowserManager] Health check: Browser not running');
      return;
    }

    try {
      // Try to get pages to verify browser is responsive
      const pages = await this.browser.pages();
      this.lastHealthCheck = new Date();
      console.log(`[BrowserManager] Health check: OK (${pages.length} pages)`);
    } catch (error) {
      console.error('[BrowserManager] Health check failed:', error);
      this.handleBrowserCrash();
    }
  }

  /**
   * Check memory usage and restart if needed
   */
  private async checkMemoryUsage(): Promise<void> {
    if (!this.browser || !this.browser.isConnected()) {
      return;
    }

    try {
      const pages = await this.browser.pages();
      
      // Close idle pages (keep only 1 page)
      if (pages.length > 1) {
        console.log(`[BrowserManager] Closing ${pages.length - 1} idle pages`);
        for (let i = 1; i < pages.length; i++) {
          await pages[i].close().catch(() => {});
        }
      }

      // Check process memory (rough estimate)
      const memoryUsage = process.memoryUsage();
      const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024;

      if (heapUsedMB > this.MAX_MEMORY_MB) {
        console.warn(`[BrowserManager] Memory threshold exceeded (${heapUsedMB.toFixed(2)}MB), restarting browser...`);
        await this.restart();
      } else {
        console.log(`[BrowserManager] Memory check: OK (${heapUsedMB.toFixed(2)}MB)`);
      }
    } catch (error) {
      console.error('[BrowserManager] Memory check failed:', error);
    }
  }

  /**
   * Create a new page with optimal settings
   */
  async createPage(): Promise<Page> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    // Set extra headers to look more human
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
    });

    // Block unnecessary resources
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const resourceType = request.resourceType();
      // Block images, stylesheets, fonts to speed up
      if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
        request.abort();
      } else {
        request.continue();
      }
    });

    return page;
  }

  /**
   * Restart browser
   */
  async restart(): Promise<void> {
    console.log('[BrowserManager] Restarting browser...');
    
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (error) {
        console.error('[BrowserManager] Error closing browser:', error);
      }
      this.browser = null;
    }

    await this.initializeBrowser();
  }

  /**
   * Get health status
   */
  getHealth(): {
    isRunning: boolean;
    lastHealthCheck: string | null;
    failureCount: number;
    isHealthy: boolean;
  } {
    return {
      isRunning: !!(this.browser && this.browser.isConnected()),
      lastHealthCheck: this.lastHealthCheck?.toISOString() || null,
      failureCount: this.failureCount,
      isHealthy: this.failureCount < this.MAX_FAILURES && !!(this.browser && this.browser.isConnected()),
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    console.log('[BrowserManager] Shutting down...');
    
    // Clear intervals
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    if (this.memoryCheckInterval) {
      clearInterval(this.memoryCheckInterval);
      this.memoryCheckInterval = null;
    }

    // Close browser
    if (this.browser) {
      try {
        await this.browser.close();
        console.log('[BrowserManager] ✓ Browser closed');
      } catch (error) {
        console.error('[BrowserManager] Error closing browser:', error);
      }
      this.browser = null;
    }
  }
}

// Export singleton instance
export const browserManager = new BrowserManager();

