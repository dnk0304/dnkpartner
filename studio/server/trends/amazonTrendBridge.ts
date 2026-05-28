/**
 * Amazon Trend Bridge
 * Transforms Amazon historical data into multi-platform trend format
 * Bridges historicalStore (Amazon-specific) to trendStore (multi-platform)
 */

import { historicalStore } from '../amazon/historicalStore.js';
import { trendStore } from './trendStore.js';
import { Marketplace, DailySnapshot } from '../amazon/types.js';

interface AmazonTrendData {
  keyword: string;
  marketplace: Marketplace;
  latestVolume: number;
  volumeChange7d: number;
  volumeChange30d: number;
  explosionScore: number;
  snapshots: DailySnapshot[];
}

class AmazonTrendBridge {
  /**
   * Calculate volume change percentage over a period
   */
  private calculateVolumeChange(
    currentVolume: number,
    previousVolume: number
  ): number {
    if (previousVolume === 0) return 0;
    return ((currentVolume - previousVolume) / previousVolume) * 100;
  }

  /**
   * Get snapshot from N days ago
   */
  private getSnapshotFromDaysAgo(
    snapshots: DailySnapshot[],
    daysAgo: number
  ): DailySnapshot | null {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - daysAgo);
    const targetDateStr = targetDate.toISOString().split('T')[0];

    // Find closest snapshot to target date
    let closestSnapshot: DailySnapshot | null = null;
    let minDiff = Infinity;

    for (const snapshot of snapshots) {
      const snapshotDate = new Date(snapshot.date);
      const diff = Math.abs(snapshotDate.getTime() - targetDate.getTime());
      
      if (diff < minDiff) {
        minDiff = diff;
        closestSnapshot = snapshot;
      }
    }

