import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '../../Card';
import { Database, HardDrive, Calendar, TrendingUp, Archive, BarChart3, Clock, FileText } from 'lucide-react';

interface StorageMetrics {
  activeTrendsSizeMB: number;
  archiveSizeMB: number;
  amazonDataSizeMB: number;
  totalSizeMB: number;
  trendCount: number;
  archivedTrendCount: number;
  oldestTrendDate: string | null;
  trackingStartDate: string | null;
  dataFiles: {
    name: string;
    sizeMB: number;
    lastModified: string;
    category: string;
  }[];
}

export function StorageAnalytics() {
  const [metrics, setMetrics] = useState<StorageMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMetrics();
  }, []);

  const fetchMetrics = () => {
    setLoading(true);
    fetch('/api/trends/storage-metrics')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setMetrics(data.metrics);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      month: 'long', 
      day: 'numeric',
      year: 'numeric' 
    });
  };

  const formatSize = (mb: number) => {
    if (mb < 1) return `${(mb * 1024).toFixed(1)} KB`;
    if (mb > 1024) return `${(mb / 1024).toFixed(2)} GB`;
    return `${mb.toFixed(2)} MB`;
  };

  const calculateDaysSince = (dateStr: string | null) => {
    if (!dateStr) return 0;
    const start = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - start.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-500">Loading storage metrics...</p>
        </div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Database className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">Unable to load storage metrics</p>
          <button 
            onClick={fetchMetrics}
            className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const daysSinceTracking = calculateDaysSince(metrics.trackingStartDate);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Storage Analytics</h2>
        <p className="text-gray-500">Track your trend data collection and storage usage</p>
      </div>

      {/* Main Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Storage */}
        <Card className="bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-200">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-indigo-500 rounded-xl shadow-lg">
                <HardDrive className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Total Storage</p>
                <h3 className="text-2xl font-bold text-gray-900">{formatSize(metrics.totalSizeMB)}</h3>
                <p className="text-xs text-gray-500 mt-1">
                  {metrics.dataFiles.length} file{metrics.dataFiles.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Active Trends */}
        <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-green-200">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-500 rounded-xl shadow-lg">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Active Trends</p>
                <h3 className="text-2xl font-bold text-gray-900">{metrics.trendCount.toLocaleString()}</h3>
                <p className="text-xs text-gray-500 mt-1">
                  {formatSize(metrics.activeTrendsSizeMB)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Archived Trends */}
        <Card className="bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-amber-500 rounded-xl shadow-lg">
                <Archive className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Archived Trends</p>
                <h3 className="text-2xl font-bold text-gray-900">{metrics.archivedTrendCount.toLocaleString()}</h3>
                <p className="text-xs text-gray-500 mt-1">
                  {formatSize(metrics.archiveSizeMB)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tracking Duration */}
        <Card className="bg-gradient-to-br from-blue-50 to-cyan-50 border-blue-200">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-500 rounded-xl shadow-lg">
                <Calendar className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">Tracking Since</p>
                <h3 className="text-2xl font-bold text-gray-900">{daysSinceTracking}</h3>
                <p className="text-xs text-gray-500 mt-1">
                  day{daysSinceTracking !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Information */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Storage Breakdown */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-5 h-5 text-indigo-600" />
              <h3 className="text-lg font-bold text-gray-900">Storage Breakdown</h3>
            </div>
            <div className="space-y-4">
              {/* Group files by category */}
              {['Multi-Platform Trends', 'Amazon Keywords'].map(category => {
                const categoryFiles = metrics.dataFiles.filter(f => f.category === category);
                if (categoryFiles.length === 0) return null;
                
                const categorySize = categoryFiles.reduce((sum, f) => sum + f.sizeMB, 0);
                
                return (
                  <div key={category} className="space-y-2">
                    <div className="flex items-center justify-between pb-2 border-b-2 border-gray-200">
                      <div className="flex items-center gap-2">
                        {category === 'Amazon Keywords' ? '📦' : '🌍'}
                        <span className="text-sm font-bold text-gray-900">{category}</span>
                      </div>
                      <span className="text-sm font-bold text-gray-900">{formatSize(categorySize)}</span>
                    </div>
                    {categoryFiles.map((file) => (
                      <div key={file.name} className="flex items-center justify-between pl-6 pb-3 border-b border-gray-100 last:border-0 last:pb-0">
                        <div className="flex items-center gap-3">
                          <FileText className="w-4 h-4 text-gray-400" />
                          <div>
                            <p className="text-sm font-medium text-gray-900">{file.name}</p>
                            <p className="text-xs text-gray-500">
                              {new Date(file.lastModified).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-gray-900">{formatSize(file.sizeMB)}</p>
                          <p className="text-xs text-gray-500">
                            {((file.sizeMB / metrics.totalSizeMB) * 100).toFixed(1)}%
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Timeline Information */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-5 h-5 text-indigo-600" />
              <h3 className="text-lg font-bold text-gray-900">Data Timeline</h3>
            </div>
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
                <Calendar className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-gray-900">Tracking Started</p>
                  <p className="text-lg font-bold text-blue-600">
                    {formatDate(metrics.trackingStartDate)}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {daysSinceTracking} days of continuous data collection
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg">
                <TrendingUp className="w-5 h-5 text-green-600 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-gray-900">Oldest Active Trend</p>
                  <p className="text-lg font-bold text-green-600">
                    {formatDate(metrics.oldestTrendDate)}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {calculateDaysSince(metrics.oldestTrendDate)} days old
                  </p>
                </div>
              </div>

              <div className="p-3 bg-purple-50 rounded-lg">
                <p className="text-sm font-semibold text-gray-900 mb-2">Collection Progress</p>
                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span>Data Maturity:</span>
                  <span className="font-bold text-purple-600">
                    {daysSinceTracking >= 365 ? 'Mature (1+ year)' :
                     daysSinceTracking >= 180 ? 'Maturing (6+ months)' :
                     daysSinceTracking >= 90 ? 'Developing (3+ months)' :
                     'Building'}
                  </span>
                </div>
                <div className="mt-2 h-2 bg-purple-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-purple-600 rounded-full transition-all"
                    style={{ width: `${Math.min((daysSinceTracking / 365) * 100, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {365 - daysSinceTracking > 0 
                    ? `${365 - daysSinceTracking} days until full year of data`
                    : 'Full year of data collected! 🎉'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Seasonal Pattern Readiness */}
      <Card className="bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-purple-500 rounded-xl shadow-lg">
              <BarChart3 className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-gray-900 mb-2">Seasonal Pattern Analysis Readiness</h3>
              <p className="text-sm text-gray-600 mb-4">
                Seasonal pattern detection requires at least 6-12 months of continuous data collection to identify recurring trends.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className={`p-3 rounded-lg ${daysSinceTracking >= 90 ? 'bg-green-100 border border-green-300' : 'bg-gray-100 border border-gray-300'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    {daysSinceTracking >= 90 ? '✅' : '⏳'}
                    <span className="text-sm font-semibold text-gray-900">Basic Patterns</span>
                  </div>
                  <p className="text-xs text-gray-600">
                    {daysSinceTracking >= 90 ? 'Ready for 3-month analysis' : `${90 - daysSinceTracking} days remaining`}
                  </p>
                </div>
                <div className={`p-3 rounded-lg ${daysSinceTracking >= 180 ? 'bg-green-100 border border-green-300' : 'bg-gray-100 border border-gray-300'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    {daysSinceTracking >= 180 ? '✅' : '⏳'}
                    <span className="text-sm font-semibold text-gray-900">Seasonal Trends</span>
                  </div>
                  <p className="text-xs text-gray-600">
                    {daysSinceTracking >= 180 ? 'Ready for 6-month analysis' : `${180 - daysSinceTracking} days remaining`}
                  </p>
                </div>
                <div className={`p-3 rounded-lg ${daysSinceTracking >= 365 ? 'bg-green-100 border border-green-300' : 'bg-gray-100 border border-gray-300'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    {daysSinceTracking >= 365 ? '✅' : '⏳'}
                    <span className="text-sm font-semibold text-gray-900">Full Year Patterns</span>
                  </div>
                  <p className="text-xs text-gray-600">
                    {daysSinceTracking >= 365 ? 'Ready for yearly analysis' : `${365 - daysSinceTracking} days remaining`}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

