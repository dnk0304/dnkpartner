// ============================================================
// DNK AI Studio - Studio Mode Type Definitions
// ============================================================

// Character definition
export interface StoryCharacter {
  id: string
  name: string
  description: string // Detailed description: appearance, personality, clothing, etc.
  createdAt: number
  updatedAt?: number
}

// Object/Prop definition
export interface StoryObject {
  id: string
  name: string
  description: string // Detailed description: color, size, material, condition, etc.
  createdAt: number
  updatedAt?: number
}

// Environment/Scenery definition
export interface StoryEnvironment {
  id: string
  name: string
  description: string // Detailed description: location, weather, time of day, setting, etc.
  createdAt: number
  updatedAt?: number
}

// Atmospheric Effect/Visual definition
export interface StoryAtmosphere {
  id: string
  name: string
  description: string // Detailed description: lighting, mood, weather effects, particles, etc.
  createdAt: number
  updatedAt?: number
}

// Imagery Style definition
export interface ImageryStyle {
  id: string
  name: string
  description: string // Description of the style (e.g., "Pixar 3D Cartoon", "Photorealistic")
  prompt: string // The prompt text to add for this style
  previewImage?: string // URL to the preview image (generated or uploaded)
  previewImages?: string[] // Multiple preview images for hover gallery
  characteristics?: string // Detailed characteristics about the style
  examplePrompts?: string[] // Example prompts showcasing the style
  isCustom: boolean // Whether this is a user-created custom style or a preset
  createdAt: number
  updatedAt?: number
}

// Complete Story Base - combines all elements
export interface StoryBase {
  id: string
  name: string // User-defined name for this story base (e.g., "Sci-Fi Adventure")
  description?: string // Optional description
  
  // Collections of story elements
  characters: StoryCharacter[]
  objects: StoryObject[]
  environments: StoryEnvironment[]
  atmospheres: StoryAtmosphere[]
  
  // The selected imagery style for this story base
  imageryStyle: ImageryStyle | null
  
  // Metadata
  createdAt: number
  updatedAt?: number
  lastUsed?: number
}

