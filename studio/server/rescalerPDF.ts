import { PDFDocument, rgb, PageSizes } from "pdf-lib"
import sharp from "sharp"

export interface RescalerImage {
  id: string
  data: string // Base64 data URL
  originalWidth: number
  originalHeight: number
  targetWidth?: number // In inches
  targetHeight?: number // In inches
  dpi: number
  position: { x: number; y: number }
  scale: number
  rotation: number
}

export interface RescalerProject {
  id: string
  name: string
  mode: "standard" | "amazon-kdp"
  customWidth?: number // In inches
  customHeight?: number // In inches
  kdpTrimSize?: string
  kdpBookStyle?: string
  kdpPageCount?: number
  kdpPaperType?: string // Paper type for accurate spine calculation
  kdpCoverType?: "interior" | "full-cover"
  dpi: number
  images: RescalerImage[]
  pdfFileName: string
}

// Amazon KDP Trim Sizes (in inches)
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

// Amazon KDP Paper Types (Official Specifications)
const KDP_PAPER_TYPES: Record<string, number> = {
  "white": 0.002252, // inches per sheet
  "cream": 0.0025, // inches per sheet
  "standard-color": 0.002252, // inches per sheet
  "premium-color": 0.002347, // inches per sheet
}

// Calculate spine width for KDP covers (Official formula)
function calculateSpineWidth(pageCount: number, paperType: string): number {
  // KDP minimum page count is 24 for paperback books
  const effectivePageCount = Math.max(24, pageCount)
  const caliper = KDP_PAPER_TYPES[paperType] || 0.002252
  return effectivePageCount * caliper
}

// Calculate cover dimensions with bleed
function calculateCoverDimensions(
  trimSize: string,
  pageCount: number,
  paperType: string
): { width: number; height: number; spineWidth: number; bleed: number } {
  const trim = KDP_TRIM_SIZES[trimSize] || { width: 8.5, height: 11 }
  const spineWidth = calculateSpineWidth(pageCount, paperType)
  const bleed = 0.125 // KDP standard bleed in inches

  // Official KDP formula: Bleed + Back Cover + Spine + Front Cover + Bleed
  return {
    width: bleed + trim.width + spineWidth + trim.width + bleed,
    height: bleed + trim.height + bleed,
    spineWidth,
    bleed,
  }
}

// Convert inches to PDF points (1 inch = 72 points)
function inchesToPoints(inches: number): number {
  return inches * 72
}

// Process image with sharp: resize to target DPI and dimensions
async function processImage(
  imageData: string,
  targetWidthInches: number,
  targetHeightInches: number,
  dpi: number
): Promise<Buffer> {
  // Remove data URL prefix if present
  const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "")
  const buffer = Buffer.from(base64Data, "base64")

  // Calculate target dimensions in pixels
  const targetWidthPx = Math.round(targetWidthInches * dpi)
  const targetHeightPx = Math.round(targetHeightInches * dpi)

  // Resize image to exact dimensions
  const processedImage = await sharp(buffer)
    .resize(targetWidthPx, targetHeightPx, {
      fit: "contain", // Fit within bounds, maintaining aspect ratio
      background: { r: 255, g: 255, b: 255, alpha: 1 }, // White background
    })
    .jpeg({ quality: 95 }) // High quality for print
    .toBuffer()

  return processedImage
}

