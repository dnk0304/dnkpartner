import { PDFDocument, rgb, StandardFonts, PDFPage, PDFImage } from 'pdf-lib'
import sharp from 'sharp'

// KDP Trim Sizes (in inches)
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

// Paper types with caliper (thickness per sheet in inches)
const KDP_PAPER_TYPES: Record<string, number> = {
  "white": 0.002252,
  "cream": 0.0025,
  "standard-color": 0.002252,
  "premium-color": 0.002347,
}

// Calculate spine width
function calculateSpineWidth(pageCount: number, paperType: string): number {
  // KDP minimum page count is 24 for paperback books
  const effectivePageCount = Math.max(24, pageCount)
  const caliper = KDP_PAPER_TYPES[paperType] || KDP_PAPER_TYPES["white"]
  return effectivePageCount * caliper
}

// Calculate full cover dimensions
function calculateCoverDimensions(trimSize: string, pageCount: number, paperType: string) {
  const trim = KDP_TRIM_SIZES[trimSize] || KDP_TRIM_SIZES["6x9"]
  const spineWidth = calculateSpineWidth(pageCount, paperType)
  const bleed = 0.125 // KDP standard bleed
  
  return {
    trimWidth: trim.width,
    trimHeight: trim.height,
    spineWidth,
    bleed,
    totalWidth: bleed + trim.width + spineWidth + trim.width + bleed,
    totalHeight: bleed + trim.height + bleed,
  }
}

// Convert inches to PDF points (72 points per inch)
function inchesToPoints(inches: number): number {
  return inches * 72
}

// Extract base64 data from data URL
function extractBase64(dataUrl: string): { data: Buffer; mimeType: string } {
  const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!matches) {
    throw new Error("Invalid data URL format")
  }
  return {
    mimeType: matches[1],
    data: Buffer.from(matches[2], "base64"),
  }
}

// Embed image in PDF with aggressive compression for large exports
async function embedImageInPDF(pdfDoc: PDFDocument, imageData: string, quality: number = 60): Promise<PDFImage | null> {
  try {
    const { data, mimeType } = extractBase64(imageData)
    
    // Get image metadata
    const metadata = await sharp(data).metadata()
    const width = metadata.width || 1024
    const height = metadata.height || 1024
    
    // Calculate max dimensions at 300 DPI for KDP
    // For a 6x9 inch page, we need ~1800x2700 pixels max at 300 DPI
    const maxDimension = 2700
    
    // Aggressive compression for large exports
    let processedBuffer: Buffer
    
    if (width > maxDimension || height > maxDimension) {
      // Resize and compress if too large
      processedBuffer = await sharp(data)
        .resize(maxDimension, maxDimension, { 
          fit: 'inside', 
          withoutEnlargement: true 
        })
        .jpeg({ quality, mozjpeg: true }) // Use JPEG for smaller size
        .toBuffer()
      
      // Convert JPEG back to PNG for embedding (pdf-lib requires PNG or JPEG)
      return await pdfDoc.embedJpg(processedBuffer)
    } else {
      // Use PNG but with compression
      processedBuffer = await sharp(data)
        .png({ 
          quality, 
          compressionLevel: 9, // Max compression
          palette: true, // Use palette mode for smaller size
        })
        .toBuffer()
      
      return await pdfDoc.embedPng(processedBuffer)
    }
  } catch (error) {
    console.error("Failed to embed image:", error)
    return null
  }
}

// Draw image on page with transforms
function drawImageOnPage(
  page: PDFPage,
  image: PDFImage,
  options: {
    x: number
    y: number
    width: number
    height: number
    rotation?: number
    opacity?: number
  }
) {
  const { x, y, width, height, rotation = 0, opacity = 1 } = options
  
  page.drawImage(image, {
    x,
    y,
    width,
    height,
    rotate: { type: "degrees" as const, angle: rotation },
    opacity,
  })
}

