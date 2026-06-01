import React, { useState, useMemo } from 'react';
import { 
  Flame, 
  TrendingUp, 
  TrendingDown, 
  Search, 
  Filter, 
  ChevronDown,
  Sparkles,
  Target,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Zap
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import { Button } from '../../Button';
import { LiveIndicator } from '../components/LiveIndicator';
import { useAITrends } from '../../../contexts/AITrendsContext';
import { useTrendingKeywords, useCategories, TrendingKeyword } from '../../../hooks/useTrendingData';
import type { Marketplace } from '../../../types/AITrends';

const POLL_INTERVAL_MS = 60000;

// Preset categories from the plan
const PRESET_CATEGORIES = [
  'All Categories',
  'Books & Coloring Books',
  'Toys & Games',
  'Home & Kitchen',
  'Electronics',
  'Beauty & Personal Care',
  'Sports & Outdoors',
  'Pet Supplies',
  'Arts, Crafts & Sewing',
];

// Time range options
type TimeRange = '7d' | '30d' | '90d';

export function TrendingKeywords() {
  const { marketplace, setCurrentKeyword, triggerSearch } = useAITrends();
  
  // Local state
  const [selectedCategory, setSelectedCategory] = useState<string>('All Categories');
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const [searchFilter, setSearchFilter] = useState('');
  const [showEmergingOnly, setShowEmergingOnly] = useState(false);
  const [sortBy, setSortBy] = useState<'opportunityScore' | 'volumeChange7d' | 'searchVolume' | 'competitionScore'>('opportunityScore');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Fetch trending keywords. refetchInterval is wired into the hook (60s), so
  // the data auto-refreshes in the background; we surface freshness via the
  // LiveIndicator below using react-query's dataUpdatedAt / isFetching.
  const { data, isLoading, isFetching, dataUpdatedAt, error, refetch } = useTrendingKeywords({
    category: selectedCategory === 'All Categories' ? undefined : selectedCategory,
    marketplace,
    limit: 100,
    emergingOnly: showEmergingOnly,
    refetchInterval: POLL_INTERVAL_MS,
  });
  const lastUpdatedAt = dataUpdatedAt ? new Date(dataUpdatedAt) : null;

  // Fetch categories
  const { data: categoriesData } = useCategories();

  // Filter and sort keywords
  const filteredKeywords = useMemo(() => {
    if (!data?.keywords) return [];

    let filtered = data.keywords;

    // Apply search filter
    if (searchFilter) {
      const search = searchFilter.toLowerCase();
      filtered = filtered.filter(kw => 
        kw.keyword.toLowerCase().includes(search) ||
        kw.category.toLowerCase().includes(search)
      );
    }

    // Sort
    filtered.sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];
      const modifier = sortOrder === 'desc' ? -1 : 1;
      return (aVal - bVal) * modifier;
    });

    return filtered;
  }, [data?.keywords, searchFilter, sortBy, sortOrder]);

  // Handle keyword click - navigate to explorer
  const handleKeywordClick = (keyword: string) => {
    setCurrentKeyword(keyword);
    triggerSearch();
  };

  // Get competition badge color
  const getCompetitionBadge = (score: number) => {
    if (score < 30) return { label: 'Easy', color: 'bg-green-100 text-green-700 border-green-200' };
    if (score < 60) return { label: 'Medium', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' };
    return { label: 'Hard', color: 'bg-red-100 text-red-700 border-red-200' };
  };

  // Format volume
  const formatVolume = (volume: number) => {
    if (volume >= 1000000) return `${(volume / 1000000).toFixed(1)}M`;
    if (volume >= 1000) return `${(volume / 1000).toFixed(1)}K`;
    return volume.toString();
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
        <Loader2 className="w-16 h-16 text-indigo-600 mb-4 animate-spin" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Loading Trending Keywords</h2>
        <p className="text-gray-500 max-w-md">
          Analyzing market trends and opportunities...
        </p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-12rem)] text-center">
        <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Error Loading Data</h2>
        <p className="text-gray-500 max-w-md mb-4">
          {error.message || 'Failed to fetch trending keywords. Please try again.'}
        </p>
        <Button onClick={() => refetch()} className="gap-2">
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
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-orange-500 to-red-500 rounded-lg">
              <Flame className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-bold text-gray-900">Trending Keywords</h2>
                <span className="px-3 py-1 text-xs font-semibold bg-orange-100 text-orange-700 rounded-full border border-orange-300 flex items-center gap-1.5">
                  <span>📦</span>
                  Amazon
                </span>
              </div>
              <p className="text-sm text-gray-500">
                Discover high-growth opportunities with low competition on Amazon
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <LiveIndicator
            lastUpdatedAt={lastUpdatedAt}
            isRefreshing={isFetching && !isLoading}
            hasError={!!error}
            intervalMs={POLL_INTERVAL_MS}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="gap-2"
          >
            <RefreshCw className={cn('w-4 h-4', isFetching && !isLoading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">Total Keywords</span>
            <BarChart3 className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-bold text-gray-900">{data?.total || 0}</div>
          <p className="text-xs text-gray-400 mt-1">Across all categories</p>
        </div>
        
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">Emerging</span>
            <Sparkles className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {data?.keywords.filter(k => k.isEmerging).length || 0}
          </div>
          <p className="text-xs text-gray-400 mt-1">High growth, low competition</p>
        </div>
        
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">Top Opportunity</span>
            <Target className="w-4 h-4 text-green-500" />
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {data?.keywords[0]?.opportunityScore.toFixed(1) || '0'}
          </div>
          <p className="text-xs text-gray-400 mt-1 truncate">
            {data?.keywords[0]?.keyword || 'N/A'}
          </p>
        </div>
        
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">Avg Growth (7d)</span>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-gray-900">
            +{(data?.keywords.reduce((sum, k) => sum + k.volumeChange7d, 0) / (data?.keywords.length || 1)).toFixed(1)}%
          </div>
          <p className="text-xs text-gray-400 mt-1">Average volume change</p>
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
            placeholder="Search keywords..."
            className="w-full h-9 pl-10 pr-4 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white transition-all outline-none"
          />
        </div>

        {/* Category Filter */}
        <div className="relative">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="h-9 pl-3 pr-8 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 appearance-none cursor-pointer hover:bg-gray-100 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
          >
            {PRESET_CATEGORIES.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>

        {/* Time Range */}
        <div className="flex items-center gap-1 bg-gray-50 p-1 rounded-lg border border-gray-200">
          {(['7d', '30d', '90d'] as TimeRange[]).map(range => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={cn(
                "px-3 py-1 text-xs font-medium rounded-md transition-all",
                timeRange === range
                  ? "bg-white text-indigo-600 shadow-sm border border-gray-100"
                  : "text-gray-500 hover:text-gray-900"
              )}
            >
              {range}
            </button>
          ))}
        </div>

        {/* Emerging Only Toggle */}
        <button
          onClick={() => setShowEmergingOnly(!showEmergingOnly)}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all border",
            showEmergingOnly
              ? "bg-amber-50 text-amber-700 border-amber-200"
              : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
          )}
        >
          <Zap className={cn("w-4 h-4", showEmergingOnly && "text-amber-500")} />
          Emerging Only
        </button>
      </div>

      {/* Keywords Table */}
      <div className="flex-1 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-auto h-full">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 font-medium text-gray-500 w-16 text-center">#</th>
                <th className="px-4 py-3 font-medium text-gray-500">Keyword</th>
                <th className="px-4 py-3 font-medium text-gray-500">Category</th>
                <th 
                  className="px-4 py-3 font-medium text-gray-500 text-right cursor-pointer hover:text-indigo-600 select-none"
                  onClick={() => handleSort('searchVolume')}
                >
                  <div className="flex items-center justify-end gap-1">
                    Volume
                    {sortBy === 'searchVolume' && (
                      sortOrder === 'desc' ? <ArrowDownRight className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />
                    )}
                  </div>
                </th>
                <th 
                  className="px-4 py-3 font-medium text-gray-500 text-right cursor-pointer hover:text-indigo-600 select-none"
                  onClick={() => handleSort('volumeChange7d')}
                >
                  <div className="flex items-center justify-end gap-1">
                    7d Change
                    {sortBy === 'volumeChange7d' && (
                      sortOrder === 'desc' ? <ArrowDownRight className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />
                    )}
                  </div>
                </th>
                <th 
                  className="px-4 py-3 font-medium text-gray-500 text-right cursor-pointer hover:text-indigo-600 select-none"
                  onClick={() => handleSort('competitionScore')}
                >
                  <div className="flex items-center justify-end gap-1">
                    Competition
                    {sortBy === 'competitionScore' && (
                      sortOrder === 'desc' ? <ArrowDownRight className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />
                    )}
                  </div>
                </th>
                <th 
                  className="px-4 py-3 font-medium text-gray-500 text-right cursor-pointer hover:text-indigo-600 select-none"
                  onClick={() => handleSort('opportunityScore')}
                >
                  <div className="flex items-center justify-end gap-1">
                    Opportunity
                    {sortBy === 'opportunityScore' && (
                      sortOrder === 'desc' ? <ArrowDownRight className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />
                    )}
                  </div>
                </th>
                <th className="px-4 py-3 font-medium text-gray-500 w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredKeywords.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-500">
                    <Search className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p className="font-medium">No keywords found</p>
                    <p className="text-sm">Try adjusting your filters</p>
                  </td>
                </tr>
              ) : (
                filteredKeywords.map((kw, index) => {
                  const competitionBadge = getCompetitionBadge(kw.competitionScore);
                  const isPositiveGrowth = kw.volumeChange7d > 0;
                  
                  return (
                    <tr 
                      key={`${kw.keyword}-${kw.marketplace}`}
                      className="hover:bg-indigo-50/30 transition-colors cursor-pointer group"
                      onClick={() => handleKeywordClick(kw.keyword)}
                    >
                      <td className="px-4 py-3 text-center font-mono text-gray-400 text-xs">
                        {index + 1}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {kw.isEmerging && (
                            <span className="flex items-center justify-center w-5 h-5 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full" title="Emerging Opportunity">
                              <Flame className="w-3 h-3 text-white" />
                            </span>
                          )}
                          <span className="font-medium text-gray-900">{kw.keyword}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                          {kw.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-gray-900">
                        {formatVolume(kw.searchVolume)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className={cn(
                          "inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full",
                          isPositiveGrowth 
                            ? "text-green-700 bg-green-50" 
                            : "text-red-700 bg-red-50"
                        )}>
                          {isPositiveGrowth ? (
                            <TrendingUp className="w-3 h-3" />
                          ) : (
                            <TrendingDown className="w-3 h-3" />
                          )}
                          {isPositiveGrowth ? '+' : ''}{kw.volumeChange7d.toFixed(1)}%
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={cn(
                          "text-xs font-medium px-2 py-1 rounded-full border",
                          competitionBadge.color
                        )}>
                          {competitionBadge.label} ({kw.competitionScore})
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className={cn(
                          "inline-flex items-center gap-1 font-bold text-sm",
                          kw.opportunityScore > 10 ? "text-green-600" :
                          kw.opportunityScore > 5 ? "text-amber-600" :
                          "text-gray-600"
                        )}>
                          {kw.opportunityScore > 10 && <Sparkles className="w-4 h-4" />}
                          {kw.opportunityScore.toFixed(1)}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button 
                          variant="ghost" 
                          size="icon-sm" 
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleKeywordClick(kw.keyword);
                          }}
                        >
                          <ExternalLink className="w-4 h-4 text-gray-400 hover:text-indigo-600" />
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer with count */}
      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>
          Showing {filteredKeywords.length} of {data?.total || 0} keywords
        </span>
        <span className="text-xs">
          Last updated: {new Date().toLocaleTimeString()}
        </span>
      </div>
    </div>
  );
}

