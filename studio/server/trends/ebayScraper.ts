/**
 * eBay Trending Scraper — Isolated Stealth Edition (rebuilt 2026-06)
 * --------------------------------------------------------------------------
 * BLOCK DIAGNOSED (live, 2026-06): a COLD direct hit to /sch/i.html returns
 * HTTP 403 ("Error Page | eBay", ~538-byte body). After visiting the homepage
 * first (warm cookie jar + same-site referer) the SAME search returns 200 with
 * full results. Separately, eBay migrated the results markup from `.s-item`
 * (what the old scraper looked for — 0 matches) to `.s-card`. So the old
 * scraper was hit by BOTH a cold-session 403 AND selector rot.
 *
 * FIX: dedicated IsolatedBrowser (own fingerprint + cookie jar), homepage
 * warm-up, then `.s-card` extraction. Verified live: 66 cards, real titles
 * (e.g. "1:4 Scale NATURE JOURNAL Illustrated Readable Miniature Book"), real
 * prices and real /itm/ links. The first two ".s-card"s are the "Shop on eBay"
 * placeholder — skipped.
 */

import { IsolatedBrowser } from './isolatedBrowser.js';
import { SCRAPING_LIMITS } from './scrapingConfig.js';
import { adaptiveRateLimiter } from './adaptiveRateLimiter.js';
import type { Page } from 'puppeteer';

export interface EbayTrend {
  query: string;
  category: string;
  listingCount: number;
  averagePrice: number;
  priceRange: { min: number; max: number };
  soldCount: number;
  watchCount: number;
  popularityScore: number;
  topListings: EbayListing[];
  firstDetected: string;
  lastUpdated: string;
}

export interface EbayListing {
  id: string;
  title: string;
  price: number;
  currency: string;
  condition: string;
  sellerName: string;
  url: string;
  imageUrl: string;
  watchers: number;
  soldCount: number;
  location: string;
  shippingCost: number;
  isAuction: boolean;
  endsAt?: string;
}

export interface EbayCategory {
  id: string;
  name: string;
  trendingSearches: string[];
  itemCount: number;
}

const EBAY_CATEGORIES = [
  { id: '267', name: 'Books & Magazines', path: '/b/Books-Magazines/267/bn_1854485' },
  { id: '220', name: 'Toys & Hobbies', path: '/b/Toys-Hobbies/220/bn_1865497' },
  { id: '11700', name: 'Home & Garden', path: '/b/Home-Garden/11700/bn_1849856' },
  { id: '159912', name: 'Crafts', path: '/b/Crafts/14339/bn_1854633' },
];

// Seed queries used to surface "what's trending" when eBay's homepage exposes no
// machine-readable trending widget (it no longer does). These are the KDP/craft
// relevant verticals DNK Trends cares about; each is analysed for real volume.
const EBAY_SEED_QUERIES = [
  'journal', 'planner', 'sticker sheet', 'enamel pin', 'art print',
  'coloring book', 'puzzle', 'board game', 'vinyl record', 'funko pop',
  'crochet kit', 'embroidery kit', 'tarot deck', 'notebook', 'sketchbook',
  'wall art', 'phone case', 'tote bag', 'keychain', 'candle',
];

class EbayScraper {
  private baseUrl = 'https://www.ebay.com';
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private cacheTTL = 24 * 60 * 60 * 1000;
  private browser = new IsolatedBrowser({
    name: 'ebay',
    proxyUrl: process.env.EBAY_PROXY_URL || process.env.PROXY_URL,
  });
  private warmedUp = false;

  private async ensureWarm(page: Page): Promise<void> {
    if (this.warmedUp) return;
    await this.browser.warmUp(page, this.baseUrl);
    this.warmedUp = true;
  }

  async getTrendingSearches(): Promise<string[]> {
    // eBay no longer publishes a scrapeable trending widget; use the curated
    // KDP/craft seed verticals. analyzeTrend() validates each against live data.
    return [...EBAY_SEED_QUERIES];
  }

