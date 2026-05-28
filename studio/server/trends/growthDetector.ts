/**
 * Growth Detection Algorithm
 * Implements Exploding Topics-style growth detection with hockey stick pattern recognition
 */

export interface DataPoint {
  date: string;
  value: number;
}

export interface GrowthMetrics {
  // Basic growth rates
  growth7d: number;
  growth30d: number;
  growth90d: number;
  growth365d: number;
  
  // Advanced metrics
  compoundGrowthRate: number;  // CAGR-style calculation
  accelerationFactor: number;  // Rate of growth increase
  volatility: number;          // Standard deviation of growth
  momentum: number;            // Recent vs historical growth
  
  // Pattern detection
  isHockeyStick: boolean;
  isExploding: boolean;
  isPeaking: boolean;
  isDeclining: boolean;
  
  // Scoring
  explosionScore: number;      // 0-100, like Exploding Topics
  confidenceScore: number;     // 0-100, data quality indicator
}

export interface TrendStatus {
  status: 'emerging' | 'exploding' | 'peaked' | 'declining' | 'stable';
  confidence: number;
  description: string;
}

export interface TrendAnalysis {
  metrics: GrowthMetrics;
  status: TrendStatus;
  projectedGrowth30d: number;
  riskFactors: string[];
  opportunities: string[];
}

class GrowthDetector {
  /**
   * Calculate growth rate between two values
   */
  private calculateGrowthRate(startValue: number, endValue: number): number {
    if (startValue === 0) {
      return endValue > 0 ? 100 : 0;
    }
    return ((endValue - startValue) / startValue) * 100;
  }

  /**
   * Calculate compound annual growth rate (CAGR)
   */
  private calculateCAGR(startValue: number, endValue: number, periods: number): number {
    if (startValue <= 0 || periods <= 0) return 0;
    return (Math.pow(endValue / startValue, 1 / periods) - 1) * 100;
  }