// Preset imagery styles (built-in)
export const IMAGERY_STYLE_PRESETS: Omit<ImageryStyle, "id" | "createdAt" | "updatedAt">[] = [
  {
    name: "Photorealistic",
    description: "DSLR quality, natural lighting, lifelike details",
    prompt: "photorealistic, DSLR quality, natural lighting, high detail, lifelike, 8k resolution",
    isCustom: false,
  },
  {
    name: "Cinematic Reality",
    description: "Hollywood film look, anamorphic, teal and orange color grading",
    prompt: "cinematic reality, Hollywood film look, anamorphic lens, teal and orange color grading, dramatic lighting, film grain",
    isCustom: false,
  },
  {
    name: "Super Reality",
    description: "Hyper-detailed beyond photography, extreme HDR",
    prompt: "super reality, hyper-detailed, beyond photography, extreme HDR, crystal clear, ultra sharp, maximum detail",
    isCustom: false,
  },
  {
    name: "Anime Style",
    description: "Cel-shaded, vibrant colors, Studio Ghibli inspired",
    prompt: "anime style, cel-shaded, vibrant colors, Studio Ghibli inspired, detailed linework, soft shading",
    isCustom: false,
  },
  {
    name: "Extreme Anime",
    description: "Advanced anime-focused style excelling at illustrative and CG anime aesthetics",
    prompt: "extreme anime style, advanced anime illustration, highly detailed anime art, dramatic lighting, cinematic anime composition, vibrant saturated colors, intricate character design, professional anime quality, atmospheric effects, dynamic poses, expressive eyes, detailed hair rendering, soft gradients, luminous skin, elaborate clothing details, anime masterpiece quality",
    characteristics: "A new advanced Anime-focused model that excels at a range of anime. Illustrative and CG styles with dramatic lighting, intricate details, and professional quality rendering.",
    examplePrompts: [
      "A mysterious anime girl with blue hair and red eyes wearing an elaborate white dress, bat wings, standing under a full moon, dramatic lighting, extreme anime style",
      "A fierce anime warrior with flowing silver hair wielding a crystalline sword, surrounded by magical energy, detailed armor, extreme anime quality",
      "An elegant anime princess in a moonlit garden, cherry blossoms falling, ethereal glow, intricate dress details, extreme anime illustration",
      "A dark anime sorcerer casting powerful spells, purple lightning, dramatic shadows, detailed robes, extreme anime CG style"
    ],
    isCustom: false,
  },
  {
    name: "Pixar 3D Cartoon",
    description: "Pixar/Disney 3D animation style, rounded features, expressive characters",
    prompt: "Pixar 3D cartoon style, Disney animation, rounded features, expressive faces, colorful, family-friendly, smooth 3D rendering",
    isCustom: false,
  },
  {
    name: "Classic 2D Cartoon",
    description: "Looney Tunes style, bold outlines, rubbery animation",
    prompt: "classic 2D cartoon style, Looney Tunes inspired, bold black outlines, exaggerated features, vibrant flat colors, rubbery animation",
    isCustom: false,
  },
  {
    name: "Black Line Art",
    description: "Coloring book style, clean outlines, no fill",
    prompt: "black line art, coloring book style, clean outlines, no fill, white background, detailed linework, suitable for coloring",
    isCustom: false,
  },
  {
    name: "Oil Painting",
    description: "Classical oil painting, visible brushstrokes, Renaissance style",
    prompt: "oil painting style, classical art, visible brushstrokes, Renaissance inspired, rich colors, textured canvas",
    isCustom: false,
  },
  {
    name: "Watercolor",
    description: "Soft washes, bleeding colors, dreamy atmosphere",
    prompt: "watercolor painting, soft washes, bleeding colors, dreamy atmosphere, textured paper, delicate details",
    isCustom: false,
  },
  {
    name: "Cyberpunk",
    description: "Neon lights, rain-soaked streets, holographic displays, Blade Runner aesthetic",
    prompt: "cyberpunk style, neon lights, rain-soaked streets, holographic displays, Blade Runner aesthetic, futuristic dystopia, high tech low life",
    isCustom: false,
  },
  {
    name: "Fantasy Art",
    description: "Epic fantasy, magical elements, concept art quality",
    prompt: "fantasy art style, epic fantasy, magical elements, concept art quality, dramatic lighting, mythical creatures, detailed environments",
    isCustom: false,
  },
  {
    name: "Minimalist",
    description: "Clean lines, geometric shapes, negative space, modern",
    prompt: "minimalist style, clean lines, geometric shapes, negative space, modern design, simple color palette, uncluttered",
    isCustom: false,
  },
  {
    name: "Vintage Retro",
    description: "1970s-80s aesthetic, film grain, nostalgic",
    prompt: "vintage retro style, 1970s-80s aesthetic, film grain, nostalgic, faded colors, analog photography, classic design",
    isCustom: false,
  },
  {
    name: "3D Render",
    description: "Octane render, ray-traced lighting, product visualization quality",
    prompt: "3D render style, Octane render, ray-traced lighting, product visualization quality, reflections, ambient occlusion, studio lighting",
    isCustom: false,
  },
  {
    name: "Comic Book",
    description: "Bold outlines, halftone dots, Marvel/DC style",
    prompt: "comic book style, bold outlines, halftone dots, Marvel/DC inspired, dynamic action, speech bubbles, dramatic panels",
    isCustom: false,
  },
  {
    name: "Pixel Art",
    description: "16-bit retro gaming style, sprite-like",
    prompt: "pixel art style, 16-bit retro gaming, sprite-like, limited color palette, nostalgic gaming aesthetic, sharp pixels",
    isCustom: false,
  },
  {
    name: "Dark & Moody",
    description: "Film noir, low-key lighting, mysterious atmosphere",
    prompt: "dark and moody style, film noir, low-key lighting, mysterious atmosphere, heavy shadows, dramatic contrast, brooding",
    isCustom: false,
  },
]

// Helper to create a default empty story base
export function createEmptyStoryBase(name: string = "Untitled Story"): StoryBase {
  return {
    id: `story-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name,
    description: "",
    characters: [],
    objects: [],
    environments: [],
    atmospheres: [],
    imageryStyle: null,
    createdAt: Date.now(),
  }
}

// Helper to generate unique IDs for story elements
export function generateStoryElementId(type: "character" | "object" | "environment" | "atmosphere" | "style"): string {
  return `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

// Type for the mode selection
export type StudioModeType = "off" | "simple" | "advanced"

// Enhanced prompt result (when Studio Mode is active)
export interface EnhancedPromptResult {
  originalPrompt: string
  enhancedPrompt: string
  redLineContext: string // The "red line" - story base context that was added
  imageryStyleApplied: string | null
  usedElements: {
    characters: string[]
    objects: string[]
    environments: string[]
    atmospheres: string[]
  }
}