// Generate PDF from rescaler project
export async function generatePDF(project: RescalerProject): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create()

  // Determine page dimensions
  let pageWidthInches: number
  let pageHeightInches: number

  if (project.mode === "amazon-kdp") {
    if (project.kdpCoverType === "full-cover" && project.kdpTrimSize && project.kdpPaperType && project.kdpPageCount) {
      // Full cover dimensions with spine and bleed
      const coverDims = calculateCoverDimensions(
        project.kdpTrimSize,
        project.kdpPageCount,
        project.kdpPaperType
      )
      pageWidthInches = coverDims.width
      pageHeightInches = coverDims.height
    } else if (project.kdpTrimSize) {
      // Interior page dimensions
      const trimSize = KDP_TRIM_SIZES[project.kdpTrimSize] || { width: 8.5, height: 11 }
      pageWidthInches = trimSize.width
      pageHeightInches = trimSize.height
    } else {
      throw new Error("KDP trim size not specified")
    }
  } else {
    // Standard mode - custom dimensions
    if (!project.customWidth || !project.customHeight) {
      throw new Error("Custom dimensions not specified")
    }
    pageWidthInches = project.customWidth
    pageHeightInches = project.customHeight
  }

  const pageWidthPoints = inchesToPoints(pageWidthInches)
  const pageHeightPoints = inchesToPoints(pageHeightInches)

  console.log(`Generating PDF: ${pageWidthInches}" x ${pageHeightInches}" (${pageWidthPoints}pt x ${pageHeightPoints}pt)`)

  // Process each image and add to PDF
  for (let i = 0; i < project.images.length; i++) {
    const img = project.images[i]
    console.log(`Processing image ${i + 1}/${project.images.length}...`)

    try {
      // Process image with sharp
      const processedImageBuffer = await processImage(
        img.data,
        pageWidthInches,
        pageHeightInches,
        project.dpi
      )

      // Add page to PDF
      const page = pdfDoc.addPage([pageWidthPoints, pageHeightPoints])

      // Embed image in PDF
      const pdfImage = await pdfDoc.embedJpg(processedImageBuffer)
      const imageDims = pdfImage.scale(1)

      // Calculate scaling to fit page while maintaining aspect ratio
      const scaleX = pageWidthPoints / imageDims.width
      const scaleY = pageHeightPoints / imageDims.height
      const scale = Math.min(scaleX, scaleY)

      const scaledWidth = imageDims.width * scale
      const scaledHeight = imageDims.height * scale

      // Center image on page
      const x = (pageWidthPoints - scaledWidth) / 2
      const y = (pageHeightPoints - scaledHeight) / 2

      // Draw image
      page.drawImage(pdfImage, {
        x,
        y,
        width: scaledWidth,
        height: scaledHeight,
      })

      console.log(`✓ Image ${i + 1} added to PDF`)
    } catch (error) {
      console.error(`Error processing image ${i + 1}:`, error)
      throw new Error(`Failed to process image ${i + 1}: ${error instanceof Error ? error.message : "Unknown error"}`)
    }
  }

  // Add metadata
  pdfDoc.setTitle(project.name || "Rescaler Output")
  pdfDoc.setCreator("DNK AI Studio - Rescaler")
  pdfDoc.setProducer("pdf-lib + sharp")
  pdfDoc.setCreationDate(new Date())

  // Generate PDF bytes
  const pdfBytes = await pdfDoc.save()
  console.log(`✓ PDF generated successfully: ${pdfBytes.length} bytes`)

  return Buffer.from(pdfBytes)
}

// Generate PDF with bleed marks and safe zones (for advanced KDP users)
export async function generatePDFWithGuides(project: RescalerProject): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create()

  // Determine page dimensions
  let pageWidthInches: number
  let pageHeightInches: number
  let bleedInches = 0
  let showGuides = false

  if (project.mode === "amazon-kdp") {
    bleedInches = 0.125 // KDP standard bleed
    showGuides = true

    if (project.kdpCoverType === "full-cover" && project.kdpTrimSize && project.kdpPaperType && project.kdpPageCount) {
      const coverDims = calculateCoverDimensions(
        project.kdpTrimSize,
        project.kdpPageCount,
        project.kdpPaperType
      )
      pageWidthInches = coverDims.width
      pageHeightInches = coverDims.height
    } else if (project.kdpTrimSize) {
      const trimSize = KDP_TRIM_SIZES[project.kdpTrimSize] || { width: 8.5, height: 11 }
      pageWidthInches = trimSize.width + bleedInches * 2
      pageHeightInches = trimSize.height + bleedInches * 2
    } else {
      throw new Error("KDP trim size not specified")
    }
  } else {
    if (!project.customWidth || !project.customHeight) {
      throw new Error("Custom dimensions not specified")
    }
    pageWidthInches = project.customWidth
    pageHeightInches = project.customHeight
  }

  const pageWidthPoints = inchesToPoints(pageWidthInches)
  const pageHeightPoints = inchesToPoints(pageHeightInches)
  const bleedPoints = inchesToPoints(bleedInches)

  // Process each image
  for (let i = 0; i < project.images.length; i++) {
    const img = project.images[i]
    const processedImageBuffer = await processImage(
      img.data,
      pageWidthInches,
      pageHeightInches,
      project.dpi
    )

    const page = pdfDoc.addPage([pageWidthPoints, pageHeightPoints])
    const pdfImage = await pdfDoc.embedJpg(processedImageBuffer)
    const imageDims = pdfImage.scale(1)

    const scaleX = pageWidthPoints / imageDims.width
    const scaleY = pageHeightPoints / imageDims.height
    const scale = Math.min(scaleX, scaleY)

    const scaledWidth = imageDims.width * scale
    const scaledHeight = imageDims.height * scale
    const x = (pageWidthPoints - scaledWidth) / 2
    const y = (pageHeightPoints - scaledHeight) / 2

    page.drawImage(pdfImage, { x, y, width: scaledWidth, height: scaledHeight })

    // Draw guides for KDP
    if (showGuides && bleedPoints > 0) {
      const guideColor = rgb(1, 0, 0) // Red guides
      const lineWidth = 0.5

      // Bleed area (outer red box)
      page.drawRectangle({
        x: bleedPoints,
        y: bleedPoints,
        width: pageWidthPoints - bleedPoints * 2,
        height: pageHeightPoints - bleedPoints * 2,
        borderColor: guideColor,
        borderWidth: lineWidth,
      })

      // Safe zone (inner box - 0.25" from trim)
      const safeZoneInset = inchesToPoints(0.25)
      page.drawRectangle({
        x: bleedPoints + safeZoneInset,
        y: bleedPoints + safeZoneInset,
        width: pageWidthPoints - (bleedPoints + safeZoneInset) * 2,
        height: pageHeightPoints - (bleedPoints + safeZoneInset) * 2,
        borderColor: rgb(0, 0, 1), // Blue safe zone
        borderWidth: lineWidth,
        opacity: 0.5,
      })
    }
  }

  pdfDoc.setTitle(project.name || "Rescaler Output (with guides)")
  pdfDoc.setCreator("DNK AI Studio - Rescaler")
  const pdfBytes = await pdfDoc.save()

  return Buffer.from(pdfBytes)
}

