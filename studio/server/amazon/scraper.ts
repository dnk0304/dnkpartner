import { Page } from 'puppeteer';
import { Marketplace, ScrapeResult, ASINResult, ASINDetails } from './types';
import { v4 as uuidv4 } from 'uuid';
import { browserManager } from './browserManager';

// User agents pool for rotation
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 OPR/105.0.0.0',
];

// Marketplace URL mapping
const MARKETPLACE_URLS: Record<Marketplace, string> = {
  US: 'https://www.amazon.com',
  UK: 'https://www.amazon.co.uk',
  DE: 'https://www.amazon.de',
};

class AmazonScraper {
  private userAgentIndex = 0;

  /**
   * Get next user agent in rotation
   */
  private getNextUserAgent(): string {
    const userAgent = USER_AGENTS[this.userAgentIndex];
    this.userAgentIndex = (this.userAgentIndex + 1) % USER_AGENTS.length;
    return userAgent;
  }

  /**
   * Human-like delay
   */
  private async humanDelay(minMs: number = 1000, maxMs: number = 3000): Promise<void> {
    const delay = Math.random() * (maxMs - minMs) + minMs;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Simulate human mouse movements
   */
  private async simulateHumanBehavior(page: Page): Promise<void> {
    try {
      // Random scroll
      await page.evaluate(() => {
        window.scrollBy({
          top: Math.random() * 500 + 200,
          behavior: 'smooth'
        });
      });
      
      await this.humanDelay(500, 1500);
      
      // Scroll back a bit
      await page.evaluate(() => {
        window.scrollBy({
          top: -(Math.random() * 200),
          behavior: 'smooth'
        });
      });
    } catch (error) {
      // Ignore errors in behavior simulation
    }
  }

  /**
   * Detect CAPTCHA or blocking
   */
  private async detectCaptcha(page: Page): Promise<boolean> {
    try {
      const content = await page.content();
      const captchaKeywords = [
        'captcha',
        'robot check',
        'automated access',
        'enter the characters you see below',
        'Type the characters you see in this image',
      ];
      
      const lowerContent = content.toLowerCase();
      return captchaKeywords.some(keyword => lowerContent.includes(keyword));
    } catch (error) {
      return false;
    }
  }

  /**
   * Calculate confidence score based on data quality
   */
  private calculateConfidence(hasPrice: boolean, hasRating: boolean, hasReviews: boolean): number {
    let confidence = 0.5; // Base confidence
    if (hasPrice) confidence += 0.2;
    if (hasRating) confidence += 0.15;
    if (hasReviews) confidence += 0.15;
    return Math.min(confidence, 1.0);
  }

  /**
   * Estimate sales based on rank (simplified algorithm)
   */
  private estimateSales(rank: number): number {
    if (rank <= 10) return Math.floor(1000 - (rank * 50));
    if (rank <= 50) return Math.floor(500 - ((rank - 10) * 10));
    if (rank <= 100) return Math.floor(300 - ((rank - 50) * 4));
    return Math.max(50, Math.floor(200 - rank));
  }

  /**
   * Extract text with multiple selector fallbacks
   */
  private async extractText(page: Page, selectors: string[]): Promise<string> {
    for (const selector of selectors) {
      try {
        const element = await page.$(selector);
        if (element) {
          const text = await page.evaluate(el => el.textContent, element);
          if (text && text.trim()) {
            return text.trim();
          }
        }
      } catch (error) {
        // Try next selector
        continue;
      }
    }
    return '';
  }

  /**
   * Scrape Amazon search results for a keyword
   */
  async scrapeKeyword(keyword: string, marketplace: Marketplace): Promise<ScrapeResult> {
    const page = await browserManager.createPage();
    const baseUrl = MARKETPLACE_URLS[marketplace];
    const runId = uuidv4();

    try {
      // Set user agent
      await page.setUserAgent(this.getNextUserAgent());
      
      console.log(`[Scraper] Starting scrape for keyword: ${keyword} (${marketplace})`);
      
      // Navigate to search results
      const searchUrl = `${baseUrl}/s?k=${encodeURIComponent(keyword)}`;
      await page.goto(searchUrl, { 
        waitUntil: 'domcontentloaded', 
        timeout: 30000 
      });

      // Human delay before checking page
      await this.humanDelay(1000, 2000);

      // Check for CAPTCHA
      const hasCaptcha = await this.detectCaptcha(page);
      if (hasCaptcha) {
        console.warn(`[Scraper] CAPTCHA detected for keyword: ${keyword}`);
        await page.close();
        throw new Error('CAPTCHA_DETECTED');
      }

      // Simulate human behavior
      await this.simulateHumanBehavior(page);

      // Wait for results to load with multiple selector fallbacks
      const resultsSelectors = [
        '[data-component-type="s-search-result"]',
        '.s-result-item',
        '[data-asin]:not([data-asin=""])',
      ];

      let resultsFound = false;
      for (const selector of resultsSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 10000 });
          resultsFound = true;
          console.log(`[Scraper] Found results with selector: ${selector}`);
          break;
        } catch (error) {
          continue;
        }
      }

