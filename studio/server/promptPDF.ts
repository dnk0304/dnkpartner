import { PDFDocument, rgb, StandardFonts } from "pdf-lib"

export interface PromptExportData {
  sessionName: string
  createdAt: string
  prompts: string[]
  mode?: "advanced-prompting" | "storymaker"
  scenes?: Array<{
    sceneNumber: number
    prompt: string
    duration?: number
  }>
}

// Generate PDF for Advanced Prompting Mode
export async function generatePromptsPDF(data: PromptExportData): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  
  const pageWidth = 612 // 8.5 inches * 72
  const pageHeight = 792 // 11 inches * 72
  const margin = 50
  const contentWidth = pageWidth - margin * 2
  
  let page = pdfDoc.addPage([pageWidth, pageHeight])
  let yPosition = pageHeight - margin
  
  // Title
  const titleSize = 24
  page.drawText(data.sessionName || "Prompt Collection", {
    x: margin,
    y: yPosition,
    size: titleSize,
    font: boldFont,
    color: rgb(0.2, 0.2, 0.2),
  })
  yPosition -= titleSize + 10
  
  // Subtitle
  const subtitleSize = 12
  page.drawText(`Generated: ${data.createdAt}`, {
    x: margin,
    y: yPosition,
    size: subtitleSize,
    font,
    color: rgb(0.5, 0.5, 0.5),
  })
  yPosition -= subtitleSize + 30
  
  // Draw horizontal line
  page.drawLine({
    start: { x: margin, y: yPosition },
    end: { x: pageWidth - margin, y: yPosition },
    thickness: 2,
    color: rgb(0.8, 0.8, 0.8),
  })
  yPosition -= 30
  
  // Content
  const fontSize = 11
  const lineHeight = 16
  
  if (data.mode === "storymaker" && data.scenes) {
    // StoryCreator format with scenes and durations
    for (let i = 0; i < data.scenes.length; i++) {
      const scene = data.scenes[i]
      
      // Check if we need a new page
      if (yPosition < margin + 100) {
        page = pdfDoc.addPage([pageWidth, pageHeight])
        yPosition = pageHeight - margin
      }
      
      // Scene header
      const sceneHeader = `SCENE ${scene.sceneNumber}${scene.duration ? ` [Duration: ${scene.duration}s]` : ""}`
      page.drawText(sceneHeader, {
        x: margin,
        y: yPosition,
        size: 14,
        font: boldFont,
        color: rgb(0.3, 0.3, 0.7),
      })
      yPosition -= 20
      
      // Underline
      page.drawLine({
        start: { x: margin, y: yPosition },
        end: { x: margin + 200, y: yPosition },
        thickness: 1,
        color: rgb(0.7, 0.7, 0.7),
      })
      yPosition -= 15
      
      // Scene prompt (word wrap)
      const words = scene.prompt.split(" ")
      let line = ""
      
      for (const word of words) {
        const testLine = line + word + " "
        const testWidth = font.widthOfTextAtSize(testLine, fontSize)
        
        if (testWidth > contentWidth) {
          page.drawText(line, {
            x: margin,
            y: yPosition,
            size: fontSize,
            font,
            color: rgb(0, 0, 0),
          })
          yPosition -= lineHeight
          line = word + " "
          
          // Check for new page
          if (yPosition < margin + 50) {
            page = pdfDoc.addPage([pageWidth, pageHeight])
            yPosition = pageHeight - margin
          }
        } else {
          line = testLine
        }
      }
      
      if (line.trim()) {
        page.drawText(line, {
          x: margin,
          y: yPosition,
          size: fontSize,
          font,
          color: rgb(0, 0, 0),
        })
        yPosition -= lineHeight
      }
      
      yPosition -= 20 // Space between scenes
    }
  } else {
    // Standard prompts format
    for (let i = 0; i < data.prompts.length; i++) {
      const prompt = data.prompts[i]
      
      // Check if we need a new page
      if (yPosition < margin + 100) {
        page = pdfDoc.addPage([pageWidth, pageHeight])
        yPosition = pageHeight - margin
      }
      
      // Prompt number
      page.drawText(`Prompt ${i + 1}:`, {
        x: margin,
        y: yPosition,
        size: 12,
        font: boldFont,
        color: rgb(0.3, 0.3, 0.7),
      })
      yPosition -= 20
      
      // Prompt text (word wrap)
      const words = prompt.split(" ")
      let line = ""
      
      for (const word of words) {
        const testLine = line + word + " "
        const testWidth = font.widthOfTextAtSize(testLine, fontSize)
        
        if (testWidth > contentWidth) {
          page.drawText(line, {
            x: margin,
            y: yPosition,
            size: fontSize,
            font,
            color: rgb(0, 0, 0),
          })
          yPosition -= lineHeight
          line = word + " "
          
          // Check for new page
          if (yPosition < margin + 50) {
            page = pdfDoc.addPage([pageWidth, pageHeight])
            yPosition = pageHeight - margin
          }
        } else {
          line = testLine
        }
      }
      
      if (line.trim()) {
        page.drawText(line, {
          x: margin,
          y: yPosition,
          size: fontSize,
          font,
          color: rgb(0, 0, 0),
        })
        yPosition -= lineHeight
      }
      
      yPosition -= 25 // Space between prompts
    }
  }
  
  // Add footer to all pages
  const pages = pdfDoc.getPages()
  pages.forEach((p, index) => {
    p.drawText(`Page ${index + 1} of ${pages.length}`, {
      x: pageWidth / 2 - 40,
      y: 30,
      size: 10,
      font,
      color: rgb(0.6, 0.6, 0.6),
    })
  })
  
  // Metadata
  pdfDoc.setTitle(data.sessionName || "Prompt Collection")
  pdfDoc.setCreator("DNK AI Studio")
  pdfDoc.setProducer("pdf-lib")
  pdfDoc.setCreationDate(new Date())
  
  const pdfBytes = await pdfDoc.save()
  return Buffer.from(pdfBytes)
}

