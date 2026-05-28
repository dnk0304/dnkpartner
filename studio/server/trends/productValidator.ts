/**
 * Product/Service Validator
 * Filters out non-product trending keywords (news, events, celebrities, etc.)
 * and identifies actual products/services for e-commerce trend analysis
 */

// Strong signals that indicate a product/service
const PRODUCT_INDICATORS = [
  // E-commerce signals
  'buy', 'shop', 'purchase', 'order', 'price', 'sale', 'discount',
  'shipping', 'delivery', 'cart', 'checkout', 'deal', 'offer',
  
  // Product types for KDP/crafts/books
  'book', 'journal', 'planner', 'notebook', 'coloring', 'diary',
  'kit', 'set', 'supplies', 'tools', 'materials', 'pack',
  'decor', 'art', 'print', 'poster', 'sticker', 'card',
  'craft', 'diy', 'handmade', 'custom', 'personalized',
  'pattern', 'template', 'printable', 'download',
  
  // Marketplace mentions
  'amazon', 'etsy', 'ebay', 'shopify', 'walmart', 'target',
  'kdp', 'print on demand', 'merch', 'pod', 'redbubble',
  
  // Product attributes
  'bestseller', 'trending product', 'must have', 'new release',
  'limited edition', 'exclusive', 'collection', 'series',
  
  // Gift-related (usually products)
  'gift idea', 'gift guide', 'perfect gift', 'present',
];

// Patterns that indicate NON-products (news, events, entertainment)
const NON_PRODUCT_PATTERNS = [
  // News/Breaking events
  /^breaking\s/i,
  /\snews$/i,
  /update$/i,
  /alert$/i,
  /^live\s/i,
  /happening now/i,
  /just in:/i,
  
  // People/Celebrities (not products)
  /\'s\s+(birthday|death|wedding|divorce|arrest)/i,
  /(president|senator|congressman|governor|mayor)\s/i,
  /(celebrity|actor|actress|singer|rapper)\s/i,
  /passes away/i,
  /announces/i,
  
  // Sports scores/games (not products)
  /\d+\s*-\s*\d+/, // Score patterns like "3-2"
  /(won|lost|defeated|beats|crushes)\s+/i,
  /\sgame\s*\d+/i,
  /season\s*\d+\s+(finale|premiere)/i,
  /playoffs?/i,
  /championship/i,
  
  // News events (disasters, politics, etc.)
  /(earthquake|hurricane|tornado|flood|wildfire)/i,
  /(shooting|attack|bombing|crash|accident)/i,
  /(election|vote|poll|debate|primary)/i,
  /(trial|verdict|sentenced|arrested)/i,
  /(protest|rally|march)\s/i,
  
  // Entertainment events (not sellable)
  /\sconcert\s/i,
  /\stour\s(dates|announcement)/i,
  /episode\s*\d+/i,
  /season\s*\d+\s*episode/i,
  /(trailer|teaser|sneak peek)/i,
  /(spoiler|recap|review|reaction)\s/i,
  /premiere$/i,
  
  // Generic viral/meme content (usually not products)
  /^omg\s/i,
  /^wtf\s/i,
  /^lol\s/i,
  /gone wrong/i,
  /gone viral/i,
  /you won't believe/i,
  /shocking/i,
  /\sexposed$/i,
  /drama$/i,
  
  // Social media lingo (not products)
  /^(rip|tbh|imo|fyi|smh|ngl|tbf|irl|icymi)$/i,
  /^#(riptwitter|cancelculture|trending)/i,
  
  // Time-based events (not usually products)
  /^today in/i,
  /^this week in/i,
  /\d{4}\s+(recap|review|roundup)/i,
  
  // Obvious non-commerce topics
  /^how to\s/i, // Tutorials, not products
  /^why\s/i, // Discussions, not products
  /\?$/i, // Questions, not products
];

// Product-related categories for classification
export const PRODUCT_CATEGORIES = {
  'books': ['book', 'journal', 'planner', 'coloring', 'notebook', 'diary', 'organizer', 'workbook', 'activity book'],
  'art_supplies': ['paint', 'canvas', 'brush', 'easel', 'pencil', 'marker', 'crayon', 'colored pencil', 'art set'],
  'crafts': ['craft', 'diy', 'kit', 'supplies', 'yarn', 'fabric', 'sewing', 'knitting', 'embroidery'],
  'home_decor': ['decor', 'wall art', 'print', 'poster', 'frame', 'canvas art', 'home', 'living room', 'bedroom'],
  'gifts': ['gift', 'present', 'birthday', 'holiday', 'christmas', 'valentine', 'mother day', 'father day'],
  'stationery': ['sticker', 'card', 'stationery', 'notepad', 'pen', 'pencil case', 'folder'],
  'toys_games': ['toy', 'game', 'puzzle', 'educational', 'kids', 'children', 'activity'],
  'printables': ['printable', 'download', 'digital', 'pdf', 'instant download', 'template'],
};