      if (!resultsFound) {
        throw new Error('No results found on page');
      }

      // Extract results
      const results = await page.evaluate(() => {
        const items = document.querySelectorAll('[data-component-type="s-search-result"], .s-result-item, [data-asin]:not([data-asin=""])');
        const extractedResults: any[] = [];
        let rank = 1;

        items.forEach((item) => {
          try {
            // Extract ASIN
            const asin = item.getAttribute('data-asin') || '';
            if (!asin || asin === '') return;

            // Check if sponsored
            const sponsoredBadge = item.querySelector('.s-label-popover-default, .s-sponsored-label-text, [aria-label*="Sponsored"]');
            const isSponsored = !!sponsoredBadge;

            // Extract title with fallbacks
            const titleSelectors = [
              'h2 a span',
              'h2 span',
              '.s-title-instructions-style span',
              'h2 a',
              '.a-link-normal.s-line-clamp-2',
            ];
            let title = '';
            for (const selector of titleSelectors) {
              const titleElement = item.querySelector(selector);
              if (titleElement?.textContent) {
                title = titleElement.textContent.trim();
                if (title) break;
              }
            }

            // Extract price with fallbacks
            const priceSelectors = [
              '.a-price-whole',
              '.a-price .a-offscreen',
              '.a-price-symbol + .a-price-whole',
            ];
            let price = 0;
            for (const selector of priceSelectors) {
              const priceElement = item.querySelector(selector);
              if (priceElement?.textContent) {
                const priceText = priceElement.textContent.trim();
                price = parseFloat(priceText.replace(/[^0-9.]/g, ''));
                if (price > 0) break;
              }
            }

            // Extract rating with fallbacks
            const ratingSelectors = [
              '.a-icon-star-small span',
              '.a-icon-alt',
              '[aria-label*="out of 5 stars"]',
            ];
            let rating = 0;
            for (const selector of ratingSelectors) {
              const ratingElement = item.querySelector(selector);
              if (ratingElement) {
                const ratingText = ratingElement.textContent || ratingElement.getAttribute('aria-label') || '';
                const match = ratingText.match(/(\d+\.?\d*)\s*out of/i);
                if (match) {
                  rating = parseFloat(match[1]);
                  break;
                }
              }
            }

            // Extract review count with fallbacks
            const reviewSelectors = [
              '[aria-label*="ratings"]',
              '.s-underline-text',
              'span[aria-label*="stars"]',
            ];
            let reviews = 0;
            for (const selector of reviewSelectors) {
              const reviewElement = item.querySelector(selector);
              if (reviewElement) {
                const reviewText = reviewElement.getAttribute('aria-label') || reviewElement.textContent || '';
                const reviewMatch = reviewText.match(/[\d,]+/);
                if (reviewMatch) {
                  reviews = parseInt(reviewMatch[0].replace(/,/g, ''));
                  if (reviews > 0) break;
                }
              }
            }

            // Extract image
            const imgElement = item.querySelector('img.s-image, img[data-image-index="0"]');
            const imageUrl = imgElement?.getAttribute('src') || '';

            if (title) { // Only add if we have at least a title
              extractedResults.push({
                asin,
                rank: isSponsored ? 0 : rank++,
                price,
                rating,
                reviews,
                title,
                imageUrl,
                sponsored: isSponsored,
              });
            }
          } catch (error) {
            console.error('Error extracting item:', error);
          }
        });

        return extractedResults;
      });

      // Process and enhance results
      const processedResults: ASINResult[] = results.map((item) => {
        const confidence = this.calculateConfidence(
          item.price > 0,
          item.rating > 0,
          item.reviews > 0
        );
        
        return {
          ...item,
          rankConfidence: confidence,
          estimatedSales: item.rank > 0 ? this.estimateSales(item.rank) : 0,
        };
      });

      await page.close();

      console.log(`[Scraper] ✓ Successfully scraped ${processedResults.length} results for: ${keyword}`);

