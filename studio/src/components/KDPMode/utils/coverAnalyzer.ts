// ============================================================================
// KDP Cover Analyzer - Validates covers against Amazon KDP specifications
// Official specs: https://kdp.amazon.com/en_US/help/topic/G201953020
// ============================================================================

import {
  KDPProject,
  KDPImage,
  KDPTextElement,
  KDPShapeElement,
  KDPBarcodeElement,
  KDPElement,
  calculateCoverDimensions,
  KDPTrimSizeKey,
  KDPPaperType,
} from "@/types/KDPMode"

// ============================================================================
// Analysis Result Types
// ============================================================================

export interface CoverAnalysisResult {
  approved: boolean
  score: number // 0-100
  criticalErrors: CoverIssue[]    // Will cause KDP rejection
  warnings: CoverIssue[]          // May cause issues
  suggestions: CoverIssue[]       // Best practices
  details: {
    dimensions: DimensionCheck
    resolution: ResolutionCheck
    safeZone: SafeZoneCheck
    bleed: BleedCheck
    spine: SpineCheck
    barcode: BarcodeCheck
    textElements: TextCheck[]
    imageElements: ImageCheck[]
  }
}

export interface CoverIssue {
  type: 'critical' | 'warning' | 'suggestion'
  category: string
  message: string
  details: string
  element?: string // Which element is affected
  position?: { x: number; y: number }
  fix?: string // How to fix it
}

export interface DimensionCheck {
  passed: boolean
  expectedWidth: number  // inches
  expectedHeight: number // inches
  actualWidth: number    // inches
  actualHeight: number   // inches
  dpi: number
  issues: CoverIssue[]
}

export interface ResolutionCheck {
  passed: boolean
  actualDPI: number
  minimumDPI: number
  recommendedDPI: number
  issues: CoverIssue[]
}

export interface SafeZoneCheck {
  passed: boolean
  safeZoneMargin: number // inches (0.125")
  violatingElements: string[]
  issues: CoverIssue[]
}

export interface BleedCheck {
  passed: boolean
  bleedMargin: number // inches (0.125")
  hasFrontBleed: boolean
  hasBackBleed: boolean
  hasSpineBleed: boolean
  issues: CoverIssue[]
}

export interface SpineCheck {
  passed: boolean
  spineWidth: number // inches
  hasText: boolean
  textWithinBounds: boolean
  minimumPages: number // 24 pages for visible spine
  issues: CoverIssue[]
}

export interface BarcodeCheck {
  passed: boolean
  hasBarcodeArea: boolean
  barcodeAreaClear: boolean // 2" x 1.2" reserved area in lower right of back cover
  issues: CoverIssue[]
}

export interface TextCheck {
  element: KDPTextElement
  withinSafeZone: boolean
  readableSize: boolean // >= 6pt
  goodContrast: boolean
  issues: CoverIssue[]
}

export interface ImageCheck {
  element: KDPImage
  resolution: number // DPI at actual size
  upscaled: boolean
  upscalePercent: number
  withinBounds: boolean
  issues: CoverIssue[]
}

// ============================================================================
// Constants (Official KDP Specifications)
// ============================================================================

const KDP_SPECS = {
  MINIMUM_DPI: 300,
  RECOMMENDED_DPI: 300,
  BLEED_INCHES: 0.125, // 3.175mm
  SAFE_ZONE_INCHES: 0.125, // Distance from trim line
  SPINE_SAFE_ZONE_INCHES: 0.0625, // Spine text safety margin
  MINIMUM_PAGES_FOR_SPINE: 24,
  MINIMUM_FONT_SIZE_PT: 6,
  RECOMMENDED_FONT_SIZE_PT: 8,
  MAX_IMAGE_UPSCALE_CRITICAL: 1.5, // 150%
  MAX_IMAGE_UPSCALE_WARNING: 1.1,  // 110%
  BARCODE_WIDTH_INCHES: 2.0,
  BARCODE_HEIGHT_INCHES: 1.2,
  MAX_FILE_SIZE_MB: 650,
}

