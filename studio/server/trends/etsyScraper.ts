/**
 * Etsy Trending Scraper — Isolated Stealth Edition (rebuilt 2026-06)
 * --------------------------------------------------------------------------
 * BLOCK DIAGNOSED (live, 2026-06): HARD BLOCK by DataDome. EVERY endpoint —
 * homepage, /c/ category, /search, even /suggestions_ajax.php — returns HTTP
 * 403 with a tiny (~1.2KB) body containing `var dd={'rt':'c','cid':...}` (the
 * DataDome challenge fingerprint). This is NOT selector rot and NOT a cold
 * session: DataDome is blocking the datacenter IP outright. Browser stealth
 * alone cannot defeat DataDome from a datacenter IP — it needs either:
 *   (a) a residential/mobile proxy (set ETSY_PROXY_URL), or
 *   (b) the Etsy Open API v3 key (set ETSY_API_KEY or ETSY_KEYSTRING).
 *
 * STATUS: NEEDS PROXY OR API KEY. The code below does the right thing the
 * moment Dennis supplies either:
 *   - If an API key is present -> uses the official Etsy Open API (clean, no
 *     scraping). This is the recommended path.
 *   - Else if a proxy is configured -> attempts isolated stealth scraping
 *     through it.
 *   - Else -> attempts a best-effort stealth hit, detects the DataDome 403,
 *     logs the explicit reason, and returns [] (scheduler falls back to mock).
 */

import { IsolatedBrowser } from './isolatedBrowser.js';
import { SCRAPING_LIMITS } from './scrapingConfig.js';
import { adaptiveRateLimiter } from './adaptiveRateLimiter.js';
import type { Page } from 'puppeteer';

export interface EtsyTrend {
  query: string;
  category: string;
  listingCount: number;
  popularityScore: number;
  priceRange: { min: number; max: number };
  topListings: EtsyListing[];
  firstDetected: string;
  lastUpdated: string;
}

export interface EtsyListing {
  id: string;
  title: string;
  price: number;
  currency: string;
  shopName: string;
  url: string;
  imageUrl: string;
  reviewCount: number;
  rating: number;
  isBestseller: boolean;
  tags: string[];
}

export interface EtsyCategory {
  id: string;
  name: string;
  trendingSearches: string[];
  itemCount: number;
}

const ETSY_CATEGORIES = [
  { id: 'paper-goods', name: 'Paper & Party Supplies', path: '/c/paper-and-party-supplies' },
  { id: 'art-collectibles', name: 'Art & Collectibles', path: '/c/art-and-collectibles' },
  { id: 'craft-supplies', name: 'Craft Supplies', path: '/c/craft-supplies-and-tools' },
  { id: 'books-movies', name: 'Books, Movies & Music', path: '/c/books-movies-and-music' },
  { id: 'home-living', name: 'Home & Living', path: '/c/home-and-living' },
  { id: 'toys-games', name: 'Toys & Games', path: '/c/toys-and-games' },
  { id: 'wedding', name: 'Weddings', path: '/c/weddings' },
];

const ETSY_SEED_QUERIES = [
  'printable wall art', 'svg files', 'digital planner', 'sticker sheet',
  'custom name sign', 'birthday party printable', 'wedding invitation template',
  'coloring pages', 'crochet pattern', 'enamel pin', 'tarot deck', 'journal',
];

class EtsyScraper {
  private baseUrl = 'https://www.etsy.com';
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private cacheTTL = 24 * 60 * 60 * 1000;
  private etsyApiKey = process.env.ETSY_API_KEY || process.env.ETSY_KEYSTRING || '';
  private get useApi() { return !!this.etsyApiKey; }
  private proxyUrl = process.env.ETSY_PROXY_URL || process.env.PROXY_URL || '';
  private browser = new IsolatedBrowser({ name: 'etsy', proxyUrl: this.proxyUrl || undefined });
  private dataDomeBlocked = false; // latch: once DataDome 403s, stop hammering this run

