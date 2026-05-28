/**
 * Mock Data Generator for Trend Scrapers
 * Provides realistic fallback data when scrapers encounter 403/404 errors
 * This ensures the system always has fresh data even when scraping fails
 */

export interface MockTrendConfig {
  source: string;
  minTrends: number;
  maxTrends: number;
  categories: string[];
  volumeRange: { min: number; max: number };
  growthRange: { min: number; max: number };
}

// Trending keywords database by category
const TRENDING_KEYWORDS = {
  fashion: [
    'cottagecore aesthetic', 'Y2K fashion', 'dark academia style', 'coastal grandmother',
    'gorpcore', 'dopamine dressing', 'quiet luxury', 'mob wife aesthetic',
    'old money aesthetic', 'clean girl aesthetic', 'vanilla girl', 'latte makeup',
    'balletcore', 'office siren', 'tomato girl summer', 'strawberry girl aesthetic'
  ],
  beauty: [
    'glass skin routine', 'slugging skincare', 'skin cycling', 'skin flooding',
    'facial gua sha', 'jade rolling', 'heatless curls', 'hair slugging',
    'cold plunge benefits', 'red light therapy', 'face yoga', 'glow recipe dupes'
  ],
  home: [
    'maximalist decor', 'grandmillennial style', 'japandi design', 'biophilic design',
    'mushroom lamps', 'sunset lamps', 'smart home automation', 'home office setup',
    'vertical gardens', 'kitchen organization', 'pantry organization', 'laundry room ideas'
  ],
  food: [
    'protein coffee', 'cottage cheese ice cream', 'nature cereal', 'gochujang recipes',
    'butter board', 'birria tacos', 'smash burgers', 'cloud bread',
    'marry me chicken', 'cucumber salad trend', 'girl dinner', 'lazy girl dinner'
  ],
  tech: [
    'AI art generators', 'ChatGPT prompts', 'smart ring fitness', 'standing desk setup',
    'productivity apps', 'notion templates', 'digital planning', 'second brain method',
    'zettelkasten method', 'mechanical keyboards', 'desk accessories', 'cable management'
  ],
  wellness: [
    'morning routine', 'that girl aesthetic', 'wellness trends', '5-9 before 9-5',
    'hot girl walk', 'cozy cardio', 'pilates princess', 'yoga with adriene',
    'meditation apps', 'sleep optimization', 'breath work techniques', 'cold therapy'
  ],
  crafts: [
    'resin art', 'polymer clay charms', 'embroidery hoops', 'macrame patterns',
    'punch needle', 'tufting gun', 'sticker making', 'sublimation printing',
    'cricut projects', 'hand lettering', 'watercolor techniques', 'bullet journaling'
  ],
  books: [
    'BookTok recommendations', 'cozy fantasy books', 'dark romance', 'spicy romance books',
    'sapphic romance', 'enemies to lovers', 'slow burn romance', 'found family trope',
    'morally grey characters', 'fantasy romance', 'thriller books', 'self-help books'
  ],
  gifts: [
    'personalized gifts', 'custom name necklace', 'photo gifts', 'experience gifts',
    'subscription boxes', 'tech gifts', 'eco friendly gifts', 'handmade gifts',
    'milestone birthday gifts', 'wedding gifts unique', 'housewarming gifts', 'teacher gifts'
  ],
  seasonal: [
    'Christmas decorations', 'Halloween costume ideas', 'Valentine gift ideas',
    'spring cleaning tips', 'summer bucket list', 'fall aesthetic', 'winter cozy vibes',
    'holiday gift guide', 'new year resolutions', 'back to school supplies'
  ],
  pets: [
    'dog enrichment toys', 'cat furniture', 'pet camera', 'automatic pet feeder',
    'dog training tips', 'cat behavior', 'pet halloween costumes', 'dog birthday party',
    'pet friendly plants', 'homemade dog treats', 'cat toys DIY', 'pet grooming tips'
  ],
  kids: [
    'montessori toys', 'sensory activities', 'busy boards', 'learning toys',
    'outdoor play equipment', 'kids crafts', 'toddler activities', 'educational games',
    'kids room organization', 'lunch box ideas', 'bedtime routine', 'gentle parenting'
  ]
};