// ============================================================================
// Main Analysis Function
// ============================================================================

export function analyzeCover(project: KDPProject, dpi: number = 300): CoverAnalysisResult {
  const cover = project.cover
  const criticalErrors: CoverIssue[] = []
  const warnings: CoverIssue[] = []
  const suggestions: CoverIssue[] = []

  // Calculate expected dimensions
  const dimensions = calculateCoverDimensions(
    project.trimSize as KDPTrimSizeKey,
    project.coverPageCount || project.pageCount,
    project.paperType as KDPPaperType
  )

  // Run all checks
  const dimensionCheck = checkDimensions(project, dimensions, dpi)
  const resolutionCheck = checkResolution(dpi)
  const safeZoneCheck = checkSafeZones(cover, dimensions, dpi)
  const bleedCheck = checkBleed(cover, dimensions, dpi)
  const spineCheck = checkSpine(cover, dimensions, project.coverPageCount || project.pageCount, dpi)
  const barcodeCheck = checkBarcodeArea(cover, dimensions, dpi)
  const textChecks = checkTextElements(cover.elements, dimensions, dpi)
  const imageChecks = checkImageElements(cover, dpi)

  // Collect all issues
  criticalErrors.push(...dimensionCheck.issues.filter(i => i.type === 'critical'))
  criticalErrors.push(...resolutionCheck.issues.filter(i => i.type === 'critical'))
  criticalErrors.push(...safeZoneCheck.issues.filter(i => i.type === 'critical'))
  criticalErrors.push(...bleedCheck.issues.filter(i => i.type === 'critical'))
  criticalErrors.push(...spineCheck.issues.filter(i => i.type === 'critical'))
  criticalErrors.push(...barcodeCheck.issues.filter(i => i.type === 'critical'))
  textChecks.forEach(tc => criticalErrors.push(...tc.issues.filter(i => i.type === 'critical')))
  imageChecks.forEach(ic => criticalErrors.push(...ic.issues.filter(i => i.type === 'critical')))

  warnings.push(...dimensionCheck.issues.filter(i => i.type === 'warning'))
  warnings.push(...resolutionCheck.issues.filter(i => i.type === 'warning'))
  warnings.push(...safeZoneCheck.issues.filter(i => i.type === 'warning'))
  warnings.push(...bleedCheck.issues.filter(i => i.type === 'warning'))
  warnings.push(...spineCheck.issues.filter(i => i.type === 'warning'))
  warnings.push(...barcodeCheck.issues.filter(i => i.type === 'warning'))
  textChecks.forEach(tc => warnings.push(...tc.issues.filter(i => i.type === 'warning')))
  imageChecks.forEach(ic => warnings.push(...ic.issues.filter(i => i.type === 'warning')))

  suggestions.push(...dimensionCheck.issues.filter(i => i.type === 'suggestion'))
  suggestions.push(...resolutionCheck.issues.filter(i => i.type === 'suggestion'))
  suggestions.push(...safeZoneCheck.issues.filter(i => i.type === 'suggestion'))
  suggestions.push(...bleedCheck.issues.filter(i => i.type === 'suggestion'))
  suggestions.push(...spineCheck.issues.filter(i => i.type === 'suggestion'))
  suggestions.push(...barcodeCheck.issues.filter(i => i.type === 'suggestion'))
  textChecks.forEach(tc => suggestions.push(...tc.issues.filter(i => i.type === 'suggestion')))
  imageChecks.forEach(ic => suggestions.push(...ic.issues.filter(i => i.type === 'suggestion')))

  // Calculate score
  const score = calculateScore(criticalErrors, warnings, suggestions)

  // Determine if approved
  const approved = criticalErrors.length === 0

  return {
    approved,
    score,
    criticalErrors,
    warnings,
    suggestions,
    details: {
      dimensions: dimensionCheck,
      resolution: resolutionCheck,
      safeZone: safeZoneCheck,
      bleed: bleedCheck,
      spine: spineCheck,
      barcode: barcodeCheck,
      textElements: textChecks,
      imageElements: imageChecks,
    },
  }
}

