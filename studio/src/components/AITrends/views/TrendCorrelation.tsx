/**
 * Trend Correlation Dashboard
 * Cross-platform trend analysis and investment signals UI
 */

import React, { useState, useEffect } from 'react';
import { Card } from '../Card';
import { LiveIndicator } from '../components/LiveIndicator';

// Correlation analysis is heavier server-side (it re-aggregates trends),
// so poll less aggressively — 90s, staggered 30s after the page load.
const POLL_INTERVAL_MS = 90000;
const POLL_STAGGER_MS = 30000;

interface CorrelatedTrend {
  topic: string;
  normalizedTopic: string;
  platforms: Set<string>;
  sources: Array<{
    name: string;
    volume?: number;
    growth?: number;
    lastUpdated: string;
  }>;
  totalVolume: number;
  averageGrowth: number;
  crossPlatformScore: number;
  velocityScore: number;
  confidenceScore: number;
  investmentSignal: 'strong-buy' | 'buy' | 'emerging' | 'watch' | 'none';
  category: string;
  firstDetected: string;
  lastUpdated: string;
  platformSpread: number;
  keywords: string[];
  relatedTopics: string[];
}

interface InvestmentSignal {
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
  estimatedOpportunityWindow: string;
}

interface CrossPlatformMetrics {
  totalTrends: number;
  multiPlatformTrends: number;
  strongBuySignals: number;
  buySignals: number;
  emergingSignals: number;
  avgPlatformSpread: number;
  avgConfidenceScore: number;
  topCategories: Array<{ category: string; count: number }>;
}

