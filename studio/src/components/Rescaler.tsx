import { useState, useCallback, useRef, useEffect } from "react"
import { Upload, Plus, Trash2, Download, Save, Settings, Grid, List, ChevronLeft, ChevronRight, Loader2, X, Wand2, MessageSquare, BookOpen, Sparkles } from "lucide-react"
import { Button } from "./Button"
import { Card, CardContent, CardHeader, CardTitle } from "./Card"
import { Select } from "./Select"
import { cn } from "@/lib/utils"
import {
  RescalerProject,
  RescalerImage,
  KDP_TRIM_SIZES,
  KDP_BOOK_STYLES,
  KDP_PAPER_TYPES,
  KDPTrimSizeKey,
  KDPPaperType,
  calculateCoverDimensions,
  createEmptyRescalerProject,
  generateImageId,
  SIZE_ORIENTATIONS,
  SizeOrientation,
  ExportFormat,
  getDPIRecommendation,
  inchesToPixels,
  pixelsToInches,
  getDimensionsFromOrientation,
} from "@/types/Rescaler"
import { CoverTemplateEditor } from "./CoverTemplateEditor"
import { CanvasPreview } from "./CanvasPreview"
import { ImageEditControls } from "./ImageEditControls"
import { InlineChat } from "./InlineChat"

interface RescalerProps {
  onBack: () => void
}