// ============================================================================
// Individual Check Functions
// ============================================================================

function checkDimensions(
  project: KDPProject,
  dimensions: ReturnType<typeof calculateCoverDimensions>,
  dpi: number
): DimensionCheck {
  const issues: CoverIssue[] = []
  
  // For now, we assume the canvas is correctly sized
  // In a real implementation, you'd compare against actual canvas dimensions
  const expectedWidth = dimensions.totalWidth
  const expectedHeight = dimensions.totalHeight
  
  // These would come from actual canvas measurements
  const actualWidth = expectedWidth
  const actualHeight = expectedHeight
  
  const widthDiff = Math.abs(actualWidth - expectedWidth)
  const heightDiff = Math.abs(actualHeight - expectedHeight)
  
  const tolerance = 0.01 // 0.01 inch tolerance
  
  if (widthDiff > tolerance) {
    issues.push({
      type: 'critical',
      category: 'Dimensions',
      message: 'Cover width is incorrect',
      details: `Expected ${expectedWidth.toFixed(3)}" but got ${actualWidth.toFixed(3)}"`,
      fix: 'Recreate cover with correct trim size and page count settings',
    })
  }
  
  if (heightDiff > tolerance) {
    issues.push({
      type: 'critical',
      category: 'Dimensions',
      message: 'Cover height is incorrect',
      details: `Expected ${expectedHeight.toFixed(3)}" but got ${actualHeight.toFixed(3)}"`,
      fix: 'Recreate cover with correct trim size and page count settings',
    })
  }

  return {
    passed: issues.length === 0,
    expectedWidth,
    expectedHeight,
    actualWidth,
    actualHeight,
    dpi,
    issues,
  }
}

function checkResolution(dpi: number): ResolutionCheck {
  const issues: CoverIssue[] = []
  
  if (dpi < KDP_SPECS.MINIMUM_DPI) {
    issues.push({
      type: 'critical',
      category: 'Resolution',
      message: `Resolution is below minimum ${KDP_SPECS.MINIMUM_DPI} DPI`,
      details: `Current resolution: ${dpi} DPI`,
      fix: `Increase resolution to ${KDP_SPECS.MINIMUM_DPI} DPI or higher`,
    })
  } else if (dpi < KDP_SPECS.RECOMMENDED_DPI + 50) {
    issues.push({
      type: 'suggestion',
      category: 'Resolution',
      message: 'Consider higher resolution for best quality',
      details: `Current resolution: ${dpi} DPI`,
      fix: 'Use 350+ DPI for premium quality',
    })
  }

  return {
    passed: dpi >= KDP_SPECS.MINIMUM_DPI,
    actualDPI: dpi,
    minimumDPI: KDP_SPECS.MINIMUM_DPI,
    recommendedDPI: KDP_SPECS.RECOMMENDED_DPI,
    issues,
  }
}

