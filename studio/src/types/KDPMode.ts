// ============================================================================
// KDP Mode Types - Complete Type Definitions for Amazon KDP Book Creation
// ============================================================================

// Re-export trim sizes from Rescaler for consistency
export { 
  KDP_TRIM_SIZES, 
  KDP_PAPER_TYPES,
  KDP_BOOK_STYLES,
  calculateSpineWidth,
  calculateCoverDimensions,
  type KDPTrimSizeKey,
  type KDPPaperType,
  type CoverDimensions,
} from './Rescaler'

// Re-export cover analysis types from coverAnalyzer
export type {
  CoverAnalysisResult,
  CoverIssue,
  DimensionCheck,
  ResolutionCheck,
  SafeZoneCheck,
  BleedCheck,
  SpineCheck,
  BarcodeCheck,
  TextCheck,
  ImageCheck,
} from '../components/KDPMode/utils/coverAnalyzer'

// ============================================================================
// Book Configuration Types
// ============================================================================

export type BookType = "paperback" | "hardcover" | "ebook"
export type InteriorType = "black-white" | "standard-color" | "premium-color"
export type BindingType = "perfect" | "case-laminate" | "saddle-stitch"

export const BOOK_TYPES = {
  paperback: {
    label: "Paperback",
    description: "Soft cover, perfect binding. Most popular for novels and non-fiction.",
    icon: "📖",
    bindings: ["perfect"] as BindingType[],
  },
  hardcover: {
    label: "Hardcover",
    description: "Durable case laminate cover. Premium feel for special editions.",
    icon: "📚",
    bindings: ["case-laminate"] as BindingType[],
  },
  ebook: {
    label: "eBook",
    description: "Digital format for Kindle. No physical printing required.",
    icon: "📱",
    bindings: [] as BindingType[],
  },
} as const

export const INTERIOR_TYPES = {
  "black-white": {
    label: "Black & White",
    description: "Standard B&W interior. Best for text-heavy books.",
    paperTypes: ["white", "cream"] as const,
    priceMultiplier: 1.0,
  },
  "standard-color": {
    label: "Standard Color",
    description: "Full color on standard paper. Good for photos and illustrations.",
    paperTypes: ["standard-color"] as const,
    priceMultiplier: 2.5,
  },
  "premium-color": {
    label: "Premium Color",
    description: "Highest quality color on premium paper. Best for art books.",
    paperTypes: ["premium-color"] as const,
    priceMultiplier: 3.5,
  },
} as const

// ============================================================================
// Image & Element Types
// ============================================================================

export interface KDPImage {
  id: string
  src: string // Base64 data URL or blob URL
  fileName: string
  originalWidth: number
  originalHeight: number
  position: { x: number; y: number }
  scale: number // Uniform scale (legacy, still used for proportional scaling)
  scaleX?: number // Independent horizontal scale (optional, defaults to scale)
  scaleY?: number // Independent vertical scale (optional, defaults to scale)
  rotation: number
  opacity: number
  flipX: boolean
  flipY: boolean
  cropRect?: {
    x: number
    y: number
    width: number
    height: number
  }
  filters?: {
    brightness: number
    contrast: number
    saturation: number
    blur: number
  }
}

export interface KDPTextElement {
  id: string
  type: "text"
  content: string
  position: { x: number; y: number }
  width: number
  height: number
  rotation: number
  coverPart?: "front" | "back" | "spine" // Which cover part this text belongs to (for safe zone constraints)
  locked?: boolean
  visible?: boolean
  zIndex?: number
  backgroundColor?: string // Optional background color for text box
  backgroundOpacity?: number // Optional background opacity (0-1)
  style: {
    fontFamily: string
    fontSize: number
    fontWeight: "normal" | "bold"
    fontStyle: "normal" | "italic"
    color: string
    textAlign: "left" | "center" | "right"
    lineHeight: number
    letterSpacing: number
    opacity?: number
  }
}

// Barcode placeholder for cover preview (not included in final export)
export interface KDPBarcodeElement {
  id: string
  type: "barcode"
  position: { x: number; y: number }
  width: number
  height: number
  coverPart: "back" // Barcode always on back cover
  isPlaceholder: true // Always true - never included in final export
}