// Generate interior PDF
export async function generateInteriorPDF(project: any): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create()
  
  // Set PDF metadata
  pdfDoc.setTitle(project.name || "Untitled Book")
  pdfDoc.setAuthor(project.metadata?.author || "")
  pdfDoc.setProducer("DNK AI Studio - KDP Mode")
  pdfDoc.setCreator("DNK AI Studio")
  
  const trim = KDP_TRIM_SIZES[project.trimSize] || KDP_TRIM_SIZES["6x9"]
  const bleed = project.exportSettings?.includeBleed ? 0.125 : 0
  const dpi = project.exportSettings?.resolution || 300
  
  // Calculate compression quality based on page count
  // More pages = more aggressive compression
  const pageCount = project.pages.length
  let quality = 85 // Default quality
  if (pageCount > 100) {
    quality = 50 // Very aggressive for 100+ pages
  } else if (pageCount > 50) {
    quality = 60 // Aggressive for 50+ pages
  } else if (pageCount > 20) {
    quality = 70 // Moderate for 20+ pages
  }
  
  console.log(`[KDP PDF] Generating interior PDF with ${pageCount} pages, quality: ${quality}`)
  
  // Page dimensions in points
  const pageWidthPt = inchesToPoints(trim.width + bleed * 2)
  const pageHeightPt = inchesToPoints(trim.height + bleed * 2)
  const bleedPt = inchesToPoints(bleed)
  
  // Process each page
  for (let i = 0; i < project.pages.length; i++) {
    const pageData = project.pages[i]
    const page = pdfDoc.addPage([pageWidthPt, pageHeightPt])
    
    if (i % 10 === 0) {
      console.log(`[KDP PDF] Processing page ${i + 1}/${pageCount}`)
    }
    
    // Fill with white background
    page.drawRectangle({
      x: 0,
      y: 0,
      width: pageWidthPt,
      height: pageHeightPt,
      color: rgb(1, 1, 1),
    })
    
    // Draw images on page
    for (const imageData of pageData.images) {
      if (!imageData.data && !imageData.src) continue
      
      const imgSrc = imageData.data || imageData.src
      const embeddedImage = await embedImageInPDF(pdfDoc, imgSrc, quality)
      
      if (embeddedImage) {
        // Calculate image dimensions and position
        // Position is stored in pixels at project DPI, convert to points
        const scaleX = imageData.scaleX || imageData.scale || 1
        const scaleY = imageData.scaleY || imageData.scale || 1
        
        let imgWidthPt = (imageData.originalWidth * scaleX * 72) / dpi
        let imgHeightPt = (imageData.originalHeight * scaleY * 72) / dpi
        let imgXPt = bleedPt + (imageData.position.x * 72) / dpi
        // PDF Y is from bottom, image Y is from top
        let imgYPt = pageHeightPt - bleedPt - (imageData.position.y * 72) / dpi - imgHeightPt
        
        // STRICT SAFE ZONE VALIDATION
        // Safe zone is 0.25 inches from each edge
        const safeZonePt = inchesToPoints(0.25)
        const safeXMin = bleedPt + safeZonePt
        const safeYMin = bleedPt + safeZonePt
        const safeXMax = pageWidthPt - bleedPt - safeZonePt
        const safeYMax = pageHeightPt - bleedPt - safeZonePt
        const safeWidthPt = safeXMax - safeXMin
        const safeHeightPt = safeYMax - safeYMin
        
        // Calculate image bounds
        const imgRight = imgXPt + imgWidthPt
        const imgTop = imgYPt + imgHeightPt
        
        // Check if image exceeds safe zone (in PDF coordinates where Y is from bottom)
        let needsAdjustment = false
        if (imgXPt < safeXMin || imgRight > safeXMax || imgYPt < safeYMin || imgTop > safeYMax) {
          needsAdjustment = true
          
          // Scale down if image is too large for safe zone
          const maxScaleX = safeWidthPt / ((imageData.originalWidth * 72) / dpi)
          const maxScaleY = safeHeightPt / ((imageData.originalHeight * 72) / dpi)
          const clampedScale = Math.min(scaleX, scaleY, maxScaleX, maxScaleY)
          
          imgWidthPt = (imageData.originalWidth * clampedScale * 72) / dpi
          imgHeightPt = (imageData.originalHeight * clampedScale * 72) / dpi
          
          // Center in safe zone if scaled down
          imgXPt = safeXMin + (safeWidthPt - imgWidthPt) / 2
          imgYPt = safeYMin + (safeHeightPt - imgHeightPt) / 2
        }
        
        drawImageOnPage(page, embeddedImage, {
          x: imgXPt,
          y: imgYPt,
          width: imgWidthPt,
          height: imgHeightPt,
          rotation: imageData.rotation || 0,
          opacity: imageData.opacity || 1,
        })
      }
    }
    
    // Draw crop marks if enabled
    if (project.exportSettings?.includeCropMarks && bleed > 0) {
      const markLength = inchesToPoints(0.25)
      const markOffset = inchesToPoints(0.125)
      
      page.drawLine({
        start: { x: bleedPt - markOffset - markLength, y: bleedPt },
        end: { x: bleedPt - markOffset, y: bleedPt },
        thickness: 0.5,
        color: rgb(0, 0, 0),
      })
      // Add more crop marks as needed...
    }
  }
  
  console.log(`[KDP PDF] Interior PDF generation complete`)
  return Buffer.from(await pdfDoc.save())
}

