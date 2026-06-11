/**
 * Etsy Trending Scraper — API-first + Isolated Stealth fallback (2026-06-11)
 * --------------------------------------------------------------------------
 * Layer 1: Etsy Open API v3 (ETSY_API_KEY granted 2026-06-11; budget-gated via
 *          etsyBudget — persistent daily counter, header-aware caps, <=5 qps).
 * Layer 2: Isolated stealth Puppeteer scraping (Ghost rebuild, 2026-06).
 *          DataDome hard-blocks datacenter IPs (HTTP 403 `var dd={...}`), so
 *          this path only works through a residential proxy (ETSY_PROXY_URL).
 *
 * AUTH (live-tested 2026-06-11): the working `x-api-key` value is the
 * COLON-JOINED `keystring:secret`. Keystring alone returns 403. ETSY_API_KEY
 * must therefore hold the FULL header value. Read from env only — never
 * hardcoded. If unset, the API layer is skipped (fail soft).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IsolatedBrowser } from './isolatedBrowser.js';
import { SCRAPING_LIMITS } from './scrapingConfig.js';
import { adaptiveRateLimiter } from './adaptiveRateLimiter.js';
import { etsyBudget } from './etsyBudget.js';
import { keywordStore } from './keywordStore.js';
import type { Page } from 'puppeteer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Platform-specific raw snapshots: timestamped per-niche listing snapshots so
// trend deltas are computable across pulls.
const SNAPSHOT_DIR = path.join(__dirname, '../../data/scrapers/etsy/snapshots');

const ETSY_API_BASE = 'https://openapi.etsy.com/v3/application';

/** Raw-ish listing snapshot entry persisted per pull. */
export interface EtsyListingSnapshot {
  listingId: number;
  title: string;
  price: number;
  currency: string;
  numFavorers: number;
  createdAt: string; // ISO from original_creation_timestamp
  url: string;
  taxonomyId: number | null;
  tags: string[];
}