/**
 * Determine if a keyword likely represents a product or service
 * @param keyword - The trending keyword to evaluate
 * @param context - Optional additional context (post text, description, etc.)
 * @returns true if likely a product, false otherwise
 */
export function isLikelyProduct(keyword: string, context?: string): boolean {
  if (!keyword || keyword.trim().length === 0) return false;
  
  const text = (keyword + ' ' + (context || '')).toLowerCase();
  const keywordLower = keyword.toLowerCase().trim();
  
  // Quick rejection of obvious non-products
  for (const pattern of NON_PRODUCT_PATTERNS) {
    if (pattern.test(keywordLower) || pattern.test(text)) {
      return false;
    }
  }
  
  // Check for strong product signals
  const hasProductSignal = PRODUCT_INDICATORS.some(indicator => 
    text.includes(indicator.toLowerCase())
  );
  
  // Additional heuristics
  const wordCount = keywordLower.split(/\s+/).length;
  const hasYear = /\b20\d{2}\b/.test(keywordLower); // Contains year like 2024
  const hasLongNumber = /\d{4,}/.test(keywordLower); // Long numbers (IDs, dates)
  const isAllCaps = keywordLower.length > 4 && keyword === keyword.toUpperCase();
  const startsWithHashtag = keyword.startsWith('#');
  const hasQuestionMark = keyword.includes('?');
  const hasExclamation = keyword.split('!').length > 2; // Multiple exclamations
  
  // Check if it's a product category term
  const isKnownProductCategory = Object.values(PRODUCT_CATEGORIES).some(category =>
    category.some(term => keywordLower.includes(term))
  );
  
  // Scoring system (0-100)
  let score = 50; // Neutral starting point
  
  // Positive signals
  if (hasProductSignal) score += 35;
  if (isKnownProductCategory) score += 30;
  if (wordCount >= 2 && wordCount <= 5) score += 5; // Product names are usually 2-5 words
  if (startsWithHashtag && hasProductSignal) score += 10; // Product hashtags
  
  // Negative signals
  if (hasYear && !hasProductSignal) score -= 15; // "2024 recap" not a product
  if (hasLongNumber && !hasProductSignal) score -= 20; // IDs, dates
  if (isAllCaps && !hasProductSignal) score -= 15; // Shouty news headlines
  if (wordCount === 1 && !isKnownProductCategory) score -= 15; // Single generic words
  if (hasQuestionMark) score -= 20; // Questions aren't products
  if (hasExclamation) score -= 10; // Over-excited clickbait
  if (wordCount > 8) score -= 10; // Too long to be a product name
  
  return score >= 50;
}

/**
 * Categorize a product keyword into a specific category
 * @param keyword - The product keyword to categorize
 * @returns Category name or 'other' if no match
 */
export function categorizeProduct(keyword: string): string {
  const keywordLower = keyword.toLowerCase();
  
  for (const [category, keywords] of Object.entries(PRODUCT_CATEGORIES)) {
    if (keywords.some(k => keywordLower.includes(k))) {
      return category;
    }
  }
  
  return 'other';
}

/**
 * Filter a list of trends to only include product-related ones
 * @param trends - Array of trend objects with 'name' or 'topic' field
 * @param getContext - Optional function to get additional context for each trend
 * @returns Filtered array containing only product-related trends
 */
export function filterProductTrends<T extends { name?: string; topic?: string; query?: string }>(
  trends: T[],
  getContext?: (trend: T) => string
): T[] {
  return trends.filter(trend => {
    const keyword = trend.name || trend.topic || trend.query || '';
    const context = getContext ? getContext(trend) : '';
    return isLikelyProduct(keyword, context);
  });
}

/**
 * Validate and score a keyword for product relevance
 * @param keyword - The keyword to score
 * @param context - Optional context
 * @returns Score from 0-100, where higher = more likely to be a product
 */
export function scoreProductRelevance(keyword: string, context?: string): number {
  if (!keyword || keyword.trim().length === 0) return 0;
  
  const text = (keyword + ' ' + (context || '')).toLowerCase();
  const keywordLower = keyword.toLowerCase().trim();
  
  // Check for non-product patterns first
  for (const pattern of NON_PRODUCT_PATTERNS) {
    if (pattern.test(keywordLower) || pattern.test(text)) {
      return 0; // Definitely not a product
    }
  }
  
  let score = 30; // Base score for passing non-product filter
  
  // Product indicator bonus
  const productMatches = PRODUCT_INDICATORS.filter(indicator => 
    text.includes(indicator.toLowerCase())
  ).length;
  score += Math.min(productMatches * 15, 50);
  
  // Category match bonus
  const categoryMatches = Object.values(PRODUCT_CATEGORIES).filter(category =>
    category.some(term => keywordLower.includes(term))
  ).length;
  score += Math.min(categoryMatches * 10, 20);
  
  return Math.min(score, 100);
}