export const TrendCorrelation: React.FC = () => {
  const [correlatedTrends, setCorrelatedTrends] = useState<CorrelatedTrend[]>([]);
  const [investmentSignals, setInvestmentSignals] = useState<InvestmentSignal[]>([]);
  const [metrics, setMetrics] = useState<CrossPlatformMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<'overview' | 'signals' | 'trends'>('overview');
  const [minPlatforms, setMinPlatforms] = useState(2);
  const [signalFilter, setSignalFilter] = useState<string>('strong-buy,buy');
  const [lastAnalysis, setLastAnalysis] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [minPlatforms, signalFilter]);

  // Independent polling effect — keeps filter-driven refetches separate from
  // the background poll. Polls without touching the loading splash.
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const startId = setTimeout(() => {
      intervalId = setInterval(() => loadData(true), POLL_INTERVAL_MS);
    }, POLL_STAGGER_MS);
    return () => {
      clearTimeout(startId);
      if (intervalId) clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minPlatforms, signalFilter]);

  const loadData = async (isBackground = false) => {
    try {
      if (isBackground) {
        setIsRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      // Load metrics
      const metricsRes = await fetch('/api/trends/correlation/metrics');
      const metricsData = await metricsRes.json();
      if (metricsData.success) {
        setMetrics(metricsData.metrics);
        setLastAnalysis(metricsData.lastAnalysis);
      }

      // Load correlated trends
      const trendsRes = await fetch(`/api/trends/correlation/trends?minPlatforms=${minPlatforms}`);
      const trendsData = await trendsRes.json();
      if (trendsData.success) {
        // Convert Set to Array for platforms
        const trends = trendsData.trends.map((t: any) => ({
          ...t,
          platforms: new Set(t.platforms || [])
        }));
        setCorrelatedTrends(trends);
      }

      // Load investment signals
      const signalsRes = await fetch(`/api/trends/correlation/signals?minPlatforms=${minPlatforms}&signals=${signalFilter}`);
      const signalsData = await signalsRes.json();
      if (signalsData.success) {
        setInvestmentSignals(signalsData.signals);
      }
      setLastUpdatedAt(new Date());
    } catch (err: any) {
      setError(err.message || 'Failed to load correlation data');
      console.error('Error loading correlation data:', err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  const refreshAnalysis = async () => {
    try {
      setLoading(true);
      setError(null);

      // Clear cache and run fresh analysis
      await fetch('/api/trends/correlation/clear-cache', { method: 'POST' });
      const res = await fetch('/api/trends/correlation/analyze');
      const data = await res.json();
      
      if (data.success) {
        await loadData();
      } else {
        setError('Analysis failed: ' + data.error);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to refresh analysis');
    } finally {
      setLoading(false);
    }
  };

  const getSignalColor = (signal: string): string => {
    switch (signal) {
      case 'strong-buy': return 'bg-green-500';
      case 'buy': return 'bg-blue-500';
      case 'emerging': return 'bg-yellow-500';
      case 'watch': return 'bg-gray-500';
      default: return 'bg-gray-400';
    }
  };

  const getSignalTextColor = (signal: string): string => {
    switch (signal) {
      case 'strong-buy': return 'text-green-600';
      case 'buy': return 'text-blue-600';
      case 'emerging': return 'text-yellow-600';
      case 'watch': return 'text-gray-600';
      default: return 'text-gray-500';
    }
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return date.toLocaleDateString();
  };

  if (loading && !metrics) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Analyzing cross-platform trends...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <h3 className="text-red-800 font-semibold mb-2">Error Loading Correlation Data</h3>
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={() => loadData()}
          className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Cross-Platform Trend Correlation</h2>
          <p className="text-gray-600">
            Analyze trends across multiple platforms to identify high-confidence investment opportunities
          </p>
          {lastAnalysis && (
            <p className="text-sm text-gray-500 mt-1">
              Last analysis: {formatDate(lastAnalysis)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <LiveIndicator
            lastUpdatedAt={lastUpdatedAt}
            isRefreshing={isRefreshing}
            hasError={!!error}
            intervalMs={POLL_INTERVAL_MS}
          />
          <button
            onClick={refreshAnalysis}
            disabled={loading}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Analyzing...' : 'Refresh Analysis'}
          </button>
        </div>
      </div>

      {/* Metrics Overview */}
      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="text-sm text-gray-600 mb-1">Total Trends</div>
            <div className="text-3xl font-bold text-gray-900">{metrics.totalTrends}</div>
            <div className="text-xs text-gray-500 mt-1">
              {metrics.multiPlatformTrends} multi-platform
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-sm text-gray-600 mb-1">Strong Buy Signals</div>
            <div className="text-3xl font-bold text-green-600">{metrics.strongBuySignals}</div>
            <div className="text-xs text-gray-500 mt-1">
              {metrics.buySignals} buy signals
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-sm text-gray-600 mb-1">Avg Platform Spread</div>
            <div className="text-3xl font-bold text-blue-600">{metrics.avgPlatformSpread.toFixed(1)}</div>
            <div className="text-xs text-gray-500 mt-1">
              platforms per trend
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-sm text-gray-600 mb-1">Avg Confidence</div>
            <div className="text-3xl font-bold text-purple-600">{metrics.avgConfidenceScore}%</div>
            <div className="text-xs text-gray-500 mt-1">
              data quality score
            </div>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex space-x-8">
          <button
            onClick={() => setSelectedTab('overview')}
            className={`pb-4 px-1 border-b-2 font-medium text-sm ${
              selectedTab === 'overview'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setSelectedTab('signals')}
            className={`pb-4 px-1 border-b-2 font-medium text-sm ${
              selectedTab === 'signals'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Investment Signals ({investmentSignals.length})
          </button>
          <button
            onClick={() => setSelectedTab('trends')}
            className={`pb-4 px-1 border-b-2 font-medium text-sm ${
              selectedTab === 'trends'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Correlated Trends ({correlatedTrends.length})
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {selectedTab === 'overview' && metrics && (
        <div className="space-y-6">
          {/* Top Categories */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Top Trending Categories</h3>
            <div className="space-y-3">
              {metrics.topCategories.slice(0, 8).map((cat, idx) => (
                <div key={cat.category} className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="text-sm font-medium text-gray-500 w-6">{idx + 1}</div>
                    <div className="font-medium text-gray-900 capitalize">{cat.category}</div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <div className="text-sm text-gray-600">{cat.count} trends</div>
                    <div className="w-32 bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full"
                        style={{ width: `${(cat.count / metrics.topCategories[0].count) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-6">
              <h4 className="text-sm font-medium text-gray-600 mb-2">Emerging Opportunities</h4>
              <div className="text-2xl font-bold text-yellow-600">{metrics.emergingSignals}</div>
              <p className="text-xs text-gray-500 mt-1">Trends to watch closely</p>
            </Card>

            <Card className="p-6">
              <h4 className="text-sm font-medium text-gray-600 mb-2">Multi-Platform Rate</h4>
              <div className="text-2xl font-bold text-indigo-600">
                {((metrics.multiPlatformTrends / Math.max(metrics.totalTrends, 1)) * 100).toFixed(1)}%
              </div>
              <p className="text-xs text-gray-500 mt-1">Trends on 2+ platforms</p>
            </Card>

            <Card className="p-6">
              <h4 className="text-sm font-medium text-gray-600 mb-2">High Confidence</h4>
              <div className="text-2xl font-bold text-green-600">
                {correlatedTrends.filter(t => t.confidenceScore >= 70).length}
              </div>
              <p className="text-xs text-gray-500 mt-1">Trends with 70+ confidence</p>
            </Card>
          </div>
        </div>
      )}

      {selectedTab === 'signals' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex items-center space-x-4 bg-gray-50 p-4 rounded-lg">
            <div>
              <label className="text-sm font-medium text-gray-700 mr-2">Min Platforms:</label>
              <select
                value={minPlatforms}
                onChange={(e) => setMinPlatforms(parseInt(e.target.value))}
                className="border border-gray-300 rounded px-3 py-1 text-sm"
              >
                <option value="1">1+</option>
                <option value="2">2+</option>
                <option value="3">3+</option>
                <option value="4">4+</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mr-2">Signal Types:</label>
              <select
                value={signalFilter}
                onChange={(e) => setSignalFilter(e.target.value)}
                className="border border-gray-300 rounded px-3 py-1 text-sm"
              >
                <option value="strong-buy">Strong Buy Only</option>
                <option value="strong-buy,buy">Strong Buy + Buy</option>
                <option value="strong-buy,buy,emerging">Buy + Emerging</option>
                <option value="strong-buy,buy,emerging,watch">All Signals</option>
              </select>
            </div>
          </div>

          {/* Investment Signals */}
          <div className="space-y-4">
            {investmentSignals.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-gray-500">No investment signals match your criteria</p>
                <button
                  onClick={() => {
                    setMinPlatforms(1);
                    setSignalFilter('strong-buy,buy,emerging,watch');
                  }}
                  className="mt-4 text-blue-600 hover:text-blue-700 text-sm"
                >
                  Reset Filters
                </button>
              </Card>
            ) : (
              investmentSignals.map((signal) => (
                <Card key={signal.topic} className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">{signal.topic}</h3>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium text-white ${getSignalColor(signal.signal)}`}>
                          {signal.signal.toUpperCase().replace('-', ' ')}
                        </span>
                      </div>
                      <div className="flex items-center space-x-4 text-sm text-gray-600">
                        <span>🎯 {signal.metrics.platforms} platforms</span>
                        <span>📈 {signal.metrics.growth.toFixed(1)}% growth</span>
                        <span>⚡ {signal.metrics.velocity}/100 velocity</span>
                        <span>✓ {signal.confidence}% confidence</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-500">Opportunity Window</div>
                      <div className="text-sm font-medium text-gray-900">{signal.estimatedOpportunityWindow}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Reasons</h4>
                      <ul className="space-y-1">
                        {signal.reasons.map((reason, idx) => (
                          <li key={idx} className="text-sm text-gray-600 flex items-start">
                            <span className="text-green-500 mr-2">•</span>
                            {reason}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Recommended Actions</h4>
                      <ul className="space-y-1">
                        {signal.recommendedActions.map((action, idx) => (
                          <li key={idx} className="text-sm text-gray-600 flex items-start">
                            <span className="text-blue-500 mr-2">→</span>
                            {action}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        </div>
      )}

      {selectedTab === 'trends' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex items-center space-x-4 bg-gray-50 p-4 rounded-lg">
            <div>
              <label className="text-sm font-medium text-gray-700 mr-2">Min Platforms:</label>
              <select
                value={minPlatforms}
                onChange={(e) => setMinPlatforms(parseInt(e.target.value))}
                className="border border-gray-300 rounded px-3 py-1 text-sm"
              >
                <option value="1">1+</option>
                <option value="2">2+</option>
                <option value="3">3+</option>
                <option value="4">4+</option>
              </select>
            </div>
          </div>

          {/* Correlated Trends */}
          <div className="space-y-4">
            {correlatedTrends.length === 0 ? (
              <Card className="p-8 text-center">
                <p className="text-gray-500">No correlated trends match your criteria</p>
              </Card>
            ) : (
              correlatedTrends.map((trend) => (
                <Card key={trend.topic} className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">{trend.topic}</h3>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${getSignalTextColor(trend.investmentSignal)} bg-opacity-10`}>
                          {trend.investmentSignal}
                        </span>
                      </div>
                      <div className="flex items-center space-x-4 text-sm text-gray-600 mb-3">
                        <span>📊 {Array.from(trend.platforms).join(', ')}</span>
                        <span>• {trend.platformSpread} platforms</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-500">First Detected</div>
                      <div className="text-sm font-medium text-gray-900">{formatDate(trend.firstDetected)}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div>
                      <div className="text-xs text-gray-500 mb-1">Cross-Platform Score</div>
                      <div className="flex items-center space-x-2">
                        <div className="flex-1 bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full"
                            style={{ width: `${trend.crossPlatformScore}%` }}
                          />
                        </div>
                        <div className="text-sm font-medium text-gray-900">{trend.crossPlatformScore}</div>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1">Velocity Score</div>
                      <div className="flex items-center space-x-2">
                        <div className="flex-1 bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-green-600 h-2 rounded-full"
                            style={{ width: `${trend.velocityScore}%` }}
                          />
                        </div>
                        <div className="text-sm font-medium text-gray-900">{trend.velocityScore}</div>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1">Confidence Score</div>
                      <div className="flex items-center space-x-2">
                        <div className="flex-1 bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-purple-600 h-2 rounded-full"
                            style={{ width: `${trend.confidenceScore}%` }}
                          />
                        </div>
                        <div className="text-sm font-medium text-gray-900">{trend.confidenceScore}</div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-6 text-sm text-gray-600">
                    <div>
                      <span className="font-medium">Volume:</span> {trend.totalVolume.toLocaleString()}
                    </div>
                    <div>
                      <span className="font-medium">Growth:</span> {trend.averageGrowth.toFixed(1)}%
                    </div>
                    <div>
                      <span className="font-medium">Category:</span> {trend.category}
                    </div>
                  </div>

                  {trend.keywords.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <div className="text-xs text-gray-500 mb-2">Keywords</div>
                      <div className="flex flex-wrap gap-2">
                        {trend.keywords.slice(0, 8).map((keyword) => (
                          <span key={keyword} className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">
                            {keyword}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </Card>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
