/**
 * Isolated Browser Session
 * --------------------------------------------------------------------------
 * Per Dennis's directive: "make 3 separate scripts with logic so they don't
 * get flagged." Each scraper gets its OWN IsolatedBrowser instance with its
 * own Chromium process, its own fingerprint and its own cookie jar. If one
 * source flags us, the others keep an entirely independent identity — no
 * shared singleton browser (the old `browserHelper` shared one process across
 * etsy/ebay/tiktok/pinterest, so a single block looked like the same client
 * hammering four endpoints).
 *
 * Each instance pins ONE consistent fingerprint for its lifetime (UA + platform
 * + locale + viewport). Rotating these mid-session is itself a bot tell, so we
 * pick once at construction and keep it stable like a real browser would.
 */

import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Browser, Page } from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// One stealth plugin registration for the puppeteer-extra module. Each
// IsolatedBrowser still launches a fully separate Chromium process.
puppeteer.use(StealthPlugin());

const SESSION_DIR = path.join(__dirname, '../../.sessions');
if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });

// Coherent fingerprint profiles. UA, platform and the UA-CH brand must agree —
// mismatched values (e.g. a Mac UA with navigator.platform "Win32") are a classic
// detection signal, so we keep each profile internally consistent.
interface FingerprintProfile {
  ua: string;
  platform: string;
  vendor: string;
  uaPlatform: string; // sec-ch-ua-platform
  viewport: { width: number; height: number };
  hardwareConcurrency: number;
  deviceMemory: number;
}

const PROFILES: FingerprintProfile[] = [
  {
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    platform: 'Win32', vendor: 'Google Inc.', uaPlatform: '"Windows"',
    viewport: { width: 1920, height: 1080 }, hardwareConcurrency: 8, deviceMemory: 8,
  },
  {
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    platform: 'Win32', vendor: 'Google Inc.', uaPlatform: '"Windows"',
    viewport: { width: 1536, height: 864 }, hardwareConcurrency: 12, deviceMemory: 8,
  },
  {
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    platform: 'MacIntel', vendor: 'Google Inc.', uaPlatform: '"macOS"',
    viewport: { width: 1680, height: 1050 }, hardwareConcurrency: 8, deviceMemory: 8,
  },
];

export interface IsolatedBrowserOptions {
  /** Label used in logs and the session cookie file name. */
  name: string;
  /** Override the proxy for this source only (e.g. process.env.ETSY_PROXY_URL). */
  proxyUrl?: string;
  /** Force a specific profile index; otherwise derived stably from `name`. */
  profileIndex?: number;
  headless?: boolean;
}

export class IsolatedBrowser {
  private browser: Browser | null = null;
  private readonly name: string;
  private readonly proxyUrl?: string;
  private readonly headless: boolean;
  private readonly profile: FingerprintProfile;
  private launching: Promise<Browser> | null = null;

  constructor(opts: IsolatedBrowserOptions) {
    this.name = opts.name;
    this.proxyUrl = opts.proxyUrl;
    this.headless = opts.headless !== false;
    // Stable profile per source name so a source keeps the same identity across
    // runs (deterministic hash of the name -> profile index).
    const idx = opts.profileIndex ??
      [...this.name].reduce((a, c) => a + c.charCodeAt(0), 0) % PROFILES.length;
    this.profile = PROFILES[idx];
  }

  private sessionFile(): string {
    return path.join(SESSION_DIR, `isolated-${this.name}.json`);
  }

  async getBrowser(): Promise<Browser> {
    if (this.browser && this.browser.isConnected()) return this.browser;
    if (this.launching) return this.launching;

    this.launching = (async () => {
      const args = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-blink-features=AutomationControlled',
        `--window-size=${this.profile.viewport.width},${this.profile.viewport.height}`,
        '--lang=en-US,en',
        '--disable-features=IsolateOrigins,site-per-process',
        // Force locale/timezone to en-US so geo-IP localized sites (e.g. TikTok
        // serving Spanish from an EU datacenter IP) still hand us English data.
        `--user-agent=${this.profile.ua}`,
      ];
      if (this.proxyUrl) args.push(`--proxy-server=${this.proxyUrl}`);

      console.log(`[Isolated:${this.name}] launching dedicated browser (profile ${this.profile.platform})`);
      const browser = await puppeteer.launch({
        headless: this.headless,
        args,
        ignoreHTTPSErrors: true,
        defaultViewport: null,
      } as any);
      this.browser = browser;
      browser.on('disconnected', () => { this.browser = null; });
      return browser;
    })();

