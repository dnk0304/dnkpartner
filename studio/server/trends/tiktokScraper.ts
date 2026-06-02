/**
 * TikTok Trends Scraper — Isolated Stealth Edition (rebuilt 2026-06)
 * --------------------------------------------------------------------------
 * BLOCK DIAGNOSED (live, 2026-06): /discover returns HTTP 200 with a full
 * ~520KB page — TikTok does NOT hard-block it. The old scraper returned 0
 * because of TWO regressions:
 *   1. It read trending tags out of `__UNIVERSAL_DATA_FOR_REHYDRATION__
 *      .__DEFAULT_SCOPE__["webapp.discover"]`. TikTok REMOVED that scope — the
 *      rehydration blob now only carries app-context/i18n/abtest keys, so the
 *      JSON path yields nothing. (Confirmed live: scope keys are
 *      webapp.app-context, webapp.biz-context, webapp.i18n-translation,
 *      seo.abtest, webapp.a-b — no discover.)
 *   2. Its `({.*?});` regex assumed an assignment; the data now lives in a
 *      `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">` element's textContent.
 *
 * The live page DOES still render real `<a href="/tag/...">` links (~38 of
 * them). FIX: extract trending hashtags from those DOM links, force en-US
 * locale (a datacenter EU IP otherwise gets Spanish tags), and pull hashtag
 * view/video stats from the challenge page's rehydration element when present.
 *
 * Each instance owns its own IsolatedBrowser so a TikTok flag never touches
 * eBay/Etsy.
 */

import { IsolatedBrowser } from './isolatedBrowser.js';
import { SCRAPING_LIMITS } from './scrapingConfig.js';
import type { Page } from 'puppeteer';

export interface TikTokTrend {
  hashtag: string;
  viewCount: number;
  videoCount: number;
  growthRate: number;
  category: string;
  isViral: boolean;
  relatedHashtags: string[];
  topVideos: TikTokVideo[];
  firstDetected: string;
  lastUpdated: string;
}

export interface TikTokVideo {
  id: string;
  description: string;
  author: string;
  authorUrl: string;
  videoUrl: string;
  thumbnailUrl: string;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  viewCount: number;
  hashtags: string[];
  musicTitle: string;
  createdAt: string;
}

export interface TikTokDiscoverItem {
  title: string;
  subtitle: string;
  cover: string;
  id: string;
  type: 'hashtag' | 'sound' | 'effect';
}

const PRODUCT_KEYWORDS = [
  'must have', 'viral product', 'amazon find', 'tiktok made me buy',
  'trending product', 'best buy', 'gift idea', 'under $', 'affordable',
  'game changer', 'worth it', 'life hack', 'organization', 'aesthetic',
];

class TikTokScraper {
  private baseUrl = 'https://www.tiktok.com';
  private cache: Map<string, { data: any; timestamp: number }> = new Map();
  private cacheTTL = 6 * 60 * 60 * 1000;
  private browser = new IsolatedBrowser({
    name: 'tiktok',
    proxyUrl: process.env.TIKTOK_PROXY_URL || process.env.PROXY_URL,
  });

  /** Trending hashtags from the discover page DOM (/tag/ links). */
  async getTrendingHashtags(): Promise<string[]> {
    const cacheKey = 'trending-hashtags';
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) return cached.data;