// Export formats for Standard Mode
export type ExportFormat = "pdf" | "png" | "jpeg" | "tiff"

// Generate image in specified format (PNG, JPEG, TIFF)
export async function generateImage(
  project: RescalerProject,
  format: ExportFormat = "png"
): Promise<Buffer> {
  if (format === "pdf") {
    return generatePDF(project)
  }

  // For image formats, we'll create a single image for the first uploaded image
  // Or create a composite if multiple images
  if (project.images.length === 0) {
    throw new Error("No images to export")
  }

  // Determine canvas dimensions
  let canvasWidthInches: number
  let canvasHeightInches: number

  if (project.mode === "amazon-kdp" && project.kdpTrimSize) {
    const trimSize = KDP_TRIM_SIZES[project.kdpTrimSize] || { width: 8.5, height: 11 }
    canvasWidthInches = trimSize.width
    canvasHeightInches = trimSize.height
  } else if (project.customWidth && project.customHeight) {
    canvasWidthInches = project.customWidth
    canvasHeightInches = project.customHeight
  } else {
    throw new Error("Canvas dimensions not specified")
  }

  const canvasWidthPx = Math.round(canvasWidthInches * project.dpi)
  const canvasHeightPx = Math.round(canvasHeightInches * project.dpi)

  // If only one image, process it directly
  if (project.images.length === 1) {
    const img = project.images[0]
    const base64Data = img.data.replace(/^data:image\/\w+;base64,/, "")
    const buffer = Buffer.from(base64Data, "base64")

    let sharpInstance = sharp(buffer)
      .resize(canvasWidthPx, canvasHeightPx, {
        fit: "contain",
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })

    // Convert to requested format
    switch (format) {
      case "png":
        return sharpInstance.png({ quality: 100 }).toBuffer()
      case "jpeg":
        return sharpInstance.jpeg({ quality: 95 }).toBuffer()
      case "tiff":
        return sharpInstance.tiff({ quality: 95 }).toBuffer()
      default:
        throw new Error(`Unsupported format: ${format}`)
    }
  }

  // For multiple images, create a composite (stacked vertically for now)
  // This is a simple implementation - can be enhanced later
  const processedImages: Buffer[] = []
  
  for (const img of project.images) {
    const base64Data = img.data.replace(/^data:image\/\w+;base64,/, "")
    const buffer = Buffer.from(base64Data, "base64")
    
    const processed = await sharp(buffer)
      .resize(canvasWidthPx, canvasHeightPx, {
        fit: "contain",
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .toBuffer()
    
    processedImages.push(processed)
  }

  // Stack images vertically
  const totalHeight = canvasHeightPx * processedImages.length
  
  let compositeImage = sharp({
    create: {
      width: canvasWidthPx,
      height: totalHeight,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })

  const compositeOps = processedImages.map((img, index) => ({
    input: img,
    top: index * canvasHeightPx,
    left: 0,
  }))

  compositeImage = compositeImage.composite(compositeOps)

  // Convert to requested format
  switch (format) {
    case "png":
      return compositeImage.png({ quality: 100 }).toBuffer()
    case "jpeg":
      return compositeImage.jpeg({ quality: 95 }).toBuffer()
    case "tiff":
      return compositeImage.tiff({ quality: 95 }).toBuffer()
    default:
      throw new Error(`Unsupported format: ${format}`)
  }
}