function checkSafeZones(
  cover: KDPProject['cover'],
  dimensions: ReturnType<typeof calculateCoverDimensions>,
  dpi: number
): SafeZoneCheck {
  const issues: CoverIssue[] = []
  const violatingElements: string[] = []
  
  const safeZoneMargin = KDP_SPECS.SAFE_ZONE_INCHES
  const safeZoneMarginPx = safeZoneMargin * dpi
  const bleedPx = KDP_SPECS.BLEED_INCHES * dpi
  
  // Calculate safe zone boundaries in pixels
  const frontCoverX = (dimensions.frontCoverX + safeZoneMargin) * dpi
  const frontCoverMaxX = (dimensions.frontCoverX + dimensions.trimWidth - safeZoneMargin) * dpi
  const frontCoverY = (dimensions.bleed + safeZoneMargin) * dpi
  const frontCoverMaxY = (dimensions.bleed + dimensions.trimHeight - safeZoneMargin) * dpi
  
  const backCoverX = (dimensions.backCoverX + safeZoneMargin) * dpi
  const backCoverMaxX = (dimensions.backCoverX + dimensions.trimWidth - safeZoneMargin) * dpi
  const backCoverY = frontCoverY
  const backCoverMaxY = frontCoverMaxY
  
  const spineX = (dimensions.spineX + KDP_SPECS.SPINE_SAFE_ZONE_INCHES) * dpi
  const spineMaxX = (dimensions.spineX + dimensions.spineWidth - KDP_SPECS.SPINE_SAFE_ZONE_INCHES) * dpi
  
  // Check text elements
  cover.elements.forEach(element => {
    if (element.type === 'text' || element.type === 'shape') {
      const elem = element as KDPTextElement | KDPShapeElement
      const elemX = elem.position.x
      const elemY = elem.position.y
      const elemMaxX = elemX + elem.width
      const elemMaxY = elemY + elem.height
      
      let inSafeZone = true
      let coverPart = elem.coverPart || 'unknown'
      
      if (coverPart === 'front') {
        if (elemX < frontCoverX || elemMaxX > frontCoverMaxX || elemY < frontCoverY || elemMaxY > frontCoverMaxY) {
          inSafeZone = false
        }
      } else if (coverPart === 'back') {
        if (elemX < backCoverX || elemMaxX > backCoverMaxX || elemY < backCoverY || elemMaxY > backCoverMaxY) {
          inSafeZone = false
        }
      } else if (coverPart === 'spine') {
        if (elemX < spineX || elemMaxX > spineMaxX || elemY < frontCoverY || elemMaxY > frontCoverMaxY) {
          inSafeZone = false
        }
      }
      
      if (!inSafeZone) {
        const elementDesc = element.type === 'text' 
          ? `Text "${(elem as KDPTextElement).content?.substring(0, 20)}..."` 
          : `Shape ${elem.id}`
        
        violatingElements.push(elementDesc)
        
        const distanceOut = Math.max(
          Math.max(0, frontCoverX - elemX),
          Math.max(0, elemMaxX - frontCoverMaxX),
          Math.max(0, frontCoverY - elemY),
          Math.max(0, elemMaxY - frontCoverMaxY)
        )
        
        issues.push({
          type: 'critical',
          category: 'Safe Zone',
          message: `${elementDesc} extends outside safe zone`,
          details: `Element on ${coverPart} cover is ${(distanceOut / dpi).toFixed(3)}" outside safe zone`,
          element: elem.id,
          position: { x: elemX, y: elemY },
          fix: `Move element at least ${Math.ceil(distanceOut)}px toward center`,
        })
      }
    }
  })

  return {
    passed: violatingElements.length === 0,
    safeZoneMargin,
    violatingElements,
    issues,
  }
}

function checkBleed(
  cover: KDPProject['cover'],
  dimensions: ReturnType<typeof calculateCoverDimensions>,
  dpi: number
): BleedCheck {
  const issues: CoverIssue[] = []
  
  // Check if background extends to edges (full bleed)
  // This is a simplified check - in reality you'd analyze the actual image/background
  const hasFrontBleed = !!cover.fullCoverImage || !!cover.frontImage || !!cover.backgroundColor
  const hasBackBleed = !!cover.fullCoverImage || !!cover.backImage || !!cover.backgroundColor
  const hasSpineBleed = !!cover.fullCoverImage || !!cover.spineImage || !!cover.backgroundColor
  
  if (!hasFrontBleed) {
    issues.push({
      type: 'critical',
      category: 'Bleed',
      message: 'Front cover background does not extend to bleed area',
      details: 'Background must extend 0.125" beyond trim line on all sides',
      fix: 'Use "Fit to Bleed" or ensure background image covers entire canvas',
    })
  }
  
  if (!hasBackBleed) {
    issues.push({
      type: 'critical',
      category: 'Bleed',
      message: 'Back cover background does not extend to bleed area',
      details: 'Background must extend 0.125" beyond trim line on all sides',
      fix: 'Use "Fit to Bleed" or ensure background image covers entire canvas',
    })
  }
  
  // Note: Spine bleed is less critical for thin spines
  if (!hasSpineBleed && dimensions.spineWidth > 0.2) {
    issues.push({
      type: 'warning',
      category: 'Bleed',
      message: 'Spine background should extend to bleed area',
      details: 'Background should cover spine completely',
      fix: 'Ensure background extends across spine',
    })
  }

  return {
    passed: hasFrontBleed && hasBackBleed,
    bleedMargin: KDP_SPECS.BLEED_INCHES,
    hasFrontBleed,
    hasBackBleed,
    hasSpineBleed,
    issues,
  }
}