  async search(query: string, options?: { limit?: number; category?: string }): Promise<EtsyListing[]> {
    const { limit = SCRAPING_LIMITS.TOP_PRODUCTS_PER_PLATFORM, category } = options || {};
    const cacheKey = `search-${query}-${category || 'all'}-${limit}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) return cached.data;

    // Preferred path: official Etsy Open API.
    if (this.useApi) {
      const api = await this.searchWithApi(query, options);
      if (api.length) { this.cache.set(cacheKey, { data: api, timestamp: Date.now() }); return api; }
    }

    // DataDome already blocked this run and we have no proxy/API -> stop.
    if (this.dataDomeBlocked && !this.proxyUrl) return [];

    const scraped = await this.searchWithPuppeteer(query, options);
    if (scraped.length) this.cache.set(cacheKey, { data: scraped, timestamp: Date.now() });
    return scraped;
  }

  private async searchWithPuppeteer(query: string, options?: { limit?: number; category?: string }): Promise<EtsyListing[]> {
    const { limit = SCRAPING_LIMITS.TOP_PRODUCTS_PER_PLATFORM, category } = options || {};
    let page: Page | null = null;
    try {
      await adaptiveRateLimiter.waitForDomain('etsy.com');
      page = await this.browser.newPage();

      const params = new URLSearchParams({ q: query, ref: 'search_bar' });
      if (category) { params.append('explicit', '1'); params.append('category', category); }
      const searchUrl = `${this.baseUrl}/search?${params}`;

      const resp = await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await this.browser.humanDwell(page, 1500, 3500);

      const block = await this.browser.detectBlock(page);
      if (block === 'datadome' || (resp && resp.status() === 403)) {
        this.dataDomeBlocked = true;
        console.warn(
          `[EtsyScraper] BLOCKED by DataDome (HTTP ${resp?.status()}) for "${query}". ` +
          `Etsy is undefeatable from this IP without a residential proxy (ETSY_PROXY_URL) ` +
          `or the Etsy Open API key (ETSY_API_KEY / ETSY_KEYSTRING). Returning [].`
        );
        adaptiveRateLimiter.onRateLimit('etsy.com');
        return [];
      }
      if (block) {
        console.warn(`[EtsyScraper] blocked (${block}) for "${query}"`);
        return [];
      }

      await this.browser.humanScroll(page, 3);
      await this.browser.saveSession(page);

      const listings = await page.evaluate((maxItems: number) => {
        const out: any[] = [];
        const selectors = [
          '[data-listing-id]', '.v2-listing-card', '.wt-grid__item-xs-6',
          'li[data-palette-listing-id]', 'div[data-appears-component-name*="listing"]',
        ];
        let els: Element[] = [];
        for (const s of selectors) { els = Array.from(document.querySelectorAll(s)); if (els.length) break; }
        els.forEach((el, i) => {
          if (out.length >= maxItems) return;
          const id = el.getAttribute('data-listing-id') || el.getAttribute('data-palette-listing-id') || `listing-${i}`;
          const title = (el.querySelector('h3, .v2-listing-card__title, [data-title]')?.textContent || '').trim();
          const priceEl = el.querySelector('.currency-value, [data-currency-value], .n-listing-card__price');
          const priceText = priceEl?.getAttribute('data-currency-value') || priceEl?.textContent?.replace(/[^\d.]/g, '') || '0';
          const price = parseFloat(priceText) || 0;
          const link = el.querySelector('a[href*="/listing/"]')?.getAttribute('href') || '';
          const img = el.querySelector('img');
          const imageUrl = img?.getAttribute('src') || img?.getAttribute('data-src') || '';
          const shop = (el.querySelector('[data-shop-name], .v2-listing-card__shop')?.textContent || '').trim();
          if (title) {
            out.push({
              id, title, price, currency: 'USD', shopName: shop,
              url: link.startsWith('http') ? link : `https://www.etsy.com${link}`,
              imageUrl, reviewCount: 0, rating: 0, isBestseller: false, tags: [],
            });
          }
        });
        return out;
      }, limit);

      if (listings.length) adaptiveRateLimiter.onSuccess('etsy.com');
      console.log(`[EtsyScraper] "${query}" -> ${listings.length} listings`);
      return listings;
    } catch (err: any) {
      console.error(`[EtsyScraper] error "${query}":`, err.message);
      adaptiveRateLimiter.onFailure('etsy.com');
      return [];
    } finally {
      if (page) await page.close().catch(() => {});
    }
  }

  /**
   * Official Etsy Open API v3 path (api_key only — NO OAuth required for these
   * two public read endpoints; verified against developers.etsy.com reference
   * 2026-06-02).
   *
   * Two-step shape, both authenticated with `x-api-key: <keystring>` only:
   *   1. GET /v3/application/listings/active?keywords=...&limit=...
   *        -> base listings (listing_id, title, price, url, tags, num_favorers).
   *        NOTE: this endpoint does NOT support an `includes` param, so it
   *        returns NO images and NO shop object. (Passing `includes` here is a
   *        no-op at best.)
   *   2. GET /v3/application/listings/batch?listing_ids=a,b,c&includes=Images,Shop
   *        -> enriches the same listings with image URLs + shop_name in ONE
   *        batched call (the `includes` param IS supported here).
   *
   * Cost: 2 requests per keyword. Standard quota is 10 QPS / 10,000 QPD per
   * key, so this is comfortably within limits for our ~12 seed keywords/day.
   */
  private async searchWithApi(query: string, options?: { limit?: number }): Promise<EtsyListing[]> {
    const { limit = SCRAPING_LIMITS.TOP_PRODUCTS_PER_PLATFORM } = options || {};
    const headers = { 'x-api-key': this.etsyApiKey };
    try {
      // Step 1: keyword search of active listings (no includes supported here).
      const searchParams = new URLSearchParams({ keywords: query, limit: String(limit) });
      const res = await fetch(`https://openapi.etsy.com/v3/application/listings/active?${searchParams}`, { headers });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        // 403 "API key not found or not active" == key still PENDING ETSY APPROVAL.
        if (res.status === 403 && /not active|not found/i.test(body)) {
          console.warn(
            `[EtsyScraper] Etsy API key PENDING APPROVAL (HTTP 403: ${body.slice(0, 120)}). ` +
            `This is expected until Etsy activates the app. Returning [] (scheduler falls back to mock).`
          );
        } else {
          console.error(`[EtsyScraper] Etsy API ${res.status} ${res.statusText}: ${body.slice(0, 200)}`);
        }
        return [];
      }
      const data: any = await res.json();
      const baseResults: any[] = data.results || [];
      if (!baseResults.length) {
        console.log(`[EtsyScraper] Etsy API "${query}" -> 0 listings`);
        return [];
      }

      // Step 2: batch-enrich with Images + Shop (includes IS supported here).
      const imageById = new Map<string, string>();
      const shopById = new Map<string, string>();
      try {
        const ids = baseResults.map((it) => it.listing_id).filter(Boolean).join(',');
        if (ids) {
          const batchParams = new URLSearchParams({ listing_ids: ids, includes: 'Images,Shop' });
          const enrichRes = await fetch(`https://openapi.etsy.com/v3/application/listings/batch?${batchParams}`, { headers });
          if (enrichRes.ok) {
            const enrich: any = await enrichRes.json();
            (enrich.results || []).forEach((it: any) => {
              const lid = String(it.listing_id || '');
              const img = it.images?.[0];
              if (img) imageById.set(lid, img.url_570xN || img.url_340x270 || img.url_fullxfull || '');
              if (it.shop?.shop_name) shopById.set(lid, it.shop.shop_name);
            });
          } else {
            console.warn(`[EtsyScraper] Etsy batch-enrich ${enrichRes.status} — proceeding without images/shop`);
          }
        }
      } catch (e: any) {
        console.warn(`[EtsyScraper] Etsy batch-enrich failed (${e.message}) — proceeding without images/shop`);
      }

      const out: EtsyListing[] = baseResults.map((it: any) => {
        const id = String(it.listing_id || '');
        return {
          id,
          title: it.title || '',
          price: it.price?.amount ? Number(it.price.amount) / Number(it.price.divisor || 100) : 0,
          currency: it.price?.currency_code || 'USD',
          shopName: shopById.get(id) || '',
          url: it.url || '',
          imageUrl: imageById.get(id) || '',
          reviewCount: it.num_favorers || 0,
          rating: 0, isBestseller: false, tags: it.tags || [],
        };
      });
      console.log(`[EtsyScraper] Etsy API "${query}" -> ${out.length} listings (${imageById.size} w/ images)`);
      return out;
    } catch (err: any) {
      console.error('[EtsyScraper] Etsy API error:', err.message);
      return [];
    }
  }

  async getTrendingSearches(): Promise<string[]> {
    return [...ETSY_SEED_QUERIES];
  }

  async analyzeTrend(query: string): Promise<EtsyTrend | null> {
    const listings = await this.search(query, { limit: 48 });
    if (listings.length === 0) return null;
    const prices = listings.map(l => l.price).filter(p => p > 0);
    const priceRange = prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : { min: 0, max: 0 };
    const popularityScore = Math.min(100, Math.round((listings.length / 48) * 100));
    return {
      query,
      category: this.detectCategory(query),
      listingCount: listings.length,
      popularityScore,
      priceRange,
      topListings: listings.slice(0, 10),
      firstDetected: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    };
  }

  async getAllTrends(): Promise<EtsyTrend[]> {
    const queries = await this.getTrendingSearches();
    const trends: EtsyTrend[] = [];
    try {
      for (const q of queries.slice(0, SCRAPING_LIMITS.TOP_TRENDING_KEYWORDS)) {
        if (this.dataDomeBlocked && !this.proxyUrl && !this.useApi) break;
        const t = await this.analyzeTrend(q);
        if (t) trends.push(t);
      }
    } finally {
      await this.browser.close();
    }
    return trends.sort((a, b) => b.popularityScore - a.popularityScore);
  }

  async getTrendingByCategory(): Promise<EtsyCategory[]> {
    return ETSY_CATEGORIES.map(c => ({ id: c.id, name: c.name, trendingSearches: [], itemCount: 0 }));
  }

  private detectCategory(query: string): string {
    const q = query.toLowerCase();
    const map: Record<string, string[]> = {
      books: ['journal', 'planner', 'notebook', 'coloring'],
      art: ['art', 'print', 'svg', 'wall art'],
      paper: ['printable', 'sticker', 'invitation', 'party'],
      craft: ['crochet', 'pattern', 'craft'],
      wedding: ['wedding', 'bride'],
    };
    for (const [cat, kws] of Object.entries(map)) if (kws.some(k => q.includes(k))) return cat;
    return 'other';
  }

  clearCache(): void { this.cache.clear(); }
}

export const etsyScraper = new EtsyScraper();
export { ETSY_CATEGORIES };
