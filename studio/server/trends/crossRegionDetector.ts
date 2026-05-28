/**
 * Cross-Region Trend Detector
 * Implements tiered region scraping with US as primary base
 * Provides cross-validation, confidence scoring, and incoming trend detection
 */

import { SCRAPING_LIMITS } from './scrapingConfig.js';

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface RegionTier {
  name: string;
  regions: string[];
  interval: string;        // Cron expression
  priority: 'critical' | 'high' | 'medium' | 'low';
  scanType: 'full' | 'validation';
  description: string;
}

export interface CrossRegionMatch {
  region: string;
  volume: number;
  growth: number;
  firstSeen: string;
  lastSeen: string;
  matchConfidence: number;
}

export interface CrossRegionTrend {
  topic: string;
  normalizedTopic: string;
  
  // Primary region data (US)
  primaryRegion: string;
  primaryVolume: number;
  primaryGrowth: number;
  primaryFirstSeen: string;
  
  // Cross-region validation
  detectedInRegions: CrossRegionMatch[];
  totalRegionsDetected: number;
  
  // Calculated metrics
  confidenceScore: number;
  spreadVelocity: number;
  globalReach: number;
  trendStrength: 'weak' | 'moderate' | 'strong' | 'viral';
  
  // Incoming trend detection
  isIncoming: boolean;
  incomingFrom?: string;
  incomingGrowth?: number;
  predictedUSArrival?: string;
  
  // Metadata
  category: string;
  lastAnalyzed: string;
  analysisVersion: number;
}

export interface IncomingTrendAlert {
  id: string;
  topic: string;
  originRegion: string;
  originVolume: number;
  originGrowth: number;
  firstDetected: string;
  currentUSPresence: 'none' | 'emerging' | 'growing';
  predictedImpact: 'low' | 'medium' | 'high' | 'viral';
  alertLevel: 'watch' | 'attention' | 'urgent';
  relatedTopics: string[];
  category: string;
}

export interface RegionTrendData {
  region: string;
  trends: {
    topic: string;
    volume: number;
    growth: number;
    firstSeen: string;
    lastSeen: string;
  }[];
  lastUpdated: string;
  dataFreshness: 'live' | 'stale' | 'cached';
}

// ============================================
// CONFIGURATION
// ============================================

/**
 * Tiered Region Configuration
 * US is the PRIMARY base, all others organized by importance and geography
 */
export const REGION_TIERS: RegionTier[] = [
  {
    name: 'primary',
    regions: ['US'],
    interval: '0 */2 * * *',     // Every 2 hours
    priority: 'critical',
    scanType: 'full',
    description: 'Primary market - full comprehensive scan'
  },
  {
    name: 'western-core',
    regions: ['GB', 'CA', 'AU'],
    interval: '0 */4 * * *',     // Every 4 hours
    priority: 'high',
    scanType: 'full',
    description: 'English-speaking Western markets - high correlation with US'
  },
  {
    name: 'european',
    regions: ['DE', 'FR', 'ES', 'IT'],
    interval: '0 */6 * * *',     // Every 6 hours
    priority: 'medium',
    scanType: 'full',
    description: 'Major European markets - trend validation'
  },
  {
    name: 'asian-early-detect',
    regions: ['JP', 'KR'],
    interval: '0 */3 * * *',     // Every 3 hours - more frequent for early detection
    priority: 'high',
    scanType: 'full',
    description: 'Asian markets - early trend detection for incoming US trends'
  },
  {
    name: 'emerging',
    regions: ['BR', 'MX', 'IN'],
    interval: '0 */8 * * *',     // Every 8 hours
    priority: 'low',
    scanType: 'validation',
    description: 'Emerging markets - trend confirmation and global reach'
  }
];

/**
 * Confidence scoring weights by region tier
 */
