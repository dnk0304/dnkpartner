import React, { useState, useEffect } from 'react';
import {
  Bell,
  Plus,
  Trash2,
  Clock,
  Tag,
  TrendingUp,
  Globe,
  Search,
  RefreshCw,
  CheckCircle2,
  Loader2,
  Eye,
  Calendar
} from 'lucide-react';
import { Button } from '../../Button';
import { cn } from '../../../lib/utils';
import { LiveIndicator } from '../components/LiveIndicator';

const POLL_INTERVAL_MS = 90000;
const POLL_STAGGER_MS = 25000;

interface MonitoredCategory {
  id: string;
  name: string;
  marketplace: string;
  addedAt: string;
  lastChecked: string;
  keywordCount: number;
}

const PRESET_CATEGORIES = [
  'Books & Coloring Books',
  'Toys & Games',
  'Home & Kitchen',
  'Electronics',
  'Beauty & Personal Care',
  'Sports & Outdoors',
  'Pet Supplies',
  'Arts, Crafts & Sewing',
  'Clothing & Accessories',
  'Health & Household',
];

const MARKETPLACES = ['US', 'UK', 'DE', 'FR', 'JP', 'CA'];

export function MonitoredCategories() {
  const [categories, setCategories] = useState<MonitoredCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [selectedMarketplace, setSelectedMarketplace] = useState('US');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch monitored categories. Polls in the background every 90s so the
  // "Last checked" + keywordCount stay current without flashing the list.
  const fetchCategories = async (isBackground = false) => {
    if (isBackground) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const response = await fetch('/api/amazon/trending/categories');
      if (!response.ok) {
        throw new Error('Failed to fetch categories');
      }

      const data = await response.json();
      setCategories(data.monitoredCategories || []);
      setLastUpdatedAt(new Date());
    } catch (err: any) {
      setError(err.message || 'Failed to load monitored categories');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchCategories();
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const startId = setTimeout(() => {
      intervalId = setInterval(() => fetchCategories(true), POLL_INTERVAL_MS);
    }, POLL_STAGGER_MS);
    return () => {
      clearTimeout(startId);
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  // Add new category
  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;

    setIsAddingCategory(true);
    try {
      const response = await fetch('/api/amazon/trending/categories/monitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCategoryName.trim(),
          marketplace: selectedMarketplace
        })
      });

      if (!response.ok) {
        throw new Error('Failed to add category');
      }

      setNewCategoryName('');
      setSelectedMarketplace('US');
      await fetchCategories();
    } catch (err: any) {
      alert(err.message || 'Failed to add category');
    } finally {
      setIsAddingCategory(false);
    }
  };

  // Delete category
  const handleDeleteCategory = async (id: string) => {
    if (!confirm('Are you sure you want to stop monitoring this category?')) return;

    setDeletingId(id);
    try {
      const response = await fetch(`/api/amazon/trending/categories/monitor/${id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error('Failed to delete category');
      }

      await fetchCategories();
    } catch (err: any) {
      alert(err.message || 'Failed to delete category');
    } finally {
      setDeletingId(null);
    }
  };

  // Format date
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString();
  };

  // Filter categories
  const filteredCategories = categories.filter(cat =>
    cat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    cat.marketplace.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-12rem)]">
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Loading Categories</h2>
        <p className="text-gray-500">Fetching your monitored categories...</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-12rem)]">
        <div className="text-red-500 mb-4">
          <Bell className="w-12 h-12" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Error Loading Categories</h2>
        <p className="text-gray-500 mb-4">{error}</p>
        <Button onClick={() => fetchCategories()} className="gap-2">
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
            <div className="absolute inset-0 bg-gradient-to-r from-orange-500 to-amber-500 rounded-xl blur-lg opacity-40" />
            <div className="relative p-3 bg-gradient-to-br from-orange-500 to-amber-600 rounded-xl shadow-lg">
              <Bell className="w-7 h-7 text-white" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Monitored Categories</h2>
              <span className="px-3 py-1 text-xs font-semibold bg-orange-100 text-orange-700 rounded-full border border-orange-300 flex items-center gap-1.5">
                <span>📦</span>
                Amazon
              </span>
            </div>
            <p className="text-sm text-gray-500">
              Track trends and get alerts for specific Amazon categories
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <LiveIndicator
            lastUpdatedAt={lastUpdatedAt}
            isRefreshing={isRefreshing}
            hasError={!!error}
            intervalMs={POLL_INTERVAL_MS}
          />
          <Button
            onClick={() => fetchCategories()}
            variant="outline"
            size="sm"
            className="gap-2 border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className={cn('w-4 h-4', isRefreshing && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl p-4 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-purple-100">Active Monitors</span>
            <Eye className="w-4 h-4 text-purple-200" />
          </div>
          <div className="text-3xl font-bold">{categories.length}</div>
          <p className="text-xs text-purple-200 mt-1">Categories tracked</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">Total Keywords</span>
            <Tag className="w-4 h-4 text-gray-400" />
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {categories.reduce((sum, cat) => sum + cat.keywordCount, 0)}
          </div>
          <p className="text-xs text-gray-400 mt-1">Being monitored</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">Marketplaces</span>
            <Globe className="w-4 h-4 text-gray-400" />
          </div>
          <div className="text-2xl font-bold text-gray-900">
            {new Set(categories.map(c => c.marketplace)).size}
          </div>
          <p className="text-xs text-gray-400 mt-1">Regions covered</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500">Last Check</span>
            <Clock className="w-4 h-4 text-gray-400" />
          </div>
          <div className="text-lg font-bold text-gray-900">
            {categories.length > 0 ? formatDate(categories[0].lastChecked) : 'Never'}
          </div>
          <p className="text-xs text-gray-400 mt-1">Most recent</p>
        </div>
      </div>

      {/* Add Category Form */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Plus className="w-5 h-5 text-purple-500" />
          Add New Category Monitor
        </h3>
        
        <div className="flex gap-3">
          <div className="flex-1">
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAddCategory()}
              placeholder="Enter category name or select preset..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              list="preset-categories"
            />
            <datalist id="preset-categories">
              {PRESET_CATEGORIES.map(cat => (
                <option key={cat} value={cat} />
              ))}
            </datalist>
          </div>
          
          <select
            value={selectedMarketplace}
            onChange={(e) => setSelectedMarketplace(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          >
            {MARKETPLACES.map(market => (
              <option key={market} value={market}>{market}</option>
            ))}
          </select>
          
          <Button 
            onClick={handleAddCategory}
            disabled={!newCategoryName.trim() || isAddingCategory}
            className="gap-2"
          >
            {isAddingCategory ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Adding...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Add Monitor
              </>
            )}
          </Button>
        </div>
        
        {/* Preset Category Pills */}
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="text-xs text-gray-500 mr-2">Quick add:</span>
          {PRESET_CATEGORIES.slice(0, 5).map(cat => (
            <button
              key={cat}
              onClick={() => setNewCategoryName(cat)}
              className="px-3 py-1 text-xs bg-purple-50 text-purple-700 rounded-full hover:bg-purple-100 transition-colors"
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Search */}
      {categories.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search categories..."
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>
      )}

      {/* Categories Grid */}
      {filteredCategories.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center bg-white rounded-xl border border-gray-200">
          <Bell className="w-16 h-16 text-gray-300 mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            {searchQuery ? 'No Categories Found' : 'No Categories Monitored'}
          </h3>
          <p className="text-gray-500 max-w-md mb-6">
            {searchQuery 
              ? 'Try adjusting your search query'
              : 'Start monitoring Amazon categories to track trending keywords and get alerts when new opportunities emerge.'
            }
          </p>
          {!searchQuery && (
            <Button onClick={() => setNewCategoryName(PRESET_CATEGORIES[0])} className="gap-2">
              <Plus className="w-4 h-4" />
              Add Your First Category
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-auto">
          {filteredCategories.map((category) => (
            <div
              key={category.id}
              className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-all group"
            >
              {/* Category Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Tag className="w-4 h-4 text-purple-500 shrink-0" />
                    <h3 className="font-bold text-gray-900 truncate">{category.name}</h3>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Globe className="w-3 h-3" />
                    <span>{category.marketplace}</span>
                    <span className="text-gray-300">•</span>
                    <Calendar className="w-3 h-3" />
                    <span>{formatDate(category.addedAt)}</span>
                  </div>
                </div>
                
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDeleteCategory(category.id)}
                  disabled={deletingId === category.id}
                  className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  {deletingId === category.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </Button>
              </div>

              {/* Stats */}
              <div className="space-y-2 mb-4">
                <div className="flex items-center justify-between p-2 bg-purple-50 rounded-lg">
                  <span className="text-sm text-gray-600 flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-purple-600" />
                    Keywords Tracked
                  </span>
                  <span className="text-sm font-bold text-purple-700">
                    {category.keywordCount}
                  </span>
                </div>
                
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    Last Check
                  </span>
                  <span className="text-gray-900 font-medium">
                    {formatDate(category.lastChecked)}
                  </span>
                </div>
              </div>

              {/* Status Badge */}
              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center gap-2 px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                  <span className="text-xs font-medium text-green-700">Active</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  <Eye className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info Footer */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-blue-100 rounded-lg shrink-0">
            <Bell className="w-5 h-5 text-blue-600" />
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-blue-900 mb-1">About Category Monitoring</h4>
            <p className="text-sm text-blue-700">
              Monitor specific Amazon categories to track trending keywords, identify emerging opportunities, 
              and get alerts when new high-potential products appear. Keywords are automatically tracked and 
              updated based on search volume and competition data.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

