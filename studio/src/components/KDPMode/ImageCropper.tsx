import { useState, useRef, useCallback, useEffect } from "react"
import { Button } from "../Button"
import { cn } from "@/lib/utils"
import { 
  X, 
  Check, 
  RotateCcw,
  Crop,
  Square,
  RectangleHorizontal,
  RectangleVertical,
  Circle,
} from "lucide-react"

interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

interface ImageCropperProps {
  imageSrc: string
  originalWidth: number
  originalHeight: number
  initialCrop?: CropRect
  onCropComplete: (croppedImageSrc: string, cropRect: CropRect) => void
  onCancel: () => void
  aspectRatio?: number | null // null = free crop, number = fixed ratio (e.g., 1 for square, 16/9 for widescreen)
}

type AspectRatioPreset = "free" | "1:1" | "circle" | "4:3" | "3:4" | "16:9" | "9:16" | "custom"

const ASPECT_PRESETS: { key: AspectRatioPreset; label: string; ratio: number | null; icon: React.ReactNode }[] = [
  { key: "free", label: "Free", ratio: null, icon: <Crop className="w-4 h-4" /> },
  { key: "1:1", label: "Square", ratio: 1, icon: <Square className="w-4 h-4" /> },
  { key: "circle", label: "Circle", ratio: 1, icon: <Circle className="w-4 h-4" /> },
  { key: "4:3", label: "4:3", ratio: 4/3, icon: <RectangleHorizontal className="w-4 h-4" /> },
  { key: "3:4", label: "3:4", ratio: 3/4, icon: <RectangleVertical className="w-4 h-4" /> },
  { key: "16:9", label: "16:9", ratio: 16/9, icon: <RectangleHorizontal className="w-4 h-4" /> },
  { key: "9:16", label: "9:16", ratio: 9/16, icon: <RectangleVertical className="w-4 h-4" /> },
]