  /**
   * Calculate standard deviation
   */
  private calculateStdDev(values: number[]): number {
    if (values.length < 2) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / values.length);
  }

  /**
   * Get values for a specific time window
   */
  private getWindowValues(data: DataPoint[], windowDays: number): number[] {
    const sortedData = [...data].sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    
    const now = Date.now();
    const windowStart = now - (windowDays * 24 * 60 * 60 * 1000);
    
    return sortedData
      .filter(d => new Date(d.date).getTime() >= windowStart)
      .map(d => d.value);
  }

  /**
   * Calculate growth for a specific time window
   */
  private calculateWindowGrowth(data: DataPoint[], windowDays: number): number {
    const values = this.getWindowValues(data, windowDays);
    if (values.length < 2) return 0;
    
    const firstValue = values[0];
    const lastValue = values[values.length - 1];
    
    return this.calculateGrowthRate(firstValue, lastValue);
  }

  /**
   * Detect hockey stick growth pattern
   * A hockey stick pattern shows flat/slow growth followed by rapid exponential growth
   */
  detectHockeyStick(data: DataPoint[]): { detected: boolean; inflectionPoint: string | null; accelerationFactor: number } {
    if (data.length < 15) {
      return { detected: false, inflectionPoint: null, accelerationFactor: 0 };
    }

    const sortedData = [...data].sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Calculate rolling growth rates
    const windowSize = Math.max(3, Math.floor(sortedData.length / 5));
    const growthRates: { date: string; rate: number }[] = [];

    for (let i = windowSize; i < sortedData.length; i++) {
      const windowStart = sortedData[i - windowSize].value;
      const windowEnd = sortedData[i].value;
      const rate = this.calculateGrowthRate(windowStart, windowEnd);
      growthRates.push({ date: sortedData[i].date, rate });
    }

    if (growthRates.length < 3) {
      return { detected: false, inflectionPoint: null, accelerationFactor: 0 };
    }

    // Find the inflection point (where growth rate significantly increases)
    let maxAcceleration = 0;
    let inflectionIndex = -1;

    for (let i = 1; i < growthRates.length; i++) {
      const acceleration = growthRates[i].rate - growthRates[i - 1].rate;
      if (acceleration > maxAcceleration) {
        maxAcceleration = acceleration;
        inflectionIndex = i;
      }
    }

    // Hockey stick criteria:
    // 1. Significant acceleration at inflection point
    // 2. Growth rate in latter half is much higher than first half
    const midpoint = Math.floor(growthRates.length / 2);
    const firstHalfAvgGrowth = growthRates.slice(0, midpoint).reduce((sum, g) => sum + g.rate, 0) / midpoint;
    const secondHalfAvgGrowth = growthRates.slice(midpoint).reduce((sum, g) => sum + g.rate, 0) / (growthRates.length - midpoint);

    const accelerationFactor = firstHalfAvgGrowth !== 0 
      ? (secondHalfAvgGrowth - firstHalfAvgGrowth) / Math.abs(firstHalfAvgGrowth)
      : secondHalfAvgGrowth > 10 ? 1 : 0;

    const isHockeyStick = 
      maxAcceleration > 20 && // Significant acceleration
      secondHalfAvgGrowth > firstHalfAvgGrowth * 2 && // Second half growth is 2x first half
      secondHalfAvgGrowth > 30; // Meaningful growth in second half

    return {
      detected: isHockeyStick,
      inflectionPoint: inflectionIndex >= 0 ? growthRates[inflectionIndex].date : null,
      accelerationFactor: Math.round(accelerationFactor * 100) / 100,
    };
  }

  /**
   * Detect if trend is at or near its peak
   */
  detectPeak(data: DataPoint[]): { isPeaking: boolean; peakDate: string | null; daysFromPeak: number } {
    if (data.length < 7) {
      return { isPeaking: false, peakDate: null, daysFromPeak: 0 };
    }

    const sortedData = [...data].sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Find the maximum value
    let maxValue = 0;
    let maxIndex = 0;
    
    for (let i = 0; i < sortedData.length; i++) {
      if (sortedData[i].value > maxValue) {
        maxValue = sortedData[i].value;
        maxIndex = i;
      }
    }

    // Calculate how far the peak is from the end
    const distanceFromEnd = sortedData.length - 1 - maxIndex;
    const percentFromEnd = distanceFromEnd / sortedData.length;

    // Check if recent values are declining from peak
    const recentValues = sortedData.slice(-5).map(d => d.value);
    const isDecliningSincePeak = recentValues.length >= 2 && 
      recentValues[recentValues.length - 1] < maxValue * 0.9;

    const isPeaking = 
      percentFromEnd > 0.1 && // Peak is not at the very end
      percentFromEnd < 0.5 && // Peak is in recent data
      isDecliningSincePeak;   // Values are declining from peak

    const peakDate = sortedData[maxIndex].date;
    const daysFromPeak = Math.round(
      (Date.now() - new Date(peakDate).getTime()) / (24 * 60 * 60 * 1000)
    );

    return { isPeaking, peakDate, daysFromPeak };
  }

  /**
   * Calculate momentum (recent growth vs historical average)
   */
  calculateMomentum(data: DataPoint[]): number {
    if (data.length < 14) return 0;

    const growth7d = this.calculateWindowGrowth(data, 7);
    const growth30d = this.calculateWindowGrowth(data, 30);

    if (growth30d === 0) return growth7d > 0 ? 100 : 0;
    
    // Momentum = how much faster recent growth is compared to longer-term
    return Math.round((growth7d / (growth30d / 4)) * 100 - 100);
  }

  /**
   * Calculate explosion score (0-100, Exploding Topics style)
   */
  calculateExplosionScore(data: DataPoint[]): number {
    if (data.length < 7) return 0;

    const metrics = this.calculateGrowthMetrics(data);
    
    // Factors that contribute to explosion score:
    // 1. Recent growth rate (40%)
    // 2. Acceleration factor (25%)
    // 3. Hockey stick pattern (20%)
    // 4. Momentum (15%)

    // Normalize growth rate (0-100)
    const growthScore = Math.min(100, Math.max(0, metrics.growth30d / 2));
    
    // Normalize acceleration (0-100)
    const accelerationScore = Math.min(100, Math.max(0, metrics.accelerationFactor * 2));
    
    // Hockey stick bonus
    const hockeyStickBonus = metrics.isHockeyStick ? 100 : 0;
    
    // Normalize momentum (0-100)
    const momentumScore = Math.min(100, Math.max(0, (metrics.momentum + 100) / 2));

    // Weighted average
    const rawScore = 
      (growthScore * 0.40) +
      (accelerationScore * 0.25) +
      (hockeyStickBonus * 0.20) +
      (momentumScore * 0.15);

    // Apply penalties for declining or peaked trends
    let penalty = 0;
    if (metrics.isDeclining) penalty += 30;
    if (metrics.isPeaking) penalty += 20;

    return Math.round(Math.max(0, Math.min(100, rawScore - penalty)));
  }

  /**
   * Calculate confidence score based on data quality
   */
  calculateConfidenceScore(data: DataPoint[]): number {
    let score = 100;

    // Penalty for insufficient data
    if (data.length < 30) score -= (30 - data.length) * 2;
    if (data.length < 7) score -= 30;

    // Penalty for high volatility
    const values = data.map(d => d.value);
    const volatility = this.calculateStdDev(values) / (values.reduce((a, b) => a + b, 0) / values.length);
    if (volatility > 0.5) score -= 20;
    if (volatility > 1) score -= 20;

    // Penalty for gaps in data
    const sortedDates = data.map(d => new Date(d.date).getTime()).sort((a, b) => a - b);
    let gapCount = 0;
    for (let i = 1; i < sortedDates.length; i++) {
      const gap = (sortedDates[i] - sortedDates[i - 1]) / (24 * 60 * 60 * 1000);
      if (gap > 7) gapCount++;
    }
    score -= gapCount * 5;

    return Math.round(Math.max(0, Math.min(100, score)));
  }

  /**
   * Calculate all growth metrics for a dataset
   */
  calculateGrowthMetrics(data: DataPoint[]): GrowthMetrics {
    const sortedData = [...data].sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Basic growth rates
    const growth7d = this.calculateWindowGrowth(data, 7);
    const growth30d = this.calculateWindowGrowth(data, 30);
    const growth90d = this.calculateWindowGrowth(data, 90);
    const growth365d = this.calculateWindowGrowth(data, 365);

    // Compound growth rate
    const values = sortedData.map(d => d.value);
    const startValue = values[0] || 1;
    const endValue = values[values.length - 1] || 1;
    const periods = Math.max(1, sortedData.length / 30); // Monthly periods
    const compoundGrowthRate = this.calculateCAGR(startValue, endValue, periods);

    // Hockey stick detection
    const hockeyStick = this.detectHockeyStick(data);
    
    // Peak detection
    const peak = this.detectPeak(data);

    // Volatility
    const volatility = this.calculateStdDev(values);

    // Momentum
    const momentum = this.calculateMomentum(data);

    // Determine if declining
    const isDeclining = growth7d < -10 && growth30d < 0;

    // Calculate explosion score
    const isExploding = growth30d > 50 && momentum > 0 && !isDeclining;

    // Calculate inline explosion score to avoid recursion
    let explosionScore = 0;
    if (data.length >= 7) {
      const growthScore = Math.min(100, Math.max(0, growth30d / 2));
      const accelerationScore = Math.min(100, Math.max(0, hockeyStick.accelerationFactor * 2));
      const hockeyStickBonus = hockeyStick.detected ? 100 : 0;
      const momentumScore = Math.min(100, Math.max(0, (momentum + 100) / 2));
      
      const rawScore = 
        (growthScore * 0.40) +
        (accelerationScore * 0.25) +
        (hockeyStickBonus * 0.20) +
        (momentumScore * 0.15);

      let penalty = 0;
      if (isDeclining) penalty += 30;
      if (peak.isPeaking) penalty += 20;

      explosionScore = Math.round(Math.max(0, Math.min(100, rawScore - penalty)));
    }

    return {
      growth7d: Math.round(growth7d * 100) / 100,
      growth30d: Math.round(growth30d * 100) / 100,
      growth90d: Math.round(growth90d * 100) / 100,
      growth365d: Math.round(growth365d * 100) / 100,
      compoundGrowthRate: Math.round(compoundGrowthRate * 100) / 100,
      accelerationFactor: hockeyStick.accelerationFactor,
      volatility: Math.round(volatility * 100) / 100,
      momentum,
      isHockeyStick: hockeyStick.detected,
      isExploding,
      isPeaking: peak.isPeaking,
      isDeclining,
      explosionScore,
      confidenceScore: this.calculateConfidenceScore(data),
    };
  }

  /**
   * Determine trend status
   */
  determineTrendStatus(metrics: GrowthMetrics): TrendStatus {
    if (metrics.isDeclining) {
      return {
        status: 'declining',
        confidence: metrics.confidenceScore,
        description: 'This trend is losing momentum and showing negative growth.',
      };
    }

    if (metrics.isPeaking) {
      return {
        status: 'peaked',
        confidence: metrics.confidenceScore,
        description: 'This trend has reached its peak and may start declining.',
      };
    }

    if (metrics.isExploding || metrics.explosionScore >= 70) {
      return {
        status: 'exploding',
        confidence: metrics.confidenceScore,
        description: 'This trend is showing explosive growth and high momentum.',
      };
    }

    if (metrics.growth30d > 20 || metrics.isHockeyStick) {
      return {
        status: 'emerging',
        confidence: metrics.confidenceScore,
        description: 'This trend is emerging with significant growth potential.',
      };
    }

    return {
      status: 'stable',
      confidence: metrics.confidenceScore,
      description: 'This trend is stable with moderate or no significant growth.',
    };
  }

  /**
   * Project future growth based on current trends
   */
  projectGrowth(data: DataPoint[], daysAhead: number = 30): number {
    if (data.length < 7) return 0;

    const metrics = this.calculateGrowthMetrics(data);
    
    // Use compound growth rate for projection, adjusted by momentum
    const baseGrowth = metrics.compoundGrowthRate;
    const momentumAdjustment = metrics.momentum / 100;
    
    // Dampen projections to be more conservative
    const dampingFactor = 0.7;
    
    const projectedGrowth = baseGrowth * (1 + momentumAdjustment) * dampingFactor * (daysAhead / 30);
    
    return Math.round(projectedGrowth * 100) / 100;
  }

  /**
   * Identify risk factors for a trend
   */
  identifyRiskFactors(metrics: GrowthMetrics): string[] {
    const risks: string[] = [];

    if (metrics.volatility > 50) {
      risks.push('High volatility - trend may be unstable');
    }

    if (metrics.isPeaking) {
      risks.push('Trend appears to be peaking - growth may slow');
    }

    if (metrics.confidenceScore < 50) {
      risks.push('Low data confidence - insufficient historical data');
    }

    if (metrics.growth7d < 0 && metrics.growth30d > 0) {
      risks.push('Recent slowdown - short-term growth is negative');
    }

    if (metrics.explosionScore > 80) {
      risks.push('Extremely high growth - may be unsustainable');
    }

    return risks;
  }

  /**
   * Identify opportunities for a trend
   */
  identifyOpportunities(metrics: GrowthMetrics): string[] {
    const opportunities: string[] = [];

    if (metrics.isHockeyStick) {
      opportunities.push('Hockey stick pattern detected - early entry opportunity');
    }

    if (metrics.status === 'emerging' && metrics.explosionScore > 40) {
      opportunities.push('Emerging trend with strong growth potential');
    }

    if (metrics.momentum > 50 && !metrics.isPeaking) {
      opportunities.push('Strong momentum - trend is accelerating');
    }

    if (metrics.growth30d > 100 && metrics.confidenceScore > 70) {
      opportunities.push('High-confidence explosive growth');
    }

    if (metrics.explosionScore >= 60 && metrics.explosionScore < 80) {
      opportunities.push('Sweet spot - significant growth without being oversaturated');
    }

    return opportunities;
  }

  /**
   * Perform full trend analysis
   */
  analyzeTrend(data: DataPoint[]): TrendAnalysis {
    const metrics = this.calculateGrowthMetrics(data);
    const status = this.determineTrendStatus(metrics);
    const projectedGrowth30d = this.projectGrowth(data, 30);
    const riskFactors = this.identifyRiskFactors(metrics);
    const opportunities = this.identifyOpportunities(metrics);

    return {
      metrics,
      status,
      projectedGrowth30d,
      riskFactors,
      opportunities,
    };
  }
}

export const growthDetector = new GrowthDetector();