    return closestSnapshot;
  }

  /**
   * Calculate explosion score based on growth velocity
   */
  private calculateExplosionScore(
    volumeChange7d: number,
    volumeChange30d: number
  ): number {
    // Weight 7-day change more heavily (2x) as it shows recent momentum
    const weightedGrowth = (volumeChange7d * 2 + volumeChange30d) / 3;
    
    // Normalize to 0-100 scale
    // Growth > 100% = score 80+
    // Growth 50-100% = score 50-80
    // Growth 0-50% = score 0-50
    let score = 0;
    
    if (weightedGrowth > 100) {
      score = 80 + Math.min(20, (weightedGrowth - 100) / 10);
    } else if (weightedGrowth > 50) {
      score = 50 + ((weightedGrowth - 50) / 50) * 30;
    } else if (weightedGrowth > 0) {
      score = (weightedGrowth / 50) * 50;
    } else {
      score = 0; // Declining trend
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Extract trend data from historical snapshots
   */
  private extractTrendData(
    keyword: string,
    marketplace: Marketplace
  ): AmazonTrendData | null {
    const historical = historicalStore.getHistorical(marketplace, keyword);
    
    if (!historical || historical.snapshots.length === 0) {
      return null;
    }

    const snapshots = historical.snapshots;
    const latestSnapshot = snapshots[snapshots.length - 1];
    const latestVolume = latestSnapshot.volume;

    // Get 7-day and 30-day snapshots
    const snapshot7d = this.getSnapshotFromDaysAgo(snapshots, 7);
    const snapshot30d = this.getSnapshotFromDaysAgo(snapshots, 30);

    // Calculate volume changes
    const volumeChange7d = snapshot7d
      ? this.calculateVolumeChange(latestVolume, snapshot7d.volume)
      : 0;
    
    const volumeChange30d = snapshot30d
      ? this.calculateVolumeChange(latestVolume, snapshot30d.volume)
      : 0;

    // Calculate explosion score
    const explosionScore = this.calculateExplosionScore(
      volumeChange7d,
      volumeChange30d
    );

    return {
      keyword,
      marketplace,
      latestVolume,
      volumeChange7d,
      volumeChange30d,
      explosionScore,
      snapshots,
    };
  }

  /**
   * Sync a single Amazon keyword to trendStore
   */
  async syncKeywordToTrendStore(
    keyword: string,
    marketplace: Marketplace = 'US'
  ): Promise<boolean> {
    try {
      const trendData = this.extractTrendData(keyword, marketplace);
      
      if (!trendData) {
        console.log(`[AmazonTrendBridge] No data found for keyword: ${keyword}`);
        return false;
      }

      // Only sync if there's significant activity (volume > 100)
      if (trendData.latestVolume < 100) {
        console.log(`[AmazonTrendBridge] Skipping low-volume keyword: ${keyword} (volume: ${trendData.latestVolume})`);
        return false;
      }

      const now = new Date().toISOString();

      // Add/update trend in trendStore
      await trendStore.addOrUpdateTrend({
        topic: keyword,
        source: 'amazon',
        volume: trendData.latestVolume,
        growth: trendData.volumeChange7d,
        dataPoint: {
          date: now,
          volume: trendData.latestVolume,
          growth: trendData.volumeChange7d,
        },
      });

      console.log(
        `[AmazonTrendBridge] Synced "${keyword}" - Volume: ${trendData.latestVolume}, 7d: ${trendData.volumeChange7d.toFixed(1)}%, 30d: ${trendData.volumeChange30d.toFixed(1)}%`
      );

      return true;
    } catch (error) {
      console.error(`[AmazonTrendBridge] Error syncing keyword "${keyword}":`, error);
      return false;
    }
  }

  /**
   * Sync all Amazon keywords from historicalStore to trendStore
   */
  async syncAllToTrendStore(marketplace: Marketplace = 'US'): Promise<{
    synced: number;
    skipped: number;
    failed: number;
  }> {
    console.log(`[AmazonTrendBridge] Starting full sync for marketplace: ${marketplace}`);
    
    const keywords = historicalStore.getKeywords(marketplace);
    console.log(`[AmazonTrendBridge] Found ${keywords.length} keywords to sync`);

    let synced = 0;
    let skipped = 0;
    let failed = 0;

    for (const keyword of keywords) {
      try {
        const success = await this.syncKeywordToTrendStore(keyword, marketplace);
        
        if (success) {
          synced++;
        } else {
          skipped++;
        }
      } catch (error) {
        console.error(`[AmazonTrendBridge] Failed to sync "${keyword}":`, error);
        failed++;
      }
    }

    // Update last full update timestamp
    if (synced > 0) {
      trendStore.setLastFullUpdate();
    }

    console.log(
      `[AmazonTrendBridge] Sync complete - Synced: ${synced}, Skipped: ${skipped}, Failed: ${failed}`
    );

    return { synced, skipped, failed };
  }

  /**
   * Get Amazon trends ready for export to multi-platform view
   */
  getAmazonTrends(options?: {
    minVolume?: number;
    minGrowth?: number;
    limit?: number;
  }): AmazonTrendData[] {
    const { minVolume = 100, minGrowth = 0, limit = 50 } = options || {};
    
    const allKeywords = historicalStore.getKeywords('US');
    const trends: AmazonTrendData[] = [];

    for (const keyword of allKeywords) {
      const trendData = this.extractTrendData(keyword, 'US');
      
      if (trendData) {
        // Apply filters
        if (trendData.latestVolume >= minVolume && trendData.volumeChange7d >= minGrowth) {
          trends.push(trendData);
        }
      }
    }

    // Sort by explosion score
    trends.sort((a, b) => b.explosionScore - a.explosionScore);

    // Apply limit
    return trends.slice(0, limit);
  }

  /**
   * Get statistics about Amazon data
   */
  getStats(): {
    totalKeywords: number;
    syncableKeywords: number;
    totalVolume: number;
    averageGrowth7d: number;
    topTrends: Array<{ keyword: string; volume: number; growth: number }>;
  } {
    const keywords = historicalStore.getKeywords('US');
    let syncableCount = 0;
    let totalVolume = 0;
    let totalGrowth = 0;
    let growthCount = 0;
    const topTrends: Array<{ keyword: string; volume: number; growth: number }> = [];

    for (const keyword of keywords) {
      const trendData = this.extractTrendData(keyword, 'US');
      
      if (trendData) {
        if (trendData.latestVolume >= 100) {
          syncableCount++;
          topTrends.push({
            keyword,
            volume: trendData.latestVolume,
            growth: trendData.volumeChange7d,
          });
        }
        
        totalVolume += trendData.latestVolume;
        totalGrowth += trendData.volumeChange7d;
        growthCount++;
      }
    }

    // Sort top trends by volume
    topTrends.sort((a, b) => b.volume - a.volume);

    return {
      totalKeywords: keywords.length,
      syncableKeywords: syncableCount,
      totalVolume,
      averageGrowth7d: growthCount > 0 ? totalGrowth / growthCount : 0,
      topTrends: topTrends.slice(0, 10),
    };
  }
}

// Export singleton instance
export const amazonTrendBridge = new AmazonTrendBridge();