function checkSpine(
  cover: KDPProject['cover'],
  dimensions: ReturnType<typeof calculateCoverDimensions>,
  pageCount: number,
  dpi: number
): SpineCheck {
  const issues: CoverIssue[] = []
  
  const hasText = !!cover.spineText || cover.elements.some(e => 
    e.type === 'text' && (e as KDPTextElement).coverPart === 'spine'
  )
  
  let textWithinBounds = true
  
  // Check if spine text is within spine boundaries
  const spineElements = cover.elements.filter(e => 
    e.type === 'text' && (e as KDPTextElement).coverPart === 'spine'
  )
  
  const spineStartX = dimensions.spineX * dpi
  const spineEndX = (dimensions.spineX + dimensions.spineWidth) * dpi
  const spineSafeX = (dimensions.spineX + KDP_SPECS.SPINE_SAFE_ZONE_INCHES) * dpi
  const spineSafeMaxX = (dimensions.spineX + dimensions.spineWidth - KDP_SPECS.SPINE_SAFE_ZONE_INCHES) * dpi
  
  spineElements.forEach(element => {
    const elem = element as KDPTextElement
    const elemX = elem.position.x
    const elemMaxX = elemX + elem.width
    
    if (elemX < spineSafeX || elemMaxX > spineSafeMaxX) {
      textWithinBounds = false
      issues.push({
        type: 'critical',
        category: 'Spine',
        message: 'Spine text extends outside spine safe zone',
        details: `Text must be within ${KDP_SPECS.SPINE_SAFE_ZONE_INCHES}" from spine edges`,
        element: elem.id,
        position: { x: elemX, y: elem.position.y },
        fix: 'Reduce text size or move toward spine center',
      })
    }
  })
  
  // Warnings for thin spines
  if (pageCount < KDP_SPECS.MINIMUM_PAGES_FOR_SPINE && hasText) {
    issues.push({
      type: 'warning',
      category: 'Spine',
      message: 'Book may be too thin for spine text',
      details: `Books under ${KDP_SPECS.MINIMUM_PAGES_FOR_SPINE} pages have very narrow spines`,
      fix: 'Consider removing spine text or increasing page count',
    })
  }
  
  if (pageCount < 100 && hasText) {
    issues.push({
      type: 'suggestion',
      category: 'Spine',
      message: 'Spine text may be difficult to read',
      details: `Spine width is only ${dimensions.spineWidth.toFixed(3)}" (${pageCount} pages)`,
      fix: 'Consider larger font or removing spine text',
    })
  }

  return {
    passed: textWithinBounds,
    spineWidth: dimensions.spineWidth,
    hasText,
    textWithinBounds,
    minimumPages: KDP_SPECS.MINIMUM_PAGES_FOR_SPINE,
    issues,
  }
}