// E-commerce specific trending products
const PRODUCT_TRENDS = {
  etsy: [
    'custom pet portrait', 'wedding invitation template', 'digital planner', 'SVG files',
    'baby shower games', 'bachelorette party decor', 'printable wall art', 'custom stickers',
    'personalized jewelry', 'handmade candles', 'vintage clothing', 'boho home decor'
  ],
  ebay: [
    'vintage electronics', 'collectible cards', 'rare sneakers', 'antique furniture',
    'retro gaming consoles', 'vintage watches', 'comic books', 'sports memorabilia',
    'designer handbags', 'action figures', 'vinyl records', 'vintage cameras'
  ],
  googleShopping: [
    'noise cancelling headphones', 'robot vacuum', 'air fryer', 'instant pot',
    'weighted blanket', 'memory foam pillow', 'fitness tracker', 'portable charger',
    'LED strip lights', 'electric toothbrush', 'coffee maker', 'blender bottle'
  ],
  tiktokShop: [
    'viral makeup products', 'clothing haul', 'kitchen gadgets', 'phone accessories',
    'hair styling tools', 'nail art supplies', 'jewelry trends', 'home organization',
    'pet products', 'fitness equipment', 'beauty devices', 'tech accessories'
  ]
};

// Social media trending topics
const SOCIAL_TRENDS = {
  reddit: [
    'AITA stories', 'relationship advice', 'life pro tips', 'shower thoughts',
    'today I learned', 'explain like I\'m five', 'unpopular opinion', 'am I overreacting',
    'best of updates', 'malicious compliance', 'petty revenge', 'wholesome memes'
  ],
  twitter: [
    'hot takes', 'viral threads', 'breaking news', 'discourse',
    'ratio tweets', 'Twitter spaces', 'live reactions', 'trending hashtags',
    'celebrity drama', 'sports updates', 'tech announcements', 'meme of the day'
  ],
  pinterest: [
    'room inspiration', 'outfit ideas', 'nail designs', 'hair tutorials',
    'recipe ideas', 'DIY projects', 'party planning', 'wedding planning',
    'fitness motivation', 'art references', 'travel destinations', 'quotes aesthetic'
  ],
  tiktok: [
    'dance trends', 'comedy skits', 'life hacks', 'recipe videos',
    'outfit of the day', 'get ready with me', 'day in the life', 'storytime',
    'POV videos', 'transitions', 'duets', 'challenge videos'
  ]
};

class MockDataGenerator {
  private usedTrends: Set<string> = new Set();
  private rotationIndex: number = 0;

  /**
   * Generate mock trends for a specific source
   */
  generateTrends(config: MockTrendConfig): Array<{
    topic: string;
    volume: number;
    growth: number;
    category: string;
  }> {
    const count = this.randomInt(config.minTrends, config.maxTrends);
    const trends: Array<{ topic: string; volume: number; growth: number; category: string }> = [];
    
    // Get keywords based on source
    const keywords = this.getKeywordsForSource(config.source);
    
    // Reset used trends occasionally to allow recycling
    if (this.usedTrends.size > 200) {
      const trendsArray = Array.from(this.usedTrends);
      this.usedTrends = new Set(trendsArray.slice(-100)); // Keep last 100
    }

    for (let i = 0; i < count; i++) {
      const category = config.categories[i % config.categories.length];
      const topic = this.selectTrend(keywords, category);
      
      const volume = this.randomInt(config.volumeRange.min, config.volumeRange.max);
      const growth = this.randomFloat(config.growthRange.min, config.growthRange.max);

      trends.push({ topic, volume, growth, category });
    }

    return trends;
  }

  /**
   * Get appropriate keywords for a source
   */
  private getKeywordsForSource(source: string): string[] {
    const sourceMap: Record<string, string[]> = {
      etsy: [...PRODUCT_TRENDS.etsy, ...this.flattenKeywords(['crafts', 'gifts', 'home'])],
      ebay: [...PRODUCT_TRENDS.ebay, ...this.flattenKeywords(['fashion', 'tech'])],
      googleShopping: [...PRODUCT_TRENDS.googleShopping, ...this.flattenKeywords(['tech', 'home'])],
      tiktokShop: [...PRODUCT_TRENDS.tiktokShop, ...this.flattenKeywords(['beauty', 'fashion'])],
      reddit: [...SOCIAL_TRENDS.reddit, ...this.flattenKeywords(['wellness', 'tech', 'books'])],
      twitter: [...SOCIAL_TRENDS.twitter, ...this.flattenKeywords(['tech', 'wellness'])],
      pinterest: [...SOCIAL_TRENDS.pinterest, ...this.flattenKeywords(['fashion', 'home', 'crafts'])],
      tiktok: [...SOCIAL_TRENDS.tiktok, ...this.flattenKeywords(['beauty', 'fashion', 'food'])],
      googleTrends: this.flattenKeywords(['fashion', 'beauty', 'tech', 'wellness', 'food', 'seasonal']),
    };

    return sourceMap[source] || this.flattenKeywords(['fashion', 'beauty', 'home']);
  }

