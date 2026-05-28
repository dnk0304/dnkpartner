/**
 * Trend Correlator - Cross-Platform Analysis Engine
 * Analyzes trends across multiple platforms to identify:
 * - Cross-platform trends (appearing on multiple sources)
 * - Velocity detection (rapid growth trends)
 * - Investment signals (high-confidence opportunities)
 * - Seasonal patterns
 */

import { trendStore } from './trendStore.js';
import type { ExplodingTrend, TrendSource } from './trendStore.js';

export interface CorrelatedTrend {
  topic: string;
  normalizedTopic: string; // Standardized version for matching
  platforms: Set<string>; // Which platforms report this trend
  sources: TrendSource[];
  totalVolume: number;
  averageGrowth: number;
  crossPlatformScore: number; // 0-100, higher = more platforms
  velocityScore: number; // 0-100, how fast it's spreading
  confidenceScore: number; // 0-100, data quality confidence
  investmentSignal: 'strong-buy' | 'buy' | 'emerging' | 'watch' | 'none';
  category: string;
  firstDetected: string;
  lastUpdated: string;
  platformSpread: number; // Number of unique platforms
  keywords: string[]; // Extracted keywords
  relatedTopics: string[];
}

export interface InvestmentSignal {
  topic: string;
  signal: 'strong-buy' | 'buy' | 'emerging' | 'watch';
  confidence: number;
  reasons: string[];
  metrics: {
    platforms: number;
    volume: number;
    growth: number;
    velocity: number;
  };
  recommendedActions: string[];
  estimatedOpportunityWindow: string; // e.g., "2-4 weeks"
}

export interface CrossPlatformMetrics {
  totalTrends: number;
  multiPlatformTrends: number;
  strongBuySignals: number;
  buySignals: number;
  emergingSignals: number;
  avgPlatformSpread: number;
  avgConfidenceScore: number;
  topCategories: Array<{ category: string; count: number }>;
}

interface NormalizedTopicCache {
  original: string;
  normalized: string;
  keywords: string[];
}

class TrendCorrelator {
  private normalizationCache: Map<string, NormalizedTopicCache> = new Map();
  private correlatedTrends: Map<string, CorrelatedTrend> = new Map();
  private lastAnalysisTime: string | null = null;

  // Similarity threshold for matching topics (0-1)
  private similarityThreshold = 0.6;

  // Minimum sources required for each signal type
  private signalThresholds = {
    strongBuy: { platforms: 4, growth: 50, volume: 1000 },
    buy: { platforms: 3, growth: 30, volume: 500 },
    emerging: { platforms: 2, growth: 20, volume: 100 },
    watch: { platforms: 1, growth: 10, volume: 50 },
  };

  /**
   * Normalize topic string for matching
   * Handles plurals, case, special characters
   */
  private normalizeTopic(topic: string): NormalizedTopicCache {
    // Check cache first
    const cached = this.normalizationCache.get(topic);
    if (cached) return cached;

    const original = topic;
    
    // Convert to lowercase
    let normalized = topic.toLowerCase();
    
    // Remove special characters but keep spaces and hyphens
    normalized = normalized.replace(/[^\w\s-]/g, '');
    
    // Remove common prefixes/suffixes
    normalized = normalized.replace(/\b(trending|popular|top|best|new)\b/g, '');
    
    // Handle plurals (simple approach)
    normalized = normalized.replace(/ies\b/g, 'y'); // babies -> baby
    normalized = normalized.replace(/es\b/g, ''); // boxes -> box
    normalized = normalized.replace(/s\b/g, ''); // books -> book
    
    // Trim and normalize whitespace
    normalized = normalized.trim().replace(/\s+/g, ' ');
    
    // Extract keywords (words > 3 chars)
    const keywords = normalized
      .split(/\s+/)
      .filter(word => word.length > 3)
      .filter(word => !this.isStopWord(word));
    
    const result: NormalizedTopicCache = {
      original,
      normalized,
      keywords,
    };
    
    this.normalizationCache.set(topic, result);
    return result;
  }