function checkBarcodeArea(
  cover: KDPProject['cover'],
  dimensions: ReturnType<typeof calculateCoverDimensions>,
  dpi: number
): BarcodeCheck {
  const issues: CoverIssue[] = []
  
  // Barcode area is in lower right of back cover
  // 2" x 1.2" reserved area
  const barcodeWidth = KDP_SPECS.BARCODE_WIDTH_INCHES * dpi
  const barcodeHeight = KDP_SPECS.BARCODE_HEIGHT_INCHES * dpi
  
  const backCoverX = dimensions.backCoverX * dpi
  const backCoverWidth = dimensions.trimWidth * dpi
  const backCoverMaxY = (dimensions.bleed + dimensions.trimHeight) * dpi
  
  const barcodeX = backCoverX + backCoverWidth - barcodeWidth - (KDP_SPECS.SAFE_ZONE_INCHES * dpi)
  const barcodeY = backCoverMaxY - barcodeHeight - (KDP_SPECS.SAFE_ZONE_INCHES * dpi)
  const barcodeMaxX = barcodeX + barcodeWidth
  const barcodeMaxY = barcodeY + barcodeHeight
  
  let barcodeAreaClear = true
  
  // Check if any elements overlap with barcode area
  cover.elements.forEach(element => {
    if (element.type === 'barcode') return // Skip barcode placeholder
    
    if (element.type === 'text' || element.type === 'shape') {
      const elem = element as KDPTextElement | KDPShapeElement
      
      // Only check back cover elements
      if (elem.coverPart !== 'back') return
      
      const elemX = elem.position.x
      const elemY = elem.position.y
      const elemMaxX = elemX + elem.width
      const elemMaxY = elemY + elem.height
      
      // Check for overlap
      const overlaps = !(elemMaxX < barcodeX || elemX > barcodeMaxX || elemMaxY < barcodeY || elemY > barcodeMaxY)
      
      if (overlaps) {
        barcodeAreaClear = false
        issues.push({
          type: 'critical',
          category: 'Barcode Area',
          message: 'Element overlaps with barcode area',
          details: `Back cover lower right 2" x 1.2" must be clear for barcode`,
          element: elem.id,
          position: { x: elemX, y: elemY },
          fix: 'Move element away from lower right corner of back cover',
        })
      }
    }
  })
  
  // Check if back cover image is present but might obscure barcode area
  if (cover.backImage) {
    issues.push({
      type: 'suggestion',
      category: 'Barcode Area',
      message: 'Ensure barcode area has light background',
      details: 'Amazon will place a white barcode in lower right of back cover',
      fix: 'Ensure lower right area has light/neutral colors for barcode visibility',
    })
  }

  return {
    passed: barcodeAreaClear,
    hasBarcodeArea: true,
    barcodeAreaClear,
    issues,
  }
}

function checkTextElements(
  elements: KDPProject['cover']['elements'],
  dimensions: ReturnType<typeof calculateCoverDimensions>,
  dpi: number
): TextCheck[] {
  const checks: TextCheck[] = []
  
  elements.forEach(element => {
    if (element.type !== 'text') return
    
    const textElem = element as KDPTextElement
    const issues: CoverIssue[] = []
    
    // Check font size
    const fontSize = textElem.style.fontSize
    const readableSize = fontSize >= KDP_SPECS.MINIMUM_FONT_SIZE_PT
    
    if (!readableSize) {
      issues.push({
        type: 'critical',
        category: 'Text',
        message: 'Text size is too small',
        details: `Font size ${fontSize}pt is below minimum ${KDP_SPECS.MINIMUM_FONT_SIZE_PT}pt`,
        element: textElem.id,
        position: textElem.position,
        fix: `Increase font size to at least ${KDP_SPECS.MINIMUM_FONT_SIZE_PT}pt`,
      })
    } else if (fontSize < KDP_SPECS.RECOMMENDED_FONT_SIZE_PT) {
      issues.push({
        type: 'warning',
        category: 'Text',
        message: 'Text size may be difficult to read',
        details: `Font size ${fontSize}pt is below recommended ${KDP_SPECS.RECOMMENDED_FONT_SIZE_PT}pt`,
        element: textElem.id,
        position: textElem.position,
        fix: `Consider increasing to ${KDP_SPECS.RECOMMENDED_FONT_SIZE_PT}pt or larger`,
      })
    }
    
    // Check contrast (simplified - would need actual color analysis)
    const textColor = textElem.style.color
    const bgColor = textElem.backgroundColor || '#ffffff'
    const goodContrast = checkColorContrast(textColor, bgColor)
    
    if (!goodContrast) {
      issues.push({
        type: 'warning',
        category: 'Text',
        message: 'Text contrast may be too low',
        details: 'Low contrast text can be hard to read',
        element: textElem.id,
        position: textElem.position,
        fix: 'Use darker text on light background or vice versa',
      })
    }
    
    checks.push({
      element: textElem,
      withinSafeZone: true, // Already checked in checkSafeZones
      readableSize,
      goodContrast,
      issues,
    })
  })
  
  return checks
}

