/**
 * Browser Helper for Web Scraping - Enhanced v2
 * Provides Puppeteer browser instance with advanced stealth and human-like behavior
 * Features: Fingerprint randomization, TLS spoofing, human behavior simulation, session persistence
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Browser, Page, CDPSession } from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { captchaSolver } from './captchaSolver.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Add stealth plugin with all evasions enabled
const stealthPlugin = StealthPlugin();
stealthPlugin.enabledEvasions.delete('user-agent-override'); // We'll handle this manually
puppeteer.use(stealthPlugin);

export interface BrowserConfig {
  headless?: boolean;
  viewport?: { width: number; height: number };
  userAgent?: string;
  randomizeViewport?: boolean;
  sessionId?: string; // For session persistence
  proxyUrl?: string; // For proxy support
}

// Session storage directory
const SESSION_DIR = path.join(__dirname, '../../.sessions');

// Ensure session directory exists
if (!fs.existsSync(SESSION_DIR)) {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
}

class BrowserHelper {
  private browser: Browser | null = null;
  private pages: Set<Page> = new Set();
  private isInitializing = false;
  private sessionData: Map<string, any> = new Map();
  private fingerprintCache: Map<string, any> = new Map();

  /**
   * Get or create browser instance
   */
  async getBrowser(config: BrowserConfig = {}): Promise<Browser> {
    if (this.browser && this.browser.isConnected()) {
      return this.browser;
    }

    // Prevent multiple simultaneous initializations
    while (this.isInitializing) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (this.browser && this.browser.isConnected()) {
      return this.browser;
    }

    this.isInitializing = true;

    try {
      console.log('[BrowserHelper] Launching browser with enhanced stealth...');
      
      const launchArgs = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1920x1080',
        '--disable-blink-features=AutomationControlled',
        // Enhanced stealth arguments
        '--disable-features=IsolateOrigins,site-per-process',
        '--lang=en-US,en',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-ipc-flooding-protection',
        '--window-position=0,0',
        // Enhanced TLS/Network fingerprinting
        '--disable-features=NetworkService',
        '--disable-features=NetworkServiceInProcess',
        // Hardware randomization
        `--user-agent=${config.userAgent || this.getRandomUserAgent()}`,
      ];

      // Add proxy if provided
      if (config.proxyUrl) {
        launchArgs.push(`--proxy-server=${config.proxyUrl}`);
      }

      this.browser = await puppeteer.launch({
        headless: config.headless !== false, // Default to true
        args: launchArgs,
        ignoreHTTPSErrors: true,
        defaultViewport: null,
      });

      console.log('[BrowserHelper] Browser launched successfully with enhanced stealth');
      return this.browser;
    } catch (error) {
      console.error('[BrowserHelper] Failed to launch browser:', error);
      throw error;
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Create a new page with human-like settings and advanced stealth
   */
  async createPage(config: BrowserConfig = {}): Promise<Page> {
    const browser = await this.getBrowser(config);
    const page = await browser.newPage();
    
    this.pages.add(page);

    // Load session cookies if sessionId provided
    if (config.sessionId) {
      await this.loadSession(page, config.sessionId);
    }

    // Randomize viewport to look more human
    const viewport = config.randomizeViewport
      ? {
          width: 1280 + Math.floor(Math.random() * 640), // 1280-1920
          height: 720 + Math.floor(Math.random() * 360), // 720-1080
        }
      : config.viewport || { width: 1920, height: 1080 };

    await page.setViewport(viewport);

    // Set realistic user agent if not provided
    const userAgent = config.userAgent || this.getRandomUserAgent();
    await page.setUserAgent(userAgent);

    // Set realistic headers
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Cache-Control': 'max-age=0',
    });

    // Apply advanced fingerprint randomization
    await this.randomizeFingerprint(page);

    // Enhanced navigator overrides
    await page.evaluateOnNewDocument(() => {
      // Overwrite the plugins property
      Object.defineProperty(navigator, 'plugins', {
        get: () => {
          const plugins = [
            { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
            { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
            { name: 'Native Client', filename: 'internal-nacl-plugin' },
          ];
          return plugins;
        },
      });

      // Overwrite the languages property
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });

      // Pass the Webdriver test
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });

      // Pass the Chrome test
      (window as any).chrome = {
        runtime: {},
        loadTimes: function() {},
        csi: function() {},
        app: {},
      };

      // Override permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters: any) =>
        parameters.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
          : originalQuery(parameters);

      // Add realistic properties
      Object.defineProperty(navigator, 'hardwareConcurrency', {
        get: () => 4 + Math.floor(Math.random() * 4), // 4-8 cores
      });

      Object.defineProperty(navigator, 'deviceMemory', {
        get: () => 8,
      });

      Object.defineProperty(navigator, 'platform', {
        get: () => {
          const platforms = ['Win32', 'MacIntel', 'Linux x86_64'];
          return platforms[Math.floor(Math.random() * platforms.length)];
        },
      });

      // Override battery API
      Object.defineProperty(navigator, 'getBattery', {
        value: () => Promise.resolve({
          charging: true,
          chargingTime: 0,
          dischargingTime: Infinity,
          level: 1,
        }),
      });
    });

    return page;
  }

  /**
   * Randomize browser fingerprint (Canvas, WebGL, Audio)
   */
  private async randomizeFingerprint(page: Page): Promise<void> {
    await page.evaluateOnNewDocument(() => {
      // Canvas fingerprint randomization
      const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
      const originalToBlob = HTMLCanvasElement.prototype.toBlob;
      const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;

      // Inject noise into canvas
      const noise = () => Math.floor(Math.random() * 10) - 5;

      HTMLCanvasElement.prototype.toDataURL = function(...args) {
        const context = this.getContext('2d');
        if (context) {
          const imageData = context.getImageData(0, 0, this.width, this.height);
          for (let i = 0; i < imageData.data.length; i += 4) {
            imageData.data[i] += noise();
            imageData.data[i + 1] += noise();
            imageData.data[i + 2] += noise();
          }
          context.putImageData(imageData, 0, 0);
        }
        return originalToDataURL.apply(this, args as any);
      };

      HTMLCanvasElement.prototype.toBlob = function(...args) {
        const context = this.getContext('2d');
        if (context) {
          const imageData = context.getImageData(0, 0, this.width, this.height);
          for (let i = 0; i < imageData.data.length; i += 4) {
            imageData.data[i] += noise();
            imageData.data[i + 1] += noise();
            imageData.data[i + 2] += noise();
          }
          context.putImageData(imageData, 0, 0);
        }
        return originalToBlob.apply(this, args as any);
      };

      CanvasRenderingContext2D.prototype.getImageData = function(...args) {
        const imageData = originalGetImageData.apply(this, args as any);
        for (let i = 0; i < imageData.data.length; i += 4) {
          imageData.data[i] += noise();
          imageData.data[i + 1] += noise();
          imageData.data[i + 2] += noise();
        }
        return imageData;
      };

      // WebGL fingerprint randomization
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(parameter) {
        // Randomize UNMASKED_VENDOR_WEBGL and UNMASKED_RENDERER_WEBGL
        if (parameter === 37445) {
          return 'Intel Inc.';
        }
        if (parameter === 37446) {
          const renderers = [
            'Intel Iris OpenGL Engine',
            'ANGLE (Intel, Intel(R) UHD Graphics 630, OpenGL 4.1)',
            'Intel(R) HD Graphics 630',
          ];
          return renderers[Math.floor(Math.random() * renderers.length)];
        }
        return getParameter.apply(this, [parameter]);
      };

      // Audio context fingerprint randomization
      const audioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (audioContext) {
        const originalCreateOscillator = audioContext.prototype.createOscillator;
        audioContext.prototype.createOscillator = function() {
          const oscillator = originalCreateOscillator.apply(this);
          const originalStart = oscillator.start;
          oscillator.start = function(...args) {
            // Add slight frequency variation
            if (oscillator.frequency) {
              oscillator.frequency.value += Math.random() * 0.001;
            }
            return originalStart.apply(this, args as any);
          };
          return oscillator;
        };
      }

      // Screen resolution randomization (more realistic ranges)
      const screenWidth = 1920 + Math.floor(Math.random() * 160); // 1920-2080
      const screenHeight = 1080 + Math.floor(Math.random() * 120); // 1080-1200
      
      Object.defineProperty(window.screen, 'width', {
        get: () => screenWidth,
      });
      Object.defineProperty(window.screen, 'height', {
        get: () => screenHeight,
      });
      Object.defineProperty(window.screen, 'availWidth', {
        get: () => screenWidth,
      });
      Object.defineProperty(window.screen, 'availHeight', {
        get: () => screenHeight - 40, // Taskbar height
      });
      Object.defineProperty(window.screen, 'colorDepth', {
        get: () => 24,
      });
      Object.defineProperty(window.screen, 'pixelDepth', {
        get: () => 24,
      });
      
      // Timezone spoofing (match common timezones)
      const timezones = [
        'America/New_York',
        'America/Los_Angeles', 
        'America/Chicago',
        'America/Denver',
        'Europe/London',
        'Europe/Paris',
      ];
      const randomTimezone = timezones[Math.floor(Math.random() * timezones.length)];
      
      // Override Intl.DateTimeFormat
      const OriginalDateTimeFormat = Intl.DateTimeFormat;
      Intl.DateTimeFormat = class extends OriginalDateTimeFormat {
        constructor(...args: any[]) {
          super(...args);
        }
        resolvedOptions() {
          const options = super.resolvedOptions();
          options.timeZone = randomTimezone;
          return options;
        }
      } as any;
      
      // Font fingerprint randomization
      const baseFonts = [
        'Arial', 'Verdana', 'Helvetica', 'Times New Roman', 'Courier New',
        'Georgia', 'Palatino', 'Garamond', 'Comic Sans MS', 'Trebuchet MS',
        'Impact', 'Arial Black', 'Tahoma', 'Lucida Console',
      ];
      
      // Randomly add/remove some fonts
      const availableFonts = baseFonts.filter(() => Math.random() > 0.2);
      
      // WebRTC leak prevention
      const originalGetUserMedia = navigator.mediaDevices?.getUserMedia;
      if (originalGetUserMedia) {
        navigator.mediaDevices.getUserMedia = function(...args) {
          return Promise.reject(new Error('Permission denied'));
        };
      }
      
      // RTCPeerConnection IP leak prevention
      if ((window as any).RTCPeerConnection) {
        const OriginalRTCPeerConnection = (window as any).RTCPeerConnection;
        (window as any).RTCPeerConnection = function(...args: any[]) {
          const pc = new OriginalRTCPeerConnection(...args);
          const originalCreateOffer = pc.createOffer;
          pc.createOffer = function(...offerArgs: any[]) {
            return originalCreateOffer.apply(this, offerArgs).then((offer: any) => {
              // Remove local IP addresses from SDP
              offer.sdp = offer.sdp.replace(/([0-9]{1,3}\.){3}[0-9]{1,3}/g, '0.0.0.0');
              return offer;
            });
          };
          return pc;
        };
      }
      
      // Connection type randomization
      if ((navigator as any).connection) {
        Object.defineProperty((navigator as any).connection, 'effectiveType', {
          get: () => {
            const types = ['4g', 'wifi'];
            return types[Math.floor(Math.random() * types.length)];
          },
        });
        Object.defineProperty((navigator as any).connection, 'downlink', {
          get: () => 5 + Math.random() * 5, // 5-10 Mbps
        });
      }
    });
  }

  /**
   * Load session cookies from disk
   */
  private async loadSession(page: Page, sessionId: string): Promise<void> {
    const sessionFile = path.join(SESSION_DIR, `${sessionId}.json`);
    
    if (fs.existsSync(sessionFile)) {
      try {
        const sessionData = JSON.parse(fs.readFileSync(sessionFile, 'utf-8'));
        
        if (sessionData.cookies && Array.isArray(sessionData.cookies)) {
          await page.setCookie(...sessionData.cookies);
          console.log(`[BrowserHelper] Loaded ${sessionData.cookies.length} cookies for session ${sessionId}`);
        }

        if (sessionData.localStorage) {
          await page.evaluateOnNewDocument((data) => {
            for (const [key, value] of Object.entries(data)) {
              localStorage.setItem(key, value as string);
            }
          }, sessionData.localStorage);
        }

        this.sessionData.set(sessionId, sessionData);
      } catch (error) {
        console.error(`[BrowserHelper] Error loading session ${sessionId}:`, error);
      }
    }
  }

  /**
   * Save session cookies to disk
   */
  async saveSession(page: Page, sessionId: string): Promise<void> {
    try {
      const cookies = await page.cookies();
      const localStorage = await page.evaluate(() => {
        const data: Record<string, string> = {};
        for (let i = 0; i < window.localStorage.length; i++) {
          const key = window.localStorage.key(i);
          if (key) {
            data[key] = window.localStorage.getItem(key) || '';
          }
        }
        return data;
      });

      const sessionData = {
        cookies,
        localStorage,
        timestamp: new Date().toISOString(),
      };

      const sessionFile = path.join(SESSION_DIR, `${sessionId}.json`);
      fs.writeFileSync(sessionFile, JSON.stringify(sessionData, null, 2));
      
      this.sessionData.set(sessionId, sessionData);
      console.log(`[BrowserHelper] Saved session ${sessionId} with ${cookies.length} cookies`);
    } catch (error) {
      console.error(`[BrowserHelper] Error saving session ${sessionId}:`, error);
    }
  }
  async navigateWithRetry(
    page: Page,
    url: string,
    options: {
      maxRetries?: number;
      timeout?: number;
      waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2';
      solveCaptcha?: boolean; // Enable captcha solving
    } = {}
  ): Promise<boolean> {
    const { maxRetries = 3, timeout = 30000, waitUntil = 'networkidle2', solveCaptcha = true } = options;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[BrowserHelper] Navigating to ${url} (attempt ${attempt}/${maxRetries})...`);
        
        await page.goto(url, {
          timeout,
          waitUntil,
        });

        // Check for and solve captcha after navigation
        if (solveCaptcha) {
          const captchaResult = await this.solveCaptchaIfPresent(page);
          if (captchaResult.error) {
            console.warn(`[BrowserHelper] Captcha detected but couldn't solve: ${captchaResult.error}`);
            // If captcha couldn't be solved, retry with a different approach
            if (attempt < maxRetries) {
              const delay = 3000 * Math.pow(2, attempt - 1);
              console.log(`[BrowserHelper] Retrying due to captcha in ${delay}ms...`);
              await new Promise(resolve => setTimeout(resolve, delay));
              continue;
            }
          } else if (captchaResult.solved) {
            console.log('[BrowserHelper] Captcha solved successfully, continuing...');
            // Wait a bit after solving captcha
            await this.randomDelay(2000, 4000);
          }
        }

        // Random delay after page load (human-like)
        await this.randomDelay(1000, 3000);

        return true;
      } catch (error: any) {
        console.error(`[BrowserHelper] Navigation failed (attempt ${attempt}):`, error.message);
        
        if (attempt < maxRetries) {
          // Wait before retry with exponential backoff
          const delay = 2000 * Math.pow(2, attempt - 1);
          console.log(`[BrowserHelper] Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          console.error(`[BrowserHelper] Navigation failed after ${maxRetries} attempts`);
          return false;
        }
      }
    }

    return false;
  }

  /**
   * Human-like mouse movement with Bezier curves
   */
  async humanMove(page: Page, selector: string): Promise<void> {
    try {
      const element = await page.$(selector);
      if (element) {
        const box = await element.boundingBox();
        if (box) {
          // Get current mouse position
          const currentPos = await page.evaluate(() => ({ x: 0, y: 0 }));
          
          // Target position (random point within element)
          const targetX = box.x + Math.random() * box.width;
          const targetY = box.y + Math.random() * box.height;
          
          // Generate Bezier curve path
          const steps = 20 + Math.floor(Math.random() * 30); // 20-50 steps
          const controlPoint1X = currentPos.x + (targetX - currentPos.x) * (0.25 + Math.random() * 0.25);
          const controlPoint1Y = currentPos.y + (targetY - currentPos.y) * (0.25 + Math.random() * 0.25);
          const controlPoint2X = currentPos.x + (targetX - currentPos.x) * (0.75 + Math.random() * 0.25);
          const controlPoint2Y = currentPos.y + (targetY - currentPos.y) * (0.75 + Math.random() * 0.25);
          
          // Move along Bezier curve
          for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const x = Math.pow(1 - t, 3) * currentPos.x +
                     3 * Math.pow(1 - t, 2) * t * controlPoint1X +
                     3 * (1 - t) * Math.pow(t, 2) * controlPoint2X +
                     Math.pow(t, 3) * targetX;
            const y = Math.pow(1 - t, 3) * currentPos.y +
                     3 * Math.pow(1 - t, 2) * t * controlPoint1Y +
                     3 * (1 - t) * Math.pow(t, 2) * controlPoint2Y +
                     Math.pow(t, 3) * targetY;
            
            await page.mouse.move(x, y);
            
            // Random micro-pauses
            if (Math.random() < 0.1) {
              await this.randomDelay(10, 50);
            }
          }
        }
      }
    } catch (error) {
      // Silently fail - not critical
    }
  }

  /**
   * Human-like scrolling with variable speed and pauses
   */
  async humanScroll(page: Page, maxScrolls: number = 3): Promise<void> {
    for (let i = 0; i < maxScrolls; i++) {
      // Random scroll distance with variation
      const scrollDistance = 200 + Math.floor(Math.random() * 400);
      const steps = 5 + Math.floor(Math.random() * 10);
      const stepSize = scrollDistance / steps;
      
      // Scroll in steps for more natural movement
      for (let step = 0; step < steps; step++) {
        await page.evaluate((distance) => {
          window.scrollBy(0, distance);
        }, stepSize);
        
        // Micro-pause between scroll steps
        await this.randomDelay(30, 80);
      }

      // Random reading pause after scrolling
      await this.randomDelay(800, 2000);
      
      // Occasionally scroll back up slightly (human behavior)
      if (Math.random() < 0.2) {
        await page.evaluate(() => {
          window.scrollBy(0, -50 - Math.random() * 100);
        });
        await this.randomDelay(300, 700);
      }
    }
  }

  /**
   * Simulate reading time based on content length
   */
  async simulateReading(page: Page): Promise<void> {
    try {
      const textLength = await page.evaluate(() => {
        return document.body.textContent?.length || 0;
      });
      
      // Reading speed: ~250 words per minute, avg 5 chars per word
      // = ~1250 chars per minute = ~20 chars per second
      const readingTime = Math.min(
        (textLength / 20) * 1000,
        10000 // Max 10 seconds
      );
      
      const actualTime = readingTime * (0.3 + Math.random() * 0.7); // 30-100% of reading time
      await this.randomDelay(actualTime * 0.8, actualTime * 1.2);
    } catch (error) {
      // Fallback to random delay
      await this.randomDelay(2000, 5000);
    }
  }

  /**
   * Warm up session by visiting homepage and browsing
   */
  async warmUpSession(page: Page, domain: string): Promise<void> {
    try {
      console.log(`[BrowserHelper] Warming up session for ${domain}...`);
      
      // Visit homepage
      await this.navigateWithRetry(page, `https://${domain}`, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });
      
      await this.simulateReading(page);
      await this.humanScroll(page, 2);
      
      // Random mouse movements
      const elements = await page.$$('a, button, input');
      if (elements.length > 0) {
        const randomElement = elements[Math.floor(Math.random() * elements.length)];
        const box = await randomElement.boundingBox();
        if (box) {
          await page.mouse.move(
            box.x + Math.random() * box.width,
            box.y + Math.random() * box.height,
            { steps: 15 }
          );
        }
      }
      
      await this.randomDelay(1000, 2000);
      console.log(`[BrowserHelper] Session warm-up complete for ${domain}`);
    } catch (error) {
      console.error(`[BrowserHelper] Error warming up session:`, error);
    }
  }

  /**
   * Random delay (human-like)
   */
  async randomDelay(min: number, max: number): Promise<void> {
    const delay = min + Math.floor(Math.random() * (max - min));
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Get random user agent (updated for 2025)
   */
  private getRandomUserAgent(): string {
    const userAgents = [
      // Chrome on Windows
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
      // Chrome on Mac
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      // Firefox on Windows
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0',
      // Firefox on Mac
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.7; rv:133.0) Gecko/20100101 Firefox/133.0',
      // Safari on Mac
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
      // Edge on Windows
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
    ];

    return userAgents[Math.floor(Math.random() * userAgents.length)];
  }

  /**
   * Close a specific page
   */
  async closePage(page: Page): Promise<void> {
    try {
      this.pages.delete(page);
      if (!page.isClosed()) {
        await page.close();
      }
    } catch (error) {
      console.error('[BrowserHelper] Error closing page:', error);
    }
  }

  /**
   * Close browser and all pages
   */
  async close(): Promise<void> {
    console.log('[BrowserHelper] Closing browser...');
    
    // Close all pages
    for (const page of this.pages) {
      try {
        if (!page.isClosed()) {
          await page.close();
        }
      } catch (error) {
        // Ignore errors when closing pages
      }
    }
    this.pages.clear();

    // Close browser
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (error) {
        console.error('[BrowserHelper] Error closing browser:', error);
      }
      this.browser = null;
    }
  }

  /**
   * Check if browser is connected
   */
  isConnected(): boolean {
    return this.browser !== null && this.browser.isConnected();
  }

  /**
   * Navigate with captcha detection and solving
   */
  async navigateWithCaptchaSolving(
    page: Page, 
    url: string, 
    options?: { waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2'; timeout?: number }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`[BrowserHelper] Navigating to ${url} with captcha detection...`);
      
      // Navigate to URL
      await page.goto(url, { 
        waitUntil: options?.waitUntil || 'networkidle2', 
        timeout: options?.timeout || 30000 
      });

      // Check for captcha
      const needsSolving = await captchaSolver.needsSolving(page);
      
      if (needsSolving) {
        console.log('[BrowserHelper] Captcha detected, attempting to solve...');
        const solveResult = await captchaSolver.solve(page);
        
        if (!solveResult.success) {
          console.error('[BrowserHelper] Captcha solving failed:', solveResult.error);
          return { success: false, error: solveResult.error };
        }
        
        console.log(`[BrowserHelper] Captcha solved using method: ${solveResult.method}`);
      }

      return { success: true };
    } catch (error: any) {
      console.error('[BrowserHelper] Navigation error:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Check and solve captcha on current page
   */
  async solveCaptchaIfPresent(page: Page): Promise<{ solved: boolean; error?: string }> {
    try {
      const needsSolving = await captchaSolver.needsSolving(page);
      
      if (!needsSolving) {
        return { solved: false }; // No captcha present
      }

      console.log('[BrowserHelper] Captcha detected on current page...');
      const result = await captchaSolver.solve(page);
      
      if (result.success) {
        console.log(`[BrowserHelper] Captcha solved: ${result.method}`);
        return { solved: true };
      } else {
        console.error('[BrowserHelper] Captcha solving failed:', result.error);
        return { solved: false, error: result.error };
      }
    } catch (error: any) {
      return { solved: false, error: error.message };
    }
  }
}

// Singleton instance
export const browserHelper = new BrowserHelper();

// Cleanup on process exit
process.on('exit', () => {
  browserHelper.close();
});

process.on('SIGINT', async () => {
  await browserHelper.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await browserHelper.close();
  process.exit(0);
});