// Generate cover PDF
export async function generateCoverPDF(project: any): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create()
  
  pdfDoc.setTitle(`${project.name || "Untitled"} - Cover`)
  pdfDoc.setProducer("DNK AI Studio - KDP Mode")
  
  const coverDims = calculateCoverDimensions(
    project.trimSize,
    project.pageCount,
    project.paperType || "white"
  )
  
  const bleed = project.exportSettings?.includeBleed ? coverDims.bleed : 0
  
  // Cover gets high quality since it's only 1 page
  const quality = 75
  
  console.log(`[KDP PDF] Generating cover PDF with quality: ${quality}`)
  
  // Cover dimensions in points
  const coverWidthPt = inchesToPoints(coverDims.totalWidth)
  const coverHeightPt = inchesToPoints(coverDims.totalHeight)
  
  const page = pdfDoc.addPage([coverWidthPt, coverHeightPt])
  
  // Fill with white background
  page.drawRectangle({
    x: 0,
    y: 0,
    width: coverWidthPt,
    height: coverHeightPt,
    color: rgb(1, 1, 1),
  })
  
  // Draw full cover image if exists
  const coverImage = project.cover?.fullCoverImage || project.cover?.frontImage
  if (coverImage?.data || coverImage?.src) {
    const imgSrc = coverImage.data || coverImage.src
    const embeddedImage = await embedImageInPDF(pdfDoc, imgSrc, quality)
    
    if (embeddedImage) {
      // Scale to fit cover
      const imgAspect = coverImage.originalWidth / coverImage.originalHeight
      const coverAspect = coverWidthPt / coverHeightPt
      
      let imgWidth: number, imgHeight: number, imgX: number, imgY: number
      
      if (project.cover?.fullCoverImage) {
        // Full cover image - scale to fill
        imgWidth = coverWidthPt
        imgHeight = coverHeightPt
        imgX = 0
        imgY = 0
      } else {
        // Front cover only - position on right side
        const frontCoverX = inchesToPoints(coverDims.bleed + coverDims.trimWidth + coverDims.spineWidth)
        const frontCoverWidth = inchesToPoints(coverDims.trimWidth)
        const frontCoverHeight = inchesToPoints(coverDims.trimHeight)
        
        if (imgAspect > frontCoverWidth / frontCoverHeight) {
          imgWidth = frontCoverWidth
          imgHeight = frontCoverWidth / imgAspect
        } else {
          imgHeight = frontCoverHeight
          imgWidth = frontCoverHeight * imgAspect
        }
        
        imgX = frontCoverX + (frontCoverWidth - imgWidth) / 2
        imgY = inchesToPoints(coverDims.bleed) + (frontCoverHeight - imgHeight) / 2
      }
      
      drawImageOnPage(page, embeddedImage, {
        x: imgX,
        y: imgY,
        width: imgWidth,
        height: imgHeight,
      })
    }
  }
  
  // Draw spine text if exists
  if (project.cover?.spineText) {
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const fontSize = project.cover.spineTextStyle?.fontSize || 12
    
    console.log(`[PDF] Cover dimensions:`, coverDims)
    console.log(`[PDF] Spine calculation: bleed=${coverDims.bleed}, trimWidth=${coverDims.trimWidth}, spineWidth=${coverDims.spineWidth}`)
    
    const spineX = inchesToPoints(coverDims.bleed + coverDims.trimWidth + coverDims.spineWidth / 2)
    const spineY = coverHeightPt / 2
    
    console.log(`[PDF] Spine text position: x=${spineX}pt, y=${spineY}pt (centerHeight=${coverHeightPt}pt)`)
    
    // Determine rotation based on spineTextStyle
    const rotation = project.cover.spineTextStyle?.rotation || "vertical-down"
    let angle = 0
    
    if (rotation === "vertical-up") {
      angle = 90  // Bottom to top (counter-clockwise)
    } else if (rotation === "vertical-down") {
      angle = -90  // Top to bottom (clockwise) - DEFAULT
    } else {
      angle = 0  // Horizontal
    }
    
    console.log(`[PDF] Spine text: "${project.cover.spineText}", rotation=${rotation}, angle=${angle}°, fontSize=${fontSize}`)
    
    // Parse color (hex to RGB)
    const hexColor = project.cover.spineTextStyle?.color || "#000000"
    const r = parseInt(hexColor.slice(1, 3), 16) / 255
    const g = parseInt(hexColor.slice(3, 5), 16) / 255
    const b = parseInt(hexColor.slice(5, 7), 16) / 255
    
    page.drawText(project.cover.spineText, {
      x: spineX,
      y: spineY,
      size: fontSize,
      font,
      color: rgb(r, g, b),
      rotate: { type: "degrees" as const, angle },
    })
  }
  
  // Draw text elements ONLY if fullCoverImage doesn't exist (since text is baked into fullCoverImage)
  // If user hasn't clicked "Confirm Cover", we render text elements separately
  if (!project.cover?.fullCoverImage && project.cover?.elements) {
    const textElements = project.cover.elements.filter((el: any) => el.type === 'text' && el.visible !== false)
    
    for (const textEl of textElements) {
      try {
        // Load font
        //
        // NOTE: pdf-lib's built-in StandardFonts only cover the 3 base families
        // (Helvetica/Times/Courier). The editor offers Georgia/Verdana/Impact which
        // are NOT embeddable here, so we map them to the closest base family and warn
        // loudly that the unbaked export will not be pixel-WYSIWYG. The fully faithful
        // path is "Confirm Cover" (bake-to-PNG), which uses the browser's real fonts.
        let font
        try {
          const fontFamily = textEl.style?.fontFamily || 'Arial'
          const isBold = textEl.style?.fontWeight === 'bold'
          const isItalic = textEl.style?.fontStyle === 'italic'

          // Map editor font-family -> a base family. Non-standard families are
          // approximated (and flagged) so output is at least sane, never silently wrong.
          const SANS = 'helvetica'
          const SERIF = 'times'
          const MONO = 'courier'
          const familyMap: Record<string, string> = {
            'Arial': SANS,
            'Helvetica': SANS,
            'Verdana': SANS,           // approximated -> Helvetica
            'Impact': SANS,            // approximated -> Helvetica (bold forced below)
            'Times': SERIF,
            'Times New Roman': SERIF,
            'TimesRoman': SERIF,
            'Georgia': SERIF,          // approximated -> Times
            'Courier': MONO,
            'Courier New': MONO,
          }
          const APPROXIMATED = new Set(['Verdana', 'Impact', 'Georgia', 'Courier New'])
          const base = familyMap[fontFamily] || SANS
          if (!(fontFamily in familyMap) || APPROXIMATED.has(fontFamily)) {
            console.warn(
              `[KDP PDF] Cover text font "${fontFamily}" is not embeddable in the live-text export ` +
              `and was approximated to "${base}". For exact fonts, use "Confirm Cover" (bake-to-image).`
            )
          }
          // Impact has no italic and reads as a heavy display face -> force bold.
          const forceBold = fontFamily === 'Impact'
          const bold = isBold || forceBold

          // Resolve the concrete StandardFonts variant from base + bold + italic.
          let chosen: any
          if (base === SERIF) {
            chosen = bold && isItalic ? StandardFonts.TimesRomanBoldItalic
              : bold ? StandardFonts.TimesRomanBold
              : isItalic ? StandardFonts.TimesRomanItalic
              : StandardFonts.TimesRoman
          } else if (base === MONO) {
            chosen = bold && isItalic ? StandardFonts.CourierBoldOblique
              : bold ? StandardFonts.CourierBold
              : isItalic ? StandardFonts.CourierOblique
              : StandardFonts.Courier
          } else {
            chosen = bold && isItalic ? StandardFonts.HelveticaBoldOblique
              : bold ? StandardFonts.HelveticaBold
              : isItalic ? StandardFonts.HelveticaOblique
              : StandardFonts.Helvetica
          }
          font = await pdfDoc.embedFont(chosen)
        } catch (fontError) {
          console.warn('Font embedding failed, using Helvetica:', fontError)
          font = await pdfDoc.embedFont(StandardFonts.Helvetica)
        }
        
        // IMPORTANT: Text positions are stored in 300 DPI pixels
        // We need to convert to PDF points (72 points/inch)
        const dpiScale = 72 / 300
        
        // Calculate position based on panel (same as canvas code)
        const bleedPt = inchesToPoints(coverDims.bleed)
        const trimWidthPt = inchesToPoints(coverDims.trimWidth)
        const spineWidthPt = inchesToPoints(coverDims.spineWidth)
        
        let offsetX = bleedPt
        if (textEl.coverPart === 'spine') {
          offsetX = bleedPt + trimWidthPt
          console.log(`[PDF] Spine text - bleedPt: ${bleedPt}, trimWidthPt: ${trimWidthPt}, offsetX: ${offsetX}`)
        } else if (textEl.coverPart === 'front') {
          offsetX = bleedPt + trimWidthPt + spineWidthPt
          console.log(`[PDF] Front text - offsetX: ${offsetX}`)
        } else {
          console.log(`[PDF] Back text - offsetX: ${offsetX}`)
        }
        
        // Convert text position from 300 DPI pixels to PDF points
        // Canvas: x = offsetX + textEl.position.x (both in 300 DPI pixels)
        // PDF: x = offsetX + (textEl.position.x * dpiScale) (both in points)
        const textX = offsetX + (textEl.position.x * dpiScale)
        
        // Y coordinate: PDF measures from bottom, canvas from top
        // Canvas: y = bleedPx + textEl.position.y (from top, in 300 DPI pixels)
        // PDF: y = coverHeightPt - (bleedPt + (textEl.position.y * dpiScale)) (from bottom, in points)
        const textY = coverHeightPt - bleedPt - (textEl.position.y * dpiScale)
        
        console.log(`[PDF] Text element: panel=${textEl.coverPart}, pos=(${textEl.position.x}, ${textEl.position.y}) @300DPI, final=(${textX}, ${textY}) @72DPI, rotation=${textEl.rotation}`)
        
        // Font size also needs DPI conversion
        const fontSize = (textEl.style?.fontSize || 24) * dpiScale
        
        // Parse color
        let textColor = rgb(0, 0, 0) // default black
        if (textEl.style?.color) {
          const hex = textEl.style.color.replace('#', '')
          const r = parseInt(hex.substring(0, 2), 16) / 255
          const g = parseInt(hex.substring(2, 4), 16) / 255
          const b = parseInt(hex.substring(4, 6), 16) / 255
          textColor = rgb(r, g, b)
        }
        
        // Calculate dimensions for background
        const lines = textEl.content.split('\n')
        const lineHeight = (textEl.style?.lineHeight || 1.2) * fontSize
        const totalTextHeight = lines.length * lineHeight
        const padding = 8 * dpiScale
        const verticalPadding = 4 * dpiScale
        const textWidth = textEl.width * dpiScale
        
        // Draw background if exists
        if (textEl.backgroundColor) {
          const hex = textEl.backgroundColor.replace('#', '')
          const r = parseInt(hex.substring(0, 2), 16) / 255
          const g = parseInt(hex.substring(2, 4), 16) / 255
          const b = parseInt(hex.substring(4, 6), 16) / 255
          const opacity = textEl.backgroundOpacity || 0.5
          
          // Calculate background position based on text alignment (same as canvas)
          let bgX = textX - padding
          if (textEl.style?.textAlign === 'center') {
            bgX = textX + textWidth / 2 - (textWidth + padding * 2) / 2
          } else if (textEl.style?.textAlign === 'right') {
            bgX = textX + textWidth - (textWidth + padding * 2) + padding
          }
          
          // Background Y from bottom (PDF coords)
          const bgY = textY - totalTextHeight - verticalPadding
          
          page.drawRectangle({
            x: bgX,
            y: bgY,
            width: textWidth + padding * 2,
            height: totalTextHeight + verticalPadding * 2,
            color: rgb(r, g, b),
            opacity: opacity,
          })
        }
        
        // Calculate text X position based on alignment (same as canvas)
        let finalTextX = textX
        if (textEl.style?.textAlign === 'center') {
          finalTextX = textX + textWidth / 2
        } else if (textEl.style?.textAlign === 'right') {
          finalTextX = textX + textWidth
        }
        
        // Draw text lines
        lines.forEach((line: string, index: number) => {
          // Y position from top (canvas style), then convert to PDF bottom-up
          const lineYFromTop = (index * lineHeight)
          const lineY = textY - lineYFromTop
          
          // Calculate alignment offset for each line (same as canvas)
          let lineX = finalTextX
          if (textEl.style?.textAlign === 'center') {
            const measuredWidth = font.widthOfTextAtSize(line, fontSize)
            lineX = finalTextX - measuredWidth / 2
          } else if (textEl.style?.textAlign === 'right') {
            const measuredWidth = font.widthOfTextAtSize(line, fontSize)
            lineX = finalTextX - measuredWidth
          }
          
          // Handle rotation - PDF-lib rotates around the x,y point, but canvas rotates around top-left
          // We need to adjust coordinates to match canvas behavior
          let finalX = lineX
          let finalY = lineY
          const rotation = textEl.rotation || 0
          
          if (rotation !== 0) {
            // For rotated text, we need to calculate the position after rotation
            // Canvas rotates around top-left (lineX, lineY in our coord system)
            // PDF rotates around the draw point, so we keep the same coordinates
            // The key is that both should produce the same visual result
            
            // Note: In PDF, Y increases upward from bottom, unlike canvas where Y increases downward from top
            // When we rotate 90° clockwise in canvas, it should be -90° in PDF coordinates
            // When we rotate -90° in canvas, it should be 90° in PDF coordinates
          }
          
          page.drawText(line, {
            x: finalX,
            y: finalY,
            size: fontSize,
            font: font,
            color: textColor,
            opacity: textEl.style?.opacity || 1,
            rotate: rotation !== 0 ? { type: "degrees" as const, angle: rotation } : undefined,
          })
        })
      } catch (error) {
        console.error('Failed to render text element:', error)
      }
    }
  }
  
  return Buffer.from(await pdfDoc.save())
}

