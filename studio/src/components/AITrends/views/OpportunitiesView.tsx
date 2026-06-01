import React, { useState, useMemo } from 'react';
import { 
  Sparkles, 
  TrendingUp, 
  TrendingDown, 
  Search, 
  Target,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Flame,
  Zap,
  Trophy,
  ChevronDown,
  Star
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import { Button } from '../../Button';
import { LiveIndicator } from '../components/LiveIndicator';
import { useAITrends } from '../../../contexts/AITrendsContext';
import { useOpportunities, TrendingKeyword } from '../../../hooks/useTrendingData';
import type { Marketplace } from '../../../types/AITrends';

const POLL_INTERVAL_MS = 60000;

export function OpportunitiesView() {
  const { marketplace, setCurrentKeyword, triggerSearch } = useAITrends();
  
  // Local state
  const [searchFilter, setSearchFilter] = useState('');
  const [sortBy, setSortBy] = useState<'opportunityScore' | 'volumeChange7d' | 'searchVolume' | 'competitionScore'>('opportunityScore');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedMarketplace, setSelectedMarketplace] = useState<Marketplace | undefined>(marketplace);

  // Fetch opportunities. Auto-refreshes on POLL_INTERVAL_MS — surface freshness
  // via the LiveIndicator using react-query's dataUpdatedAt / isFetching.
  const { data, isLoading, isFetching, dataUpdatedAt, error, refetch } = useOpportunities(
    selectedMarketplace,
    true,
    POLL_INTERVAL_MS
  );
  const lastUpdatedAt = dataUpdatedAt ? new Date(dataUpdatedAt) : null;

  // Filter and sort opportunities
  const filteredOpportunities = useMemo(() => {
    if (!data?.opportunities) return [];

    let filtered = data.opportunities;

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
  }, [data?.opportunities, searchFilter, sortBy, sortOrder]);

  // Handle keyword click - navigate to explorer
  const handleKeywordClick = (keyword: string) => {
    setCurrentKeyword(keyword);
    triggerSearch();
  };

  // Get competition badge color
  const getCompetitionBadge = (score: number) => {
    if (score < 30) return { label: 'Easy', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
    if (score < 60) return { label: 'Medium', color: 'bg-amber-100 text-amber-700 border-amber-200' };
    return { label: 'Hard', color: 'bg-rose-100 text-rose-700 border-rose-200' };
  };

  // Get opportunity tier
  const getOpportunityTier = (score: number) => {
    if (score >= 15) return { tier: 'S', color: 'from-amber-400 to-orange-500', textColor: 'text-amber-600' };
    if (score >= 10) return { tier: 'A', color: 'from-emerald-400 to-green-500', textColor: 'text-emerald-600' };
    if (score >= 5) return { tier: 'B', color: 'from-blue-400 to-indigo-500', textColor: 'text-blue-600' };
    return { tier: 'C', color: 'from-gray-400 to-gray-500', textColor: 'text-gray-600' };
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

  // Calculate stats
  const stats = useMemo(() => {
    if (!data?.opportunities?.length) {
      return { total: 0, avgScore: 0, topCategory: 'N/A', highTier: 0 };
    }
    
    const opportunities = data.opportunities;
    const avgScore = opportunities.reduce((sum, o) => sum + o.opportunityScore, 0) / opportunities.length;
    
    // Find most common category
    const categoryCount: Record<string, number> = {};
    opportunities.forEach(o => {
      categoryCount[o.category] = (categoryCount[o.category] || 0) + 1;
    });
    const topCategory = Object.entries(categoryCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';
    
    // Count high tier (S or A)
    const highTier = opportunities.filter(o => o.opportunityScore >= 10).length;
    
    return { total: opportunities.length, avgScore, topCategory, highTier };
  }, [data?.opportunities]);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-12rem)] text-center">
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-amber-500/20 to-orange-500/20 rounded-full blur-xl animate-pulse" />
          <Sparkles className="relative w-16 h-16 text-amber-500 mb-4 animate-pulse" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Discovering Opportunities</h2>
        <p className="text-gray-500 max-w-md">
          Analyzing market trends to find the best opportunities for you...
        </p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-12rem)] text-center">
        <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Error Loading Opportunities</h2>
        <p className="text-gray-500 max-w-md mb-4">
          {error.message || 'Failed to fetch opportunities. Please try again.'}
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
            <div className="p-2 bg-gradient-to-br from-amber-400 via-orange-500 to-red-500 rounded-lg shadow-lg shadow-orange-500/20">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-bold text-gray-900">Emerging Opportunities</h2>
                <span className="px-3 py-1 text-xs font-semibold bg-orange-100 text-orange-700 rounded-full border border-orange-300 flex items-center gap-1.5">
                  <span>📦</span>
                  Amazon
                </span>
              </div>
              <p className="text-sm text-gray-500">
                High-growth Amazon keywords with low competition — act fast!
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Marketplace Filter */}
          <div className="relative">
            <select
              value={selectedMarketplace || ''}
              onChange={(e) => setSelectedMarketplace(e.target.value as Marketplace || undefined)}
              className="h-9 pl-3 pr-8 bg-gray-50 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 appearance-none cursor-pointer hover:bg-gray-100 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none"
            >
              <option value="">All Markets</option>
              <option value="US">🇺🇸 US</option>
              <option value="UK">🇬🇧 UK</option>
              <option value="DE">🇩🇪 DE</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
          
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
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl border border-amber-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-amber-700 font-medium">Total Opportunities</span>
            <Target className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-3xl font-bold text-amber-900">{stats.total}</div>
          <p className="text-xs text-amber-600 mt-1">Ready to explore</p>
        </div>
        
        <div className="bg-gradient-to-br from-emerald-50 to-green-50 rounded-xl border border-emerald-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-emerald-700 font-medium">High Tier (S/A)</span>
            <Trophy className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-3xl font-bold text-emerald-900">{stats.highTier}</div>
          <p className="text-xs text-emerald-600 mt-1">Premium opportunities</p>
        </div>
        
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-blue-700 font-medium">Avg. Score</span>
            <BarChart3 className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-3xl font-bold text-blue-900">{stats.avgScore.toFixed(1)}</div>
          <p className="text-xs text-blue-600 mt-1">Opportunity score</p>
        </div>
        
        <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl border border-purple-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-purple-700 font-medium">Top Category</span>
            <Star className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-lg font-bold text-purple-900 truncate">{stats.topCategory}</div>
          <p className="text-xs text-purple-600 mt-1">Most opportunities</p>
        </div>
      </div>

      {/* Search Filter */}
      <div className="flex items-center gap-4 bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder="Search opportunities..."
            className="w-full h-9 pl-10 pr-4 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 focus:bg-white transition-all outline-none"
          />
        </div>
        
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Zap className="w-4 h-4 text-amber-500" />
          <span>Showing emerging keywords with high growth & low competition</span>
        </div>
      </div>

      {/* Opportunities Table */}
      <div className="flex-1 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-auto h-full">
          <table className="w-full text-left text-sm">
            <thead className="bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-200 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 font-medium text-amber-700 w-16 text-center">Tier</th>
                <th className="px-4 py-3 font-medium text-amber-700">Keyword</th>
                <th className="px-4 py-3 font-medium text-amber-700">Category</th>
                <th 
                  className="px-4 py-3 font-medium text-amber-700 text-right cursor-pointer hover:text-amber-900 select-none"
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
                  className="px-4 py-3 font-medium text-amber-700 text-right cursor-pointer hover:text-amber-900 select-none"
                  onClick={() => handleSort('volumeChange7d')}
                >
                  <div className="flex items-center justify-end gap-1">
                    7d Growth
                    {sortBy === 'volumeChange7d' && (
                      sortOrder === 'desc' ? <ArrowDownRight className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />
                    )}
                  </div>
                </th>
                <th 
                  className="px-4 py-3 font-medium text-amber-700 text-right cursor-pointer hover:text-amber-900 select-none"
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
                  className="px-4 py-3 font-medium text-amber-700 text-right cursor-pointer hover:text-amber-900 select-none"
                  onClick={() => handleSort('opportunityScore')}
                >
                  <div className="flex items-center justify-end gap-1">
                    Score
                    {sortBy === 'opportunityScore' && (
                      sortOrder === 'desc' ? <ArrowDownRight className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />
                    )}
                  </div>
                </th>
                <th className="px-4 py-3 font-medium text-amber-700 w-16"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredOpportunities.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-500">
                    <Sparkles className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p className="font-medium">No opportunities found</p>
                    <p className="text-sm">Try adjusting your filters or check back later</p>
                  </td>
                </tr>
              ) : (
                filteredOpportunities.map((kw, index) => {
                  const competitionBadge = getCompetitionBadge(kw.competitionScore);
                  const opportunityTier = getOpportunityTier(kw.opportunityScore);
                  const isPositiveGrowth = kw.volumeChange7d > 0;
                  
                  return (
                    <tr 
                      key={`${kw.keyword}-${kw.marketplace}`}
                      className="hover:bg-amber-50/50 transition-colors cursor-pointer group"
                      onClick={() => handleKeywordClick(kw.keyword)}
                    >
                      <td className="px-4 py-3 text-center">
                        <div className={cn(
                          "inline-flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br font-bold text-white shadow-sm",
                          opportunityTier.color
                        )}>
                          {opportunityTier.tier}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Flame className="w-4 h-4 text-orange-500" />
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
                            ? "text-emerald-700 bg-emerald-50" 
                            : "text-rose-700 bg-rose-50"
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
                          {competitionBadge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className={cn(
                          "inline-flex items-center gap-1 font-bold text-lg",
                          opportunityTier.textColor
                        )}>
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
                          <ExternalLink className="w-4 h-4 text-gray-400 hover:text-amber-600" />
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

      {/* Footer */}
      <div className="flex items-center justify-between text-sm text-gray-500">
        <span className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-500" />
          Showing {filteredOpportunities.length} of {data?.total || 0} opportunities
        </span>
        <span className="text-xs">
          Last updated: {new Date().toLocaleTimeString()}
        </span>
      </div>
    </div>
  );
}