export function Rescaler({ onBack }: RescalerProps) {
  const [project, setProject] = useState<RescalerProject>(createEmptyRescalerProject())
  const [savedProjects, setSavedProjects] = useState<RescalerProject[]>([])
  const [selectedImageIds, setSelectedImageIds] = useState<string[]>([])
  const [viewMode, setViewMode] = useState<"carousel" | "grid">("carousel")
  const [currentPage, setCurrentPage] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [isRescaling, setIsRescaling] = useState(false)
  const [rescaleProgress, setRescaleProgress] = useState({ current: 0, total: 0 })
  const [showBleedGuides, setShowBleedGuides] = useState(true)
  const [isCoverChatOpen, setIsCoverChatOpen] = useState(false)
  const [isGeneratingCover, setIsGeneratingCover] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)

  // Load saved projects from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("rescaler_projects")
    if (saved) {
      try {
        setSavedProjects(JSON.parse(saved))
      } catch (e) {
        console.error("Failed to load projects:", e)
      }
    }
  }, [])

  // Save projects to localStorage
  const saveProjectsToStorage = useCallback((projects: RescalerProject[]) => {
    localStorage.setItem("rescaler_projects", JSON.stringify(projects))
    setSavedProjects(projects)
  }, [])

  // Handle file upload - auto-fit images to canvas
  const handleFileUpload = useCallback(async (files: FileList | null) => {
    if (!files) return

    const newImages: RescalerImage[] = []
    
    // Calculate target dimensions if available
    let targetWidthPx = 0
    let targetHeightPx = 0
    
    if (project.mode === "amazon-kdp" && project.kdpTrimSize) {
      const trim = KDP_TRIM_SIZES[project.kdpTrimSize]
      targetWidthPx = trim.width * project.dpi
      targetHeightPx = trim.height * project.dpi
    } else if (project.customWidth && project.customHeight) {
      if (project.sizeUnit === "pixels") {
        targetWidthPx = project.customWidth
        targetHeightPx = project.customHeight
      } else {
        targetWidthPx = project.customWidth * project.dpi
        targetHeightPx = project.customHeight * project.dpi
      }
    }
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (!file.type.startsWith("image/")) continue

      const preview = await readFileAsDataURL(file)
      const dimensions = await getImageDimensions(preview)

      // Calculate scale and position to fit in canvas
      let scale = 1
      let posX = 0
      let posY = 0
      
      if (targetWidthPx > 0 && targetHeightPx > 0) {
        const scaleX = targetWidthPx / dimensions.width
        const scaleY = targetHeightPx / dimensions.height
        scale = Math.min(scaleX, scaleY)
        
        const scaledWidth = dimensions.width * scale
        const scaledHeight = dimensions.height * scale
        posX = (targetWidthPx - scaledWidth) / 2
        posY = (targetHeightPx - scaledHeight) / 2
      }

      newImages.push({
        id: generateImageId(),
        file,
        preview,
        originalWidth: dimensions.width,
        originalHeight: dimensions.height,
        dpi: project.dpi,
        position: { x: posX, y: posY },
        scale,
        rotation: 0,
      })
    }

    setProject(prev => ({
      ...prev,
      images: [...prev.images, ...newImages],
      updatedAt: Date.now(),
    }))
  }, [project.dpi, project.mode, project.kdpTrimSize, project.customWidth, project.customHeight, project.sizeUnit])

  // Read file as data URL
  const readFileAsDataURL = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  // Get image dimensions
  const getImageDimensions = (src: string): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve({ width: img.width, height: img.height })
      img.onerror = reject
      img.src = src
    })
  }

  // Drag and drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    handleFileUpload(e.dataTransfer.files)
  }

  // Save project
  const handleSaveProject = useCallback(() => {
    const updatedProject = { ...project, updatedAt: Date.now() }
    const existingIndex = savedProjects.findIndex(p => p.id === project.id)
    
    let newProjects: RescalerProject[]
    if (existingIndex >= 0) {
      newProjects = [...savedProjects]
      newProjects[existingIndex] = updatedProject
    } else {
      newProjects = [...savedProjects, updatedProject]
    }
    
    saveProjectsToStorage(newProjects)
    setProject(updatedProject)
  }, [project, savedProjects, saveProjectsToStorage])

  // Load project
  const handleLoadProject = useCallback((projectId: string) => {
    const proj = savedProjects.find(p => p.id === projectId)
    if (proj) {
      setProject(proj)
    }
  }, [savedProjects])

  // Delete selected images
  const handleDeleteImages = useCallback(() => {
    setProject(prev => ({
      ...prev,
      images: prev.images.filter(img => !selectedImageIds.includes(img.id)),
      updatedAt: Date.now(),
    }))
    setSelectedImageIds([])
  }, [selectedImageIds])

  // Delete a single image
  const handleDeleteSingleImage = useCallback((imageId: string) => {
    setProject(prev => ({
      ...prev,
      images: prev.images.filter(img => img.id !== imageId),
      updatedAt: Date.now(),
    }))
    // Adjust current page if needed
    if (currentPage >= project.images.length - 1 && currentPage > 0) {
      setCurrentPage(currentPage - 1)
    }
  }, [currentPage, project.images.length])

  // Update image properties (scale, position, rotation)
  const handleUpdateImageProperty = useCallback((imageId: string, updates: Partial<RescalerImage>) => {
    setProject(prev => ({
      ...prev,
      images: prev.images.map(img => 
        img.id === imageId ? { ...img, ...updates } : img
      ),
      updatedAt: Date.now(),
    }))
  }, [])

  // Download a single image with current transforms applied
  const handleDownloadImage = useCallback(async (image: RescalerImage, filename?: string) => {
    // Get target dimensions
    let targetWidthInches: number
    let targetHeightInches: number
    
    if (project.mode === "amazon-kdp" && project.kdpTrimSize) {
      const trim = KDP_TRIM_SIZES[project.kdpTrimSize]
      targetWidthInches = trim.width
      targetHeightInches = trim.height
    } else if (project.customWidth && project.customHeight) {
      if (project.sizeUnit === "pixels") {
        targetWidthInches = project.customWidth / project.dpi
        targetHeightInches = project.customHeight / project.dpi
      } else {
        targetWidthInches = project.customWidth
        targetHeightInches = project.customHeight
      }
    } else {
      // Fallback to original image dimensions
      targetWidthInches = image.originalWidth / project.dpi
      targetHeightInches = image.originalHeight / project.dpi
    }

    const targetWidthPx = Math.round(targetWidthInches * project.dpi)
    const targetHeightPx = Math.round(targetHeightInches * project.dpi)

    // Create canvas
    const canvas = document.createElement("canvas")
    canvas.width = targetWidthPx
    canvas.height = targetHeightPx
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Fill with white background
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, targetWidthPx, targetHeightPx)

    // Load and draw the image
    const img = new Image()
    img.crossOrigin = "anonymous"
    
    await new Promise<void>((resolve, reject) => {
      img.onload = () => {
        // Apply transforms
        ctx.save()
        
        // Move to position
        ctx.translate(image.position.x, image.position.y)
        
        // Apply rotation around center of scaled image
        const scaledWidth = image.originalWidth * image.scale
        const scaledHeight = image.originalHeight * image.scale
        ctx.translate(scaledWidth / 2, scaledHeight / 2)
        ctx.rotate((image.rotation * Math.PI) / 180)
        ctx.translate(-scaledWidth / 2, -scaledHeight / 2)
        
        // Draw image with scale
        ctx.drawImage(img, 0, 0, scaledWidth, scaledHeight)
        
        ctx.restore()
        resolve()
      }
      img.onerror = reject
      img.src = image.preview
    })

    // Download
    const link = document.createElement("a")
    link.download = filename || `${image.file?.name?.replace(/\.[^.]+$/, "") || "image"}_rescaled.png`
    link.href = canvas.toDataURL("image/png")
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }, [project])

  // Generate AI Cover using Replicate with Step 3 images as reference
  const handleGenerateAICover = useCallback(async () => {
    if (!project.kdpTrimSize || !project.kdpPaperType || !project.kdpPageCount) {
      alert("Please complete Step 2 first (Trim Size, Paper Type, and Page Count)")
      return
    }

    // Calculate cover dimensions
    const coverDims = calculateCoverDimensions(
      project.kdpTrimSize,
      project.kdpPageCount,
      project.kdpPaperType
    )

    // Build prompt from interior images
    let prompt = "Professional book cover design"
    
    if (project.images.length > 0) {
      prompt = `Create a professional book cover design that matches the style and theme of the interior pages. 
The cover should be cohesive with the content inside. 
Style: Modern, professional, eye-catching.
Dimensions: ${coverDims.totalWidth.toFixed(2)}" x ${coverDims.totalHeight.toFixed(2)}" (full wrap cover with spine).
Include front cover, spine, and back cover in one seamless design.
High resolution, print-ready quality.`
    }

    setIsGeneratingCover(true)

    try {
      // Collect reference images from Step 3 (max 3 for API limits)
      const referenceImages = project.images.slice(0, 3).map(img => img.preview)

      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          model: "z-image-turbo-replicate",
          width: Math.round(coverDims.totalWidth * project.dpi),
          height: Math.round(coverDims.totalHeight * project.dpi),
          referenceImages: referenceImages.length > 0 ? referenceImages : undefined,
          quality: "hd",
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to generate cover")
      }

      const data = await response.json()
      
      if (data.imageUrl) {
        // Load the generated image
        const img = new Image()
        img.crossOrigin = "anonymous"
        
        await new Promise<void>((resolve, reject) => {
          img.onload = () => {
            // Convert to base64
            const canvas = document.createElement("canvas")
            canvas.width = img.width
            canvas.height = img.height
            const ctx = canvas.getContext("2d")
            if (ctx) {
              ctx.drawImage(img, 0, 0)
              const preview = canvas.toDataURL("image/png")
              
              // Set as cover image
              setProject(prev => ({
                ...prev,
                coverImage: {
                  id: `cover_ai_${Date.now()}`,
                  file: new File([], "ai_generated_cover.png"),
                  preview,
                  originalWidth: img.width,
                  originalHeight: img.height,
                  dpi: project.dpi,
                  position: { x: 0, y: 0 },
                  scale: 1,
                  rotation: 0,
                },
                updatedAt: Date.now(),
              }))
            }
            resolve()
          }
          img.onerror = reject
          img.src = data.imageUrl
        })

        alert("✨ AI Cover generated successfully!")
      }
    } catch (error) {
      console.error("AI Cover generation error:", error)
      alert(`Failed to generate cover: ${error instanceof Error ? error.message : "Unknown error"}`)
    } finally {
      setIsGeneratingCover(false)
    }
  }, [project])

  // Auto-resize to fit target dimensions with progress indicator
  const handleAutoResize = useCallback(async () => {
    if (project.images.length === 0) return

    // Calculate target dimensions based on mode
    let targetWidthInches: number
    let targetHeightInches: number
    
    if (project.mode === "amazon-kdp" && project.kdpTrimSize) {
      // KDP Mode: use trim size (interior page dimensions)
      const trim = KDP_TRIM_SIZES[project.kdpTrimSize]
      targetWidthInches = trim.width
      targetHeightInches = trim.height
    } else if (project.customWidth && project.customHeight) {
      // Standard Mode: use custom dimensions
      if (project.sizeUnit === "pixels") {
        targetWidthInches = project.customWidth / project.dpi
        targetHeightInches = project.customHeight / project.dpi
      } else {
        targetWidthInches = project.customWidth
        targetHeightInches = project.customHeight
      }
    } else {
      alert("Please configure target dimensions first.")
      return
    }

    // Convert target to pixels at project DPI
    const targetWidthPx = targetWidthInches * project.dpi
    const targetHeightPx = targetHeightInches * project.dpi

    setIsRescaling(true)
    setRescaleProgress({ current: 0, total: project.images.length })

    // Process images one by one with visual feedback
    const updatedImages = [...project.images]
    
    for (let i = 0; i < updatedImages.length; i++) {
      setRescaleProgress({ current: i + 1, total: updatedImages.length })
      
      const img = updatedImages[i]
      
      // Calculate scale to fit image within target dimensions
      // Scale is relative to original image size
      const scaleX = targetWidthPx / img.originalWidth
      const scaleY = targetHeightPx / img.originalHeight
      
      // Use the smaller scale to ensure image fits within bounds (contain mode)
      const scale = Math.min(scaleX, scaleY)
      
      // Calculate the scaled image dimensions
      const scaledWidth = img.originalWidth * scale
      const scaledHeight = img.originalHeight * scale
      
      // Center the image within the target canvas
      // Position is in pixels at target DPI, relative to trim area origin
      const offsetX = (targetWidthPx - scaledWidth) / 2
      const offsetY = (targetHeightPx - scaledHeight) / 2
      
      updatedImages[i] = { 
        ...img, 
        scale,
        position: { x: offsetX, y: offsetY },
        targetWidth: targetWidthInches,
        targetHeight: targetHeightInches,
        dpi: project.dpi,
      }
      
      // Small delay for visual feedback
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    setProject(prev => ({
      ...prev,
      images: updatedImages,
      updatedAt: Date.now(),
    }))

    setIsRescaling(false)
    setRescaleProgress({ current: 0, total: 0 })
  }, [project])

  // Generate PDF or Image
  const [isGenerating, setIsGenerating] = useState(false)
  
  const handleGenerateExport = async (format?: ExportFormat, withGuides: boolean = false) => {
    if (project.images.length === 0) {
      alert("Please upload at least one image first.")
      return
    }

    if (!getTargetDimensions()) {
      alert("Please configure the target dimensions first.")
      return
    }

    const exportFormat = format || project.exportFormat || "pdf"
    setIsGenerating(true)

    try {
      console.log(`Sending ${exportFormat.toUpperCase()} generation request...`)
      
      // Prepare project data with converted dimensions if needed
      let exportProject = { ...project }
      if (project.sizeUnit === "pixels" && project.customWidth && project.customHeight) {
        exportProject = {
          ...project,
          customWidth: pixelsToInches(project.customWidth, project.dpi),
          customHeight: pixelsToInches(project.customHeight, project.dpi),
        }
      }
      
      const endpoint = exportFormat === "pdf" 
        ? "/api/rescaler/generate-pdf"
        : "/api/rescaler/export-image"
      
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          project: {
            ...exportProject,
            images: exportProject.images.map(img => ({
              id: img.id,
              data: img.preview, // Base64 data URL
              originalWidth: img.originalWidth,
              originalHeight: img.originalHeight,
              dpi: img.dpi,
              position: img.position,
              scale: img.scale,
              rotation: img.rotation,
            })),
          },
          format: exportFormat,
          withGuides: exportFormat === "pdf" ? withGuides : false,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || `Failed to generate ${exportFormat.toUpperCase()}`)
      }

      // Download file
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      
      // Determine file extension
      const extensions: Record<string, string> = {
        pdf: ".pdf",
        png: ".png",
        jpeg: ".jpg",
        tiff: ".tif",
      }
      const fileName = (project.pdfFileName || "output").replace(/\.[^.]+$/, "") + extensions[exportFormat]
      a.download = fileName
      
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      console.log(`✓ ${exportFormat.toUpperCase()} downloaded successfully: ${fileName}`)
    } catch (error) {
      console.error(`${exportFormat.toUpperCase()} generation error:`, error)
      alert(`Failed to generate ${exportFormat.toUpperCase()}: ${error instanceof Error ? error.message : "Unknown error"}`)
    } finally {
      setIsGenerating(false)
    }
  }

  // Calculate target dimensions based on mode
  const getTargetDimensions = () => {
    if (project.mode === "amazon-kdp" && project.kdpTrimSize) {
      if (project.kdpCoverType === "full-cover" && project.kdpPaperType && project.kdpPageCount) {
        const coverDims = calculateCoverDimensions(
          project.kdpTrimSize,
          project.kdpPageCount,
          project.kdpPaperType
        )
        return {
          width: coverDims.totalWidth,
          height: coverDims.totalHeight,
          label: `Full Cover: ${coverDims.totalWidth.toFixed(2)}" x ${coverDims.totalHeight.toFixed(2)}" (Spine: ${coverDims.spineWidth.toFixed(3)}")`,
        }
      } else {
        const trimSize = KDP_TRIM_SIZES[project.kdpTrimSize]
        return {
          width: trimSize.width,
          height: trimSize.height,
          label: `Interior: ${trimSize.label}`,
        }
      }
    } else if (project.customWidth && project.customHeight) {
      // Convert to inches if in pixels
      let widthInches = project.customWidth
      let heightInches = project.customHeight
      
      if (project.sizeUnit === "pixels") {
        widthInches = pixelsToInches(project.customWidth, project.dpi)
        heightInches = pixelsToInches(project.customHeight, project.dpi)
      }
      
      const unit = project.sizeUnit || "inches"
      return {
        width: widthInches,
        height: heightInches,
        label: `Custom: ${project.customWidth}${unit === "inches" ? '"' : "px"} x ${project.customHeight}${unit === "inches" ? '"' : "px"}`,
      }
    }
    return null
  }

  const targetDims = getTargetDimensions()

  return (
    <div className="min-h-screen bg-[var(--color-background)] p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={onBack}>
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-[var(--color-text)]">📐 Rescaler</h1>
              <p className="text-sm text-[var(--color-text-dim)]">Auto-resize images for print & PDF</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {savedProjects.length > 0 && (
              <Select
                value={project.id}
                onChange={(e) => handleLoadProject(e.target.value)}
                className="w-48"
              >
                <option value={project.id}>Current Project</option>
                {savedProjects.filter(p => p.id !== project.id).map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            )}
            <Button variant="outline" size="sm" onClick={handleSaveProject}>
              <Save className="w-4 h-4 mr-2" />
              Save Project
            </Button>
          </div>
        </div>

        {/* Project Info Card */}
        <Card>
          <CardContent className="py-4">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-2">
                Project Name
              </label>
              <input
                type="text"
                value={project.name}
                onChange={(e) => setProject(prev => ({ ...prev, name: e.target.value, updatedAt: Date.now() }))}
                className="w-full px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                placeholder="My Print Project"
              />
              <p className="text-xs text-[var(--color-text-dim)] mt-1">
                💡 Give your project a name to easily find it later
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Progress Indicator - 5 steps for KDP, 4 for Standard */}
        <div className="flex items-center justify-center gap-2">
          {(project.mode === "amazon-kdp" ? [1, 2, 3, 4, 5] : [1, 2, 3, 4]).map((step) => {
            const totalSteps = project.mode === "amazon-kdp" ? 5 : 4
            const isComplete = 
              (step === 1 && project.mode) ||
              (step === 2 && targetDims) ||
              (step === 3 && project.images.length > 0) ||
              (step === 4 && project.mode === "amazon-kdp" && project.coverImage) ||
              (step === totalSteps && false) // Final step is always the export action
            const isCurrent = 
              (step === 1 && !project.mode) ||
              (step === 2 && project.mode && !targetDims) ||
              (step === 3 && targetDims && project.images.length === 0) ||
              (step === 4 && project.mode === "amazon-kdp" && project.images.length > 0 && !project.coverImage) ||
              (step === totalSteps && project.images.length > 0 && targetDims && (project.mode !== "amazon-kdp" || project.coverImage))
            
            return (
              <div key={step} className="flex items-center">
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all",
                  isComplete 
                    ? "bg-green-500 text-white"
                    : isCurrent
                      ? "bg-[var(--color-primary)] text-white ring-2 ring-[var(--color-primary)]/30"
                      : "bg-[var(--color-surface)] text-[var(--color-text-dim)] border border-[var(--color-border)]"
                )}>
                  {isComplete ? "✓" : step}
                </div>
                {step < totalSteps && (
                  <div className={cn(
                    "w-12 h-0.5 mx-1",
                    isComplete ? "bg-green-500" : "bg-[var(--color-border)]"
                  )} />
                )}
              </div>
            )
          })}
        </div>

        {/* Step 1: Mode Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <span className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                project.mode ? "bg-green-500 text-white" : "bg-[var(--color-primary)] text-white"
              )}>
                {project.mode ? "✓" : "1"}
              </span>
              Step 1: Select Mode
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-[var(--color-text-muted)] bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
              💡 <strong>Tip:</strong> Choose Standard Mode for general image resizing, or Amazon KDP Mode for creating book covers and interiors that meet KDP's exact specifications.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setProject(prev => ({ ...prev, mode: "standard", updatedAt: Date.now() }))}
                className={cn(
                  "p-4 rounded-lg border-2 transition-all text-left",
                  project.mode === "standard"
                    ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10"
                    : "border-[var(--color-border)] hover:border-[var(--color-border-bright)]"
                )}
              >
                <h3 className="font-semibold text-[var(--color-text)] mb-1">✨ Standard Rescaling</h3>
                <p className="text-xs text-[var(--color-text-dim)] mb-2">Custom dimensions for any use case</p>
                <ul className="text-xs text-[var(--color-text-dim)] space-y-1">
                  <li>• Flexible size options (inches/pixels)</li>
                  <li>• Multiple export formats (PDF, PNG, JPEG, TIFF)</li>
                  <li>• Perfect for posters, prints, digital art</li>
                </ul>
              </button>
              <button
                onClick={() => setProject(prev => ({ ...prev, mode: "amazon-kdp", updatedAt: Date.now() }))}
                className={cn(
                  "p-4 rounded-lg border-2 transition-all text-left",
                  project.mode === "amazon-kdp"
                    ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10"
                    : "border-[var(--color-border)] hover:border-[var(--color-border-bright)]"
                )}
              >
                <h3 className="font-semibold text-[var(--color-text)] mb-1">📚 Amazon KDP Mode</h3>
                <p className="text-xs text-[var(--color-text-dim)] mb-2">Pre-configured for KDP print books</p>
                <ul className="text-xs text-[var(--color-text-dim)] space-y-1">
                  <li>• Official KDP trim sizes</li>
                  <li>• Automatic spine calculation</li>
                  <li>• Bleed guides & safe zones</li>
                </ul>
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Step 2: Size Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <span className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                targetDims ? "bg-green-500 text-white" : project.mode ? "bg-[var(--color-primary)] text-white" : "bg-[var(--color-surface)] text-[var(--color-text-dim)] border border-[var(--color-border)]"
              )}>
                {targetDims ? "✓" : "2"}
              </span>
              Step 2: Configure Size
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {project.mode === "standard" ? (
              <div className="space-y-4">
                {/* Orientation Presets */}
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-2">
                    Orientation Presets
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(SIZE_ORIENTATIONS).map(([key, value]) => (
                      <button
                        key={key}
                        onClick={() => {
                          const dims = getDimensionsFromOrientation(key as SizeOrientation)
                          setProject(prev => ({
                            ...prev,
                            orientation: key as SizeOrientation,
                            customWidth: dims.width,
                            customHeight: dims.height,
                            updatedAt: Date.now(),
                          }))
                        }}
                        className={cn(
                          "p-3 rounded-lg border transition-all text-left",
                          project.orientation === key
                            ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10"
                            : "border-[var(--color-border)] hover:border-[var(--color-border-bright)]"
                        )}
                      >
                        <div className="font-medium text-sm text-[var(--color-text)]">{value.label}</div>
                        <div className="text-xs text-[var(--color-text-dim)]">{value.description}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Size Unit Selector */}
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-2">
                    Size Unit
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        const newUnit = "inches"
                        if (project.sizeUnit === "pixels" && project.customWidth && project.customHeight) {
                          setProject(prev => ({
                            ...prev,
                            sizeUnit: newUnit,
                            customWidth: pixelsToInches(prev.customWidth!, prev.dpi),
                            customHeight: pixelsToInches(prev.customHeight!, prev.dpi),
                            updatedAt: Date.now(),
                          }))
                        } else {
                          setProject(prev => ({ ...prev, sizeUnit: newUnit, updatedAt: Date.now() }))
                        }
                      }}
                      className={cn(
                        "flex-1 px-4 py-2 rounded-lg border transition-all text-sm font-medium",
                        project.sizeUnit === "inches"
                          ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-text)]"
                          : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-border-bright)]"
                      )}
                    >
                      Inches
                    </button>
                    <button
                      onClick={() => {
                        const newUnit = "pixels"
                        if (project.sizeUnit === "inches" && project.customWidth && project.customHeight) {
                          setProject(prev => ({
                            ...prev,
                            sizeUnit: newUnit,
                            customWidth: inchesToPixels(prev.customWidth!, prev.dpi),
                            customHeight: inchesToPixels(prev.customHeight!, prev.dpi),
                            updatedAt: Date.now(),
                          }))
                        } else {
                          setProject(prev => ({ ...prev, sizeUnit: newUnit, updatedAt: Date.now() }))
                        }
                      }}
                      className={cn(
                        "flex-1 px-4 py-2 rounded-lg border transition-all text-sm font-medium",
                        project.sizeUnit === "pixels"
                          ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-text)]"
                          : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-border-bright)]"
                      )}
                    >
                      Pixels
                    </button>
                  </div>
                </div>

                {/* Custom Dimensions */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-2">
                      Width ({project.sizeUnit || "inches"})
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        step={project.sizeUnit === "pixels" ? "1" : "0.01"}
                        min={project.sizeUnit === "pixels" ? "1" : "0.1"}
                        value={project.customWidth || ""}
                        onChange={(e) => setProject(prev => ({ ...prev, customWidth: parseFloat(e.target.value) || undefined, orientation: undefined, updatedAt: Date.now() }))}
                        className="flex-1 px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                        placeholder={project.sizeUnit === "pixels" ? "2550" : "8.5"}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-2">
                      Height ({project.sizeUnit || "inches"})
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        step={project.sizeUnit === "pixels" ? "1" : "0.01"}
                        min={project.sizeUnit === "pixels" ? "1" : "0.1"}
                        value={project.customHeight || ""}
                        onChange={(e) => setProject(prev => ({ ...prev, customHeight: parseFloat(e.target.value) || undefined, orientation: undefined, updatedAt: Date.now() }))}
                        className="flex-1 px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                        placeholder={project.sizeUnit === "pixels" ? "3300" : "11"}
                      />
                    </div>
                  </div>
                </div>

                {/* Export Format Selector */}
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-2">
                    Export Format
                  </label>
                  <Select
                    value={project.exportFormat || "pdf"}
                    onChange={(e) => setProject(prev => ({ ...prev, exportFormat: e.target.value as ExportFormat, updatedAt: Date.now() }))}
                    className="w-full"
                  >
                    <option value="pdf">PDF (Portable Document Format)</option>
                    <option value="png">PNG (High quality, lossless)</option>
                    <option value="jpeg">JPEG (Compressed, smaller file)</option>
                    <option value="tiff">TIFF (Professional print)</option>
                  </Select>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-2">
                    Trim Size
                  </label>
                  <Select
                    value={project.kdpTrimSize || ""}
                    onChange={(e) => setProject(prev => ({ ...prev, kdpTrimSize: e.target.value as KDPTrimSizeKey, updatedAt: Date.now() }))}
                    className="w-full"
                  >
                    <option value="">Select trim size...</option>
                    {Object.entries(KDP_TRIM_SIZES).map(([key, size]) => (
                      <option key={key} value={key}>{size.label}</option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-2">
                    Book Style
                  </label>
                  <Select
                    value={project.kdpBookStyle || ""}
                    onChange={(e) => setProject(prev => ({ ...prev, kdpBookStyle: e.target.value, updatedAt: Date.now() }))}
                    className="w-full"
                  >
                    <option value="">Select book style...</option>
                    {KDP_BOOK_STYLES.map((style) => (
                      <option key={style.value} value={style.value}>{style.label}</option>
                    ))}
                  </Select>
                  {project.kdpBookStyle && (
                    <p className="text-xs text-[var(--color-text-dim)] mt-1">
                      {KDP_BOOK_STYLES.find(s => s.value === project.kdpBookStyle)?.description}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-2">
                    Paper Type
                  </label>
                  <Select
                    value={project.kdpPaperType || "white"}
                    onChange={(e) => setProject(prev => ({ ...prev, kdpPaperType: e.target.value as KDPPaperType, updatedAt: Date.now() }))}
                    className="w-full"
                  >
                    {Object.entries(KDP_PAPER_TYPES).map(([key, paper]) => (
                      <option key={key} value={key}>{paper.label}</option>
                    ))}
                  </Select>
                  <p className="text-xs text-[var(--color-text-dim)] mt-1">
                    {project.kdpPaperType && KDP_PAPER_TYPES[project.kdpPaperType].description}
                  </p>
                </div>
                {/* Page Count - needed for cover spine calculation in Step 4 */}
                <div>
                  <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-2">
                    Page Count (for spine calculation)
                  </label>
                  <input
                    type="number"
                    min="24"
                    max="828"
                    step="2"
                    value={project.kdpPageCount || ""}
                    onChange={(e) => setProject(prev => ({ ...prev, kdpPageCount: parseInt(e.target.value) || undefined, updatedAt: Date.now() }))}
                    className="w-full px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                    placeholder="Enter total page count (e.g., 100)"
                  />
                  <p className="text-xs text-[var(--color-text-dim)] mt-1">
                    📖 Required for cover generation in Step 4 (spine width depends on page count)
                  </p>
                </div>
              </div>
            )}
            
            {targetDims && (
              <div className="p-3 bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/30 rounded-lg">
                <p className="text-sm font-medium text-[var(--color-text)]">
                  Target: {targetDims.label}
                </p>
                <p className="text-xs text-[var(--color-text-dim)] mt-1">
                  {(targetDims.width * project.dpi).toFixed(0)} x {(targetDims.height * project.dpi).toFixed(0)} pixels @ {project.dpi} DPI
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-2">
                DPI (Resolution)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="72"
                  max="600"
                  step="1"
                  value={project.dpi}
                  onChange={(e) => setProject(prev => ({ ...prev, dpi: parseInt(e.target.value) || 300, updatedAt: Date.now() }))}
                  className="flex-1 px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                />
                {targetDims && (() => {
                  const recommendation = getDPIRecommendation(targetDims.width, targetDims.height)
                  if (recommendation.dpi !== project.dpi) {
                    return (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setProject(prev => ({ ...prev, dpi: recommendation.dpi, updatedAt: Date.now() }))}
                        title={recommendation.description}
                      >
                        Use {recommendation.label}
                      </Button>
                    )
                  }
                  return null
                })()}
              </div>
              {targetDims && (() => {
                const recommendation = getDPIRecommendation(targetDims.width, targetDims.height)
                return (
                  <p className="text-xs text-[var(--color-text-dim)] mt-1">
                    💡 Recommended: {recommendation.label} - {recommendation.description}
                  </p>
                )
              })()}
            </div>
          </CardContent>
        </Card>

        {/* Step 3: Interior Pages */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <span className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                project.images.length > 0 ? "bg-green-500 text-white" : targetDims ? "bg-[var(--color-primary)] text-white" : "bg-[var(--color-surface)] text-[var(--color-text-dim)] border border-[var(--color-border)]"
              )}>
                {project.images.length > 0 ? "✓" : "3"}
              </span>
              Step 3: Interior Pages
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Canvas Preview for KDP Mode - shows target dimensions */}
            {project.mode === "amazon-kdp" && project.kdpTrimSize && (
              <div className="mb-4 p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg">
                <h4 className="text-sm font-medium text-[var(--color-text)] mb-3">
                  📐 Page Canvas Preview
                  <span className="text-xs text-[var(--color-text-dim)] ml-2 font-normal">
                    (Drag image to reposition, drag corners to resize)
                  </span>
                </h4>
                <CanvasPreview
                  trimSize={project.kdpTrimSize}
                  paperType={project.kdpPaperType}
                  pageCount={project.kdpPageCount}
                  dpi={project.dpi}
                  mode="interior"
                  image={project.images[currentPage]}
                  showBleedGuides={showBleedGuides}
                  onToggleBleedGuides={setShowBleedGuides}
                  onImagePositionChange={(x, y) => {
                    if (project.images[currentPage]) {
                      handleUpdateImageProperty(project.images[currentPage].id, { position: { x, y } })
                    }
                  }}
                  onImageScaleChange={(scale) => {
                    if (project.images[currentPage]) {
                      handleUpdateImageProperty(project.images[currentPage].id, { scale })
                    }
                  }}
                />
              </div>
            )}

            <div
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              className={cn(
                "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
                isDragging
                  ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10"
                  : "border-[var(--color-border)] hover:border-[var(--color-border-bright)]"
              )}
            >
              <Upload className="w-12 h-12 mx-auto mb-4 text-[var(--color-text-dim)]" />
              <p className="text-sm text-[var(--color-text-muted)] mb-2">
                Drag & drop images here, or click to browse
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <Plus className="w-4 h-4 mr-2" />
                Select Images
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*"
                onChange={(e) => handleFileUpload(e.target.files)}
                className="hidden"
              />
            </div>

            {project.images.length > 0 && (
              <div className="mt-4 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-[var(--color-text-muted)]">
                    {project.images.length} image{project.images.length !== 1 ? "s" : ""} uploaded
                  </p>
                  <div className="flex items-center gap-2">
                    {selectedImageIds.length > 0 && (
                      <Button variant="ghost" size="sm" onClick={handleDeleteImages}>
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete ({selectedImageIds.length})
                      </Button>
                    )}
                    <Button 
                      variant="playful" 
                      size="sm" 
                      onClick={handleAutoResize} 
                      disabled={!targetDims || isRescaling}
                      className={cn(
                        "relative overflow-hidden",
                        !isRescaling && "bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                      )}
                    >
                      {isRescaling ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Rescaling {rescaleProgress.current}/{rescaleProgress.total}
                        </>
                      ) : (
                        <>
                          <Wand2 className="w-4 h-4 mr-2" />
                          Auto Rescale
                        </>
                      )}
                    </Button>
                    <div className="flex gap-1">
                      <Button
                        variant={viewMode === "carousel" ? "primary" : "ghost"}
                        size="icon-sm"
                        onClick={() => setViewMode("carousel")}
                      >
                        <List className="w-4 h-4" />
                      </Button>
                      <Button
                        variant={viewMode === "grid" ? "primary" : "ghost"}
                        size="icon-sm"
                        onClick={() => setViewMode("grid")}
                      >
                        <Grid className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>

                {viewMode === "grid" ? (
                  <div className="grid grid-cols-3 gap-4">
                    {project.images.map(img => (
                      <div
                        key={img.id}
                        className={cn(
                          "relative aspect-square rounded-lg border-2 cursor-pointer overflow-hidden transition-all group",
                          selectedImageIds.includes(img.id)
                            ? "border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/30"
                            : "border-[var(--color-border)] hover:border-[var(--color-border-bright)]"
                        )}
                      >
                        <img 
                          src={img.preview} 
                          alt="" 
                          className="w-full h-full object-cover"
                          onClick={() => {
                            if (selectedImageIds.includes(img.id)) {
                              setSelectedImageIds(prev => prev.filter(id => id !== img.id))
                            } else {
                              setSelectedImageIds(prev => [...prev, img.id])
                            }
                          }}
                        />
                        {/* Action buttons */}
                        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {/* Download button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDownloadImage(img)
                            }}
                            className="w-6 h-6 bg-blue-500/80 hover:bg-blue-500 rounded-full flex items-center justify-center"
                            title="Download image"
                          >
                            <Download className="w-3 h-3 text-white" />
                          </button>
                          {/* Delete button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleDeleteSingleImage(img.id)
                            }}
                            className="w-6 h-6 bg-red-500/80 hover:bg-red-500 rounded-full flex items-center justify-center"
                            title="Delete image"
                          >
                            <X className="w-4 h-4 text-white" />
                          </button>
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                          <p className="text-xs text-white truncate">{img.file.name}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  /* Horizontal Carousel/Slider View */
                  <div className="relative">
                    {project.images.length > 0 && (
                      <>
                        {/* Main Image Display */}
                        <div className="relative aspect-[4/3] rounded-lg border-2 border-[var(--color-border)] overflow-hidden bg-[var(--color-surface)]">
                          <img
                            src={project.images[currentPage]?.preview}
                            alt=""
                            className="w-full h-full object-contain"
                          />
                          {/* Action buttons on main image */}
                          <div className="absolute top-3 right-3 flex gap-2">
                            {/* Download button */}
                            <button
                              onClick={() => handleDownloadImage(project.images[currentPage])}
                              className="w-8 h-8 bg-blue-500/80 hover:bg-blue-500 rounded-full flex items-center justify-center transition-colors"
                              title="Download image"
                            >
                              <Download className="w-4 h-4 text-white" />
                            </button>
                            {/* Delete button */}
                            <button
                              onClick={() => handleDeleteSingleImage(project.images[currentPage].id)}
                              className="w-8 h-8 bg-red-500/80 hover:bg-red-500 rounded-full flex items-center justify-center transition-colors"
                              title="Delete image"
                            >
                              <X className="w-5 h-5 text-white" />
                            </button>
                          </div>
                          {/* Navigation arrows */}
                          {currentPage > 0 && (
                            <button
                              onClick={() => setCurrentPage(prev => Math.max(0, prev - 1))}
                              className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center transition-colors"
                            >
                              <ChevronLeft className="w-6 h-6 text-white" />
                            </button>
                          )}
                          {currentPage < project.images.length - 1 && (
                            <button
                              onClick={() => setCurrentPage(prev => Math.min(project.images.length - 1, prev + 1))}
                              className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center transition-colors"
                            >
                              <ChevronRight className="w-6 h-6 text-white" />
                            </button>
                          )}
                        </div>
                        
                        {/* Thumbnail Strip */}
                        <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-2">
                          {project.images.map((img, idx) => (
                            <button
                              key={img.id}
                              onClick={() => setCurrentPage(idx)}
                              className={cn(
                                "flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all",
                                currentPage === idx
                                  ? "border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/30"
                                  : "border-[var(--color-border)] hover:border-[var(--color-border-bright)] opacity-60 hover:opacity-100"
                              )}
                            >
                              <img src={img.preview} alt="" className="w-full h-full object-cover" />
                            </button>
                          ))}
                        </div>
                        
                        {/* Counter and Grid Toggle */}
                        <div className="flex items-center justify-between mt-2">
                          <div className="text-sm text-[var(--color-text-muted)]">
                            {currentPage + 1} of {project.images.length} images
                          </div>
                          <button
                            onClick={() => setViewMode("grid")}
                            className="text-xs text-[var(--color-primary)] hover:underline"
                          >
                            View as Grid
                          </button>
                        </div>

                        {/* Image Edit Controls - only in KDP mode */}
                        {project.mode === "amazon-kdp" && project.images[currentPage] && (
                          <div className="mt-4">
                            <ImageEditControls
                              scale={project.images[currentPage].scale}
                              positionX={project.images[currentPage].position.x}
                              positionY={project.images[currentPage].position.y}
                              rotation={project.images[currentPage].rotation}
                              onScaleChange={(scale) => handleUpdateImageProperty(project.images[currentPage].id, { scale })}
                              onPositionChange={(x, y) => handleUpdateImageProperty(project.images[currentPage].id, { position: { x, y } })}
                              onRotationChange={(rotation) => handleUpdateImageProperty(project.images[currentPage].id, { rotation })}
                            />
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Step 4: Cover (KDP Mode Only) */}
        {project.mode === "amazon-kdp" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <span className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                  project.coverImage ? "bg-green-500 text-white" : project.images.length > 0 ? "bg-[var(--color-primary)] text-white" : "bg-[var(--color-surface)] text-[var(--color-text-dim)] border border-[var(--color-border)]"
                )}>
                  {project.coverImage ? "✓" : "4"}
                </span>
                <BookOpen className="w-5 h-5 text-[var(--color-primary)]" />
                Step 4: Cover
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-[var(--color-text-muted)] bg-purple-500/10 border border-purple-500/30 rounded-lg p-3">
                📚 <strong>Cover Generation:</strong> Upload or generate your book cover using AI assistance. The canvas shows exact KDP dimensions with bleed guides.
              </p>
              
              {/* Cover Canvas Preview with full cover dimensions */}
              {project.kdpTrimSize && project.kdpPaperType && project.kdpPageCount ? (
                <div className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg">
                  <h4 className="text-sm font-medium text-[var(--color-text)] mb-3">
                    📖 Full Cover Canvas (Front + Spine + Back)
                    <span className="text-xs text-[var(--color-text-dim)] ml-2 font-normal">
                      (Drag image to reposition, drag corners to resize)
                    </span>
                  </h4>
                  <CanvasPreview
                    trimSize={project.kdpTrimSize}
                    paperType={project.kdpPaperType}
                    pageCount={project.kdpPageCount}
                    dpi={project.dpi}
                    mode="cover"
                    image={project.coverImage}
                    showBleedGuides={showBleedGuides}
                    onToggleBleedGuides={setShowBleedGuides}
                    onImagePositionChange={(x, y) => {
                      if (project.coverImage) {
                        setProject(prev => ({
                          ...prev,
                          coverImage: prev.coverImage ? { ...prev.coverImage, position: { x, y } } : undefined,
                          updatedAt: Date.now(),
                        }))
                      }
                    }}
                    onImageScaleChange={(scale) => {
                      if (project.coverImage) {
                        setProject(prev => ({
                          ...prev,
                          coverImage: prev.coverImage ? { ...prev.coverImage, scale } : undefined,
                          updatedAt: Date.now(),
                        }))
                      }
                    }}
                  />
                </div>
              ) : (
                <div className="border-2 border-dashed border-[var(--color-border)] rounded-lg p-8 text-center bg-[var(--color-surface)]">
                  <BookOpen className="w-12 h-12 mx-auto mb-4 text-[var(--color-text-dim)]" />
                  <p className="text-sm text-[var(--color-text-muted)] mb-2">
                    Complete Step 2 to see cover canvas
                  </p>
                  <p className="text-xs text-[var(--color-text-dim)]">
                    Required: Trim Size, Paper Type, and Page Count
                  </p>
                </div>
              )}

              {/* AI Cover Generation Button */}
              {project.images.length > 0 && (
                <div className="p-3 bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/30 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <h4 className="text-sm font-medium text-[var(--color-text)] flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-purple-400" />
                        AI Cover Generation
                      </h4>
                      <p className="text-xs text-[var(--color-text-dim)] mt-1">
                        Generate a cover using {project.images.length} interior image{project.images.length !== 1 ? "s" : ""} as reference
                      </p>
                    </div>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleGenerateAICover}
                      disabled={isGeneratingCover || !project.kdpTrimSize || !project.kdpPageCount}
                      className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                    >
                      {isGeneratingCover ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 mr-2" />
                          Generate AI Cover
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {/* Cover Upload & AI Chat Buttons */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  disabled={!project.kdpTrimSize || !project.kdpPageCount}
                  onClick={() => coverInputRef.current?.click()}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Cover Image
                </Button>
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    const preview = await new Promise<string>((resolve) => {
                      const reader = new FileReader()
                      reader.onload = () => resolve(reader.result as string)
                      reader.readAsDataURL(file)
                    })
                    const img = new Image()
                    img.onload = () => {
                      // Calculate cover dimensions for proper initial scale
                      const coverDims = calculateCoverDimensions(
                        project.kdpTrimSize!,
                        project.kdpPageCount!,
                        project.kdpPaperType || "white"
                      )
                      const targetWidthPx = coverDims.totalWidth * project.dpi
                      const targetHeightPx = coverDims.totalHeight * project.dpi
                      
                      // Calculate scale to fit
                      const scaleX = targetWidthPx / img.width
                      const scaleY = targetHeightPx / img.height
                      const scale = Math.min(scaleX, scaleY)
                      
                      // Center position
                      const scaledWidth = img.width * scale
                      const scaledHeight = img.height * scale
                      const posX = (targetWidthPx - scaledWidth) / 2
                      const posY = (targetHeightPx - scaledHeight) / 2
                      
                      setProject(prev => ({
                        ...prev,
                        coverImage: {
                          id: `cover_${Date.now()}`,
                          file,
                          preview,
                          originalWidth: img.width,
                          originalHeight: img.height,
                          dpi: project.dpi,
                          position: { x: posX, y: posY },
                          scale,
                          rotation: 0,
                        },
                        updatedAt: Date.now(),
                      }))
                    }
                    img.src = preview
                    if (coverInputRef.current) coverInputRef.current.value = ""
                  }}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  disabled={!project.kdpTrimSize || !project.kdpPageCount}
                  onClick={() => setIsCoverChatOpen(true)}
                >
                  <MessageSquare className="w-4 h-4 mr-2" />
                  AI Cover Assistant
                </Button>
              </div>

              {/* Cover Edit Controls */}
              {project.coverImage && (
                <ImageEditControls
                  scale={project.coverImage.scale}
                  positionX={project.coverImage.position.x}
                  positionY={project.coverImage.position.y}
                  rotation={project.coverImage.rotation}
                  onScaleChange={(scale) => setProject(prev => ({
                    ...prev,
                    coverImage: prev.coverImage ? { ...prev.coverImage, scale } : undefined,
                    updatedAt: Date.now(),
                  }))}
                  onPositionChange={(x, y) => setProject(prev => ({
                    ...prev,
                    coverImage: prev.coverImage ? { ...prev.coverImage, position: { x, y } } : undefined,
                    updatedAt: Date.now(),
                  }))}
                  onRotationChange={(rotation) => setProject(prev => ({
                    ...prev,
                    coverImage: prev.coverImage ? { ...prev.coverImage, rotation } : undefined,
                    updatedAt: Date.now(),
                  }))}
                />
              )}

              {/* Cover Image Info */}
              {project.coverImage && (
                <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-green-500">✓</span>
                    <span className="text-sm text-[var(--color-text)]">Cover image uploaded</span>
                    <span className="text-xs text-[var(--color-text-dim)]">
                      ({project.coverImage.originalWidth} × {project.coverImage.originalHeight}px)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDownloadImage(project.coverImage!, "cover_rescaled.png")}
                      className="text-blue-500 hover:text-blue-600 hover:bg-blue-500/10"
                      title="Download cover image"
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setProject(prev => ({ ...prev, coverImage: undefined, updatedAt: Date.now() }))}
                      className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 5: Generate & Export (was Step 4) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <span className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                project.images.length > 0 && targetDims ? "bg-[var(--color-primary)] text-white" : "bg-[var(--color-surface)] text-[var(--color-text-dim)] border border-[var(--color-border)]"
              )}>
                {project.mode === "amazon-kdp" ? "5" : "4"}
              </span>
              Step {project.mode === "amazon-kdp" ? "5" : "4"}: Generate & Export
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-2">
                PDF File Name
              </label>
              <input
                type="text"
                value={project.pdfFileName}
                onChange={(e) => setProject(prev => ({ ...prev, pdfFileName: e.target.value, updatedAt: Date.now() }))}
                className="w-full px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                placeholder="output.pdf"
              />
            </div>
            <div className="space-y-2">
              {project.mode === "standard" ? (
                <>
                  {/* Standard Mode Export Buttons */}
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant={project.exportFormat === "pdf" ? "primary" : "outline"}
                      size="sm"
                      onClick={() => handleGenerateExport("pdf")}
                      disabled={project.images.length === 0 || !targetDims || isGenerating}
                      className="w-full"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      PDF
                    </Button>
                    <Button
                      variant={project.exportFormat === "png" ? "primary" : "outline"}
                      size="sm"
                      onClick={() => handleGenerateExport("png")}
                      disabled={project.images.length === 0 || !targetDims || isGenerating}
                      className="w-full"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      PNG
                    </Button>
                    <Button
                      variant={project.exportFormat === "jpeg" ? "primary" : "outline"}
                      size="sm"
                      onClick={() => handleGenerateExport("jpeg")}
                      disabled={project.images.length === 0 || !targetDims || isGenerating}
                      className="w-full"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      JPEG
                    </Button>
                    <Button
                      variant={project.exportFormat === "tiff" ? "primary" : "outline"}
                      size="sm"
                      onClick={() => handleGenerateExport("tiff")}
                      disabled={project.images.length === 0 || !targetDims || isGenerating}
                      className="w-full"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      TIFF
                    </Button>
                  </div>
                  <p className="text-xs text-center text-[var(--color-text-dim)]">
                    Or use your selected format: <span className="font-medium text-[var(--color-primary)]">{(project.exportFormat || "pdf").toUpperCase()}</span>
                  </p>
                </>
              ) : (
                <>
                  {/* KDP Mode PDF Buttons */}
                  <Button
                    variant="primary"
                    size="lg"
                    onClick={() => handleGenerateExport("pdf", false)}
                    disabled={project.images.length === 0 || !targetDims || isGenerating}
                    className="w-full"
                  >
                    <Download className="w-5 h-5 mr-2" />
                    {isGenerating ? "Generating PDF..." : "Generate & Download PDF"}
                  </Button>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleGenerateExport("pdf", true)}
                    disabled={project.images.length === 0 || !targetDims || isGenerating}
                    className="w-full"
                  >
                    <Settings className="w-4 h-4 mr-2" />
                    Generate with Bleed Guides (for review)
                  </Button>
                </>
              )}
              
              {isGenerating && (
                <div className="text-center">
                  <div className="inline-flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Processing images and generating {(project.exportFormat || "pdf").toUpperCase()}...</span>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* AI Cover Assistant Chat Modal */}
      <InlineChat
        isOpen={isCoverChatOpen}
        onClose={() => setIsCoverChatOpen(false)}
        onPromptsExtracted={(prompts) => {
          // For cover generation, we don't need to extract prompts
          // The chat is for assistance/guidance
          console.log("Cover prompts:", prompts)
        }}
        mode="image"
        initialImages={project.images.length > 0 ? project.images.slice(0, 5).map(img => img.preview) : undefined}
        autoAnalyze={project.images.length > 0}
      />
    </div>
  )
}

