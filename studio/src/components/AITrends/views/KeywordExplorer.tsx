import React, { useState, useEffect } from 'react';
import { KPICard } from '../components/KPICard';
import { TrendsDataTable, TrendData } from '../components/TrendsDataTable';
import { InsightsPanel } from '../components/InsightsPanel';
import { TrendingUp, Search, DollarSign, Users, Loader2, AlertCircle } from 'lucide-react';
import { useAITrends } from '../../../contexts/AITrendsContext';
import { useKeywordSearch } from '../../../hooks/useAmazonData';

export function KeywordExplorer() {
  const { currentKeyword, marketplace, searchTrigger } = useAITrends();
  const [selectedItem, setSelectedItem] = useState<TrendData | null>(null);

  // Fetch keyword data with the hook
  const {
    data: keywordData,
    isLoading,
    error,
    refetch
  } = useKeywordSearch(currentKeyword, marketplace, !!currentKeyword);

  // Refetch when search is triggered
  useEffect(() => {
    if (currentKeyword && searchTrigger > 0) {
      refetch();
    }
  }, [searchTrigger, currentKeyword, refetch]);

  // Transform API results to TrendData format
  const transformedData: TrendData[] = keywordData?.results.map((result, index) => ({
    id: result.asin,
    rank: result.rank,
    asin: result.asin,
    imageUrl: result.imageUrl || 'https://placehold.co/100',
    title: result.title,
    price: result.price,
    rating: result.rating,
    reviews: result.reviews,
    sales: result.estimatedSales,
    revenue: result.price * result.estimatedSales,
    isSimulated: keywordData?.metadata?.isSimulated,
  })) || [];

  // Format numbers for display
  const formatVolume = (volume: number) => {
    if (volume >= 1000000) return `${(volume / 1000000).toFixed(1)}M`;
    if (volume >= 1000) return `${(volume / 1000).toFixed(1)}K`;
    return volume.toString();
  };

  const formatRevenue = (revenue: number) => {
    if (revenue >= 1000000) return `$${(revenue / 1000000).toFixed(1)}M`;
    if (revenue >= 1000) return `$${(revenue / 1000).toFixed(1)}K`;
    return `$${revenue.toFixed(0)}`;
  };

  // Get last updated time
  const getLastUpdatedText = () => {
    if (!keywordData?.metadata?.lastUpdated) return 'N/A';
    const date = new Date(keywordData.metadata.lastUpdated);
    const now = new Date();
    const diffMinutes = Math.floor((now.getTime() - date.getTime()) / 60000);
    
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes} mins ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours} hours ago`;
    return `${Math.floor(diffHours / 24)} days ago`;
  };

  // Show empty state if no keyword
  if (!currentKeyword) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-12rem)] text-center">
        <Search className="w-16 h-16 text-gray-300 mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Start Your Keyword Research</h2>
        <p className="text-gray-500 max-w-md">
          Enter a keyword in the search bar above to analyze Amazon search results, 
          competition, and market insights.
        </p>
      </div>
    );
  }

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-12rem)] text-center">
        <Loader2 className="w-16 h-16 text-indigo-600 mb-4 animate-spin" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Analyzing "{currentKeyword}"</h2>
        <p className="text-gray-500 max-w-md">
          Scraping Amazon search results and calculating metrics...
        </p>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-12rem)] text-center">
        <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Error Loading Data</h2>
        <p className="text-gray-500 max-w-md mb-4">
          {error.message || 'Failed to fetch keyword data. Please try again.'}
        </p>
        <button
          onClick={() => refetch()}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 h-[calc(100vh-8rem)]">
      {/* Hero Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-orange-500 to-amber-600 rounded-xl">
              <Search className="w-7 h-7 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-bold text-gray-900">
                  Keyword: "{currentKeyword}"
                </h2>
                <span className="px-3 py-1 text-xs font-semibold bg-orange-100 text-orange-700 rounded-full border border-orange-300 flex items-center gap-1.5">
                  <span>📦</span>
                  Amazon
                </span>
                {keywordData?.metadata?.isSimulated && (
                  <span className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded-full font-medium">
                    Simulated Data
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-1">
                Discover high-potential keywords for Amazon products
              </p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-sm text-gray-500">Last updated: {getLastUpdatedText()}</span>
            {keywordData?.metadata && (
              <div className="text-xs text-gray-400 mt-1">
                {keywordData.metadata.runs} run{keywordData.metadata.runs !== 1 ? 's' : ''} • 
                {' '}Variance: {keywordData.metadata.variance?.toFixed(1)}%
              </div>
            )}
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard
            title="Search Volume"
            value={formatVolume(keywordData?.volume || 0)}
            trend={12.5}
            icon={Search}
            confidence={keywordData?.volumeConfidence}
          />
          <KPICard
            title="Avg. Price"
            value={`$${keywordData?.avgPrice?.toFixed(2) || '0.00'}`}
            trend={-2.3}
            icon={DollarSign}
            confidence={keywordData?.metadata?.isSimulated ? 0.4 : 0.85}
          />
          <KPICard
            title="Total Revenue"
            value={formatRevenue(keywordData?.totalRevenue || 0)}
            trend={8.1}
            icon={TrendingUp}
            confidence={keywordData?.metadata?.isSimulated ? 0.5 : 0.75}
          />
          <KPICard
            title="Competitors"
            value={keywordData?.competitorCount?.toLocaleString() || '0'}
            trend={0}
            trendLabel={
              keywordData?.difficulty
                ? `Difficulty: ${keywordData.difficulty}/100`
                : 'High saturation'
            }
            icon={Users}
            confidence={0.9}
          />
        </div>
      </div>

      {/* Results Split View */}
      <div className="flex-1 flex gap-6 min-h-0 overflow-hidden">
        <div className={`flex-1 transition-all duration-300 ${selectedItem ? 'w-[70%]' : 'w-full'}`}>
          {transformedData.length > 0 ? (
            <TrendsDataTable 
              data={transformedData} 
              onRowClick={setSelectedItem} 
              className="h-full"
              isSimulated={keywordData?.metadata?.isSimulated}
            />
          ) : (
            <div className="h-full bg-white border border-gray-200 rounded-lg flex items-center justify-center">
              <div className="text-center text-gray-500">
                <p>No results found for "{currentKeyword}"</p>
              </div>
            </div>
          )}
        </div>
        
        {selectedItem && (
          <div className="w-[30%] min-w-[320px] h-full animate-in slide-in-from-right-10 duration-200">
            <InsightsPanel 
              selectedItem={selectedItem}
              metadata={keywordData?.metadata}
              onClose={() => setSelectedItem(null)} 
              className="h-full rounded-lg border border-gray-200 shadow-lg"
            />
          </div>
        )}
      </div>
    </div>
  );
}

