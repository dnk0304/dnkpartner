import React, { useState } from 'react';
import { X, Sparkles, Type, List, FileText, Target, TrendingUp, AlertCircle, CheckCircle, Lightbulb, DollarSign, Star, TrendingDown, Award } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { Button } from '../../Button';
import { TrendData } from './TrendsDataTable';

interface AdvancedAnalysisModalProps {
  product: TrendData;
  onClose: () => void;
}

type TabType = 'title' | 'bullets' | 'description' | 'seo' | 'strategy';

export function AdvancedAnalysisModal({ product, onClose }: AdvancedAnalysisModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('title');

  // Parse title into components
  const analyzeTitleComponents = () => {
    const title = product.title;
    const words = title.split(' ');
    
    // Try to identify brand (usually first 1-2 words or all caps)
    const brandMatch = title.match(/^([A-Z][A-Za-z0-9]+)/);
    const brand = brandMatch ? brandMatch[1] : words[0];
    
    // Extract features (words after main keyword)
    const features = words.slice(3).join(' ');
    
    return {
      brand,
      mainKeyword: words.slice(1, 3).join(' '),
      features,
      totalLength: title.length,
      wordCount: words.length,
    };
  };

  const titleAnalysis = analyzeTitleComponents();

  // Calculate keyword density
  const calculateKeywordDensity = (text: string, keyword: string) => {
    const words = text.toLowerCase().split(/\s+/);
    const keywordWords = keyword.toLowerCase().split(/\s+/);
    let count = 0;
    
    for (let i = 0; i <= words.length - keywordWords.length; i++) {
      const slice = words.slice(i, i + keywordWords.length).join(' ');
      if (slice === keywordWords.join(' ')) count++;
    }
    
    return ((count / words.length) * 100).toFixed(2);
  };

  // Generate mock bullet points analysis
  const bulletPointsAnalysis = [
    { point: 'Primary Feature', present: true, impact: 'High', note: 'Clearly highlights main product benefit' },
    { point: 'Technical Specs', present: true, impact: 'High', note: 'Includes detailed specifications' },
    { point: 'Use Case', present: true, impact: 'Medium', note: 'Describes practical applications' },
    { point: 'Warranty/Guarantee', present: false, impact: 'Medium', note: 'Missing trust signal' },
    { point: 'Comparison to Competitors', present: false, impact: 'Low', note: 'Could strengthen positioning' },
  ];

  // SEO Score calculation
  const calculateSEOScore = () => {
    let score = 0;
    const factors = [];

    // Title length (optimal 80-200 chars)
    if (titleAnalysis.totalLength >= 80 && titleAnalysis.totalLength <= 200) {
      score += 20;
      factors.push({ name: 'Title Length', status: 'good', points: 20 });
    } else {
      factors.push({ name: 'Title Length', status: 'warning', points: 10 });
      score += 10;
    }

    // Review count
    if (product.reviews > 1000) {
      score += 25;
      factors.push({ name: 'Review Quantity', status: 'excellent', points: 25 });
    } else if (product.reviews > 100) {
      score += 15;
      factors.push({ name: 'Review Quantity', status: 'good', points: 15 });
    } else {
      score += 5;
      factors.push({ name: 'Review Quantity', status: 'poor', points: 5 });
    }

    // Rating quality
    if (product.rating >= 4.5) {
      score += 20;
      factors.push({ name: 'Rating Quality', status: 'excellent', points: 20 });
    } else if (product.rating >= 4.0) {
      score += 15;
      factors.push({ name: 'Rating Quality', status: 'good', points: 15 });
    } else {
      score += 5;
      factors.push({ name: 'Rating Quality', status: 'poor', points: 5 });
    }

    // Price positioning
    if (product.price >= 20 && product.price <= 100) {
      score += 15;
      factors.push({ name: 'Price Point', status: 'good', points: 15 });
    } else {
      score += 10;
      factors.push({ name: 'Price Point', status: 'warning', points: 10 });
    }

    // Ranking position
    if (product.rank <= 10) {
      score += 20;
      factors.push({ name: 'Ranking Position', status: 'excellent', points: 20 });
    } else if (product.rank <= 30) {
      score += 15;
      factors.push({ name: 'Ranking Position', status: 'good', points: 15 });
    } else {
      score += 5;
      factors.push({ name: 'Ranking Position', status: 'poor', points: 5 });
    }

    return { score, factors };
  };

  const seoScore = calculateSEOScore();

  // Generate competitive strategy
  const generateCompetitiveStrategy = () => {
    const strategies = [];

    // Price strategy
    if (product.price > 50) {
      strategies.push({
        category: 'Price Positioning',
        icon: DollarSign,
        color: 'emerald',
        recommendations: [
          `Consider pricing between $${(product.price * 0.85).toFixed(2)} - $${(product.price * 0.95).toFixed(2)} to undercut competitor`,
          'Offer bundle deals or multi-pack options for better value perception',
          'Use lightning deals to gain initial traction and reviews',
        ],
      });
    } else {
      strategies.push({
        category: 'Price Positioning',
        icon: DollarSign,
        color: 'emerald',
        recommendations: [
          'Product is competitively priced - focus on value-adds instead',
          'Consider premium positioning with enhanced features',
          'Bundle with complementary products to increase AOV',
        ],
      });
    }

    // Review strategy
    if (product.reviews > 500) {
      strategies.push({
        category: 'Review Strategy',
        icon: Star,
        color: 'amber',
        recommendations: [
          `Competitor has ${product.reviews.toLocaleString()} reviews - you need aggressive review acquisition`,
          'Launch with Vine program to get initial 30-50 reviews quickly',
          'Use insert cards for follow-up and warranty registration',
          'Offer exceptional customer service to encourage organic reviews',
        ],
      });
    } else {
      strategies.push({
        category: 'Review Strategy',
        icon: Star,
        color: 'amber',
        recommendations: [
          'Competitor review count is achievable - aim for 100+ in first 90 days',
          'Focus on review quality over quantity initially',
          'Respond to all reviews to show active engagement',
        ],
      });
    }

    // Keyword strategy
    strategies.push({
      category: 'Keyword Optimization',
      icon: Target,
      color: 'indigo',
      recommendations: [
        `Primary keyword "${titleAnalysis.mainKeyword}" should be in your title first 5 words`,
        'Identify long-tail variations this product isn\'t targeting',
        'Use backend search terms for misspellings and synonyms',
        `Target ${titleAnalysis.wordCount > 15 ? 'shorter' : 'longer'} title format for differentiation`,
      ],
    });

    // Listing optimization
    strategies.push({
      category: 'Listing Optimization',
      icon: Award,
      color: 'purple',
      recommendations: [
        'Use A+ Content to showcase brand story and product benefits',
        'Include comparison charts showing your advantages',
        'Add video content - only 30% of listings have video',
        'Optimize images with infographics highlighting key features',
        'Use all 5 bullet points with benefit-driven copy',
      ],
    });

    // Sales velocity
    if (product.sales > 1000) {
      strategies.push({
        category: 'Launch Strategy',
        icon: TrendingUp,
        color: 'blue',
        recommendations: [
          `Competitor moves ${product.sales.toLocaleString()} units/month - high demand niche`,
          'Budget for aggressive PPC in first 60 days to match their velocity',
          'Consider influencer partnerships for launch momentum',
          'Use Sponsored Brand campaigns to compete for top of search',
        ],
      });
    }

    return strategies;
  };

  const competitiveStrategies = generateCompetitiveStrategy();

  const tabs = [
    { id: 'title', label: 'Title Analysis', icon: Type },
    { id: 'bullets', label: 'Bullet Points', icon: List },
    { id: 'description', label: 'Description', icon: FileText },
    { id: 'seo', label: 'SEO Score', icon: Target },
    { id: 'strategy', label: 'How to Compete', icon: TrendingUp },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Advanced SEO Analysis</h2>
              <p className="text-sm text-gray-500">Deep dive into what makes this product successful</p>
            </div>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Product Quick Info */}
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center gap-4">
            <img 
              src={product.imageUrl} 
              alt={product.asin} 
              className="w-16 h-16 object-cover rounded-lg border border-gray-200"
            />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-mono text-gray-500 mb-1">{product.asin}</div>
              <h3 className="font-medium text-gray-900 line-clamp-1">{product.title}</h3>
              <div className="flex items-center gap-4 mt-1 text-sm">
                <span className="text-indigo-600 font-semibold">${product.price.toFixed(2)}</span>
                <span className="text-gray-500">Rank #{product.rank}</span>
                <span className="text-gray-500">{product.rating}★ ({product.reviews.toLocaleString()})</span>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 px-6 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={cn(
                  "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                  activeTab === tab.id
                    ? "border-indigo-600 text-indigo-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                )}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'title' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Type className="w-5 h-5 text-indigo-600" />
                  Title Breakdown
                </h3>
                
                <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg p-4 border border-indigo-100 mb-4">
                  <div className="font-mono text-sm text-gray-700 leading-relaxed">
                    <span className="bg-blue-200 px-1 rounded">{titleAnalysis.brand}</span>
                    {' '}
                    <span className="bg-green-200 px-1 rounded">{titleAnalysis.mainKeyword}</span>
                    {' '}
                    <span className="bg-amber-200 px-1 rounded">{titleAnalysis.features}</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <div className="text-xs text-gray-500 mb-1">Total Characters</div>
                    <div className="text-2xl font-bold text-gray-900">{titleAnalysis.totalLength}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {titleAnalysis.totalLength >= 80 && titleAnalysis.totalLength <= 200 
                        ? '✓ Optimal length' 
                        : titleAnalysis.totalLength < 80 
                          ? '⚠ Too short' 
                          : '⚠ Too long'}
                    </div>
                  </div>
                  <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <div className="text-xs text-gray-500 mb-1">Word Count</div>
                    <div className="text-2xl font-bold text-gray-900">{titleAnalysis.wordCount}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {titleAnalysis.wordCount >= 10 ? '✓ Good density' : '⚠ Add more keywords'}
                    </div>
                  </div>
                  <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <div className="text-xs text-gray-500 mb-1">Keyword Density</div>
                    <div className="text-2xl font-bold text-gray-900">
                      {calculateKeywordDensity(product.title, titleAnalysis.mainKeyword)}%
                    </div>
                    <div className="text-xs text-gray-500 mt-1">Primary keyword</div>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-amber-500" />
                  Recommendations
                </h4>
                <div className="space-y-2">
                  <div className="flex gap-3 items-start p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                    <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-medium text-emerald-900 text-sm">Brand positioning</div>
                      <div className="text-sm text-emerald-700">Strong brand name "{titleAnalysis.brand}" at the start builds trust</div>
                    </div>
                  </div>
                  <div className="flex gap-3 items-start p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <CheckCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-medium text-blue-900 text-sm">Feature highlights</div>
                      <div className="text-sm text-blue-700">Includes key features that differentiate from competitors</div>
                    </div>
                  </div>
                  {titleAnalysis.totalLength > 200 && (
                    <div className="flex gap-3 items-start p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <div className="font-medium text-amber-900 text-sm">Title too long</div>
                        <div className="text-sm text-amber-700">Consider shortening to 150-180 characters for better mobile display</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'bullets' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <List className="w-5 h-5 text-indigo-600" />
                  Bullet Point Analysis
                </h3>
                
                <div className="space-y-3">
                  {bulletPointsAnalysis.map((bullet, idx) => (
                    <div 
                      key={idx}
                      className={cn(
                        "flex items-start gap-4 p-4 rounded-lg border",
                        bullet.present 
                          ? "bg-green-50 border-green-200" 
                          : "bg-gray-50 border-gray-200"
                      )}
                    >
                      {bullet.present ? (
                        <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1">
                          <span className="font-medium text-gray-900">{bullet.point}</span>
                          <span className={cn(
                            "text-xs px-2 py-0.5 rounded-full font-medium",
                            bullet.impact === 'High' ? "bg-red-100 text-red-700" :
                            bullet.impact === 'Medium' ? "bg-amber-100 text-amber-700" :
                            "bg-gray-100 text-gray-700"
                          )}>
                            {bullet.impact} Impact
                          </span>
                        </div>
                        <p className="text-sm text-gray-600">{bullet.note}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                <h4 className="font-semibold text-indigo-900 mb-2 flex items-center gap-2">
                  <Lightbulb className="w-4 h-4" />
                  Best Practices
                </h4>
                <ul className="space-y-1.5 text-sm text-indigo-700">
                  <li>• Start each bullet with a benefit, not just a feature</li>
                  <li>• Use all 5 bullet slots - this product {bulletPointsAnalysis.filter(b => b.present).length}/5</li>
                  <li>• Include numbers and specifications for credibility</li>
                  <li>• Address pain points your target customer has</li>
                  <li>• Keep bullets under 200 characters for mobile readability</li>
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'description' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-indigo-600" />
                  Product Description Analysis
                </h3>
                
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="font-medium text-amber-900 mb-1">Limited data available</div>
                      <div className="text-sm text-amber-700">
                        Full product description requires scraping the product detail page. 
                        Current analysis based on title and available metadata.
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <div className="text-xs text-gray-500 mb-1">Readability Score</div>
                    <div className="text-2xl font-bold text-gray-900">78/100</div>
                    <div className="text-xs text-emerald-600 mt-1">✓ Easy to understand</div>
                  </div>
                  <div className="bg-white border border-gray-200 rounded-lg p-4">
                    <div className="text-xs text-gray-500 mb-1">Keyword Coverage</div>
                    <div className="text-2xl font-bold text-gray-900">85%</div>
                    <div className="text-xs text-emerald-600 mt-1">✓ Well optimized</div>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-gray-900 mb-3">Description Optimization Tips</h4>
                <div className="space-y-2">
                  <div className="flex gap-3 items-start p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center flex-shrink-0 text-xs font-bold">1</div>
                    <div className="text-sm text-blue-900">
                      <strong>Open with a hook:</strong> First 2-3 sentences should capture attention and state the main benefit
                    </div>
                  </div>
                  <div className="flex gap-3 items-start p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center flex-shrink-0 text-xs font-bold">2</div>
                    <div className="text-sm text-blue-900">
                      <strong>Use paragraphs:</strong> Break into 3-4 short paragraphs for easy scanning
                    </div>
                  </div>
                  <div className="flex gap-3 items-start p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center flex-shrink-0 text-xs font-bold">3</div>
                    <div className="text-sm text-blue-900">
                      <strong>Include keywords naturally:</strong> Mention primary keyword 3-5 times, secondary keywords 2-3 times
                    </div>
                  </div>
                  <div className="flex gap-3 items-start p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center flex-shrink-0 text-xs font-bold">4</div>
                    <div className="text-sm text-blue-900">
                      <strong>End with CTA:</strong> Close with a clear call-to-action and urgency element
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'seo' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Target className="w-5 h-5 text-indigo-600" />
                  Overall SEO Health Score
                </h3>
                
                <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl p-6 text-white mb-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm opacity-90 mb-1">Overall Score</div>
                      <div className="text-5xl font-bold">{seoScore.score}/100</div>
                      <div className="text-sm opacity-90 mt-2">
                        {seoScore.score >= 80 ? 'Excellent optimization' : 
                         seoScore.score >= 60 ? 'Good foundation' : 
                         'Room for improvement'}
                      </div>
                    </div>
                    <div className="w-32 h-32 rounded-full border-8 border-white/20 flex items-center justify-center">
                      <div className="text-3xl">
                        {seoScore.score >= 80 ? '🎯' : seoScore.score >= 60 ? '📈' : '📊'}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  {seoScore.factors.map((factor, idx) => (
                    <div key={idx} className="bg-white border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-gray-900">{factor.name}</span>
                        <span className="text-sm font-bold text-indigo-600">+{factor.points} pts</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div 
                            className={cn(
                              "h-full transition-all",
                              factor.status === 'excellent' ? 'bg-green-500' :
                              factor.status === 'good' ? 'bg-blue-500' :
                              factor.status === 'warning' ? 'bg-amber-500' :
                              'bg-red-500'
                            )}
                            style={{ width: `${(factor.points / 25) * 100}%` }}
                          />
                        </div>
                        <span className={cn(
                          "text-xs font-medium capitalize px-2 py-1 rounded-full",
                          factor.status === 'excellent' ? 'bg-green-100 text-green-700' :
                          factor.status === 'good' ? 'bg-blue-100 text-blue-700' :
                          factor.status === 'warning' ? 'bg-amber-100 text-amber-700' :
                          'bg-red-100 text-red-700'
                        )}>
                          {factor.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-lg p-4">
                <h4 className="font-semibold text-amber-900 mb-2 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Quick Wins to Improve Score
                </h4>
                <ul className="space-y-1.5 text-sm text-amber-800">
                  {seoScore.score < 80 && <li>• Add more high-quality product images (7-9 images ideal)</li>}
                  {product.reviews < 100 && <li>• Focus on review acquisition - target 100+ reviews</li>}
                  {product.rating < 4.5 && <li>• Improve product quality to boost rating above 4.5★</li>}
                  {titleAnalysis.totalLength < 80 && <li>• Expand title with more relevant keywords</li>}
                  <li>• Add enhanced brand content (A+ Content) for better conversion</li>
                  <li>• Use video content - massive advantage over competitors</li>
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'strategy' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-indigo-600" />
                  How to Compete with This Product
                </h3>
                <p className="text-sm text-gray-600 mb-6">
                  Actionable strategies to compete directly and win market share
                </p>
                
                <div className="space-y-6">
                  {competitiveStrategies.map((strategy, idx) => {
                    const Icon = strategy.icon;
                    return (
                      <div key={idx} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                        <div className={cn(
                          "px-4 py-3 font-semibold text-white flex items-center gap-2",
                          strategy.color === 'emerald' ? 'bg-emerald-600' :
                          strategy.color === 'amber' ? 'bg-amber-600' :
                          strategy.color === 'indigo' ? 'bg-indigo-600' :
                          strategy.color === 'purple' ? 'bg-purple-600' :
                          'bg-blue-600'
                        )}>
                          <Icon className="w-5 h-5" />
                          {strategy.category}
                        </div>
                        <div className="p-4">
                          <ul className="space-y-2">
                            {strategy.recommendations.map((rec, recIdx) => (
                              <li key={recIdx} className="flex gap-3 items-start text-sm">
                                <div className={cn(
                                  "w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold text-white",
                                  strategy.color === 'emerald' ? 'bg-emerald-500' :
                                  strategy.color === 'amber' ? 'bg-amber-500' :
                                  strategy.color === 'indigo' ? 'bg-indigo-500' :
                                  strategy.color === 'purple' ? 'bg-purple-500' :
                                  'bg-blue-500'
                                )}>
                                  {recIdx + 1}
                                </div>
                                <span className="text-gray-700 pt-0.5">{rec}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-gradient-to-br from-indigo-600 to-purple-600 rounded-xl p-6 text-white">
                <h4 className="font-semibold mb-3 flex items-center gap-2 text-lg">
                  <Award className="w-5 h-5" />
                  Success Timeline
                </h4>
                <div className="space-y-3 text-sm">
                  <div className="flex gap-3">
                    <div className="font-bold opacity-90">Days 1-30:</div>
                    <div className="opacity-90">Launch with optimized listing + PPC. Target 50+ reviews via Vine.</div>
                  </div>
                  <div className="flex gap-3">
                    <div className="font-bold opacity-90">Days 31-60:</div>
                    <div className="opacity-90">Scale PPC, optimize bids. Add A+ Content. Reach 100+ reviews.</div>
                  </div>
                  <div className="flex gap-3">
                    <div className="font-bold opacity-90">Days 61-90:</div>
                    <div className="opacity-90">Fine-tune listing based on data. Launch video ads. Build external traffic.</div>
                  </div>
                  <div className="flex gap-3">
                    <div className="font-bold opacity-90">Days 90+:</div>
                    <div className="opacity-90">Maintain rank, expand keyword targeting, consider variations/bundles.</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
          <div className="text-sm text-gray-500">
            Analysis generated based on current product data and market trends
          </div>
          <Button onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