export interface KDPShapeElement {
  id: string
  type: "shape"
  shapeType: "rectangle" | "circle" | "line" | "arrow"
  position: { x: number; y: number }
  width: number
  height: number
  rotation: number
  coverPart?: "front" | "back" | "spine" // Which cover part this shape belongs to
  locked?: boolean
  visible?: boolean
  zIndex?: number
  style: {
    fill: string
    stroke: string
    strokeWidth: number
    opacity: number
    borderRadius?: number
  }
}

export type KDPElement = KDPTextElement | KDPShapeElement | KDPBarcodeElement

// ============================================================================
// Page Types
// ============================================================================

export interface KDPPage {
  id: string
  pageNumber: number
  images: KDPImage[]
  elements: KDPElement[]
  backgroundColor: string
  template?: string // Template ID if using a template
}

export function createEmptyPage(pageNumber: number): KDPPage {
  return {
    id: generateKDPId("page"),
    pageNumber,
    images: [],
    elements: [],
    backgroundColor: "#ffffff",
  }
}

// ============================================================================
// Cover Types
// ============================================================================

export interface KDPCover {
  // Individual cover parts (for separate upload)
  frontImage?: KDPImage
  backImage?: KDPImage
  spineImage?: KDPImage
  
  // Full wrap cover (single image)
  fullCoverImage?: KDPImage
  
  // Spine text (auto-generated or custom)
  spineText?: string
  spineTextStyle?: {
    fontFamily: string
    fontSize: number
    color: string
    rotation: "horizontal" | "vertical-up" | "vertical-down"
  }
  
  // Additional cover elements
  elements: KDPElement[]
  
  // Cover background
  backgroundColor: string
  
  // Panel backgrounds (per-panel colors)
  panelBackgrounds?: {
    front?: string  // hex color
    back?: string
    spine?: string
  }
  
  // Background fit mode for each panel
  backgroundFitMode?: {
    front?: 'trim' | 'bleed'  // 'trim' = safe zone only, 'bleed' = full canvas with bleed
    back?: 'trim' | 'bleed'
    spine?: 'trim' | 'bleed'
    full?: 'trim' | 'bleed'   // For full wrap cover mode
  }
}

export function createEmptyCover(): KDPCover {
  return {
    elements: [],
    backgroundColor: "#ffffff",
    spineTextStyle: {
      fontFamily: "Arial",
      fontSize: 14,
      color: "#000000",
      rotation: "vertical-down",
    },
  }
}

// ============================================================================
// Export Settings
// ============================================================================

export type ExportFormat = "pdf" | "pdf-cover" | "pdf-interior" | "png-cover"
export type ColorProfile = "rgb" | "cmyk"

export interface KDPExportSettings {
  format: ExportFormat
  includeBleed: boolean
  includeCropMarks: boolean
  colorProfile: ColorProfile
  resolution: number // DPI (300 for print, 72 for preview)
  compression: "none" | "low" | "medium" | "high"
  flattenLayers: boolean
  embedFonts: boolean
}

export const DEFAULT_EXPORT_SETTINGS: KDPExportSettings = {
  format: "pdf",
  includeBleed: true,
  includeCropMarks: false,
  colorProfile: "rgb",
  resolution: 300,
  compression: "high",
  flattenLayers: true,
  embedFonts: true,
}

// ============================================================================
// Project Types
// ============================================================================

export type ProjectStatus = "draft" | "ready" | "exported"

export interface KDPProject {
  id: string
  name: string
  description?: string
  createdAt: number
  updatedAt: number
  status: ProjectStatus
  
  // Book configuration
  bookType: BookType
  trimSize: string // KDPTrimSizeKey
  interiorType: InteriorType
  paperType: string // KDPPaperType
  pageCount: number // Interior page count
  coverPageCount?: number // Separate page count for cover spine calculation (optional, defaults to pageCount)
  
  // Content
  cover: KDPCover
  pages: KDPPage[]
  
  // Metadata
  metadata: {
    title?: string
    author?: string
    isbn?: string
    publisher?: string
    language?: string
    keywords?: string[]
  }
  
  // Export settings
  exportSettings: KDPExportSettings
  
  // Thumbnail for project list
  thumbnail?: string
}

