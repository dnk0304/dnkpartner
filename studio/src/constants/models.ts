// Shared constants for AI models, aspect ratios, and settings
// Single source of truth - import from here in App.tsx and AdvancedModeLayout.tsx

// ============================================================================
// IMAGE MODELS
// ============================================================================

export interface AIModel {
  value: string
  label: string
  basePrice: number
  priceUnit: string
}

export const AI_MODELS: AIModel[] = [
  { value: "gemini-3-pro-image-preview", label: "Gemini 3 Pro", basePrice: 0.13, priceUnit: "/img" },
  { value: "z-image-turbo", label: "Z Image Turbo (RunPod)", basePrice: 0, priceUnit: "/img" },
  { value: "z-image-turbo-replicate", label: "Z Image Turbo (Replicate)", basePrice: 0.0025, priceUnit: "/img" },
  { value: "dall-e-3", label: "DALL-E 3 (OpenAI)", basePrice: 0.04, priceUnit: "/img" },
  { value: "gpt-image-1", label: "GPT Image 1 (OpenAI)", basePrice: 0.04, priceUnit: "/img" },
]

// ============================================================================
// ASPECT RATIOS (4 options only)
// ============================================================================

export interface AspectRatio {
  value: string
  label: string
}

export const ASPECT_RATIOS: AspectRatio[] = [
  { value: "1:1", label: "1:1 (Square)" },
  { value: "9:16", label: "9:16 (Phone)" },
  { value: "16:9", label: "16:9 (Widescreen)" },
  { value: "8x10", label: "8x10 (KDP)" },
  { value: "custom", label: "Custom..." },
]

// ============================================================================
// IMAGE SIZES
// ============================================================================

export interface ImageSize {
  value: string
  label: string
  description: string
  multiplier: number
}

export const IMAGE_SIZES: ImageSize[] = [
  { value: "1K", label: "1K (~1024px)", description: "Fast generation", multiplier: 1 },
  { value: "2K", label: "2K (~2048px)", description: "Balanced", multiplier: 1.5 },
  { value: "4K", label: "4K (~4096px)", description: "High quality", multiplier: 2 },
]

// ============================================================================
// VIDEO MODELS
// ============================================================================

export interface VideoModel {
  value: string
  label: string
  basePrice: number
  priceUnit: string
}

export const VIDEO_MODELS: VideoModel[] = [
  { value: "veo-3", label: "Veo 3 (Google)", basePrice: 0.05, priceUnit: "/video" },
  { value: "veo-3.1", label: "Veo 3.1 (Google)", basePrice: 0.08, priceUnit: "/video" },
  { value: "sora-2", label: "Sora 2 (Replicate)", basePrice: 0.10, priceUnit: "/video" },
]

// ============================================================================
// VIDEO SETTINGS
// ============================================================================

export interface VideoQuality {
  value: string
  label: string
}

export const VIDEO_QUALITIES: VideoQuality[] = [
  { value: "standard", label: "Standard" },
  { value: "high", label: "High Quality" },
  { value: "ultra", label: "Ultra HD" },
]

export interface VideoFPS {
  value: string
  label: string
}

export const VIDEO_FPS_OPTIONS: VideoFPS[] = [
  { value: "24", label: "24 FPS" },
  { value: "30", label: "30 FPS" },
  { value: "60", label: "60 FPS" },
]

export interface VideoAspectRatio {
  value: string
  label: string
}

export const VIDEO_ASPECT_RATIOS: VideoAspectRatio[] = [
  { value: "16:9", label: "16:9 (Landscape)" },
  { value: "9:16", label: "9:16 (Portrait)" },
]

export const VIDEO_ASPECT_RATIOS_SORA: VideoAspectRatio[] = [
  { value: "16:9", label: "16:9 (Landscape)" },
  { value: "9:16", label: "9:16 (Portrait)" },
  { value: "1:1", label: "1:1 (Square)" },
]

// ============================================================================
// STUDIO MODES
// ============================================================================

export interface StudioMode {
  value: string
  label: string
  description: string
}

export const STUDIO_MODES: StudioMode[] = [
  { value: "off", label: "Off", description: "No style applied" },
  { value: "simple", label: "Simple", description: "Apply imagery style only" },
  { value: "advanced", label: "Advanced", description: "Full story base + style" },
]

// ============================================================================
// PRICING HELPERS
// ============================================================================

/**
 * Get the display price string for an image model
 * @param modelValue - The model value (e.g., "gemini-3-pro-image-preview")
 * @param sizeValue - Optional size value to apply multiplier (e.g., "2K")
 * @returns Formatted price string (e.g., "$0.13/img" or "FREE")
 */
export function getImageModelPrice(modelValue: string, sizeValue?: string): string {
  const model = AI_MODELS.find(m => m.value === modelValue)
  if (!model) return "$0.00/img"
  
  if (model.basePrice === 0) return "FREE"
  
  let price = model.basePrice
  
  // Apply size multiplier if provided
  if (sizeValue) {
    const size = IMAGE_SIZES.find(s => s.value === sizeValue)
    if (size) {
      price *= size.multiplier
    }
  }
  
  // Format price
  if (price < 0.01) {
    return `$${price.toFixed(4)}${model.priceUnit}`
  }
  return `$${price.toFixed(2)}${model.priceUnit}`
}

/**
 * Get the display price string for a video model
 * @param modelValue - The model value (e.g., "veo-3")
 * @param quality - Optional quality value to apply multiplier
 * @param duration - Optional duration in seconds
 * @returns Formatted price string (e.g., "$0.05-0.15/video")
 */
