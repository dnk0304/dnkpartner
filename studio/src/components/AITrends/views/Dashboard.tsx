import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '../../Card';
import { BarChart3, TrendingUp, Users, DollarSign, Globe, ShoppingBag, Rocket, ArrowRight, Database } from 'lucide-react';
import { Button } from '../../Button';
import { LiveIndicator } from '../components/LiveIndicator';

// Storage metrics tick over slowly (writes happen at scheduler cadence), so
// 60s is plenty. Staggered 10s after Exploding so the two views don't fire
// their first refresh on the same tick.
const POLL_INTERVAL_MS = 60000;
const POLL_STAGGER_MS = 10000;

interface StorageMetrics {
  activeTrendsSizeMB: number;
  archiveSizeMB: number;
  amazonDataSizeMB: number;
  totalSizeMB: number;
  trendCount: number;
  archivedTrendCount: number;
  oldestTrendDate: string | null;
  trackingStartDate: string | null;
}

export function Dashboard() {
  const [storageMetrics, setStorageMetrics] = useState<StorageMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    // Fetch storage metrics. Background refreshes use isRefreshing so the
    // numbers don't reset to placeholders ("...") on every poll.
    const fetchMetrics = (isBackground = false) => {
      if (isBackground) {
        setIsRefreshing(true);
      } else {
        setLoading(true);
      }
      fetch('/api/trends/storage-metrics')
        .then(res => {
          if (!res.ok) throw new Error('Failed to fetch');
          return res.json();
        })
        .then(data => {
          if (data.success) {
            setStorageMetrics(data.metrics);
            setError(false);
            setLastUpdatedAt(new Date());
          } else {
            setError(true);
          }
        })
        .catch(err => {
          console.error('Storage metrics error:', err);
          setError(true);
        })
        .finally(() => {
          setLoading(false);
          setIsRefreshing(false);
        });
    };

    fetchMetrics();
    // Staggered start so we don't pile up with ExplodingTrends if both mount
    // together (the route only renders one at a time, but better safe).
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const startId = setTimeout(() => {
      intervalId = setInterval(() => fetchMetrics(true), POLL_INTERVAL_MS);
    }, POLL_STAGGER_MS);
    return () => {
      clearTimeout(startId);
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  // Show loading spinner or placeholder values
  const getMetricDisplay = (value: any, fallback: string = '...') => {
    if (loading) return fallback;
    if (error) return '—';
    return value;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
          <p className="text-gray-500">Overview of your AI-powered market intelligence.</p>
        </div>
        <LiveIndicator
          lastUpdatedAt={lastUpdatedAt}
          isRefreshing={isRefreshing}
          hasError={error}
          intervalMs={POLL_INTERVAL_MS}
        />
      </div>

      {/* Quick Access Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Multi-Platform Section */}
        <Card className="border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl shadow-lg">
                  <Globe className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Multi-Platform Insights</h3>
                  <p className="text-xs text-emerald-700 flex items-center gap-1">
                    <span>🌍</span>
                    9+ Data Sources
                  </p>
                </div>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Discover trending products and topics across Reddit, TikTok, Pinterest, Etsy, eBay, Google, and more.
            </p>
            <div className="space-y-2">
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full justify-between border-emerald-300 text-emerald-700 hover:bg-emerald-100"
              >
                <span className="flex items-center gap-2">
                  <Rocket className="w-4 h-4" />
                  Exploding Trends
                </span>
                <ArrowRight className="w-4 h-4" />
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full justify-between border-emerald-300 text-emerald-700 hover:bg-emerald-100"
              >
                <span className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" />
                  By Category
                </span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Amazon Section */}
        <Card className="border-2 border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-gradient-to-br from-orange-500 to-amber-600 rounded-xl shadow-lg">
                  <ShoppingBag className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Amazon Marketplace</h3>
                  <p className="text-xs text-orange-700 flex items-center gap-1">
                    <span>📦</span>
                    Amazon-Specific
                  </p>
                </div>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Research keywords, track rankings, analyze competitors (ASINs), and find high-opportunity products.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full border-orange-300 text-orange-700 hover:bg-orange-100 text-xs"
              >
                Keywords
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full border-orange-300 text-orange-700 hover:bg-orange-100 text-xs"
              >
                Trending
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full border-orange-300 text-orange-700 hover:bg-orange-100 text-xs"
              >
                ASINs
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full border-orange-300 text-orange-700 hover:bg-orange-100 text-xs"
              >
                History
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stats Section */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Overall Statistics</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card className="bg-white border-gray-200">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-indigo-50 rounded-lg text-indigo-600">
                  <BarChart3 className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Active Trends</p>
                  <h3 className="text-2xl font-bold text-gray-900">
                    {getMetricDisplay(storageMetrics?.trendCount.toLocaleString())}
                  </h3>
                  {error && (
                    <p className="text-xs text-amber-500 mt-1">Server needed</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-white border-gray-200">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-green-50 rounded-lg text-green-600">
                  <TrendingUp className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Market Opportunity</p>
                  <h3 className="text-2xl font-bold text-gray-900">High</h3>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-gray-200">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-purple-50 rounded-lg text-purple-600">
                  <Database className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Archived Trends</p>
                  <h3 className="text-2xl font-bold text-gray-900">
                    {getMetricDisplay(storageMetrics?.archivedTrendCount.toLocaleString())}
                  </h3>
                  {error && (
                    <p className="text-xs text-amber-500 mt-1">Server needed</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white border-gray-200">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-teal-50 rounded-lg text-teal-600">
                  <BarChart3 className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Data Storage</p>
                  <h3 className="text-2xl font-bold text-gray-900">
                    {getMetricDisplay(
                      storageMetrics ? `${storageMetrics.totalSizeMB.toFixed(1)} MB` : null
                    )}
                  </h3>
                  {storageMetrics && storageMetrics.trackingStartDate && !error && (
                    <p className="text-xs text-gray-400 mt-1">
                      Since {formatDate(storageMetrics.trackingStartDate)}
                    </p>
                  )}
                  {error && (
                    <p className="text-xs text-amber-500 mt-1">Server needed</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Info Box */}
      <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
        <CardContent className="p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-2">💡 Pro Tip</h3>
          <p className="text-sm text-gray-700">
            <strong>Use Exploding Trends for inspiration,</strong> then validate opportunities with Amazon-specific tools! 
            Multi-platform trends help you discover what's gaining traction across the internet, 
            while Amazon tools help you execute and find profitable keywords with low competition.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