export function createEmptyProject(): KDPProject {
  return {
    id: generateKDPId("project"),
    name: "Untitled Book",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: "draft",
    
    bookType: "paperback",
    trimSize: "6x9",
    interiorType: "black-white",
    paperType: "white",
    pageCount: 0, // User can freely type any count
    coverPageCount: undefined, // Defaults to pageCount if not set, or can be set independently
    
    cover: createEmptyCover(),
    pages: [],
    
    metadata: {},
    exportSettings: { ...DEFAULT_EXPORT_SETTINGS },
  }
}

// ============================================================================
// Template Types
// ============================================================================

export interface KDPTemplate {
  id: string
  name: string
  description: string
  category: "novel" | "children" | "coloring" | "photo" | "journal" | "cookbook" | "custom"
  thumbnail: string
  
  // Default settings
  defaultTrimSize: string
  defaultInteriorType: InteriorType
  defaultBookType: BookType
  
  // Page templates
  pageTemplates: {
    id: string
    name: string
    layout: "full-bleed" | "centered" | "grid-2" | "grid-4" | "text-only"
  }[]
}

export const BOOK_TEMPLATES: KDPTemplate[] = [
  {
    id: "novel",
    name: "Novel",
    description: "Classic novel format with text-focused layout",
    category: "novel",
    thumbnail: "📖",
    defaultTrimSize: "5.5x8.5",
    defaultInteriorType: "black-white",
    defaultBookType: "paperback",
    pageTemplates: [
      { id: "text-full", name: "Full Text", layout: "text-only" },
      { id: "chapter-start", name: "Chapter Start", layout: "centered" },
    ],
  },
  {
    id: "children",
    name: "Children's Book",
    description: "Square format perfect for illustrated children's books",
    category: "children",
    thumbnail: "🧒",
    defaultTrimSize: "8.5x8.5",
    defaultInteriorType: "premium-color",
    defaultBookType: "hardcover",
    pageTemplates: [
      { id: "full-bleed", name: "Full Bleed Image", layout: "full-bleed" },
      { id: "image-text", name: "Image with Text", layout: "centered" },
    ],
  },
  {
    id: "coloring",
    name: "Coloring Book",
    description: "Large format for detailed coloring pages",
    category: "coloring",
    thumbnail: "🎨",
    defaultTrimSize: "8.5x11",
    defaultInteriorType: "black-white",
    defaultBookType: "paperback",
    pageTemplates: [
      { id: "full-page", name: "Full Page Art", layout: "full-bleed" },
      { id: "bordered", name: "Bordered Art", layout: "centered" },
    ],
  },
  {
    id: "photo",
    name: "Photo Book",
    description: "Showcase your photos in premium quality",
    category: "photo",
    thumbnail: "📷",
    defaultTrimSize: "8.5x11",
    defaultInteriorType: "premium-color",
    defaultBookType: "hardcover",
    pageTemplates: [
      { id: "single", name: "Single Photo", layout: "full-bleed" },
      { id: "grid-2", name: "2 Photo Grid", layout: "grid-2" },
      { id: "grid-4", name: "4 Photo Grid", layout: "grid-4" },
    ],
  },
  {
    id: "journal",
    name: "Journal / Planner",
    description: "Lined or dotted pages for journaling",
    category: "journal",
    thumbnail: "📓",
    defaultTrimSize: "6x9",
    defaultInteriorType: "black-white",
    defaultBookType: "paperback",
    pageTemplates: [
      { id: "lined", name: "Lined Page", layout: "text-only" },
      { id: "dotted", name: "Dotted Page", layout: "text-only" },
      { id: "blank", name: "Blank Page", layout: "text-only" },
    ],
  },
  {
    id: "cookbook",
    name: "Cookbook",
    description: "Recipe-friendly layout with space for photos",
    category: "cookbook",
    thumbnail: "👨‍🍳",
    defaultTrimSize: "7x10",
    defaultInteriorType: "standard-color",
    defaultBookType: "paperback",
    pageTemplates: [
      { id: "recipe", name: "Recipe Page", layout: "centered" },
      { id: "photo-spread", name: "Photo Spread", layout: "full-bleed" },
    ],
  },
]

// ============================================================================
// Wizard Step Types
// ============================================================================

export type WizardStep = 
  | "book-setup"
  | "interior"
  | "cover"
  | "export"
  | "preview"

