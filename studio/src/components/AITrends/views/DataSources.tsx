import React, { useState, useEffect } from 'react';
import {
  Database,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Clock,
  Activity,
  TrendingUp,
  Loader2,
  Play,
  Pause,
  BarChart3
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import { Button } from '../../Button';

interface DataSource {
  source: string;
  enabled: boolean;
  lastRun: string | null;
  nextRun: string | null;
  status: 'idle' | 'running' | 'error';
  errorMessage?: string;
  trendsCollected: number;
}

// Source display names and descriptions
const SOURCE_INFO: Record<string, { name: string; description: string; icon: string; color: string }> = {
  googleTrends: {
    name: 'Google Trends',
    description: 'Search trends and interest over time',
    icon: '🔍',
    color: 'from-blue-500 to-indigo-600'
  },
  reddit: {
    name: 'Reddit',
    description: 'Trending topics from popular subreddits',
    icon: '🔴',
    color: 'from-orange-500 to-red-600'
  },
  pinterest: {
    name: 'Pinterest',
    description: 'Visual trends and popular pins',
    icon: '📌',
    color: 'from-rose-500 to-pink-600'
  },
  twitter: {
    name: 'Twitter/X',
    description: 'Real-time trending hashtags and topics',
    icon: '🐦',
    color: 'from-sky-500 to-blue-600'
  },
  tiktok: {
    name: 'TikTok',
    description: 'Viral hashtags and trending sounds',
    icon: '🎵',
    color: 'from-pink-500 to-fuchsia-600'
  },
  etsy: {
    name: 'Etsy',
    description: 'Trending product searches and listings',
    icon: '🛍️',
    color: 'from-amber-500 to-orange-600'
  },
  ebay: {
    name: 'eBay',
    description: 'Popular marketplace searches',
    icon: '🏷️',
    color: 'from-yellow-500 to-amber-600'
  },
  googleShopping: {
    name: 'Google Shopping',
    description: 'Product search trends and pricing',
    icon: '🛒',
    color: 'from-green-500 to-emerald-600'
  },
  tiktokShop: {
    name: 'TikTok Shop',
    description: 'Viral products and trending e-commerce',
    icon: '🛍️',
    color: 'from-fuchsia-500 to-purple-600'
  }
};

export function DataSources() {
  console.log('[DataSources] Component mounted');
  const [sources, setSources] = useState<DataSource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshingSource, setRefreshingSource] = useState<string | null>(null);

  // Fetch sources status
  const fetchSources = async () => {
    setIsLoading(true);
    setError(null);

    try {
      console.log('[DataSources] Fetching from /api/trends/sources');
      const response = await fetch('/api/trends/sources');
      console.log('[DataSources] Response status:', response.status);
      
      if (!response.ok) {
        throw new Error('Failed to fetch data sources');
      }

      const data = await response.json();
      console.log('[DataSources] Received data:', data);
      console.log('[DataSources] Sources array:', data.sources);
      console.log('[DataSources] Number of sources:', data.sources?.length);
      
      // Validate sources have required fields
      const validSources = (data.sources || []).filter(s => {
        if (!s.source) {
          console.warn('[DataSources] Source missing "source" field:', s);
          return false;
        }
        return true;
      });
      
      console.log('[DataSources] Valid sources:', validSources.length);
      setSources(validSources);
    } catch (err: any) {
      console.error('[DataSources] Error:', err);
      setError(err.message || 'Failed to load data sources');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSources();
    // Refresh status every 30 seconds
    const interval = setInterval(fetchSources, 30000);
    return () => clearInterval(interval);
  }, []);

  // Manually trigger a source refresh
  const handleRefreshSource = async (source: string) => {
    setRefreshingSource(source);

    try {
      const response = await fetch(`/api/trends/refresh/${source}`, {
        method: 'POST'
      });

      if (!response.ok) {
        throw new Error(`Failed to refresh ${source}`);
      }

      // Wait a bit then refresh status
      setTimeout(fetchSources, 2000);
    } catch (err: any) {
      console.error(`Error refreshing ${source}:`, err);
      alert(`Failed to refresh ${source}: ${err.message}`);
    } finally {
      setRefreshingSource(null);
    }
  };

  // Format date
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  // Get status badge
  const getStatusBadge = (status: DataSource['status']) => {
    switch (status) {
      case 'running':
        return {
          icon: Activity,
          label: 'Running',
          color: 'text-blue-600 bg-blue-50 border-blue-200'
        };
      case 'error':
        return {
          icon: XCircle,
          label: 'Error',
          color: 'text-red-600 bg-red-50 border-red-200'
        };
      default:
        return {
          icon: CheckCircle2,
          label: 'Idle',
          color: 'text-green-600 bg-green-50 border-green-200'
        };
    }
  };

  // Calculate stats
  const stats = {
    total: sources.length,
    active: sources.filter(s => s.enabled).length,
    running: sources.filter(s => s.status === 'running').length,
    errors: sources.filter(s => s.status === 'error').length,
    totalTrends: sources.reduce((sum, s) => sum + (s.trendsCollected || 0), 0)
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-12rem)] text-center">
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full blur-xl opacity-30 animate-pulse" />
          <Database className="w-16 h-16 text-emerald-500 mb-4 relative animate-bounce" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Loading Data Sources</h2>
        <p className="text-gray-500 max-w-md">
          Checking status of all trend data sources...
        </p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-12rem)] text-center">
        <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Error Loading Sources</h2>
        <p className="text-gray-500 max-w-md mb-4">{error}</p>
        <Button onClick={fetchSources} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-xl blur-lg opacity-40" />
            <div className="relative p-3 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl shadow-lg">
              <Database className="w-7 h-7 text-white" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Data Sources</h2>
              <span className="px-3 py-1 text-xs font-semibold bg-emerald-100 text-emerald-700 rounded-full border border-emerald-300 flex items-center gap-1.5">
                <span>🌍</span>
                Multi-Platform
              </span>
            </div>
            <p className="text-sm text-gray-500">
              Monitor and manage trend collection from 9+ platforms
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={fetchSources}
            className="gap-2 border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh Status
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">Total Sources</span>
            <Database className="w-4 h-4 text-gray-400" />
          </div>
          <div className="text-3xl font-bold text-gray-900">{stats.total}</div>
          <p className="text-xs text-gray-400 mt-1">Data platforms</p>
        </div>

        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl p-4 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-emerald-100">Active</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-200" />
          </div>
          <div className="text-3xl font-bold">{stats.active}</div>
          <p className="text-xs text-emerald-200 mt-1">Enabled sources</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">Running</span>
            <Activity className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-bold text-gray-900">{stats.running}</div>
          <p className="text-xs text-gray-400 mt-1">Currently collecting</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">Errors</span>
            <AlertCircle className="w-4 h-4 text-red-500" />
          </div>
          <div className="text-2xl font-bold text-gray-900">{stats.errors}</div>
          <p className="text-xs text-gray-400 mt-1">Failed sources</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">Trends Collected</span>
            <TrendingUp className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-2xl font-bold text-gray-900">{stats.totalTrends}</div>
          <p className="text-xs text-gray-400 mt-1">Total data points</p>
        </div>
      </div>

      {/* Sources Grid */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 overflow-auto">
        {sources.map((source, index) => {
          const info = SOURCE_INFO[source.source] || {
            name: source.source,
            description: 'Trend data source',
            icon: '📊',
            color: 'from-gray-500 to-slate-600'
          };
          const statusBadge = getStatusBadge(source.status);
          const StatusIcon = statusBadge.icon;

          return (
            <div
              key={source.source || `source-${index}`}
              className={cn(
                "bg-white rounded-xl border p-5 shadow-sm hover:shadow-md transition-all",
                source.status === 'error' && "border-red-200 bg-red-50/30",
                source.status === 'running' && "border-blue-200 bg-blue-50/30"
              )}
            >
              {/* Source Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "p-2.5 rounded-lg bg-gradient-to-br shadow-sm",
                    info.color
                  )}>
                    <span className="text-2xl">{info.icon}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-gray-900 truncate">{info.name}</h3>
                    <p className="text-xs text-gray-500 line-clamp-1">{info.description}</p>
                  </div>
                </div>
              </div>

              {/* Status Badge */}
              <div className="flex items-center justify-between mb-4">
                <div className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border",
                  statusBadge.color
                )}>
                  <StatusIcon className="w-3.5 h-3.5" />
                  {statusBadge.label}
                </div>
                <div className={cn(
                  "px-2 py-0.5 rounded-full text-xs font-medium",
                  source.enabled 
                    ? "bg-green-100 text-green-700" 
                    : "bg-gray-100 text-gray-600"
                )}>
                  {source.enabled ? 'Enabled' : 'Disabled'}
                </div>
              </div>

              {/* Metrics */}
              <div className="space-y-2 mb-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    Last Run
                  </span>
                  <span className="font-medium text-gray-900">
                    {formatDate(source.lastRun)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 flex items-center gap-1.5">
                    <BarChart3 className="w-3.5 h-3.5" />
                    Collected
                  </span>
                  <span className="font-bold text-gray-900">
                    {(source.trendsCollected || 0).toLocaleString()}
                  </span>
                </div>
                {source.nextRun && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 text-xs">Next Run</span>
                    <span className="text-xs text-gray-600">
                      {formatDate(source.nextRun)}
                    </span>
                  </div>
                )}
              </div>

              {/* Error Message */}
              {source.status === 'error' && source.errorMessage && (
                <div className="mb-3 p-2 bg-red-100 border border-red-200 rounded-lg">
                  <p className="text-xs text-red-700 line-clamp-2">{source.errorMessage}</p>
                </div>
              )}

              {/* Actions */}
              <Button
                size="sm"
                variant="outline"
                className="w-full gap-2 border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 disabled:opacity-50"
                onClick={() => handleRefreshSource(source.source)}
                disabled={refreshingSource === source.source || source.status === 'running' || !source.enabled}
              >
                {refreshingSource === source.source ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Refreshing...
                  </>
                ) : source.status === 'running' ? (
                  <>
                    <Activity className="w-3.5 h-3.5" />
                    Running...
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    Trigger Refresh
                  </>
                )}
              </Button>
            </div>
          );
        })}
      </div>

      {/* Footer Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-blue-100 rounded-lg shrink-0">
            <AlertCircle className="w-5 h-5 text-blue-600" />
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-blue-900 mb-1">About Data Sources</h4>
            <p className="text-sm text-blue-700 leading-relaxed">
              Each data source runs on an automated schedule to collect trending topics. 
              You can manually trigger a refresh for any source. Running sources will automatically 
              update the trends database when new data is collected.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