    try {
      return await this.launching;
    } finally {
      this.launching = null;
    }
  }

  async newPage(): Promise<Page> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    await page.setViewport(this.profile.viewport);
    await page.setUserAgent(this.profile.ua);
    await page.emulateTimezone('America/New_York').catch(() => {});

    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': this.profile.uaPlatform,
      'Upgrade-Insecure-Requests': '1',
    });

    const p = this.profile;
    await page.evaluateOnNewDocument((prof: FingerprintProfile) => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'platform', { get: () => prof.platform });
      Object.defineProperty(navigator, 'vendor', { get: () => prof.vendor });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => prof.hardwareConcurrency });
      Object.defineProperty(navigator, 'deviceMemory', { get: () => prof.deviceMemory });
      Object.defineProperty(navigator, 'plugins', {
        get: () => [
          { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
          { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
          { name: 'Native Client', filename: 'internal-nacl-plugin' },
        ],
      });
      (window as any).chrome = { runtime: {}, loadTimes() {}, csi() {}, app: {} };
      const origQuery = window.navigator.permissions.query.bind(window.navigator.permissions);
      window.navigator.permissions.query = (params: any) =>
        params && params.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
          : origQuery(params);
    }, p as any);

    await this.loadSession(page);
    return page;
  }

  /** Visit the homepage first so the search/detail request carries a warm cookie
   *  jar and a same-site referer — the single biggest unblocker for eBay, which
   *  403s a cold direct hit to /sch but serves results once a homepage cookie
   *  (and human dwell) is present. */
  async warmUp(page: Page, homeUrl: string): Promise<void> {
    try {
      await page.goto(homeUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await this.humanDwell(page, 1500, 3500);
      await this.humanScroll(page, 2);
      await this.saveSession(page);
    } catch (err: any) {
      console.warn(`[Isolated:${this.name}] warm-up failed: ${err.message}`);
    }
  }

  async humanDwell(page: Page, min = 800, max = 3200): Promise<void> {
    await new Promise(r => setTimeout(r, min + Math.floor(Math.random() * (max - min))));
  }

  async humanScroll(page: Page, rounds = 3): Promise<void> {
    for (let i = 0; i < rounds; i++) {
      const dist = 300 + Math.floor(Math.random() * 500);
      await page.evaluate((d) => window.scrollBy(0, d), dist).catch(() => {});
      await this.humanDwell(page, 400, 1100);
    }
  }

  /** Detect a genuine hard block vs. a transient/empty page.
   *  Returns the kind of block so the caller can decide (retry vs. give up). */
  async detectBlock(page: Page): Promise<'datadome' | 'cloudflare' | 'captcha' | 'denied' | null> {
    return page.evaluate(() => {
      const html = document.body?.innerHTML || '';
      const len = html.length;
      const title = (document.title || '').toLowerCase();
      // Real interstitials are TINY pages. A full results page (hundreds of KB)
      // that merely mentions "cloudflare" in an asset URL is NOT a block — only
      // treat short pages dominated by challenge markers as blocks.
      if (len > 80000) return null;
      // DataDome serves a tiny interstitial with a `var dd={...}` blob.
      if (/var dd\s*=\s*\{/.test(html) || /geo\.captcha-delivery\.com/i.test(html)) return 'datadome';
      if (/just a moment|cf-challenge|cf-browser-verification|checking your browser/i.test(html)
          || title.includes('just a moment')) return 'cloudflare';
      if (len < 6000 && /captcha|verify you are human|are you a robot|px-captcha|perimeterx/i.test(html)) return 'captcha';
      if (len < 3000 && /access (denied|to this page)|unusual traffic/i.test(html)) return 'denied';
      return null;
    }) as Promise<'datadome' | 'cloudflare' | 'captcha' | 'denied' | null>;
  }

  private async loadSession(page: Page): Promise<void> {
    const f = this.sessionFile();
    if (!fs.existsSync(f)) return;
    try {
      const data = JSON.parse(fs.readFileSync(f, 'utf-8'));
      if (Array.isArray(data.cookies) && data.cookies.length) {
        await page.setCookie(...data.cookies);
      }
    } catch { /* ignore corrupt session */ }
  }

  async saveSession(page: Page): Promise<void> {
    try {
      const cookies = await page.cookies();
      fs.writeFileSync(this.sessionFile(), JSON.stringify({ cookies, ts: new Date().toISOString() }, null, 2));
    } catch { /* non-fatal */ }
  }

  async close(): Promise<void> {
    if (this.browser) {
      try { await this.browser.close(); } catch { /* ignore */ }
      this.browser = null;
    }
  }
}