  /**
   * Check if word is a stop word
   */
  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      'about', 'after', 'before', 'between', 'from', 'into', 'through',
      'during', 'with', 'without', 'under', 'over', 'again', 'further',
      'then', 'once', 'here', 'there', 'when', 'where', 'what', 'which',
      'that', 'this', 'these', 'those', 'such', 'other', 'more', 'most',
      'some', 'many', 'much', 'very', 'just', 'only',
    ]);
    return stopWords.has(word);
  }

  /**
   * Calculate similarity between two topics (0-1)
   * Uses keyword overlap and string similarity
   */
  private calculateSimilarity(topic1: string, topic2: string): number {
    const norm1 = this.normalizeTopic(topic1);
    const norm2 = this.normalizeTopic(topic2);

    // Exact match after normalization
    if (norm1.normalized === norm2.normalized) {
      return 1.0;
    }

    // Calculate keyword overlap (Jaccard similarity)
    const keywords1 = new Set(norm1.keywords);
    const keywords2 = new Set(norm2.keywords);
    
    const intersection = new Set([...keywords1].filter(k => keywords2.has(k)));
    const union = new Set([...keywords1, ...keywords2]);
    
    const keywordSimilarity = union.size > 0 ? intersection.size / union.size : 0;

    // Calculate string similarity (Levenshtein-based)
    const stringSimilarity = this.stringSimilarity(norm1.normalized, norm2.normalized);

    // Weighted average (keyword overlap is more important)
    return keywordSimilarity * 0.7 + stringSimilarity * 0.3;
  }

  /**
   * Calculate string similarity using normalized Levenshtein distance
   */
  private stringSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Group similar topics together
   */
  private groupSimilarTopics(trends: ExplodingTrend[]): Map<string, ExplodingTrend[]> {
    const groups = new Map<string, ExplodingTrend[]>();
    const processed = new Set<string>();

    for (const trend of trends) {
      if (processed.has(trend.id)) continue;

      const group: ExplodingTrend[] = [trend];
      processed.add(trend.id);

      // Find similar trends
      for (const otherTrend of trends) {
        if (processed.has(otherTrend.id)) continue;
        
        const similarity = this.calculateSimilarity(trend.topic, otherTrend.topic);
        
        if (similarity >= this.similarityThreshold) {
          group.push(otherTrend);
          processed.add(otherTrend.id);
        }
      }

      // Use the most popular topic as the group key
      const representative = group.sort((a, b) => (b.volume || 0) - (a.volume || 0))[0];
      groups.set(representative.topic, group);
    }

    return groups;
  }

  /**
   * Calculate cross-platform score (0-100)
   */
  private calculateCrossPlatformScore(platformCount: number): number {
    // Maximum 10 platforms considered
    const maxPlatforms = 10;
    const score = Math.min(platformCount / maxPlatforms, 1.0) * 100;
    return Math.round(score);
  }

  /**
   * Calculate velocity score based on growth rates and platform spread
   */
  private calculateVelocityScore(
    averageGrowth: number,
    platformSpread: number,
    daysSinceFirstDetected: number
  ): number {
    // Normalize growth (assume max 500% growth)
    const growthScore = Math.min(averageGrowth / 500, 1.0) * 40;
    
    // Platform spread score (more platforms = higher velocity)
    const spreadScore = Math.min(platformSpread / 10, 1.0) * 40;
    
    // Recency score (newer trends get bonus)
    const recencyScore = daysSinceFirstDetected <= 7 ? 20 : 
                        daysSinceFirstDetected <= 14 ? 10 : 0;
    
    return Math.round(Math.min(growthScore + spreadScore + recencyScore, 100));
  }

  /**
   * Calculate confidence score based on data quality
   */
  private calculateConfidenceScore(
    platformSpread: number,
    totalVolume: number,
    sourceCount: number
  ): number {
    // More platforms = higher confidence
    const platformScore = Math.min(platformSpread / 5, 1.0) * 40;
    
    // Higher volume = higher confidence (log scale)
    const volumeScore = Math.min(Math.log10(totalVolume + 1) / 5, 1.0) * 30;
    
    // More data points = higher confidence
    const dataPointScore = Math.min(sourceCount / 20, 1.0) * 30;
    
    return Math.round(platformScore + volumeScore + dataPointScore);
  }

  /**
   * Determine investment signal based on metrics
   */
  private determineInvestmentSignal(
    platformSpread: number,
    averageGrowth: number,
    totalVolume: number
  ): 'strong-buy' | 'buy' | 'emerging' | 'watch' | 'none' {
    const { strongBuy, buy, emerging, watch } = this.signalThresholds;

    if (
      platformSpread >= strongBuy.platforms &&
      averageGrowth >= strongBuy.growth &&
      totalVolume >= strongBuy.volume
    ) {
      return 'strong-buy';
    }

    if (
      platformSpread >= buy.platforms &&
      averageGrowth >= buy.growth &&
      totalVolume >= buy.volume
    ) {
      return 'buy';
    }

    if (
      platformSpread >= emerging.platforms &&
      averageGrowth >= emerging.growth &&
      totalVolume >= emerging.volume
    ) {
      return 'emerging';
    }

    if (
      platformSpread >= watch.platforms &&
      averageGrowth >= watch.growth &&
      totalVolume >= watch.volume
    ) {
      return 'watch';
    }

    return 'none';
  }

  /**
   * Perform cross-platform correlation analysis
   */
  async analyzeCorrelations(): Promise<CorrelatedTrend[]> {
    console.log('[TrendCorrelator] Starting cross-platform analysis...');
    
    const startTime = Date.now();
    const allTrends = trendStore.getAllTrends();
    
    console.log(`[TrendCorrelator] Analyzing ${allTrends.length} trends...`);

    // Group similar topics
    const groups = this.groupSimilarTopics(allTrends);
    console.log(`[TrendCorrelator] Grouped into ${groups.size} correlated trends`);

    // Create correlated trends
    const correlated: CorrelatedTrend[] = [];
    this.correlatedTrends.clear();

    for (const [representativeTopic, groupTrends] of groups.entries()) {
      // Collect all sources from group
      const allSources: TrendSource[] = [];
      const platforms = new Set<string>();
      let totalVolume = 0;
      let totalGrowth = 0;
      let growthCount = 0;
      let earliestDetection = new Date().toISOString();
      let latestUpdate = new Date(0).toISOString();

      for (const trend of groupTrends) {
        for (const source of trend.sources) {
          if (source.name) {
            allSources.push(source);
            platforms.add(source.name);
            totalVolume += source.volume || 0;
            if (source.growth !== undefined) {
              totalGrowth += source.growth;
              growthCount++;
            }
          }
        }

        if (trend.firstDetected < earliestDetection) {
          earliestDetection = trend.firstDetected;
        }
        if (trend.lastUpdated > latestUpdate) {
          latestUpdate = trend.lastUpdated;
        }
      }

      const averageGrowth = growthCount > 0 ? totalGrowth / growthCount : 0;
      const platformSpread = platforms.size;

      // Calculate days since first detected
      const daysSinceFirstDetected = Math.floor(
        (Date.now() - new Date(earliestDetection).getTime()) / (1000 * 60 * 60 * 24)
      );

      // Calculate scores
      const crossPlatformScore = this.calculateCrossPlatformScore(platformSpread);
      const velocityScore = this.calculateVelocityScore(
        averageGrowth,
        platformSpread,
        daysSinceFirstDetected
      );
      const confidenceScore = this.calculateConfidenceScore(
        platformSpread,
        totalVolume,
        allSources.length
      );

      // Determine investment signal
      const investmentSignal = this.determineInvestmentSignal(
        platformSpread,
        averageGrowth,
        totalVolume
      );

      // Get normalized topic and keywords
      const normalized = this.normalizeTopic(representativeTopic);

      // Determine category (use most common category from group)
      const categoryCount = new Map<string, number>();
      groupTrends.forEach(t => {
        categoryCount.set(t.category, (categoryCount.get(t.category) || 0) + 1);
      });
      const category = Array.from(categoryCount.entries())
        .sort((a, b) => b[1] - a[1])[0]?.[0] || 'other';

      // Get related topics
      const relatedTopics = [...new Set(
        groupTrends.flatMap(t => t.relatedTopics)
      )].slice(0, 10);

      const correlatedTrend: CorrelatedTrend = {
        topic: representativeTopic,
        normalizedTopic: normalized.normalized,
        platforms,
        sources: allSources,
        totalVolume,
        averageGrowth: Math.round(averageGrowth * 10) / 10,
        crossPlatformScore,
        velocityScore,
        confidenceScore,
        investmentSignal,
        category,
        firstDetected: earliestDetection,
        lastUpdated: latestUpdate,
        platformSpread,
        keywords: normalized.keywords,
        relatedTopics,
      };

      correlated.push(correlatedTrend);
      this.correlatedTrends.set(normalized.normalized, correlatedTrend);
    }

    // Sort by investment signal priority, then by confidence
    const signalPriority = { 'strong-buy': 4, 'buy': 3, 'emerging': 2, 'watch': 1, 'none': 0 };
    correlated.sort((a, b) => {
      const priorityDiff = signalPriority[b.investmentSignal] - signalPriority[a.investmentSignal];
      if (priorityDiff !== 0) return priorityDiff;
      return b.confidenceScore - a.confidenceScore;
    });

    const duration = Date.now() - startTime;
    this.lastAnalysisTime = new Date().toISOString();

    console.log(`[TrendCorrelator] Analysis complete in ${duration}ms`);
    console.log(`[TrendCorrelator] Found ${correlated.filter(t => t.platformSpread >= 2).length} multi-platform trends`);
    console.log(`[TrendCorrelator] Investment signals: ${correlated.filter(t => t.investmentSignal === 'strong-buy').length} strong-buy, ${correlated.filter(t => t.investmentSignal === 'buy').length} buy`);

    return correlated;
  }

  /**
   * Get investment signals with recommendations
   */
  async getInvestmentSignals(
    minPlatforms: number = 2,
    signalTypes: Array<'strong-buy' | 'buy' | 'emerging' | 'watch'> = ['strong-buy', 'buy']
  ): Promise<InvestmentSignal[]> {
    const correlated = this.correlatedTrends.size > 0
      ? Array.from(this.correlatedTrends.values())
      : await this.analyzeCorrelations();

    const signals: InvestmentSignal[] = [];

    for (const trend of correlated) {
      if (trend.platformSpread < minPlatforms) continue;
      if (!signalTypes.includes(trend.investmentSignal)) continue;

      const reasons: string[] = [];
      const actions: string[] = [];

      // Build reasons
      if (trend.platformSpread >= 4) {
        reasons.push(`Trending on ${trend.platformSpread} platforms`);
      } else if (trend.platformSpread >= 2) {
        reasons.push(`Appearing on ${trend.platformSpread} platforms`);
      }

      if (trend.averageGrowth >= 50) {
        reasons.push(`Strong growth rate (${Math.round(trend.averageGrowth)}%)`);
      } else if (trend.averageGrowth >= 20) {
        reasons.push(`Moderate growth rate (${Math.round(trend.averageGrowth)}%)`);
      }

      if (trend.velocityScore >= 70) {
        reasons.push(`Rapidly spreading (velocity: ${trend.velocityScore})`);
      }

      if (trend.confidenceScore >= 70) {
        reasons.push(`High confidence (${trend.confidenceScore}/100)`);
      }

      // Build recommended actions
      if (trend.investmentSignal === 'strong-buy') {
        actions.push('Create product immediately');
        actions.push('Prioritize high-margin variations');
        actions.push('Prepare for quick launch');
        actions.push('Monitor competition closely');
      } else if (trend.investmentSignal === 'buy') {
        actions.push('Develop product concept');
        actions.push('Research existing competition');
        actions.push('Plan marketing strategy');
      } else if (trend.investmentSignal === 'emerging') {
        actions.push('Monitor trend development');
        actions.push('Prepare product sketches');
        actions.push('Watch for growth acceleration');
      } else {
        actions.push('Add to watchlist');
        actions.push('Set up alerts for changes');
      }

      // Estimate opportunity window
      let opportunityWindow = '4-8 weeks';
      if (trend.investmentSignal === 'strong-buy') {
        opportunityWindow = '1-2 weeks';
      } else if (trend.investmentSignal === 'buy') {
        opportunityWindow = '2-4 weeks';
      } else if (trend.investmentSignal === 'emerging') {
        opportunityWindow = '4-8 weeks';
      }

      signals.push({
        topic: trend.topic,
        signal: trend.investmentSignal,
        confidence: trend.confidenceScore,
        reasons,
        metrics: {
          platforms: trend.platformSpread,
          volume: trend.totalVolume,
          growth: trend.averageGrowth,
          velocity: trend.velocityScore,
        },
        recommendedActions: actions,
        estimatedOpportunityWindow: opportunityWindow,
      });
    }

    return signals;
  }

  /**
   * Get cross-platform metrics summary
   */
  async getMetrics(): Promise<CrossPlatformMetrics> {
    const correlated = this.correlatedTrends.size > 0
      ? Array.from(this.correlatedTrends.values())
      : await this.analyzeCorrelations();

    const multiPlatformTrends = correlated.filter(t => t.platformSpread >= 2);
    const strongBuySignals = correlated.filter(t => t.investmentSignal === 'strong-buy');
    const buySignals = correlated.filter(t => t.investmentSignal === 'buy');
    const emergingSignals = correlated.filter(t => t.investmentSignal === 'emerging');

    const avgPlatformSpread = correlated.length > 0
      ? correlated.reduce((sum, t) => sum + t.platformSpread, 0) / correlated.length
      : 0;

    const avgConfidenceScore = correlated.length > 0
      ? correlated.reduce((sum, t) => sum + t.confidenceScore, 0) / correlated.length
      : 0;

    // Get top categories
    const categoryCount = new Map<string, number>();
    correlated.forEach(t => {
      categoryCount.set(t.category, (categoryCount.get(t.category) || 0) + 1);
    });

    const topCategories = Array.from(categoryCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([category, count]) => ({ category, count }));

    return {
      totalTrends: correlated.length,
      multiPlatformTrends: multiPlatformTrends.length,
      strongBuySignals: strongBuySignals.length,
      buySignals: buySignals.length,
      emergingSignals: emergingSignals.length,
      avgPlatformSpread: Math.round(avgPlatformSpread * 10) / 10,
      avgConfidenceScore: Math.round(avgConfidenceScore),
      topCategories,
    };
  }

  /**
   * Get correlated trends (cached or fresh analysis)
   */
  async getCorrelatedTrends(): Promise<CorrelatedTrend[]> {
    if (this.correlatedTrends.size > 0) {
      return Array.from(this.correlatedTrends.values());
    }
    return this.analyzeCorrelations();
  }

  /**
   * Clear cache and force re-analysis
   */
  clearCache(): void {
    this.correlatedTrends.clear();
    this.normalizationCache.clear();
    this.lastAnalysisTime = null;
    console.log('[TrendCorrelator] Cache cleared');
  }

  /**
   * Get last analysis time
   */
  getLastAnalysisTime(): string | null {
    return this.lastAnalysisTime;
  }
}

// Export singleton instance
export const trendCorrelator = new TrendCorrelator();

// Export class for custom instances
export { TrendCorrelator };
