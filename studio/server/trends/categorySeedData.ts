/**
 * Category Seed Keywords
 * Pre-populated trending keywords for each category to ensure consistent data
 * These serve as fallback when discovery hasn't found enough keywords yet
 */

export const CATEGORY_SEED_KEYWORDS: Record<string, string[]> = {
  'books': [
    'bestseller books 2025',
    'new releases fiction',
    'book club picks',
    'kindle unlimited',
    'romance novels',
    'mystery thriller books',
    'self help books',
    'fantasy series',
    'young adult books',
    'historical fiction',
    'science fiction novels',
    'biography bestsellers',
    'paperback books',
    'ebook deals',
    'classic literature'
  ],
  
  'coloring': [
    'adult coloring books',
    'mandala coloring',
    'stress relief coloring',
    'kids coloring pages',
    'animal coloring book',
    'nature coloring',
    'intricate coloring',
    'mindfulness coloring',
    'geometric patterns',
    'fantasy coloring',
    'flower coloring book',
    'zen coloring',
    'therapeutic coloring',
    'detailed coloring',
    'coloring book set'
  ],
  
  'journals': [
    'bullet journal',
    'gratitude journal',
    '2025 planner',
    'habit tracker',
    'daily planner',
    'fitness planner',
    'wedding planner',
    'leather journal',
    'guided journal',
    'academic planner',
    'productivity planner',
    'mindfulness journal',
    'travel journal',
    'recipe journal',
    'prayer journal'
  ],
  
  'stickers': [
    'planner stickers',
    'laptop stickers',
    'vinyl decals',
    'wall stickers',
    'bullet journal stickers',
    'motivational stickers',
    'aesthetic stickers',
    'car decals',
    'waterproof stickers',
    'custom stickers',
    'die cut stickers',
    'holographic stickers',
    'calendar stickers',
    'reward stickers',
    'sticker pack'
  ],
  
  'art-supplies': [
    'acrylic paint set',
    'watercolor palette',
    'artist brushes',
    'canvas panels',
    'sketch pad',
    'colored pencils',
    'art markers',
    'drawing tablet',
    'oil pastels',
    'easel stand',
    'paint by numbers',
    'art storage',
    'mixed media paper',
    'gouache paint',
    'artist gift set'
  ],
  
  'craft-kits': [
    'diy craft kits',
    'knitting kit',
    'embroidery kit',
    'candle making kit',
    'jewelry making',
    'sewing kit',
    'soap making kit',
    'macrame kit',
    'pottery kit',
    'resin craft kit',
    'scrapbooking kit',
    'crochet kit',
    'painting kit',
    'weaving kit',
    'craft subscription box'
  ],
  
  'handmade': [
    'handmade jewelry',
    'artisan pottery',
    'hand carved wood',
    'custom leather',
    'handwoven textiles',
    'handcrafted gifts',
    'artisan soap',
    'handmade ceramics',
    'custom woodwork',
    'hand painted',
    'handmade candles',
    'artisan chocolate',
    'handcrafted furniture',
    'custom metalwork',
    'handmade clothing'
  ],
  
  'home-decor': [
    'wall art prints',
    'modern decor',
    'farmhouse decor',
    'minimalist decor',
    'bohemian decor',
    'canvas wall art',
    'decorative pillows',
    'table centerpiece',
    'wall mirror',
    'photo frames',
    'artificial plants',
    'decorative vase',
    'wall shelves',
    'accent lighting',
    'throw blankets'
  ],
  
  'furniture': [
    'bedroom furniture',
    'office desk',
    'storage cabinet',
    'dining table',
    'accent chair',
    'bookshelf',
    'tv stand',
    'coffee table',
    'outdoor furniture',
    'standing desk',
    'sofa couch',
    'bar stool',
    'nightstand',
    'dresser',
    'console table'
  ],
  
  'kitchen': [
    'kitchen gadgets',
    'cookware set',
    'dinnerware set',
    'food storage',
    'baking tools',
    'knife set',
    'cutting board',
    'serving platter',
    'coffee maker',
    'mixer',
    'dutch oven',
    'measuring cups',
    'kitchen organizer',
    'wine glasses',
    'utensil set'
  ],
  
  'garden': [
    'garden tools',
    'planters pots',
    'outdoor lighting',
    'garden decor',
    'vegetable seeds',
    'watering can',
    'raised garden bed',
    'garden hose',
    'plant markers',
    'composting bin',
    'pruning shears',
    'bird feeder',
    'garden stakes',
    'soil tester',
    'greenhouse'
  ],
  
  'clothing': [
    'casual wear',
    'activewear',
    'winter jacket',
    'summer dress',
    'yoga pants',
    'graphic tee',
    'denim jeans',
    'hoodie',
    'leggings',
    'formal wear',
    'vintage clothing',
    'loungewear',
    'workout clothes',
    'business casual',
    'oversized sweater'
  ],
  
  'jewelry': [
    'necklace pendant',
    'earrings studs',
    'bracelet charm',
    'engagement ring',
    'handmade jewelry',
    'gold necklace',
    'silver ring',
    'vintage jewelry',
    'birthstone jewelry',
    'minimalist jewelry',
    'statement earrings',
    'personalized jewelry',
    'fashion jewelry',
    'jewelry set',
    'wedding jewelry'
  ],
  
  'bags': [
    'leather backpack',
    'tote bag',
    'crossbody bag',
    'laptop bag',
    'travel luggage',
    'messenger bag',
    'clutch purse',
    'gym bag',
    'diaper bag',
    'wallet',
    'handbag',
    'weekender bag',
    'carry on luggage',
    'camera bag',
    'beach bag'
  ],
  
  'shoes': [
    'running shoes',
    'casual sneakers',
    'ankle boots',
    'sandals',
    'dress shoes',
    'hiking boots',
    'slip on shoes',
    'athletic shoes',
    'winter boots',
    'slippers',
    'platform shoes',
    'loafers',
    'high heels',
    'waterproof boots',
    'comfortable shoes'
  ],
  
  'electronics': [
    'wireless earbuds',
    'smart watch',
    'phone accessories',
    'portable charger',
    'bluetooth speaker',
    'laptop stand',
    'webcam',
    'usb hub',
    'wireless keyboard',
    'tablet',
    'fitness tracker',
    'phone case',
    'screen protector',
    'power bank',
    'charging cable'
  ],
  
  'gaming': [
    'gaming headset',
    'gaming mouse',
    'gaming keyboard',
    'controller',
    'gaming chair',
    'ps5 games',
    'xbox games',
    'nintendo switch',
    'gaming desk',
    'pc games',
    'gaming monitor',
    'vr headset',
    'gaming console',
    'game capture card',
    'gaming accessories'
  ],
  
  'toys': [
    'educational toys',
    'building blocks',
    'action figures',
    'dolls',
    'board games',
    'outdoor toys',
    'stem toys',
    'pretend play',
    'puzzle toys',
    'remote control',
    'stuffed animals',
    'toy cars',
    'art toys',
    'musical toys',
    'learning toys'
  ],
  
  'puzzles': [
    'jigsaw puzzle 1000',
    '3d puzzle',
    'wooden puzzle',
    'puzzle mat',
    'brain teaser',
    'kids puzzle',
    'floor puzzle',
    'puzzle storage',
    'puzzle glue',
    'challenging puzzle',
    'scenic puzzle',
    'animal puzzle',
    'puzzle frame',
    '500 piece puzzle',
    'puzzle board'
  ],
  
  'baby': [
    'baby clothes',
    'baby toys',
    'nursery decor',
    'baby monitor',
    'diaper bag',
    'baby carrier',
    'baby blanket',
    'baby bottles',
    'baby bath',
    'crib sheets',
    'baby gear',
    'teething toys',
    'baby safety',
    'nursery furniture',
    'baby feeding'
  ],
  
  'beauty': [
    'skincare routine',
    'makeup palette',
    'hair care',
    'nail polish',
    'face mask',
    'moisturizer',
    'lipstick',
    'eyeshadow',
    'foundation',
    'serum',
    'makeup brushes',
    'hair tools',
    'perfume',
    'beauty tools',
    'cosmetic organizer'
  ],
  
  'health': [
    'vitamins',
    'supplements',
    'protein powder',
    'yoga mat',
    'resistance bands',
    'fitness tracker',
    'essential oils',
    'massage tools',
    'meditation cushion',
    'foam roller',
    'water bottle',
    'exercise equipment',
    'health monitor',
    'wellness kit',
    'meal prep containers'
  ],
  
  'pets': [
    'dog toys',
    'cat toys',
    'pet bed',
    'dog collar',
    'cat tree',
    'pet food',
    'pet grooming',
    'dog leash',
    'pet bowl',
    'pet carrier',
    'cat litter',
    'dog treats',
    'pet clothing',
    'aquarium',
    'pet accessories'
  ],
  
  'food': [
    'gourmet coffee',
    'organic tea',
    'specialty snacks',
    'artisan chocolate',
    'organic honey',
    'gourmet popcorn',
    'dried fruits',
    'spice set',
    'hot sauce',
    'gourmet gift',
    'protein bars',
    'nuts seeds',
    'organic food',
    'specialty candy',
    'coffee beans'
  ],
  
  'sports': [
    'yoga equipment',
    'workout gear',
    'resistance bands',
    'dumbbells',
    'exercise mat',
    'foam roller',
    'sports apparel',
    'gym bag',
    'water bottle',
    'sports equipment',
    'fitness accessories',
    'training gear',
    'athletic wear',
    'sports watch',
    'exercise bike'
  ],
  
  'outdoor': [
    'camping gear',
    'hiking backpack',
    'tent',
    'sleeping bag',
    'camping stove',
    'outdoor clothing',
    'fishing gear',
    'bike accessories',
    'climbing gear',
    'outdoor tools',
    'camping accessories',
    'survival kit',
    'portable grill',
    'cooler',
    'outdoor blanket'
  ],
  
  'seasonal': [
    'christmas decor',
    'halloween costumes',
    'easter decorations',
    'holiday lights',
    'christmas gifts',
    'seasonal wreath',
    'holiday ornaments',
    'halloween props',
    'festive decorations',
    'christmas tree',
    'holiday stockings',
    'seasonal candles',
    'party decorations',
    'festive garland',
    'holiday tableware'
  ],
  
  'wedding': [
    'wedding invitations',
    'bridal shower',
    'wedding decorations',
    'wedding favors',
    'party supplies',
    'wedding centerpiece',
    'bridal accessories',
    'wedding signs',
    'guest book',
    'wedding cake topper',
    'table decorations',
    'bridal gift',
    'wedding party',
    'event decor',
    'celebration supplies'
  ],
  
  'office': [
    'desk organizer',
    'office supplies',
    'planner',
    'desk accessories',
    'file folders',
    'sticky notes',
    'pens pencils',
    'desk lamp',
    'whiteboard',
    'paper clips',
    'notebook',
    'calendar',
    'desk pad',
    'storage bins',
    'label maker'
  ],
  
  'automotive': [
    'car accessories',
    'car cleaning',
    'car organizer',
    'phone mount',
    'car charger',
    'floor mats',
    'seat covers',
    'car tools',
    'air freshener',
    'dash cam',
    'tire accessories',
    'car care',
    'interior accessories',
    'exterior accessories',
    'car gadgets'
  ],
  
  'other': [
    'trending products',
    'gift ideas',
    'bestsellers',
    'popular items',
    'unique gifts',
    'must have',
    'new arrivals',
    'deals',
    'hot items',
    'gift guide',
    'trending now',
    'popular gifts',
    'unique finds',
    'best gifts',
    'top rated'
  ]
};

/**
 * Get seed keywords for a category
 */
export const getSeedKeywordsForCategory = (categoryId: string): string[] => {
  return CATEGORY_SEED_KEYWORDS[categoryId] || CATEGORY_SEED_KEYWORDS['other'];
};

/**
 * Get all seed keywords across all categories
 */
export const getAllSeedKeywords = (): string[] => {
  const allKeywords: string[] = [];
  for (const keywords of Object.values(CATEGORY_SEED_KEYWORDS)) {
    allKeywords.push(...keywords);
  }
  return allKeywords;
};

/**
 * Get random seed keywords from a category
 */
export const getRandomSeedKeywords = (categoryId: string, count: number = 5): string[] => {
  const keywords = getSeedKeywordsForCategory(categoryId);
  const shuffled = [...keywords].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
};
