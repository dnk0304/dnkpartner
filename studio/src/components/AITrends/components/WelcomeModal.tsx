import React from 'react';
import { X, Globe, ShoppingBag, Rocket, Search, TrendingUp, Sparkles, ArrowRight } from 'lucide-react';
import { Button } from '../../Button';
import { cn } from '../../../lib/utils';

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WelcomeModal({ isOpen, onClose }: WelcomeModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-300">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 text-white p-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-white/20 backdrop-blur-sm rounded-xl">
              <Sparkles className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-3xl font-bold">Welcome to AI Trends! 👋</h2>
              <p className="text-white/90 text-sm mt-1">Your complete market intelligence platform</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-8">
          <p className="text-gray-600 mb-6">
            This tool gives you <strong>two powerful ways</strong> to discover opportunities and dominate your market:
          </p>

          {/* Multi-Platform Section */}
          <div className="mb-6 border-2 border-emerald-200 rounded-xl overflow-hidden bg-gradient-to-br from-emerald-50 to-teal-50">
            <div className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 backdrop-blur-sm rounded-lg">
                  <Globe className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    Multi-Platform Insights
                    <span className="px-2 py-0.5 bg-white/20 rounded-full text-xs font-semibold">🌍</span>
                  </h3>
                  <p className="text-sm text-white/90">Discover what's trending everywhere</p>
                </div>
              </div>
            </div>
            <div className="p-5">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="mt-1 p-1.5 bg-emerald-100 rounded-lg">
                    <Rocket className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">Exploding Trends</p>
                    <p className="text-sm text-gray-600">
                      Find viral topics across <strong>Reddit, TikTok, Pinterest, Etsy, eBay, Google Trends, Twitter, and Google Shopping</strong>
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-1 p-1.5 bg-emerald-100 rounded-lg">
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">Early Detection</p>
                    <p className="text-sm text-gray-600">
                      Spot trends <strong>before they hit Amazon</strong> and get ahead of the competition
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-1 p-1.5 bg-emerald-100 rounded-lg">
                    <Search className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">Category Explorer</p>
                    <p className="text-sm text-gray-600">
                      Browse trends organized by category to find your niche
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Amazon Section */}
          <div className="mb-6 border-2 border-orange-200 rounded-xl overflow-hidden bg-gradient-to-br from-orange-50 to-amber-50">
            <div className="bg-gradient-to-r from-orange-500 to-amber-600 text-white p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 backdrop-blur-sm rounded-lg">
                  <ShoppingBag className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    Amazon Marketplace Tools
                    <span className="px-2 py-0.5 bg-white/20 rounded-full text-xs font-semibold">📦</span>
                  </h3>
                  <p className="text-sm text-white/90">Execute and validate on Amazon</p>
                </div>
              </div>
            </div>
            <div className="p-5">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="mt-1 p-1.5 bg-orange-100 rounded-lg">
                    <Search className="w-4 h-4 text-orange-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">Keyword Research</p>
                    <p className="text-sm text-gray-600">
                      Analyze Amazon search results, competition, and find profitable keywords
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-1 p-1.5 bg-orange-100 rounded-lg">
                    <TrendingUp className="w-4 h-4 text-orange-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">Trending Keywords</p>
                    <p className="text-sm text-gray-600">
                      Discover high-growth opportunities with <strong>low competition</strong>
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-1 p-1.5 bg-orange-100 rounded-lg">
                    <Sparkles className="w-4 h-4 text-orange-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">ASIN Intelligence</p>
                    <p className="text-sm text-gray-600">
                      Reverse-engineer competitor keywords and track their performance
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Pro Tip */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl p-5">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Sparkles className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h4 className="font-bold text-gray-900 mb-2">💡 Pro Tip: The Perfect Workflow</h4>
                <div className="space-y-2 text-sm text-gray-700">
                  <p className="flex items-center gap-2">
                    <span className="flex items-center justify-center w-6 h-6 bg-emerald-500 text-white rounded-full text-xs font-bold">1</span>
                    <span><strong>Use Exploding Trends</strong> to discover what's trending across all platforms</span>
                  </p>
                  <div className="ml-8 text-gray-400">
                    <ArrowRight className="w-4 h-4" />
                  </div>
                  <p className="flex items-center gap-2">
                    <span className="flex items-center justify-center w-6 h-6 bg-orange-500 text-white rounded-full text-xs font-bold">2</span>
                    <span><strong>Validate with Amazon Tools</strong> to find profitable keywords with low competition</span>
                  </p>
                  <div className="ml-8 text-gray-400">
                    <ArrowRight className="w-4 h-4" />
                  </div>
                  <p className="flex items-center gap-2">
                    <span className="flex items-center justify-center w-6 h-6 bg-indigo-500 text-white rounded-full text-xs font-bold">3</span>
                    <span><strong>Execute and dominate</strong> your niche before the competition catches on!</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 bg-gray-50 px-8 py-4 flex justify-end gap-3">
          <Button onClick={onClose} variant="outline" size="lg">
            Got it, thanks!
          </Button>
          <Button onClick={onClose} size="lg" className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700">
            Let's Get Started 🚀
          </Button>
        </div>
      </div>
    </div>
  );
}