export interface EtsyNicheSnapshot {
  pulledAt: string;
  niche: string; // keyword, or `taxonomy:<id>`
  taxonomyId: number | null;
  totalCount: number; // Etsy-reported total result count (search-volume proxy)
  listings: EtsyListingSnapshot[];
}

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
  private proxyUrl = process.env.ETSY_PROXY_URL || process.env.PROXY_URL || '';
  private browser = new IsolatedBrowser({ name: 'etsy', proxyUrl: this.proxyUrl || undefined });
  private dataDomeBlocked = false; // latch: once DataDome 403s, stop hammering this run

  /**
   * API layer is active only when ETSY_API_KEY is present (env-only, fail soft).
   * NOTE: ETSY_KEYSTRING-only auth was removed — keystring alone returns 403;
   * the live-verified header value is colon-joined `keystring:secret`.
   */
  isApiEnabled(): boolean {
    return !!process.env.ETSY_API_KEY;
  }

  async search(query: string, options?: { limit?: number; category?: string }): Promise<EtsyListing[]> {
    const { limit = SCRAPING_LIMITS.TOP_PRODUCTS_PER_PLATFORM, category } = options || {};
    const cacheKey = `search-${query}-${category || 'all'}-${limit}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) return cached.data;

    // Layer 1: official Etsy Open API v3 (primary as of 2026-06-11).
    if (this.isApiEnabled()) {
      const api = await this.searchWithApi(query, options);
      if (api.length) { this.cache.set(cacheKey, { data: api, timestamp: Date.now() }); return api; }
      console.log(`[EtsyScraper] API returned no results for "${query}", falling back to stealth scraping...`);
    }

    // Layer 2: isolated stealth Puppeteer.
    // DataDome already blocked this run and we have no proxy -> stop.
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
          `or the Etsy Open API key (ETSY_API_KEY). Returning [].`
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

  // ============================================
  // ETSY OPEN API v3 (Layer 1)
  // ============================================

  /**
   * Budget-gated GET against the Etsy v3 API.
   * Returns null (fail soft) when the key is unset, the daily budget is
   * exhausted, or the request fails — callers fall back to stealth scraping.
   * Records every request against etsyBudget and absorbs Etsy's rate-limit
   * headers (X-Limit-Per-Day / X-Remaining-This-Day).
   */
  private async apiFetch(pathname: string, params: URLSearchParams): Promise<any | null> {
    const apiKey = process.env.ETSY_API_KEY;
    if (!apiKey) {
      console.warn('[EtsyScraper] ETSY_API_KEY not set, skipping API call');
      return null;
    }

    if (!etsyBudget.canRequest()) {
      const status = etsyBudget.getStatus();
      console.warn(`[EtsyScraper] Daily API budget exhausted (${status.requestsToday}/${status.dailyCap}), skipping pull until UTC midnight`);
      return null;
    }

    try {
      await etsyBudget.waitForSlot();
      const response = await fetch(`${ETSY_API_BASE}${pathname}?${params}`, {
        headers: { 'x-api-key': apiKey },
      });
      etsyBudget.recordRequest(response.headers);

      if (response.status === 429) {
        console.warn('[EtsyScraper] Etsy API rate-limited (429), backing off');
        return null;
      }
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        // 403 "API key not found or not active" == key pending approval OR
        // wrong key format (must be colon-joined keystring:secret).
        if (response.status === 403 && /not active|not found/i.test(body)) {
          console.warn(
            `[EtsyScraper] Etsy API key rejected (HTTP 403: ${body.slice(0, 120)}). ` +
            `Check ETSY_API_KEY is the colon-joined keystring:secret value.`
          );
        } else {
          console.error(`[EtsyScraper] Etsy API ${response.status} ${response.statusText} on ${pathname}`);
        }
        return null;
      }
      return await response.json();
    } catch (error: any) {
      console.error('[EtsyScraper] Etsy API request failed:', error.message);
      return null;
    }
  }

  /**
   * findAllListingsActive — search-volume proxy per tracked niche keyword,
   * or category bestseller proxy when taxonomyId is given.
   * sort_on=score surfaces Etsy's relevancy/popularity ranking.
   * NOTE: this endpoint does NOT support `includes` (no images/shop) — use
   * the batch endpoint for enrichment.
   */
  async searchActiveListings(options: {
    keywords?: string;
    taxonomyId?: number;
    limit?: number;
  }): Promise<{ totalCount: number; listings: EtsyListingSnapshot[] } | null> {
    const { keywords, taxonomyId, limit = 100 } = options;
    const params = new URLSearchParams({
      limit: Math.min(100, limit).toString(),
      sort_on: 'score',
    });
    if (keywords) params.set('keywords', keywords);
    if (taxonomyId !== undefined) params.set('taxonomy_id', taxonomyId.toString());

    const data = await this.apiFetch('/listings/active', params);
    if (!data || !Array.isArray(data.results)) return null;

    return {
      totalCount: typeof data.count === 'number' ? data.count : data.results.length,
      listings: data.results.map((item: any) => this.toSnapshotListing(item)),
    };
  }

  /**
   * getListingsByListingIds (raw) — batch endpoint, up to 100 ids per call.
   * Supports `includes=Images,Shop` for enrichment (unlike /listings/active).
   * Chunks input; caps at maxCalls batch requests.
   */
  private async getListingsBatchRaw(listingIds: number[], includes?: string, maxCalls = 2): Promise<any[]> {
    const results: any[] = [];
    const chunks: number[][] = [];
    for (let i = 0; i < listingIds.length; i += 100) {
      chunks.push(listingIds.slice(i, i + 100));
    }

    for (const chunk of chunks.slice(0, maxCalls)) {
      const params = new URLSearchParams({ listing_ids: chunk.join(',') });
      if (includes) params.set('includes', includes);
      const data = await this.apiFetch('/listings/batch', params);
      if (data && Array.isArray(data.results)) {
        results.push(...data.results);
      }
    }

    return results;
  }

  /** getListingsByListingIds mapped to snapshot shape — batch detail refresh. */
  async getListingsByIds(listingIds: number[], maxCalls = 2): Promise<EtsyListingSnapshot[]> {
    const raw = await this.getListingsBatchRaw(listingIds, undefined, maxCalls);
    return raw.map((item: any) => this.toSnapshotListing(item));
  }

  private toSnapshotListing(item: any): EtsyListingSnapshot {
    // v3 money object: { amount, divisor, currency_code }
    const amount = Number(item.price?.amount) || 0;
    const divisor = Number(item.price?.divisor) || 100;
    const createdTs = Number(item.original_creation_timestamp || item.created_timestamp) || 0;

    return {
      listingId: Number(item.listing_id) || 0,
      title: String(item.title || ''),
      price: amount / divisor,
      currency: String(item.price?.currency_code || 'USD'),
      numFavorers: Number(item.num_favorers) || 0,
      createdAt: createdTs ? new Date(createdTs * 1000).toISOString() : '',
      url: String(item.url || ''),
      taxonomyId: typeof item.taxonomy_id === 'number' ? item.taxonomy_id : null,
      tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
    };
  }

  private snapshotToListing(snap: EtsyListingSnapshot): EtsyListing {
    return {
      id: snap.listingId.toString(),
      title: snap.title,
      price: snap.price,
      currency: snap.currency,
      shopName: '',
      url: snap.url,
      imageUrl: '',
      reviewCount: snap.numFavorers, // favorers as engagement proxy
      rating: 0,
      isBestseller: false,
      tags: snap.tags,
    };
  }

  /**
   * Pull one niche snapshot via the API: 1 search call, persisted with a
   * timestamp so trend deltas are computable across pulls.
   */
  async pullNicheSnapshot(niche: { keyword?: string; taxonomyId?: number }): Promise<EtsyNicheSnapshot | null> {
    const result = await this.searchActiveListings({
      keywords: niche.keyword,
      taxonomyId: niche.taxonomyId,
      limit: 100,
    });
    if (!result) return null;

    const snapshot: EtsyNicheSnapshot = {
      pulledAt: new Date().toISOString(),
      niche: niche.keyword || `taxonomy:${niche.taxonomyId}`,
      taxonomyId: niche.taxonomyId ?? null,
      totalCount: result.totalCount,
      listings: result.listings,
    };

    this.persistSnapshot(snapshot);
    return snapshot;
  }

  /** Append a snapshot to the per-UTC-day JSON file under data/scrapers/etsy/snapshots/. */
  private persistSnapshot(snapshot: EtsyNicheSnapshot): void {
    try {
      if (!fs.existsSync(SNAPSHOT_DIR)) {
        fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });
      }
      const file = path.join(SNAPSHOT_DIR, `${snapshot.pulledAt.slice(0, 10)}.json`);
      let existing: EtsyNicheSnapshot[] = [];
      if (fs.existsSync(file)) {
        try {
          const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
          if (Array.isArray(parsed)) existing = parsed;
        } catch {
          // Corrupt file — start a fresh array rather than crash the pull
        }
      }
      existing.push(snapshot);
      fs.writeFileSync(file, JSON.stringify(existing));
    } catch (error: any) {
      console.error('[EtsyScraper] Failed to persist snapshot:', error.message);
    }
  }

  /** Latest snapshot timestamp across persisted files (freshness for /api/trends/health). */
  getLastSnapshotAt(): string | null {
    try {
      if (!fs.existsSync(SNAPSHOT_DIR)) return null;
      const files = fs.readdirSync(SNAPSHOT_DIR).filter(f => f.endsWith('.json')).sort();
      const latestFile = files[files.length - 1];
      if (!latestFile) return null;
      const parsed = JSON.parse(fs.readFileSync(path.join(SNAPSHOT_DIR, latestFile), 'utf-8'));
      if (!Array.isArray(parsed) || parsed.length === 0) return null;
      return parsed[parsed.length - 1].pulledAt || null;
    } catch {
      return null;
    }
  }

  /**
   * Search via Etsy Open API v3 (Layer 1).
   * Two-step shape (cost: 2 requests per keyword, both budget-gated):
   *   1. /listings/active — base listings + total count (snapshot persisted).
   *   2. /listings/batch?includes=Images,Shop — enriches image URLs + shop
   *      names in one batched call (the only endpoint where includes works).
   */
  private async searchWithApi(query: string, options?: { limit?: number; category?: string }): Promise<EtsyListing[]> {
    const { limit = SCRAPING_LIMITS.TOP_PRODUCTS_PER_PLATFORM } = options || {};

    const snapshot = await this.pullNicheSnapshot({ keyword: query });
    if (!snapshot || snapshot.listings.length === 0) return [];

    // Batch-enrich with Images + Shop (1 extra call; fail-soft to bare listings).
    const imageById = new Map<string, string>();
    const shopById = new Map<string, string>();
    const ids = snapshot.listings.slice(0, limit).map(l => l.listingId).filter(Boolean);
    if (ids.length) {
      const enriched = await this.getListingsBatchRaw(ids, 'Images,Shop', 1);
      enriched.forEach((it: any) => {
        const lid = String(it.listing_id || '');
        const img = it.images?.[0];
        if (img) imageById.set(lid, img.url_570xN || img.url_340x270 || img.url_fullxfull || '');
        if (it.shop?.shop_name) shopById.set(lid, it.shop.shop_name);
      });
    }

    const out = snapshot.listings.slice(0, limit).map(s => {
      const listing = this.snapshotToListing(s);
      listing.imageUrl = imageById.get(listing.id) || '';
      listing.shopName = shopById.get(listing.id) || '';
      return listing;
    });

    console.log(`[EtsyScraper] Etsy API "${query}" -> ${out.length} listings (count=${snapshot.totalCount}, ${imageById.size} w/ images)`);
    return out;
  }

  /**
   * API-first trend collection over tracked niche keywords (1 search call per
   * niche — no enrichment needed for trend metrics). With ~50 niches x
   * ETSY_PULLS_PER_DAY pulls this stays far below the daily budget.
   */
  async getTrendsViaApi(): Promise<EtsyTrend[]> {
    const nicheKeywords = keywordStore
      .getTopKeywords(50, { minPriority: 0 })
      .map(k => k.keyword);

    const queries = nicheKeywords.length > 0 ? nicheKeywords : [...ETSY_SEED_QUERIES];

    const trends: EtsyTrend[] = [];
    const now = new Date().toISOString();

    for (const keyword of queries) {
      if (!etsyBudget.canRequest()) {
        console.warn('[EtsyScraper] Budget exhausted mid-pull, stopping (resumes next UTC day)');
        break;
      }

      const snapshot = await this.pullNicheSnapshot({ keyword });
      if (!snapshot || snapshot.listings.length === 0) continue;

      const prices = snapshot.listings.map(l => l.price).filter(p => p > 0);
      const avgFavorers = snapshot.listings.reduce((sum, l) => sum + l.numFavorers, 0) / snapshot.listings.length;
      // Listings created in the last 30 days — proxy for niche momentum
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const recentRatio = snapshot.listings.filter(l => l.createdAt && Date.parse(l.createdAt) > cutoff).length / snapshot.listings.length;

      const popularityScore = Math.min(100, Math.round(
        Math.min(1, avgFavorers / 200) * 40 +         // engagement 40%
        recentRatio * 30 +                              // freshness/momentum 30%
        Math.min(1, snapshot.totalCount / 10000) * 30   // market size 30%
      ));

      trends.push({
        query: keyword,
        category: this.detectCategory(keyword),
        listingCount: snapshot.totalCount,
        popularityScore,
        priceRange: {
          min: prices.length ? Math.min(...prices) : 0,
          max: prices.length ? Math.max(...prices) : 0,
        },
        topListings: snapshot.listings.slice(0, 10).map(s => this.snapshotToListing(s)),
        firstDetected: now,
        lastUpdated: now,
      });
    }

    return trends.sort((a, b) => b.popularityScore - a.popularityScore);
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
    // Layer 1: API-first (2026-06-11 — Etsy API access granted).
    if (this.isApiEnabled()) {
      const apiTrends = await this.getTrendsViaApi();
      if (apiTrends.length > 0) {
        return apiTrends;
      }
      console.warn('[EtsyScraper] API trend pull returned nothing, falling back to stealth scraping path');
    }

    // Layer 2: isolated stealth scraping over seed queries.
    const queries = await this.getTrendingSearches();
    const trends: EtsyTrend[] = [];
    try {
      for (const q of queries.slice(0, SCRAPING_LIMITS.TOP_TRENDING_KEYWORDS)) {
        if (this.dataDomeBlocked && !this.proxyUrl && !this.isApiEnabled()) break;
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