  async search(query: string, options?: { limit?: number; category?: string }): Promise<EbayListing[]> {
    const { limit = SCRAPING_LIMITS.TOP_PRODUCTS_PER_PLATFORM, category } = options || {};
    const cacheKey = `search-${query}-${category || 'all'}-${limit}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      console.log(`[EbayScraper] cache hit "${query}"`);
      return cached.data;
    }

    let page: Page | null = null;
    try {
      await adaptiveRateLimiter.waitForDomain('ebay.com');
      page = await this.browser.newPage();
      await this.ensureWarm(page);
      await this.browser.humanDwell(page, 1200, 3000);

      const params = new URLSearchParams({
        _nkw: query,
        _ipg: String(Math.min(limit, 60)),
        _sop: '12',
      });
      if (category) params.append('_sacat', category);
      const searchUrl = `${this.baseUrl}/sch/i.html?${params}`;

      const resp = await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
      if (resp && resp.status() === 403) {
        // Cold/blocked: re-warm once and retry.
        console.warn(`[EbayScraper] 403 on "${query}" — re-warming and retrying`);
        this.warmedUp = false;
        await this.ensureWarm(page);
        await this.browser.humanDwell(page, 2000, 4000);
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
      }

      // Wait for the results list to actually render (eBay hydrates after DCL).
      const rendered = await page
        .waitForSelector('.s-card, .s-item, .srp-river-results', { timeout: 15000 })
        .then(() => true)
        .catch(() => false);

      if (!rendered) {
        // Only now is a block plausible — check the (small) interstitial body.
        const block = await this.browser.detectBlock(page);
        console.warn(`[EbayScraper] no results rendered for "${query}"${block ? ` (block: ${block})` : ''}`);
        adaptiveRateLimiter.onRateLimit('ebay.com');
        return [];
      }

      await this.browser.humanScroll(page, 2);
      await this.browser.saveSession(page);

      const listings = await page.evaluate((maxItems: number) => {
        const out: any[] = [];
        const cards = Array.from(document.querySelectorAll('.s-card, .s-item'));
        for (let i = 0; i < cards.length && out.length < maxItems; i++) {
          const c = cards[i];
          const title = (
            c.querySelector('.s-card__title .su-styled-text, .s-card__title, .su-styled-text.primary, .s-item__title')
              ?.textContent || ''
          ).replace(/Opens in a new window or tab/i, '').trim();
          if (!title || /^shop on ebay$/i.test(title)) continue;

          const priceText = (c.querySelector('.s-card__price, .s-item__price')?.textContent || '').trim();
          const priceMatch = priceText.replace(/,/g, '').match(/[\d.]+/);
          const price = priceMatch ? parseFloat(priceMatch[0]) : 0;

          const linkEl = c.querySelector('a[href*="/itm/"]') as HTMLAnchorElement | null;
          const url = (linkEl?.getAttribute('href') || '').split('?')[0];
          if (!url) continue;
          const idMatch = url.match(/\/itm\/(\d+)/);
          const id = idMatch ? idMatch[1] : `item-${i}`;

          const img = c.querySelector('img');
          const imageUrl = img?.getAttribute('src') || img?.getAttribute('data-src') || '';

          const attrText = (
            c.querySelector('.s-card__attribute-row, .s-card__subtitle, .SECONDARY_INFO')?.textContent || ''
          ).trim();
          const condition = /pre-?owned|used|open box/i.test(attrText) ? attrText : (attrText || 'New');

          const soldText = c.querySelector('.s-card__caption, .s-item__quantitySold, .s-item__dynamic')?.textContent || '';
          const soldCount = parseInt(soldText.replace(/[^\d]/g, '')) || 0;

          const shipText = c.querySelector('.s-card__shipping, .s-item__shipping')?.textContent || '';
          const shipMatch = shipText.replace(/,/g, '').match(/[\d.]+/);
          const shippingCost = shipMatch ? parseFloat(shipMatch[0]) : 0;

          out.push({
            id, title, price, currency: 'USD', condition, sellerName: '',
            url: url.startsWith('http') ? url : `https://www.ebay.com${url}`,
            imageUrl, watchers: 0, soldCount, location: '', shippingCost,
            isAuction: /bid|auction/i.test(attrText),
          });
        }
        return out;
      }, limit);

      if (listings.length > 0) adaptiveRateLimiter.onSuccess('ebay.com');
      console.log(`[EbayScraper] "${query}" -> ${listings.length} real listings`);
      this.cache.set(cacheKey, { data: listings, timestamp: Date.now() });
      return listings;
    } catch (err: any) {
      console.error(`[EbayScraper] error "${query}":`, err.message);
      adaptiveRateLimiter.onFailure('ebay.com');
      return [];
    } finally {
      if (page) await page.close().catch(() => {});
    }
  }

  async analyzeTrend(query: string): Promise<EbayTrend | null> {
    const cacheKey = `analyze-${query}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) return cached.data;

    const listings = await this.search(query, { limit: 60 });
    if (listings.length === 0) return null;

    const prices = listings.map(l => l.price).filter(p => p > 0);
    const averagePrice = prices.length ? prices.reduce((s, p) => s + p, 0) / prices.length : 0;
    const priceRange = prices.length
      ? { min: Math.min(...prices), max: Math.max(...prices) }
      : { min: 0, max: 0 };
    const totalSold = listings.reduce((s, l) => s + l.soldCount, 0);

    const popularityScore = Math.min(100, Math.round(
      (totalSold / Math.max(listings.length, 1)) * 4 +
      (listings.length / 60) * 60
    ));

    const trend: EbayTrend = {
      query,
      category: this.detectCategory(query, listings),
      listingCount: listings.length,
      averagePrice: Math.round(averagePrice * 100) / 100,
      priceRange,
      soldCount: totalSold,
      watchCount: 0,
      popularityScore,
      topListings: listings.slice(0, 10),
      firstDetected: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    };
    this.cache.set(cacheKey, { data: trend, timestamp: Date.now() });
    return trend;
  }

  async getAllTrends(): Promise<EbayTrend[]> {
    const queries = await this.getTrendingSearches();
    const trends: EbayTrend[] = [];
    const max = Math.min(SCRAPING_LIMITS.TOP_TRENDING_KEYWORDS, queries.length);
    console.log(`[EbayScraper] analyzing ${max} seed verticals...`);
    try {
      for (const query of queries.slice(0, max)) {
        try {
          const trend = await this.analyzeTrend(query);
          if (trend && trend.listingCount > 0) trends.push(trend);
        } catch (err: any) {
          console.error(`[EbayScraper] analyze "${query}":`, err.message);
        }
      }
    } finally {
      await this.browser.close();
      this.warmedUp = false;
    }
    return trends.sort((a, b) => b.popularityScore - a.popularityScore);
  }

  async getCategoryTrending(): Promise<EbayCategory[]> {
    return EBAY_CATEGORIES.map(c => ({ id: c.id, name: c.name, trendingSearches: [], itemCount: 0 }));
  }

  private detectCategory(query: string, _listings: EbayListing[]): string {
    const q = query.toLowerCase();
    const map: Record<string, string[]> = {
      books: ['book', 'journal', 'planner', 'notebook', 'sketchbook'],
      toys: ['toy', 'funko', 'game', 'puzzle', 'board game'],
      home: ['candle', 'wall art', 'decor', 'tote'],
      crafts: ['crochet', 'embroidery', 'sticker', 'craft', 'enamel pin'],
      art: ['art print', 'print', 'tarot'],
    };
    for (const [cat, kws] of Object.entries(map)) if (kws.some(k => q.includes(k))) return cat;
    return 'other';
  }

  clearCache(): void { this.cache.clear(); }
}

export const ebayScraper = new EbayScraper();
export { EBAY_CATEGORIES };