// Generate complete book PDF (cover + interior)
export async function generateCompletePDF(project: any): Promise<Buffer> {
  // For KDP, cover and interior are typically separate files
  // But we can combine them for preview purposes
  
  const coverPdf = await generateCoverPDF(project)
  const interiorPdf = await generateInteriorPDF(project)
  
  // Merge PDFs
  const mergedPdf = await PDFDocument.create()
  
  // Add cover
  const coverDoc = await PDFDocument.load(coverPdf)
  const [coverPage] = await mergedPdf.copyPages(coverDoc, [0])
  mergedPdf.addPage(coverPage)
  
  // Add interior pages
  const interiorDoc = await PDFDocument.load(interiorPdf)
  const interiorPages = await mergedPdf.copyPages(interiorDoc, interiorDoc.getPageIndices())
  interiorPages.forEach(page => mergedPdf.addPage(page))
  
  mergedPdf.setTitle(project.name || "Untitled Book")
  mergedPdf.setProducer("DNK AI Studio - KDP Mode")
  
  return Buffer.from(await mergedPdf.save())
}

// Generate cover as PNG
export async function generateCoverPNG(project: any): Promise<Buffer> {
  const coverDims = calculateCoverDimensions(
    project.trimSize,
    project.pageCount,
    project.paperType || "white"
  )
  
  const dpi = project.exportSettings?.resolution || 300
  const width = Math.round(coverDims.totalWidth * dpi)
  const height = Math.round(coverDims.totalHeight * dpi)
  
  // Create base image
  let image = sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
  
  // If there's a cover image, composite it
  const coverImage = project.cover?.fullCoverImage || project.cover?.frontImage
  if (coverImage?.data || coverImage?.src) {
    const imgSrc = coverImage.data || coverImage.src
    const { data } = extractBase64(imgSrc)
    
    // Resize to fit cover
    const resizedImage = await sharp(data)
      .resize(width, height, { fit: "cover" })
      .toBuffer()
    
    image = sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    }).composite([{ input: resizedImage }])
  }
  
  return await image.png().toBuffer()
}

// Main export function
export async function generateKDPExport(
  project: any,
  format: string
): Promise<Buffer> {
  switch (format) {
    case "pdf":
      return await generateCompletePDF(project)
    case "pdf-cover":
      return await generateCoverPDF(project)
    case "pdf-interior":
      return await generateInteriorPDF(project)
    case "png-cover":
      return await generateCoverPNG(project)
    default:
      throw new Error(`Unsupported format: ${format}`)
  }
}

