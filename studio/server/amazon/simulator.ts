import { DailySnapshot, ScrapeResult, Marketplace } from './types';

/**
 * Generate realistic 30-day historical data with trends, seasonality, and noise
 */
export class HistoricalSimulator {
  /**
   * Get seasonal multiplier based on date
   * Simulates holiday/seasonal traffic patterns
   */
  private getSeasonalMultiplier(date: Date): number {
    const month = date.getMonth(); // 0-11
    const day = date.getDate();

    // Holiday season boost (November-December)
    if (month === 10 || month === 11) {
      return 1.3 + (month === 11 ? 0.2 : 0); // Extra boost in December
    }

    // Back to school (August-September)
    if (month === 7 || month === 8) {
      return 1.15;
    }

    // Summer slump (June-July)
    if (month === 5 || month === 6) {
      return 0.9;
    }

    // Valentine's Day boost (early February)
    if (month === 1 && day < 15) {
      return 1.2;
    }

    // Prime Day effect (mid-July)
    if (month === 6 && day >= 10 && day <= 20) {
      return 1.4;
    }

    // Black Friday/Cyber Monday (late November)
    if (month === 10 && day >= 20) {
      return 1.5;
    }

    return 1.0; // Normal traffic
  }

  /**
   * Generate random float between min and max
   */
  private randomFloat(min: number, max: number): number {
    return Math.random() * (max - min) + min;
  }

