/**
 * Central Category Definition System
 * Single source of truth for all product categories across the entire system
 */

export interface ProductCategory {
  id: string;
  name: string;
  description: string;
  keywords: string[];        // Keywords that indicate this category
  subcategories: string[];   // More specific sub-types
  priority: number;          // 1-10, higher = more important
}

export const PRODUCT_CATEGORIES: ProductCategory[] = [
  // Books & Publishing
  { 
    id: 'books', 
    name: 'Books & Literature', 
    description: 'Books, novels, eBooks, and reading materials',
    keywords: ['book', 'novel', 'ebook', 'kindle', 'reading', 'author', 'literature', 'paperback', 'hardcover'], 
    subcategories: ['fiction', 'non-fiction', 'textbooks', 'comics', 'manga', 'romance', 'mystery', 'thriller', 'biography'], 
    priority: 10 
  },
  { 
    id: 'coloring', 
    name: 'Coloring Books', 
    description: 'Adult and children coloring books',
    keywords: ['coloring', 'color book', 'adult coloring', 'kids coloring', 'coloring page', 'mandala'], 
    subcategories: ['mandala', 'animals', 'nature', 'fantasy', 'stress relief', 'mindfulness', 'patterns'], 
    priority: 10 
  },
  { 
    id: 'journals', 
    name: 'Journals & Planners', 
    description: 'Journals, planners, diaries, and organizers',
    keywords: ['journal', 'planner', 'diary', 'notebook', 'organizer', 'bullet journal', 'agenda'], 
    subcategories: ['bullet journal', 'gratitude', 'fitness planner', 'wedding planner', 'daily planner', 'academic planner'], 
    priority: 10 
  },
  { 
    id: 'stickers', 
    name: 'Stickers & Decals', 
    description: 'Stickers, decals, and adhesive decorations',
    keywords: ['sticker', 'decal', 'label', 'vinyl', 'adhesive', 'planner sticker'], 
    subcategories: ['laptop stickers', 'wall decals', 'planner stickers', 'car decals', 'vinyl stickers'], 
    priority: 9 
  },
  
  // Arts & Crafts
  { 
    id: 'art-supplies', 
    name: 'Art Supplies', 
    description: 'Art materials and supplies for artists',
    keywords: ['art supply', 'paint', 'canvas', 'brush', 'easel', 'acrylic', 'watercolor', 'sketch'], 
    subcategories: ['acrylic paint', 'watercolor', 'oil paint', 'drawing', 'markers', 'colored pencils', 'pastels'], 
    priority: 9 
  },
  { 
    id: 'craft-kits', 
    name: 'Craft Kits', 
    description: 'DIY craft kits and hobby projects',
    keywords: ['craft kit', 'diy kit', 'hobby kit', 'maker kit', 'craft project', 'diy project'], 
    subcategories: ['sewing', 'knitting', 'embroidery', 'candle making', 'soap making', 'jewelry making'], 
    priority: 9 
  },
  { 
    id: 'handmade', 
    name: 'Handmade Goods', 
    description: 'Artisan and handcrafted items',
    keywords: ['handmade', 'artisan', 'handcraft', 'custom made', 'hand crafted', 'homemade'], 
    subcategories: ['jewelry', 'pottery', 'woodwork', 'leather', 'textile art', 'metalwork'], 
    priority: 8 
  },
  
  // Home & Living
  { 
    id: 'home-decor', 
    name: 'Home Decor', 
    description: 'Home decorations and interior design',
    keywords: ['home decor', 'wall art', 'decoration', 'interior', 'decorative', 'accent'], 
    subcategories: ['wall art', 'sculptures', 'vases', 'mirrors', 'frames', 'candles', 'throw pillows'], 
    priority: 8 
  },
  { 
    id: 'furniture', 
    name: 'Furniture', 
    description: 'Home and office furniture',
    keywords: ['furniture', 'chair', 'table', 'sofa', 'desk', 'cabinet', 'shelf', 'couch'], 
    subcategories: ['bedroom', 'living room', 'office', 'outdoor', 'dining', 'storage'], 
    priority: 7 
  },
  { 
    id: 'kitchen', 
    name: 'Kitchen & Dining', 
    description: 'Kitchen tools, cookware, and dining items',
    keywords: ['kitchen', 'cookware', 'dinnerware', 'utensil', 'cooking', 'baking', 'food prep'], 
    subcategories: ['pots', 'plates', 'glasses', 'storage', 'appliances', 'cutlery', 'serving'], 
    priority: 7 
  },
  { 
    id: 'garden', 
    name: 'Garden & Outdoor', 
    description: 'Garden supplies and outdoor items',
    keywords: ['garden', 'outdoor', 'patio', 'lawn', 'plant', 'gardening', 'yard'], 
    subcategories: ['planters', 'tools', 'furniture', 'lighting', 'seeds', 'pots', 'decorations'], 
    priority: 7 
  },
  
  // Fashion & Accessories
  { 
    id: 'clothing', 
    name: 'Clothing & Apparel', 
    description: 'Clothing and fashion apparel',
    keywords: ['clothing', 'shirt', 'dress', 'pants', 'apparel', 'wear', 'fashion', 'outfit'], 
    subcategories: ['mens', 'womens', 'kids', 'activewear', 'formal', 'casual', 'vintage'], 
    priority: 8 
  },
  { 
    id: 'jewelry', 
    name: 'Jewelry & Accessories', 
    description: 'Jewelry and fashion accessories',
    keywords: ['jewelry', 'necklace', 'ring', 'bracelet', 'earring', 'accessory', 'jewel'], 
    subcategories: ['gold', 'silver', 'handmade', 'vintage', 'costume', 'fine jewelry', 'beaded'], 
    priority: 8 
  },
  { 
    id: 'bags', 
    name: 'Bags & Luggage', 
    description: 'Bags, purses, and travel luggage',
    keywords: ['bag', 'purse', 'backpack', 'luggage', 'wallet', 'tote', 'suitcase', 'handbag'], 
    subcategories: ['handbags', 'travel', 'laptop bags', 'messenger', 'crossbody', 'clutch'], 
    priority: 7 
  },
  { 
    id: 'shoes', 
    name: 'Shoes & Footwear', 
    description: 'Shoes, boots, and footwear',
    keywords: ['shoe', 'boot', 'sneaker', 'sandal', 'footwear', 'slipper', 'heel'], 
    subcategories: ['athletic', 'casual', 'formal', 'outdoor', 'boots', 'sandals', 'slippers'], 
    priority: 7 
  },
  
  // Electronics & Tech
  { 
    id: 'electronics', 
    name: 'Electronics', 
    description: 'Electronic devices and gadgets',
    keywords: ['electronic', 'gadget', 'device', 'tech', 'digital', 'smart'], 
    subcategories: ['smartphones', 'tablets', 'laptops', 'accessories', 'wearables', 'audio'], 
    priority: 8 
  },
  { 
    id: 'gaming', 
    name: 'Gaming', 
    description: 'Video games and gaming accessories',
    keywords: ['gaming', 'video game', 'console', 'gamer', 'game', 'esports'], 
    subcategories: ['pc gaming', 'console', 'accessories', 'merchandise', 'controllers', 'headsets'], 
    priority: 8 
  },
  
  // Toys & Kids
  { 
    id: 'toys', 
    name: 'Toys & Games', 
    description: 'Toys, games, and children playthings',
    keywords: ['toy', 'game', 'play', 'kids toy', 'children toy', 'playset'], 
    subcategories: ['educational', 'action figures', 'dolls', 'outdoor', 'building blocks', 'board games'], 
    priority: 8 
  },
  { 
    id: 'puzzles', 
    name: 'Puzzles & Brain Games', 
    description: 'Puzzles and brain teaser games',
    keywords: ['puzzle', 'jigsaw', 'brain teaser', 'logic game', 'puzzle game'], 
    subcategories: ['jigsaw', '3d puzzles', 'wooden', 'kids', 'adult puzzles', '1000 piece'], 
    priority: 8 
  },
  { 
    id: 'baby', 
    name: 'Baby & Nursery', 
    description: 'Baby products and nursery items',
    keywords: ['baby', 'infant', 'nursery', 'toddler', 'newborn'], 
    subcategories: ['clothing', 'gear', 'toys', 'feeding', 'bath', 'safety'], 
    priority: 7 
  },
  
  // Health & Beauty
  { 
    id: 'beauty', 
    name: 'Beauty & Cosmetics', 
    description: 'Beauty products and cosmetics',
    keywords: ['beauty', 'makeup', 'cosmetic', 'skincare', 'cosmetics', 'beauty product'], 
    subcategories: ['makeup', 'skincare', 'haircare', 'fragrance', 'nail care', 'bath products'], 
    priority: 8 
  },
  { 
    id: 'health', 
    name: 'Health & Wellness', 
    description: 'Health and wellness products',
    keywords: ['health', 'wellness', 'fitness', 'vitamin', 'supplement', 'wellbeing'], 
    subcategories: ['supplements', 'fitness equipment', 'meditation', 'yoga', 'essential oils'], 
    priority: 7 
  },
  
  // Pets
  { 
    id: 'pets', 
    name: 'Pet Supplies', 
    description: 'Pet products and animal supplies',
    keywords: ['pet', 'dog', 'cat', 'animal', 'puppy', 'kitten', 'pet supply'], 
    subcategories: ['food', 'toys', 'beds', 'grooming', 'collars', 'treats', 'accessories'], 
    priority: 7 
  },
  
  // Food & Drink
  { 
    id: 'food', 
    name: 'Food & Gourmet', 
    description: 'Food products and gourmet items',
    keywords: ['food', 'gourmet', 'snack', 'organic', 'edible', 'treat'], 
    subcategories: ['snacks', 'coffee', 'tea', 'specialty', 'organic', 'sweets', 'spices'], 
    priority: 6 
  },
  
  // Sports & Outdoors
  { 
    id: 'sports', 
    name: 'Sports & Fitness', 
    description: 'Sports and fitness equipment',
    keywords: ['sport', 'fitness', 'exercise', 'athletic', 'workout', 'training'], 
    subcategories: ['equipment', 'apparel', 'accessories', 'weights', 'cardio', 'team sports'], 
    priority: 7 
  },
  { 
    id: 'outdoor', 
    name: 'Outdoor Recreation', 
    description: 'Outdoor and camping equipment',
    keywords: ['outdoor', 'camping', 'hiking', 'adventure', 'outdoor gear', 'recreation'], 
    subcategories: ['camping gear', 'hiking', 'fishing', 'cycling', 'climbing', 'survival'], 
    priority: 7 
  },
  
  // Seasonal & Events
  { 
    id: 'seasonal', 
    name: 'Seasonal & Holiday', 
    description: 'Seasonal and holiday items',
    keywords: ['christmas', 'halloween', 'easter', 'holiday', 'seasonal', 'festive'], 
    subcategories: ['decorations', 'gifts', 'costumes', 'ornaments', 'lights', 'wreaths'], 
    priority: 6 
  },
  { 
    id: 'wedding', 
    name: 'Wedding & Party', 
    description: 'Wedding and party supplies',
    keywords: ['wedding', 'party', 'celebration', 'event', 'bridal', 'reception'], 
    subcategories: ['invitations', 'decorations', 'favors', 'supplies', 'tableware', 'centerpieces'], 
    priority: 7 
  },
  
  // Other
  { 
    id: 'office', 
    name: 'Office & School', 
    description: 'Office and school supplies',
    keywords: ['office', 'school', 'stationery', 'supplies', 'desk', 'student'], 
    subcategories: ['desk', 'organization', 'writing', 'storage', 'paper', 'folders'], 
    priority: 6 
  },
  { 
    id: 'automotive', 
    name: 'Automotive', 
    description: 'Car and automotive products',
    keywords: ['car', 'auto', 'vehicle', 'automotive', 'motor'], 
    subcategories: ['accessories', 'parts', 'tools', 'maintenance', 'interior', 'exterior'], 
    priority: 5 
  },
  { 
    id: 'other', 
    name: 'Other', 
    description: 'Miscellaneous products',
    keywords: [], 
    subcategories: [], 
    priority: 1 
  },
];

// Total: 31 categories (30 + other)
export const CATEGORY_IDS = PRODUCT_CATEGORIES.map(c => c.id);

export const getCategoryById = (id: string): ProductCategory | undefined => {
  return PRODUCT_CATEGORIES.find(c => c.id === id);
};

export const getCategoryByKeyword = (keyword: string): ProductCategory | undefined => {
  const lowerKeyword = keyword.toLowerCase();
  
  // First try exact keyword match
  for (const category of PRODUCT_CATEGORIES) {
    if (category.keywords.some(kw => lowerKeyword.includes(kw))) {
      return category;
    }
  }
  
  // Then try subcategory match
  for (const category of PRODUCT_CATEGORIES) {
    if (category.subcategories.some(sub => lowerKeyword.includes(sub))) {
      return category;
    }
  }
  
  // Default to 'other'
  return getCategoryById('other');
};

export const getAllCategories = (): ProductCategory[] => {
  return [...PRODUCT_CATEGORIES];
};
