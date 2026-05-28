import { useState, useRef, useEffect, useCallback } from "react"
import { cn } from "@/lib/utils"
import { Move, Maximize2 } from "lucide-react"
import {
  KDP_TRIM_SIZES,
  KDPTrimSizeKey,
  KDPPaperType,
  calculateCoverDimensions,
  RescalerImage,
} from "@/types/Rescaler"

interface CanvasPreviewProps {
  // Dimensions
  trimSize?: KDPTrimSizeKey
  paperType?: KDPPaperType
  pageCount?: number
  dpi: number
  
  // For interior pages - single page dimensions
  mode: "interior" | "cover"
  
  // Custom dimensions (for standard mode)
  customWidth?: number
  customHeight?: number
  
  // Image to display on canvas
  image?: RescalerImage
  
  // Bleed guide visibility
  showBleedGuides?: boolean
  onToggleBleedGuides?: (show: boolean) => void
  
  // Image transform callbacks
  onImageScaleChange?: (scale: number) => void
  onImagePositionChange?: (x: number, y: number) => void
  onImageRotationChange?: (rotation: number) => void
}

type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se' | null

export function CanvasPreview({
  trimSize,
  paperType,
  pageCount,
  dpi,
  mode,
  customWidth,
  customHeight,
  image,
  showBleedGuides = true,
  onToggleBleedGuides,
  onImageScaleChange,
  onImagePositionChange,
}: CanvasPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [activeHandle, setActiveHandle] = useState<ResizeHandle>(null)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [initialPosition, setInitialPosition] = useState({ x: 0, y: 0 })
  const [initialScale, setInitialScale] = useState(1)

  // Calculate dimensions based on mode
  const getDimensions = () => {
    if (mode === "cover" && trimSize && paperType && pageCount) {
      const coverDims = calculateCoverDimensions(trimSize, pageCount, paperType)
      return {
        width: coverDims.totalWidth,
        height: coverDims.totalHeight,
        bleed: coverDims.bleed,
        trimWidth: coverDims.trimWidth,
        trimHeight: coverDims.trimHeight,
        spineWidth: coverDims.spineWidth,
        spineX: coverDims.spineX,
        frontCoverX: coverDims.frontCoverX,
        backCoverX: coverDims.backCoverX,
        isCover: true,
      }
    } else if (trimSize) {
      const trim = KDP_TRIM_SIZES[trimSize]
      const bleed = 0.125
      return {
        width: trim.width + bleed * 2,
        height: trim.height + bleed * 2,
        bleed,
        trimWidth: trim.width,
        trimHeight: trim.height,
        isCover: false,
      }
    } else if (customWidth && customHeight) {
      return {
        width: customWidth,
        height: customHeight,
        bleed: 0,
        trimWidth: customWidth,
        trimHeight: customHeight,
        isCover: false,
      }
    }
    return null
  }

  const dims = getDimensions()
  
  if (!dims) {
    return (
      <div className="border-2 border-dashed border-[var(--color-border)] rounded-lg p-8 text-center bg-[var(--color-surface)]">
        <p className="text-sm text-[var(--color-text-muted)]">
          Select a trim size to see canvas preview
        </p>
      </div>
    )
  }

  // Calculate visual scale for preview (max 500px width)
  const maxPreviewWidth = 500
  const visualScale = maxPreviewWidth / dims.width
  const previewWidth = dims.width * visualScale
  const previewHeight = dims.height * visualScale
  const bleedPx = dims.bleed * visualScale

  // Safe zone is 0.25" from trim edge
  const safeZone = 0.25
  const safeZonePx = safeZone * visualScale

  // Target canvas dimensions in pixels (at target DPI)
  const targetCanvasWidthPx = dims.trimWidth * dpi
  const targetCanvasHeightPx = dims.trimHeight * dpi

  // Calculate image dimensions for display
  // Position is stored in target canvas pixels (at DPI)
  // We need to convert to preview pixels for display
  const getImageDisplayDimensions = () => {
    if (!image) return null
    
    // Image size in target canvas pixels
    const imageWidthPx = image.originalWidth * image.scale
    const imageHeightPx = image.originalHeight * image.scale
    
    // Convert to preview display pixels
    const displayWidth = (imageWidthPx / targetCanvasWidthPx) * (dims.trimWidth * visualScale)
    const displayHeight = (imageHeightPx / targetCanvasHeightPx) * (dims.trimHeight * visualScale)
    
    // Convert position from target pixels to preview pixels
    const displayX = (image.position.x / targetCanvasWidthPx) * (dims.trimWidth * visualScale)
    const displayY = (image.position.y / targetCanvasHeightPx) * (dims.trimHeight * visualScale)
    
    return {
      width: displayWidth,
      height: displayHeight,
      x: displayX,
      y: displayY,
    }
  }

  const imageDisplay = getImageDisplayDimensions()

  // Clamp position to keep image inside canvas bounds
  const clampPosition = useCallback((x: number, y: number, scale: number): { x: number, y: number } => {
    if (!image) return { x, y }
    
    const imageWidth = image.originalWidth * scale
    const imageHeight = image.originalHeight * scale
    
    // Ensure at least part of the image is visible
    const minX = -imageWidth + 50 // Allow image to go slightly off-canvas
    const maxX = targetCanvasWidthPx - 50
    const minY = -imageHeight + 50
    const maxY = targetCanvasHeightPx - 50
    
    return {
      x: Math.max(minX, Math.min(maxX, x)),
      y: Math.max(minY, Math.min(maxY, y)),
    }
  }, [image, targetCanvasWidthPx, targetCanvasHeightPx])

  // Mouse event handlers
  const handleMouseDown = (e: React.MouseEvent, handle?: ResizeHandle) => {
    if (!image) return
    
    e.preventDefault()
    e.stopPropagation()

    setDragStart({ x: e.clientX, y: e.clientY })
    setInitialPosition({ x: image.position.x, y: image.position.y })
    setInitialScale(image.scale)

    if (handle && onImageScaleChange) {
      setIsResizing(true)
      setActiveHandle(handle)
    } else if (onImagePositionChange) {
      setIsDragging(true)
    }
  }

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!image) return

    const deltaX = e.clientX - dragStart.x
    const deltaY = e.clientY - dragStart.y

    if (isDragging && onImagePositionChange) {
      // Convert screen delta to target canvas delta
      // Preview trim width in px / target trim width in px
      const scaleFactorX = targetCanvasWidthPx / (dims.trimWidth * visualScale)
      const scaleFactorY = targetCanvasHeightPx / (dims.trimHeight * visualScale)
      
      const newX = initialPosition.x + deltaX * scaleFactorX
      const newY = initialPosition.y + deltaY * scaleFactorY
      
      // Clamp to bounds
      const clamped = clampPosition(newX, newY, image.scale)
      onImagePositionChange(clamped.x, clamped.y)
    }

    if (isResizing && onImageScaleChange) {
      // Calculate scale change based on handle drag
      let scaleDelta = 0
      const sensitivity = 0.005
      
      switch (activeHandle) {
        case 'se':
          scaleDelta = (deltaX + deltaY) * sensitivity
          break
        case 'nw':
          scaleDelta = (-deltaX - deltaY) * sensitivity
          break
        case 'ne':
          scaleDelta = (deltaX - deltaY) * sensitivity
          break
        case 'sw':
          scaleDelta = (-deltaX + deltaY) * sensitivity
          break
      }
      
      const newScale = Math.max(0.1, Math.min(5, initialScale + scaleDelta))
      onImageScaleChange(newScale)
      
      // Also update position to keep image in bounds after scale change
      if (onImagePositionChange) {
        const clamped = clampPosition(image.position.x, image.position.y, newScale)
        if (clamped.x !== image.position.x || clamped.y !== image.position.y) {
          onImagePositionChange(clamped.x, clamped.y)
        }
      }
    }
  }, [isDragging, isResizing, dragStart, initialPosition, initialScale, activeHandle, image, onImagePositionChange, onImageScaleChange, clampPosition, dims, visualScale, targetCanvasWidthPx, targetCanvasHeightPx])

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

  const handleSize = 12
  const handleOffset = -handleSize / 2

  return (
    <div className="space-y-3">
      {/* Canvas Container */}
      <div className="flex justify-center">
        <div 
          ref={containerRef}
          className={cn(
            "relative bg-white border-2 shadow-lg select-none",
            (isDragging || isResizing) ? "cursor-grabbing" : "border-[var(--color-border)]"
          )}
          style={{ 
            width: `${previewWidth}px`, 
            height: `${previewHeight}px`,
          }}
        >
          {/* Bleed area */}
          {showBleedGuides && dims.bleed > 0 && (
            <div 
              className="absolute inset-0 pointer-events-none"
              style={{ background: "rgba(255, 0, 0, 0.05)" }}
            />
          )}

          {/* Trim area */}
          <div 
            className="absolute bg-white overflow-hidden"
            style={{
              left: `${bleedPx}px`,
              top: `${bleedPx}px`,
              width: `${dims.trimWidth * visualScale}px`,
              height: `${dims.trimHeight * visualScale}px`,
            }}
          >
            {/* Image with interactive controls */}
            {image && imageDisplay && (
              <div 
                className={cn(
                  "absolute cursor-grab group",
                  isDragging && "cursor-grabbing"
                )}
                style={{
                  left: `${imageDisplay.x}px`,
                  top: `${imageDisplay.y}px`,
                  width: `${imageDisplay.width}px`,
                  height: `${imageDisplay.height}px`,
                  transform: `rotate(${image.rotation}deg)`,
                  transformOrigin: "top left",
                }}
                onMouseDown={(e) => handleMouseDown(e)}
              >
                <img 
                  src={image.preview} 
                  alt="Preview"
                  className="w-full h-full object-fill pointer-events-none"
                  draggable={false}
                />
                
                {/* Selection border */}
                {(onImagePositionChange || onImageScaleChange) && (
                  <div className={cn(
                    "absolute inset-0 border-2 border-dashed transition-colors",
                    (isDragging || isResizing) 
                      ? "border-[var(--color-primary)]" 
                      : "border-transparent group-hover:border-blue-400"
                  )} />
                )}

                {/* Resize handles */}
                {onImageScaleChange && (
                  <>
                    <div
                      className={cn(
                        "absolute bg-white border-2 border-blue-500 rounded-sm cursor-nw-resize opacity-0 group-hover:opacity-100 transition-opacity z-10",
                        isResizing && activeHandle === 'nw' && "opacity-100"
                      )}
                      style={{ width: `${handleSize}px`, height: `${handleSize}px`, left: `${handleOffset}px`, top: `${handleOffset}px` }}
                      onMouseDown={(e) => handleMouseDown(e, 'nw')}
                    />
                    <div
                      className={cn(
                        "absolute bg-white border-2 border-blue-500 rounded-sm cursor-ne-resize opacity-0 group-hover:opacity-100 transition-opacity z-10",
                        isResizing && activeHandle === 'ne' && "opacity-100"
                      )}
                      style={{ width: `${handleSize}px`, height: `${handleSize}px`, right: `${handleOffset}px`, top: `${handleOffset}px` }}
                      onMouseDown={(e) => handleMouseDown(e, 'ne')}
                    />
                    <div
                      className={cn(
                        "absolute bg-white border-2 border-blue-500 rounded-sm cursor-sw-resize opacity-0 group-hover:opacity-100 transition-opacity z-10",
                        isResizing && activeHandle === 'sw' && "opacity-100"
                      )}
                      style={{ width: `${handleSize}px`, height: `${handleSize}px`, left: `${handleOffset}px`, bottom: `${handleOffset}px` }}
                      onMouseDown={(e) => handleMouseDown(e, 'sw')}
                    />
                    <div
                      className={cn(
                        "absolute bg-white border-2 border-blue-500 rounded-sm cursor-se-resize opacity-0 group-hover:opacity-100 transition-opacity z-10",
                        isResizing && activeHandle === 'se' && "opacity-100"
                      )}
                      style={{ width: `${handleSize}px`, height: `${handleSize}px`, right: `${handleOffset}px`, bottom: `${handleOffset}px` }}
                      onMouseDown={(e) => handleMouseDown(e, 'se')}
                    />
                  </>
                )}

                {/* Drag indicator */}
                {onImagePositionChange && (
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-70 transition-opacity pointer-events-none">
                    <Move className="w-8 h-8 text-blue-500 drop-shadow-lg" />
                  </div>
                )}
              </div>
            )}

            {/* Safe zone guide */}
            {showBleedGuides && (
              <div 
                className="absolute border-2 border-dashed border-blue-400 pointer-events-none"
                style={{
                  left: `${safeZonePx}px`,
                  top: `${safeZonePx}px`,
                  right: `${safeZonePx}px`,
                  bottom: `${safeZonePx}px`,
                }}
              />
            )}
          </div>

          {/* Trim line */}
          {showBleedGuides && dims.bleed > 0 && (
            <div 
              className="absolute border-2 border-red-500 pointer-events-none"
              style={{
                left: `${bleedPx}px`,
                top: `${bleedPx}px`,
                width: `${dims.trimWidth * visualScale}px`,
                height: `${dims.trimHeight * visualScale}px`,
              }}
            />
          )}

          {/* Cover spine guides */}
          {dims.isCover && dims.spineWidth && showBleedGuides && (
            <>
              <div 
                className="absolute bg-gray-200/50 pointer-events-none"
                style={{
                  left: `${(dims.spineX || 0) * visualScale}px`,
                  top: `${bleedPx}px`,
                  width: `${dims.spineWidth * visualScale}px`,
                  height: `${dims.trimHeight! * visualScale}px`,
                }}
              />
              <div 
                className="absolute border-l-2 border-dashed border-purple-500 pointer-events-none"
                style={{
                  left: `${((dims.spineX || 0) + dims.spineWidth / 2) * visualScale}px`,
                  top: `${bleedPx}px`,
                  height: `${dims.trimHeight! * visualScale}px`,
                }}
              />
            </>
          )}

          {/* Corner labels */}
          {showBleedGuides && (
            <>
              <div className="absolute top-1 left-1 text-[8px] text-red-500 font-bold bg-white/80 px-1 rounded">
                BLEED
              </div>
              <div 
                className="absolute text-[8px] text-red-500 font-bold bg-white/80 px-1 rounded"
                style={{ top: `${bleedPx + 2}px`, left: `${bleedPx + 2}px` }}
              >
                TRIM
              </div>
              <div 
                className="absolute text-[8px] text-blue-500 font-bold bg-white/80 px-1 rounded"
                style={{ top: `${bleedPx + safeZonePx + 2}px`, left: `${bleedPx + safeZonePx + 2}px` }}
              >
                SAFE
              </div>
            </>
          )}

          {/* Interactive hint */}
          {image && (onImagePositionChange || onImageScaleChange) && !isDragging && !isResizing && (
            <div className="absolute bottom-2 right-2 text-[9px] text-[var(--color-text-dim)] bg-black/60 px-2 py-1 rounded flex items-center gap-1">
              <Move className="w-3 h-3" /> Drag to move
              {onImageScaleChange && (
                <>
                  <span className="mx-1">•</span>
                  <Maximize2 className="w-3 h-3" /> Corners to resize
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Dimensions info */}
      <div className="text-center space-y-1">
        <p className="text-sm font-medium text-[var(--color-text)]">
          {dims.width.toFixed(2)}" × {dims.height.toFixed(2)}"
        </p>
        <p className="text-xs text-[var(--color-text-dim)]">
          {Math.round(dims.width * dpi)} × {Math.round(dims.height * dpi)} pixels @ {dpi} DPI
        </p>
        {dims.isCover && dims.spineWidth && (
          <p className="text-xs text-purple-400">
            Spine: {dims.spineWidth.toFixed(3)}"
          </p>
        )}
      </div>

      {/* Legend */}
      {showBleedGuides && (
        <div className="flex items-center justify-center gap-4 text-xs text-[var(--color-text-dim)]">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 border-2 border-red-500" />
            <span>Trim Line</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 border-2 border-dashed border-blue-400" />
            <span>Safe Zone</span>
          </div>
          {dims.isCover && (
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 border-l-2 border-dashed border-purple-500" />
              <span>Spine</span>
            </div>
          )}
        </div>
      )}

      {/* Toggle guides */}
      {onToggleBleedGuides && (
        <label className="flex items-center justify-center gap-2 text-sm text-[var(--color-text-muted)] cursor-pointer">
          <input
            type="checkbox"
            checked={showBleedGuides}
            onChange={(e) => onToggleBleedGuides(e.target.checked)}
            className="rounded"
          />
          Show bleed & safe zone guides
        </label>
      )}
    </div>
  )
}