  /**
   * Generate random integer between min and max (inclusive)
   */
  private randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Clamp value between min and max
   */
  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  /**
   * Subtract days from a date
   */
  private subDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() - days);
    return result;
  }

  /**
   * Format date as YYYY-MM-DD
   */
  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Estimate search volume based on keyword characteristics
   */
  private estimateVolume(keyword: string): number {
    const words = keyword.toLowerCase().split(/\s+/);
    const length = words.length;

    // Base volume estimation
    let baseVolume = 50000;

    // Adjust based on keyword length (shorter = more volume)
    if (length === 1) baseVolume = 200000;
    else if (length === 2) baseVolume = 100000;
    else if (length === 3) baseVolume = 50000;
    else baseVolume = 20000;

    // Add randomness
    const variance = this.randomFloat(0.7, 1.3);
    return Math.floor(baseVolume * variance);
  }

  /**
   * Calculate difficulty score (0-100) based on competition
   */
  private calculateDifficulty(avgPrice: number, estimatedVolume: number): number {
    // Higher price and volume = higher difficulty
    const priceFactor = Math.min(avgPrice / 100, 1) * 30; // Max 30 points
    const volumeFactor = Math.min(estimatedVolume / 100000, 1) * 40; // Max 40 points
    const randomFactor = this.randomInt(10, 30); // 10-30 points

    return Math.floor(priceFactor + volumeFactor + randomFactor);
  }

  /**
   * Generate 30-day historical snapshots
   */
  generateHistorical(
    keyword: string,
    marketplace: Marketplace,
    latestSnapshot?: ScrapeResult
  ): DailySnapshot[] {
    const snapshots: DailySnapshot[] = [];
    const today = new Date();

    // Base values from latest snapshot or estimated
    let baseRank = 20;
    let baseVolume = this.estimateVolume(keyword);
    let basePrice = 29.99;

    if (latestSnapshot && latestSnapshot.results.length > 0) {
      // Use real data if available
      const topResults = latestSnapshot.results
        .filter((r) => !r.sponsored && r.rank > 0)
        .slice(0, 10);

      if (topResults.length > 0) {
        baseRank = topResults[0].rank;
        basePrice = topResults.reduce((sum, r) => sum + r.price, 0) / topResults.length;
      }
    }

    // Generate 30 days of data (from 30 days ago to today)
    for (let daysAgo = 30; daysAgo >= 0; daysAgo--) {
      const date = this.subDays(today, daysAgo);
      
      // Weekly cycle (sin wave with 7-day period)
      const weeklyTrend = Math.sin((daysAgo / 7) * Math.PI * 2) * 3;
      
      // Long-term trend (gradual change over 30 days)
      const longTermTrend = (daysAgo - 15) / 5; // -3 to +3 over 30 days
      
      // Random daily noise
      const dailyNoise = this.randomFloat(-2, 2);
      
      // Seasonal multiplier
      const seasonality = this.getSeasonalMultiplier(date);
      
      // Calculate rank with trends and noise
      const rank = this.clamp(
        Math.round(baseRank + weeklyTrend + longTermTrend + dailyNoise),
        1,
        100
      );

      // Calculate volume with seasonality and variance
      const volumeVariance = this.randomFloat(-0.05, 0.05);
      const volume = Math.round(
        baseVolume * seasonality * (1 + volumeVariance)
      );

      // Calculate price with small fluctuations
      const priceVariance = this.randomFloat(-0.03, 0.03);
      const avgPrice = parseFloat(
        (basePrice * (1 + priceVariance)).toFixed(2)
      );

      snapshots.push({
        date: this.formatDate(date),
        rank,
        volume,
        avgPrice,
      });
    }

    return snapshots;
  }

  /**
   * Generate complete keyword search result with simulated data
   */
  generateKeywordResult(
    keyword: string,
    marketplace: Marketplace,
    latestSnapshot?: ScrapeResult
  ): {
    volume: number;
    volumeConfidence: number;
    difficulty: number;
    avgPrice: number;
    totalRevenue: number;
    competitorCount: number;
    snapshots: DailySnapshot[];
  } {
    const snapshots = this.generateHistorical(keyword, marketplace, latestSnapshot);
    
    // Calculate averages from snapshots
    const recentSnapshots = snapshots.slice(-7); // Last 7 days
    const avgVolume = Math.round(
      recentSnapshots.reduce((sum, s) => sum + s.volume, 0) / recentSnapshots.length
    );
    const avgPrice = parseFloat(
      (recentSnapshots.reduce((sum, s) => sum + s.avgPrice, 0) / recentSnapshots.length).toFixed(2)
    );

    // Calculate metrics
    const difficulty = this.calculateDifficulty(avgPrice, avgVolume);
    const competitorCount = latestSnapshot?.totalResults || this.randomInt(50, 200);
    const totalRevenue = Math.round(avgVolume * avgPrice * 30); // Monthly revenue estimate

    // Confidence is lower for simulated data
    const volumeConfidence = latestSnapshot ? 0.75 : 0.45;

    return {
      volume: avgVolume,
      volumeConfidence,
      difficulty,
      avgPrice,
      totalRevenue,
      competitorCount,
      snapshots,
    };
  }

  /**
   * Add realistic variance to an existing dataset
   */
  addVariance(snapshots: DailySnapshot[], varianceAmount: number = 0.1): DailySnapshot[] {
    return snapshots.map((snapshot) => ({
      ...snapshot,
      rank: Math.max(
        1,
        Math.round(snapshot.rank * (1 + this.randomFloat(-varianceAmount, varianceAmount)))
      ),
      volume: Math.round(
        snapshot.volume * (1 + this.randomFloat(-varianceAmount, varianceAmount))
      ),
      avgPrice: parseFloat(
        (snapshot.avgPrice * (1 + this.randomFloat(-varianceAmount / 2, varianceAmount / 2))).toFixed(2)
      ),
    }));
  }

  /**
   * Merge real data with simulated data
   * Real data overwrites simulated data for matching dates
   */
  mergeRealData(
    simulatedSnapshots: DailySnapshot[],
    realSnapshots: DailySnapshot[]
  ): DailySnapshot[] {
    const merged = [...simulatedSnapshots];
    const realDates = new Set(realSnapshots.map((s) => s.date));

    // Replace simulated data with real data where available
    realSnapshots.forEach((realSnapshot) => {
      const index = merged.findIndex((s) => s.date === realSnapshot.date);
      if (index !== -1) {
        merged[index] = realSnapshot;
      }
    });

    return merged;
  }

  /**
   * Calculate variance score for data quality
   */
  calculateVariance(snapshots: DailySnapshot[]): number {
    if (snapshots.length < 2) return 0;

    const volumes = snapshots.map((s) => s.volume);
    const mean = volumes.reduce((sum, v) => sum + v, 0) / volumes.length;
    
    const squaredDiffs = volumes.map((v) => Math.pow(v - mean, 2));
    const variance = squaredDiffs.reduce((sum, d) => sum + d, 0) / squaredDiffs.length;
    const stdDev = Math.sqrt(variance);
    
    // Return coefficient of variation (normalized)
    return parseFloat((stdDev / mean).toFixed(3));
  }
}

// Export singleton instance
export const historicalSimulator = new HistoricalSimulator();