function checkImageElements(
  cover: KDPProject['cover'],
  dpi: number
): ImageCheck[] {
  const checks: ImageCheck[] = []
  
  const allImages = [
    cover.fullCoverImage,
    cover.frontImage,
    cover.backImage,
    cover.spineImage,
  ].filter(Boolean) as KDPImage[]
  
  allImages.forEach(image => {
    const issues: CoverIssue[] = []
    
    // Calculate effective resolution
    const scaleX = image.scaleX || image.scale
    const scaleY = image.scaleY || image.scale
    const avgScale = (scaleX + scaleY) / 2
    
    const effectiveDPI = dpi / avgScale
    const upscalePercent = avgScale
    const upscaled = avgScale > 1.0
    
    // Check resolution at actual size
    if (effectiveDPI < KDP_SPECS.MINIMUM_DPI) {
      issues.push({
        type: 'critical',
        category: 'Image Quality',
        message: 'Image resolution too low at current size',
        details: `Effective resolution: ${effectiveDPI.toFixed(0)} DPI (minimum ${KDP_SPECS.MINIMUM_DPI} DPI)`,
        element: image.id,
        fix: 'Use higher resolution image or reduce scale',
      })
    }
    
    // Check upscaling
    if (upscalePercent > KDP_SPECS.MAX_IMAGE_UPSCALE_CRITICAL) {
      issues.push({
        type: 'critical',
        category: 'Image Quality',
        message: 'Image is upscaled too much',
        details: `Image is scaled to ${(upscalePercent * 100).toFixed(0)}% (max ${KDP_SPECS.MAX_IMAGE_UPSCALE_CRITICAL * 100}%)`,
        element: image.id,
        fix: 'Use higher resolution source image',
      })
    } else if (upscalePercent > KDP_SPECS.MAX_IMAGE_UPSCALE_WARNING) {
      issues.push({
        type: 'warning',
        category: 'Image Quality',
        message: 'Image upscaling may cause pixelation',
        details: `Image is scaled to ${(upscalePercent * 100).toFixed(0)}% (recommended max ${KDP_SPECS.MAX_IMAGE_UPSCALE_WARNING * 100}%)`,
        element: image.id,
        fix: 'Consider using higher resolution source image',
      })
    }
    
    checks.push({
      element: image,
      resolution: effectiveDPI,
      upscaled,
      upscalePercent,
      withinBounds: true,
      issues,
    })
  })
  
  return checks
}

// ============================================================================
// Helper Functions
// ============================================================================

function calculateScore(
  criticalErrors: CoverIssue[],
  warnings: CoverIssue[],
  suggestions: CoverIssue[]
): number {
  // Start at 100
  let score = 100
  
  // Critical errors: -20 each (max -100)
  score -= criticalErrors.length * 20
  
  // Warnings: -5 each
  score -= warnings.length * 5
  
  // Suggestions: -1 each
  score -= suggestions.length * 1
  
  // Clamp to 0-100
  return Math.max(0, Math.min(100, score))
}

function checkColorContrast(color1: string, color2: string): boolean {
  // Simplified contrast check
  // In a real implementation, you'd use WCAG contrast ratio calculation
  
  const getLuminance = (hex: string): number => {
    const rgb = hexToRgb(hex)
    if (!rgb) return 0.5
    
    const [r, g, b] = [rgb.r, rgb.g, rgb.b].map(val => {
      val = val / 255
      return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4)
    })
    
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  
  const lum1 = getLuminance(color1)
  const lum2 = getLuminance(color2)
  
  const lighter = Math.max(lum1, lum2)
  const darker = Math.min(lum1, lum2)
  
  const contrast = (lighter + 0.05) / (darker + 0.05)
  
  // WCAG AA requires 4.5:1 for normal text, 3:1 for large text
  return contrast >= 3.0
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null
}
