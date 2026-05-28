import { useState, useCallback, useRef, useEffect } from "react"
import { Button } from "../../Button"
import { Card, CardContent } from "../../Card"
import { cn } from "@/lib/utils"
import {
  KDPProject,
  KDPPage,
  KDPImage,
  createEmptyPage,
  generateKDPId,
  KDP_TRIM_SIZES,
  KDPTrimSizeKey,
} from "@/types/KDPMode"
import { 
  ChevronRight, 
  ChevronLeft, 
  Upload, 
  Plus, 
  Trash2, 
  Grid, 
  Move,
  Wand2,
  Image as ImageIcon,
  Loader2,
  Eye,
  EyeOff,
  Target,
  Download,
  Crop,
  FileText,
  Sparkles,
  X,
  CheckSquare,
  Square,
} from "lucide-react"
import { ImageCropper } from "../ImageCropper"
import { GenerateImagesWizard } from "./GenerateImagesWizard"

interface KDPInteriorStepProps {
  project: KDPProject
  onUpdate: (updates: Partial<KDPProject>) => void
  onNext: () => void
  onBack: () => void
  transferredImageCount?: number
  onClearTransferFeedback?: () => void
}

// Interactive Canvas Component for page editing
function PageCanvas({
  page,
  trimSize,
  dpi = 300,
  onImageUpdate,
  onImageDelete,
  showGuides = true,
}: {
  page: KDPPage
  trimSize: string
  dpi?: number
  onImageUpdate: (imageId: string, updates: Partial<KDPImage>) => void
  onImageDelete: (imageId: string) => void
  showGuides?: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [activeHandle, setActiveHandle] = useState<'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | null>(null)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [initialPosition, setInitialPosition] = useState({ x: 0, y: 0 })
  const [initialScale, setInitialScale] = useState(1)
  const [initialScaleX, setInitialScaleX] = useState(1)
  const [initialScaleY, setInitialScaleY] = useState(1)
  const [selectedImageId, setSelectedImageId] = useState<string | null>(
    page.images[0]?.id || null
  )

  const trim = KDP_TRIM_SIZES[trimSize as KDPTrimSizeKey]
  if (!trim) return null

  const bleed = 0.125 // KDP standard bleed in inches
  const safeZone = 0.25 // Safe zone margin in inches

  // Calculate visual scale for preview (max 600px width)
  const maxPreviewWidth = 600
  const totalWidth = trim.width + bleed * 2
  const totalHeight = trim.height + bleed * 2
  const visualScale = maxPreviewWidth / totalWidth
  
  const previewWidth = totalWidth * visualScale
  const previewHeight = totalHeight * visualScale
  const bleedPx = bleed * visualScale
  const safeZonePx = safeZone * visualScale
  const trimWidthPx = trim.width * visualScale
  const trimHeightPx = trim.height * visualScale

  // Target canvas dimensions in pixels (at target DPI)
  const targetCanvasWidthPx = trim.width * dpi
  const targetCanvasHeightPx = trim.height * dpi

  const selectedImage = page.images.find(img => img.id === selectedImageId)

  // Calculate image display dimensions (supports independent scaleX/scaleY)
  const getImageDisplayDimensions = (image: KDPImage) => {
    const effectiveScaleX = image.scaleX ?? image.scale
    const effectiveScaleY = image.scaleY ?? image.scale
    
    const imageWidthPx = image.originalWidth * effectiveScaleX
    const imageHeightPx = image.originalHeight * effectiveScaleY
    
    const displayWidth = (imageWidthPx / targetCanvasWidthPx) * trimWidthPx
    const displayHeight = (imageHeightPx / targetCanvasHeightPx) * trimHeightPx
    const displayX = (image.position.x / targetCanvasWidthPx) * trimWidthPx
    const displayY = (image.position.y / targetCanvasHeightPx) * trimHeightPx
    
    return { width: displayWidth, height: displayHeight, x: displayX, y: displayY }
  }

  // Handle types for resize
  type HandleType = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

  // Mouse handlers for drag and resize
  const handleMouseDown = (e: React.MouseEvent, imageId: string, handle?: HandleType) => {
    e.preventDefault()
    e.stopPropagation()
    
    const image = page.images.find(img => img.id === imageId)
    if (!image) return

    setSelectedImageId(imageId)
    setDragStart({ x: e.clientX, y: e.clientY })
    setInitialPosition({ x: image.position.x, y: image.position.y })
    setInitialScale(image.scale)
    setInitialScaleX(image.scaleX ?? image.scale)
    setInitialScaleY(image.scaleY ?? image.scale)

    if (handle) {
      setIsResizing(true)
      setActiveHandle(handle)
    } else {
      setIsDragging(true)
    }
  }

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!selectedImage) return

    const deltaX = e.clientX - dragStart.x
    const deltaY = e.clientY - dragStart.y

    if (isDragging) {
      // Convert screen delta to target canvas delta
      const scaleFactorX = targetCanvasWidthPx / trimWidthPx
      const scaleFactorY = targetCanvasHeightPx / trimHeightPx
      
      const newX = initialPosition.x + deltaX * scaleFactorX
      const newY = initialPosition.y + deltaY * scaleFactorY
      
      onImageUpdate(selectedImage.id, { position: { x: newX, y: newY } })
    }

    if (isResizing) {
      const sensitivity = 0.003
      
      switch (activeHandle) {
        // Corner handles - proportional scaling
        case 'se': {
          const scaleDelta = (deltaX + deltaY) * sensitivity
          const newScale = Math.max(0.1, Math.min(5, initialScale + scaleDelta))
          onImageUpdate(selectedImage.id, { scale: newScale, scaleX: newScale, scaleY: newScale })
          break
        }
        case 'nw': {
          const scaleDelta = (-deltaX - deltaY) * sensitivity
          const newScale = Math.max(0.1, Math.min(5, initialScale + scaleDelta))
          onImageUpdate(selectedImage.id, { scale: newScale, scaleX: newScale, scaleY: newScale })
          break
        }
        case 'ne': {
          const scaleDelta = (deltaX - deltaY) * sensitivity
          const newScale = Math.max(0.1, Math.min(5, initialScale + scaleDelta))
          onImageUpdate(selectedImage.id, { scale: newScale, scaleX: newScale, scaleY: newScale })
          break
        }
        case 'sw': {
          const scaleDelta = (-deltaX + deltaY) * sensitivity
          const newScale = Math.max(0.1, Math.min(5, initialScale + scaleDelta))
          onImageUpdate(selectedImage.id, { scale: newScale, scaleX: newScale, scaleY: newScale })
          break
        }
        // Edge handles - stretch in the direction of the handle
        case 'e': {
          // Right edge: expand rightward (just increase scaleX)
          const scaleXDelta = deltaX * sensitivity
          const newScaleX = Math.max(0.1, Math.min(5, initialScaleX + scaleXDelta))
          onImageUpdate(selectedImage.id, { scaleX: newScaleX })
          break
        }
        case 'w': {
          // Left edge: expand leftward (increase scaleX AND move position left)
          const scaleXDelta = -deltaX * sensitivity
          const newScaleX = Math.max(0.1, Math.min(5, initialScaleX + scaleXDelta))
          // Adjust position to keep right edge fixed
          const widthChange = selectedImage.originalWidth * (newScaleX - initialScaleX)
          const newX = initialPosition.x - widthChange
          onImageUpdate(selectedImage.id, { scaleX: newScaleX, position: { x: newX, y: selectedImage.position.y } })
          break
        }
        case 's': {
          // Bottom edge: expand downward (just increase scaleY)
          const scaleYDelta = deltaY * sensitivity
          const newScaleY = Math.max(0.1, Math.min(5, initialScaleY + scaleYDelta))
          onImageUpdate(selectedImage.id, { scaleY: newScaleY })
          break
        }
        case 'n': {
          // Top edge: expand upward (increase scaleY AND move position up)
          const scaleYDelta = -deltaY * sensitivity
          const newScaleY = Math.max(0.1, Math.min(5, initialScaleY + scaleYDelta))
          // Adjust position to keep bottom edge fixed
          const heightChange = selectedImage.originalHeight * (newScaleY - initialScaleY)
          const newY = initialPosition.y - heightChange
          onImageUpdate(selectedImage.id, { scaleY: newScaleY, position: { x: selectedImage.position.x, y: newY } })
          break
        }
      }
    }
  }, [isDragging, isResizing, dragStart, initialPosition, initialScale, activeHandle, selectedImage, onImageUpdate, targetCanvasWidthPx, targetCanvasHeightPx, trimWidthPx, trimHeightPx])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
    setIsResizing(false)
    setActiveHandle(null)
  }, [])

  // Add global mouse event listeners
  useEffect(() => {
    if (isDragging || isResizing) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
      
      return () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDragging, isResizing, handleMouseMove, handleMouseUp])

  // Large, visible resize handles
  const handleSize = 18

  return (
    <div className="space-y-4">
      {/* Canvas Container */}
      <div className="flex justify-center">
        <div 
          ref={containerRef}
          className={cn(
            "relative bg-white border-2 shadow-xl select-none",
            (isDragging || isResizing) ? "cursor-grabbing" : "border-[var(--color-border)]"
          )}
          style={{ 
            width: `${previewWidth}px`, 
            height: `${previewHeight}px`,
          }}
        >
          {/* Bleed area (red tint) */}
          {showGuides && (
            <div 
              className="absolute inset-0 pointer-events-none"
              style={{ background: "rgba(255, 0, 0, 0.08)" }}
            />
          )}

          {/* Trim area (white canvas) */}
          <div 
            className="absolute bg-white overflow-hidden"
            style={{
              left: `${bleedPx}px`,
              top: `${bleedPx}px`,
              width: `${trimWidthPx}px`,
              height: `${trimHeightPx}px`,
            }}
          >
            {/* Images */}
            {page.images.map((image) => {
              const display = getImageDisplayDimensions(image)
              const isSelected = image.id === selectedImageId
              
              return (
                <div 
                  key={image.id}
                  className={cn(
                    "absolute cursor-grab group",
                    isDragging && isSelected && "cursor-grabbing"
                  )}
                  style={{
                    left: `${display.x}px`,
                    top: `${display.y}px`,
                    width: `${display.width}px`,
                    height: `${display.height}px`,
                    transform: `rotate(${image.rotation}deg)`,
                    transformOrigin: "top left",
                  }}
                  onMouseDown={(e) => handleMouseDown(e, image.id)}
                >
                  <img 
                    src={image.src} 
                    alt="Page content"
                    className="w-full h-full object-fill pointer-events-none"
                    draggable={false}
                  />
                  
                  {/* Selection border */}
                  <div className={cn(
                    "absolute inset-0 border-2 transition-colors",
                    isSelected 
                      ? "border-blue-500 border-solid" 
                      : "border-transparent group-hover:border-blue-300 border-dashed"
                  )} />
                  
                  {/* Delete Image Button (top-right corner) */}
                  {isSelected && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        if (confirm(`Delete this image?`)) {
                          onImageDelete(image.id)
                        }
                      }}
                      className="absolute -top-2 -right-2 z-20 w-6 h-6 bg-red-500 hover:bg-red-600 rounded-full text-white shadow-lg flex items-center justify-center transition-all hover:scale-110"
                      title="Delete image"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}

                  {/* Resize handles (only for selected image) - CORNERS & EDGES */}
                  {isSelected && (
                    <>
                      {/* Corner handles */}
                      {(['nw', 'ne', 'sw', 'se'] as const).map((handle) => (
                        <div
                          key={handle}
                          className={cn(
                            "absolute z-10 rounded-full shadow-lg transition-transform hover:scale-125",
                            "bg-gradient-to-br from-blue-400 to-blue-600",
                            handle === 'nw' && "cursor-nw-resize",
                            handle === 'ne' && "cursor-ne-resize",
                            handle === 'sw' && "cursor-sw-resize",
                            handle === 'se' && "cursor-se-resize",
                          )}
                          style={{ 
                            width: `${handleSize}px`, 
                            height: `${handleSize}px`,
                            boxShadow: '0 2px 8px rgba(0,0,0,0.3), 0 0 0 2px white',
                            ...(handle === 'nw' && { left: -handleSize/2, top: -handleSize/2 }),
                            ...(handle === 'ne' && { right: -handleSize/2, top: -handleSize/2 }),
                            ...(handle === 'sw' && { left: -handleSize/2, bottom: -handleSize/2 }),
                            ...(handle === 'se' && { right: -handleSize/2, bottom: -handleSize/2 }),
                          }}
                          onMouseDown={(e) => handleMouseDown(e, image.id, handle)}
                        />
                      ))}
                      {/* Edge handles (horizontal & vertical) - ORANGE for stretch */}
                      {(['n', 's', 'e', 'w'] as const).map((handle) => {
                        const isHorizontal = handle === 'n' || handle === 's'
                        const edgeSize = 10
                        const edgeLength = 22
                        return (
                          <div
                            key={handle}
                            className={cn(
                              "absolute z-10 rounded-sm shadow-lg transition-transform hover:scale-110",
                              "bg-orange-500 border-2 border-white",
                              handle === 'n' && "cursor-n-resize",
                              handle === 's' && "cursor-s-resize",
                              handle === 'e' && "cursor-e-resize",
                              handle === 'w' && "cursor-w-resize",
                            )}
                            style={{ 
                              width: isHorizontal ? `${edgeLength}px` : `${edgeSize}px`,
                              height: isHorizontal ? `${edgeSize}px` : `${edgeLength}px`,
                              boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
                              ...(handle === 'n' && { left: '50%', top: -edgeSize/2, transform: 'translateX(-50%)' }),
                              ...(handle === 's' && { left: '50%', bottom: -edgeSize/2, transform: 'translateX(-50%)' }),
                              ...(handle === 'e' && { right: -edgeSize/2, top: '50%', transform: 'translateY(-50%)' }),
                              ...(handle === 'w' && { left: -edgeSize/2, top: '50%', transform: 'translateY(-50%)' }),
                            }}
                            onMouseDown={(e) => handleMouseDown(e, image.id, handle)}
                            title={isHorizontal ? 'Stretch vertically' : 'Stretch horizontally'}
                          />
                        )
                      })}
                    </>
                  )}

                  {/* Move indicator */}
                  {isSelected && !isDragging && !isResizing && (
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-50 pointer-events-none">
                      <Move className="w-8 h-8 text-blue-500 drop-shadow-lg" />
                    </div>
                  )}
                </div>
              )
            })}

            {/* Safe zone guide */}
            {showGuides && (
              <div 
                className="absolute border-2 border-dashed border-green-400/60 pointer-events-none"
                style={{
                  left: `${safeZonePx}px`,
                  top: `${safeZonePx}px`,
                  right: `${safeZonePx}px`,
                  bottom: `${safeZonePx}px`,
                }}
              />
            )}
          </div>

          {/* Trim line (red border) */}
          {showGuides && (
            <div 
              className="absolute border-2 border-red-500 pointer-events-none"
              style={{
                left: `${bleedPx}px`,
                top: `${bleedPx}px`,
                width: `${trimWidthPx}px`,
                height: `${trimHeightPx}px`,
              }}
            />
          )}

          {/* Corner labels */}
          {showGuides && (
            <>
              <div className="absolute top-1 left-1 text-[9px] text-red-500 font-bold bg-white/90 px-1 rounded">
                BLEED
              </div>
              <div 
                className="absolute text-[9px] text-red-500 font-bold bg-white/90 px-1 rounded"
                style={{ top: `${bleedPx + 2}px`, left: `${bleedPx + 2}px` }}
              >
                TRIM
              </div>
              <div 
                className="absolute text-[9px] text-green-600 font-bold bg-white/90 px-1 rounded"
                style={{ top: `${bleedPx + safeZonePx + 2}px`, left: `${bleedPx + safeZonePx + 2}px` }}
              >
                SAFE ZONE
              </div>
            </>
          )}

          {/* Interactive hint */}
          {page.images.length > 0 && !isDragging && !isResizing && (
            <div className="absolute bottom-2 right-2 text-[10px] text-white bg-black/70 px-2 py-1 rounded flex items-center gap-2">
              <Move className="w-3 h-3" /> Drag to move
              <span className="mx-1">•</span>
              <div className="w-3 h-3 rounded-full bg-blue-500 border border-white" /> Corners to resize
            </div>
          )}
        </div>
      </div>

      {/* Dimensions info */}
      <div className="text-center space-y-1">
        <p className="text-sm font-medium text-[var(--color-text)]">
          {trim.width}" × {trim.height}" (with 0.125" bleed)
        </p>
        <p className="text-xs text-[var(--color-text-dim)]">
          {Math.round(trim.width * dpi)} × {Math.round(trim.height * dpi)} pixels @ {dpi} DPI
        </p>
      </div>

      {/* Legend */}
      {showGuides && (
        <div className="flex items-center justify-center gap-4 text-xs text-[var(--color-text-dim)]">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-red-500/20 border border-red-500" />
            <span>Bleed Area</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 border-2 border-red-500" />
            <span>Trim Line</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 border-2 border-dashed border-green-400" />
            <span>Safe Zone</span>
          </div>
        </div>
      )}
    </div>
  )
}

