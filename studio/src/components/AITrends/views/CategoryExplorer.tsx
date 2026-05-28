import React, { useState, useMemo, useEffect } from 'react';
import { 
  Package,
  Palette,
  Home,
  Sparkles,
  MonitorPlay,
  BookOpen,
  Shirt,
  Heart,
  Coffee,
  Rocket,
  TrendingUp,
  TrendingDown,
  Search,
  ArrowUpRight,
  Loader2,
  AlertCircle,
  RefreshCw,
  ChevronRight,
  BarChart3,
  Zap,
  Activity
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import { Button } from '../../Button';
import type { ExplodingTrend, TrendCategory } from '../../../types/AITrends';

// Category icon mapping
const CATEGORY_ICONS: Record<string, React.ElementType> = {
  books: BookOpen,
  toys: Package,
  home: Home,
  beauty: Sparkles,
  electronics: MonitorPlay,
  art: Palette,
  fashion: Shirt,
  health: Heart,
  food: Coffee,
  other: BarChart3,
};

// Category color schemes
const CATEGORY_COLORS: Record<string, string> = {
  books: 'from-blue-500 to-indigo-600',
  toys: 'from-pink-500 to-rose-600',
  home: 'from-amber-500 to-orange-600',
  beauty: 'from-purple-500 to-pink-600',
  electronics: 'from-cyan-500 to-blue-600',
  art: 'from-fuchsia-500 to-purple-600',
  fashion: 'from-rose-500 to-pink-600',
  health: 'from-green-500 to-emerald-600',
  food: 'from-orange-500 to-amber-600',
  other: 'from-gray-500 to-slate-600',
};

export function CategoryExplorer() {
  // Data state
  const [categories, setCategories] = useState<TrendCategory[]>([]);
  const [trends, setTrends] = useState<Record<string, ExplodingTrend[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [sortBy, setSortBy] = useState<'explosionScore' | 'growthRate' | 'volume'>('explosionScore');

  // Fetch data
  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const [categoriesRes, trendsRes] = await Promise.all([
        fetch('/api/trends/categories'),
        fetch('/api/trends/exploding?limit=1000'),
      ]);

      if (!categoriesRes.ok || !trendsRes.ok) {
        throw new Error('Failed to fetch category data');
      }

      const categoriesData = await categoriesRes.json();
      const trendsData = await trendsRes.json();

      setCategories(categoriesData.categories || []);
      
      // Group trends by category
      const groupedTrends: Record<string, ExplodingTrend[]> = {};
      (trendsData.trends || []).forEach((trend: ExplodingTrend) => {
        if (!groupedTrends[trend.category]) {
          groupedTrends[trend.category] = [];
        }
        groupedTrends[trend.category].push(trend);
      });
      
      setTrends(groupedTrends);
    } catch (err: any) {
      setError(err.message || 'Failed to load categories');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Get category icon
  const getCategoryIcon = (categoryId: string): React.ElementType => {
    return CATEGORY_ICONS[categoryId.toLowerCase()] || BarChart3;
  };

  // Get category color
  const getCategoryColor = (categoryId: string): string => {
    return CATEGORY_COLORS[categoryId.toLowerCase()] || CATEGORY_COLORS.other;
  };

  // Filter and sort trends for selected category
  const filteredCategoryTrends = useMemo(() => {
    if (!selectedCategory) return [];
    
    let categoryTrends = trends[selectedCategory] || [];
    
    // Apply search filter
    if (searchFilter) {
      const search = searchFilter.toLowerCase();
      categoryTrends = categoryTrends.filter(t => 
        t.topic.toLowerCase().includes(search) ||
        (t.relatedTopics || []).some(rt => rt.toLowerCase().includes(search))
      );
    }
    
    // Sort
    categoryTrends = [...categoryTrends].sort((a, b) => {
      switch (sortBy) {
        case 'explosionScore':
          return (b.explosionScore ?? 0) - (a.explosionScore ?? 0);
        case 'growthRate':
          return (b.growthRate ?? 0) - (a.growthRate ?? 0);
        case 'volume':
          return (b.volume ?? 0) - (a.volume ?? 0);
        default:
          return (b.explosionScore ?? 0) - (a.explosionScore ?? 0);
      }
    });
    
    return categoryTrends;
  }, [selectedCategory, trends, searchFilter, sortBy]);

  // Format numbers
  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  // Get explosion score badge color
  const getScoreBadgeColor = (score: number) => {
    if (score >= 70) return 'bg-gradient-to-r from-orange-500 to-red-500 text-white';
    if (score >= 50) return 'bg-gradient-to-r from-amber-500 to-orange-500 text-white';
    if (score >= 30) return 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white';
    return 'bg-gray-100 text-gray-600';
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

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-12rem)] text-center">
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full blur-xl opacity-30 animate-pulse" />
          <Palette className="w-16 h-16 text-purple-500 mb-4 relative animate-bounce" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Loading Categories</h2>
        <p className="text-gray-500 max-w-md">
          Organizing trends by category...
        </p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-12rem)] text-center">
        <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Error Loading Categories</h2>
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
              <Palette className="w-7 h-7 text-white" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Category Explorer</h2>
              <span className="px-3 py-1 text-xs font-semibold bg-emerald-100 text-emerald-700 rounded-full border border-emerald-300 flex items-center gap-1.5">
                <span>🌍</span>
                Multi-Platform
              </span>
            </div>
            <p className="text-sm text-gray-500">
              Browse trends across all platforms organized by category
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {selectedCategory && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setSelectedCategory(null)}
              className="gap-2"
            >
              View All Categories
            </Button>
          )}
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

      {/* Categories Grid View */}
      {!selectedCategory && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {categories.map((category) => {
            const Icon = getCategoryIcon(category.id);
            const colorClass = getCategoryColor(category.id);
            const categoryTrends = trends[category.id] || [];
            const topTrends = categoryTrends
              .sort((a, b) => (b.explosionScore ?? 0) - (a.explosionScore ?? 0))
              .slice(0, 3);
            const explodingCount = categoryTrends.filter(t => (t.explosionScore ?? 0) >= 70).length;
            
            return (
              <button
                key={category.id}
                onClick={() => setSelectedCategory(category.id)}
                className="group bg-white rounded-xl border border-gray-200 p-6 hover:shadow-xl hover:border-purple-200 transition-all duration-300 text-left"
              >
                {/* Category Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className={cn(
                    "p-3 rounded-xl bg-gradient-to-br shadow-lg group-hover:scale-110 transition-transform duration-300",
                    colorClass
                  )}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {explodingCount > 0 && (
                      <div className="flex items-center gap-1 bg-gradient-to-r from-orange-500 to-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                        <Rocket className="w-3 h-3" />
                        {explodingCount}
                      </div>
                    )}
                    <span className="text-xs text-gray-400">
                      {category.trendCount} trends
                    </span>
                  </div>
                </div>

                {/* Category Name */}
                <h3 className="text-lg font-bold text-gray-900 mb-1 group-hover:text-purple-600 transition-colors">
                  {category.name}
                </h3>
                <p className="text-sm text-gray-500 mb-4 line-clamp-2">
                  {category.description}
                </p>

                {/* Top Trends Preview */}
                {topTrends.length > 0 && (
                  <div className="space-y-2 mb-4">
                    {topTrends.map((trend, index) => (
                      <div 
                        key={trend.id}
                        className="flex items-center justify-between text-sm"
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="text-xs text-gray-400">#{index + 1}</span>
                          <span className="text-gray-700 font-medium truncate">
                            {trend.topic}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-xs font-bold text-green-600 ml-2 shrink-0">
                          <TrendingUp className="w-3 h-3" />
                          +{(trend.growthRate ?? 0).toFixed(0)}%
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* View Category Button */}
                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <span className="text-sm font-medium text-purple-600 group-hover:text-purple-700">
                    Explore {category.name}
                  </span>
                  <ChevronRight className="w-4 h-4 text-purple-600 group-hover:translate-x-1 transition-transform" />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Selected Category Detail View */}
      {selectedCategory && (
        <div className="flex flex-col gap-4 flex-1">
          {/* Category Info Banner */}
          {(() => {
            const category = categories.find(c => c.id === selectedCategory);
            if (!category) return null;
            
            const Icon = getCategoryIcon(category.id);
            const colorClass = getCategoryColor(category.id);
            const categoryTrends = trends[selectedCategory] || [];
            const explodingCount = categoryTrends.filter(t => (t.explosionScore ?? 0) >= 70).length;
            const emergingCount = categoryTrends.filter(t => t.status === 'emerging').length;
            const avgGrowth = categoryTrends.length > 0
              ? categoryTrends.reduce((sum, t) => sum + (t.growthRate ?? 0), 0) / categoryTrends.length
              : 0;
            
            return (
              <div className={cn(
                "bg-gradient-to-br p-6 rounded-xl shadow-lg text-white",
                colorClass
              )}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-4 bg-white/20 backdrop-blur-sm rounded-xl">
                      <Icon className="w-8 h-8" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold mb-1">{category.name}</h3>
                      <p className="text-white/80">{category.description}</p>
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-4 gap-4 mt-6">
                  <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3">
                    <div className="text-white/70 text-xs mb-1">Total Trends</div>
                    <div className="text-2xl font-bold">{category.trendCount}</div>
                  </div>
                  <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3">
                    <div className="text-white/70 text-xs mb-1">Exploding</div>
                    <div className="text-2xl font-bold">{explodingCount}</div>
                  </div>
                  <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3">
                    <div className="text-white/70 text-xs mb-1">Emerging</div>
                    <div className="text-2xl font-bold">{emergingCount}</div>
                  </div>
                  <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3">
                    <div className="text-white/70 text-xs mb-1">Avg Growth</div>
                    <div className="text-2xl font-bold">+{avgGrowth.toFixed(0)}%</div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Filters for category trends */}
          <div className="flex items-center gap-4 bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Search in this category..."
                className="w-full h-9 pl-10 pr-4 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 focus:bg-white transition-all outline-none"
              />
            </div>

            {/* Sort */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Sort by:</span>
              <div className="flex items-center gap-1 bg-gray-50 p-1 rounded-lg border border-gray-200">
                {(['explosionScore', 'growthRate', 'volume'] as const).map(sort => (
                  <button
                    key={sort}
                    onClick={() => setSortBy(sort)}
                    className={cn(
                      "px-3 py-1 text-xs font-medium rounded-md transition-all capitalize",
                      sortBy === sort
                        ? "bg-white text-purple-600 shadow-sm border border-gray-100"
                        : "text-gray-500 hover:text-gray-900"
                    )}
                  >
                    {sort === 'explosionScore' ? 'Score' : sort === 'growthRate' ? 'Growth' : 'Volume'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Trends List */}
          <div className="flex-1 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-auto h-full">
              {filteredCategoryTrends.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-12">
                  <Palette className="w-16 h-16 text-gray-300 mb-4" />
                  <p className="text-gray-500 font-medium mb-1">No trends found</p>
                  <p className="text-sm text-gray-400">
                    {searchFilter ? 'Try adjusting your search' : 'No trends in this category yet'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
                  {filteredCategoryTrends.map((trend) => {
                    const isPositiveGrowth = (trend.growthRate ?? 0) > 0;
                    const explosionScore = trend.explosionScore ?? 0;
                    const growthRate = trend.growthRate ?? 0;
                    const volume = trend.volume ?? 0;
                    
                    return (
                      <div
                        key={trend.id}
                        className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-lg hover:border-purple-200 transition-all group"
                      >
                        {/* Trend Header */}
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              {explosionScore >= 70 && (
                                <span className="flex items-center justify-center w-4 h-4 bg-gradient-to-br from-orange-500 to-red-500 rounded-full animate-pulse">
                                  <Rocket className="w-2.5 h-2.5 text-white" />
                                </span>
                              )}
                              <h4 className="font-bold text-gray-900 truncate group-hover:text-purple-600 transition-colors">
                                {trend.topic}
                              </h4>
                            </div>
                            {(trend.relatedTopics || []).length > 0 && (
                              <p className="text-xs text-gray-400 line-clamp-1">
                                {(trend.relatedTopics || []).slice(0, 2).join(', ')}
                              </p>
                            )}
                          </div>
                          <div className={cn(
                            "shrink-0 ml-2 px-2 py-1 rounded-full text-xs font-bold",
                            getScoreBadgeColor(explosionScore)
                          )}>
                            {explosionScore.toFixed(0)}
                          </div>
                        </div>

                        {/* Metrics */}
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <div className="bg-gray-50 rounded-lg p-2">
                            <div className="text-xs text-gray-500 mb-0.5">Growth</div>
                            <div className={cn(
                              "flex items-center gap-1 text-sm font-bold",
                              isPositiveGrowth 
                                ? growthRate > 100
                                  ? "text-green-600 drop-shadow-[0_0_8px_rgba(34,197,94,0.6)]"
                                  : "text-green-600"
                                : "text-gray-600"
                            )}>
                              {isPositiveGrowth ? (
                                <TrendingUp className="w-3 h-3" />
                              ) : (
                                <TrendingDown className="w-3 h-3" />
                              )}
                              {isPositiveGrowth ? '+' : ''}{growthRate.toFixed(0)}%
                            </div>
                          </div>
                          <div className="bg-gray-50 rounded-lg p-2">
                            <div className="text-xs text-gray-500 mb-0.5">Volume</div>
                            <div className="text-sm font-bold text-gray-900">
                              {formatNumber(volume)}
                            </div>
                          </div>
                        </div>

                        {/* Sources */}
                        <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {(trend.sources || []).filter(s => s.name).map((source, i) => (
                              <span 
                                key={i} 
                                className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-full cursor-help transition-colors" 
                                title={`${source.name}: ${formatNumber(source.volume || 0)} volume`}
                              >
                                <span className="text-sm">{getSourceIcon(source.name || '')}</span>
                                <span className="capitalize">{source.name}</span>
                              </span>
                            ))}
                          </div>
                          <span className={cn(
                            "text-xs font-medium px-2 py-0.5 rounded-full capitalize shrink-0",
                            trend.status === 'exploding' && "bg-red-50 text-red-600",
                            trend.status === 'emerging' && "bg-amber-50 text-amber-600",
                            trend.status === 'peaked' && "bg-purple-50 text-purple-600",
                            trend.status === 'stable' && "bg-blue-50 text-blue-600",
                            trend.status === 'declining' && "bg-gray-50 text-gray-600"
                          )}>
                            {trend.status}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="text-sm text-gray-500">
            Showing {filteredCategoryTrends.length} trends in this category
          </div>
        </div>
      )}
    </div>
  );
}

