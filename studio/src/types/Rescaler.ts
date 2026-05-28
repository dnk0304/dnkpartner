// Amazon KDP Trim Sizes (in inches)
export const KDP_TRIM_SIZES = {
  "5x8": { width: 5, height: 8, label: '5" x 8"' },
  "5.06x7.81": { width: 5.06, height: 7.81, label: '5.06" x 7.81" (12.9 x 19.8 cm)' },
  "5.25x8": { width: 5.25, height: 8, label: '5.25" x 8"' },
  "5.5x8.5": { width: 5.5, height: 8.5, label: '5.5" x 8.5"' },
  "6x9": { width: 6, height: 9, label: '6" x 9"' },
  "6.14x9.21": { width: 6.14, height: 9.21, label: '6.14" x 9.21" (15.6 x 23.4 cm)' },
  "6.69x9.61": { width: 6.69, height: 9.61, label: '6.69" x 9.61" (17 x 24.4 cm)' },
  "7x10": { width: 7, height: 10, label: '7" x 10"' },
  "7.44x9.69": { width: 7.44, height: 9.69, label: '7.44" x 9.69" (18.9 x 24.6 cm)' },
  "7.5x9.25": { width: 7.5, height: 9.25, label: '7.5" x 9.25"' },
  "8x10": { width: 8, height: 10, label: '8" x 10"' },
  "8.25x6": { width: 8.25, height: 6, label: '8.25" x 6" (Landscape)' },
  "8.25x8.25": { width: 8.25, height: 8.25, label: '8.25" x 8.25" (Square)' },
  "8.5x8.5": { width: 8.5, height: 8.5, label: '8.5" x 8.5" (Square)' },
  "8.5x11": { width: 8.5, height: 11, label: '8.5" x 11" (Letter)' },
  "8.27x11.69": { width: 8.27, height: 11.69, label: '8.27" x 11.69" (A4)' },
} as const

export type KDPTrimSizeKey = keyof typeof KDP_TRIM_SIZES

// Amazon KDP Book Styles
export const KDP_BOOK_STYLES = [
  { value: "paperback-black-white", label: "Paperback - Black & White Interior" },
  { value: "paperback-standard-color", label: "Paperback - Standard Color Interior" },
  { value: "paperback-premium-color", label: "Paperback - Premium Color Interior" },
  { value: "hardcover-black-white", label: "Hardcover - Black & White Interior" },
  { value: "hardcover-standard-color", label: "Hardcover - Standard Color Interior" },
  { value: "hardcover-premium-color", label: "Hardcover - Premium Color Interior" },
] as const

// Amazon KDP Paper Types (Official Specifications)
export const KDP_PAPER_TYPES = {
  "white": { 
    label: "White Paper (B&W)", 
    caliper: 0.002252, // inches per sheet
    description: "Standard white paper for black & white interiors"
  },
  "cream": { 
    label: "Cream Paper (B&W)", 
    caliper: 0.0025, // inches per sheet
    description: "Cream-colored paper for black & white interiors"
  },
  "standard-color": { 
    label: "Standard Color Paper", 
    caliper: 0.002252, // inches per sheet
    description: "Standard paper for color interiors"
  },
  "premium-color": { 
    label: "Premium Color Paper", 
    caliper: 0.002347, // inches per sheet
    description: "Premium quality paper for color interiors"
  },
} as const

export type KDPPaperType = keyof typeof KDP_PAPER_TYPES

// Cover spine width calculation (Official Amazon KDP formula)
// Source: https://kdp.amazon.com/en_US/help/topic/G201953020
// Formula: page count × paper caliper
// Note: KDP requires minimum 24 pages for paperback books
export function calculateSpineWidth(pageCount: number, paperType: KDPPaperType): number {
  // KDP minimum page count is 24 for paperback books
  const effectivePageCount = Math.max(24, pageCount)
  const caliper = KDP_PAPER_TYPES[paperType].caliper
  return effectivePageCount * caliper
}

// Calculate spine width from book style (legacy support)
export function calculateSpineWidthFromBookStyle(pageCount: number, bookStyle: string): number {
  // Map book style to paper type
  if (bookStyle.includes("premium-color")) {
    return calculateSpineWidth(pageCount, "premium-color")
  } else if (bookStyle.includes("standard-color")) {
    return calculateSpineWidth(pageCount, "standard-color")
  } else if (bookStyle.includes("cream")) {
    return calculateSpineWidth(pageCount, "cream")
  } else {
    return calculateSpineWidth(pageCount, "white")
  }
}

// Calculate full cover dimensions (front + spine + back + bleed)
// Official Amazon KDP formula from: https://kdp.amazon.com/en_US/help/topic/G201953020
export interface CoverDimensions {
  trimWidth: number // Single page trim width
  trimHeight: number // Single page trim height
  spineWidth: number // Calculated spine width
  bleed: number // Standard bleed (0.125 inches for KDP)
  totalWidth: number // Full cover width: bleed + backCover + spine + frontCover + bleed
  totalHeight: number // Full cover height: bleed + trimHeight + bleed
  frontCoverX: number // X position where front cover starts
  backCoverX: number // X position where back cover starts
  spineX: number // X position where spine starts
}