export const CONFIDENCE_WEIGHTS: Record<string, number> = {
  // Primary
  'US': 0,           // Base region, doesn't add to confidence
  
  // Western Core - high correlation
  'GB': 20,
  'CA': 18,
  'AU': 15,
  
  // European - good validation
  'DE': 15,
  'FR': 12,
  'ES': 10,
  'IT': 10,
  
  // Asian - early detection bonus
  'JP': 25,
  'KR': 25,
  
  // Emerging - global reach confirmation
  'BR': 8,
  'MX': 8,
  'IN': 10
};

/**
 * Incoming trend thresholds
 */
export const INCOMING_TREND_CONFIG = {
  minAsianGrowth: 40,
  maxUSPresence: 15,
  
  alertLevels: {
    watch: { minGrowth: 40, minVolume: 10000 },
    attention: { minGrowth: 60, minVolume: 50000 },
    urgent: { minGrowth: 80, minVolume: 100000 }
  },
  
  incomingSourceRegions: ['JP', 'KR']
};

// ============================================
// CROSS-REGION DETECTOR CLASS
// ============================================

class CrossRegionDetector {
  private regionData: Map<string, RegionTrendData> = new Map();
  private crossRegionTrends: Map<string, CrossRegionTrend> = new Map();
  private incomingAlerts: Map<string, IncomingTrendAlert> = new Map();
  private lastAnalysis: string | null = null;

  /**
   * Get tier configuration for a region
   */
  getTierForRegion(region: string): RegionTier | undefined {
    return REGION_TIERS.find(tier => tier.regions.includes(region));
  }

  /**
   * Get all regions in priority order
   */
  getAllRegions(): string[] {
    return REGION_TIERS.flatMap(tier => tier.regions);
  }

