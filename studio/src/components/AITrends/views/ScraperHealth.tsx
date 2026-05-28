import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  XCircle,
  Zap,
  Server,
  TrendingUp,
  AlertCircle,
  Play,
  Loader2,
  ChevronDown,
  ChevronUp,
  Database,
  Wifi,
  WifiOff,
  Timer,
  BarChart3,
  Bell
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import { Button } from '../../Button';

// Types matching the backend
interface ScraperHealth {
  source: string;
  status: 'healthy' | 'degraded' | 'failing' | 'mock';
  lastSuccessfulScrape: string | null;
  lastAttempt: string | null;
  consecutiveFailures: number;
  totalScrapes24h: number;
  successRate24h: number;
  avgResponseTime: number;
  dataFreshness: 'live' | 'stale' | 'mock';
  trendsCollected24h: number;
  errorMessages: string[];
}

interface HealthSummary {
  totalSources: number;
  healthySources: number;
  degradedSources: number;
  failingSources: number;
  mockSources: number;
  overallHealth: 'healthy' | 'degraded' | 'critical';
  totalTrends24h: number;
  avgSuccessRate: number;
}

interface HealthAlert {
  type: 'scraper_failure' | 'degraded_performance' | 'stale_data' | 'recovery';
  source: string;
  message: string;
  timestamp: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  details?: Record<string, any>;
}

interface HealthData {
  health: ScraperHealth[];
  summary: HealthSummary;
  recentAlerts: HealthAlert[];
}

// Source display names and icons
const SOURCE_INFO: Record<string, { name: string; icon: string; color: string }> = {
  googleTrends: { name: 'Google Trends', icon: '🔍', color: 'bg-blue-500' },
  reddit: { name: 'Reddit', icon: '🔴', color: 'bg-orange-500' },
  etsy: { name: 'Etsy', icon: '🛍️', color: 'bg-orange-400' },
  ebay: { name: 'eBay', icon: '🏷️', color: 'bg-yellow-500' },
  tiktok: { name: 'TikTok', icon: '🎵', color: 'bg-pink-500' },
  pinterest: { name: 'Pinterest', icon: '📌', color: 'bg-red-500' },
  twitter: { name: 'Twitter/X', icon: '🐦', color: 'bg-sky-500' },
  googleShopping: { name: 'Google Shopping', icon: '🛒', color: 'bg-green-500' },
  tiktokShop: { name: 'TikTok Shop', icon: '🛍️', color: 'bg-pink-400' },
  amazonKeywords: { name: 'Amazon', icon: '📦', color: 'bg-amber-500' },
  tiktokCreativeCenter: { name: 'TikTok Creative', icon: '🎨', color: 'bg-purple-500' },
};

