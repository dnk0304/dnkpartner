import React, { useState } from 'react';
import { X, TrendingUp, Target, Lightbulb, BarChart3, Database, Activity, CheckCircle, AlertTriangle, ExternalLink, Sparkles } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { Button } from '../../Button';
import { TrendData } from './TrendsDataTable';
import { KeywordMetadata } from '../../../types/AITrends';
import { AdvancedAnalysisModal } from './AdvancedAnalysisModal';

interface InsightsPanelProps {
  selectedItem: TrendData | null;
  metadata?: KeywordMetadata;
  onClose: () => void;
  className?: string;
}

export function InsightsPanel({ selectedItem, metadata, onClose, className }: InsightsPanelProps) {
  const [showAdvancedModal, setShowAdvancedModal] = useState(false);

  if (!selectedItem) {
    return (
      <div className={cn("h-full flex items-center justify-center p-8 text-center bg-white border-l border-gray-200", className)}>
        <div className="text-gray-400">
          <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p className="text-sm">Select a product to view detailed AI insights.</p>
        </div>
      </div>
    );
  }

  // Calculate confidence for this specific product
  const calculateProductConfidence = () => {
    // Base confidence on whether data is simulated
    if (metadata?.isSimulated) return 0.45;
    
    // Higher confidence for products with more reviews
    if (selectedItem.reviews > 1000) return 0.9;
    if (selectedItem.reviews > 500) return 0.8;
    if (selectedItem.reviews > 100) return 0.7;
    return 0.6;
  };

  const productConfidence = calculateProductConfidence();

  // Format last updated
  const formatLastUpdated = () => {
    if (!metadata?.lastUpdated) return 'Unknown';
    const date = new Date(metadata.lastUpdated);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Calculate relevance score (mock calculation based on rank and reviews)
  const calculateRelevance = () => {
    const rankScore = Math.max(0, 100 - selectedItem.rank * 2);
    const reviewScore = Math.min(20, selectedItem.reviews / 100);
    return Math.round(rankScore + reviewScore);
  };

  // Calculate conversion rate estimate
  const calculateConversionRate = () => {
    const baseRate = 10;
    const ratingBonus = (selectedItem.rating - 4) * 5;
    const priceMultiplier = selectedItem.price < 50 ? 1.2 : selectedItem.price > 100 ? 0.8 : 1;
    return ((baseRate + ratingBonus) * priceMultiplier).toFixed(1);
  };

  return (
    <div className={cn("flex flex-col h-full bg-white border-l border-gray-200 shadow-xl", className)}>
      <div className="flex items-center justify-between p-4 border-b border-gray-100">
        <h3 className="font-semibold text-gray-900">AI Analysis</h3>
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Product Header */}
        <div className="flex gap-4">
          <div className="w-16 h-16 bg-gray-100 rounded-md border border-gray-200 overflow-hidden flex-shrink-0">
            <img src={selectedItem.imageUrl} alt={selectedItem.asin} className="w-full h-full object-cover" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <div className="text-xs font-mono text-gray-500">{selectedItem.asin}</div>
              {metadata?.isSimulated ? (
                <div 
                  className="inline-flex items-center gap-1 text-xs text-gray-400 cursor-not-allowed"
                  title="Product link unavailable for simulated data"
                >
                  <ExternalLink className="w-3 h-3 opacity-50" />
                  <span className="opacity-50">Demo Data</span>
                </div>
              ) : (
                <a
                  href={`https://www.amazon.com/dp/${selectedItem.asin}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 hover:underline transition-colors"
                  title="View on Amazon"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>View</span>
                </a>
              )}
            </div>
            <h4 className="text-sm font-medium text-gray-900 line-clamp-2 leading-snug">
              {selectedItem.title}
            </h4>
          </div>
        </div>

        {/* Data Quality Metadata */}
        {metadata && (
          <div className="bg-gradient-to-br from-indigo-50 to-purple-50 p-4 rounded-lg border border-indigo-100">
            <div className="flex items-center gap-2 mb-3">
              <Database className="w-4 h-4 text-indigo-600" />
              <h4 className="font-medium text-indigo-900 text-sm">Data Quality</h4>
            </div>
            
            <div className="space-y-3">
              {/* Data Source */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-indigo-700">Data Source</span>
                <div className="flex items-center gap-1.5">
                  {metadata.isSimulated ? (
                    <>
                      <AlertTriangle className="w-3 h-3 text-amber-600" />
                      <span className="text-xs font-medium text-amber-700">Simulated</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-3 h-3 text-green-600" />
                      <span className="text-xs font-medium text-green-700">Real Scrape</span>
                    </>
                  )}
                </div>
              </div>

              {/* Scrape Runs */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-indigo-700">Scrape Runs</span>
                <span className="text-xs font-mono font-medium text-indigo-900">
                  {metadata.runs} run{metadata.runs !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Data Variance */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-indigo-700">Variance</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-medium text-indigo-900">
                    {metadata.variance?.toFixed(1)}%
                  </span>
                  {metadata.variance < 5 && (
                    <span className="text-xs text-green-600">(Low)</span>
                  )}
                  {metadata.variance >= 5 && metadata.variance < 15 && (
                    <span className="text-xs text-yellow-600">(Medium)</span>
                  )}
                  {metadata.variance >= 15 && (
                    <span className="text-xs text-red-600">(High)</span>
                  )}
                </div>
              </div>

              {/* Last Updated */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-indigo-700">Last Updated</span>
                <span className="text-xs font-medium text-indigo-900">
                  {formatLastUpdated()}
                </span>
              </div>

              {/* Confidence Bar */}
              <div className="pt-2 border-t border-indigo-200">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-indigo-700">Confidence Score</span>
                  <span className="text-xs font-bold text-indigo-900">
                    {Math.round(productConfidence * 100)}%
                  </span>
                </div>
                <div className="h-2 bg-indigo-100 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full transition-all duration-300",
                      productConfidence >= 0.7 ? "bg-green-500" :
                      productConfidence >= 0.5 ? "bg-yellow-500" :
                      "bg-orange-500"
                    )}
                    style={{ width: `${productConfidence * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* AI Scores */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-100">
            <div className="flex items-center gap-2 text-indigo-700 mb-1">
              <Target className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-wider">Relevance</span>
            </div>
            <div className="text-2xl font-bold text-indigo-900">{calculateRelevance()}/100</div>
          </div>
          <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-100">
            <div className="flex items-center gap-2 text-emerald-700 mb-1">
              <Activity className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-wider">Conv. Rate</span>
            </div>
            <div className="text-2xl font-bold text-emerald-900">~{calculateConversionRate()}%</div>
          </div>
        </div>

        {/* Why this ranks */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="w-4 h-4 text-amber-500" />
            <h4 className="font-medium text-gray-900">Why this ranks</h4>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-100 text-sm text-gray-600 space-y-2">
            <p>
              • <strong className="text-gray-800">Ranking Position:</strong> Appears at #{selectedItem.rank}, 
              {selectedItem.rank <= 3 ? ' a premium position with high visibility.' : ' capturing solid organic traffic.'}
            </p>
            <p>
              • <strong className="text-gray-800">Price Point:</strong> At ${selectedItem.price.toFixed(2)}, 
              {selectedItem.price < 30 ? ' offering strong value to price-conscious buyers.' :
               selectedItem.price > 100 ? ' positioned as a premium product.' :
               ' sitting in the sweet spot for conversions.'}
            </p>
            <p>
              • <strong className="text-gray-800">Social Proof:</strong> {selectedItem.reviews.toLocaleString()} reviews with {selectedItem.rating} stars 
              {selectedItem.rating >= 4.5 ? ' demonstrates exceptional customer satisfaction.' :
               selectedItem.rating >= 4.0 ? ' shows good customer satisfaction.' :
               ' indicates room for quality improvement.'}
            </p>
            <p>
              • <strong className="text-gray-800">Velocity:</strong> Estimated {selectedItem.sales.toLocaleString()} monthly sales 
              {selectedItem.sales > 5000 ? ' indicates strong market demand and BSR momentum.' :
               ' maintains consistent sales velocity.'}
            </p>
          </div>
        </div>

        {/* Performance Metrics */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-indigo-500" />
            <h4 className="font-medium text-gray-900">Performance Metrics</h4>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white p-3 rounded-lg border border-gray-200">
              <div className="text-xs text-gray-500 mb-1">Monthly Revenue</div>
              <div className="text-lg font-bold text-gray-900">
                ${selectedItem.revenue.toLocaleString()}
              </div>
            </div>
            <div className="bg-white p-3 rounded-lg border border-gray-200">
              <div className="text-xs text-gray-500 mb-1">Review Velocity</div>
              <div className="text-lg font-bold text-gray-900">
                ~{Math.round(selectedItem.reviews / 12)}/mo
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Advanced Analysis Button */}
      <div className="p-4 border-t border-gray-100">
        <Button
          onClick={() => setShowAdvancedModal(true)}
          className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white"
        >
          <Sparkles className="w-4 h-4 mr-2" />
          Advanced SEO Analysis
        </Button>
      </div>

      {/* Advanced Analysis Modal */}
      {showAdvancedModal && (
        <AdvancedAnalysisModal
          product={selectedItem}
          onClose={() => setShowAdvancedModal(false)}
        />
      )}
    </div>
  );
}