export function ImageCropper({
  imageSrc,
  originalWidth,
  originalHeight,
  initialCrop,
  onCropComplete,
  onCancel,
  aspectRatio: initialAspectRatio = null,
}: ImageCropperProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  const [imageScale, setImageScale] = useState(1)
  
  // Crop state (in original image coordinates)
  const [cropRect, setCropRect] = useState<CropRect>(() => {
    if (initialCrop) return initialCrop
    // Default to full image
    return { x: 0, y: 0, width: originalWidth, height: originalHeight }
  })
  
  const [aspectRatio, setAspectRatio] = useState<number | null>(initialAspectRatio)
  const [selectedPreset, setSelectedPreset] = useState<AspectRatioPreset>(
    initialAspectRatio === null ? "free" : 
    initialAspectRatio === 1 ? "1:1" :
    initialAspectRatio === 4/3 ? "4:3" :
    initialAspectRatio === 3/4 ? "3:4" :
    initialAspectRatio === 16/9 ? "16:9" :
    initialAspectRatio === 9/16 ? "9:16" : "custom"
  )
  const [isCircularCrop, setIsCircularCrop] = useState(false)
  
  // Drag state
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [resizeHandle, setResizeHandle] = useState<string | null>(null)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [initialCropOnDrag, setInitialCropOnDrag] = useState<CropRect | null>(null)

  // Calculate display scale
  useEffect(() => {
    if (!containerRef.current) return
    
    const updateSize = () => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (rect) {
        const maxWidth = rect.width - 48 // padding
        const maxHeight = window.innerHeight * 0.6
        
        const scaleX = maxWidth / originalWidth
        const scaleY = maxHeight / originalHeight
        const scale = Math.min(scaleX, scaleY, 1) // Don't upscale
        
        setImageScale(scale)
        setContainerSize({
          width: originalWidth * scale,
          height: originalHeight * scale,
        })
      }
    }
    
    updateSize()
    window.addEventListener("resize", updateSize)
    return () => window.removeEventListener("resize", updateSize)
  }, [originalWidth, originalHeight])

  // Convert between original and display coordinates
  const toDisplayCoords = useCallback((rect: CropRect) => ({
    x: rect.x * imageScale,
    y: rect.y * imageScale,
    width: rect.width * imageScale,
    height: rect.height * imageScale,
  }), [imageScale])

  const toOriginalCoords = useCallback((rect: CropRect) => ({
    x: rect.x / imageScale,
    y: rect.y / imageScale,
    width: rect.width / imageScale,
    height: rect.height / imageScale,
  }), [imageScale])

  // Handle aspect ratio change
  const handleAspectRatioChange = (preset: AspectRatioPreset) => {
    setSelectedPreset(preset)
    const presetData = ASPECT_PRESETS.find(p => p.key === preset)
    const newRatio = presetData?.ratio ?? null
    
    // Check if circular crop
    const isCircular = preset === "circle"
    setIsCircularCrop(isCircular)
    
    // Circle forces 1:1 ratio
    setAspectRatio(isCircular ? 1 : newRatio)
    
    if (newRatio !== null || isCircular) {
      // Adjust crop to match new aspect ratio
      const currentCenter = {
        x: cropRect.x + cropRect.width / 2,
        y: cropRect.y + cropRect.height / 2,
      }
      
      const targetRatio = isCircular ? 1 : newRatio!
      let newWidth = cropRect.width
      let newHeight = cropRect.width / targetRatio
      
      if (newHeight > originalHeight) {
        newHeight = originalHeight
        newWidth = newHeight * targetRatio
      }
      if (newWidth > originalWidth) {
        newWidth = originalWidth
        newHeight = newWidth / targetRatio
      }
      
      let newX = currentCenter.x - newWidth / 2
      let newY = currentCenter.y - newHeight / 2
      
      // Clamp to bounds
      newX = Math.max(0, Math.min(originalWidth - newWidth, newX))
      newY = Math.max(0, Math.min(originalHeight - newHeight, newY))
      
      setCropRect({ x: newX, y: newY, width: newWidth, height: newHeight })
    }
  }

  // Reset crop to full image
  const handleReset = () => {
    const targetRatio = isCircularCrop ? 1 : aspectRatio
    
    if (targetRatio !== null) {
      // Fit to aspect ratio
      let width = originalWidth
      let height = width / targetRatio
      if (height > originalHeight) {
        height = originalHeight
        width = height * targetRatio
      }
      setCropRect({
        x: (originalWidth - width) / 2,
        y: (originalHeight - height) / 2,
        width,
        height,
      })
    } else {
      setCropRect({ x: 0, y: 0, width: originalWidth, height: originalHeight })
    }
  }

  // Mouse handlers for crop area
  const handleMouseDown = (e: React.MouseEvent, handle?: string) => {
    e.preventDefault()
    e.stopPropagation()
    
    setDragStart({ x: e.clientX, y: e.clientY })
    setInitialCropOnDrag({ ...cropRect })
    
    if (handle) {
      setIsResizing(true)
      setResizeHandle(handle)
    } else {
      setIsDragging(true)
    }
  }

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!initialCropOnDrag) return
    
    const deltaX = (e.clientX - dragStart.x) / imageScale
    const deltaY = (e.clientY - dragStart.y) / imageScale
    
    if (isDragging) {
      // Move the crop area
      let newX = initialCropOnDrag.x + deltaX
      let newY = initialCropOnDrag.y + deltaY
      
      // Clamp to bounds
      newX = Math.max(0, Math.min(originalWidth - cropRect.width, newX))
      newY = Math.max(0, Math.min(originalHeight - cropRect.height, newY))
      
      setCropRect(prev => ({ ...prev, x: newX, y: newY }))
    }
    
    if (isResizing && resizeHandle) {
      let newRect = { ...initialCropOnDrag }
      
      // Handle resize based on which handle is being dragged
      switch (resizeHandle) {
        case "nw":
          newRect.x = initialCropOnDrag.x + deltaX
          newRect.y = initialCropOnDrag.y + deltaY
          newRect.width = initialCropOnDrag.width - deltaX
          newRect.height = initialCropOnDrag.height - deltaY
          break
        case "ne":
          newRect.y = initialCropOnDrag.y + deltaY
          newRect.width = initialCropOnDrag.width + deltaX
          newRect.height = initialCropOnDrag.height - deltaY
          break
        case "sw":
          newRect.x = initialCropOnDrag.x + deltaX
          newRect.width = initialCropOnDrag.width - deltaX
          newRect.height = initialCropOnDrag.height + deltaY
          break
        case "se":
          newRect.width = initialCropOnDrag.width + deltaX
          newRect.height = initialCropOnDrag.height + deltaY
          break
        case "n":
          newRect.y = initialCropOnDrag.y + deltaY
          newRect.height = initialCropOnDrag.height - deltaY
          break
        case "s":
          newRect.height = initialCropOnDrag.height + deltaY
          break
        case "w":
          newRect.x = initialCropOnDrag.x + deltaX
          newRect.width = initialCropOnDrag.width - deltaX
          break
        case "e":
          newRect.width = initialCropOnDrag.width + deltaX
          break
      }
      
      // Apply aspect ratio constraint if set
      if (aspectRatio !== null) {
        if (["n", "s"].includes(resizeHandle)) {
          newRect.width = newRect.height * aspectRatio
        } else if (["e", "w"].includes(resizeHandle)) {
          newRect.height = newRect.width / aspectRatio
        } else {
          // Corner handles - maintain aspect ratio based on dominant axis
          const widthChange = Math.abs(newRect.width - initialCropOnDrag.width)
          const heightChange = Math.abs(newRect.height - initialCropOnDrag.height)
          
          if (widthChange > heightChange) {
            newRect.height = newRect.width / aspectRatio
          } else {
            newRect.width = newRect.height * aspectRatio
          }
        }
      }
      
      // Ensure minimum size
      const minSize = 20
      newRect.width = Math.max(minSize, newRect.width)
      newRect.height = Math.max(minSize, newRect.height)
      
      // Clamp to image bounds
      if (newRect.x < 0) {
        newRect.width += newRect.x
        newRect.x = 0
      }
      if (newRect.y < 0) {
        newRect.height += newRect.y
        newRect.y = 0
      }
      if (newRect.x + newRect.width > originalWidth) {
        newRect.width = originalWidth - newRect.x
      }
      if (newRect.y + newRect.height > originalHeight) {
        newRect.height = originalHeight - newRect.y
      }
      
      setCropRect(newRect)
    }
  }, [isDragging, isResizing, resizeHandle, dragStart, initialCropOnDrag, imageScale, aspectRatio, originalWidth, originalHeight, cropRect.width, cropRect.height])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
    setIsResizing(false)
    setResizeHandle(null)
    setInitialCropOnDrag(null)
  }, [])

  useEffect(() => {
    if (isDragging || isResizing) {
      window.addEventListener("mousemove", handleMouseMove)
      window.addEventListener("mouseup", handleMouseUp)
      return () => {
        window.removeEventListener("mousemove", handleMouseMove)
        window.removeEventListener("mouseup", handleMouseUp)
      }
    }
  }, [isDragging, isResizing, handleMouseMove, handleMouseUp])

  // Apply crop and generate cropped image
  const handleApplyCrop = async () => {
    const canvas = document.createElement("canvas")
    canvas.width = cropRect.width
    canvas.height = cropRect.height
    
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    
    const img = new window.Image()
    img.crossOrigin = "anonymous"
    
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = reject
      img.src = imageSrc
    })
    
    if (isCircularCrop) {
      // Create circular crop with transparent background
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      
      // Create circular clipping path
      ctx.beginPath()
      ctx.arc(
        canvas.width / 2,
        canvas.height / 2,
        Math.min(canvas.width, canvas.height) / 2,
        0,
        Math.PI * 2
      )
      ctx.closePath()
      ctx.clip()
    }
    
    // Draw the cropped portion
    ctx.drawImage(
      img,
      cropRect.x, cropRect.y, cropRect.width, cropRect.height,
      0, 0, cropRect.width, cropRect.height
    )
    
    const croppedSrc = canvas.toDataURL("image/png", 1.0)
    onCropComplete(croppedSrc, cropRect)
  }

  const displayCrop = toDisplayCoords(cropRect)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-[var(--color-bg)] rounded-xl shadow-2xl max-w-[90vw] max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <h3 className="text-lg font-semibold text-[var(--color-text)] flex items-center gap-2">
            <Crop className="w-5 h-5 text-[var(--color-primary)]" />
            Crop Image
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-sm text-[var(--color-text-muted)]">
              {Math.round(cropRect.width)} × {Math.round(cropRect.height)} px
            </span>
          </div>
        </div>

        {/* Aspect Ratio Presets */}
        <div className="flex items-center gap-2 px-6 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
          <span className="text-sm text-[var(--color-text-muted)] mr-2">Aspect:</span>
          {ASPECT_PRESETS.map(preset => (
            <button
              key={preset.key}
              onClick={() => handleAspectRatioChange(preset.key)}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5",
                selectedPreset === preset.key
                  ? "bg-[var(--color-primary)] text-white"
                  : "bg-[var(--color-bg)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
              )}
            >
              {preset.icon}
              {preset.label}
            </button>
          ))}
          <div className="ml-auto">
            <Button variant="ghost" size="sm" onClick={handleReset} className="gap-1">
              <RotateCcw className="w-4 h-4" />
              Reset
            </Button>
          </div>
        </div>

        {/* Crop Area */}
        <div 
          ref={containerRef}
          className="flex-1 flex items-center justify-center p-6 overflow-auto bg-[#1a1a1a]"
        >
          <div 
            className="relative"
            style={{ width: containerSize.width, height: containerSize.height }}
          >
            {/* Original Image (dimmed) */}
            <img
              src={imageSrc}
              alt="Original"
              className="w-full h-full object-contain pointer-events-none opacity-40"
              draggable={false}
            />

            {/* Crop overlay - darkens area outside crop */}
            <div className="absolute inset-0 pointer-events-none">
              {isCircularCrop ? (
                // Circular mask overlay
                <svg 
                  width={containerSize.width} 
                  height={containerSize.height}
                  className="absolute inset-0"
                  style={{ pointerEvents: 'none' }}
                >
                  <defs>
                    <mask id="circleMask">
                      <rect width="100%" height="100%" fill="white" />
                      <circle
                        cx={displayCrop.x + displayCrop.width / 2}
                        cy={displayCrop.y + displayCrop.height / 2}
                        r={Math.min(displayCrop.width, displayCrop.height) / 2}
                        fill="black"
                      />
                    </mask>
                  </defs>
                  <rect 
                    width="100%" 
                    height="100%" 
                    fill="rgba(0, 0, 0, 0.6)" 
                    mask="url(#circleMask)"
                  />
                </svg>
              ) : (
                // Rectangular mask overlay
                <>
                  {/* Top */}
                  <div 
                    className="absolute bg-black/60"
                    style={{
                      top: 0,
                      left: 0,
                      right: 0,
                      height: displayCrop.y,
                    }}
                  />
                  {/* Bottom */}
                  <div 
                    className="absolute bg-black/60"
                    style={{
                      top: displayCrop.y + displayCrop.height,
                      left: 0,
                      right: 0,
                      bottom: 0,
                    }}
                  />
                  {/* Left */}
                  <div 
                    className="absolute bg-black/60"
                    style={{
                      top: displayCrop.y,
                      left: 0,
                      width: displayCrop.x,
                      height: displayCrop.height,
                    }}
                  />
                  {/* Right */}
                  <div 
                    className="absolute bg-black/60"
                    style={{
                      top: displayCrop.y,
                      left: displayCrop.x + displayCrop.width,
                      right: 0,
                      height: displayCrop.height,
                    }}
                  />
                </>
              )}
            </div>

            {/* Crop area (bright, draggable) */}
            <div
              className={cn(
                "absolute cursor-move",
                isCircularCrop ? "rounded-full border-2 border-white overflow-hidden" : "border-2 border-white",
                (isDragging || isResizing) && "border-[var(--color-primary)]"
              )}
              style={{
                left: displayCrop.x,
                top: displayCrop.y,
                width: displayCrop.width,
                height: displayCrop.height,
              }}
              onMouseDown={(e) => handleMouseDown(e)}
            >
              {/* Cropped image preview */}
              <div 
                className={cn(
                  "absolute inset-0 overflow-hidden pointer-events-none",
                  isCircularCrop && "rounded-full"
                )}
                style={{
                  backgroundImage: `url(${imageSrc})`,
                  backgroundSize: `${containerSize.width}px ${containerSize.height}px`,
                  backgroundPosition: `-${displayCrop.x}px -${displayCrop.y}px`,
                }}
              />

              {/* Grid lines (rule of thirds) - only show for non-circular */}
              {!isCircularCrop && (
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute top-1/3 left-0 right-0 h-px bg-white/30" />
                  <div className="absolute top-2/3 left-0 right-0 h-px bg-white/30" />
                  <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/30" />
                  <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/30" />
                </div>
              )}
              
              {/* Circular crop indicator */}
              {isCircularCrop && (
                <div className="absolute inset-0 pointer-events-none rounded-full border-2 border-dashed border-white/40" />
              )}

              {/* Resize handles */}
              {/* Corners */}
              {(["nw", "ne", "sw", "se"] as const).map(handle => (
                <div
                  key={handle}
                  className={cn(
                    "absolute w-4 h-4 bg-white border-2 border-[var(--color-primary)] rounded-sm z-10",
                    handle === "nw" && "cursor-nw-resize -top-2 -left-2",
                    handle === "ne" && "cursor-ne-resize -top-2 -right-2",
                    handle === "sw" && "cursor-sw-resize -bottom-2 -left-2",
                    handle === "se" && "cursor-se-resize -bottom-2 -right-2",
                  )}
                  onMouseDown={(e) => handleMouseDown(e, handle)}
                />
              ))}
              {/* Edges */}
              {(["n", "s", "e", "w"] as const).map(handle => (
                <div
                  key={handle}
                  className={cn(
                    "absolute bg-white border border-[var(--color-primary)] z-10",
                    handle === "n" && "cursor-n-resize -top-1.5 left-1/2 -translate-x-1/2 w-8 h-3 rounded-sm",
                    handle === "s" && "cursor-s-resize -bottom-1.5 left-1/2 -translate-x-1/2 w-8 h-3 rounded-sm",
                    handle === "e" && "cursor-e-resize -right-1.5 top-1/2 -translate-y-1/2 w-3 h-8 rounded-sm",
                    handle === "w" && "cursor-w-resize -left-1.5 top-1/2 -translate-y-1/2 w-3 h-8 rounded-sm",
                  )}
                  onMouseDown={(e) => handleMouseDown(e, handle)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--color-border)]">
          <div className="text-sm text-[var(--color-text-muted)]">
            Drag to move • Pull handles to resize
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={onCancel} className="gap-2">
              <X className="w-4 h-4" />
              Cancel
            </Button>
            <Button onClick={handleApplyCrop} className="gap-2">
              <Check className="w-4 h-4" />
              Apply Crop
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