      return {
        keyword,
        marketplace,
        results: processedResults,
        scrapedAt: new Date().toISOString(),
        totalResults: processedResults.length,
        runId,
      };
    } catch (error) {
      await page.close();
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[Scraper] ✗ Failed to scrape keyword "${keyword}":`, errorMessage);
      
      throw new Error(`Failed to scrape keyword "${keyword}": ${errorMessage}`);
    }
  }

  /**
   * Scrape detailed information for a specific ASIN
   */
  async scrapeASIN(asin: string, marketplace: Marketplace): Promise<ASINDetails> {
    const page = await browserManager.createPage();
    const baseUrl = MARKETPLACE_URLS[marketplace];

    try {
      // Set user agent
      await page.setUserAgent(this.getNextUserAgent());
      
      console.log(`[Scraper] Starting ASIN scrape: ${asin} (${marketplace})`);

      // Navigate to product page
      const productUrl = `${baseUrl}/dp/${asin}`;
      await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // Human delay
      await this.humanDelay(1000, 2000);

      // Check for CAPTCHA
      const hasCaptcha = await this.detectCaptcha(page);
      if (hasCaptcha) {
        console.warn(`[Scraper] CAPTCHA detected for ASIN: ${asin}`);
        await page.close();
        throw new Error('CAPTCHA_DETECTED');
      }

      // Simulate human behavior
      await this.simulateHumanBehavior(page);

      // Wait for product details
      await page.waitForSelector('#productTitle, h1', { timeout: 10000 });

      // Extract details with fallbacks
      const details = await page.evaluate(() => {
        // Title
        const titleElement = document.querySelector('#productTitle, h1.product-title, h1');
        const title = titleElement?.textContent?.trim() || '';

        // Price
        let price = 0;
        const priceSelectors = [
          '.a-price-whole',
          '#priceblock_ourprice',
          '#priceblock_dealprice',
          '.a-price .a-offscreen',
        ];
        for (const selector of priceSelectors) {
          const priceElement = document.querySelector(selector);
          if (priceElement?.textContent) {
            const priceText = priceElement.textContent.trim();
            price = parseFloat(priceText.replace(/[^0-9.]/g, ''));
            if (price > 0) break;
          }
        }

        // Rating
        let rating = 0;
        const ratingSelectors = [
          '[data-hook="rating-out-of-text"]',
          '.a-icon-star span',
          '[aria-label*="out of 5 stars"]',
        ];
        for (const selector of ratingSelectors) {
          const ratingElement = document.querySelector(selector);
          if (ratingElement) {
            const ratingText = ratingElement.textContent || ratingElement.getAttribute('aria-label') || '';
            const match = ratingText.match(/(\d+\.?\d*)\s*out of/i);
            if (match) {
              rating = parseFloat(match[1]);
              break;
            }
          }
        }

        // Reviews
        let reviews = 0;
        const reviewSelectors = [
          '#acrCustomerReviewText',
          '[data-hook="total-review-count"]',
          '#acrCustomerReviewLink',
        ];
        for (const selector of reviewSelectors) {
          const reviewElement = document.querySelector(selector);
          if (reviewElement?.textContent) {
            const reviewText = reviewElement.textContent.trim();
            const match = reviewText.match(/[\d,]+/);
            if (match) {
              reviews = parseInt(match[0].replace(/,/g, ''));
              if (reviews > 0) break;
            }
          }
        }

        // Rank (BSR)
        let rank = 0;
        const rankSelectors = [
          '#SalesRank',
          '#productDetails_detailBullets_sections1 tr:has-text("Best Sellers Rank")',
          '[id*="productDetails"] tr',
        ];
        for (const selector of rankSelectors) {
          const rankElement = document.querySelector(selector);
          if (rankElement?.textContent) {
            const rankText = rankElement.textContent;
            const rankMatch = rankText.match(/#([\d,]+)/);
            if (rankMatch) {
              rank = parseInt(rankMatch[1].replace(/,/g, ''));
              break;
            }
          }
        }

        // Category
        const categoryElement = document.querySelector('#wayfinding-breadcrumbs_feature_div li:last-child, .a-breadcrumb li:last-child');
        const category = categoryElement?.textContent?.trim() || 'Unknown';

        // Image
        const imageElement = document.querySelector('#landingImage, #imgBlkFront, img[data-old-hires]');
        const imageUrl = imageElement?.getAttribute('src') || imageElement?.getAttribute('data-old-hires') || '';

        // Availability
        const availabilityElement = document.querySelector('#availability span, #availability, [data-csa-c-availability]');
        const availability = availabilityElement?.textContent?.trim() || 'Unknown';

        return {
          title,
          price,
          rating,
          reviews,
          rank,
          category,
          imageUrl,
          availability,
        };
      });

      await page.close();

      console.log(`[Scraper] ✓ Successfully scraped ASIN: ${asin}`);

      return {
        asin,
        marketplace,
        ...details,
        scrapedAt: new Date().toISOString(),
      };
    } catch (error) {
      await page.close();
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[Scraper] ✗ Failed to scrape ASIN "${asin}":`, errorMessage);
      
      throw new Error(`Failed to scrape ASIN "${asin}": ${errorMessage}`);
    }
  }
}

// Export singleton instance
export const amazonScraper = new AmazonScraper();