export function getVideoModelPrice(modelValue: string, quality?: string, duration?: number): string {
  const model = VIDEO_MODELS.find(m => m.value === modelValue)
  if (!model) return "$0.00/video"
  
  let basePrice = model.basePrice
  let maxPrice = basePrice * 3 // Estimate max price as 3x base
  
  // Adjust for quality
  if (quality === "high") {
    basePrice *= 1.5
    maxPrice *= 1.5
  } else if (quality === "ultra") {
    basePrice *= 2
    maxPrice *= 2
  }
  
  // Adjust for duration (longer = more expensive)
  if (duration && duration > 5) {
    const durationMultiplier = duration / 5
    basePrice *= durationMultiplier
    maxPrice *= durationMultiplier
  }
  
  return `~$${basePrice.toFixed(2)}-${maxPrice.toFixed(2)}`
}

/**
 * Get a model's label by its value
 */
export function getModelLabel(modelValue: string, isVideo: boolean = false): string {
  if (isVideo) {
    const model = VIDEO_MODELS.find(m => m.value === modelValue)
    return model?.label || modelValue
  }
  const model = AI_MODELS.find(m => m.value === modelValue)
  return model?.label || modelValue
}

// ============================================================================
// DYNAMIC TOTAL PRICE CALCULATION
// ============================================================================

/**
 * Calculate raw price for a single image (number, not formatted)
 */
export function calculateImagePrice(modelValue: string, sizeValue?: string): number {
  const model = AI_MODELS.find(m => m.value === modelValue)
  if (!model) return 0
  
  let price = model.basePrice
  
  // Apply size multiplier if provided
  if (sizeValue) {
    const size = IMAGE_SIZES.find(s => s.value === sizeValue)
    if (size) {
      price *= size.multiplier
    }
  }
  
  return price
}

/**
 * Calculate raw price for a single video (number, not formatted)
 */
export function calculateVideoPrice(modelValue: string, quality?: string, duration?: number): number {
  const model = VIDEO_MODELS.find(m => m.value === modelValue)
  if (!model) return 0
  
  let price = model.basePrice
  
  // Adjust for quality
  if (quality === "high") {
    price *= 1.5
  } else if (quality === "ultra") {
    price *= 2
  }
  
  // Adjust for duration (longer = more expensive)
  if (duration && duration > 5) {
    const durationMultiplier = duration / 5
    price *= durationMultiplier
  }
  
  return price
}

/**
 * Calculate total estimated cost for a batch of generations
 * @param mode - "image" or "video"
 * @param validPromptCount - Number of valid (non-empty) prompts
 * @param settings - Current settings for image or video mode
 * @returns Object with totalCost (number), formattedTotal (string), and perUnit (string)
 */
export function calculateTotalEstimatedCost(
  mode: "image" | "video",
  validPromptCount: number,
  settings: {
    // Image settings
    imageModel?: string
    imageSize?: string
    // Video settings
    videoModel?: string
    videoQuality?: string
    videoDuration?: number
  }
): { totalCost: number; formattedTotal: string; perUnit: string; isFree: boolean } {
  if (validPromptCount === 0) {
    return { totalCost: 0, formattedTotal: "$0.00", perUnit: "$0.00", isFree: true }
  }
  
  let perUnitCost = 0
  
  if (mode === "image") {
    perUnitCost = calculateImagePrice(settings.imageModel || "", settings.imageSize)
  } else {
    perUnitCost = calculateVideoPrice(
      settings.videoModel || "",
      settings.videoQuality,
      settings.videoDuration
    )
  }
  
  const totalCost = perUnitCost * validPromptCount
  const isFree = perUnitCost === 0
  
  // Format the prices
  const formatPrice = (price: number): string => {
    if (price === 0) return "FREE"
    if (price < 0.01) return `$${price.toFixed(4)}`
    return `$${price.toFixed(2)}`
  }
  
  return {
    totalCost,
    formattedTotal: isFree ? "FREE" : formatPrice(totalCost),
    perUnit: formatPrice(perUnitCost),
    isFree,
  }
}

// ============================================================================
// CUSTOM ASPECT RATIO HELPERS
// ============================================================================

/**
 * Validate custom aspect ratio format (e.g., "10:16", "3:4")
 * @param input - The custom ratio string
 * @returns true if valid format with range 1-99:1-99
 */
export function isValidCustomAspectRatio(input: string): boolean {
  // Must match format W:H where W and H are 1-99 (no leading zeros)
  const match = input.match(/^([1-9][0-9]?):([1-9][0-9]?)$/)
  return match !== null
}

/**
 * Calculate dimensions from custom aspect ratio
 * @param ratio - The aspect ratio string (e.g., "10:16")
 * @param baseSize - Base size to fit within (default 1024)
 * @returns Object with width/height, or null if invalid
 */
export function calculateCustomDimensions(
  ratio: string, 
  baseSize: number = 1024
): { width: number; height: number } | null {
  const match = ratio.match(/^(\d+):(\d+)$/)
  if (!match) return null
  
  const w = parseInt(match[1])
  const h = parseInt(match[2])
  
  if (w < 1 || w > 99 || h < 1 || h > 99) return null
  
  // Normalize to fit within baseSize while maintaining aspect ratio
  if (w >= h) {
    // Landscape or square
    return {
      width: baseSize,
      height: Math.round(baseSize * (h / w))
    }
  } else {
    // Portrait
    return {
      width: Math.round(baseSize * (w / h)),
      height: baseSize
    }
  }
}
