import { ScrapeResult, ASINResult, Marketplace } from './types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Generate mock/simulated Amazon search results
 * Used as fallback when real scraping fails
 */
export class MockDataGenerator {
  /**
   * Generate a random ASIN
   */
  private generateASIN(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    return 'B0' + Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  }

  /**
   * Generate a realistic product title based on keyword
   */
  private generateTitle(keyword: string, index: number): string {
    const prefixes = [
      'Premium',
      'Professional',
      'Best Seller',
      'Top Rated',
      'Amazon\'s Choice',
      'New Release',
      'Bestselling',
      'Popular',
    ];

    const suffixes = [
      '- Great Quality',
      '- Perfect Gift',
      '- Best Value',
      'for Adults and Kids',
      'Set',
      'Collection',
      'Edition',
      'Pack',
    ];

    const capitalizedKeyword = keyword.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');

    const prefix = index < 3 ? prefixes[Math.floor(Math.random() * prefixes.length)] : '';
    const suffix = Math.random() > 0.5 ? suffixes[Math.floor(Math.random() * suffixes.length)] : '';

    return `${prefix ? prefix + ' ' : ''}${capitalizedKeyword}${suffix ? ' ' + suffix : ''}`.trim();
  }

  /**
   * Generate random price based on product rank
   */
  private generatePrice(rank: number): number {
    // Top-ranked products tend to be in sweet spot price range
    const basePrice = 15 + Math.random() * 35; // $15-$50
    const rankFactor = rank > 10 ? 1 + (Math.random() - 0.5) * 0.5 : 1;
    return parseFloat((basePrice * rankFactor).toFixed(2));
  }

  /**
   * Generate rating (weighted towards higher ratings)
   */
  private generateRating(rank: number): number {
    // Top products have higher ratings
    const baseRating = rank <= 10 ? 4.3 + Math.random() * 0.6 : 3.5 + Math.random() * 1.3;
    return parseFloat(Math.min(baseRating, 5.0).toFixed(1));
  }

  /**
   * Generate review count (weighted by rank)
   */
  private generateReviews(rank: number): number {
    if (rank <= 3) return Math.floor(5000 + Math.random() * 15000);
    if (rank <= 10) return Math.floor(2000 + Math.random() * 5000);
    if (rank <= 20) return Math.floor(500 + Math.random() * 2000);
    if (rank <= 50) return Math.floor(100 + Math.random() * 500);
    return Math.floor(10 + Math.random() * 100);
  }

  /**
   * Estimate sales based on rank
   */
  private estimateSales(rank: number): number {
    if (rank <= 10) return Math.floor(1000 - (rank * 50));
    if (rank <= 50) return Math.floor(500 - ((rank - 10) * 10));
    if (rank <= 100) return Math.floor(300 - ((rank - 50) * 4));
    return Math.max(50, Math.floor(200 - rank));
  }

  /**
   * Generate a placeholder image URL
   */
  private generateImageUrl(asin: string): string {
    // Use a placeholder service with unique seed based on ASIN
    const seed = asin.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return `https://picsum.photos/seed/${seed}/300/300`;
  }

  /**
   * Generate mock search results for a keyword
   */
  generateSearchResults(keyword: string, marketplace: Marketplace, resultCount: number = 48): ScrapeResult {
    const results: ASINResult[] = [];
    let organicRank = 1;

    for (let i = 0; i < resultCount; i++) {
      // Some results are sponsored (about 20%)
      const isSponsored = i < resultCount * 0.2 && Math.random() > 0.5;
      const rank = isSponsored ? 0 : organicRank++;

      const asin = this.generateASIN();
      const price = this.generatePrice(rank);
      const rating = this.generateRating(rank);
      const reviews = this.generateReviews(rank);

      results.push({
        asin,
        rank,
        rankConfidence: 0.5, // Lower confidence for simulated data
        price,
        rating,
        reviews,
        title: this.generateTitle(keyword, i),
        imageUrl: this.generateImageUrl(asin),
        estimatedSales: this.estimateSales(rank),
        sponsored: isSponsored,
      });
    }

    return {
      keyword,
      marketplace,
      results,
      scrapedAt: new Date().toISOString(),
      totalResults: results.length,
      runId: uuidv4(),
    };
  }

  /**
   * Generate mock results with specific characteristics
   */
  generateCustomResults(
    keyword: string,
    marketplace: Marketplace,
    options: {
      minPrice?: number;
      maxPrice?: number;
      resultCount?: number;
      highCompetition?: boolean;
    } = {}
  ): ScrapeResult {
    const {
      minPrice = 10,
      maxPrice = 100,
      resultCount = 48,
      highCompetition = false,
    } = options;

    const baseResults = this.generateSearchResults(keyword, marketplace, resultCount);

    // Adjust prices to fit range
    baseResults.results = baseResults.results.map(result => ({
      ...result,
      price: parseFloat((minPrice + Math.random() * (maxPrice - minPrice)).toFixed(2)),
      reviews: highCompetition
        ? Math.floor(result.reviews * 2)
        : result.reviews,
      rating: highCompetition
        ? Math.min(result.rating + 0.3, 5.0)
        : result.rating,
    }));

    return baseResults;
  }
}

// Export singleton instance
export const mockDataGenerator = new MockDataGenerator();