export const WIZARD_STEPS: { id: WizardStep; label: string; icon: string }[] = [
  { id: "book-setup", label: "Book Setup", icon: "BookOpen" },
  { id: "interior", label: "Interior", icon: "FileText" },
  { id: "cover", label: "Cover", icon: "Palette" },
  { id: "export", label: "Export", icon: "Download" },
  { id: "preview", label: "Preview", icon: "Eye" },
]

// ============================================================================
// Canvas Types
// ============================================================================

export interface CanvasViewport {
  zoom: number
  panX: number
  panY: number
}

export interface CanvasGuides {
  showBleed: boolean
  showTrim: boolean
  showSafeZone: boolean
  showGrid: boolean
  showRulers: boolean
  snapToGrid: boolean
  gridSize: number // in pixels
}

export const DEFAULT_CANVAS_GUIDES: CanvasGuides = {
  showBleed: true,
  showTrim: true,
  showSafeZone: true,
  showGrid: false,
  showRulers: true,
  snapToGrid: true,
  gridSize: 10,
}

// ============================================================================
// Utility Functions
// ============================================================================

export function generateKDPId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

export function calculatePageDimensions(
  trimSize: string,
  dpi: number,
  includeBleed: boolean = false
): { width: number; height: number; bleed: number } {
  // Import dynamically to avoid circular dependency
  const KDP_TRIM_SIZES: Record<string, { width: number; height: number }> = {
    "5x8": { width: 5, height: 8 },
    "5.06x7.81": { width: 5.06, height: 7.81 },
    "5.25x8": { width: 5.25, height: 8 },
    "5.5x8.5": { width: 5.5, height: 8.5 },
    "6x9": { width: 6, height: 9 },
    "6.14x9.21": { width: 6.14, height: 9.21 },
    "6.69x9.61": { width: 6.69, height: 9.61 },
    "7x10": { width: 7, height: 10 },
    "7.44x9.69": { width: 7.44, height: 9.69 },
    "7.5x9.25": { width: 7.5, height: 9.25 },
    "8x10": { width: 8, height: 10 },
    "8.25x6": { width: 8.25, height: 6 },
    "8.25x8.25": { width: 8.25, height: 8.25 },
    "8.5x8.5": { width: 8.5, height: 8.5 },
    "8.5x11": { width: 8.5, height: 11 },
    "8.27x11.69": { width: 8.27, height: 11.69 },
  }
  
  const trim = KDP_TRIM_SIZES[trimSize] || { width: 6, height: 9 }
  const bleedInches = 0.125 // KDP standard bleed
  const bleedPx = bleedInches * dpi
  
  const baseWidth = trim.width * dpi
  const baseHeight = trim.height * dpi
  
  if (includeBleed) {
    return {
      width: baseWidth + (bleedPx * 2),
      height: baseHeight + (bleedPx * 2),
      bleed: bleedPx,
    }
  }
  
  return {
    width: baseWidth,
    height: baseHeight,
    bleed: bleedPx,
  }
}

export function validateProject(project: KDPProject): {
  valid: boolean
  errors: string[]
  warnings: string[]
} {
  const errors: string[] = []
  const warnings: string[] = []
  
  // Check page count
  if (project.pageCount < 24) {
    errors.push("KDP requires a minimum of 24 pages")
  }
  if (project.pageCount > 828) {
    errors.push("KDP maximum is 828 pages")
  }
  if (project.pageCount % 2 !== 0) {
    warnings.push("Page count should be even for proper printing")
  }
  
  // Check pages match count
  if (project.pages.length !== project.pageCount) {
    warnings.push(`Project has ${project.pages.length} pages but page count is set to ${project.pageCount}`)
  }
  
  // Check cover
  if (!project.cover.fullCoverImage && !project.cover.frontImage) {
    warnings.push("No cover image uploaded")
  }
  
  // Check for empty pages
  const emptyPages = project.pages.filter(p => p.images.length === 0 && p.elements.length === 0)
  if (emptyPages.length > 0) {
    warnings.push(`${emptyPages.length} pages have no content`)
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

// ============================================================================
// Color Utilities
// ============================================================================

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null
}

export function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map(x => {
    const hex = x.toString(16)
    return hex.length === 1 ? "0" + hex : hex
  }).join("")
}