export function KDPInteriorStep({ project, onUpdate, onNext, onBack, transferredImageCount = 0, onClearTransferFeedback }: KDPInteriorStepProps) {
  const [viewMode, setViewMode] = useState<"grid" | "canvas">("grid")
  const [selectedPageIndex, setSelectedPageIndex] = useState<number | null>(null)
  const [isFileDragging, setIsFileDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 })
  const [isAutoFitting, setIsAutoFitting] = useState(false)
  const [isAutoSizing, setIsAutoSizing] = useState(false)
  const [showGuides, setShowGuides] = useState(true)
  const [downloadName, setDownloadName] = useState(project.name || "interior_page")
  const [isDownloading, setIsDownloading] = useState(false)
  const [cropImageData, setCropImageData] = useState<{ pageIndex: number; imageId: string; image: KDPImage } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Transfer feedback state
  const [showTransferBanner, setShowTransferBanner] = useState(false)
  
  // Generate Images Wizard State
  const [showGenerateWizard, setShowGenerateWizard] = useState(false)
  
  // Multi-select mode for bulk delete
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false)
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(new Set())
  
  // Blank page backside feature
  const [backsideImage, setBacksideImage] = useState<string | null>(null)
  const [showBacksideUpload, setShowBacksideUpload] = useState(false)
  const [isInsertingBlankPages, setIsInsertingBlankPages] = useState(false)
  const backsideInputRef = useRef<HTMLInputElement>(null)
  
  // Drag and drop for page reordering
  const [draggedPageIndex, setDraggedPageIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  const trim = project.trimSize ? KDP_TRIM_SIZES[project.trimSize as KDPTrimSizeKey] : null

  // Show transfer banner when images are transferred from AI wizard
  useEffect(() => {
    if (transferredImageCount > 0) {
      setShowTransferBanner(true)
      // Auto-dismiss after 5 seconds
      const timer = setTimeout(() => {
        setShowTransferBanner(false)
        onClearTransferFeedback?.()
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [transferredImageCount, onClearTransferFeedback])

  // Handle file upload
  const handleFileUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return
    
    setIsUploading(true)
    setUploadProgress({ current: 0, total: files.length })
    
    const newPages: KDPPage[] = []
    const startPageNumber = project.pages.length + 1
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (!file.type.startsWith("image/")) continue
      
      setUploadProgress({ current: i + 1, total: files.length })
      
      // Read file as data URL
      const preview = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      
      // Get image dimensions
      const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve({ width: img.width, height: img.height })
        img.onerror = reject
        img.src = preview
      })
      
      // Calculate auto-fit scale if trim size is set
      let scale = 1
      let posX = 0
      let posY = 0
      
      if (trim) {
        const targetWidthPx = trim.width * 300 // 300 DPI
        const targetHeightPx = trim.height * 300
        
        const scaleX = targetWidthPx / dimensions.width
        const scaleY = targetHeightPx / dimensions.height
        scale = Math.min(scaleX, scaleY)
        
        const scaledWidth = dimensions.width * scale
        const scaledHeight = dimensions.height * scale
        posX = (targetWidthPx - scaledWidth) / 2
        posY = (targetHeightPx - scaledHeight) / 2
      }
      
      const image: KDPImage = {
        id: generateKDPId("img"),
        src: preview,
        fileName: file.name,
        originalWidth: dimensions.width,
        originalHeight: dimensions.height,
        position: { x: posX, y: posY },
        scale,
        rotation: 0,
        opacity: 1,
        flipX: false,
        flipY: false,
      }
      
      const page = createEmptyPage(startPageNumber + i)
      page.images.push(image)
      newPages.push(page)
    }
    
    onUpdate({ 
      pages: [...project.pages, ...newPages],
    })
    
    setIsUploading(false)
    setUploadProgress({ current: 0, total: 0 })
    
    // Auto-select first new page and switch to canvas view
    if (newPages.length > 0) {
      setSelectedPageIndex(project.pages.length)
      setViewMode("canvas")
    }
  }, [project.pages, trim, onUpdate])

  // Drag and drop handlers for FILE uploads
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Only set dragging if files are being dragged
    if (e.dataTransfer.types.includes('Files')) {
      setIsFileDragging(true)
    }
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Check if we're leaving the drop zone entirely
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX
    const y = e.clientY
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setIsFileDragging(false)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Set the drop effect
    if (e.dataTransfer.types.includes('Files')) {
      e.dataTransfer.dropEffect = 'copy'
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsFileDragging(false)
    
    // Only handle file drops
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files)
    }
  }, [handleFileUpload])

  // Delete page
  const handleDeletePage = useCallback((pageIndex: number) => {
    const newPages = project.pages.filter((_, i) => i !== pageIndex)
    // Renumber pages
    newPages.forEach((page, i) => {
      page.pageNumber = i + 1
    })
    onUpdate({ pages: newPages })
    
    // Auto-select the next page (or previous if it was the last page)
    if (newPages.length > 0) {
      if (pageIndex < newPages.length) {
        // Select the page that took the deleted page's position
        setSelectedPageIndex(pageIndex)
      } else {
        // Was the last page, select the new last page
        setSelectedPageIndex(newPages.length - 1)
      }
      // Switch to canvas view if in grid view
      if (viewMode === "grid") {
        setViewMode("canvas")
      }
    } else {
      setSelectedPageIndex(null)
    }
  }, [project.pages, viewMode, onUpdate])

  // Delete all pages
  const handleDeleteAllPages = useCallback(() => {
    if (confirm("Delete all interior pages? This cannot be undone.")) {
      onUpdate({ pages: [] })
      setSelectedPageIndex(null)
    }
  }, [onUpdate])

  // Auto-fit all images (center within trim area)
  const handleAutoFitAll = useCallback(async () => {
    if (!trim) {
      alert("Please select a trim size first in Step 2")
      return
    }
    
    if (project.pages.length === 0) {
      alert("No pages to auto-fit")
      return
    }
    
    setIsAutoFitting(true)
    
    const targetWidthPx = trim.width * 300
    const targetHeightPx = trim.height * 300
    
    const updatedPages = project.pages.map(page => {
      const updatedImages = page.images.map(img => {
        const scaleX = targetWidthPx / img.originalWidth
        const scaleY = targetHeightPx / img.originalHeight
        const scale = Math.min(scaleX, scaleY)
        
        const scaledWidth = img.originalWidth * scale
        const scaledHeight = img.originalHeight * scale
        const posX = (targetWidthPx - scaledWidth) / 2
        const posY = (targetHeightPx - scaledHeight) / 2
        
        return {
          ...img,
          scale,
          position: { x: posX, y: posY },
        }
      })
      
      return { ...page, images: updatedImages }
    })
    
    onUpdate({ pages: updatedPages })
    
    // Small delay for visual feedback
    await new Promise(resolve => setTimeout(resolve, 300))
    setIsAutoFitting(false)
  }, [project.pages, trim, onUpdate])

  // Auto-size all images (fit exactly inside safe zone)
  const handleAutoSizeAll = useCallback(async () => {
    if (!trim) {
      alert("Please select a trim size first in Step 2")
      return
    }
    
    if (project.pages.length === 0) {
      alert("No pages to auto-size")
      return
    }
    
    setIsAutoSizing(true)
    
    const safeZone = 0.25 // Safe zone margin in inches (0.25" = 1/4 inch)
    const safeWidthPx = (trim.width - safeZone * 2) * 300
    const safeHeightPx = (trim.height - safeZone * 2) * 300
    const safeOffsetPx = safeZone * 300
    
    const updatedPages = project.pages.map(page => {
      const updatedImages = page.images.map(img => {
        // Scale to fit exactly within safe zone (NEVER exceed it)
        const fitScaleX = safeWidthPx / img.originalWidth
        const fitScaleY = safeHeightPx / img.originalHeight
        const scale = Math.min(fitScaleX, fitScaleY) // Use minimum to ensure it fits
        
        const scaledWidth = img.originalWidth * scale
        const scaledHeight = img.originalHeight * scale
        
        // IMPORTANT: Clamp scaled dimensions to never exceed safe zone
        const finalWidth = Math.min(scaledWidth, safeWidthPx)
        const finalHeight = Math.min(scaledHeight, safeHeightPx)
        const finalScale = Math.min(
          safeWidthPx / img.originalWidth,
          safeHeightPx / img.originalHeight,
          scale
        )
        
        // Center within safe zone
        const posX = safeOffsetPx + (safeWidthPx - finalWidth) / 2
        const posY = safeOffsetPx + (safeHeightPx - finalHeight) / 2
        
        // STRICT VALIDATION: Ensure position + size never exceeds safe zone bounds
        const clampedPosX = Math.max(safeOffsetPx, Math.min(posX, safeOffsetPx + safeWidthPx - finalWidth))
        const clampedPosY = Math.max(safeOffsetPx, Math.min(posY, safeOffsetPx + safeHeightPx - finalHeight))
        
        console.log(`[Auto-Size] Image on page: scale=${finalScale.toFixed(3)}, pos=(${clampedPosX.toFixed(1)}, ${clampedPosY.toFixed(1)}), size=(${finalWidth.toFixed(1)}x${finalHeight.toFixed(1)}), safeZone=(${safeOffsetPx.toFixed(1)} to ${(safeOffsetPx + safeWidthPx).toFixed(1)})`)
        
        return {
          ...img,
          scale: finalScale,
          scaleX: finalScale, // Reset independent scales to uniform scale
          scaleY: finalScale, // Reset independent scales to uniform scale
          position: { x: clampedPosX, y: clampedPosY },
        }
      })
      
      return { ...page, images: updatedImages }
    })
    
    onUpdate({ pages: updatedPages })
    
    await new Promise(resolve => setTimeout(resolve, 300))
    setIsAutoSizing(false)
  }, [project.pages, trim, onUpdate])

  // Fit individual page to safe zone (fill entire safe zone area)
  const handleFitPageToSafeZone = useCallback((pageIndex: number) => {
    if (!trim) {
      alert("Please select a trim size first in Step 2")
      return
    }
    
    const page = project.pages[pageIndex]
    if (!page || page.images.length === 0) return
    
    const safeZone = 0.25 // Safe zone margin in inches
    const safeWidthPx = (trim.width - safeZone * 2) * 300
    const safeHeightPx = (trim.height - safeZone * 2) * 300
    const safeOffsetPx = safeZone * 300
    
    const updatedPages = [...project.pages]
    const updatedImages = page.images.map(img => {
      // Scale to fill the entire safe zone (edge-to-edge)
      // Use independent scales to stretch image to exactly match safe zone dimensions
      const scaleX = safeWidthPx / img.originalWidth
      const scaleY = safeHeightPx / img.originalHeight
      
      // Position at the safe zone origin (top-left of safe zone)
      const posX = safeOffsetPx
      const posY = safeOffsetPx
      
      return {
        ...img,
        scale: 1, // Reset uniform scale
        scaleX, // Set to exactly fill width
        scaleY, // Set to exactly fill height
        position: { x: posX, y: posY },
        rotation: 0, // Reset rotation for clean fit
      }
    })
    
    updatedPages[pageIndex] = { ...page, images: updatedImages }
    onUpdate({ pages: updatedPages })
  }, [project.pages, trim, onUpdate])

  // Update image on a specific page
  const handleImageUpdate = useCallback((pageIndex: number, imageId: string, updates: Partial<KDPImage>) => {
    const updatedPages = [...project.pages]
    const page = updatedPages[pageIndex]
    if (!page) return
    
    page.images = page.images.map(img => 
      img.id === imageId ? { ...img, ...updates } : img
    )
    
    onUpdate({ pages: updatedPages })
  }, [project.pages, onUpdate])

  // Download current page image
  const handleDownloadPage = useCallback(async (pageIndex: number) => {
    const page = project.pages[pageIndex]
    if (!page || page.images.length === 0) return
    
    const image = page.images[0]
    if (!image?.src) return
    
    setIsDownloading(true)
    
    try {
      const link = document.createElement("a")
      link.href = image.src
      const fileName = `${downloadName.replace(/[^a-z0-9]/gi, "_")}_page_${pageIndex + 1}.png`
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (error) {
      console.error("Download failed:", error)
    }
    
    setIsDownloading(false)
  }, [project.pages, downloadName])

  // Download all pages as separate files
  const handleDownloadAllPages = useCallback(async () => {
    if (project.pages.length === 0) return
    
    setIsDownloading(true)
    
    try {
      for (let i = 0; i < project.pages.length; i++) {
        const page = project.pages[i]
        if (page.images.length === 0) continue
        
        const image = page.images[0]
        if (!image?.src) continue
        
        const link = document.createElement("a")
        link.href = image.src
        const fileName = `${downloadName.replace(/[^a-z0-9]/gi, "_")}_page_${i + 1}.png`
        link.download = fileName
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        
        // Small delay between downloads
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    } catch (error) {
      console.error("Download failed:", error)
    }
    
    setIsDownloading(false)
  }, [project.pages, downloadName])

  // Open crop modal for an image
  const handleOpenCrop = useCallback((pageIndex: number, imageId: string) => {
    const page = project.pages[pageIndex]
    const image = page?.images.find(img => img.id === imageId)
    if (image) {
      setCropImageData({ pageIndex, imageId, image })
    }
  }, [project.pages])

  // Handle crop completion
  const handleCropComplete = useCallback(async (croppedSrc: string, cropRect: { x: number; y: number; width: number; height: number }) => {
    if (!cropImageData) return
    
    const { pageIndex, imageId } = cropImageData
    const updatedPages = [...project.pages]
    const page = updatedPages[pageIndex]
    if (!page) return
    
    // Get actual dimensions of the cropped image
    const actualDimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve({ width: img.width, height: img.height })
      img.onerror = reject
      img.src = croppedSrc
    })
    
    page.images = page.images.map(img => {
      if (img.id !== imageId) return img
      return {
        ...img,
        src: croppedSrc,
        originalWidth: actualDimensions.width,
        originalHeight: actualDimensions.height,
        cropRect,
        // Reset position and scale for newly cropped image
        position: { x: 0, y: 0 },
        scale: 1,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
      }
    })
    
    onUpdate({ pages: updatedPages })
    setCropImageData(null)
  }, [cropImageData, project.pages, onUpdate])

  // Add empty pages
  const handleAddEmptyPages = useCallback((count: number) => {
    const startPageNumber = project.pages.length + 1
    const newPages = Array.from({ length: count }, (_, i) => createEmptyPage(startPageNumber + i))
    onUpdate({ 
      pages: [...project.pages, ...newPages],
    })
  }, [project.pages, onUpdate])

  // Handle completion of Generate Images Wizard
  const handleGenerateWizardComplete = useCallback(async (generatedImages: { prompt: string; imageUrl: string; width: number; height: number }[]) => {
    if (generatedImages.length === 0) return
    
    const newPages: KDPPage[] = []
    const startPageNumber = project.pages.length + 1
    
    for (let i = 0; i < generatedImages.length; i++) {
      const genImage = generatedImages[i]
      
      // Calculate auto-fit scale if trim size is set
      let scale = 1
      let posX = 0
      let posY = 0
      
      if (trim) {
        const targetWidthPx = trim.width * 300
        const targetHeightPx = trim.height * 300
        
        const scaleX = targetWidthPx / genImage.width
        const scaleY = targetHeightPx / genImage.height
        scale = Math.min(scaleX, scaleY)
        
        const scaledWidth = genImage.width * scale
        const scaledHeight = genImage.height * scale
        posX = (targetWidthPx - scaledWidth) / 2
        posY = (targetHeightPx - scaledHeight) / 2
      }
      
      const image: KDPImage = {
        id: generateKDPId("img"),
        src: genImage.imageUrl,
        fileName: `ai-generated_${i + 1}.png`,
        originalWidth: genImage.width,
        originalHeight: genImage.height,
        position: { x: posX, y: posY },
        scale,
        rotation: 0,
        opacity: 1,
        flipX: false,
        flipY: false,
      }
      
      const page = createEmptyPage(startPageNumber + i)
      page.images.push(image)
      newPages.push(page)
    }
    
    if (newPages.length > 0) {
      onUpdate({ 
        pages: [...project.pages, ...newPages],
      })
    }
    
    setShowGenerateWizard(false)
  }, [project.pages, trim, onUpdate])

  // Toggle page selection for multi-select
  const togglePageSelection = useCallback((pageId: string) => {
    setSelectedPageIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(pageId)) {
        newSet.delete(pageId)
      } else {
        newSet.add(pageId)
      }
      return newSet
    })
  }, [])

  // Select all pages
  const selectAllPages = useCallback(() => {
    setSelectedPageIds(new Set(project.pages.map(p => p.id)))
  }, [project.pages])

  // Deselect all pages
  const deselectAllPages = useCallback(() => {
    setSelectedPageIds(new Set())
  }, [])

  // Delete selected pages
  const handleDeleteSelectedPages = useCallback(() => {
    if (selectedPageIds.size === 0) return
    
    if (!confirm(`Delete ${selectedPageIds.size} selected page(s)? This cannot be undone.`)) return
    
    const newPages = project.pages.filter(p => !selectedPageIds.has(p.id))
    // Renumber pages
    newPages.forEach((page, i) => {
      page.pageNumber = i + 1
    })
    
    onUpdate({ pages: newPages })
    setSelectedPageIds(new Set())
    setIsMultiSelectMode(false)
    
    // Auto-select first page if any remain
    if (newPages.length > 0) {
      setSelectedPageIndex(0)
      if (viewMode === "grid") {
        setViewMode("canvas")
      }
    } else {
      setSelectedPageIndex(null)
    }
  }, [selectedPageIds, project.pages, viewMode, onUpdate])

  // Drag and drop handlers for page reordering
  const handlePageDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDraggedPageIndex(index)
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("text/plain", index.toString())
    
    // Make the drag image semi-transparent
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "0.5"
    }
  }, [])

  const handlePageDragEnd = useCallback((e: React.DragEvent) => {
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "1"
    }
    setDraggedPageIndex(null)
    setDragOverIndex(null)
  }, [])

  const handlePageDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    
    if (draggedPageIndex !== null && draggedPageIndex !== index) {
      setDragOverIndex(index)
    }
  }, [draggedPageIndex])

  const handlePageDragLeave = useCallback(() => {
    setDragOverIndex(null)
  }, [])

  const handlePageDrop = useCallback((e: React.DragEvent, dropIndex: number) => {
    e.preventDefault()
    
    if (draggedPageIndex === null || draggedPageIndex === dropIndex) {
      setDragOverIndex(null)
      return
    }
    
    // Reorder pages
    const newPages = [...project.pages]
    const [draggedPage] = newPages.splice(draggedPageIndex, 1)
    newPages.splice(dropIndex, 0, draggedPage)
    
    // Renumber pages
    newPages.forEach((page, i) => {
      page.pageNumber = i + 1
    })
    
    onUpdate({ pages: newPages })
    
    // Update selected page index if needed
    if (selectedPageIndex === draggedPageIndex) {
      setSelectedPageIndex(dropIndex)
    } else if (selectedPageIndex !== null) {
      if (draggedPageIndex < selectedPageIndex && dropIndex >= selectedPageIndex) {
        setSelectedPageIndex(selectedPageIndex - 1)
      } else if (draggedPageIndex > selectedPageIndex && dropIndex <= selectedPageIndex) {
        setSelectedPageIndex(selectedPageIndex + 1)
      }
    }
    
    setDraggedPageIndex(null)
    setDragOverIndex(null)
  }, [draggedPageIndex, project.pages, selectedPageIndex, onUpdate])

  // Handle backside image upload
  const handleBacksideImageUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return
    
    const file = files[0]
    if (!file.type.startsWith("image/")) return
    
    // Read file as data URL
    const preview = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
    
    setBacksideImage(preview)
  }, [])

  // Insert blank pages on even page numbers
  const handleInsertBlankPages = useCallback(async () => {
    if (project.pages.length === 0) {
      alert("Please add some pages first before inserting blank pages.")
      return
    }
    
    if (!confirm("This will insert blank pages (with optional background) on every even page number. Continue?")) {
      return
    }
    
    setIsInsertingBlankPages(true)
    
    try {
      // Create new pages array with blank pages inserted at even positions
      const newPages: KDPPage[] = []
      
      for (const page of project.pages) {
        // Add the original page (will be at odd positions: 1, 3, 5...)
        newPages.push({
          ...page,
          pageNumber: newPages.length + 1
        })
        
        // After each page, insert a blank page (will be at even positions: 2, 4, 6...)
        const blankPage = createEmptyPage(newPages.length + 1)
        
        // If backside image is set, add it to the blank page
        if (backsideImage) {
          // Get image dimensions
          const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
            const img = new Image()
            img.onload = () => resolve({ width: img.width, height: img.height })
            img.onerror = reject
            img.src = backsideImage
          })
          
          // Calculate auto-fit scale if trim size is set
          let scale = 1
          let posX = 0
          let posY = 0
          
          if (trim) {
            const targetWidthPx = trim.width * 300
            const targetHeightPx = trim.height * 300
            
            const scaleX = targetWidthPx / dimensions.width
            const scaleY = targetHeightPx / dimensions.height
            scale = Math.min(scaleX, scaleY)
            
            const scaledWidth = dimensions.width * scale
            const scaledHeight = dimensions.height * scale
            posX = (targetWidthPx - scaledWidth) / 2
            posY = (targetHeightPx - scaledHeight) / 2
          }
          
          const image: KDPImage = {
            id: generateKDPId("img"),
            src: backsideImage,
            fileName: "backside-background.png",
            originalWidth: dimensions.width,
            originalHeight: dimensions.height,
            position: { x: posX, y: posY },
            scale,
            rotation: 0,
            opacity: 1,
            flipX: false,
            flipY: false,
          }
          
          blankPage.images.push(image)
        }
        
        newPages.push(blankPage)
      }
      
      onUpdate({ pages: newPages, pageCount: newPages.length })
      
      alert(`Successfully inserted ${project.pages.length} blank pages! Total pages: ${newPages.length}`)
    } catch (error) {
      console.error("Error inserting blank pages:", error)
      alert("Failed to insert blank pages. Please try again.")
    } finally {
      setIsInsertingBlankPages(false)
    }
  }, [project.pages, backsideImage, trim, onUpdate])

  const canProceed = project.pages.length > 0
  const selectedPage = selectedPageIndex !== null ? project.pages[selectedPageIndex] : null

  return (
    <div className="space-y-6">
      {/* AI Transfer Success Banner */}
      {showTransferBanner && transferredImageCount > 0 && (
        <div className="relative bg-gradient-to-r from-purple-500/20 via-cyan-500/20 to-blue-500/20 border-2 border-purple-500/50 rounded-xl p-4 animate-in fade-in slide-in-from-top-2 duration-500">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white animate-pulse" />
              </div>
            </div>
            <div className="flex-1">
              <h4 className="text-base font-bold text-[var(--color-text)] mb-1">
                ✨ {transferredImageCount} AI-generated {transferredImageCount === 1 ? 'image has' : 'images have'} been added to your interior!
              </h4>
              <p className="text-sm text-[var(--color-text-muted)]">
                You can now edit, rearrange, crop, or remove them as needed. Use the tools below to customize your pages.
              </p>
            </div>
            <button
              onClick={() => {
                setShowTransferBanner(false)
                onClearTransferFeedback?.()
              }}
              className="flex-shrink-0 p-1 hover:bg-white/10 rounded-lg transition-colors"
              title="Dismiss"
            >
              <X className="w-5 h-5 text-[var(--color-text-muted)] hover:text-[var(--color-text)]" />
            </button>
          </div>
        </div>
      )}

      {/* Page Count Input */}
      <Card className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-amber-500/30">
        <CardContent className="py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-amber-400" />
              <span className="font-medium text-[var(--color-text)]">Page Count</span>
              <span className="text-xs text-[var(--color-text-dim)]">(KDP requires 24-828 pages)</span>
            </div>
            <div className="flex items-center gap-2">
              <input 
                type="number" 
                min="24" 
                max="828" 
                value={project.pageCount}
                onChange={(e) => {
                  const count = parseInt(e.target.value) || 0
                  onUpdate({ pageCount: Math.max(24, Math.min(828, count)) })
                }}
                className="w-24 px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <span className="text-sm text-[var(--color-text-muted)]">pages</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* One-Sided Coloring Pages Feature */}
      {project.pages.length > 0 && (
        <Card className="bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border-indigo-500/30">
          <CardContent className="py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-[var(--color-text)] mb-2 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-indigo-400" />
                  One-Sided Coloring Pages
                </h4>
                <p className="text-sm text-[var(--color-text-muted)] mb-3">
                  Insert blank pages on every even page number to create one-sided coloring pages. Optionally upload a background/image for the back side.
                </p>
                
                {/* Backside Image Upload Section */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex-1 flex items-center gap-2">
                    {backsideImage ? (
                      <div className="flex items-center gap-2 px-3 py-2 bg-[var(--color-surface)] border border-green-500/50 rounded-lg">
                        <img 
                          src={backsideImage} 
                          alt="Backside preview" 
                          className="w-8 h-8 object-cover rounded"
                        />
                        <span className="text-sm text-green-400">✓ Background uploaded</span>
                        <button
                          onClick={() => setBacksideImage(null)}
                          className="ml-auto p-1 hover:bg-red-500/20 rounded transition-colors"
                          title="Remove background"
                        >
                          <X className="w-4 h-4 text-red-400" />
                        </button>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => backsideInputRef.current?.click()}
                        className="gap-2 border-indigo-500/50 text-indigo-400 hover:bg-indigo-500/10"
                      >
                        <Upload className="w-4 h-4" />
                        Upload Backside Image (Optional)
                      </Button>
                    )}
                    <input
                      ref={backsideInputRef}
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleBacksideImageUpload(e.target.files)}
                      className="hidden"
                    />
                  </div>
                </div>
                
                <div className="text-xs text-[var(--color-text-dim)] space-y-1">
                  <p>• Your current {project.pages.length} pages will remain on odd numbers (1, 3, 5...)</p>
                  <p>• Blank pages {backsideImage ? "with your background" : "(empty or with background)"} will be inserted on even numbers (2, 4, 6...)</p>
                  <p>• Total pages will become: {project.pages.length * 2}</p>
                </div>
              </div>
              
              <Button
                variant="default"
                size="sm"
                onClick={handleInsertBlankPages}
                disabled={isInsertingBlankPages}
                className="gap-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white border-0 flex-shrink-0"
              >
                {isInsertingBlankPages ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Inserting...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    Insert Blank Pages
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Bar */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)]">
            <ImageIcon className="w-4 h-4 text-[var(--color-primary)]" />
            <span className="text-[var(--color-text)]">{project.pages.length}</span>
            <span className="text-[var(--color-text-dim)]">pages</span>
          </div>
          {trim && (
            <div className="text-[var(--color-text-dim)]">
              {trim.label} • {(trim.width * 300).toFixed(0)} × {(trim.height * 300).toFixed(0)} px @ 300 DPI
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex gap-1 p-1 bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)]">
            <button
              onClick={() => setViewMode("grid")}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm transition-colors",
                viewMode === "grid" 
                  ? "bg-[var(--color-primary)] text-white" 
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              )}
            >
              <Grid className="w-4 h-4 inline mr-1" />
              Grid
            </button>
            <button
              onClick={() => {
                setViewMode("canvas")
                if (selectedPageIndex === null && project.pages.length > 0) {
                  setSelectedPageIndex(0)
                }
              }}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm transition-colors",
                viewMode === "canvas" 
                  ? "bg-[var(--color-primary)] text-white" 
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              )}
            >
              <Move className="w-4 h-4 inline mr-1" />
              Canvas
            </button>
          </div>
          
          {/* Show Guides Toggle */}
          {viewMode === "canvas" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowGuides(!showGuides)}
              className="gap-1"
            >
              {showGuides ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              Guides
            </Button>
          )}
          
          {/* Auto-fit Button (center in trim) */}
          {project.pages.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleAutoFitAll}
              disabled={isAutoFitting || !trim}
              className="gap-2"
              title="Center images within the trim area"
            >
              {isAutoFitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Wand2 className="w-4 h-4" />
              )}
              Auto-fit All
            </Button>
          )}
          
          {/* Auto-size Button (fit in safe zone) */}
          {project.pages.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleAutoSizeAll}
              disabled={isAutoSizing || !trim}
              className="gap-2 border-green-500/50 text-green-600 hover:bg-green-500/10"
              title="Resize images to fit exactly inside the safe zone"
            >
              {isAutoSizing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Target className="w-4 h-4" />
              )}
              Auto-Size All
            </Button>
          )}
          
          {/* Generate Images Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowGenerateWizard(true)}
            className="gap-2 border-purple-500/50 text-purple-600 hover:bg-purple-500/10"
          >
            <Sparkles className="w-4 h-4" />
            Generate Images
          </Button>
          
          {/* Multi-Select Mode Toggle */}
          {project.pages.length > 0 && (
            <Button
              variant={isMultiSelectMode ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setIsMultiSelectMode(!isMultiSelectMode)
                if (isMultiSelectMode) {
                  setSelectedPageIds(new Set())
                }
              }}
              className={cn(
                "gap-2",
                isMultiSelectMode && "bg-blue-600 hover:bg-blue-700"
              )}
            >
              <CheckSquare className="w-4 h-4" />
              {isMultiSelectMode ? "Exit Select" : "Select"}
            </Button>
          )}
          
          {/* Delete Selected (only in multi-select mode) */}
          {isMultiSelectMode && selectedPageIds.size > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDeleteSelectedPages}
              className="gap-2 text-red-500 border-red-500/50 hover:bg-red-500/10"
            >
              <Trash2 className="w-4 h-4" />
              Delete ({selectedPageIds.size})
            </Button>
          )}
          
          {/* Delete All */}
          {project.pages.length > 0 && !isMultiSelectMode && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDeleteAllPages}
              className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
      
      {/* Multi-Select Toolbar */}
      {isMultiSelectMode && (
        <div className="flex items-center gap-3 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <span className="text-sm text-blue-400">
            {selectedPageIds.size} of {project.pages.length} selected
          </span>
          <Button variant="ghost" size="sm" onClick={selectAllPages} className="text-blue-400 hover:text-blue-300">
            Select All
          </Button>
          <Button variant="ghost" size="sm" onClick={deselectAllPages} className="text-blue-400 hover:text-blue-300">
            Deselect All
          </Button>
        </div>
      )}

      {/* Upload Area */}
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={cn(
          "border-2 border-dashed rounded-xl p-8 text-center transition-all",
          isFileDragging
            ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 scale-[1.02]"
            : "border-[var(--color-border)] hover:border-[var(--color-border-bright)]"
        )}
      >
        {isUploading ? (
          <div className="space-y-4">
            <Loader2 className="w-12 h-12 mx-auto text-[var(--color-primary)] animate-spin" />
            <div>
              <p className="text-[var(--color-text)]">
                Uploading {uploadProgress.current} of {uploadProgress.total}...
              </p>
              <div className="w-64 h-2 mx-auto mt-2 bg-[var(--color-surface)] rounded-full overflow-hidden">
                <div 
                  className="h-full bg-[var(--color-primary)] transition-all"
                  style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                />
              </div>
            </div>
          </div>
        ) : (
          <>
            <Upload className="w-12 h-12 mx-auto mb-4 text-[var(--color-text-dim)]" />
            <p className="text-lg text-[var(--color-text)] mb-2">
              Drag & drop your interior pages here
            </p>
            <p className="text-sm text-[var(--color-text-muted)] mb-4">
              Supports JPG, PNG, GIF, SVG • Images will be auto-fitted to {trim?.label || "page size"}
            </p>
            <div className="flex items-center justify-center gap-3">
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
              >
                <Plus className="w-4 h-4 mr-2" />
                Select Images
              </Button>
              <Button
                variant="ghost"
                onClick={() => handleAddEmptyPages(10)}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add 10 Empty Pages
              </Button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              onChange={(e) => handleFileUpload(e.target.files)}
              className="hidden"
            />
          </>
        )}
      </div>

      {/* Canvas View - Interactive Page Editor */}
      {viewMode === "canvas" && selectedPage && trim && (
        <Card className="overflow-hidden">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-semibold text-[var(--color-text)] flex items-center gap-2">
                <Crop className="w-5 h-5 text-[var(--color-primary)]" />
                Page {selectedPage.pageNumber} Canvas
                <span className="text-sm font-normal text-[var(--color-text-dim)]">
                  (Drag to move, <span className="inline-flex items-center"><span className="w-3 h-3 rounded-full bg-blue-500 border border-white mx-1"></span> corners to resize</span>, use "Fit to Safe Zone" below to auto-fit)
                </span>
              </h4>
              
              {/* Page Navigation */}
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedPageIndex(Math.max(0, (selectedPageIndex || 0) - 1))}
                  disabled={selectedPageIndex === 0}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm text-[var(--color-text-muted)]">
                  {(selectedPageIndex || 0) + 1} / {project.pages.length}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedPageIndex(Math.min(project.pages.length - 1, (selectedPageIndex || 0) + 1))}
                  disabled={selectedPageIndex === project.pages.length - 1}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
            
            <PageCanvas
              page={selectedPage}
              trimSize={project.trimSize}
              dpi={300}
              showGuides={showGuides}
              onImageUpdate={(imageId, updates) => {
                if (selectedPageIndex !== null) {
                  handleImageUpdate(selectedPageIndex, imageId, updates)
                }
              }}
              onImageDelete={(imageId) => {
                if (selectedPageIndex !== null) {
                  const updatedPages = [...project.pages]
                  const page = updatedPages[selectedPageIndex]
                  if (page) {
                    page.images = page.images.filter(img => img.id !== imageId)
                    onUpdate({ pages: updatedPages })
                  }
                }
              }}
            />
            
            {/* Canvas Actions */}
            {selectedPage.images.length > 0 && (
              <div className="flex items-center gap-2 mt-4 pt-4 border-t border-[var(--color-border)]">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (selectedPageIndex !== null) {
                      handleFitPageToSafeZone(selectedPageIndex)
                    }
                  }}
                  disabled={!trim}
                  className="gap-2 border-green-500/50 text-green-600 hover:bg-green-500/10"
                  title="Scale image to fill the entire safe zone area (edge-to-edge)"
                >
                  <Target className="w-4 h-4" />
                  Fit to Safe Zone
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const image = selectedPage.images[0]
                    if (image && selectedPageIndex !== null) {
                      handleOpenCrop(selectedPageIndex, image.id)
                    }
                  }}
                  className="gap-2"
                >
                  <Crop className="w-4 h-4" />
                  Crop Image
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (selectedPageIndex !== null) {
                      handleDeletePage(selectedPageIndex)
                    }
                  }}
                  className="gap-2 text-red-500 hover:text-red-600 hover:bg-red-500/10 ml-auto"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete Page
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Grid View - Page Thumbnails (also shown below canvas in canvas mode) */}
      {project.pages.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-[var(--color-text)] mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-[var(--color-primary)]" />
            {viewMode === "canvas" ? "All Pages" : "Interior Pages"}
            <span className="text-sm font-normal text-[var(--color-text-dim)]">
              ({!isMultiSelectMode && "drag to reorder • "}click to {viewMode === "canvas" ? "select" : "edit in canvas"})
            </span>
          </h3>
          
          <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
            {project.pages.map((page, index) => {
              // Check if this page was recently transferred (has AI-generated image)
              const isNewlyTransferred = showTransferBanner && page.images[0]?.fileName?.includes('ai-generated')
              const isDragging = draggedPageIndex === index
              const isDragOver = dragOverIndex === index
              
              return (
                <div
                  key={page.id}
                  draggable={!isMultiSelectMode}
                  onDragStart={(e) => handlePageDragStart(e, index)}
                  onDragEnd={handlePageDragEnd}
                  onDragOver={(e) => handlePageDragOver(e, index)}
                  onDragLeave={handlePageDragLeave}
                  onDrop={(e) => handlePageDrop(e, index)}
                  className={cn(
                    "relative group rounded-lg border-2 overflow-hidden transition-all hover:shadow-lg",
                    !isMultiSelectMode && "cursor-move",
                    isMultiSelectMode && "cursor-pointer",
                    isMultiSelectMode && selectedPageIds.has(page.id)
                      ? "border-blue-500 ring-2 ring-blue-500/30 scale-[1.02]"
                      : selectedPageIndex === index && !isMultiSelectMode
                      ? "border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/20 scale-105"
                      : "border-[var(--color-border)] hover:border-[var(--color-border-bright)]",
                    isNewlyTransferred && "animate-in fade-in zoom-in-95 duration-700",
                    isDragging && "opacity-50 scale-95",
                    isDragOver && "ring-4 ring-green-500 scale-105 border-green-500"
                  )}
                  style={{
                    animationDelay: isNewlyTransferred ? `${index * 50}ms` : '0ms',
                    aspectRatio: trim ? `${trim.width}/${trim.height}` : "8.5/11"
                  }}
                  onClick={() => {
                    if (isMultiSelectMode) {
                      togglePageSelection(page.id)
                    } else {
                      setSelectedPageIndex(index)
                      if (viewMode === "grid") {
                        setViewMode("canvas")
                      }
                    }
                  }}
                >
                {/* Page Content */}
                {page.images[0] ? (
                  <img
                    src={page.images[0].src}
                    alt={`Page ${page.pageNumber}`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-[var(--color-surface)] flex items-center justify-center">
                    <span className="text-[var(--color-text-dim)] text-xs">Empty</span>
                  </div>
                )}
                
                {/* Multi-select Checkbox */}
                {isMultiSelectMode && (
                  <div className="absolute top-1 right-1 z-10">
                    <div className={cn(
                      "w-5 h-5 rounded border-2 flex items-center justify-center transition-colors",
                      selectedPageIds.has(page.id)
                        ? "bg-blue-500 border-blue-500"
                        : "bg-black/50 border-white/50"
                    )}>
                      {selectedPageIds.has(page.id) && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  </div>
                )}
                
                {/* Page Number Badge */}
                <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-black/70 rounded text-[10px] text-white font-medium">
                  {page.pageNumber}
                </div>
                
                {/* New AI-generated badge */}
                {isNewlyTransferred && (
                  <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-gradient-to-r from-purple-500 to-cyan-500 rounded text-[9px] text-white font-bold flex items-center gap-0.5 animate-pulse">
                    <Sparkles className="w-2.5 h-2.5" />
                    NEW
                  </div>
                )}
                
                {/* Delete button (always visible in grid, not multi-select) */}
                {!isMultiSelectMode && viewMode === "grid" && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      if (confirm(`Delete page ${page.pageNumber}?`)) {
                        handleDeletePage(index)
                      }
                    }}
                    className="absolute top-1 right-1 p-1.5 bg-red-500 rounded-full text-white hover:bg-red-600 transition-all z-10 shadow-lg"
                    title="Delete page"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
                
                {/* Selected indicator */}
                {selectedPageIndex === index && viewMode === "canvas" && !isMultiSelectMode && (
                  <div className="absolute inset-0 bg-[var(--color-primary)]/20 flex items-center justify-center">
                    <div className="text-[10px] text-white bg-[var(--color-primary)] px-2 py-0.5 rounded">
                      Editing
                    </div>
                  </div>
                )}
                
                {/* Hover Actions (only in grid view, not multi-select) */}
                {viewMode === "grid" && !isMultiSelectMode && (
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedPageIndex(index)
                        setViewMode("canvas")
                      }}
                      className="p-2 bg-blue-500 rounded-full text-white hover:bg-blue-600 transition-colors"
                      title="Edit in canvas"
                    >
                      <Move className="w-4 h-4" />
                    </button>
                    {page.images[0] && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleOpenCrop(index, page.images[0].id)
                        }}
                        className="p-2 bg-purple-500 rounded-full text-white hover:bg-purple-600 transition-colors"
                        title="Crop image"
                      >
                        <Crop className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeletePage(index)
                      }}
                      className="p-2 bg-red-500 rounded-full text-white hover:bg-red-600 transition-colors"
                      title="Delete page"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
          </div>
        </div>
      )}

      {/* Empty State */}
      {project.pages.length === 0 && !isUploading && (
        <Card className="text-center py-12">
          <CardContent>
            <ImageIcon className="w-16 h-16 mx-auto mb-4 text-[var(--color-text-dim)]" />
            <h3 className="text-lg font-semibold text-[var(--color-text)] mb-2">
              No interior pages yet
            </h3>
            <p className="text-sm text-[var(--color-text-muted)] mb-4">
              Upload your interior page images to get started. You can drag and drop multiple images at once.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Download Section */}
      {project.pages.length > 0 && (
        <Card className="bg-gradient-to-r from-green-500/5 to-emerald-500/5 border-green-500/30">
          <CardContent className="py-4">
            <h4 className="text-sm font-medium text-[var(--color-text)] mb-3 flex items-center gap-2">
              <Download className="w-4 h-4 text-green-500" />
              Download Pages
            </h4>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">
                  File Name Prefix
                </label>
                <input
                  type="text"
                  value={downloadName}
                  onChange={(e) => setDownloadName(e.target.value)}
                  placeholder="Enter file name..."
                  className="w-full px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              {selectedPageIndex !== null && project.pages[selectedPageIndex]?.images.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownloadPage(selectedPageIndex)}
                  disabled={isDownloading}
                  className="gap-2 border-green-500/50 text-green-600 hover:bg-green-500/10"
                >
                  {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  Download Page {selectedPageIndex + 1}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadAllPages}
                disabled={isDownloading}
                className="gap-2 border-blue-500/50 text-blue-600 hover:bg-blue-500/10"
              >
                {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Download All ({project.pages.length} pages)
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tips */}
      <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
        <h4 className="text-sm font-medium text-blue-400 mb-2 flex items-center gap-2">
          <Target className="w-4 h-4" />
          Tips for Interior Pages
        </h4>
        <ul className="text-sm text-[var(--color-text-muted)] space-y-1">
          <li>• <strong>Drag & Drop:</strong> Drag pages to reorder them - green highlight shows drop target</li>
          <li>• <strong>Canvas View:</strong> Click any page to edit it - drag to move, pull <span className="inline-flex items-center"><span className="w-2 h-2 rounded-full bg-blue-500 mx-1"></span> blue corners</span> to resize</li>
          <li>• <strong>Auto-fit:</strong> Centers images within the trim area (may extend into bleed)</li>
          <li>• <strong>Auto-Size:</strong> Resizes images to fit exactly inside the <span className="text-green-400">safe zone</span> (recommended)</li>
          <li>• <strong>Bleed Area:</strong> Red area will be trimmed off - extend images into bleed for edge-to-edge printing</li>
          <li>• <strong>Safe Zone:</strong> Keep important content inside the green dashed line</li>
        </ul>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-4 border-t border-[var(--color-border)]">
        <Button variant="outline" onClick={onBack} className="gap-2">
          <ChevronLeft className="w-4 h-4" />
          Back to Trim Size
        </Button>
        
        <Button 
          onClick={onNext} 
          disabled={!canProceed}
          className="gap-2"
        >
          Continue to Cover
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Crop Modal */}
      {cropImageData && (
        <ImageCropper
          imageSrc={cropImageData.image.src}
          originalWidth={cropImageData.image.originalWidth}
          originalHeight={cropImageData.image.originalHeight}
          initialCrop={cropImageData.image.cropRect}
          onCropComplete={handleCropComplete}
          onCancel={() => setCropImageData(null)}
        />
      )}
      
      {/* Generate Images Wizard */}
      <GenerateImagesWizard
        isOpen={showGenerateWizard}
        onClose={() => setShowGenerateWizard(false)}
        onComplete={handleGenerateWizardComplete}
        trimWidth={trim?.width}
        trimHeight={trim?.height}
      />
    </div>
  )
}