export function calculateCoverDimensions(
  trimSize: KDPTrimSizeKey,
  pageCount: number,
  paperType: KDPPaperType
): CoverDimensions {
  const trim = KDP_TRIM_SIZES[trimSize]
  const spineWidth = calculateSpineWidth(pageCount, paperType)
  const bleed = 0.125 // KDP standard bleed (0.125" or 3.2mm)
  
  // Official KDP formula:
  // Cover Width = Bleed + Back Cover Width + Spine Width + Front Cover Width + Bleed
  // Cover Height = Bleed + Trim Height + Bleed
  const totalWidth = bleed + trim.width + spineWidth + trim.width + bleed
  const totalHeight = bleed + trim.height + bleed
  
  return {
    trimWidth: trim.width,
    trimHeight: trim.height,
    spineWidth,
    bleed,
    totalWidth,
    totalHeight,
    backCoverX: bleed, // Back cover starts after left bleed
    spineX: bleed + trim.width, // Spine starts after back cover
    frontCoverX: bleed + trim.width + spineWidth, // Front cover starts after spine
  }
}

// Rescaler image interface
export interface RescalerImage {
  id: string
  file: File
  preview: string // Data URL
  originalWidth: number
  originalHeight: number
  targetWidth?: number // In inches
  targetHeight?: number // In inches
  dpi: number // Default 300 for print
  position: { x: number; y: number } // Position on canvas (for multi-page)
  scale: number // Scale factor
  rotation: number // Rotation in degrees
}

// Export formats
export type ExportFormat = "pdf" | "png" | "jpeg" | "tiff"

// Size orientations
export const SIZE_ORIENTATIONS = {
  portrait: { label: "Portrait", description: "Vertical orientation" },
  landscape: { label: "Landscape", description: "Horizontal orientation" },
  square: { label: "Square", description: "Equal width and height" },
  widescreen: { label: "Widescreen (16:9)", description: "Cinematic ratio" },
  ultrawide: { label: "Ultrawide (21:9)", description: "Ultra-widescreen" },
} as const

export type SizeOrientation = keyof typeof SIZE_ORIENTATIONS

// Size unit
export type SizeUnit = "inches" | "pixels"

// Rescaler project
export interface RescalerProject {
  id: string
  name: string
  mode: "standard" | "amazon-kdp"
  createdAt: number
  updatedAt: number
  
  // Standard mode settings
  customWidth?: number // In inches or pixels
  customHeight?: number // In inches or pixels
  sizeUnit?: SizeUnit // Unit for custom dimensions
  orientation?: SizeOrientation // Preset orientation
  exportFormat?: ExportFormat // Export format for standard mode
  
  // Amazon KDP mode settings
  kdpTrimSize?: KDPTrimSizeKey
  kdpBookStyle?: string
  kdpPageCount?: number
  kdpPaperType?: KDPPaperType // Official paper type for accurate spine calculation
  kdpCoverType?: "interior" | "full-cover" // Interior pages or full cover
  
  // Cover image for Step 4 (KDP mode)
  coverImage?: RescalerImage
  
  // Legacy cover template settings (for backwards compatibility)
  frontCoverImage?: RescalerImage
  backCoverImage?: RescalerImage
  
  // Common settings
  dpi: number // Default 300
  images: RescalerImage[]
  pdfFileName: string
}

export function createEmptyRescalerProject(): RescalerProject {
  return {
    id: generateProjectId(),
    name: "Untitled Project",
    mode: "standard",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    sizeUnit: "inches",
    exportFormat: "pdf",
    dpi: 300,
    images: [],
    pdfFileName: "output.pdf",
  }
}

function generateProjectId(): string {
  return `project_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

export function generateImageId(): string {
  return `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

// Get DPI recommendation based on size and purpose
export function getDPIRecommendation(widthInches: number, heightInches: number): {
  dpi: number
  label: string
  description: string
} {
  const area = widthInches * heightInches
  
  // Large format prints
  if (area > 100) {
    return {
      dpi: 150,
      label: "150 DPI",
      description: "Large format print (posters, banners)",
    }
  }
  
  // Standard print
  if (area > 50) {
    return {
      dpi: 200,
      label: "200 DPI",
      description: "Medium format print",
    }
  }
  
  // High quality print
  return {
    dpi: 300,
    label: "300 DPI",
    description: "High quality print (books, magazines)",
  }
}

// Convert inches to pixels
export function inchesToPixels(inches: number, dpi: number): number {
  return Math.round(inches * dpi)
}

// Convert pixels to inches
export function pixelsToInches(pixels: number, dpi: number): number {
  return Number((pixels / dpi).toFixed(2))
}

// Get dimensions from orientation preset
export function getDimensionsFromOrientation(orientation: SizeOrientation): {
  width: number
  height: number
} {
  switch (orientation) {
    case "portrait":
      return { width: 8.5, height: 11 } // Letter portrait
    case "landscape":
      return { width: 11, height: 8.5 } // Letter landscape
    case "square":
      return { width: 8, height: 8 } // Square
    case "widescreen":
      return { width: 16, height: 9 } // 16:9
    case "ultrawide":
      return { width: 21, height: 9 } // 21:9
    default:
      return { width: 8.5, height: 11 }
  }
}