  /**
   * Normalize keyword for matching across regions
   */
  normalizeKeyword(keyword: string): string {
    return keyword
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Update trend data for a specific region
   */
  updateRegionData(region: string, trends: RegionTrendData['trends'], dataFreshness: 'live' | 'stale' | 'cached' = 'live'): void {
    this.regionData.set(region, {
      region,
      trends,
      lastUpdated: new Date().toISOString(),
      dataFreshness
    });
    
    console.log(`[CrossRegionDetector] Updated ${region} with ${trends.length} trends (${dataFreshness})`);
  }

  /**
   * Calculate confidence score for a trend based on multi-region presence
   */
  calculateConfidenceScore(
    primaryVolume: number,
    primaryGrowth: number,
    detectedRegions: CrossRegionMatch[]
  ): number {
    // Base score from primary region (US)
    let score = Math.min(40, primaryGrowth * 0.4);
    
    // Add volume component (max 20 points)
    const volumeScore = Math.min(20, Math.log10(primaryVolume + 1) * 3);
    score += volumeScore;
    
    // Add cross-region confidence (max 40 points)
    for (const match of detectedRegions) {
      const weight = CONFIDENCE_WEIGHTS[match.region] || 5;
      const growthMultiplier = Math.min(1.5, match.growth / 50);
      score += weight * growthMultiplier * (match.matchConfidence / 100);
    }
    
    return Math.min(100, Math.round(score));
  }

  /**
   * Determine trend strength category
   */
  getTrendStrength(confidenceScore: number, regionsDetected: number): CrossRegionTrend['trendStrength'] {
    if (confidenceScore >= 85 && regionsDetected >= 6) return 'viral';
    if (confidenceScore >= 65 && regionsDetected >= 4) return 'strong';
    if (confidenceScore >= 40 && regionsDetected >= 2) return 'moderate';
    return 'weak';
  }

  /**
   * Calculate spread velocity (how fast trend is spreading across regions)
   */
  calculateSpreadVelocity(detectedRegions: CrossRegionMatch[]): number {
    if (detectedRegions.length < 2) return 0;
    
    const sorted = [...detectedRegions].sort(
      (a, b) => new Date(a.firstSeen).getTime() - new Date(b.firstSeen).getTime()
    );
    
    const firstTime = new Date(sorted[0].firstSeen).getTime();
    const lastTime = new Date(sorted[sorted.length - 1].firstSeen).getTime();
    const hoursDiff = Math.max(1, (lastTime - firstTime) / (1000 * 60 * 60));
    
    return Math.round((detectedRegions.length / hoursDiff) * 100) / 100;
  }

  /**
   * Analyze all trends and perform cross-region correlation
   */
  analyzeCrossRegion(): CrossRegionTrend[] {
    console.log('[CrossRegionDetector] Starting cross-region analysis...');
    
    const usData = this.regionData.get('US');
    if (!usData || usData.trends.length === 0) {
      console.warn('[CrossRegionDetector] No US data available for analysis');
      return [];
    }

    const results: CrossRegionTrend[] = [];
    const now = new Date().toISOString();

    for (const usTrend of usData.trends) {
      const normalizedTopic = this.normalizeKeyword(usTrend.topic);
      const detectedIn: CrossRegionMatch[] = [];

      // Check each other region for this trend
      for (const [region, data] of this.regionData) {
        if (region === 'US') continue;

        for (const otherTrend of data.trends) {
          const otherNormalized = this.normalizeKeyword(otherTrend.topic);
          
          const matchConfidence = this.calculateMatchConfidence(normalizedTopic, otherNormalized);
          
          if (matchConfidence >= 70) {
            detectedIn.push({
              region,
              volume: otherTrend.volume,
              growth: otherTrend.growth,
              firstSeen: otherTrend.firstSeen,
              lastSeen: otherTrend.lastSeen,
              matchConfidence
            });
            break;
          }
        }
      }

      const confidenceScore = this.calculateConfidenceScore(
        usTrend.volume,
        usTrend.growth,
        detectedIn
      );
      
      const spreadVelocity = this.calculateSpreadVelocity(detectedIn);
      const globalReach = Math.round((detectedIn.length / (this.getAllRegions().length - 1)) * 100);
      const trendStrength = this.getTrendStrength(confidenceScore, detectedIn.length + 1);

      const crossRegionTrend: CrossRegionTrend = {
        topic: usTrend.topic,
        normalizedTopic,
        primaryRegion: 'US',
        primaryVolume: usTrend.volume,
        primaryGrowth: usTrend.growth,
        primaryFirstSeen: usTrend.firstSeen,
        detectedInRegions: detectedIn,
        totalRegionsDetected: detectedIn.length + 1,
        confidenceScore,
        spreadVelocity,
        globalReach,
        trendStrength,
        isIncoming: false,
        category: this.detectCategory(usTrend.topic),
        lastAnalyzed: now,
        analysisVersion: 1
      };

      results.push(crossRegionTrend);
      this.crossRegionTrends.set(normalizedTopic, crossRegionTrend);
    }

    results.sort((a, b) => b.confidenceScore - a.confidenceScore);

    console.log(`[CrossRegionDetector] Analysis complete: ${results.length} trends analyzed`);
    console.log(`[CrossRegionDetector] Viral: ${results.filter(t => t.trendStrength === 'viral').length}`);
    console.log(`[CrossRegionDetector] Strong: ${results.filter(t => t.trendStrength === 'strong').length}`);
    
    this.lastAnalysis = now;
    return results;
  }

  /**
   * Detect incoming trends from Asian markets
   */
  detectIncomingTrends(): IncomingTrendAlert[] {
    console.log('[CrossRegionDetector] Scanning for incoming Asian trends...');
    
    const alerts: IncomingTrendAlert[] = [];
    const usData = this.regionData.get('US');
    const usTopics = new Set(
      (usData?.trends || []).map(t => this.normalizeKeyword(t.topic))
    );

    for (const asianRegion of INCOMING_TREND_CONFIG.incomingSourceRegions) {
      const asianData = this.regionData.get(asianRegion);
      if (!asianData) continue;

      for (const trend of asianData.trends) {
        const normalized = this.normalizeKeyword(trend.topic);
        
        const inUS = usTopics.has(normalized);
        const usPresence = inUS ? this.getUSPresence(normalized) : 'none';
        
        if (
          trend.growth >= INCOMING_TREND_CONFIG.minAsianGrowth &&
          (usPresence === 'none' || usPresence === 'emerging')
        ) {
          let alertLevel: IncomingTrendAlert['alertLevel'] = 'watch';
          let predictedImpact: IncomingTrendAlert['predictedImpact'] = 'low';
          
          const { alertLevels } = INCOMING_TREND_CONFIG;
          
          if (trend.growth >= alertLevels.urgent.minGrowth && trend.volume >= alertLevels.urgent.minVolume) {
            alertLevel = 'urgent';
            predictedImpact = 'viral';
          } else if (trend.growth >= alertLevels.attention.minGrowth && trend.volume >= alertLevels.attention.minVolume) {
            alertLevel = 'attention';
            predictedImpact = 'high';
          } else if (trend.growth >= alertLevels.watch.minGrowth) {
            alertLevel = 'watch';
            predictedImpact = trend.volume >= 50000 ? 'medium' : 'low';
          }

          const alert: IncomingTrendAlert = {
            id: `incoming-${asianRegion}-${normalized.replace(/\s+/g, '-')}`,
            topic: trend.topic,
            originRegion: asianRegion,
            originVolume: trend.volume,
            originGrowth: trend.growth,
            firstDetected: trend.firstSeen,
            currentUSPresence: usPresence,
            predictedImpact,
            alertLevel,
            relatedTopics: [],
            category: this.detectCategory(trend.topic)
          };

          alerts.push(alert);
          this.incomingAlerts.set(alert.id, alert);
          
          console.log(`[CrossRegionDetector] 🚨 INCOMING TREND ALERT [${alertLevel.toUpperCase()}]: "${trend.topic}" from ${asianRegion} (growth: ${trend.growth}%)`);
        }
      }
    }

    const levelPriority = { urgent: 0, attention: 1, watch: 2 };
    alerts.sort((a, b) => levelPriority[a.alertLevel] - levelPriority[b.alertLevel]);

    console.log(`[CrossRegionDetector] Found ${alerts.length} incoming trend alerts`);
    console.log(`  - Urgent: ${alerts.filter(a => a.alertLevel === 'urgent').length}`);
    console.log(`  - Attention: ${alerts.filter(a => a.alertLevel === 'attention').length}`);
    console.log(`  - Watch: ${alerts.filter(a => a.alertLevel === 'watch').length}`);

    return alerts;
  }

  /**
   * Get current US presence level for a topic
   */
  private getUSPresence(normalizedTopic: string): 'none' | 'emerging' | 'growing' {
    const usData = this.regionData.get('US');
    if (!usData) return 'none';

    const usTrend = usData.trends.find(
      t => this.normalizeKeyword(t.topic) === normalizedTopic
    );

    if (!usTrend) return 'none';
    if (usTrend.growth < 20) return 'emerging';
    return 'growing';
  }

  /**
   * Calculate match confidence between two keywords
   */
  private calculateMatchConfidence(keyword1: string, keyword2: string): number {
    if (keyword1 === keyword2) return 100;

    if (keyword1.includes(keyword2) || keyword2.includes(keyword1)) {
      const longer = keyword1.length > keyword2.length ? keyword1 : keyword2;
      const shorter = keyword1.length <= keyword2.length ? keyword1 : keyword2;
      return Math.round((shorter.length / longer.length) * 90);
    }

    const words1 = keyword1.split(' ');
    const words2 = keyword2.split(' ');
    const commonWords = words1.filter(w => words2.includes(w));
    
    if (commonWords.length > 0) {
      const maxWords = Math.max(words1.length, words2.length);
      return Math.round((commonWords.length / maxWords) * 80);
    }

    return 0;
  }

  /**
   * Detect category from topic keywords
   */
  private detectCategory(topic: string): string {
    const lower = topic.toLowerCase();
    
    const categories: Record<string, string[]> = {
      'fashion': ['fashion', 'style', 'outfit', 'clothing', 'dress', 'shoes', 'wear'],
      'beauty': ['beauty', 'makeup', 'skincare', 'cosmetic', 'hair', 'nail'],
      'tech': ['tech', 'phone', 'app', 'ai', 'gadget', 'device', 'software'],
      'food': ['food', 'recipe', 'cooking', 'eat', 'drink', 'restaurant'],
      'entertainment': ['movie', 'music', 'game', 'show', 'celebrity', 'concert'],
      'health': ['health', 'fitness', 'workout', 'diet', 'wellness', 'medical'],
      'home': ['home', 'decor', 'furniture', 'kitchen', 'garden', 'diy'],
      'kids': ['kids', 'baby', 'toy', 'children', 'parent', 'family']
    };

    for (const [category, keywords] of Object.entries(categories)) {
      if (keywords.some(kw => lower.includes(kw))) {
        return category;
      }
    }

    return 'general';
  }

  /**
   * Get top validated trends (high confidence, multi-region)
   */
  getTopValidatedTrends(limit: number = SCRAPING_LIMITS.TOP_CROSS_REGION_TRENDS): CrossRegionTrend[] {
    const trends = Array.from(this.crossRegionTrends.values());
    return trends
      .filter(t => t.confidenceScore >= 50 && t.totalRegionsDetected >= 2)
      .sort((a, b) => b.confidenceScore - a.confidenceScore)
      .slice(0, limit);
  }

  /**
   * Get viral trends (detected in 6+ regions with high confidence)
   */
  getViralTrends(): CrossRegionTrend[] {
    return Array.from(this.crossRegionTrends.values())
      .filter(t => t.trendStrength === 'viral');
  }

  /**
   * Get all incoming trend alerts
   */
  getIncomingAlerts(): IncomingTrendAlert[] {
    return Array.from(this.incomingAlerts.values());
  }

  /**
   * Get urgent incoming alerts only
   */
  getUrgentAlerts(): IncomingTrendAlert[] {
    return this.getIncomingAlerts().filter(a => a.alertLevel === 'urgent');
  }

  /**
   * Get analysis summary
   */
  getSummary(): {
    totalTrends: number;
    viral: number;
    strong: number;
    moderate: number;
    weak: number;
    avgConfidence: number;
    avgRegions: number;
    incomingAlerts: number;
    urgentAlerts: number;
    lastAnalysis: string | null;
    regionsCovered: string[];
  } {
    const trends = Array.from(this.crossRegionTrends.values());
    
    return {
      totalTrends: trends.length,
      viral: trends.filter(t => t.trendStrength === 'viral').length,
      strong: trends.filter(t => t.trendStrength === 'strong').length,
      moderate: trends.filter(t => t.trendStrength === 'moderate').length,
      weak: trends.filter(t => t.trendStrength === 'weak').length,
      avgConfidence: trends.length > 0 
        ? Math.round(trends.reduce((sum, t) => sum + t.confidenceScore, 0) / trends.length)
        : 0,
      avgRegions: trends.length > 0
        ? Math.round((trends.reduce((sum, t) => sum + t.totalRegionsDetected, 0) / trends.length) * 10) / 10
        : 0,
      incomingAlerts: this.incomingAlerts.size,
      urgentAlerts: this.getUrgentAlerts().length,
      lastAnalysis: this.lastAnalysis,
      regionsCovered: Array.from(this.regionData.keys())
    };
  }

  /**
   * Get all cross-region trends
   */
  getAllCrossRegionTrends(): CrossRegionTrend[] {
    return Array.from(this.crossRegionTrends.values());
  }

  /**
   * Clear all cached data
   */
  clearCache(): void {
    this.regionData.clear();
    this.crossRegionTrends.clear();
    this.incomingAlerts.clear();
    this.lastAnalysis = null;
  }
}

// Export singleton instance
export const crossRegionDetector = new CrossRegionDetector();