    console.log('[TikTokScraper] fetching trending hashtags...');
    let page: Page | null = null;
    try {
      page = await this.browser.newPage();
      // /discover is the route that renders trending <a href="/tag/..."> links
      // (verified live: 38 tags). /explore is a video feed with no tag anchors,
      // so it is only a fallback.
      let success = await this.navigate(page, `${this.baseUrl}/discover`);
      if (success) {
        await this.browser.humanScroll(page, 4);
        await this.browser.humanDwell(page, 2000, 4000);
        const tagCount = await page.$$eval('a[href*="/tag/"]', els => els.length).catch(() => 0);
        if (tagCount === 0) success = false;
      }
      if (!success) {
        await this.navigate(page, `${this.baseUrl}/explore`);
        await this.browser.humanScroll(page, 4);
        await this.browser.humanDwell(page, 2000, 4000);
      }

      const hashtags = await page.evaluate(() => {
        const results: string[] = [];
        // Primary: real /tag/ anchor links rendered in the DOM.
        document.querySelectorAll('a[href*="/tag/"]').forEach((el) => {
          const href = (el as HTMLAnchorElement).getAttribute('href') || '';
          const m = href.match(/\/tag\/([^?\/#]+)/);
          if (m && m[1]) {
            const tag = decodeURIComponent(m[1]);
            if (tag.length > 1 && tag.length < 60) results.push(tag);
          }
          const txt = el.textContent?.trim() || '';
          if (txt.startsWith('#')) results.push(txt.slice(1));
        });
        // Secondary: data-e2e hashtag nodes if present.
        document.querySelectorAll('[data-e2e="trending-hashtag"], [data-e2e="challenge-item"]').forEach((el) => {
          const t = el.textContent?.trim().replace(/^#/, '') || '';
          if (t.length > 1 && t.length < 60) results.push(t);
        });
        return results;
      });

      const unique = [...new Set(hashtags)].slice(0, 50);
      console.log(`[TikTokScraper] found ${unique.length} trending hashtags`);
      if (unique.length > 0) this.cache.set(cacheKey, { data: unique, timestamp: Date.now() });
      return unique;
    } catch (err: any) {
      console.error('[TikTokScraper] hashtag fetch failed:', err.message);
      return [];
    } finally {
      if (page) await page.close().catch(() => {});
    }
  }

  private async navigate(page: Page, url: string): Promise<boolean> {
    try {
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await this.browser.humanDwell(page, 2000, 4000);
      const block = await this.browser.detectBlock(page);
      if (block) {
        console.warn(`[TikTokScraper] block detected (${block}) at ${url}`);
        return false;
      }
      return !resp || resp.status() < 400;
    } catch {
      return false;
    }
  }

  /** Hashtag stats from the challenge page rehydration element. */
  async getHashtagDetails(hashtag: string): Promise<TikTokTrend | null> {
    const clean = hashtag.replace('#', '');
    const cacheKey = `hashtag-${clean}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) return cached.data;

    let page: Page | null = null;
    try {
      page = await this.browser.newPage();
      const ok = await this.navigate(page, `${this.baseUrl}/tag/${encodeURIComponent(clean)}`);
      if (!ok) return this.minimalTrend(clean);

      const data = await page.evaluate(() => {
        let viewCount = 0, videoCount = 0;
        const related: string[] = [];

        // Rehydration data now lives in a <script id> element's textContent.
        const el = document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__');
        if (el?.textContent) {
          try {
            const json = JSON.parse(el.textContent);
            const scope = json.__DEFAULT_SCOPE__ || {};
            const cd = scope['webapp.challenge-detail'];
            const stats = cd?.challengeInfo?.challenge?.stats || cd?.challengeInfo?.stats;
            if (stats) {
              viewCount = parseInt(stats.viewCount || '0') || 0;
              videoCount = parseInt(stats.videoCount || '0') || 0;
            }
          } catch { /* ignore */ }
        }

        // DOM fallback for view counts.
        if (viewCount === 0) {
          const nodes = document.querySelectorAll('[data-e2e="challenge-vvcount"], [data-e2e="challenge-view-count"], [title*="view" i]');
          nodes.forEach((n) => {
            const m = (n.textContent || '').match(/([\d.]+)\s*([KMB])?/i);
            if (m) {
              const mult = m[2]?.toUpperCase() === 'K' ? 1e3 : m[2]?.toUpperCase() === 'M' ? 1e6 : m[2]?.toUpperCase() === 'B' ? 1e9 : 1;
              viewCount = Math.max(viewCount, Math.round(parseFloat(m[1]) * mult));
            }
          });
        }

        document.querySelectorAll('a[href*="/tag/"]').forEach((el) => {
          const m = (el as HTMLAnchorElement).getAttribute('href')?.match(/\/tag\/([^?\/#]+)/);
          if (m && m[1]) related.push(decodeURIComponent(m[1]));
        });

        return { viewCount, videoCount, related };
      });

      const isViral = data.viewCount > 10_000_000 || data.videoCount > 10_000;
      const growthRate = isViral ? Math.min(100, (data.viewCount / 1_000_000) * 10)
        : data.viewCount > 1_000_000 ? 20 : 5;

      const trend: TikTokTrend = {
        hashtag: clean,
        viewCount: data.viewCount,
        videoCount: data.videoCount,
        growthRate,
        category: this.detectCategory(clean),
        isViral,
        relatedHashtags: [...new Set(data.related)].filter(h => h !== clean).slice(0, 10),
        topVideos: [],
        firstDetected: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
      };
      this.cache.set(cacheKey, { data: trend, timestamp: Date.now() });
      return trend;
    } catch (err: any) {
      console.error(`[TikTokScraper] hashtag "${hashtag}" failed:`, err.message);
      return this.minimalTrend(clean);
    } finally {
      if (page) await page.close().catch(() => {});
    }
  }

  /** A discover-page hashtag with no stats page reachable is still a real
   *  trending signal — emit it with zeroed stats rather than dropping it. */
  private minimalTrend(clean: string): TikTokTrend {
    return {
      hashtag: clean, viewCount: 0, videoCount: 0, growthRate: 5,
      category: this.detectCategory(clean), isViral: false, relatedHashtags: [],
      topVideos: [], firstDetected: new Date().toISOString(), lastUpdated: new Date().toISOString(),
    };
  }

  async getAllTrends(): Promise<TikTokTrend[]> {
    const hashtags = await this.getTrendingHashtags();
    const trends: TikTokTrend[] = [];
    try {
      for (const h of hashtags.slice(0, SCRAPING_LIMITS.TOP_HASHTAGS)) {
        try {
          const t = await this.getHashtagDetails(h);
          if (t) trends.push(t);
          await new Promise(r => setTimeout(r, 1500 + Math.floor(Math.random() * 2000)));
        } catch (err: any) {
          console.error(`[TikTokScraper] analyze "${h}":`, err.message);
        }
      }
    } finally {
      await this.browser.close();
    }
    console.log(`[TikTokScraper] collected ${trends.length} TikTok trends`);
    return trends.sort((a, b) => b.viewCount - a.viewCount);
  }

  async getProductTrends(): Promise<TikTokTrend[]> {
    const all = await this.getAllTrends();
    return all.filter(t => {
      const h = t.hashtag.toLowerCase();
      return PRODUCT_KEYWORDS.some(k => h.includes(k.toLowerCase().replace(/\s+/g, '')))
        || ['product', 'musthave', 'viral', 'amazon', 'haul', 'review', 'unboxing', 'gift'].some(k => h.includes(k));
    });
  }

  async searchHashtags(query: string): Promise<string[]> {
    const all = await this.getTrendingHashtags();
    const q = query.toLowerCase();
    return all.filter(t => t.toLowerCase().includes(q));
  }

  private detectCategory(hashtag: string): string {
    const h = hashtag.toLowerCase();
    const map: Record<string, string[]> = {
      fashion: ['fashion', 'style', 'outfit', 'ootd', 'clothing', 'shoes'],
      beauty: ['beauty', 'makeup', 'skincare', 'hair', 'nails'],
      food: ['food', 'recipe', 'cooking', 'baking', 'foodie'],
      home: ['home', 'decor', 'interior', 'organization', 'diy'],
      fitness: ['fitness', 'workout', 'gym', 'yoga'],
      tech: ['tech', 'gadget', 'phone', 'app', 'gaming'],
      books: ['book', 'reading', 'booktok', 'novel'],
      art: ['art', 'drawing', 'painting', 'creative', 'design'],
      kids: ['kids', 'baby', 'parenting', 'toy', 'family'],
      lifestyle: ['lifestyle', 'vlog', 'daily', 'routine', 'verano', 'primavera'],
    };
    for (const [cat, kws] of Object.entries(map)) if (kws.some(k => h.includes(k))) return cat;
    return 'other';
  }

  calculateVelocity(trend: TikTokTrend): number {
    if (trend.videoCount === 0) return 0;
    const v = trend.viewCount / trend.videoCount;
    if (v > 100000) return 10;
    if (v > 50000) return 7;
    if (v > 10000) return 5;
    if (v > 1000) return 3;
    return 1;
  }

  async getDiscoverItems(): Promise<TikTokDiscoverItem[]> {
    const tags = await this.getTrendingHashtags();
    return tags.map(t => ({ title: t, subtitle: '', cover: '', id: t, type: 'hashtag' as const }));
  }

  clearCache(): void { this.cache.clear(); }
}

export const tiktokScraper = new TikTokScraper();
export { PRODUCT_KEYWORDS };
