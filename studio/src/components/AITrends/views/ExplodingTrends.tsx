import React, { useState, useMemo, useEffect } from 'react';
import { 
  Rocket,
  TrendingUp, 
  TrendingDown, 
  Search, 
  ChevronDown,
  Sparkles,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  AlertCircle,
  RefreshCw,
  Zap,
  Globe,
  Filter,
  Clock,
  CheckCircle2,
  Activity,
  Layers,
  ExternalLink
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import { Button } from '../../Button';
import type { ExplodingTrend, TrendCategory, TrendStoreStats } from '../../../types/AITrends';

// Time range filter options
type TimeRange = '7d' | '30d' | '90d' | 'all';

// Status filter options
type StatusFilter = 'all' | 'emerging' | 'exploding' | 'peaked' | 'declining' | 'stable';

// Explosion score thresholds
const SCORE_THRESHOLDS = {
  EXPLODING: 70,
  HOT: 50,
  RISING: 30,
  STABLE: 0,
};

export function ExplodingTrends() {
  // Data state
  const [trends, setTrends] = useState<ExplodingTrend[]>([]);
  const [categories, setCategories] = useState<TrendCategory[]>([]);
  const [stats, setStats] = useState<TrendStoreStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<StatusFilter>('all');
  const [selectedSources, setSelectedSources] = useState<string[]>(['all']); // Multi-select sources
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [sortBy, setSortBy] = useState<'explosionScore' | 'growthRate' | 'volume' | 'lastUpdated'>('explosionScore');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Fetch data
  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const [trendsRes, categoriesRes, statsRes] = await Promise.all([
        fetch('/api/trends/exploding?limit=100'),
        fetch('/api/trends/categories'),
        fetch('/api/trends/stats'),
      ]);

      if (!trendsRes.ok || !categoriesRes.ok || !statsRes.ok) {
        throw new Error('Failed to fetch trend data');
      }

      const trendsData = await trendsRes.json();
      const categoriesData = await categoriesRes.json();
      const statsData = await statsRes.json();

      setTrends(trendsData.trends || []);
      setCategories(categoriesData.categories || []);
      setStats(statsData.stats || null);
    } catch (err: any) {
      setError(err.message || 'Failed to load trends');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Filter and sort trends
  const filteredTrends = useMemo(() => {
    let filtered = [...trends];

    // Search filter
    if (searchFilter) {
      const search = searchFilter.toLowerCase();
      filtered = filtered.filter(t => 
        t.topic.toLowerCase().includes(search) ||
        (t.relatedTopics || []).some(rt => rt.toLowerCase().includes(search))
      );
    }

    // Category filter
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(t => t.category === selectedCategory);
    }

    // Status filter
    if (selectedStatus !== 'all') {
      filtered = filtered.filter(t => t.status === selectedStatus);
    }

    // Multi-source filter
    if (!selectedSources.includes('all')) {
      filtered = filtered.filter(t => 
        t.sources.some(s => selectedSources.includes(s.name || ''))
      );
    }

    // Time range filter (based on first detected)
    if (timeRange !== 'all') {
      const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
      const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
      filtered = filtered.filter(t => new Date(t.lastUpdated).getTime() >= cutoff);
    }

    // Sort
    filtered.sort((a, b) => {
      let aVal: number, bVal: number;
      
      switch (sortBy) {
        case 'explosionScore':
          aVal = a.explosionScore ?? 0;
          bVal = b.explosionScore ?? 0;
          break;
        case 'growthRate':
          aVal = a.growthRate ?? 0;
          bVal = b.growthRate ?? 0;
          break;
        case 'volume':
          aVal = a.volume ?? 0;
          bVal = b.volume ?? 0;
          break;
        case 'lastUpdated':
          aVal = new Date(a.lastUpdated).getTime();
          bVal = new Date(b.lastUpdated).getTime();
          break;
        default:
          aVal = a.explosionScore ?? 0;
          bVal = b.explosionScore ?? 0;
      }
      
      const modifier = sortOrder === 'desc' ? -1 : 1;
      return (aVal - bVal) * modifier;
    });

    return filtered;
  }, [trends, searchFilter, selectedCategory, selectedStatus, selectedSources, timeRange, sortBy, sortOrder]);

  // Get unique sources from trends with counts
  const availableSources = useMemo(() => {
    const sourceCounts = new Map<string, number>();
    trends.forEach(trend => {
      trend.sources.forEach(source => {
        if (source.name) {
          sourceCounts.set(source.name, (sourceCounts.get(source.name) || 0) + 1);
        }
      });
    });
    return Array.from(sourceCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [trends]);

  // Toggle source selection
  const toggleSource = (sourceName: string) => {
    if (sourceName === 'all') {
      setSelectedSources(['all']);
    } else {
      setSelectedSources(prev => {
        // Remove 'all' if it was selected
        const withoutAll = prev.filter(s => s !== 'all');
        
        if (prev.includes(sourceName)) {
          // Remove this source
          const newSources = withoutAll.filter(s => s !== sourceName);
          // If nothing selected, default to 'all'
          return newSources.length === 0 ? ['all'] : newSources;
        } else {
          // Add this source
          return [...withoutAll, sourceName];
        }
      });
    }
  };
  const getExplosionBadge = (score: number) => {
    if (score >= SCORE_THRESHOLDS.EXPLODING) {
      return { label: 'Exploding', color: 'bg-gradient-to-r from-orange-500 to-red-500 text-white', icon: Rocket };
    }
    if (score >= SCORE_THRESHOLDS.HOT) {
      return { label: 'Hot', color: 'bg-gradient-to-r from-amber-500 to-orange-500 text-white', icon: Zap };
    }
    if (score >= SCORE_THRESHOLDS.RISING) {
      return { label: 'Rising', color: 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white', icon: TrendingUp };
    }
    return { label: 'Stable', color: 'bg-gray-100 text-gray-600', icon: Activity };
  };

  // Get status badge
  const getStatusBadge = (status: ExplodingTrend['status']) => {
    switch (status) {
      case 'exploding':
        return { label: 'Exploding', color: 'text-red-600 bg-red-50 border-red-200' };
      case 'emerging':
        return { label: 'Emerging', color: 'text-amber-600 bg-amber-50 border-amber-200' };
      case 'peaked':
        return { label: 'Peaked', color: 'text-purple-600 bg-purple-50 border-purple-200' };
      case 'declining':
        return { label: 'Declining', color: 'text-gray-600 bg-gray-50 border-gray-200' };
      default:
        return { label: 'Stable', color: 'text-blue-600 bg-blue-50 border-blue-200' };
    }
  };

  // Format numbers
  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  // Format date
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (24 * 60 * 60 * 1000));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return date.toLocaleDateString();
  };

  // Source icons
  const getSourceIcon = (sourceName: string) => {
    switch (sourceName) {
      case 'google': return '🔍';
      case 'reddit': return '🔴';
      case 'amazon': return '📦';
      case 'tiktok': return '🎵';
      case 'etsy': return '🛍️';
      case 'ebay': return '🏷️';
      case 'pinterest': return '📌';
      case 'twitter': return '🐦';
      case 'google-shopping': return '🛒';
      case 'tiktok-shop': return '🛍️';
      default: return '📊';
    }
  };

  // Toggle sort
  const handleSort = (field: typeof sortBy) => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-12rem)] text-center">
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-orange-500 to-red-500 rounded-full blur-xl opacity-30 animate-pulse" />
          <Rocket className="w-16 h-16 text-orange-500 mb-4 relative animate-bounce" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Discovering Exploding Trends</h2>
        <p className="text-gray-500 max-w-md">
          Analyzing growth patterns across multiple sources...
        </p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-12rem)] text-center">
        <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Error Loading Trends</h2>
        <p className="text-gray-500 max-w-md mb-4">{error}</p>
        <Button onClick={fetchData} className="gap-2">
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
              <Rocket className="w-7 h-7 text-white" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Exploding Trends</h2>
              <span className="px-3 py-1 text-xs font-semibold bg-emerald-100 text-emerald-700 rounded-full border border-emerald-300 flex items-center gap-1.5">
                <span>🌍</span>
                Multi-Platform
              </span>
            </div>
            <p className="text-sm text-gray-500">
              Discover trends across 9+ platforms before they go mainstream
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={fetchData}
            className="gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-gradient-to-br from-orange-500 to-red-600 rounded-xl p-4 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-orange-100">Exploding</span>
            <Rocket className="w-4 h-4 text-orange-200" />
          </div>
          <div className="text-3xl font-bold">{stats?.explodingCount || 0}</div>
          <p className="text-xs text-orange-200 mt-1">Score 70+</p>
        </div>
        
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">Emerging</span>
            <Sparkles className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-gray-900">{stats?.emergingCount || 0}</div>
          <p className="text-xs text-gray-400 mt-1">Early stage growth</p>
        </div>
        
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">Multi-Source</span>
            <Layers className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-bold text-gray-900">{stats?.multiSourceCount || 0}</div>
          <p className="text-xs text-gray-400 mt-1">Confirmed across 2+ sources</p>
        </div>
        
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">Total Tracked</span>
            <BarChart3 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-gray-900">{stats?.totalTrends || 0}</div>
          <p className="text-xs text-gray-400 mt-1">Across all categories</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">Last Update</span>
            <Clock className="w-4 h-4 text-gray-400" />
          </div>
          <div className="text-sm font-medium text-gray-900">
            {stats?.lastUpdate ? formatDate(stats.lastUpdate) : 'Never'}
          </div>
          <p className="text-xs text-gray-400 mt-1">Data freshness</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder="Search trends..."
            className="w-full h-9 pl-10 pr-4 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 focus:bg-white transition-all outline-none"
          />
        </div>

        {/* Category Filter */}
        <div className="relative">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="h-9 pl-3 pr-8 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 appearance-none cursor-pointer hover:bg-gray-100 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none"
          >
            <option value="all">All Categories</option>
            {categories.map(cat => (
              <option key={cat.id} value={cat.id}>
                {cat.name} ({cat.trendCount})
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>

        {/* Status Filter */}
        <div className="relative">
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value as StatusFilter)}
            className="h-9 pl-3 pr-8 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 appearance-none cursor-pointer hover:bg-gray-100 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none"
          >
            <option value="all">All Status</option>
            <option value="exploding">🚀 Exploding</option>
            <option value="emerging">✨ Emerging</option>
            <option value="peaked">📈 Peaked</option>
            <option value="declining">📉 Declining</option>
            <option value="stable">➡️ Stable</option>
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>

        {/* Time Range */}
        <div className="flex items-center gap-1 bg-gray-50 p-1 rounded-lg border border-gray-200">
          {(['7d', '30d', '90d', 'all'] as TimeRange[]).map(range => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={cn(
                "px-3 py-1 text-xs font-medium rounded-md transition-all",
                timeRange === range
                  ? "bg-white text-orange-600 shadow-sm border border-gray-100"
                  : "text-gray-500 hover:text-gray-900"
              )}
            >
              {range === 'all' ? 'All Time' : range}
            </button>
          ))}
        </div>
      </div>

      {/* Multi-Select Platform Filter Chips */}
      <div className="flex flex-wrap items-center gap-2 bg-white rounded-xl border border-gray-200 p-3 shadow-sm">
        <span className="text-xs font-medium text-gray-500 mr-1 flex items-center gap-1">
          <Filter className="w-3 h-3" />
          Platforms:
        </span>
        <button
          onClick={() => toggleSource('all')}
          className={cn(
            "px-3 py-1.5 text-xs font-medium rounded-full border transition-all flex items-center gap-1.5",
            selectedSources.includes('all')
              ? "bg-orange-500 text-white border-orange-500 shadow-sm"
              : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
          )}
        >
          <Globe className="w-3 h-3" />
          All Platforms
          <span className="opacity-70">({trends.length})</span>
        </button>
        {availableSources.map(({ name, count }) => (
          <button
            key={name}
            onClick={() => toggleSource(name)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-full border transition-all flex items-center gap-1.5",
              selectedSources.includes(name)
                ? "bg-orange-500 text-white border-orange-500 shadow-sm"
                : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
            )}
          >
            <span>{getSourceIcon(name)}</span>
            <span className="capitalize">{name.replace('-', ' ')}</span>
            <span className={cn(
              "px-1.5 py-0.5 rounded-full text-[10px]",
              selectedSources.includes(name) 
                ? "bg-white/20" 
                : "bg-gray-200/50"
            )}>
              {count}
            </span>
          </button>
        ))}
        {!selectedSources.includes('all') && selectedSources.length > 0 && (
          <button
            onClick={() => setSelectedSources(['all'])}
            className="px-2 py-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Trends Grid/Table */}
      <div className="flex-1 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-auto h-full">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 font-medium text-gray-500 w-16 text-center">#</th>
                <th className="px-4 py-3 font-medium text-gray-500">Trend</th>
                <th className="px-4 py-3 font-medium text-gray-500">Category</th>
                <th className="px-4 py-3 font-medium text-gray-500 text-center">Sources</th>
                <th 
                  className="px-4 py-3 font-medium text-gray-500 text-right cursor-pointer hover:text-orange-600 select-none"
                  onClick={() => handleSort('growthRate')}
                >
                  <div className="flex items-center justify-end gap-1">
                    Growth
                    {sortBy === 'growthRate' && (
                      sortOrder === 'desc' ? <ArrowDownRight className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />
                    )}
                  </div>
                </th>
                <th 
                  className="px-4 py-3 font-medium text-gray-500 text-right cursor-pointer hover:text-orange-600 select-none"
                  onClick={() => handleSort('volume')}
                >
                  <div className="flex items-center justify-end gap-1">
                    Volume
                    {sortBy === 'volume' && (
                      sortOrder === 'desc' ? <ArrowDownRight className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />
                    )}
                  </div>
                </th>
                <th 
                  className="px-4 py-3 font-medium text-gray-500 text-center cursor-pointer hover:text-orange-600 select-none"
                  onClick={() => handleSort('explosionScore')}
                >
                  <div className="flex items-center justify-center gap-1">
                    Score
                    {sortBy === 'explosionScore' && (
                      sortOrder === 'desc' ? <ArrowDownRight className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />
                    )}
                  </div>
                </th>
                <th className="px-4 py-3 font-medium text-gray-500 text-center">Status</th>
                <th 
                  className="px-4 py-3 font-medium text-gray-500 text-right cursor-pointer hover:text-orange-600 select-none"
                  onClick={() => handleSort('lastUpdated')}
                >
                  <div className="flex items-center justify-end gap-1">
                    Detected
                    {sortBy === 'lastUpdated' && (
                      sortOrder === 'desc' ? <ArrowDownRight className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />
                    )}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredTrends.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-gray-500">
                    <Rocket className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p className="font-medium">No trends found</p>
                    <p className="text-sm">Try adjusting your filters or refresh the data</p>
                  </td>
                </tr>
              ) : (
                filteredTrends.map((trend, index) => {
                  const explosionScore = trend.explosionScore ?? 0;
                  const growthRate = trend.growthRate ?? 0;
                  const volume = trend.volume ?? 0;
                  const explosionBadge = getExplosionBadge(explosionScore);
                  const statusBadge = getStatusBadge(trend.status);
                  const isPositiveGrowth = growthRate > 0;
                  const ExplosionIcon = explosionBadge.icon;
                  
                  return (
                    <tr 
                      key={trend.id}
                      className="hover:bg-orange-50/30 transition-colors cursor-pointer group"
                    >
                      <td className="px-4 py-4 text-center font-mono text-gray-400 text-xs">
                        {index + 1}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            {explosionScore >= SCORE_THRESHOLDS.EXPLODING && (
                              <span className="flex items-center justify-center w-5 h-5 bg-gradient-to-br from-orange-500 to-red-500 rounded-full animate-pulse" title="Exploding!">
                                <Rocket className="w-3 h-3 text-white" />
                              </span>
                            )}
                            <span className="font-semibold text-gray-900">{trend.topic}</span>
                          </div>
                          {(trend.relatedTopics || []).length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {(trend.relatedTopics || []).slice(0, 3).map((rt, i) => (
                                <span key={i} className="text-xs text-gray-400">
                                  {rt}{i < Math.min(2, (trend.relatedTopics || []).length - 1) ? ',' : ''}
                                </span>
                              ))}
                              {(trend.relatedTopics || []).length > 3 && (
                                <span className="text-xs text-gray-400">+{(trend.relatedTopics || []).length - 3} more</span>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full capitalize">
                          {trend.category}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-center gap-1.5 flex-wrap">
                          {trend.sources.filter(source => source.name).map((source, i) => (
                            <span 
                              key={i} 
                              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-full cursor-help transition-colors" 
                              title={`${source.name}: ${formatNumber(source.volume || 0)} volume, ${(source.growth || 0) > 0 ? '+' : ''}${(source.growth || 0).toFixed(0)}% growth`}
                            >
                              <span className="text-sm">{getSourceIcon(source.name || '')}</span>
                              <span className="capitalize">{source.name}</span>
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className={cn(
                          "inline-flex items-center gap-1 text-sm font-bold px-2 py-1 rounded-full",
                          isPositiveGrowth 
                            ? growthRate > 100 
                              ? "text-green-600 bg-green-50 shadow-[0_0_12px_rgba(34,197,94,0.5)] ring-2 ring-green-400/30 animate-pulse" 
                              : "text-green-600 bg-green-50"
                            : "text-gray-600 bg-gray-50"
                        )}>
                          {isPositiveGrowth ? (
                            <TrendingUp className="w-3.5 h-3.5" />
                          ) : (
                            <TrendingDown className="w-3.5 h-3.5" />
                          )}
                          {isPositiveGrowth ? '+' : ''}{growthRate.toFixed(0)}%
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right font-mono text-gray-900">
                        {formatNumber(volume)}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <div className={cn(
                          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold",
                          explosionBadge.color
                        )}>
                          <ExplosionIcon className="w-3.5 h-3.5" />
                          {explosionScore.toFixed(0)}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={cn(
                          "text-xs font-medium px-2 py-1 rounded-full border capitalize",
                          statusBadge.color
                        )}>
                          {statusBadge.label}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right text-xs text-gray-500">
                        {formatDate(trend.lastUpdated)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>
          Showing {filteredTrends.length} of {trends.length} trends
        </span>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-gradient-to-r from-orange-500 to-red-500 rounded-full" />
            <span className="text-xs">Exploding (70+)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-gradient-to-r from-amber-500 to-orange-500 rounded-full" />
            <span className="text-xs">Hot (50+)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full" />
            <span className="text-xs">Rising (30+)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