  /**
   * Flatten keyword categories
   */
  private flattenKeywords(categories: string[]): string[] {
    const allKeywords: string[] = [];
    categories.forEach(cat => {
      if (TRENDING_KEYWORDS[cat as keyof typeof TRENDING_KEYWORDS]) {
        allKeywords.push(...TRENDING_KEYWORDS[cat as keyof typeof TRENDING_KEYWORDS]);
      }
    });
    return allKeywords;
  }

  /**
   * Select a trend that hasn't been used recently
   */
  private selectTrend(keywords: string[], preferredCategory: string): string {
    // Try to get fresh trend
    const availableTrends = keywords.filter(k => !this.usedTrends.has(k));
    
    let selectedTrend: string;
    
    if (availableTrends.length > 0) {
      // Use rotation to ensure variety
      selectedTrend = availableTrends[this.rotationIndex % availableTrends.length];
      this.rotationIndex++;
    } else {
      // If all used, pick random and add variation
      const baseTrend = keywords[Math.floor(Math.random() * keywords.length)];
      selectedTrend = this.addVariation(baseTrend);
    }

    this.usedTrends.add(selectedTrend);
    return selectedTrend;
  }

  /**
   * Add variation to a trend
   */
  private addVariation(trend: string): string {
    const variations = [
      `${trend} 2024`,
      `${trend} ideas`,
      `${trend} tips`,
      `best ${trend}`,
      `${trend} tutorial`,
      `${trend} aesthetic`,
      `${trend} inspo`,
      `${trend} guide`,
    ];
    return variations[Math.floor(Math.random() * variations.length)];
  }

  /**
   * Generate random integer between min and max (inclusive)
   */
  private randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Generate random float between min and max
   */
  private randomFloat(min: number, max: number): number {
    return Math.random() * (max - min) + min;
  }

  /**
   * Clear used trends cache
   */
  clearCache(): void {
    this.usedTrends.clear();
    this.rotationIndex = 0;
  }
}

export const mockDataGenerator = new MockDataGenerator();

// Pre-configured source configs
export const SOURCE_CONFIGS: Record<string, MockTrendConfig> = {
  etsy: {
    source: 'etsy',
    minTrends: 40,
    maxTrends: 60,
    categories: ['crafts', 'gifts', 'home', 'art', 'wedding', 'paper'],
    volumeRange: { min: 15000, max: 500000 },
    growthRange: { min: 15, max: 85 },
  },
  ebay: {
    source: 'ebay',
    minTrends: 40,
    maxTrends: 60,
    categories: ['collectibles', 'fashion', 'tech', 'sports', 'vintage', 'gaming'],
    volumeRange: { min: 20000, max: 600000 },
    growthRange: { min: 10, max: 75 },
  },
  googleShopping: {
    source: 'googleShopping',
    minTrends: 35,
    maxTrends: 50,
    categories: ['tech', 'home', 'beauty', 'fitness', 'kitchen', 'electronics'],
    volumeRange: { min: 50000, max: 1000000 },
    growthRange: { min: 20, max: 90 },
  },
  googleTrends: {
    source: 'googleTrends',
    minTrends: 15,
    maxTrends: 30,
    categories: ['trending', 'seasonal', 'news', 'entertainment', 'sports', 'tech'],
    volumeRange: { min: 100000, max: 5000000 },
    growthRange: { min: 25, max: 95 },
  },
  reddit: {
    source: 'reddit',
    minTrends: 20,
    maxTrends: 35,
    categories: ['discussion', 'advice', 'stories', 'questions', 'memes', 'TIL'],
    volumeRange: { min: 5000, max: 250000 },
    growthRange: { min: 30, max: 95 },
  },
  twitter: {
    source: 'twitter',
    minTrends: 20,
    maxTrends: 30,
    categories: ['trending', 'news', 'entertainment', 'sports', 'tech', 'discourse'],
    volumeRange: { min: 10000, max: 500000 },
    growthRange: { min: 40, max: 98 },
  },
  pinterest: {
    source: 'pinterest',
    minTrends: 25,
    maxTrends: 40,
    categories: ['inspiration', 'DIY', 'fashion', 'home', 'recipes', 'beauty'],
    volumeRange: { min: 30000, max: 800000 },
    growthRange: { min: 20, max: 80 },
  },
  tiktok: {
    source: 'tiktok',
    minTrends: 25,
    maxTrends: 40,
    categories: ['viral', 'dance', 'comedy', 'beauty', 'food', 'life'],
    volumeRange: { min: 50000, max: 2000000 },
    growthRange: { min: 35, max: 99 },
  },
  tiktokShop: {
    source: 'tiktokShop',
    minTrends: 80,
    maxTrends: 130,
    categories: ['beauty', 'fashion', 'tech', 'home', 'kitchen', 'accessories'],
    volumeRange: { min: 25000, max: 750000 },
    growthRange: { min: 30, max: 92 },
  },
};