export function ScraperHealth() {
  const [healthData, setHealthData] = useState<HealthData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [testingSource, setTestingSource] = useState<string | null>(null);
  const [expandedSource, setExpandedSource] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchHealth = useCallback(async () => {
    try {
      const response = await fetch('/api/trends/health');
      if (!response.ok) throw new Error('Failed to fetch health data');
      const data = await response.json();
      setHealthData(data);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    
    // Auto-refresh every 30 seconds
    let interval: NodeJS.Timeout;
    if (autoRefresh) {
      interval = setInterval(fetchHealth, 30000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [fetchHealth, autoRefresh]);

  const testScraper = async (source: string) => {
    setTestingSource(source);
    try {
      const response = await fetch(`/api/trends/health/test/${source}`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Test failed');
      await fetchHealth(); // Refresh after test
    } catch (err: any) {
      console.error('Test failed:', err);
    } finally {
      setTestingSource(null);
    }
  };

  const getStatusIcon = (status: ScraperHealth['status']) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
      case 'degraded':
        return <AlertTriangle className="w-5 h-5 text-amber-500" />;
      case 'failing':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'mock':
        return <Database className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusColor = (status: ScraperHealth['status']) => {
    switch (status) {
      case 'healthy': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'degraded': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'failing': return 'bg-red-100 text-red-700 border-red-200';
      case 'mock': return 'bg-gray-100 text-gray-600 border-gray-200';
    }
  };

  const getFreshnessIcon = (freshness: ScraperHealth['dataFreshness']) => {
    switch (freshness) {
      case 'live': return <Wifi className="w-4 h-4 text-emerald-500" />;
      case 'stale': return <Clock className="w-4 h-4 text-amber-500" />;
      case 'mock': return <WifiOff className="w-4 h-4 text-gray-400" />;
    }
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const formatTimeAgo = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const getAlertIcon = (severity: HealthAlert['severity']) => {
    switch (severity) {
      case 'info': return <Activity className="w-4 h-4 text-blue-500" />;
      case 'warning': return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      case 'error': return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'critical': return <XCircle className="w-4 h-4 text-red-600" />;
    }
  };

  const getOverallHealthColor = (health: HealthSummary['overallHealth']) => {
    switch (health) {
      case 'healthy': return 'from-emerald-500 to-teal-600';
      case 'degraded': return 'from-amber-500 to-orange-600';
      case 'critical': return 'from-red-500 to-rose-600';
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-12rem)] text-center">
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full blur-xl opacity-30 animate-pulse" />
          <Server className="w-16 h-16 text-emerald-500 mb-4 relative animate-pulse" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Loading Health Data</h2>
        <p className="text-gray-500">Checking scraper status...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-12rem)] text-center">
        <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Error Loading Health Data</h2>
        <p className="text-gray-500 max-w-md mb-4">{error}</p>
        <Button onClick={fetchHealth} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Retry
        </Button>
      </div>
    );
  }

  if (!healthData) return null;

  const { health, summary, recentAlerts } = healthData;

  return (
    <div className="flex flex-col gap-6 h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className={cn(
              "absolute inset-0 rounded-xl blur-lg opacity-40",
              `bg-gradient-to-r ${getOverallHealthColor(summary.overallHealth)}`
            )} />
            <div className={cn(
              "relative p-3 rounded-xl shadow-lg",
              `bg-gradient-to-br ${getOverallHealthColor(summary.overallHealth)}`
            )}>
              <Server className="w-7 h-7 text-white" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Scraper Health</h2>
              <span className={cn(
                "px-3 py-1 text-xs font-semibold rounded-full border flex items-center gap-1.5 capitalize",
                summary.overallHealth === 'healthy' ? 'bg-emerald-100 text-emerald-700 border-emerald-300' :
                summary.overallHealth === 'degraded' ? 'bg-amber-100 text-amber-700 border-amber-300' :
                'bg-red-100 text-red-700 border-red-300'
              )}>
                {summary.overallHealth === 'healthy' ? <CheckCircle2 className="w-3 h-3" /> :
                 summary.overallHealth === 'degraded' ? <AlertTriangle className="w-3 h-3" /> :
                 <XCircle className="w-3 h-3" />}
                {summary.overallHealth}
              </span>
            </div>
            <p className="text-sm text-gray-500">
              Real-time monitoring of all trend data scrapers
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
            />
            Auto-refresh
          </label>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchHealth}
            className="gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
        <div className={cn(
          "rounded-xl p-4 text-white shadow-lg col-span-1",
          `bg-gradient-to-br ${getOverallHealthColor(summary.overallHealth)}`
        )}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm opacity-90">Overall Status</span>
            <Activity className="w-4 h-4 opacity-80" />
          </div>
          <div className="text-2xl font-bold capitalize">{summary.overallHealth}</div>
          <p className="text-xs opacity-80 mt-1">{summary.totalSources} sources monitored</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">Healthy</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-emerald-600">{summary.healthySources}</div>
          <p className="text-xs text-gray-400 mt-1">Fully operational</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">Degraded</span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-amber-600">{summary.degradedSources}</div>
          <p className="text-xs text-gray-400 mt-1">Partial issues</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">Failing</span>
            <XCircle className="w-4 h-4 text-red-500" />
          </div>
          <div className="text-2xl font-bold text-red-600">{summary.failingSources}</div>
          <p className="text-xs text-gray-400 mt-1">Need attention</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">Trends (24h)</span>
            <TrendingUp className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-bold text-gray-900">{summary.totalTrends24h.toLocaleString()}</div>
          <p className="text-xs text-gray-400 mt-1">Collected today</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">Success Rate</span>
            <BarChart3 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-gray-900">{summary.avgSuccessRate.toFixed(0)}%</div>
          <p className="text-xs text-gray-400 mt-1">Average (24h)</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-0">
        {/* Scrapers List */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <Server className="w-4 h-4 text-gray-400" />
              Scraper Status
            </h3>
            <span className="text-xs text-gray-400">{health.length} sources</span>
          </div>
          <div className="flex-1 overflow-auto">
            <div className="divide-y divide-gray-100">
              {health.map((scraper) => {
                const info = SOURCE_INFO[scraper.source] || { 
                  name: scraper.source, 
                  icon: '📊', 
                  color: 'bg-gray-500' 
                };
                const isExpanded = expandedSource === scraper.source;
                const isTesting = testingSource === scraper.source;

                return (
                  <div key={scraper.source} className="hover:bg-gray-50/50 transition-colors">
                    <div 
                      className="p-4 flex items-center gap-4 cursor-pointer"
                      onClick={() => setExpandedSource(isExpanded ? null : scraper.source)}
                    >
                      {/* Source Icon */}
                      <div className={cn(
                        "w-10 h-10 rounded-lg flex items-center justify-center text-white text-lg",
                        info.color
                      )}>
                        {info.icon}
                      </div>

                      {/* Source Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{info.name}</span>
                          <span className={cn(
                            "px-2 py-0.5 text-xs font-medium rounded-full border capitalize",
                            getStatusColor(scraper.status)
                          )}>
                            {scraper.status}
                          </span>
                          <span className="flex items-center gap-1 text-xs text-gray-500">
                            {getFreshnessIcon(scraper.dataFreshness)}
                            {scraper.dataFreshness}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatTimeAgo(scraper.lastSuccessfulScrape)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Timer className="w-3 h-3" />
                            {formatDuration(scraper.avgResponseTime)}
                          </span>
                          <span className="flex items-center gap-1">
                            <TrendingUp className="w-3 h-3" />
                            {scraper.trendsCollected24h} trends
                          </span>
                        </div>
                      </div>

                      {/* Status Indicator */}
                      <div className="flex items-center gap-3">
                        {getStatusIcon(scraper.status)}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            testScraper(scraper.source);
                          }}
                          disabled={isTesting}
                          className="gap-1 text-xs"
                        >
                          {isTesting ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Play className="w-3 h-3" />
                          )}
                          Test
                        </Button>
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-gray-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-gray-400" />
                        )}
                      </div>
                    </div>

                    {/* Expanded Details */}
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-0">
                        <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="text-gray-500 block">Success Rate (24h)</span>
                              <span className={cn(
                                "font-semibold",
                                scraper.successRate24h >= 80 ? "text-emerald-600" :
                                scraper.successRate24h >= 50 ? "text-amber-600" : "text-red-600"
                              )}>
                                {scraper.successRate24h.toFixed(1)}%
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-500 block">Total Scrapes (24h)</span>
                              <span className="font-semibold text-gray-900">{scraper.totalScrapes24h}</span>
                            </div>
                            <div>
                              <span className="text-gray-500 block">Consecutive Failures</span>
                              <span className={cn(
                                "font-semibold",
                                scraper.consecutiveFailures === 0 ? "text-emerald-600" :
                                scraper.consecutiveFailures < 3 ? "text-amber-600" : "text-red-600"
                              )}>
                                {scraper.consecutiveFailures}
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-500 block">Last Attempt</span>
                              <span className="font-semibold text-gray-900">
                                {formatTimeAgo(scraper.lastAttempt)}
                              </span>
                            </div>
                          </div>
                          
                          {scraper.errorMessages.length > 0 && (
                            <div>
                              <span className="text-gray-500 text-sm block mb-1">Recent Errors</span>
                              <div className="bg-red-50 border border-red-100 rounded-lg p-2 text-xs text-red-700 max-h-24 overflow-auto">
                                {scraper.errorMessages.slice(-3).map((msg, i) => (
                                  <div key={i} className="truncate">{msg}</div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Alerts Panel */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <Bell className="w-4 h-4 text-gray-400" />
              Recent Alerts
            </h3>
            <span className="text-xs text-gray-400">{recentAlerts.length} alerts</span>
          </div>
          <div className="flex-1 overflow-auto">
            {recentAlerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-6">
                <CheckCircle2 className="w-12 h-12 text-emerald-300 mb-3" />
                <p className="text-gray-500 text-sm">No recent alerts</p>
                <p className="text-gray-400 text-xs">All systems operating normally</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {recentAlerts.map((alert, index) => (
                  <div key={index} className="p-4 hover:bg-gray-50/50 transition-colors">
                    <div className="flex items-start gap-3">
                      {getAlertIcon(alert.severity)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={cn(
                            "text-xs font-medium px-1.5 py-0.5 rounded capitalize",
                            alert.severity === 'info' ? 'bg-blue-100 text-blue-700' :
                            alert.severity === 'warning' ? 'bg-amber-100 text-amber-700' :
                            alert.severity === 'error' ? 'bg-red-100 text-red-700' :
                            'bg-red-200 text-red-800'
                          )}>
                            {alert.severity}
                          </span>
                          <span className="text-xs text-gray-400">
                            {formatTimeAgo(alert.timestamp)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700">{alert.message}</p>
                        <p className="text-xs text-gray-400 mt-1 capitalize">
                          Source: {SOURCE_INFO[alert.source]?.name || alert.source}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
