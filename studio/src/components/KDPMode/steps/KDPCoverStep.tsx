import { useState, useCallback, useRef, useEffect } from "react"
import { Button } from "../../Button"
import { Card, CardContent } from "../../Card"
import { cn } from "@/lib/utils"
import {
  KDPProject,
  KDPImage,
  KDPTextElement,
  KDPShapeElement,
  KDPBarcodeElement,
  generateKDPId,
  KDP_TRIM_SIZES,
  KDP_PAPER_TYPES,
  KDPTrimSizeKey,
  KDPPaperType,
  calculateCoverDimensions,
  CoverDimensions,
} from "@/types/KDPMode"
import { MARKETING_BADGE_TEMPLATES, createBadgeElements, MarketingBadgeTemplate } from "../templates/marketingBadges"
import { DECORATIVE_ELEMENTS, getElementsByCategory, createSVGElement } from "../templates/decorativeElements"
import { 
  ChevronRight, 
  ChevronLeft, 
  Upload, 
  Trash2, 
  ZoomIn,
  ZoomOut,
  Eye,
  EyeOff,
  Loader2,
  Type,
  Image as ImageIcon,
  Target,
  Move,
  Download,
  Wand2,
  Crop,
  Maximize2,
  Plus,
  Bold,
  Italic,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Barcode,
  ChevronDown,
  ChevronUp,
  Palette,
  X,
  Layers,
  Underline,
  Lock,
  Unlock,
  Square,
  Circle,
  Minus,
  ArrowRight,
  Copy,
  Check,
  AlertCircle,
  Award,
  Sparkles,
  FileText,
} from "lucide-react"
import { ImageCropper } from "../ImageCropper"
import { analyzeCover, CoverAnalysisResult } from "../utils/coverAnalyzer"
import { CoverAnalysisModal } from "../components/CoverAnalysisModal"

interface KDPCoverStepProps {
  project: KDPProject
  onUpdate: (updates: Partial<KDPProject>) => void
  onNext: () => void
  onBack: () => void
}

// Resize handle types
type HandleType = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

// Color templates for quick background application
const COLOR_TEMPLATES = [
  { name: 'Classic White', front: '#ffffff', back: '#f8f8f8', spine: '#e0e0e0', text: '#000000' },
  { name: 'Dark Elegance', front: '#1a1a2e', back: '#16213e', spine: '#0f3460', text: '#ffffff' },
  { name: 'Warm Cream', front: '#fdf6e3', back: '#eee8d5', spine: '#d4c4a8', text: '#5c4a32' },
  { name: 'Ocean Blue', front: '#e3f2fd', back: '#bbdefb', spine: '#64b5f6', text: '#0d47a1' },
  { name: 'Forest Green', front: '#e8f5e9', back: '#c8e6c9', spine: '#81c784', text: '#1b5e20' },
  { name: 'Sunset', front: '#fff3e0', back: '#ffe0b2', spine: '#ffb74d', text: '#e65100' },
  { name: 'Midnight', front: '#263238', back: '#37474f', spine: '#455a64', text: '#eceff1' },
  { name: 'Royal Purple', front: '#f3e5f5', back: '#e1bee7', spine: '#ba68c8', text: '#4a148c' },
]

// Gradient presets for backgrounds
const GRADIENT_PRESETS = [
  { name: 'Sunset Glow', value: 'linear-gradient(135deg, #ff6b6b 0%, #feca57 100%)', colors: ['#ff6b6b', '#feca57'] },
  { name: 'Ocean Breeze', value: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', colors: ['#667eea', '#764ba2'] },
  { name: 'Forest Mist', value: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)', colors: ['#11998e', '#38ef7d'] },
  { name: 'Midnight Sky', value: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)', colors: ['#0f0c29', '#302b63', '#24243e'] },
  { name: 'Rose Gold', value: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', colors: ['#f093fb', '#f5576c'] },
  { name: 'Arctic Dawn', value: 'linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)', colors: ['#e0c3fc', '#8ec5fc'] },
  { name: 'Warm Ember', value: 'linear-gradient(135deg, #ff9a9e 0%, #fad0c4 100%)', colors: ['#ff9a9e', '#fad0c4'] },
  { name: 'Deep Space', value: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)', colors: ['#1a1a2e', '#16213e', '#0f3460'] },
  { name: 'Golden Hour', value: 'linear-gradient(135deg, #f7971e 0%, #ffd200 100%)', colors: ['#f7971e', '#ffd200'] },
  { name: 'Violet Dream', value: 'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)', colors: ['#a18cd1', '#fbc2eb'] },
  { name: 'Radial Glow', value: 'radial-gradient(circle at center, #667eea 0%, #0f0c29 100%)', colors: ['#667eea', '#0f0c29'] },
  { name: 'Spotlight', value: 'radial-gradient(circle at center, #ffffff 0%, #1a1a2e 70%)', colors: ['#ffffff', '#1a1a2e'] },
]

// Pattern presets for backgrounds
const PATTERN_PRESETS = [
  { name: 'Dots', value: 'radial-gradient(circle, #00000015 1px, transparent 1px)', size: '20px 20px', bg: '#ffffff' },
  { name: 'Grid', value: 'linear-gradient(#00000010 1px, transparent 1px), linear-gradient(90deg, #00000010 1px, transparent 1px)', size: '20px 20px', bg: '#ffffff' },
  { name: 'Diagonal Lines', value: 'repeating-linear-gradient(45deg, transparent, transparent 10px, #00000010 10px, #00000010 11px)', size: '100% 100%', bg: '#ffffff' },
  { name: 'Chevron', value: 'repeating-linear-gradient(45deg, #00000008 0, #00000008 25%, transparent 0, transparent 50%)', size: '40px 40px', bg: '#f8f8f8' },
  { name: 'Honeycomb', value: 'radial-gradient(circle farthest-side at 0% 50%, #00000008 23.5%, transparent 0) 21px 30px, radial-gradient(circle farthest-side at 0% 50%, #00000010 24%, transparent 0) 19px 30px', size: '42px 60px', bg: '#ffffff' },
  { name: 'Waves', value: 'repeating-radial-gradient(circle at 0 0, transparent 0, #00000008 10px), repeating-linear-gradient(#00000005, #00000005)', size: '100% 100%', bg: '#f0f0f0' },
  { name: 'Dark Dots', value: 'radial-gradient(circle, #ffffff15 1px, transparent 1px)', size: '20px 20px', bg: '#1a1a2e' },
  { name: 'Dark Grid', value: 'linear-gradient(#ffffff10 1px, transparent 1px), linear-gradient(90deg, #ffffff10 1px, transparent 1px)', size: '20px 20px', bg: '#1a1a2e' },
]

// Interactive Cover Canvas Component
function CoverCanvas({
  coverDims,
  project,
  onUpdateCover,
  showGuides,
  showBackGuides,
  showSpineGuides,
  showFrontGuides,
  zoom,
  mode = "all", // "all" shows everything, "separate" shows only separate parts, "full" shows only full cover
  selectedTextId,
  onSelectText,
  selectedShapeId,
  onSelectShape,
  getPanelSafeArea,
  analysisResult,
  showAnalysisOverlay,
}: {
  coverDims: CoverDimensions
  project: KDPProject
  onUpdateCover: (updates: Partial<KDPProject['cover']>) => void
  showGuides: boolean
  showBackGuides: boolean
  showSpineGuides: boolean
  showFrontGuides: boolean
  zoom: number
  mode?: "all" | "separate" | "full"
  selectedTextId?: string | null
  onSelectText?: (id: string | null) => void
  selectedShapeId?: string | null
  onSelectShape?: (id: string | null) => void
  getPanelSafeArea: (panel: 'front' | 'back' | 'spine', coverDims: CoverDimensions) => { x: number; y: number; width: number; height: number }
  analysisResult?: CoverAnalysisResult | null
  showAnalysisOverlay?: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [activeHandle, setActiveHandle] = useState<HandleType | null>(null)
  const [activePart, setActivePart] = useState<'front' | 'back' | 'spine' | 'full' | null>(null)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [initialPosition, setInitialPosition] = useState({ x: 0, y: 0 })
  const [initialScaleX, setInitialScaleX] = useState(1)
  const [initialScaleY, setInitialScaleY] = useState(1)
  
  // Text dragging state
  const [isDraggingText, setIsDraggingText] = useState(false)
  const [draggingTextId, setDraggingTextId] = useState<string | null>(null)
  const [textDragStart, setTextDragStart] = useState({ x: 0, y: 0 })
  const [textInitialPosition, setTextInitialPosition] = useState({ x: 0, y: 0 })
  const [isResizingText, setIsResizingText] = useState(false)
  const [resizingTextId, setResizingTextId] = useState<string | null>(null)
  const [textResizeHandle, setTextResizeHandle] = useState<'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | null>(null)
  const [textInitialWidth, setTextInitialWidth] = useState(0)
  const [textInitialFontSize, setTextInitialFontSize] = useState(0)
  const [textInitialHeight, setTextInitialHeight] = useState(0)
  const [editingTextId, setEditingTextId] = useState<string | null>(null)
  
  // Shape dragging/resizing state
  const [isDraggingShape, setIsDraggingShape] = useState(false)
  const [draggingShapeId, setDraggingShapeId] = useState<string | null>(null)
  const [shapeDragStart, setShapeDragStart] = useState({ x: 0, y: 0 })
  const [shapeInitialPosition, setShapeInitialPosition] = useState({ x: 0, y: 0 })
  const [isResizingShape, setIsResizingShape] = useState(false)
  const [resizingShapeId, setResizingShapeId] = useState<string | null>(null)
  const [shapeResizeHandle, setShapeResizeHandle] = useState<'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | null>(null)
  const [shapeInitialWidth, setShapeInitialWidth] = useState(0)
  const [shapeInitialHeight, setShapeInitialHeight] = useState(0)

  // Smart alignment guides state (Canva-style)
  const [alignmentGuides, setAlignmentGuides] = useState<{
    vertical: number[]
    horizontal: number[]
  }>({ vertical: [], horizontal: [] })
  const SNAP_THRESHOLD = 5 // pixels tolerance for snapping (in 300 DPI coordinates)

  const dpi = 72
  const scale = zoom

  const bleedPx = coverDims.bleed * dpi * scale
  const trimWidthPx = coverDims.trimWidth * dpi * scale
  const trimHeightPx = coverDims.trimHeight * dpi * scale
  const actualSpineWidthPx = coverDims.spineWidth * dpi * scale // Actual spine width for calculations
  const safeMarginPx = 0.125 * dpi * scale
  
  // Spine visual scaling - stretch to fill space between back and front cover safe zones
  // Back cover safe zone ends at: bleedPx + trimWidthPx - safeMarginPx
  // Front cover safe zone starts at: bleedPx + trimWidthPx + actualSpineWidthPx + safeMarginPx
  // So spine should fill the gap: from (trimWidthPx - safeMarginPx) to (trimWidthPx + actualSpineWidthPx + safeMarginPx)
  const spineWidthPx = (safeMarginPx * 2) + actualSpineWidthPx // Stretch to safety margins
  
  // Recalculate total dimensions with scaled spine
  const totalWidthPx = (bleedPx * 2) + (trimWidthPx * 2) + spineWidthPx
  const totalHeightPx = coverDims.totalHeight * dpi * scale

  // Get image for a part
  const getPartImage = (part: 'front' | 'back' | 'spine' | 'full'): KDPImage | undefined => {
    // In "separate" mode, don't show full cover image
    if (mode === "separate" && part === 'full') return undefined
    // In "full" mode, don't show separate parts
    if (mode === "full" && part !== 'full') return undefined
    
    if (part === 'full') return project.cover.fullCoverImage
    if (part === 'front') return project.cover.frontImage
    if (part === 'back') return project.cover.backImage
    if (part === 'spine') return project.cover.spineImage
    return undefined
  }

  // Get part dimensions and position
  const getPartBounds = (part: 'front' | 'back' | 'spine' | 'full') => {
    if (part === 'full') {
      return { x: 0, y: 0, width: totalWidthPx, height: totalHeightPx }
    }
    if (part === 'back') {
      return { x: bleedPx, y: bleedPx, width: trimWidthPx, height: trimHeightPx }
    }
    if (part === 'spine') {
      return { x: bleedPx + trimWidthPx, y: bleedPx, width: spineWidthPx, height: trimHeightPx }
    }
    if (part === 'front') {
      return { x: bleedPx + trimWidthPx + spineWidthPx, y: bleedPx, width: trimWidthPx, height: trimHeightPx }
    }
    return { x: 0, y: 0, width: 0, height: 0 }
  }

  // Calculate display dimensions for an image within a part (supports scaleX/scaleY)
  const getImageDisplay = (image: KDPImage, part: 'front' | 'back' | 'spine' | 'full') => {
    const bounds = getPartBounds(part)
    const partWidthDpi = part === 'full' ? coverDims.totalWidth * 300 : 
                    part === 'spine' ? coverDims.spineWidth * 300 :
                    coverDims.trimWidth * 300
    const partHeightDpi = part === 'full' ? coverDims.totalHeight * 300 :
                          coverDims.trimHeight * 300

    const effectiveScaleX = image.scaleX ?? image.scale
    const effectiveScaleY = image.scaleY ?? image.scale

    const displayScale = (bounds.width / partWidthDpi)
    const displayScaleY = (bounds.height / partHeightDpi)
    const scaledWidth = image.originalWidth * effectiveScaleX * displayScale
    const scaledHeight = image.originalHeight * effectiveScaleY * displayScaleY
    const x = bounds.x + (image.position.x / partWidthDpi) * bounds.width
    const y = bounds.y + (image.position.y / partHeightDpi) * bounds.height

    return { x, y, width: scaledWidth, height: scaledHeight }
  }

  // Mouse handlers
  const handleMouseDown = (e: React.MouseEvent, part: 'front' | 'back' | 'spine' | 'full', handle?: HandleType) => {
    e.preventDefault()
    e.stopPropagation()

    const image = getPartImage(part)
    if (!image) return

    setActivePart(part)
    setDragStart({ x: e.clientX, y: e.clientY })
    setInitialPosition({ x: image.position.x, y: image.position.y })
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
    if (!activePart) return
    const image = getPartImage(activePart)
    if (!image) return

    const deltaX = e.clientX - dragStart.x
    const deltaY = e.clientY - dragStart.y

    const bounds = getPartBounds(activePart)
    const partWidthDpi = activePart === 'full' ? coverDims.totalWidth * 300 : 
                    activePart === 'spine' ? coverDims.spineWidth * 300 :
                    coverDims.trimWidth * 300
    const partHeightDpi = activePart === 'full' ? coverDims.totalHeight * 300 :
                          coverDims.trimHeight * 300

    if (isDragging) {
      const scaleFactorX = partWidthDpi / bounds.width
      const scaleFactorY = partHeightDpi / bounds.height

      let newX = initialPosition.x + deltaX * scaleFactorX
      let newY = initialPosition.y + deltaY * scaleFactorY

      // No constraints - allow free positioning anywhere
      updatePartImage(activePart, { position: { x: newX, y: newY } })
    }

    if (isResizing && activeHandle) {
      const sensitivity = 0.002

      switch (activeHandle) {
        // Corner handles - proportional scaling
        case 'se':
        case 'nw':
        case 'ne':
        case 'sw': {
          let scaleDelta = 0
          if (activeHandle === 'se') scaleDelta = (deltaX + deltaY) * sensitivity
          else if (activeHandle === 'nw') scaleDelta = (-deltaX - deltaY) * sensitivity
          else if (activeHandle === 'ne') scaleDelta = (deltaX - deltaY) * sensitivity
          else if (activeHandle === 'sw') scaleDelta = (-deltaX + deltaY) * sensitivity
          
          const avgInitialScale = (initialScaleX + initialScaleY) / 2
          let newScale = Math.max(0.1, Math.min(10, avgInitialScale + scaleDelta))
          
          // No constraints - allow any scale
          updatePartImage(activePart, { scale: newScale, scaleX: newScale, scaleY: newScale })
          break
        }
        // Edge handles - stretch in the direction of the handle
        case 'e': {
          // Right edge: expand rightward
          const scaleXDelta = deltaX * sensitivity
          let newScaleX = Math.max(0.1, Math.min(10, initialScaleX + scaleXDelta))
          
          // No constraints - allow any scale
          updatePartImage(activePart, { scaleX: newScaleX })
          break
        }
        case 'w': {
          // Left edge: expand leftward (increase scaleX AND move position left)
          const image = getPartImage(activePart)
          if (!image) break
          const scaleXDelta = -deltaX * sensitivity
          let newScaleX = Math.max(0.1, Math.min(10, initialScaleX + scaleXDelta))
          
          // No constraints - allow any scale
          const widthChange = image.originalWidth * (newScaleX - initialScaleX)
          let newX = initialPosition.x - widthChange
          
          updatePartImage(activePart, { scaleX: newScaleX, position: { x: newX, y: image.position.y } })
          break
        }
        case 's': {
          // Bottom edge: expand downward
          const scaleYDelta = deltaY * sensitivity
          let newScaleY = Math.max(0.1, Math.min(10, initialScaleY + scaleYDelta))
          
          // No constraints - allow any scale
          updatePartImage(activePart, { scaleY: newScaleY })
          break
        }
        case 'n': {
          // Top edge: expand upward (increase scaleY AND move position up)
          const image = getPartImage(activePart)
          if (!image) break
          const scaleYDelta = -deltaY * sensitivity
          let newScaleY = Math.max(0.1, Math.min(10, initialScaleY + scaleYDelta))
          
          // No constraints - allow any scale
          const heightChange = image.originalHeight * (newScaleY - initialScaleY)
          let newY = initialPosition.y - heightChange
          
          updatePartImage(activePart, { scaleY: newScaleY, position: { x: image.position.x, y: newY } })
          break
        }
      }
    }
  }, [isDragging, isResizing, dragStart, initialPosition, initialScaleX, initialScaleY, activeHandle, activePart, coverDims])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
    setIsResizing(false)
    setActiveHandle(null)
    setActivePart(null)
  }, [])

  // Update a specific part's image
  const updatePartImage = (part: 'front' | 'back' | 'spine' | 'full', updates: Partial<KDPImage>) => {
    const currentImage = getPartImage(part)
    if (!currentImage) return

    const updatedImage = { ...currentImage, ...updates }
    
    if (part === 'full') {
      onUpdateCover({ fullCoverImage: updatedImage })
    } else if (part === 'front') {
      onUpdateCover({ frontImage: updatedImage })
    } else if (part === 'back') {
      onUpdateCover({ backImage: updatedImage })
    } else if (part === 'spine') {
      onUpdateCover({ spineImage: updatedImage })
    }
  }

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

  // Calculate smart alignment guides for an element being dragged (Canva-style)
  const calculateAlignmentGuides = useCallback((
    draggedElement: { x: number; y: number; width: number; height: number; coverPart: string },
    allElements: KDPCoverElement[]
  ) => {
    if (!coverDims) return { vertical: [], horizontal: [] }
    
    const guides: { vertical: number[]; horizontal: number[] } = { vertical: [], horizontal: [] }
    const dpi = 300
    
    // Get safe area for the current panel
    const safeArea = getPanelSafeArea(draggedElement.coverPart as 'front' | 'back' | 'spine', coverDims)
    
    // Element edges and center
    const elemLeft = draggedElement.x
    const elemRight = draggedElement.x + draggedElement.width
    const elemCenterX = draggedElement.x + draggedElement.width / 2
    const elemTop = draggedElement.y
    const elemBottom = draggedElement.y + draggedElement.height
    const elemCenterY = draggedElement.y + draggedElement.height / 2
    
    // Panel center guides
    const panelCenterX = safeArea.x + safeArea.width / 2
    const panelCenterY = safeArea.y + safeArea.height / 2
    
    // Check vertical alignment (X-axis)
    if (Math.abs(elemCenterX - panelCenterX) < SNAP_THRESHOLD) {
      guides.vertical.push(panelCenterX)
    }
    if (Math.abs(elemLeft - safeArea.x) < SNAP_THRESHOLD) {
      guides.vertical.push(safeArea.x)
    }
    if (Math.abs(elemRight - (safeArea.x + safeArea.width)) < SNAP_THRESHOLD) {
      guides.vertical.push(safeArea.x + safeArea.width)
    }
    
    // Check horizontal alignment (Y-axis)
    if (Math.abs(elemCenterY - panelCenterY) < SNAP_THRESHOLD) {
      guides.horizontal.push(panelCenterY)
    }
    if (Math.abs(elemTop - safeArea.y) < SNAP_THRESHOLD) {
      guides.horizontal.push(safeArea.y)
    }
    if (Math.abs(elemBottom - (safeArea.y + safeArea.height)) < SNAP_THRESHOLD) {
      guides.horizontal.push(safeArea.y + safeArea.height)
    }
    
    // Check alignment with other elements in the same panel
    const samePanel = allElements.filter(el => 
      el.type !== 'barcode' && 
      (el as any).coverPart === draggedElement.coverPart
    )
    
    for (const other of samePanel) {
      const otherEl = other as KDPTextElement | KDPShapeElement
      
      // Skip if it's the same element (compare by position to avoid ID issues)
      if (otherEl.position.x === draggedElement.x && otherEl.position.y === draggedElement.y) continue
      
      const otherLeft = otherEl.position.x
      const otherRight = otherEl.position.x + otherEl.width
      const otherCenterX = otherEl.position.x + otherEl.width / 2
      const otherTop = otherEl.position.y
      const otherBottom = otherEl.position.y + otherEl.height
      const otherCenterY = otherEl.position.y + otherEl.height / 2
      
      // Vertical guides (X-axis alignment)
      if (Math.abs(elemLeft - otherLeft) < SNAP_THRESHOLD) {
        guides.vertical.push(otherLeft)
      }
      if (Math.abs(elemRight - otherRight) < SNAP_THRESHOLD) {
        guides.vertical.push(otherRight)
      }
      if (Math.abs(elemCenterX - otherCenterX) < SNAP_THRESHOLD) {
        guides.vertical.push(otherCenterX)
      }
      
      // Horizontal guides (Y-axis alignment)
      if (Math.abs(elemTop - otherTop) < SNAP_THRESHOLD) {
        guides.horizontal.push(otherTop)
      }
      if (Math.abs(elemBottom - otherBottom) < SNAP_THRESHOLD) {
        guides.horizontal.push(otherBottom)
      }
      if (Math.abs(elemCenterY - otherCenterY) < SNAP_THRESHOLD) {
        guides.horizontal.push(otherCenterY)
      }
    }
    
    // Remove duplicates and return
    return {
      vertical: [...new Set(guides.vertical)],
      horizontal: [...new Set(guides.horizontal)]
    }
  }, [coverDims, getPanelSafeArea, SNAP_THRESHOLD])

  // Text drag handlers
  const handleTextMouseDown = (e: React.MouseEvent, textElement: KDPTextElement) => {
    if (textElement.locked) return
    
    e.preventDefault()
    e.stopPropagation()

    setIsDraggingText(true)
    setDraggingTextId(textElement.id)
    setTextDragStart({ x: e.clientX, y: e.clientY })
    setTextInitialPosition({ x: textElement.position.x, y: textElement.position.y })
    
    if (onSelectText) {
      onSelectText(textElement.id)
    }
  }

  const handleTextMouseMove = useCallback((e: MouseEvent) => {
    if (!isDraggingText || !draggingTextId) return
    
    const textElement = project.cover.elements?.find(el => el.id === draggingTextId && el.type === 'text') as KDPTextElement | undefined
    if (!textElement || !textElement.coverPart) return

    const deltaX = e.clientX - textDragStart.x
    const deltaY = e.clientY - textDragStart.y

    // Convert pixel deltas to DPI coordinates (300 DPI for calculations)
    const scaleFactorX = 300 / (72 * scale)
    const scaleFactorY = 300 / (72 * scale)

    let newX = textInitialPosition.x + deltaX * scaleFactorX
    let newY = textInitialPosition.y + deltaY * scaleFactorY

    // No constraints - allow free positioning anywhere

    // Calculate alignment guides (Canva-style)
    const draggedBounds = {
      x: newX,
      y: newY,
      width: textElement.width,
      height: textElement.height,
      coverPart: textElement.coverPart
    }
    const guides = calculateAlignmentGuides(draggedBounds, project.cover.elements || [])
    setAlignmentGuides(guides)

    // Update text element position (no dimension clamping)
    const updatedElements = (project.cover.elements || []).map(el => {
      if (el.id === draggingTextId && el.type === 'text') {
        return { ...el, position: { x: newX, y: newY } }
      }
      return el
    })
    
    onUpdateCover({ elements: updatedElements })
  }, [isDraggingText, draggingTextId, textDragStart, textInitialPosition, project.cover.elements, onUpdateCover, coverDims, scale, calculateAlignmentGuides])

  const handleTextMouseUp = useCallback(() => {
    setIsDraggingText(false)
    setDraggingTextId(null)
    setAlignmentGuides({ vertical: [], horizontal: [] }) // Clear guides
  }, [])

  const handleTextResizeStart = (e: React.MouseEvent, textEl: KDPTextElement, handle: 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw') => {
    e.preventDefault()
    e.stopPropagation()
    setIsResizingText(true)
    setResizingTextId(textEl.id)
    setTextResizeHandle(handle)
    setTextDragStart({ x: e.clientX, y: e.clientY })
    setTextInitialWidth(textEl.width)
    setTextInitialFontSize(textEl.style.fontSize)
    setTextInitialHeight(textEl.height)
    setTextInitialPosition({ x: textEl.position.x, y: textEl.position.y })
    if (onSelectText) onSelectText(textEl.id)
  }

  const handleTextResizeMove = useCallback((e: MouseEvent) => {
    if (!isResizingText || !resizingTextId || !textResizeHandle || !coverDims) return
    const textEl = project.cover.elements?.find(el => el.id === resizingTextId && el.type === 'text') as KDPTextElement | undefined
    if (!textEl || !textEl.coverPart) return
    
    const deltaX = e.clientX - textDragStart.x
    const deltaY = e.clientY - textDragStart.y
    const scaleFactor = 300 / (72 * scale)
    
    // Calculate safe area bounds for the text's assigned panel
    const dpi = 300
    const safeMargin = 0.125 * dpi
    const trimW = coverDims.trimWidth * dpi
    const trimH = coverDims.trimHeight * dpi
    const spineW = coverDims.spineWidth * dpi
    
    const bounds = {
      back:  { x: safeMargin, y: safeMargin, width: trimW - safeMargin * 2, height: trimH - safeMargin * 2 },
      spine: { x: trimW + safeMargin/2, y: safeMargin, width: spineW - safeMargin, height: trimH - safeMargin * 2 },
      front: { x: trimW + spineW + safeMargin, y: safeMargin, width: trimW - safeMargin * 2, height: trimH - safeMargin * 2 },
    }
    
    const safeArea = bounds[textEl.coverPart]
    
    let newWidth = textEl.width
    let newX = textEl.position.x
    let newY = textEl.position.y
    
    // Handle horizontal resize
    if (['e', 'ne', 'se'].includes(textResizeHandle)) {
      // Right edge: increase width, position stays
      newWidth = Math.max(50, textInitialWidth + deltaX * scaleFactor)
      const maxWidth = safeArea.x + safeArea.width - textEl.position.x
      newWidth = Math.min(newWidth, maxWidth)
    }
    
    if (['w', 'nw', 'sw'].includes(textResizeHandle)) {
      // Left edge: decrease width, shift position right
      const widthDelta = deltaX * scaleFactor
      newWidth = Math.max(50, textInitialWidth - widthDelta)
      newX = textInitialPosition.x + widthDelta
      // Clamp position to not go past safe area left edge
      if (newX < safeArea.x) {
        newX = safeArea.x
        newWidth = textInitialPosition.x + textInitialWidth - safeArea.x
      }
    }
    
    // Handle vertical position (north handles)
    if (['n', 'nw', 'ne'].includes(textResizeHandle)) {
      newY = textInitialPosition.y + deltaY * scaleFactor
      newY = Math.max(safeArea.y, newY)
    }
    
    // Handle south handles (just reposition)
    if (['s', 'sw', 'se'].includes(textResizeHandle) && textResizeHandle !== 'se') {
      newY = textInitialPosition.y + deltaY * scaleFactor
      const maxY = safeArea.y + safeArea.height
      newY = Math.min(newY, maxY)
    }
    
    // SE corner still controls font size
    let newFontSize = textInitialFontSize
    if (textResizeHandle === 'se') {
      newFontSize = Math.max(8, Math.min(200, textInitialFontSize + deltaY * 0.5))
    }
    
    const updatedElements = (project.cover.elements || []).map(el => {
      if (el.id === resizingTextId && el.type === 'text') {
        return {
          ...el,
          position: { x: newX, y: newY },
          width: newWidth,
          style: { ...(el as KDPTextElement).style, fontSize: newFontSize }
        }
      }
      return el
    })
    onUpdateCover({ elements: updatedElements })
  }, [isResizingText, resizingTextId, textResizeHandle, textDragStart, textInitialWidth, textInitialFontSize, textInitialPosition, project.cover.elements, onUpdateCover, scale, coverDims])

  const handleTextResizeEnd = useCallback(() => {
    setIsResizingText(false)
    setResizingTextId(null)
    setTextResizeHandle(null)
  }, [])

  useEffect(() => {
    if (isResizingText) {
      window.addEventListener('mousemove', handleTextResizeMove)
      window.addEventListener('mouseup', handleTextResizeEnd)
      return () => {
        window.removeEventListener('mousemove', handleTextResizeMove)
        window.removeEventListener('mouseup', handleTextResizeEnd)
      }
    }
  }, [isResizingText, handleTextResizeMove, handleTextResizeEnd])

  // Add global mouse event listeners for text dragging
  useEffect(() => {
    if (isDraggingText) {
      window.addEventListener('mousemove', handleTextMouseMove)
      window.addEventListener('mouseup', handleTextMouseUp)

      return () => {
        window.removeEventListener('mousemove', handleTextMouseMove)
        window.removeEventListener('mouseup', handleTextMouseUp)
      }
    }
  }, [isDraggingText, handleTextMouseMove, handleTextMouseUp])

  // Shape dragging handlers
  const handleShapeMouseDown = (e: React.MouseEvent, shapeEl: KDPShapeElement) => {
    if (shapeEl.locked) return
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingShape(true)
    setDraggingShapeId(shapeEl.id)
    setShapeDragStart({ x: e.clientX, y: e.clientY })
    setShapeInitialPosition({ x: shapeEl.position.x, y: shapeEl.position.y })
    if (onSelectShape) onSelectShape(shapeEl.id)
  }

  const handleShapeMouseMove = useCallback((e: MouseEvent) => {
    if (!isDraggingShape || !draggingShapeId || !coverDims) return
    const shapeEl = project.cover.elements?.find(el => el.id === draggingShapeId && el.type === 'shape') as KDPShapeElement | undefined
    if (!shapeEl || !shapeEl.coverPart) return
    
    const deltaX = e.clientX - shapeDragStart.x
    const deltaY = e.clientY - shapeDragStart.y
    const scaleFactor = 300 / (72 * scale)
    
    const newX = shapeInitialPosition.x + deltaX * scaleFactor
    const newY = shapeInitialPosition.y + deltaY * scaleFactor
    
    // Apply safe zone constraints
    const dpi = 300
    const safeMargin = 0.125 * dpi
    const trimW = coverDims.trimWidth * dpi
    const trimH = coverDims.trimHeight * dpi
    const spineW = coverDims.spineWidth * dpi
    
    const bounds = {
      back:  { x: safeMargin, y: safeMargin, width: trimW - safeMargin * 2, height: trimH - safeMargin * 2 },
      spine: { x: trimW + safeMargin/2, y: safeMargin, width: spineW - safeMargin, height: trimH - safeMargin * 2 },
      front: { x: trimW + spineW + safeMargin, y: safeMargin, width: trimW - safeMargin * 2, height: trimH - safeMargin * 2 },
    }
    
    const panelBounds = bounds[shapeEl.coverPart]
    const clampedX = Math.max(panelBounds.x, Math.min(newX, panelBounds.x + panelBounds.width - shapeEl.width))
    const clampedY = Math.max(panelBounds.y, Math.min(newY, panelBounds.y + panelBounds.height - shapeEl.height))
    
    // Calculate alignment guides (Canva-style)
    const draggedBounds = {
      x: clampedX,
      y: clampedY,
      width: shapeEl.width,
      height: shapeEl.height,
      coverPart: shapeEl.coverPart
    }
    const guides = calculateAlignmentGuides(draggedBounds, project.cover.elements || [])
    setAlignmentGuides(guides)
    
    const updatedElements = (project.cover.elements || []).map(el => {
      if (el.id === draggingShapeId && el.type === 'shape') {
        return { ...el, position: { x: clampedX, y: clampedY } }
      }
      return el
    })
    
    onUpdateCover({ elements: updatedElements })
  }, [isDraggingShape, draggingShapeId, shapeDragStart, shapeInitialPosition, project.cover.elements, onUpdateCover, coverDims, scale, calculateAlignmentGuides])

  const handleShapeMouseUp = useCallback(() => {
    setIsDraggingShape(false)
    setDraggingShapeId(null)
    setAlignmentGuides({ vertical: [], horizontal: [] }) // Clear guides
  }, [])

  // Shape resizing handlers
  const handleShapeResizeStart = (e: React.MouseEvent, shapeEl: KDPShapeElement, handle: 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw') => {
    e.preventDefault()
    e.stopPropagation()
    setIsResizingShape(true)
    setResizingShapeId(shapeEl.id)
    setShapeResizeHandle(handle)
    setShapeDragStart({ x: e.clientX, y: e.clientY })
    setShapeInitialWidth(shapeEl.width)
    setShapeInitialHeight(shapeEl.height)
    setShapeInitialPosition({ x: shapeEl.position.x, y: shapeEl.position.y })
    if (onSelectShape) onSelectShape(shapeEl.id)
  }

  const handleShapeResizeMove = useCallback((e: MouseEvent) => {
    if (!isResizingShape || !resizingShapeId || !shapeResizeHandle) return
    const shapeEl = project.cover.elements?.find(el => el.id === resizingShapeId && el.type === 'shape') as KDPShapeElement | undefined
    if (!shapeEl) return
    
    const deltaX = e.clientX - shapeDragStart.x
    const deltaY = e.clientY - shapeDragStart.y
    const scaleFactor = 300 / (72 * scale)
    
    let newWidth = shapeInitialWidth
    let newHeight = shapeInitialHeight
    let newX = shapeInitialPosition.x
    let newY = shapeInitialPosition.y
    
    switch (shapeResizeHandle) {
      case 'e':
        newWidth = Math.max(20, shapeInitialWidth + deltaX * scaleFactor)
        break
      case 'w':
        newWidth = Math.max(20, shapeInitialWidth - deltaX * scaleFactor)
        newX = shapeInitialPosition.x + (shapeInitialWidth - newWidth)
        break
      case 's':
        newHeight = Math.max(20, shapeInitialHeight + deltaY * scaleFactor)
        break
      case 'n':
        newHeight = Math.max(20, shapeInitialHeight - deltaY * scaleFactor)
        newY = shapeInitialPosition.y + (shapeInitialHeight - newHeight)
        break
      case 'se':
        newWidth = Math.max(20, shapeInitialWidth + deltaX * scaleFactor)
        newHeight = Math.max(20, shapeInitialHeight + deltaY * scaleFactor)
        break
      case 'sw':
        newWidth = Math.max(20, shapeInitialWidth - deltaX * scaleFactor)
        newX = shapeInitialPosition.x + (shapeInitialWidth - newWidth)
        newHeight = Math.max(20, shapeInitialHeight + deltaY * scaleFactor)
        break
      case 'ne':
        newWidth = Math.max(20, shapeInitialWidth + deltaX * scaleFactor)
        newHeight = Math.max(20, shapeInitialHeight - deltaY * scaleFactor)
        newY = shapeInitialPosition.y + (shapeInitialHeight - newHeight)
        break
      case 'nw':
        newWidth = Math.max(20, shapeInitialWidth - deltaX * scaleFactor)
        newX = shapeInitialPosition.x + (shapeInitialWidth - newWidth)
        newHeight = Math.max(20, shapeInitialHeight - deltaY * scaleFactor)
        newY = shapeInitialPosition.y + (shapeInitialHeight - newHeight)
        break
    }
    
    const updatedElements = (project.cover.elements || []).map(el => {
      if (el.id === resizingShapeId && el.type === 'shape') {
        return { ...el, width: newWidth, height: newHeight, position: { x: newX, y: newY } }
      }
      return el
    })
    onUpdateCover({ elements: updatedElements })
  }, [isResizingShape, resizingShapeId, shapeResizeHandle, shapeDragStart, shapeInitialWidth, shapeInitialHeight, shapeInitialPosition, project.cover.elements, onUpdateCover, scale])

  const handleShapeResizeEnd = useCallback(() => {
    setIsResizingShape(false)
    setResizingShapeId(null)
    setShapeResizeHandle(null)
  }, [])

  // Add global mouse event listeners for shape resizing
  useEffect(() => {
    if (isResizingShape) {
      window.addEventListener('mousemove', handleShapeResizeMove)
      window.addEventListener('mouseup', handleShapeResizeEnd)
      return () => {
        window.removeEventListener('mousemove', handleShapeResizeMove)
        window.removeEventListener('mouseup', handleShapeResizeEnd)
      }
    }
  }, [isResizingShape, handleShapeResizeMove, handleShapeResizeEnd])

  // Add global mouse event listeners for shape dragging
  useEffect(() => {
    if (isDraggingShape) {
      window.addEventListener('mousemove', handleShapeMouseMove)
      window.addEventListener('mouseup', handleShapeMouseUp)

      return () => {
        window.removeEventListener('mousemove', handleShapeMouseMove)
        window.removeEventListener('mouseup', handleShapeMouseUp)
      }
    }
  }, [isDraggingShape, handleShapeMouseMove, handleShapeMouseUp])

  // Render resize handles for an image
  const renderHandles = (part: 'front' | 'back' | 'spine' | 'full') => {
    const handleSize = 14
    const edgeHandleWidth = 8
    const edgeHandleLength = 20

    const handles: { type: HandleType; style: React.CSSProperties; cursor: string; isEdge: boolean }[] = [
      // Corners (proportional)
      { type: 'nw', style: { left: -handleSize/2, top: -handleSize/2 }, cursor: 'nw-resize', isEdge: false },
      { type: 'ne', style: { right: -handleSize/2, top: -handleSize/2 }, cursor: 'ne-resize', isEdge: false },
      { type: 'sw', style: { left: -handleSize/2, bottom: -handleSize/2 }, cursor: 'sw-resize', isEdge: false },
      { type: 'se', style: { right: -handleSize/2, bottom: -handleSize/2 }, cursor: 'se-resize', isEdge: false },
      // Edges (stretch)
      { type: 'n', style: { left: '50%', top: -edgeHandleWidth/2, transform: 'translateX(-50%)' }, cursor: 'n-resize', isEdge: true },
      { type: 's', style: { left: '50%', bottom: -edgeHandleWidth/2, transform: 'translateX(-50%)' }, cursor: 's-resize', isEdge: true },
      { type: 'e', style: { right: -edgeHandleWidth/2, top: '50%', transform: 'translateY(-50%)' }, cursor: 'e-resize', isEdge: true },
      { type: 'w', style: { left: -edgeHandleWidth/2, top: '50%', transform: 'translateY(-50%)' }, cursor: 'w-resize', isEdge: true },
    ]

    return handles.map(({ type, style, cursor, isEdge }) => {
      const isHorizontalEdge = type === 'n' || type === 's'
      const isVerticalEdge = type === 'e' || type === 'w'

      return (
        <div
          key={type}
          className={cn(
            "absolute z-20 transition-transform hover:scale-110",
            isEdge 
              ? "bg-orange-500 rounded-sm" 
              : "rounded-full bg-gradient-to-br from-blue-400 to-blue-600",
            "border-2 border-white shadow-lg"
          )}
          style={{
            ...style,
            width: isEdge ? (isHorizontalEdge ? edgeHandleLength : edgeHandleWidth) : handleSize,
            height: isEdge ? (isVerticalEdge ? edgeHandleLength : edgeHandleWidth) : handleSize,
            cursor,
            boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
          }}
          onMouseDown={(e) => handleMouseDown(e, part, type)}
          title={isEdge ? (isHorizontalEdge ? 'Stretch vertically' : 'Stretch horizontally') : 'Resize proportionally'}
        />
      )
    })
  }

  // Render a cover part with its image
  const renderPart = (part: 'front' | 'back' | 'spine' | 'full') => {
    const image = getPartImage(part)
    if (!image) return null

    const display = getImageDisplay(image, part)
    const isSelected = activePart === part

    return (
      <div
        key={part}
        className={cn(
          "absolute cursor-grab group",
          isDragging && isSelected && "cursor-grabbing"
        )}
        style={{
          left: display.x,
          top: display.y,
          width: display.width,
          height: display.height,
        }}
        onMouseDown={(e) => handleMouseDown(e, part)}
      >
        <img
          src={image.src}
          alt={`${part} cover`}
          className="w-full h-full object-fill pointer-events-none"
          draggable={false}
        />

        {/* Selection border */}
        <div className={cn(
          "absolute inset-0 border-2 transition-all",
          isSelected
            ? "border-blue-500 border-solid"
            : "border-transparent group-hover:border-blue-300/50 border-dashed"
        )} />

        {/* Resize handles */}
        {(isSelected || (!isDragging && !isResizing)) && (
          <div className={cn("opacity-0 group-hover:opacity-100 transition-opacity", isSelected && "opacity-100")}>
            {renderHandles(part)}
          </div>
        )}

        {/* Move indicator */}
        {isSelected && !isDragging && !isResizing && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-40 pointer-events-none">
            <Move className="w-6 h-6 text-blue-500 drop-shadow-lg" />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex justify-center">
      <div
        ref={containerRef}
        className={cn(
          "relative bg-white border-2 shadow-xl select-none overflow-hidden",
          (isDragging || isResizing) ? "cursor-grabbing" : "border-[var(--color-border)]"
        )}
        style={{
          width: totalWidthPx,
          height: totalHeightPx,
        }}
        onClick={(e) => {
          // Deselect all elements when clicking on canvas background
          // Check if the click target doesn't have the data-element attribute
          const target = e.target as HTMLElement
          if (!target.closest('[data-element="text"]') && !target.closest('[data-element="shape"]')) {
            if (onSelectText) onSelectText(null)
            if (onSelectShape) onSelectShape(null)
          }
        }}
      >
        {/* Background grid pattern */}
        <div 
          className="absolute inset-0 opacity-5"
          style={{
            backgroundImage: 'linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
        />

        {/* Panel background colors (before images) */}
        {mode === "separate" && project.cover.panelBackgrounds && (
          <>
            {/* Back panel background */}
            {project.cover.panelBackgrounds.back && (
              <div 
                className="absolute" 
                style={{
                  // Back: extend to left bleed edge (0) and add left bleed to width
                  left: project.cover.backgroundFitMode?.back === 'bleed' ? 0 : bleedPx,
                  top: project.cover.backgroundFitMode?.back === 'bleed' ? 0 : bleedPx,
                  width: project.cover.backgroundFitMode?.back === 'bleed' ? trimWidthPx + bleedPx : trimWidthPx,
                  height: project.cover.backgroundFitMode?.back === 'bleed' ? trimHeightPx + (2 * bleedPx) : trimHeightPx,
                  ...(project.cover.panelBackgrounds.back.startsWith('pattern|') 
                    ? (() => {
                        const parts = project.cover.panelBackgrounds.back.split('|')
                        return {
                          backgroundImage: parts[1],
                          backgroundColor: parts[3],
                          backgroundSize: parts[2],
                        }
                      })()
                    : project.cover.panelBackgrounds.back.includes('gradient') || project.cover.panelBackgrounds.back.includes('url(')
                    ? { backgroundImage: project.cover.panelBackgrounds.back, backgroundSize: 'cover', backgroundPosition: 'center' }
                    : { backgroundColor: project.cover.panelBackgrounds.back }
                  )
                }} 
              />
            )}
            {/* Spine panel background */}
            {project.cover.panelBackgrounds.spine && (
              <div 
                className="absolute" 
                style={{
                  // Spine position: after back panel (trim or with bleed)
                  left: bleedPx + trimWidthPx, 
                  top: project.cover.backgroundFitMode?.spine === 'bleed' ? 0 : bleedPx,
                  width: spineWidthPx,
                  height: project.cover.backgroundFitMode?.spine === 'bleed' ? trimHeightPx + (2 * bleedPx) : trimHeightPx,
                  border: project.cover.backgroundFitMode?.spine === 'bleed' ? '2px solid lime' : '2px solid orange',  // Debug border
                  ...(project.cover.panelBackgrounds.spine.startsWith('pattern|') 
                    ? (() => {
                        const parts = project.cover.panelBackgrounds.spine.split('|')
                        return {
                          backgroundImage: parts[1],
                          backgroundColor: parts[3],
                          backgroundSize: parts[2],
                        }
                      })()
                    : project.cover.panelBackgrounds.spine.includes('gradient') || project.cover.panelBackgrounds.spine.includes('url(')
                    ? { 
                        backgroundImage: project.cover.panelBackgrounds.spine, 
                        backgroundSize: '100% 100%',  // Force to fill entire div
                        backgroundPosition: 'center',
                        backgroundRepeat: 'no-repeat'
                      }
                    : { backgroundColor: project.cover.panelBackgrounds.spine }
                  )
                }} 
              />
            )}
            {/* Front panel background */}
            {project.cover.panelBackgrounds.front && (
              <div 
                className="absolute" 
                style={{
                  // Front: stay at normal left position, add right bleed to width
                  left: bleedPx + trimWidthPx + spineWidthPx,
                  top: project.cover.backgroundFitMode?.front === 'bleed' ? 0 : bleedPx,
                  width: project.cover.backgroundFitMode?.front === 'bleed' ? trimWidthPx + bleedPx : trimWidthPx,
                  height: project.cover.backgroundFitMode?.front === 'bleed' ? trimHeightPx + (2 * bleedPx) : trimHeightPx,
                  ...(project.cover.panelBackgrounds.front.startsWith('pattern|') 
                    ? (() => {
                        const parts = project.cover.panelBackgrounds.front.split('|')
                        return {
                          backgroundImage: parts[1],
                          backgroundColor: parts[3],
                          backgroundSize: parts[2],
                        }
                      })()
                    : project.cover.panelBackgrounds.front.includes('gradient') || project.cover.panelBackgrounds.front.includes('url(')
                    ? { backgroundImage: project.cover.panelBackgrounds.front, backgroundSize: 'cover', backgroundPosition: 'center' }
                    : { backgroundColor: project.cover.panelBackgrounds.front }
                  )
                }} 
              />
            )}
          </>
        )}

        {/* Full cover mode - Global background */}
        {mode === "full" && (
          <>
            {/* Render global background if set */}
            {project.cover.backgroundColor && project.cover.backgroundColor !== '#ffffff' && (
              <div 
                className="absolute" 
                style={{
                  // In bleed mode, fill entire canvas; otherwise fill trim area only
                  left: project.cover.backgroundFitMode?.full === 'bleed' ? 0 : bleedPx,
                  top: project.cover.backgroundFitMode?.full === 'bleed' ? 0 : bleedPx,
                  width: project.cover.backgroundFitMode?.full === 'bleed' ? totalWidthPx : totalWidthPx - (2 * bleedPx),
                  height: project.cover.backgroundFitMode?.full === 'bleed' ? totalHeightPx : totalHeightPx - (2 * bleedPx),
                  ...(project.cover.backgroundColor.startsWith('pattern|') 
                    ? (() => {
                        const parts = project.cover.backgroundColor.split('|')
                        return {
                          backgroundImage: parts[1],
                          backgroundColor: parts[3],
                          backgroundSize: parts[2],
                        }
                      })()
                    : project.cover.backgroundColor.includes('gradient') || project.cover.backgroundColor.includes('url(')
                    ? { backgroundImage: project.cover.backgroundColor, backgroundSize: 'cover', backgroundPosition: 'center' }
                    : { backgroundColor: project.cover.backgroundColor }
                  )
                }} 
              />
            )}
            
            {/* Also render panel backgrounds if they exist (for when transitioning from separate to full) */}
            {project.cover.panelBackgrounds && (
              <>
                {/* Back panel background */}
                {project.cover.panelBackgrounds.back && (
                  <div 
                    className="absolute" 
                    style={{
                      left: project.cover.backgroundFitMode?.full === 'bleed' ? 0 : bleedPx,
                      top: project.cover.backgroundFitMode?.full === 'bleed' ? 0 : bleedPx,
                      width: project.cover.backgroundFitMode?.full === 'bleed' ? trimWidthPx + bleedPx : trimWidthPx,
                      height: project.cover.backgroundFitMode?.full === 'bleed' ? trimHeightPx + (2 * bleedPx) : trimHeightPx,
                      ...(project.cover.panelBackgrounds.back.startsWith('pattern|') 
                        ? (() => {
                            const parts = project.cover.panelBackgrounds.back.split('|')
                            return {
                              backgroundImage: parts[1],
                              backgroundColor: parts[3],
                              backgroundSize: parts[2],
                            }
                          })()
                        : project.cover.panelBackgrounds.back.includes('gradient') || project.cover.panelBackgrounds.back.includes('url(')
                        ? { backgroundImage: project.cover.panelBackgrounds.back, backgroundSize: 'cover', backgroundPosition: 'center' }
                        : { backgroundColor: project.cover.panelBackgrounds.back }
                      )
                    }} 
                  />
                )}
                {/* Spine panel background */}
                {project.cover.panelBackgrounds.spine && (
                  <div 
                    className="absolute" 
                    style={{
                      left: bleedPx + trimWidthPx, 
                      top: project.cover.backgroundFitMode?.full === 'bleed' ? 0 : bleedPx,
                      width: spineWidthPx,
                      height: project.cover.backgroundFitMode?.full === 'bleed' ? trimHeightPx + (2 * bleedPx) : trimHeightPx,
                      ...(project.cover.panelBackgrounds.spine.startsWith('pattern|') 
                        ? (() => {
                            const parts = project.cover.panelBackgrounds.spine.split('|')
                            return {
                              backgroundImage: parts[1],
                              backgroundColor: parts[3],
                              backgroundSize: parts[2],
                            }
                          })()
                        : project.cover.panelBackgrounds.spine.includes('gradient') || project.cover.panelBackgrounds.spine.includes('url(')
                        ? { 
                            backgroundImage: project.cover.panelBackgrounds.spine, 
                            backgroundSize: '100% 100%',  // Force to fill entire div
                            backgroundPosition: 'center',
                            backgroundRepeat: 'no-repeat'
                          }
                        : { backgroundColor: project.cover.panelBackgrounds.spine }
                      )
                    }} 
                  />
                )}
                {/* Front panel background */}
                {project.cover.panelBackgrounds.front && (
                  <div 
                    className="absolute" 
                    style={{
                      left: bleedPx + trimWidthPx + spineWidthPx,
                      top: project.cover.backgroundFitMode?.full === 'bleed' ? 0 : bleedPx,
                      width: project.cover.backgroundFitMode?.full === 'bleed' ? trimWidthPx + bleedPx : trimWidthPx,
                      height: project.cover.backgroundFitMode?.full === 'bleed' ? trimHeightPx + (2 * bleedPx) : trimHeightPx,
                      ...(project.cover.panelBackgrounds.front.startsWith('pattern|') 
                        ? (() => {
                            const parts = project.cover.panelBackgrounds.front.split('|')
                            return {
                              backgroundImage: parts[1],
                              backgroundColor: parts[3],
                              backgroundSize: parts[2],
                            }
                          })()
                        : project.cover.panelBackgrounds.front.includes('gradient') || project.cover.panelBackgrounds.front.includes('url(')
                        ? { backgroundImage: project.cover.panelBackgrounds.front, backgroundSize: 'cover', backgroundPosition: 'center' }
                        : { backgroundColor: project.cover.panelBackgrounds.front }
                      )
                    }} 
                  />
                )}
              </>
            )}
          </>
        )}

        {/* Bleed area tint */}
        {showGuides && (
          <>
            {/* Top bleed - MORE VISIBLE */}
            <div className="absolute left-0 right-0 top-0 bg-red-500/30" style={{ height: bleedPx }} />
            {/* Bottom bleed */}
            <div className="absolute left-0 right-0 bottom-0 bg-red-500/30" style={{ height: bleedPx }} />
            {/* Left bleed */}
            <div className="absolute left-0 top-0 bottom-0 bg-red-500/30" style={{ width: bleedPx }} />
            {/* Right bleed */}
            <div className="absolute right-0 top-0 bottom-0 bg-red-500/30" style={{ width: bleedPx }} />
          </>
        )}

        {/* Render images based on mode */}
        {project.cover.fullCoverImage ? (
          renderPart('full')
        ) : (
          <>
            {project.cover.backImage && renderPart('back')}
            {project.cover.spineImage && renderPart('spine')}
            {project.cover.frontImage && renderPart('front')}
          </>
        )}

        {/* Render spine text if exists (in separate mode only) */}
        {!project.cover.fullCoverImage && project.cover.spineText && mode === "separate" && (
          <div
            className="absolute pointer-events-none flex items-center justify-center"
            style={{
              left: bleedPx + trimWidthPx,
              top: bleedPx,
              width: spineWidthPx,
              height: trimHeightPx,
            }}
          >
            <div
              className="text-black font-sans whitespace-nowrap select-none"
              style={{
                fontSize: `${(project.cover.spineTextStyle?.fontSize || 14) * (dpi / 300) * scale}px`,
                color: project.cover.spineTextStyle?.color || '#000000',
                transform: (() => {
                  const rotation = project.cover.spineTextStyle?.rotation || 'vertical-down'
                  if (rotation === 'horizontal') return 'rotate(0deg)'
                  if (rotation === 'vertical-up') return 'rotate(90deg)'
                  return 'rotate(-90deg)' // vertical-down (default)
                })(),
                transformOrigin: 'center center',
              }}
            >
              {project.cover.spineText}
            </div>
          </div>
        )}

        {/* Guide overlays - Clear and Visible */}
        {showGuides && (
          <>
            {/* Safe zones - MORE VISIBLE */}
            {/* Back cover safe zone */}
            {showBackGuides && (
              <div
                className="absolute pointer-events-none"
                style={{
                  left: bleedPx + safeMarginPx,
                  top: bleedPx + safeMarginPx,
                  width: trimWidthPx - safeMarginPx * 2,
                  height: trimHeightPx - safeMarginPx * 2,
                  border: '2px dashed rgba(34, 197, 94, 0.7)',
                }}
              >
                <div className="absolute -top-5 left-2 text-[10px] font-semibold text-green-600 bg-white/95 px-2 py-0.5 rounded shadow-sm">
                  Back Safe Zone
                </div>
              </div>
            )}

            {/* Front cover safe zone */}
            {showFrontGuides && (
              <div
                className="absolute pointer-events-none"
                style={{
                  left: bleedPx + trimWidthPx + spineWidthPx + safeMarginPx,
                  top: bleedPx + safeMarginPx,
                  width: trimWidthPx - safeMarginPx * 2,
                  height: trimHeightPx - safeMarginPx * 2,
                  border: '2px dashed rgba(34, 197, 94, 0.7)',
                }}
              >
                <div className="absolute -top-5 right-2 text-[10px] font-semibold text-green-600 bg-white/95 px-2 py-0.5 rounded shadow-sm">
                  Front Safe Zone
                </div>
              </div>
            )}

            {/* Spine safe zone */}
            {showSpineGuides && spineWidthPx > safeMarginPx * 2 && (
              <div
                className="absolute pointer-events-none"
                style={{
                  left: bleedPx + trimWidthPx + safeMarginPx / 2,
                  top: bleedPx + safeMarginPx,
                  width: spineWidthPx - safeMarginPx,
                  height: trimHeightPx - safeMarginPx * 2,
                  border: '2px dashed rgba(34, 197, 94, 0.6)',
                }}
              >
                <div className="absolute top-2 left-1/2 -translate-x-1/2 text-[9px] font-semibold text-green-600 bg-white/95 px-1.5 py-0.5 rounded shadow-sm">
                  Spine Safe
                </div>
              </div>
            )}

            {/* Trim line - MORE VISIBLE */}
            <div
              className="absolute pointer-events-none"
              style={{
                left: bleedPx,
                top: bleedPx,
                width: totalWidthPx - bleedPx * 2,
                height: totalHeightPx - bleedPx * 2,
                border: '2px solid rgba(239, 68, 68, 0.8)',
              }}
            >
              <div className="absolute -top-6 left-4 text-[10px] font-semibold text-red-600 bg-white/95 px-2 py-0.5 rounded shadow-sm">
                Trim Line
              </div>
            </div>

            {/* Spine divider lines - MORE VISIBLE */}
            {showSpineGuides && (
              <>
                <div
                  className="absolute pointer-events-none"
                  style={{
                    left: bleedPx + trimWidthPx - 1,
                    top: bleedPx,
                    width: 2,
                    height: trimHeightPx,
                    background: 'rgba(59, 130, 246, 0.7)',
                  }}
                />
                <div
                  className="absolute pointer-events-none"
                  style={{
                    left: bleedPx + trimWidthPx + spineWidthPx - 1,
                    top: bleedPx,
                    width: 2,
                    height: trimHeightPx,
                    background: 'rgba(59, 130, 246, 0.7)',
                  }}
                />
              </>
            )}

            {/* Panel Labels - MORE VISIBLE */}
            {showBackGuides && (
              <div
                className="absolute pointer-events-none text-[11px] font-bold text-black/40 bg-white/80 px-2 py-1 rounded shadow-sm"
                style={{ left: bleedPx + trimWidthPx / 2, top: totalHeightPx / 2, transform: 'translate(-50%, -50%)' }}
              >
                BACK COVER
              </div>
            )}
            {showFrontGuides && (
              <div
                className="absolute pointer-events-none text-[11px] font-bold text-black/40 bg-white/80 px-2 py-1 rounded shadow-sm"
                style={{ left: bleedPx + trimWidthPx + spineWidthPx + trimWidthPx / 2, top: totalHeightPx / 2, transform: 'translate(-50%, -50%)' }}
              >
                FRONT COVER
              </div>
            )}
          </>
        )}

        {/* Analysis Overlay - Highlight Problem Areas */}
        {analysisResult && showAnalysisOverlay && (
          <>
            {/* Highlight elements with issues */}
            {analysisResult.details.textElements.map((textCheck, index) => {
              if (textCheck.issues.length === 0) return null
              const elem = textCheck.element
              const hasCritical = textCheck.issues.some(i => i.type === 'critical')
              const hasWarning = textCheck.issues.some(i => i.type === 'warning')
              
              return (
                <div
                  key={`text-issue-${index}`}
                  className="absolute pointer-events-none"
                  style={{
                    left: elem.position.x,
                    top: elem.position.y,
                    width: elem.width,
                    height: elem.height,
                    border: `3px solid ${hasCritical ? 'rgba(239, 68, 68, 0.8)' : 'rgba(251, 191, 36, 0.8)'}`,
                    backgroundColor: `${hasCritical ? 'rgba(239, 68, 68, 0.15)' : 'rgba(251, 191, 36, 0.15)'}`,
                    zIndex: 1000,
                  }}
                >
                  <div 
                    className="absolute -top-6 left-0 text-[9px] font-semibold px-2 py-0.5 rounded shadow-md whitespace-nowrap"
                    style={{
                      backgroundColor: hasCritical ? 'rgba(239, 68, 68, 0.95)' : 'rgba(251, 191, 36, 0.95)',
                      color: 'white',
                    }}
                  >
                    {hasCritical ? '❌' : '⚠️'} {textCheck.issues[0].message}
                  </div>
                </div>
              )
            })}

            {/* Highlight safe zone violations */}
            {analysisResult.details.safeZone.violatingElements.map((elementDesc, index) => {
              const issue = analysisResult.criticalErrors.find(e => 
                e.category === 'Safe Zone' && e.element
              )
              if (!issue || !issue.position) return null
              
              return (
                <div
                  key={`safe-zone-issue-${index}`}
                  className="absolute pointer-events-none"
                  style={{
                    left: issue.position.x - 10,
                    top: issue.position.y - 10,
                    width: 20,
                    height: 20,
                  }}
                >
                  <div className="w-full h-full rounded-full bg-red-500/70 flex items-center justify-center animate-pulse">
                    <span className="text-white text-xs font-bold">!</span>
                  </div>
                </div>
              )
            })}

            {/* Highlight barcode area if there are violations */}
            {!analysisResult.details.barcode.barcodeAreaClear && (
              <div
                className="absolute pointer-events-none"
                style={{
                  left: bleedPx + trimWidthPx - (2 * dpi) - (0.125 * dpi),
                  top: bleedPx + trimHeightPx - (1.2 * dpi) - (0.125 * dpi),
                  width: 2 * dpi,
                  height: 1.2 * dpi,
                  border: '3px dashed rgba(239, 68, 68, 0.9)',
                  backgroundColor: 'rgba(239, 68, 68, 0.2)',
                  zIndex: 1000,
                }}
              >
                <div className="absolute -top-7 left-0 text-[10px] font-semibold text-white bg-red-600 px-2 py-0.5 rounded shadow-md">
                  ❌ Barcode Area Blocked
                </div>
              </div>
            )}

            {/* Bleed warnings if background doesn't extend to edges */}
            {analysisResult.criticalErrors.some(e => e.category === 'Bleed') && (
              <>
                {!analysisResult.details.bleed.hasFrontBleed && (
                  <div
                    className="absolute pointer-events-none"
                    style={{
                      left: bleedPx + trimWidthPx + spineWidthPx,
                      top: bleedPx,
                      width: trimWidthPx,
                      height: trimHeightPx,
                      border: '4px dashed rgba(239, 68, 68, 0.7)',
                      zIndex: 1000,
                    }}
                  >
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[12px] font-bold text-red-600 bg-white/95 px-3 py-2 rounded shadow-lg text-center">
                      ⚠️ Front Cover<br/>Needs Bleed Extension
                    </div>
                  </div>
                )}
                {!analysisResult.details.bleed.hasBackBleed && (
                  <div
                    className="absolute pointer-events-none"
                    style={{
                      left: bleedPx,
                      top: bleedPx,
                      width: trimWidthPx,
                      height: trimHeightPx,
                      border: '4px dashed rgba(239, 68, 68, 0.7)',
                      zIndex: 1000,
                    }}
                  >
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[12px] font-bold text-red-600 bg-white/95 px-3 py-2 rounded shadow-lg text-center">
                      ⚠️ Back Cover<br/>Needs Bleed Extension
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Overall status indicator */}
            <div
              className="absolute pointer-events-none top-4 right-4"
              style={{ zIndex: 2000 }}
            >
              <div 
                className={cn(
                  "px-4 py-2 rounded-lg shadow-xl font-bold text-sm",
                  analysisResult.approved 
                    ? "bg-green-500 text-white" 
                    : "bg-red-500 text-white"
                )}
              >
                {analysisResult.approved ? '✅ KDP APPROVED' : '❌ KDP REJECTED'}
                <div className="text-xs font-normal mt-1">
                  Score: {analysisResult.score}/100
                </div>
              </div>
            </div>
          </>
        )}

        {/* Smart Alignment Guides - Subtle and Panel-Specific */}
        {(isDraggingText || isDraggingShape) && alignmentGuides && (
          (() => {
            // Determine the active panel being dragged
            const draggedElement = isDraggingText 
              ? project.cover.elements?.find(el => el.id === draggingTextId && el.type === 'text') as KDPTextElement | undefined
              : project.cover.elements?.find(el => el.id === draggingShapeId && el.type === 'shape') as KDPShapeElement | undefined
            
            if (!draggedElement?.coverPart) return null
            
            const dpi = 300
            const safeMargin = 0.125 * dpi
            const trimW = coverDims.trimWidth * dpi
            const trimH = coverDims.trimHeight * dpi
            const spineW = coverDims.spineWidth * dpi
            
            // Get panel bounds in storage coordinates (300 DPI)
            const panelBounds = {
              back: { x: 0, y: 0, width: trimW, height: trimH },
              spine: { x: trimW, y: 0, width: spineW, height: trimH },
              front: { x: trimW + spineW, y: 0, width: trimW, height: trimH },
            }
            
            const bounds = panelBounds[draggedElement.coverPart]
            const displayDpi = 72 * scale
            const storageDpi = 300
            const dpiRatio = displayDpi / storageDpi
            
            return (
              <>
                {/* Vertical guides - subtle, panel-specific */}
                {alignmentGuides.vertical.map((xPos, index) => {
                  // Check if guide is within the active panel
                  if (xPos < bounds.x || xPos > bounds.x + bounds.width) return null
                  
                  return (
                    <div
                      key={`v-guide-${index}`}
                      className="absolute pointer-events-none z-50"
                      style={{
                        left: `${bleedPx + xPos * dpiRatio}px`,
                        top: `${bleedPx + bounds.y * dpiRatio}px`,
                        width: '1px',
                        height: `${bounds.height * dpiRatio}px`,
                        backgroundColor: 'rgba(255, 59, 48, 0.5)',
                        boxShadow: '0 0 1px rgba(255, 59, 48, 0.3)',
                      }}
                    />
                  )
                })}
                
                {/* Horizontal guides - subtle, panel-specific */}
                {alignmentGuides.horizontal.map((yPos, index) => {
                  // Check if guide is within the active panel
                  if (yPos < bounds.y || yPos > bounds.y + bounds.height) return null
                  
                  return (
                    <div
                      key={`h-guide-${index}`}
                      className="absolute pointer-events-none z-50"
                      style={{
                        left: `${bleedPx + bounds.x * dpiRatio}px`,
                        top: `${bleedPx + yPos * dpiRatio}px`,
                        width: `${bounds.width * dpiRatio}px`,
                        height: '1px',
                        backgroundColor: 'rgba(255, 59, 48, 0.5)',
                        boxShadow: '0 0 1px rgba(255, 59, 48, 0.3)',
                      }}
                    />
                  )
                })}
              </>
            )
          })()
        )}

        {/* Render Text Elements (in both modes now) */}
        {project.cover.elements?.map(element => {
          if (element.type === "text") {
            const textEl = element as KDPTextElement
            
            // Text positions are stored in 300 DPI coordinates as ABSOLUTE positions
            // (already include the panel offset from left edge)
            // Convert to display coordinates (72 DPI * zoom)
            const displayDpi = dpi * scale  // 72 * zoom
            const storageDpi = 300
            const dpiRatio = displayDpi / storageDpi
            
            const isSelected = selectedTextId === textEl.id
            // Position is absolute from cover left edge, just add bleed and convert DPI
            // The stored position.x already includes panel offsets
            const calculatedLeft = bleedPx + (textEl.position.x * dpiRatio)
            const calculatedTop = bleedPx + (textEl.position.y * dpiRatio)
            
            console.log('TEXT RENDER:', {
              id: textEl.id,
              content: textEl.content,
              coverPart: textEl.coverPart,
              position: textEl.position,
              bleedPx,
              dpiRatio,
              calculatedLeft,
              calculatedTop,
              isSelected,
              canvasWidth: totalWidthPx,
              canvasHeight: totalHeightPx,
              isWithinCanvas: calculatedLeft < totalWidthPx && calculatedTop < totalHeightPx,
            })
            
            // Skip hidden elements
            if (textEl.visible === false) {
              console.log('Skipping hidden text:', textEl.id)
              return null
            }
            
            return (
              <div
                key={textEl.id}
                data-element="text"
                className={cn(
                  "absolute select-none",
                  textEl.locked ? "cursor-not-allowed" : (editingTextId === textEl.id ? "cursor-text" : "cursor-move"),
                  isSelected ? "ring-4 ring-blue-500 ring-offset-2" : ""
                )}
                style={{
                  left: calculatedLeft,
                  top: calculatedTop,
                  width: textEl.width * dpiRatio,
                  opacity: textEl.style.opacity ?? 1,
                  fontFamily: textEl.style.fontFamily,
                  fontSize: Math.max(12, textEl.style.fontSize),
                  fontWeight: textEl.style.fontWeight,
                  fontStyle: textEl.style.fontStyle,
                  color: textEl.style.color,
                  textAlign: textEl.style.textAlign as React.CSSProperties['textAlign'],
                  lineHeight: textEl.style.lineHeight,
                  letterSpacing: textEl.style.letterSpacing,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  overflow: 'hidden',
                  textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
                  pointerEvents: textEl.locked ? 'none' : 'auto',
                  zIndex: isSelected ? 100 : 50,
                  backgroundColor: textEl.backgroundColor 
                    ? `${textEl.backgroundColor}${Math.round((textEl.backgroundOpacity ?? 0.5) * 255).toString(16).padStart(2, '0')}`
                    : (isSelected ? 'rgba(59, 130, 246, 0.3)' : 'rgba(0,0,0,0.2)'),
                  padding: '4px 8px',
                  borderRadius: '4px',
                  border: isSelected ? '2px solid #3b82f6' : '1px solid rgba(255,255,255,0.3)',
                  transform: `rotate(${textEl.rotation || 0}deg)`,
                  transformOrigin: 'top left',
                }}
                onMouseDown={(e) => {
                  // Only start drag if not in editing mode
                  if (editingTextId !== textEl.id) {
                    handleTextMouseDown(e, textEl)
                  }
                }}
                onClick={() => onSelectText?.(textEl.id)}
                onDoubleClick={(e) => {
                  // Enter edit mode on double-click
                  if (!textEl.locked) {
                    e.stopPropagation()
                    setEditingTextId(textEl.id)
                  }
                }}
              >
                {editingTextId === textEl.id ? (
                  <div
                    contentEditable
                    suppressContentEditableWarning
                    className="outline-none min-w-[20px]"
                    style={{
                      // Inherit all text styles from parent
                      color: 'inherit',
                      fontFamily: 'inherit',
                      fontSize: 'inherit',
                      fontWeight: 'inherit',
                      fontStyle: 'inherit',
                      textAlign: 'inherit',
                      lineHeight: 'inherit',
                      letterSpacing: 'inherit',
                    }}
                    onBlur={(e) => {
                      // Save changes on blur
                      const newContent = e.currentTarget.textContent || ''
                      if (newContent !== textEl.content) {
                        handleUpdateTextElement(textEl.id, { content: newContent })
                      }
                      setEditingTextId(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        // Cancel edit without saving
                        e.currentTarget.textContent = textEl.content
                        setEditingTextId(null)
                      }
                      // Allow Enter for newlines (removed the auto-save on Enter)
                      // Shift+Enter is standard for newline, but we'll allow plain Enter too
                      // User must click outside or press Escape to exit
                    }}
                    onInput={(e) => {
                      // Prevent default behavior that might interfere
                      e.stopPropagation()
                    }}
                    autoFocus
                    dangerouslySetInnerHTML={{ __html: textEl.content }}
                  />
                ) : (
                  <div style={{ whiteSpace: 'pre-wrap' }}>
                    {textEl.content}
                  </div>
                )}
                {/* Resize handles - only show when selected AND not editing */}
                {isSelected && !textEl.locked && editingTextId !== textEl.id && (
                  <>
                    {/* West (left) handle - changes width from left */}
                    <div
                      className="absolute top-1/2 -left-2 w-3 h-6 bg-blue-500 rounded cursor-w-resize -translate-y-1/2"
                      onMouseDown={(e) => handleTextResizeStart(e, textEl, 'w')}
                      title="Drag to change width from left"
                    />
                    {/* East (right) handle - changes width from right */}
                    <div
                      className="absolute top-1/2 -right-2 w-3 h-6 bg-blue-500 rounded cursor-e-resize -translate-y-1/2"
                      onMouseDown={(e) => handleTextResizeStart(e, textEl, 'e')}
                      title="Drag to change width"
                    />
                    {/* North (top) handle - reposition vertically */}
                    <div
                      className="absolute -top-2 left-1/2 w-6 h-3 bg-blue-500 rounded cursor-n-resize -translate-x-1/2"
                      onMouseDown={(e) => handleTextResizeStart(e, textEl, 'n')}
                      title="Drag to reposition"
                    />
                    {/* South (bottom) handle */}
                    <div
                      className="absolute -bottom-2 left-1/2 w-6 h-3 bg-blue-500 rounded cursor-s-resize -translate-x-1/2"
                      onMouseDown={(e) => handleTextResizeStart(e, textEl, 's')}
                      title="Drag to reposition"
                    />
                    {/* Corner handles */}
                    <div
                      className="absolute -top-2 -left-2 w-4 h-4 bg-green-500 rounded cursor-nw-resize"
                      onMouseDown={(e) => handleTextResizeStart(e, textEl, 'nw')}
                    />
                    <div
                      className="absolute -top-2 -right-2 w-4 h-4 bg-green-500 rounded cursor-ne-resize"
                      onMouseDown={(e) => handleTextResizeStart(e, textEl, 'ne')}
                    />
                    <div
                      className="absolute -bottom-2 -left-2 w-4 h-4 bg-green-500 rounded cursor-sw-resize"
                      onMouseDown={(e) => handleTextResizeStart(e, textEl, 'sw')}
                    />
                    <div
                      className="absolute -bottom-2 -right-2 w-4 h-4 bg-orange-500 rounded cursor-se-resize"
                      onMouseDown={(e) => handleTextResizeStart(e, textEl, 'se')}
                      title="Drag to resize (changes font size)"
                    />
                  </>
                )}
              </div>
            )
          }
          
          if (element.type === "barcode") {
            const barcodeEl = element as KDPBarcodeElement
            return (
              <div
                key={barcodeEl.id}
                className="absolute cursor-move select-none bg-white border border-gray-300 p-1"
                style={{
                  left: bleedPx + (barcodeEl.position.x * scale),
                  top: bleedPx + (barcodeEl.position.y * scale),
                  width: barcodeEl.width * scale,
                  height: barcodeEl.height * scale,
                }}
              >
                {/* Placeholder barcode visualization */}
                <div className="w-full h-full flex flex-col items-center justify-center bg-white">
                  <div className="flex gap-[1px] h-2/3 items-end">
                    {Array.from({ length: 30 }).map((_, i) => (
                      <div
                        key={i}
                        className="bg-black"
                        style={{
                          width: Math.random() > 0.5 ? 2 : 1,
                          height: `${60 + Math.random() * 40}%`,
                        }}
                      />
                    ))}
                  </div>
                  <div className="text-[8px] font-mono mt-1 text-black">
                    978-0-000000-00-0
                  </div>
                </div>
                <div className="absolute -top-4 left-0 text-[8px] text-orange-500 font-bold bg-white px-1 rounded">
                  PLACEHOLDER
                </div>
              </div>
            )
          }
          
          if (element.type === "shape") {
            const shapeEl = element as KDPShapeElement
            
            // Similar DPI conversion as text
            const displayDpi = dpi * scale
            const storageDpi = 300
            const dpiRatio = displayDpi / storageDpi
            
            const isSelected = selectedShapeId === shapeEl.id
            const calculatedLeft = bleedPx + (shapeEl.position.x * dpiRatio)
            const calculatedTop = bleedPx + (shapeEl.position.y * dpiRatio)
            const displayWidth = shapeEl.width * dpiRatio
            const displayHeight = shapeEl.height * dpiRatio
            
            // Skip hidden elements
            if (shapeEl.visible === false) return null
            
            return (
              <div
                key={shapeEl.id}
                data-element="shape"
                className={cn(
                  "absolute select-none",
                  shapeEl.locked ? "cursor-not-allowed" : "cursor-move",
                  isSelected ? "ring-4 ring-emerald-500 ring-offset-2" : ""
                )}
                style={{
                  left: calculatedLeft,
                  top: calculatedTop,
                  width: displayWidth,
                  height: displayHeight,
                  transform: `rotate(${shapeEl.rotation}deg)`,
                  pointerEvents: shapeEl.locked ? 'none' : 'auto',
                  zIndex: isSelected ? 90 : 45,
                }}
                onMouseDown={(e) => handleShapeMouseDown(e, shapeEl)}
                onClick={() => onSelectShape?.(shapeEl.id)}
              >
                {shapeEl.shapeType === 'rectangle' && (
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      backgroundColor: shapeEl.style.fill,
                      border: `${shapeEl.style.strokeWidth}px solid ${shapeEl.style.stroke}`,
                      borderRadius: shapeEl.style.borderRadius || 0,
                      opacity: shapeEl.style.opacity,
                    }}
                  />
                )}
                
                {shapeEl.shapeType === 'circle' && (
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      backgroundColor: shapeEl.style.fill,
                      border: `${shapeEl.style.strokeWidth}px solid ${shapeEl.style.stroke}`,
                      borderRadius: '50%',
                      opacity: shapeEl.style.opacity,
                    }}
                  />
                )}
                
                {shapeEl.shapeType === 'line' && (
                  <div
                    style={{
                      width: '100%',
                      height: shapeEl.style.strokeWidth,
                      backgroundColor: shapeEl.style.stroke,
                      opacity: shapeEl.style.opacity,
                      position: 'absolute',
                      top: '50%',
                      transform: 'translateY(-50%)',
                    }}
                  />
                )}
                
                {shapeEl.shapeType === 'arrow' && (
                  <svg
                    width="100%"
                    height="100%"
                    viewBox="0 0 100 10"
                    preserveAspectRatio="none"
                    style={{ opacity: shapeEl.style.opacity }}
                  >
                    <line
                      x1="0"
                      y1="5"
                      x2="90"
                      y2="5"
                      stroke={shapeEl.style.stroke}
                      strokeWidth={shapeEl.style.strokeWidth}
                    />
                    <polygon
                      points="90,0 100,5 90,10"
                      fill={shapeEl.style.stroke}
                    />
                  </svg>
                )}
                
                {/* Resize handles - only show when selected AND not locked */}
                {isSelected && !shapeEl.locked && (
                  <>
                    {/* Corner handles */}
                    <div
                      className="absolute -top-2 -left-2 w-4 h-4 bg-green-500 rounded cursor-nw-resize z-10"
                      onMouseDown={(e) => handleShapeResizeStart(e, shapeEl, 'nw')}
                    />
                    <div
                      className="absolute -top-2 -right-2 w-4 h-4 bg-green-500 rounded cursor-ne-resize z-10"
                      onMouseDown={(e) => handleShapeResizeStart(e, shapeEl, 'ne')}
                    />
                    <div
                      className="absolute -bottom-2 -left-2 w-4 h-4 bg-green-500 rounded cursor-sw-resize z-10"
                      onMouseDown={(e) => handleShapeResizeStart(e, shapeEl, 'sw')}
                    />
                    <div
                      className="absolute -bottom-2 -right-2 w-4 h-4 bg-orange-500 rounded cursor-se-resize z-10"
                      onMouseDown={(e) => handleShapeResizeStart(e, shapeEl, 'se')}
                      title="Drag to resize"
                    />
                    
                    {/* Edge handles */}
                    <div
                      className="absolute -top-2 left-1/2 w-6 h-3 bg-blue-500 rounded cursor-n-resize -translate-x-1/2 z-10"
                      onMouseDown={(e) => handleShapeResizeStart(e, shapeEl, 'n')}
                    />
                    <div
                      className="absolute -bottom-2 left-1/2 w-6 h-3 bg-blue-500 rounded cursor-s-resize -translate-x-1/2 z-10"
                      onMouseDown={(e) => handleShapeResizeStart(e, shapeEl, 's')}
                    />
                    <div
                      className="absolute top-1/2 -left-2 w-3 h-6 bg-blue-500 rounded cursor-w-resize -translate-y-1/2 z-10"
                      onMouseDown={(e) => handleShapeResizeStart(e, shapeEl, 'w')}
                    />
                    <div
                      className="absolute top-1/2 -right-2 w-3 h-6 bg-blue-500 rounded cursor-e-resize -translate-y-1/2 z-10"
                      onMouseDown={(e) => handleShapeResizeStart(e, shapeEl, 'e')}
                    />
                  </>
                )}
              </div>
            )
          }
          
          return null
        })}

        {/* Interactive hint */}
        {(project.cover.fullCoverImage || project.cover.frontImage || project.cover.backImage) && !isDragging && !isResizing && (
          <div className="absolute bottom-2 right-2 text-[10px] text-white bg-black/70 px-2 py-1 rounded flex items-center gap-2">
            <Move className="w-3 h-3" /> Drag
            <span className="mx-1">•</span>
            <div className="w-3 h-3 rounded-full bg-blue-500 border border-white" /> Scale
            <span className="mx-1">•</span>
            <div className="w-3 h-2 rounded-sm bg-orange-500 border border-white" /> Stretch
          </div>
        )}
      </div>
    </div>
  )
}

// Badge Preview Component - renders actual badge appearance for visual preview
function BadgePreview({ template }: { template: MarketingBadgeTemplate }) {
  const size = 80 // Preview size in pixels
  const viewBoxWidth = template.defaultSize.width
  const viewBoxHeight = template.defaultSize.height
  
  return (
    <svg 
      width={size} 
      height={size * (viewBoxHeight / viewBoxWidth)} 
      viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
      className="mx-auto"
    >
      {template.elements.map((element, index) => {
        if (element.type === 'shape') {
          if (element.shapeType === 'circle') {
            return (
              <ellipse
                key={index}
                cx={element.position.x + element.width / 2}
                cy={element.position.y + element.height / 2}
                rx={element.width / 2}
                ry={element.height / 2}
                fill={element.style.fill || 'transparent'}
                stroke={element.style.stroke || 'none'}
                strokeWidth={element.style.strokeWidth || 0}
                opacity={element.style.opacity || 1}
              />
            )
          } else {
            return (
              <rect
                key={index}
                x={element.position.x}
                y={element.position.y}
                width={element.width}
                height={element.height}
                rx={element.style.borderRadius || 0}
                fill={element.style.fill || 'transparent'}
                stroke={element.style.stroke || 'none'}
                strokeWidth={element.style.strokeWidth || 0}
                opacity={element.style.opacity || 1}
              />
            )
          }
        } else if (element.type === 'text') {
          return (
            <text
              key={index}
              x={element.position.x}
              y={element.position.y + (element.style.fontSize || 24) * 0.8}
              fontSize={element.style.fontSize || 24}
              fontFamily={element.style.fontFamily || 'Arial'}
              fontWeight={element.style.fontWeight || 'normal'}
              fill={element.style.color || '#000000'}
              textAnchor={element.style.textAlign === 'center' ? 'middle' : element.style.textAlign === 'right' ? 'end' : 'start'}
              opacity={element.style.opacity || 1}
            >
              {element.content}
            </text>
          )
        }
        return null
      })}
    </svg>
  )
}

export function KDPCoverStep({ project, onUpdate, onNext, onBack }: KDPCoverStepProps) {
  const [coverMode, setCoverMode] = useState<"full" | "separate">("separate")
  const [showGuides, setShowGuides] = useState(true)
  const [showBackGuides, setShowBackGuides] = useState(true)
  const [showSpineGuides, setShowSpineGuides] = useState(true)
  const [showFrontGuides, setShowFrontGuides] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [canvasZoom, setCanvasZoom] = useState(1.0) // 100% default zoom
  const [isAutoSizing, setIsAutoSizing] = useState(false)
  const [downloadName, setDownloadName] = useState(project.name || "cover")
  const [isDownloading, setIsDownloading] = useState(false)
  const [isCreatingFullWrap, setIsCreatingFullWrap] = useState(false)
  const [isFileDragging, setIsFileDragging] = useState(false)
  const [cropImageData, setCropImageData] = useState<{ target: "full" | "front" | "back" | "spine"; image: KDPImage } | null>(null)
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  
  // Text Editor State
  const [showTextEditor, setShowTextEditor] = useState(false)
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null)
  const [newTextContent, setNewTextContent] = useState("")
  const [newTextPart, setNewTextPart] = useState<"front" | "back" | "spine">("front")
  const [newTextStyle, setNewTextStyle] = useState({
    fontFamily: "Arial",
    fontSize: 24,
    fontWeight: "normal" as "normal" | "bold",
    fontStyle: "normal" as "normal" | "italic",
    color: "#ffffff", // Default white color
    textAlign: "center" as "left" | "center" | "right",
    lineHeight: 1.2,
    letterSpacing: 0,
    textDecoration: "none" as "none" | "underline",
  })
  
  // Quick text input state
  const [showQuickTextInput, setShowQuickTextInput] = useState(false)
  const [quickTextType, setQuickTextType] = useState<'title' | 'subtitle' | 'author' | null>(null)
  const [quickTextValue, setQuickTextValue] = useState("")
  
  // Editor Tab State
  const [editorTab, setEditorTab] = useState<'cover' | 'text' | 'spine' | 'images' | 'backgrounds' | 'shapes' | 'layers' | 'badges' | 'elements'>('cover')
  const [activePanel, setActivePanel] = useState<'front' | 'back' | 'spine'>('front')
  
  // Shape state
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null)
  
  // Copied color state
  const [copiedColor, setCopiedColor] = useState<string | null>(null)
  
  // Target panel for new badges/elements
  const [newElementTargetPanel, setNewElementTargetPanel] = useState<'front' | 'back' | 'spine'>('front')
  
  // AI Background Generation State
  const [showAIBgModal, setShowAIBgModal] = useState(false)
  const [showAICoverModal, setShowAICoverModal] = useState(false)
  const [aiCoverPrompt, setAICoverPrompt] = useState("")
  const [isGeneratingCover, setIsGeneratingCover] = useState(false)
  const [aiBgPrompt, setAiBgPrompt] = useState("")
  const [aiBgPanel, setAiBgPanel] = useState<'front' | 'back' | 'spine' | 'all'>('front')
  const [isGeneratingBg, setIsGeneratingBg] = useState(false)
  
  // Cover Analysis State
  const [showAnalysisModal, setShowAnalysisModal] = useState(false)
  const [analysisResult, setAnalysisResult] = useState<CoverAnalysisResult | null>(null)
  const [showAnalysisOverlay, setShowAnalysisOverlay] = useState(false)
  
  // Background type state for each panel
  const [panelBgTypes, setPanelBgTypes] = useState<{
    front: 'solid' | 'gradient' | 'pattern' | 'image'
    back: 'solid' | 'gradient' | 'pattern' | 'image'
    spine: 'solid' | 'gradient' | 'pattern' | 'image'
  }>({ front: 'solid', back: 'solid', spine: 'solid' })

  // Track solid colors for each panel (used when applying patterns)
  const [panelSolidColors, setPanelSolidColors] = useState<{
    front: string
    back: string
    spine: string
  }>({ front: '#ffffff', back: '#ffffff', spine: '#ffffff' })

  // Custom gradient builder state
  const [customGradient, setCustomGradient] = useState({
    color1: '#667eea',
    color2: '#764ba2',
    angle: 135,
    type: 'linear' as 'linear' | 'radial'
  })

  const fullCoverInputRef = useRef<HTMLInputElement>(null)
  const frontCoverInputRef = useRef<HTMLInputElement>(null)
  const backCoverInputRef = useRef<HTMLInputElement>(null)
  const spineCoverInputRef = useRef<HTMLInputElement>(null)

  // Initialize panel solid colors from existing backgrounds
  useEffect(() => {
    const backgrounds = project.cover.panelBackgrounds
    if (backgrounds) {
      const newColors: typeof panelSolidColors = { ...panelSolidColors }
      
      // Extract solid colors from panel backgrounds
      Object.entries(backgrounds).forEach(([panel, value]) => {
        if (value && !value.includes('gradient') && !value.includes('url(') && !value.startsWith('pattern|')) {
          // It's a solid color
          newColors[panel as keyof typeof newColors] = value
        }
      })
      
      setPanelSolidColors(newColors)
    }
  }, []) // Only run once on mount

  // Calculate cover dimensions
  const trim = project.trimSize ? KDP_TRIM_SIZES[project.trimSize as KDPTrimSizeKey] : null
  const paperType = (project.paperType || "white") as KDPPaperType

  // Use coverPageCount if set, otherwise fall back to pageCount, or default to 100 for initial setup
  const effectivePageCount = (project.coverPageCount ?? project.pageCount) || 100
  const coverDims: CoverDimensions | null = trim
    ? calculateCoverDimensions(project.trimSize as KDPTrimSizeKey, effectivePageCount, paperType)
    : null

  // Update cover
  const handleUpdateCover = useCallback((updates: Partial<KDPProject['cover']>) => {
    onUpdate({
      cover: {
        ...project.cover,
        ...updates,
      },
    })
  }, [project.cover, onUpdate])

  // Handle file upload
  const handleFileUpload = useCallback(async (
    files: FileList | null,
    target: "full" | "front" | "back" | "spine"
  ) => {
    if (!files || files.length === 0) return
    const file = files[0]
    if (!file.type.startsWith("image/")) return

    setIsUploading(true)

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

    const image: KDPImage = {
      id: generateKDPId("cover"),
      src: preview,
      fileName: file.name,
      originalWidth: dimensions.width,
      originalHeight: dimensions.height,
      position: { x: 0, y: 0 },
      scale: 1,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      opacity: 1,
      flipX: false,
      flipY: false,
    }

    // Auto-fit to cover dimensions
    if (coverDims) {
      let targetWidth: number
      let targetHeight: number

      if (target === "full") {
        targetWidth = coverDims.totalWidth * 300
        targetHeight = coverDims.totalHeight * 300
      } else if (target === "spine") {
        targetWidth = coverDims.spineWidth * 300
        targetHeight = coverDims.trimHeight * 300
      } else {
        targetWidth = coverDims.trimWidth * 300
        targetHeight = coverDims.trimHeight * 300
      }

      const safeMargin = 0.125 * 300 // Safe zone margin at 300 DPI
      
      // Calculate available space within safe zone
      const availableWidth = targetWidth - (safeMargin * 2)
      const availableHeight = targetHeight - (safeMargin * 2)
      
      // Scale to fit within safe zone (not just trim area)
      const scaleX = availableWidth / dimensions.width
      const scaleY = availableHeight / dimensions.height
      const uniformScale = Math.min(scaleX, scaleY)
      
      image.scale = uniformScale
      image.scaleX = uniformScale
      image.scaleY = uniformScale

      const scaledWidth = dimensions.width * uniformScale
      const scaledHeight = dimensions.height * uniformScale
      
      // Center within safe zone (with safe margin applied)
      image.position.x = safeMargin + (availableWidth - scaledWidth) / 2
      image.position.y = safeMargin + (availableHeight - scaledHeight) / 2
    }

    // Update project cover
    if (target === "full") {
      handleUpdateCover({ fullCoverImage: image })
    } else if (target === "front") {
      handleUpdateCover({ frontImage: image })
    } else if (target === "back") {
      handleUpdateCover({ backImage: image })
    } else if (target === "spine") {
      handleUpdateCover({ spineImage: image })
    }

    setIsUploading(false)
  }, [coverDims, handleUpdateCover])

  // Drag and drop handlers for FILE uploads
  const handleFileDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer.types.includes('Files')) {
      setIsFileDragging(true)
    }
  }, [])

  const handleFileDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX
    const y = e.clientY
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setIsFileDragging(false)
    }
  }, [])

  const handleFileDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer.types.includes('Files')) {
      e.dataTransfer.dropEffect = 'copy'
    }
  }, [])

  const handleFileDrop = useCallback((e: React.DragEvent, target: "full" | "front" | "back" | "spine") => {
    e.preventDefault()
    e.stopPropagation()
    setIsFileDragging(false)
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files, target)
    }
  }, [handleFileUpload])

  // Delete cover image
  const handleDeleteCover = useCallback((target: "full" | "front" | "back" | "spine") => {
    if (target === "full") {
      handleUpdateCover({ fullCoverImage: undefined })
    } else if (target === "front") {
      handleUpdateCover({ frontImage: undefined })
    } else if (target === "back") {
      handleUpdateCover({ backImage: undefined })
    } else if (target === "spine") {
      handleUpdateCover({ spineImage: undefined })
    }
  }, [handleUpdateCover])

  // Update spine text
  const handleSpineTextChange = useCallback((text: string) => {
    handleUpdateCover({ spineText: text })
  }, [handleUpdateCover])

  // Auto-size helper function
  const autoSizeImageToSafeZone = (
    image: KDPImage | undefined,
    targetWidthInches: number,
    targetHeightInches: number
  ): KDPImage | undefined => {
    if (!image) return undefined

    const safeMargin = 0.125 // Safe zone margin in inches
    const safeWidthPx = (targetWidthInches - safeMargin * 2) * 300
    const safeHeightPx = (targetHeightInches - safeMargin * 2) * 300
    const safeOffsetPx = safeMargin * 300

    // Scale to fit within safe zone
    const scaleX = safeWidthPx / image.originalWidth
    const scaleY = safeHeightPx / image.originalHeight
    const scale = Math.min(scaleX, scaleY)

    const scaledWidth = image.originalWidth * scale
    const scaledHeight = image.originalHeight * scale

    // Center within safe zone
    const posX = safeOffsetPx + (safeWidthPx - scaledWidth) / 2
    const posY = safeOffsetPx + (safeHeightPx - scaledHeight) / 2

    return {
      ...image,
      scale,
      scaleX: scale,
      scaleY: scale,
      position: { x: posX, y: posY },
    }
  }

  // Get panel boundaries in DPI coordinates
  const getPanelSafeArea = useCallback((panel: 'front' | 'back' | 'spine', coverDims: CoverDimensions) => {
    const dpi = 300
    const safeMargin = 0.125 * dpi
    const trimW = coverDims.trimWidth * dpi
    const trimH = coverDims.trimHeight * dpi
    const spineW = coverDims.spineWidth * dpi
    
    const bounds = {
      back:  { x: safeMargin, y: safeMargin, width: trimW - safeMargin * 2, height: trimH - safeMargin * 2 },
      spine: { x: trimW + safeMargin/2, y: safeMargin, width: spineW - safeMargin, height: trimH - safeMargin * 2 },
      front: { x: trimW + spineW + safeMargin, y: safeMargin, width: trimW - safeMargin * 2, height: trimH - safeMargin * 2 },
    }
    return bounds[panel]
  }, [])

  // Clamp position within panel safe area
  const clampToPanel = useCallback((
    pos: { x: number; y: number },
    size: { width: number; height: number },
    safeArea: { x: number; y: number; width: number; height: number }
  ) => {
    // First, clamp the size to fit within safe area
    const clampedWidth = Math.min(size.width, safeArea.width)
    const clampedHeight = Math.min(size.height, safeArea.height)
    
    // Then clamp position with the adjusted size
    return {
      x: Math.max(safeArea.x, Math.min(safeArea.x + safeArea.width - clampedWidth, pos.x)),
      y: Math.max(safeArea.y, Math.min(safeArea.y + safeArea.height - clampedHeight, pos.y)),
      width: clampedWidth,
      height: clampedHeight,
    }
  }, [])

  // Auto-size all cover images
  const handleAutoSizeAll = useCallback(async () => {
    if (!coverDims) return

    setIsAutoSizing(true)

    const coverUpdate = { ...project.cover }

    if (coverUpdate.fullCoverImage) {
      coverUpdate.fullCoverImage = autoSizeImageToSafeZone(
        coverUpdate.fullCoverImage,
        coverDims.totalWidth,
        coverDims.totalHeight
      )
    }

    if (coverUpdate.frontImage) {
      coverUpdate.frontImage = autoSizeImageToSafeZone(
        coverUpdate.frontImage,
        coverDims.trimWidth,
        coverDims.trimHeight
      )
    }

    if (coverUpdate.backImage) {
      coverUpdate.backImage = autoSizeImageToSafeZone(
        coverUpdate.backImage,
        coverDims.trimWidth,
        coverDims.trimHeight
      )
    }

    if (coverUpdate.spineImage) {
      coverUpdate.spineImage = autoSizeImageToSafeZone(
        coverUpdate.spineImage,
        coverDims.spineWidth,
        coverDims.trimHeight
      )
    }

    onUpdate({ cover: coverUpdate })

    await new Promise(resolve => setTimeout(resolve, 300))
    setIsAutoSizing(false)
  }, [coverDims, project.cover, onUpdate])

  // Auto-size separate FRONT image
  const handleAutoSizeSeparateFront = useCallback(async () => {
    if (!coverDims || !project.cover.frontImage) return

    setIsAutoSizing(true)

    const updatedFront = autoSizeImageToSafeZone(
      project.cover.frontImage,
      coverDims.trimWidth,
      coverDims.trimHeight
    )

    handleUpdateCover({ frontImage: updatedFront })

    await new Promise(resolve => setTimeout(resolve, 300))
    setIsAutoSizing(false)
  }, [coverDims, project.cover.frontImage, handleUpdateCover])

  // Auto-size separate BACK image
  const handleAutoSizeSeparateBack = useCallback(async () => {
    if (!coverDims || !project.cover.backImage) return

    setIsAutoSizing(true)

    const updatedBack = autoSizeImageToSafeZone(
      project.cover.backImage,
      coverDims.trimWidth,
      coverDims.trimHeight
    )

    handleUpdateCover({ backImage: updatedBack })

    await new Promise(resolve => setTimeout(resolve, 300))
    setIsAutoSizing(false)
  }, [coverDims, project.cover.backImage, handleUpdateCover])

  // Perfect Fit helper - stretches image to fill entire safe zone (may distort)
  const perfectFitImageToSafeZone = (
    image: KDPImage | undefined,
    targetWidthInches: number,
    targetHeightInches: number
  ): KDPImage | undefined => {
    if (!image) return undefined

    const safeMargin = 0.125 // Safe zone margin in inches
    const safeWidthPx = (targetWidthInches - safeMargin * 2) * 300
    const safeHeightPx = (targetHeightInches - safeMargin * 2) * 300
    const safeOffsetPx = safeMargin * 300

    // Calculate independent scales to fill entire safe zone
    const scaleX = safeWidthPx / image.originalWidth
    const scaleY = safeHeightPx / image.originalHeight

    // Position at safe zone origin
    const posX = safeOffsetPx
    const posY = safeOffsetPx

    return {
      ...image,
      scale: Math.max(scaleX, scaleY), // Use larger for reference
      scaleX,
      scaleY,
      position: { x: posX, y: posY },
    }
  }

  // Perfect Fit all separate parts
  const handlePerfectFitAll = useCallback(async () => {
    if (!coverDims) return

    setIsAutoSizing(true)

    const coverUpdate = { ...project.cover }

    if (coverUpdate.frontImage) {
      coverUpdate.frontImage = perfectFitImageToSafeZone(
        coverUpdate.frontImage,
        coverDims.trimWidth,
        coverDims.trimHeight
      )
    }

    if (coverUpdate.backImage) {
      coverUpdate.backImage = perfectFitImageToSafeZone(
        coverUpdate.backImage,
        coverDims.trimWidth,
        coverDims.trimHeight
      )
    }

    if (coverUpdate.spineImage) {
      coverUpdate.spineImage = perfectFitImageToSafeZone(
        coverUpdate.spineImage,
        coverDims.spineWidth,
        coverDims.trimHeight
      )
    }

    onUpdate({ cover: coverUpdate })

    await new Promise(resolve => setTimeout(resolve, 300))
    setIsAutoSizing(false)
  }, [coverDims, project.cover, onUpdate])

  // Fit full cover image to Safe Zone (maintains aspect ratio, fits within safe area)
  const fitFullCoverToSafeZone = useCallback((
    image: KDPImage | undefined,
    coverDims: CoverDimensions
  ): KDPImage | undefined => {
    if (!image) return undefined

    const dpi = 300
    const safeMargin = 0.125 // Safe zone margin in inches
    const bleedPx = coverDims.bleed * dpi
    
    // Safe zone is inside the trim area, which is inside the bleed
    const safeWidthPx = (coverDims.totalWidth - coverDims.bleed * 2 - safeMargin * 2) * dpi
    const safeHeightPx = (coverDims.totalHeight - coverDims.bleed * 2 - safeMargin * 2) * dpi
    const safeOffsetX = bleedPx + safeMargin * dpi
    const safeOffsetY = bleedPx + safeMargin * dpi

    // Scale to fit within safe zone (maintain aspect ratio)
    const scaleX = safeWidthPx / image.originalWidth
    const scaleY = safeHeightPx / image.originalHeight
    const scale = Math.min(scaleX, scaleY)

    const scaledWidth = image.originalWidth * scale
    const scaledHeight = image.originalHeight * scale

    // Center within safe zone
    const posX = safeOffsetX + (safeWidthPx - scaledWidth) / 2
    const posY = safeOffsetY + (safeHeightPx - scaledHeight) / 2

    return {
      ...image,
      scale,
      scaleX: scale,
      scaleY: scale,
      position: { x: posX, y: posY },
    }
  }, [])

  // Fit full cover image to Trim (fills trim area without bleed, maintains aspect ratio)
  const fitFullCoverToTrim = useCallback((
    image: KDPImage | undefined,
    coverDims: CoverDimensions
  ): KDPImage | undefined => {
    if (!image) return undefined

    const dpi = 300
    const bleedPx = coverDims.bleed * dpi
    
    // Trim area dimensions (excluding bleed)
    const trimWidthPx = (coverDims.totalWidth - coverDims.bleed * 2) * dpi
    const trimHeightPx = (coverDims.totalHeight - coverDims.bleed * 2) * dpi

    // Scale to cover entire trim area (may crop)
    const scaleX = trimWidthPx / image.originalWidth
    const scaleY = trimHeightPx / image.originalHeight
    const scale = Math.max(scaleX, scaleY) // Use max to ensure full coverage

    const scaledWidth = image.originalWidth * scale
    const scaledHeight = image.originalHeight * scale

    // Center the image so cropping is even
    const posX = bleedPx + (trimWidthPx - scaledWidth) / 2
    const posY = bleedPx + (trimHeightPx - scaledHeight) / 2

    return {
      ...image,
      scale,
      scaleX: scale,
      scaleY: scale,
      position: { x: posX, y: posY },
    }
  }, [])

  // Fit full cover image to Bleed (fills entire canvas including bleed area)
  const fitFullCoverToBleed = useCallback((
    image: KDPImage | undefined,
    coverDims: CoverDimensions
  ): KDPImage | undefined => {
    if (!image) return undefined

    const dpi = 300
    
    // Full canvas dimensions (including bleed)
    const totalWidthPx = coverDims.totalWidth * dpi
    const totalHeightPx = coverDims.totalHeight * dpi

    // Scale to cover entire canvas (may crop)
    const scaleX = totalWidthPx / image.originalWidth
    const scaleY = totalHeightPx / image.originalHeight
    const scale = Math.max(scaleX, scaleY) // Use max to ensure full coverage

    const scaledWidth = image.originalWidth * scale
    const scaledHeight = image.originalHeight * scale

    // Center the image so cropping is even
    const posX = (totalWidthPx - scaledWidth) / 2
    const posY = (totalHeightPx - scaledHeight) / 2

    return {
      ...image,
      scale,
      scaleX: scale,
      scaleY: scale,
      position: { x: posX, y: posY },
    }
  }, [])

  // Handler for Fit to SafeZone button (Full Cover mode)
  const handleFitFullCoverToSafeZone = useCallback(async () => {
    if (!coverDims || !project.cover.fullCoverImage) return

    setIsAutoSizing(true)
    const updated = fitFullCoverToSafeZone(project.cover.fullCoverImage, coverDims)
    handleUpdateCover({ fullCoverImage: updated })

    await new Promise(resolve => setTimeout(resolve, 300))
    setIsAutoSizing(false)
  }, [coverDims, project.cover.fullCoverImage, fitFullCoverToSafeZone, handleUpdateCover])

  // Handler for Fit to Trim button (Full Cover mode)
  const handleFitFullCoverToTrim = useCallback(async () => {
    if (!coverDims || !project.cover.fullCoverImage) return

    setIsAutoSizing(true)
    const updated = fitFullCoverToTrim(project.cover.fullCoverImage, coverDims)
    handleUpdateCover({ fullCoverImage: updated })

    await new Promise(resolve => setTimeout(resolve, 300))
    setIsAutoSizing(false)
  }, [coverDims, project.cover.fullCoverImage, fitFullCoverToTrim, handleUpdateCover])

  // Handler for Fit to Bleed button (Full Cover mode)
  const handleFitFullCoverToBleed = useCallback(async () => {
    if (!coverDims || !project.cover.fullCoverImage) return

    setIsAutoSizing(true)
    const updated = fitFullCoverToBleed(project.cover.fullCoverImage, coverDims)
    handleUpdateCover({ fullCoverImage: updated })

    await new Promise(resolve => setTimeout(resolve, 300))
    setIsAutoSizing(false)
  }, [coverDims, project.cover.fullCoverImage, fitFullCoverToBleed, handleUpdateCover])

  // Scale panel image to fill entire panel INCLUDING bleed area
  const handleScalePanelImageToBleed = useCallback((
    target: 'front' | 'back' | 'spine'
  ) => {
    const image = target === 'front' ? project.cover.frontImage :
                  target === 'back' ? project.cover.backImage :
                  project.cover.spineImage
    
    if (!image || !coverDims) return

    const dpi = 300
    const bleed = coverDims.bleed * dpi // 0.125" at 300 DPI
    
    // Get the trim dimensions for this panel (in 300 DPI)
    const trimWidth = coverDims.trimWidth * dpi
    const trimHeight = coverDims.trimHeight * dpi
    const spineWidth = coverDims.spineWidth * dpi
    
    // Calculate the TOTAL area including bleed that we want to fill
    let targetWidth: number
    let targetHeight: number
    let offsetX: number
    let offsetY: number
    
    if (target === 'back') {
      // Back: trim + left bleed + top/bottom bleed
      targetWidth = trimWidth + bleed  // Add left bleed
      targetHeight = trimHeight + (bleed * 2)  // Add top + bottom bleed
      offsetX = -bleed  // Position starts in left bleed
      offsetY = -bleed  // Position starts in top bleed
    } else if (target === 'front') {
      // Front: trim + right bleed + top/bottom bleed  
      targetWidth = trimWidth + bleed  // Add right bleed
      targetHeight = trimHeight + (bleed * 2)  // Add top + bottom bleed
      offsetX = 0  // Position starts at trim edge (extends right)
      offsetY = -bleed  // Position starts in top bleed
    } else {
      // Spine: exact width + top/bottom bleed
      targetWidth = spineWidth  // No horizontal bleed
      targetHeight = trimHeight + (bleed * 2)  // Add top + bottom bleed
      offsetX = 0
      offsetY = -bleed  // Position starts in top bleed
    }
    
    // CRITICAL: Calculate scale based on target dimensions
    // Use Math.MIN to ensure the image fits within the target area
    // This prevents excessive overflow in one dimension
    const scaleX = targetWidth / image.originalWidth
    const scaleY = targetHeight / image.originalHeight
    
    // Use Math.min to fit within bounds (may leave gaps if aspect ratios don't match)
    // OR use Math.max to cover completely (may crop if aspect ratios don't match)
    // For bleed purposes, we want to COVER, so use Math.max
    const scale = Math.min(scaleX, scaleY)  // FIT within target (prevents overflow)
    
    // Calculate actual size after scaling
    const scaledWidth = image.originalWidth * scale
    const scaledHeight = image.originalHeight * scale
    
    // Center the scaled image within the target area
    const posX = offsetX + (targetWidth - scaledWidth) / 2
    const posY = offsetY + (targetHeight - scaledHeight) / 2
    
    console.log(`[Scale to Bleed] ${target}:`, {
      targetWidth, targetHeight,
      imageSize: { w: image.originalWidth, h: image.originalHeight },
      scaleX, scaleY, finalScale: scale,
      scaledSize: { w: scaledWidth, h: scaledHeight },
      position: { x: posX, y: posY }
    })
    
    const updatedImage: KDPImage = {
      ...image,
      scale,
      scaleX: scale,
      scaleY: scale,
      position: { x: posX, y: posY }
    }
    
    if (target === 'front') {
      handleUpdateCover({ frontImage: updatedImage })
    } else if (target === 'back') {
      handleUpdateCover({ backImage: updatedImage })
    } else {
      handleUpdateCover({ spineImage: updatedImage })
    }
    
  }, [project.cover, coverDims, handleUpdateCover])

  // Fill background to bleed area in full cover mode
  const handleFillBackgroundToBleed = useCallback(() => {
    // Enable bleed fill mode for the global cover background
    const updatedCover = {
      ...project.cover,
      backgroundFitMode: {
        ...project.cover.backgroundFitMode,
        full: 'bleed' as const,
      },
    }
    
    handleUpdateCover(updatedCover)
  }, [project.cover, handleUpdateCover])

  // Download cover image
  const handleDownloadCover = useCallback(async (target: "front" | "back" | "full") => {
    let image: KDPImage | undefined
    let suffix = ""
    
    if (target === "full") {
      image = project.cover.fullCoverImage
      suffix = "_full_cover"
    } else if (target === "front") {
      image = project.cover.frontImage
      suffix = "_front_cover"
    } else if (target === "back") {
      image = project.cover.backImage
      suffix = "_back_cover"
    }
    
    if (!image?.src) return
    
    setIsDownloading(true)
    
    try {
      // Create download link
      const link = document.createElement("a")
      link.href = image.src
      const fileName = `${downloadName.replace(/[^a-z0-9]/gi, "_")}${suffix}.png`
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (error) {
      console.error("Download failed:", error)
    }
    
    setIsDownloading(false)
  }, [project.cover, downloadName])

  // Export separate panels as complete cover PDF (without switching to full mode)
  const handleExportSeparatePanelsAsCover = useCallback(async () => {
    if (!coverDims) return
    
    setIsDownloading(true)
    
    try {
      // Prepare cover data for PDF export
      const exportData = {
        project: {
          ...project,
          cover: {
            ...project.cover,
            frontImage: project.cover.frontImage ? {
              ...project.cover.frontImage,
              data: project.cover.frontImage.src,
            } : undefined,
            backImage: project.cover.backImage ? {
              ...project.cover.backImage,
              data: project.cover.backImage.src,
            } : undefined,
            spineImage: project.cover.spineImage ? {
              ...project.cover.spineImage,
              data: project.cover.spineImage.src,
            } : undefined,
          },
        },
        format: "pdf-cover",
        settings: {
          ...project.exportSettings,
          resolution: 300,
          includeBleed: true,
        },
      }
      
      // Call the backend API
      const response = await fetch("/api/kdp/generate-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(exportData),
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || "PDF export failed")
      }
      
      // Download the PDF
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      const fileName = `${project.name.replace(/[^a-z0-9]/gi, "_")}_cover.pdf`
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      
    } catch (error) {
      console.error("Export error:", error)
      if (error instanceof TypeError && error.message === "Failed to fetch") {
        alert("Cannot connect to server. Make sure the backend is running on port 3001.")
      } else {
        alert(`Failed to export cover PDF: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    } finally {
      setIsDownloading(false)
    }
  }, [project, coverDims])

  // Delete text element
  const handleDeleteTextElement = useCallback((textId: string) => {
    const updatedElements = (project.cover.elements || []).filter(el => el.id !== textId)
    handleUpdateCover({ elements: updatedElements })
    if (selectedTextId === textId) setSelectedTextId(null)
  }, [project.cover.elements, handleUpdateCover, selectedTextId])

  // Delete shape element
  const handleDeleteShape = useCallback((shapeId: string) => {
    const updatedElements = (project.cover.elements || []).filter(el => el.id !== shapeId)
    handleUpdateCover({ elements: updatedElements })
    if (selectedShapeId === shapeId) setSelectedShapeId(null)
  }, [project.cover.elements, handleUpdateCover, selectedShapeId])

  // Fit canvas to view
  const handleFitToView = useCallback(() => {
    if (!canvasContainerRef.current || !coverDims) return
    const containerWidth = canvasContainerRef.current.clientWidth - 32 // padding
    const containerHeight = canvasContainerRef.current.clientHeight - 32
    const canvasWidth = coverDims.totalWidth * 72 // at zoom 1.0
    const canvasHeight = coverDims.totalHeight * 72
    const fitZoom = Math.min(
      containerWidth / canvasWidth,
      containerHeight / canvasHeight,
      2.0 // max zoom
    )
    setCanvasZoom(Math.max(0.3, fitZoom))
  }, [coverDims])

  // Keyboard shortcuts for toolbar actions
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'g' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setShowGuides(g => !g)
      }
      if (e.key === '0' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        handleFitToView()
      }
      if (e.key === '+' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setCanvasZoom(z => Math.min(2.0, z + 0.1))
      }
      if (e.key === '-' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setCanvasZoom(z => Math.max(0.3, z - 0.1))
      }
      
      // DELETE KEY - Remove selected elements
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const activeElement = document.activeElement
        // Don't delete if user is typing in an input
        if (activeElement?.tagName !== 'INPUT' && activeElement?.tagName !== 'TEXTAREA') {
          e.preventDefault()
          
          // Delete selected text element
          if (selectedTextId) {
            handleDeleteTextElement(selectedTextId)
            return
          }
          
          // Delete selected shape element
          if (selectedShapeId) {
            handleDeleteShape(selectedShapeId)
            return
          }
        }
      }
      
      // ESCAPE KEY - Deselect all
      if (e.key === 'Escape') {
        setSelectedTextId(null)
        setSelectedShapeId(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleFitToView, selectedTextId, selectedShapeId, handleDeleteTextElement, handleDeleteShape])

  // Create full cover from separate parts (Confirm Cover)
  // Auto-scales each image to PERFECTLY FILL its designated area for KDP compliance
  const handleCreateFullWrapCover = useCallback(async () => {
    if (!coverDims) return
    
    // VALIDATION: Ensure all images and text are within safe zones
    const safeMargin = 0.125 * 300 // 0.125 inches at 300 DPI
    const violations: string[] = []
    
    // Check panel images (front, back, spine)
    const checkImageInSafeZone = (image: KDPImage | undefined, panel: 'front' | 'back' | 'spine') => {
      if (!image) return
      
      const partWidthDpi = panel === 'spine' ? coverDims.spineWidth * 300 : coverDims.trimWidth * 300
      const partHeightDpi = coverDims.trimHeight * 300
      
      const effectiveScaleX = image.scaleX ?? image.scale
      const effectiveScaleY = image.scaleY ?? image.scale
      const imgWidth = image.originalWidth * effectiveScaleX
      const imgHeight = image.originalHeight * effectiveScaleY
      
      // Check if image extends beyond safe zone
      if (image.position.x < safeMargin) {
        violations.push(`${panel} cover image extends beyond left safe zone`)
      }
      if (image.position.y < safeMargin) {
        violations.push(`${panel} cover image extends beyond top safe zone`)
      }
      if (image.position.x + imgWidth > partWidthDpi - safeMargin) {
        violations.push(`${panel} cover image extends beyond right safe zone`)
      }
      if (image.position.y + imgHeight > partHeightDpi - safeMargin) {
        violations.push(`${panel} cover image extends beyond bottom safe zone`)
      }
    }
    
    checkImageInSafeZone(project.cover.frontImage, 'front')
    checkImageInSafeZone(project.cover.backImage, 'back')
    checkImageInSafeZone(project.cover.spineImage, 'spine')
    
    // Check text elements
    const textElements = project.cover.elements?.filter(el => el.type === 'text') as KDPTextElement[] || []
    for (const textEl of textElements) {
      if (!textEl.coverPart) continue
      
      const dpi = 300
      const trimW = coverDims.trimWidth * dpi
      const trimH = coverDims.trimHeight * dpi
      const spineW = coverDims.spineWidth * dpi
      
      const bounds = {
        back:  { x: safeMargin, y: safeMargin, width: trimW - safeMargin * 2, height: trimH - safeMargin * 2 },
        spine: { x: trimW + safeMargin/2, y: safeMargin, width: spineW - safeMargin, height: trimH - safeMargin * 2 },
        front: { x: trimW + spineW + safeMargin, y: safeMargin, width: trimW - safeMargin * 2, height: trimH - safeMargin * 2 },
      }
      
      const safeArea = bounds[textEl.coverPart]
      
      // Check if text extends beyond safe zone
      if (textEl.position.x < safeArea.x) {
        violations.push(`Text "${textEl.content.substring(0, 20)}..." on ${textEl.coverPart} extends beyond safe zone`)
      }
      if (textEl.position.y < safeArea.y) {
        violations.push(`Text "${textEl.content.substring(0, 20)}..." on ${textEl.coverPart} extends beyond safe zone`)
      }
      if (textEl.position.x + textEl.width > safeArea.x + safeArea.width) {
        violations.push(`Text "${textEl.content.substring(0, 20)}..." on ${textEl.coverPart} extends beyond safe zone`)
      }
      if (textEl.position.y + textEl.height > safeArea.y + safeArea.height) {
        violations.push(`Text "${textEl.content.substring(0, 20)}..." on ${textEl.coverPart} extends beyond safe zone`)
      }
    }
    
    // Skip validation - allow cover creation even if elements extend beyond safe zone
    // Users have full control and can position elements as needed
    
    setIsCreatingFullWrap(true)
    
    try {
      // Create a canvas to composite all parts
      const canvas = document.createElement("canvas")
      const dpi = 300
      const totalWidthPx = Math.round(coverDims.totalWidth * dpi)
      const totalHeightPx = Math.round(coverDims.totalHeight * dpi)
      
      canvas.width = totalWidthPx
      canvas.height = totalHeightPx
      
      const ctx = canvas.getContext("2d")
      if (!ctx) throw new Error("Could not get canvas context")
      
      // Fill with white background
      ctx.fillStyle = "#ffffff"
      ctx.fillRect(0, 0, totalWidthPx, totalHeightPx)
      
      const bleedPx = coverDims.bleed * dpi
      const trimWidthPx = coverDims.trimWidth * dpi
      const trimHeightPx = coverDims.trimHeight * dpi
      const spineWidthPx = coverDims.spineWidth * dpi
      
      // Helper function to parse CSS gradients and create Canvas gradients
      const parseAndCreateGradient = (
        gradientString: string,
        x: number,
        y: number,
        width: number,
        height: number
      ): CanvasGradient | string => {
        // Handle solid colors
        if (!gradientString.includes('gradient')) {
          return gradientString
        }
        
        // Parse linear-gradient
        if (gradientString.startsWith('linear-gradient')) {
          const match = gradientString.match(/linear-gradient\(([^)]+)\)/)
          if (!match) return gradientString
          
          const parts = match[1].split(',').map(s => s.trim())
          let angle = 135 // default
          let colorStops = parts
          
          // Check if first part is an angle
          if (parts[0].includes('deg')) {
            angle = parseFloat(parts[0])
            colorStops = parts.slice(1)
          }
          
          // Convert angle to Canvas line coordinates
          const radians = ((angle - 90) * Math.PI) / 180
          const x1 = x + width / 2 + (Math.cos(radians) * width) / 2
          const y1 = y + height / 2 + (Math.sin(radians) * height) / 2
          const x2 = x + width / 2 - (Math.cos(radians) * width) / 2
          const y2 = y + height / 2 - (Math.sin(radians) * height) / 2
          
          const gradient = ctx.createLinearGradient(x1, y1, x2, y2)
          
          colorStops.forEach(stop => {
            const stopMatch = stop.match(/([#\w()]+)\s+(\d+)%/)
            if (stopMatch) {
              const color = stopMatch[1]
              const position = parseFloat(stopMatch[2]) / 100
              gradient.addColorStop(position, color)
            }
          })
          
          return gradient
        }
        
        // Parse radial-gradient
        if (gradientString.startsWith('radial-gradient')) {
          const centerX = x + width / 2
          const centerY = y + height / 2
          const radius = Math.sqrt(width * width + height * height) / 2
          
          const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius)
          
          const match = gradientString.match(/radial-gradient\([^,]*,\s*(.+)\)/)
          if (match) {
            const colorStops = match[1].split(/,(?![^()]*\))/).map(s => s.trim())
            colorStops.forEach(stop => {
              const stopMatch = stop.match(/([#\w()]+)\s+(\d+)%/)
              if (stopMatch) {
                const color = stopMatch[1]
                const position = parseFloat(stopMatch[2]) / 100
                gradient.addColorStop(position, color)
              }
            })
          }
          
          return gradient
        }
        
        return gradientString
      }
      
      // STEP 1: RENDER PANEL BACKGROUNDS (respects backgroundFitMode for bleed extension)
      const backgrounds = project.cover.panelBackgrounds
      const fitMode = project.cover.backgroundFitMode
      
      // Back panel background
      if (backgrounds?.back) {
        const x = fitMode?.back === 'bleed' ? 0 : bleedPx
        const y = fitMode?.back === 'bleed' ? 0 : bleedPx
        const w = fitMode?.back === 'bleed' ? trimWidthPx + (2 * bleedPx) : trimWidthPx
        const h = fitMode?.back === 'bleed' ? trimHeightPx + (2 * bleedPx) : trimHeightPx
        
        ctx.fillStyle = parseAndCreateGradient(backgrounds.back, x, y, w, h)
        ctx.fillRect(x, y, w, h)
      }
      
      // Spine panel background
      if (backgrounds?.spine) {
        const x = bleedPx + trimWidthPx
        const y = fitMode?.spine === 'bleed' ? 0 : bleedPx
        const w = spineWidthPx
        const h = fitMode?.spine === 'bleed' ? trimHeightPx + (2 * bleedPx) : trimHeightPx
        
        ctx.fillStyle = parseAndCreateGradient(backgrounds.spine, x, y, w, h)
        ctx.fillRect(x, y, w, h)
      }
      
      // Front panel background
      if (backgrounds?.front) {
        const x = bleedPx + trimWidthPx + spineWidthPx
        const y = fitMode?.front === 'bleed' ? 0 : bleedPx
        const w = fitMode?.front === 'bleed' ? trimWidthPx + (2 * bleedPx) : trimWidthPx
        const h = fitMode?.front === 'bleed' ? trimHeightPx + (2 * bleedPx) : trimHeightPx
        
        ctx.fillStyle = parseAndCreateGradient(backgrounds.front, x, y, w, h)
        ctx.fillRect(x, y, w, h)
      }
      
      // Helper to draw an image using the user's exact position and scale settings
      // Respects user positioning and backgrounds instead of auto-filling
      const drawImagePreserveUserSettings = async (
        image: KDPImage | undefined, 
        panelOffsetX: number, 
        panelOffsetY: number
      ) => {
        if (!image?.src) return
        
        return new Promise<void>((resolve) => {
          const img = new window.Image()
          img.onload = () => {
            // Use the user's stored scale values
            const effectiveScaleX = image.scaleX ?? image.scale
            const effectiveScaleY = image.scaleY ?? image.scale
            
            const scaledWidth = img.naturalWidth * effectiveScaleX
            const scaledHeight = img.naturalHeight * effectiveScaleY
            
            // Use the user's stored position (relative to panel)
            const drawX = panelOffsetX + image.position.x
            const drawY = panelOffsetY + image.position.y
            
            ctx.drawImage(img, drawX, drawY, scaledWidth, scaledHeight)
            resolve()
          }
          img.onerror = () => resolve()
          img.src = image.src
        })
      }
      
      // STEP 2: RENDER IMAGES - using user's exact positioning and scaling
      
      // Draw back cover (left side) - using user's position and scale
      if (project.cover.backImage) {
        await drawImagePreserveUserSettings(project.cover.backImage, bleedPx, bleedPx)
      }
      
      // Draw spine (center) - using user's position and scale
      if (project.cover.spineImage) {
        await drawImagePreserveUserSettings(project.cover.spineImage, bleedPx + trimWidthPx, bleedPx)
      }
      
      // Draw front cover (right side) - using user's position and scale
      if (project.cover.frontImage) {
        await drawImagePreserveUserSettings(project.cover.frontImage, bleedPx + trimWidthPx + spineWidthPx, bleedPx)
      }
      
      // STEP 3: RENDER TEXT ELEMENTS
      const textElements = (project.cover.elements || []).filter(
        el => el.type === "text" && el.visible !== false
      ) as KDPTextElement[]
      
      for (const textEl of textElements) {
        // Text positions are stored as ABSOLUTE coordinates in 300 DPI
        // They already include panel offsets, so we only need to add bleed
        const x = bleedPx + textEl.position.x
        const y = bleedPx + textEl.position.y
        
        console.log('Rendering text element:', {
          id: textEl.id,
          content: textEl.content,
          backgroundColor: textEl.backgroundColor,
          backgroundOpacity: textEl.backgroundOpacity,
          position: { x, y },
          width: textEl.width
        })
        
        // STEP 1: Draw background rectangle if backgroundColor is set
        if (textEl.backgroundColor) {
          const bgOpacity = textEl.backgroundOpacity ?? 0.5
          const hexColor = textEl.backgroundColor
          // Convert hex to rgba
          const r = parseInt(hexColor.slice(1, 3), 16)
          const g = parseInt(hexColor.slice(3, 5), 16)
          const b = parseInt(hexColor.slice(5, 7), 16)
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${bgOpacity})`
          
          // Calculate proper height based on text lines
          // IMPORTANT: textEl.width is already in 300 DPI, fontSize is in 72 DPI (display units)
          const displayDpi = 72
          const renderDpi = 300
          const fontSizeScale = renderDpi / displayDpi
          const textBoxWidth = textEl.width // Already in 300 DPI
          const scaledFontSize = textEl.style.fontSize * fontSizeScale
          const lines = textEl.content.split('\n')
          const lineHeight = textEl.style.lineHeight * scaledFontSize
          const totalTextHeight = lines.length * lineHeight
          const padding = 8 * fontSizeScale // Scale padding based on font
          const verticalPadding = 4 * fontSizeScale
          
          console.log('Drawing background:', {
            fillStyle: ctx.fillStyle,
            textAlign: textEl.style.textAlign,
            position: { x, y },
            textBoxWidth,
            fontSizeScale
          })
          
          // Calculate background position based on text alignment
          let bgX = x - padding
          if (textEl.style.textAlign === 'center') {
            bgX = x + textBoxWidth / 2 - (textBoxWidth + padding * 2) / 2
          } else if (textEl.style.textAlign === 'right') {
            bgX = x + textBoxWidth - (textBoxWidth + padding * 2) + padding
          }
          
          // Draw background rectangle with padding
          ctx.fillRect(
            bgX,
            y - verticalPadding,
            textBoxWidth + padding * 2,
            totalTextHeight + verticalPadding * 2
          )
        }
        
        // STEP 2: Set text styles
        const fontStyle = textEl.style.fontStyle === "italic" ? "italic" : "normal"
        const fontWeight = textEl.style.fontWeight === "bold" ? "bold" : "normal"
        // IMPORTANT: fontSize is stored at 72 DPI in the style, but we're rendering at 300 DPI
        // Scale the font size to match the 300 DPI render resolution
        const displayDpi = 72 // Display DPI where fontSize is defined
        const renderDpi = 300 // Render DPI for the output
        const dpiScale = renderDpi / displayDpi
        const fontSize = textEl.style.fontSize * dpiScale
        const fontFamily = textEl.style.fontFamily || "Arial"
        
        ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`
        ctx.fillStyle = textEl.style.color
        ctx.textAlign = textEl.style.textAlign as CanvasTextAlign
        ctx.textBaseline = "top"
        ctx.globalAlpha = textEl.style.opacity ?? 1
        
        // Handle text decoration
        if (textEl.style.textDecoration === "underline") {
          // Note: Canvas doesn't have native underline, but we'll draw the text first
          // For full underline support, we'd need to manually draw a line
        }
        
        // STEP 3: Draw text at position (handle multi-line)
        const lines = textEl.content.split('\n')
        const lineHeight = textEl.style.lineHeight * fontSize
        
        // Calculate text X position based on alignment
        // IMPORTANT: textEl.width is already in 300 DPI coordinates (not display units)
        const textBoxWidth = textEl.width // Already in 300 DPI
        let textX = x
        if (textEl.style.textAlign === 'center') {
          textX = x + textBoxWidth / 2
        } else if (textEl.style.textAlign === 'right') {
          textX = x + textBoxWidth
        }
        
        lines.forEach((line, index) => {
          const lineY = y + (index * lineHeight)
          ctx.fillText(line, textX, lineY)
          
          // Draw underline if needed
          if (textEl.style.textDecoration === "underline") {
            const textWidth = ctx.measureText(line).width
            ctx.strokeStyle = textEl.style.color
            ctx.lineWidth = Math.max(1, fontSize / 20)
            ctx.beginPath()
            
            // Adjust underline position based on text alignment
            let underlineX = textX
            if (textEl.style.textAlign === "center") {
              underlineX = textX - textWidth / 2
            } else if (textEl.style.textAlign === "right") {
              underlineX = textX - textWidth
            }
            
            ctx.moveTo(underlineX, lineY + fontSize + 2)
            ctx.lineTo(underlineX + textWidth, lineY + fontSize + 2)
            ctx.stroke()
          }
        })
        
        // Reset global alpha
        ctx.globalAlpha = 1
      }
      
      // STEP 4: RENDER SHAPE ELEMENTS
      const shapeElements = (project.cover.elements || []).filter(
        el => el.type === "shape" && el.visible !== false
      ) as KDPShapeElement[]
      
      for (const shapeEl of shapeElements) {
        // Shape positions are stored as ABSOLUTE coordinates in 300 DPI
        // They already include panel offsets, so we only need to add bleed
        const x = bleedPx + shapeEl.position.x
        const y = bleedPx + shapeEl.position.y
        
        ctx.save()
        ctx.globalAlpha = shapeEl.style.opacity
        ctx.translate(x + shapeEl.width / 2, y + shapeEl.height / 2)
        ctx.rotate((shapeEl.rotation * Math.PI) / 180)
        ctx.translate(-(x + shapeEl.width / 2), -(y + shapeEl.height / 2))
        
        if (shapeEl.shapeType === 'rectangle') {
          // Fill
          if (shapeEl.style.fill !== 'transparent') {
            ctx.fillStyle = shapeEl.style.fill
            if (shapeEl.style.borderRadius) {
              // Draw rounded rectangle
              const radius = shapeEl.style.borderRadius
              ctx.beginPath()
              ctx.moveTo(x + radius, y)
              ctx.lineTo(x + shapeEl.width - radius, y)
              ctx.quadraticCurveTo(x + shapeEl.width, y, x + shapeEl.width, y + radius)
              ctx.lineTo(x + shapeEl.width, y + shapeEl.height - radius)
              ctx.quadraticCurveTo(x + shapeEl.width, y + shapeEl.height, x + shapeEl.width - radius, y + shapeEl.height)
              ctx.lineTo(x + radius, y + shapeEl.height)
              ctx.quadraticCurveTo(x, y + shapeEl.height, x, y + shapeEl.height - radius)
              ctx.lineTo(x, y + radius)
              ctx.quadraticCurveTo(x, y, x + radius, y)
              ctx.closePath()
              ctx.fill()
            } else {
              ctx.fillRect(x, y, shapeEl.width, shapeEl.height)
            }
          }
          // Stroke
          if (shapeEl.style.strokeWidth > 0) {
            ctx.strokeStyle = shapeEl.style.stroke
            ctx.lineWidth = shapeEl.style.strokeWidth
            if (shapeEl.style.borderRadius) {
              const radius = shapeEl.style.borderRadius
              ctx.beginPath()
              ctx.moveTo(x + radius, y)
              ctx.lineTo(x + shapeEl.width - radius, y)
              ctx.quadraticCurveTo(x + shapeEl.width, y, x + shapeEl.width, y + radius)
              ctx.lineTo(x + shapeEl.width, y + shapeEl.height - radius)
              ctx.quadraticCurveTo(x + shapeEl.width, y + shapeEl.height, x + shapeEl.width - radius, y + shapeEl.height)
              ctx.lineTo(x + radius, y + shapeEl.height)
              ctx.quadraticCurveTo(x, y + shapeEl.height, x, y + shapeEl.height - radius)
              ctx.lineTo(x, y + radius)
              ctx.quadraticCurveTo(x, y, x + radius, y)
              ctx.closePath()
              ctx.stroke()
            } else {
              ctx.strokeRect(x, y, shapeEl.width, shapeEl.height)
            }
          }
        } else if (shapeEl.shapeType === 'circle') {
          const centerX = x + shapeEl.width / 2
          const centerY = y + shapeEl.height / 2
          const radius = Math.min(shapeEl.width, shapeEl.height) / 2
          
          ctx.beginPath()
          ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI)
          
          if (shapeEl.style.fill !== 'transparent') {
            ctx.fillStyle = shapeEl.style.fill
            ctx.fill()
          }
          
          if (shapeEl.style.strokeWidth > 0) {
            ctx.strokeStyle = shapeEl.style.stroke
            ctx.lineWidth = shapeEl.style.strokeWidth
            ctx.stroke()
          }
        } else if (shapeEl.shapeType === 'line') {
          ctx.strokeStyle = shapeEl.style.stroke
          ctx.lineWidth = shapeEl.style.strokeWidth
          ctx.beginPath()
          ctx.moveTo(x, y + shapeEl.height / 2)
          ctx.lineTo(x + shapeEl.width, y + shapeEl.height / 2)
          ctx.stroke()
        } else if (shapeEl.shapeType === 'arrow') {
          const arrowHeadSize = Math.min(shapeEl.width * 0.1, 20)
          ctx.strokeStyle = shapeEl.style.stroke
          ctx.fillStyle = shapeEl.style.stroke
          ctx.lineWidth = shapeEl.style.strokeWidth
          
          // Draw line
          ctx.beginPath()
          ctx.moveTo(x, y + shapeEl.height / 2)
          ctx.lineTo(x + shapeEl.width - arrowHeadSize, y + shapeEl.height / 2)
          ctx.stroke()
          
          // Draw arrowhead
          ctx.beginPath()
          ctx.moveTo(x + shapeEl.width - arrowHeadSize, y)
          ctx.lineTo(x + shapeEl.width, y + shapeEl.height / 2)
          ctx.lineTo(x + shapeEl.width - arrowHeadSize, y + shapeEl.height)
          ctx.closePath()
          ctx.fill()
        }
        
        ctx.restore()
      }
      
      // Convert canvas to data URL
      const dataUrl = canvas.toDataURL("image/png", 1.0)
      
      // Create the full cover image object
      const fullCoverImage: KDPImage = {
        id: generateKDPId("fullcover"),
        src: dataUrl,
        fileName: "full_cover.png",
        originalWidth: totalWidthPx,
        originalHeight: totalHeightPx,
        position: { x: 0, y: 0 },
        scale: 1,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        opacity: 1,
        flipX: false,
        flipY: false,
      }
      
      // Update project with full cover image
      handleUpdateCover({ fullCoverImage })
      
      // Switch to full cover mode
      setCoverMode("full")
      
    } catch (error) {
      console.error("Failed to create full cover:", error)
      alert("Failed to create full cover. Please try again.")
    }
    
    setIsCreatingFullWrap(false)
  }, [coverDims, project.cover, handleUpdateCover])

  // Open crop modal for a cover image
  const handleOpenCrop = useCallback((target: "full" | "front" | "back" | "spine") => {
    let image: KDPImage | undefined
    if (target === "full") image = project.cover.fullCoverImage
    else if (target === "front") image = project.cover.frontImage
    else if (target === "back") image = project.cover.backImage
    else if (target === "spine") image = project.cover.spineImage
    
    if (image) {
      setCropImageData({ target, image })
    }
  }, [project.cover])

  // Handle crop completion
  const handleCropComplete = useCallback(async (croppedSrc: string, cropRect: { x: number; y: number; width: number; height: number }) => {
    if (!cropImageData) return
    
    const { target } = cropImageData
    
    // Get actual dimensions of the cropped image
    const actualDimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve({ width: img.width, height: img.height })
      img.onerror = reject
      img.src = croppedSrc
    })
    
    const updatedImage: KDPImage = {
      ...cropImageData.image,
      src: croppedSrc,
      originalWidth: actualDimensions.width,
      originalHeight: actualDimensions.height,
      cropRect,
      position: { x: 0, y: 0 },
      scale: 1,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
    }
    
    if (target === "full") {
      handleUpdateCover({ fullCoverImage: updatedImage })
    } else if (target === "front") {
      handleUpdateCover({ frontImage: updatedImage })
    } else if (target === "back") {
      handleUpdateCover({ backImage: updatedImage })
    } else if (target === "spine") {
      handleUpdateCover({ spineImage: updatedImage })
    }
    
    setCropImageData(null)
  }, [cropImageData, handleUpdateCover])

  // ============================================================
  // TEXT EDITOR FUNCTIONS
  // ============================================================

  // Add new text element
  const handleAddText = useCallback(() => {
    if (!newTextContent.trim() || !coverDims) return

    const safeMargin = 0.125 * 300 // Safe zone margin in pixels at 300 DPI
    
    // Calculate initial position within safe zone based on cover part
    let posX = safeMargin
    let posY = safeMargin
    
    if (newTextPart === "back") {
      posX = safeMargin
    } else if (newTextPart === "spine") {
      posX = coverDims.trimWidth * 300 + safeMargin
    } else if (newTextPart === "front") {
      posX = (coverDims.trimWidth + coverDims.spineWidth) * 300 + safeMargin
    }

    // Get safe area bounds for the panel
    const safeArea = getPanelSafeArea(newTextPart, coverDims)
    
    // Estimate text dimensions (width and height)
    const estimatedWidth = 200
    const estimatedHeight = 50
    
    // Apply clamping to ensure text starts within safe area
    const clampedPos = clampToPanel(
      { x: posX, y: posY + 50 }, // Slight offset from top
      { width: estimatedWidth, height: estimatedHeight },
      safeArea
    )

    const newTextElement: KDPTextElement = {
      id: generateKDPId("text"),
      type: "text",
      content: newTextContent,
      position: { x: clampedPos.x, y: clampedPos.y },
      width: estimatedWidth,
      height: estimatedHeight,
      rotation: 0,
      coverPart: newTextPart,
      style: {
        ...newTextStyle,
        lineHeight: 1.2,
        letterSpacing: 0,
      },
    }

    const updatedElements = [...(project.cover.elements || []), newTextElement]
    handleUpdateCover({ elements: updatedElements })
    setNewTextContent("")
    setSelectedTextId(newTextElement.id)
  }, [newTextContent, newTextPart, newTextStyle, coverDims, project.cover.elements, handleUpdateCover, getPanelSafeArea, clampToPanel])

  // Update text element
  const handleUpdateTextElement = useCallback((textId: string, updates: Partial<KDPTextElement>) => {
    const updatedElements = (project.cover.elements || []).map(el => {
      if (el.id === textId && el.type === "text") {
        return { ...el, ...updates }
      }
      return el
    })
    handleUpdateCover({ elements: updatedElements })
  }, [project.cover.elements, handleUpdateCover])

  // Add shape element
  const handleAddShape = useCallback((shapeType: 'rectangle' | 'circle' | 'line' | 'arrow') => {
    if (!coverDims) return
    
    const safeArea = getPanelSafeArea(activePanel, coverDims)
    const defaultWidth = shapeType === 'line' ? 200 : 100
    const defaultHeight = shapeType === 'line' || shapeType === 'arrow' ? 4 : 100
    
    const newShape: KDPShapeElement = {
      id: generateKDPId("shape"),
      type: "shape",
      shapeType,
      position: { 
        x: safeArea.x + (safeArea.width - defaultWidth) / 2, 
        y: safeArea.y + (safeArea.height - defaultHeight) / 2 
      },
      width: defaultWidth,
      height: defaultHeight,
      rotation: 0,
      coverPart: activePanel,
      visible: true,
      locked: false,
      style: {
        fill: shapeType === 'line' || shapeType === 'arrow' ? 'transparent' : '#3b82f6',
        stroke: '#3b82f6',
        strokeWidth: shapeType === 'line' || shapeType === 'arrow' ? 4 : 2,
        opacity: 1,
        borderRadius: shapeType === 'rectangle' ? 0 : undefined,
      },
    }
    
    const updatedElements = [...(project.cover.elements || []), newShape]
    handleUpdateCover({ elements: updatedElements })
    setSelectedShapeId(newShape.id)
  }, [coverDims, activePanel, project.cover.elements, handleUpdateCover, getPanelSafeArea])

  // Update shape element
  const handleUpdateShape = useCallback((shapeId: string, updates: Partial<KDPShapeElement>) => {
    const updatedElements = (project.cover.elements || []).map(el => {
      if (el.id === shapeId && el.type === "shape") {
        return { ...el, ...updates }
      }
      return el
    })
    handleUpdateCover({ elements: updatedElements })
  }, [project.cover.elements, handleUpdateCover])

  // Add barcode placeholder
  const handleAddBarcode = useCallback(() => {
    if (!coverDims) return

    const safeMargin = 0.125 * 300
    const barcodeWidth = 150
    const barcodeHeight = 80

    // Position barcode in bottom right of back cover safe zone
    const backCoverWidth = coverDims.trimWidth * 300
    const backCoverHeight = coverDims.trimHeight * 300
    
    const newBarcode: KDPBarcodeElement = {
      id: generateKDPId("barcode"),
      type: "barcode",
      position: { 
        x: backCoverWidth - barcodeWidth - safeMargin * 2,
        y: backCoverHeight - barcodeHeight - safeMargin * 2,
      },
      width: barcodeWidth,
      height: barcodeHeight,
      coverPart: "back",
      isPlaceholder: true,
    }

    const updatedElements = [...(project.cover.elements || []), newBarcode]
    handleUpdateCover({ elements: updatedElements })
  }, [coverDims, project.cover.elements, handleUpdateCover])

  // Remove barcode placeholder
  const handleRemoveBarcode = useCallback(() => {
    const updatedElements = (project.cover.elements || []).filter(el => el.type !== "barcode")
    handleUpdateCover({ elements: updatedElements })
  }, [project.cover.elements, handleUpdateCover])

  // ============================================================
  // COVER EDITOR HANDLERS
  // ============================================================

  // Apply color template to all panel backgrounds
  const applyColorTemplate = useCallback((template: typeof COLOR_TEMPLATES[0]) => {
    handleUpdateCover({
      panelBackgrounds: {
        front: template.front,
        back: template.back,
        spine: template.spine,
      }
    })
    // Track the solid colors for pattern usage
    setPanelSolidColors({
      front: template.front,
      back: template.back,
      spine: template.spine,
    })
    setPanelBgTypes({ front: 'solid', back: 'solid', spine: 'solid' })
    // Optionally update text colors to match template
    // Could add logic here to update text element colors to template.text
  }, [handleUpdateCover])

  // Apply gradient to a panel
  const applyGradientToPanel = useCallback((panel: 'front' | 'back' | 'spine', gradient: string) => {
    handleUpdateCover({
      panelBackgrounds: {
        ...project.cover.panelBackgrounds,
        [panel]: gradient,
      }
    })
    setPanelBgTypes(prev => ({ ...prev, [panel]: 'gradient' }))
  }, [project.cover.panelBackgrounds, handleUpdateCover])

  // Generate custom gradient string
  const generateCustomGradient = useCallback(() => {
    if (customGradient.type === 'linear') {
      return `linear-gradient(${customGradient.angle}deg, ${customGradient.color1} 0%, ${customGradient.color2} 100%)`
    } else {
      return `radial-gradient(circle at center, ${customGradient.color1} 0%, ${customGradient.color2} 100%)`
    }
  }, [customGradient])

  // Apply custom gradient to active panel
  const applyCustomGradient = useCallback(() => {
    const gradientValue = generateCustomGradient()
    applyGradientToPanel(activePanel, gradientValue)
  }, [generateCustomGradient, applyGradientToPanel, activePanel])

  // Apply solid color to a panel
  const applySolidColorToPanel = useCallback((panel: 'front' | 'back' | 'spine', color: string) => {
    handleUpdateCover({
      panelBackgrounds: {
        ...project.cover.panelBackgrounds,
        [panel]: color,
      }
    })
    setPanelSolidColors(prev => ({ ...prev, [panel]: color }))
    setPanelBgTypes(prev => ({ ...prev, [panel]: 'solid' }))
  }, [project.cover.panelBackgrounds, handleUpdateCover])

  // Apply pattern to a panel
  const applyPatternToPanel = useCallback((panel: 'front' | 'back' | 'spine', pattern: typeof PATTERN_PRESETS[0]) => {
    // Use the current solid color for this panel as the pattern background
    const backgroundColor = panelSolidColors[panel] || pattern.bg
    // Store pattern as a special format: pattern|<pattern>|<size>|<bg>
    const patternValue = `pattern|${pattern.value}|${pattern.size}|${backgroundColor}`
    handleUpdateCover({
      panelBackgrounds: {
        ...project.cover.panelBackgrounds,
        [panel]: patternValue,
      }
    })
    setPanelBgTypes(prev => ({ ...prev, [panel]: 'pattern' }))
  }, [panelSolidColors, project.cover.panelBackgrounds, handleUpdateCover])

  // Generate AI background
  const handleGenerateAIBackground = useCallback(async () => {
    if (!aiBgPrompt.trim() || !coverDims) return
    
    setIsGeneratingBg(true)
    
    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `${aiBgPrompt}, seamless background texture, high quality`,
          model: 'gpt-image-1',
          aspectRatio: aiBgPanel === 'spine' ? '1:3' : '2:3',
        }),
      })
      
      if (!response.ok) {
        console.error('Failed to generate background:', await response.text())
        setIsGeneratingBg(false)
        return
      }
      
      const data = await response.json()
      const imageUrl = data.url || data.imageUrl
      
      if (imageUrl) {
        // Apply to selected panel(s)
        const panels = aiBgPanel === 'all' ? ['front', 'back', 'spine'] : [aiBgPanel]
        
        for (const panel of panels) {
          // Store as image background
          handleUpdateCover({
            panelBackgrounds: {
              ...project.cover.panelBackgrounds,
              [panel]: `url(${imageUrl})`,
            }
          })
          setPanelBgTypes(prev => ({ ...prev, [panel]: 'image' }))
        }
        
        setShowAIBgModal(false)
        setAiBgPrompt("")
      }
    } catch (error) {
      console.error('Error generating AI background:', error)
    }
    
    setIsGeneratingBg(false)
  }, [aiBgPrompt, aiBgPanel, coverDims, project.cover.panelBackgrounds, handleUpdateCover])

  // Fit background to trim area (exclude bleed)
  const handleFitBackgroundToTrim = useCallback((panel: 'front' | 'back' | 'spine') => {
    // Check if background exists for this panel
    const currentBg = project.cover.panelBackgrounds?.[panel]
    if (!currentBg) return
    
    // Update the background fit mode to 'trim' for this panel
    const updatedCover = {
      ...project.cover,
      backgroundFitMode: {
        ...project.cover.backgroundFitMode,
        [panel]: 'trim' as const,
      },
    }
    
    onUpdate({ cover: updatedCover })
  }, [project.cover, onUpdate])

  // Fit background to bleed area (full canvas)
  const handleFitBackgroundToBleed = useCallback((panel: 'front' | 'back' | 'spine') => {
    console.log('[Fit to Bleed] Panel:', panel)
    console.log('[Fit to Bleed] Current backgrounds:', project.cover.panelBackgrounds)
    console.log('[Fit to Bleed] Current fit modes:', project.cover.backgroundFitMode)
    
    // Check if background exists for this panel
    const currentBg = project.cover.panelBackgrounds?.[panel]
    if (!currentBg) {
      console.log('[Fit to Bleed] No background for panel:', panel)
      return
    }
    
    // Update the background fit mode to 'bleed' for this panel
    const updatedCover = {
      ...project.cover,
      backgroundFitMode: {
        ...project.cover.backgroundFitMode,
        [panel]: 'bleed' as const,
      },
    }
    
    console.log('[Fit to Bleed] Updated fit mode:', updatedCover.backgroundFitMode)
    
    onUpdate({ cover: updatedCover })
  }, [project.cover, onUpdate])

  // Analyze Cover for KDP Compliance
  const handleAnalyzeCover = useCallback(() => {
    const dpi = 300 // Standard print DPI
    const result = analyzeCover(project, dpi)
    setAnalysisResult(result)
    setShowAnalysisModal(true)
    setShowAnalysisOverlay(true) // Enable overlay visualization
  }, [project])

  // Generate AI Cover Image
  const handleGenerateAICover = useCallback(async () => {
    if (!aiCoverPrompt.trim()) return
    
    setIsGeneratingCover(true)
    
    try {
      // Call the API to generate cover image
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: aiCoverPrompt,
          model: 'z-image-turbo-replicate',
          aspectRatio: activePanel === 'spine' ? '1:3' : coverDims.trimWidth > coverDims.trimHeight ? '3:2' : '2:3',
          imageSize: '1024x1024',
        }),
      })
      
      if (!response.ok) {
        console.error('Failed to generate cover:', await response.text())
        setIsGeneratingCover(false)
        return
      }
      
      const data = await response.json()
      const imageUrl = data.url || data.imageUrl
      
      if (imageUrl) {
        // Get image dimensions
        const dimensions = await new Promise<{ width: number; height: number }>((resolve) => {
          const img = new Image()
          img.onload = () => resolve({ width: img.width, height: img.height })
          img.onerror = () => resolve({ width: 1024, height: 1024 })
          img.src = imageUrl
        })
        
        // Create KDPImage for the panel
        const image: KDPImage = {
          id: generateKDPId("img"),
          src: imageUrl,
          fileName: `ai-cover-${activePanel}.png`,
          originalWidth: dimensions.width,
          originalHeight: dimensions.height,
          position: { x: 0, y: 0 },
          scale: 1,
          rotation: 0,
          opacity: 1,
          flipX: false,
          flipY: false,
        }
        
        // Apply to the active panel
        if (activePanel === 'front') {
          handleUpdateCover({ frontImage: image })
        } else if (activePanel === 'back') {
          handleUpdateCover({ backImage: image })
        } else if (activePanel === 'spine') {
          handleUpdateCover({ spineImage: image })
        }
        
        setShowAICoverModal(false)
        setAICoverPrompt("")
      }
    } catch (error) {
      console.error('Error generating AI cover:', error)
    }
    
    setIsGeneratingCover(false)
  }, [aiCoverPrompt, activePanel, coverDims, handleUpdateCover])

  // Undo full cover - return to separate panel editing
  const handleUndoFullCover = useCallback(() => {
    if (!confirm("Remove the full cover image and return to editing separate panels? The full cover image will be deleted.")) {
      return
    }
    
    handleUpdateCover({ fullCoverImage: undefined })
    setCoverMode("separate")
  }, [handleUpdateCover])

  // Update single panel background color
  const updatePanelBackground = useCallback((panel: 'front' | 'back' | 'spine', color: string) => {
    handleUpdateCover({
      panelBackgrounds: {
        ...project.cover.panelBackgrounds,
        [panel]: color,
      }
    })
  }, [project.cover.panelBackgrounds, handleUpdateCover])

  // Copy color to clipboard
  const handleCopyColor = useCallback(async (color: string) => {
    try {
      await navigator.clipboard.writeText(color)
      setCopiedColor(color)
      setTimeout(() => setCopiedColor(null), 2000)
    } catch (err) {
      console.error('Failed to copy color:', err)
    }
  }, [])

  // Toggle element visibility
  const toggleElementVisible = useCallback((id: string) => {
    const elements = (project.cover.elements || []).map(el =>
      el.id === id ? { ...el, visible: el.visible === false ? true : false } : el
    )
    handleUpdateCover({ elements })
  }, [project.cover.elements, handleUpdateCover])

  // Toggle element lock
  const toggleElementLock = useCallback((id: string) => {
    const elements = (project.cover.elements || []).map(el =>
      el.id === id ? { ...el, locked: !el.locked } : el
    )
    handleUpdateCover({ elements })
  }, [project.cover.elements, handleUpdateCover])

  // Move element to different panel
  const moveElementToPanel = useCallback((id: string, newPanel: 'front' | 'back' | 'spine') => {
    if (!coverDims) return
    
    const safeArea = getPanelSafeArea(newPanel, coverDims)
    const elements = (project.cover.elements || []).map(el => {
      if (el.id !== id || el.type !== 'text') return el
      
      const textEl = el as KDPTextElement
      
      // Apply clamping to ensure text position is within safe area
      const clampedPos = clampToPanel(
        { x: safeArea.x + 20, y: safeArea.y + 20 },
        { width: textEl.width, height: textEl.height },
        safeArea
      )
      
      // Reset to safe position in new panel
      return {
        ...el,
        coverPart: newPanel,
        position: { x: clampedPos.x, y: clampedPos.y },
      }
    })
    handleUpdateCover({ elements })
  }, [coverDims, project.cover.elements, handleUpdateCover, getPanelSafeArea, clampToPanel])

  // Move element up in z-order (appears on top)
  const moveElementUp = useCallback((id: string) => {
    const elements = [...(project.cover.elements || [])]
    const index = elements.findIndex(el => el.id === id)
    if (index < elements.length - 1) {
      // Swap with next element
      [elements[index], elements[index + 1]] = [elements[index + 1], elements[index]]
      handleUpdateCover({ elements })
    }
  }, [project.cover.elements, handleUpdateCover])

  // Move element down in z-order (appears below)
  const moveElementDown = useCallback((id: string) => {
    const elements = [...(project.cover.elements || [])]
    const index = elements.findIndex(el => el.id === id)
    if (index > 0) {
      // Swap with previous element
      [elements[index], elements[index - 1]] = [elements[index - 1], elements[index]]
      handleUpdateCover({ elements })
    }
  }, [project.cover.elements, handleUpdateCover])

  // Add preset text element with predefined style
  const addPresetText = useCallback((preset: { label: string; fontSize: number; fontWeight: 'normal' | 'bold'; part: 'front' | 'back' | 'spine' }) => {
    // Show quick input for text
    setQuickTextType(preset.label.toLowerCase() as 'title' | 'subtitle' | 'author')
    setQuickTextValue("")
    setShowQuickTextInput(true)
  }, [])

  // Handle quick text submission with smart positioning
  const handleQuickTextSubmit = useCallback(() => {
    if (!quickTextValue.trim() || !quickTextType || !coverDims) return

    const safeArea = getPanelSafeArea('front', coverDims)
    
    // Smart positioning based on text type
    const positions = {
      title: { yPercent: 0.20 }, // 20% from top
      subtitle: { yPercent: 0.35 }, // 35% from top
      author: { yPercent: 0.80 }, // 80% from top (bottom)
    }
    
    const styles = {
      title: { fontSize: 48, fontWeight: 'bold' as const },
      subtitle: { fontSize: 28, fontWeight: 'normal' as const },
      author: { fontSize: 20, fontWeight: 'normal' as const },
    }
    
    const position = positions[quickTextType]
    const style = styles[quickTextType]
    
    // Calculate Y position as percentage of safe area height
    const yPos = safeArea.y + (safeArea.height * position.yPercent)
    
    // Center horizontally in safe area
    const estimatedWidth = 400
    const xPos = safeArea.x + (safeArea.width - estimatedWidth) / 2
    
    const newTextElement: KDPTextElement = {
      id: generateKDPId("text"),
      type: "text",
      content: quickTextValue,
      position: { x: xPos, y: yPos },
      width: estimatedWidth,
      height: 60,
      rotation: 0,
      coverPart: 'front',
      style: {
        fontFamily: "Arial",
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        fontStyle: "normal",
        color: "#ffffff", // White by default
        textAlign: "center",
        lineHeight: 1.2,
        letterSpacing: 0,
      },
    }

    const updatedElements = [...(project.cover.elements || []), newTextElement]
    handleUpdateCover({ elements: updatedElements })
    setSelectedTextId(newTextElement.id)
    setShowQuickTextInput(false)
    setQuickTextValue("")
    setQuickTextType(null)
  }, [quickTextValue, quickTextType, coverDims, project.cover.elements, handleUpdateCover, getPanelSafeArea])

  // Handle text alignment (left, center, right) at current Y position
  // This function MOVES the text box to align it, but does NOT change the internal text alignment
  const handleTextAlignment = useCallback((textId: string, alignment: 'left' | 'center' | 'right') => {
    if (!coverDims) return
    const textElement = (project.cover.elements || []).find(el => el.id === textId && el.type === 'text') as KDPTextElement | undefined
    if (!textElement) return
    const safeArea = getPanelSafeArea(textElement.coverPart || 'front', coverDims)
    const margin = 37.5
    
    // Keep the current text box width (don't recalculate based on content)
    const textBoxWidth = textElement.width
    
    let newX = textElement.position.x
    if (alignment === 'left') {
      newX = safeArea.x + margin
    } else if (alignment === 'center') {
      // Center the text box itself (not the text content within it)
      newX = safeArea.x + (safeArea.width - textBoxWidth) / 2
    } else if (alignment === 'right') {
      // Align the right edge of the text box
      newX = safeArea.x + safeArea.width - textBoxWidth - margin
    }
    
    // Update position only - keep all other properties including textAlign
    handleUpdateTextElement(textId, {
      position: { x: newX, y: textElement.position.y }
      // Removed: style: { ...textElement.style, textAlign: alignment }
      // This keeps the text formatting locked as the user requested
    })
  }, [coverDims, project.cover.elements, handleUpdateTextElement, getPanelSafeArea])

  // Helper to get image for a part (used in Images tab)
  const getPartImage = useCallback((part: 'front' | 'back' | 'spine'): KDPImage | undefined => {
    if (part === 'front') return project.cover.frontImage
    if (part === 'back') return project.cover.backImage
    if (part === 'spine') return project.cover.spineImage
    return undefined
  }, [project.cover])

  // Trigger upload for specific panel (used in Images tab)
  const triggerUpload = useCallback((panel: 'front' | 'back' | 'spine') => {
    if (panel === 'front') frontCoverInputRef.current?.click()
    else if (panel === 'back') backCoverInputRef.current?.click()
    else if (panel === 'spine') spineCoverInputRef.current?.click()
  }, [])

  // Get text elements only
  const textElements = (project.cover.elements || []).filter(el => el.type === "text") as KDPTextElement[]
  const shapeElements = (project.cover.elements || []).filter(el => el.type === "shape") as KDPShapeElement[]
  const hasBarcode = (project.cover.elements || []).some(el => el.type === "barcode")

  const hasCover = project.cover.fullCoverImage || project.cover.frontImage
  const hasAnyContent = 
    project.cover.frontImage || 
    project.cover.backImage || 
    project.cover.spineImage ||
    project.cover.panelBackgrounds?.front ||
    project.cover.panelBackgrounds?.back ||
    project.cover.panelBackgrounds?.spine ||
    textElements.length > 0
  const hasSeparateParts = hasAnyContent
  const canProceed = hasCover || hasSeparateParts

  return (
    <div className="flex h-[calc(100vh-120px)] min-h-[700px] gap-4">
      {/* Left Sidebar */}
      <div className="flex h-full">
        {/* Icon Nav Bar */}
        <div className="w-14 bg-[#1a1a1a] flex flex-col items-center py-3 gap-1 border-r border-[#333]">
          {[
            { id: 'cover', icon: ImageIcon, label: 'Cover' },
            { id: 'text', icon: Type, label: 'Text' },
            { id: 'shapes', icon: Square, label: 'Shapes' },
            { id: 'spine', icon: Layers, label: 'Spine' },
            { id: 'images', icon: Upload, label: 'Images' },
            { id: 'backgrounds', icon: Palette, label: 'Colors' },
            { id: 'badges', icon: Award, label: 'Badges' },
            { id: 'elements', icon: Sparkles, label: 'Elements' },
          ].map(item => (
            <button
              key={item.id}
              onClick={() => setEditorTab(item.id as typeof editorTab)}
              className={cn(
                "w-11 h-11 flex flex-col items-center justify-center rounded-lg text-[10px] gap-0.5",
                editorTab === item.id ? "bg-[#2a2a2a] text-cyan-400" : "text-gray-500 hover:text-white hover:bg-[#252525]"
              )}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </button>
          ))}
        </div>
        {/* Content Panel */}
        <div className="w-80 bg-[#1e1e1e] overflow-y-auto">
        {/* Page Count Warning */}
        {effectivePageCount < 24 && (
          <Card className="bg-gradient-to-r from-red-500/20 to-orange-500/20 border-red-500/50">
            <CardContent className="py-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                <div className="text-sm">
                  <div className="font-semibold text-red-400">Invalid Page Count</div>
                  <div className="text-xs text-red-300 mt-1">
                    KDP requires minimum 24 pages. Current: {effectivePageCount}. 
                    Using {Math.max(24, effectivePageCount)} pages for spine calculation.
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        
        {/* Cover Dimensions Info - Compact */}
        {coverDims && (
          <Card className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 border-purple-500/30">
            <CardContent className="py-3">
              <div className="space-y-3 text-sm">
                {/* Page Count Input */}
                <div>
                  <label className="text-[var(--color-text-dim)] text-xs block mb-1">
                    Page Count for Cover Spine:
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="24"
                      max="828"
                      value={project.coverPageCount ?? project.pageCount ?? 24}
                      onChange={(e) => {
                        const value = parseInt(e.target.value) || 24
                        onUpdate({ coverPageCount: value })
                      }}
                      className="flex-1 px-3 py-1.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    {project.coverPageCount !== undefined && project.coverPageCount !== project.pageCount && (
                      <button
                        onClick={() => onUpdate({ coverPageCount: undefined })}
                        className="px-2 py-1.5 text-xs bg-gray-500/20 hover:bg-gray-500/30 text-gray-300 rounded transition-colors"
                        title="Reset to interior page count"
                      >
                        Reset
                      </button>
                    )}
                  </div>
                  {project.coverPageCount !== undefined && project.coverPageCount !== project.pageCount && (
                    <div className="text-xs text-amber-400 mt-1">
                      ⚠ Cover uses {project.coverPageCount} pages, interior has {project.pageCount} pages
                    </div>
                  )}
                </div>
                
                <div className="border-t border-purple-500/20 pt-2">
                  <span className="text-[var(--color-text-dim)] text-xs">Total Cover Size:</span>
                  <div className="font-semibold text-white">
                    {coverDims.totalWidth.toFixed(3)}" × {coverDims.totalHeight.toFixed(3)}"
                  </div>
                  <div className="text-xs text-[var(--color-text-dim)]">
                    {Math.round(coverDims.totalWidth * 300)} × {Math.round(coverDims.totalHeight * 300)} px
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-[var(--color-text-dim)]">Spine:</span>
                    <div className="font-semibold text-white">
                      {coverDims.spineWidth.toFixed(3)}"
                    </div>
                  </div>
                  <div>
                    <span className="text-[var(--color-text-dim)]">Bleed:</span>
                    <div className="font-semibold text-white">
                      {coverDims.bleed}"
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Cover Editor Panel - Always Visible */}
        {coverDims && (
          <Card className="border-[var(--color-border)] overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 bg-gradient-to-r from-blue-500/10 to-cyan-500/10">
              <div className="flex items-center gap-2">
                <Palette className="w-5 h-5 text-blue-500" />
                <span className="font-medium text-white">Cover Editor</span>
              </div>
              <div className="text-xs text-[var(--color-text-muted)] mt-1">
                {textElements.length} text, {[project.cover.frontImage, project.cover.backImage, project.cover.spineImage].filter(Boolean).length} images{hasBarcode ? ', barcode' : ''}
              </div>
            </div>

            {/* Editor Content - Always Visible */}
            <CardContent className="p-4 space-y-4 border-t border-[var(--color-border)]">
              {/* Tab Navigation */}
              <div className="flex border-b border-[var(--color-border)] -mx-4 px-4 -mt-4 pt-4 mb-4 overflow-x-auto">
                {(['text', 'images', 'backgrounds', 'layers'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setEditorTab(tab)}
                    className={cn(
                      "flex-shrink-0 flex flex-col items-center gap-1 py-2 px-3 text-xs font-medium transition-colors border-b-2 -mb-px",
                      editorTab === tab
                        ? "border-blue-500 text-blue-600"
                        : "border-transparent text-[var(--color-text-muted)] hover:text-white hover:border-[var(--color-border)]"
                    )}
                    title={tab.charAt(0).toUpperCase() + tab.slice(1)}
                  >
                    {tab === 'text' && <Type className="w-4 h-4" />}
                    {tab === 'images' && <ImageIcon className="w-4 h-4" />}
                    {tab === 'backgrounds' && <Palette className="w-4 h-4" />}
                    {tab === 'layers' && <Layers className="w-4 h-4" />}
                    <span className="capitalize">{tab}</span>
                  </button>
                ))}
              </div>

              {/* Cover Tab */}
              {editorTab === 'cover' && (
                <div className="space-y-4">
                  <div className="border-b-2 border-pink-500 px-4 py-2">
                    <h3 className="text-white font-medium text-sm">Cover Setup</h3>
                  </div>
                  <div className="px-4 space-y-4">
                    <p className="text-sm text-gray-400">Configure your cover dimensions and basic settings.</p>
                  </div>
                </div>
              )}

              {/* Spine Tab */}
              {editorTab === 'spine' && (
                <div className="space-y-4">
                  <div className="border-b-2 border-pink-500 px-4 py-2">
                    <h3 className="text-white font-medium text-sm">Spine Editor</h3>
                  </div>
                  <div className="px-4 space-y-4">
                    <p className="text-sm text-gray-400">Add text and images to your book spine.</p>
                  </div>
                </div>
              )}

              {/* Text Tab */}
              {editorTab === 'text' && (
                <>
                  <div className="border-b-2 border-pink-500 px-4 py-2">
                    <h3 className="text-white font-medium text-sm">Text Elements</h3>
                  </div>
                  {/* Add New Text */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-white flex items-center gap-2">
                      <Plus className="w-4 h-4" />
                      Add Text
                    </h4>
                    
                    {/* Quick add presets */}
                    <div className="flex flex-wrap gap-2">
                      {[
                        { label: 'Title', fontSize: 48, fontWeight: 'bold' as const, part: 'front' as const },
                        { label: 'Subtitle', fontSize: 28, fontWeight: 'normal' as const, part: 'front' as const },
                        { label: 'Author', fontSize: 20, fontWeight: 'normal' as const, part: 'front' as const },
                      ].map(preset => (
                        <Button
                          key={preset.label}
                          variant="outline"
                          size="sm"
                          onClick={() => addPresetText(preset)}
                          className="gap-1"
                        >
                          <Plus className="w-3 h-3" />
                          {preset.label}
                        </Button>
                      ))}
                    </div>

                    {/* Quick Text Input Popup */}
                    {showQuickTextInput && quickTextType && (
                      <Card className="border-blue-500 bg-blue-500/5">
                        <CardContent className="py-3">
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={quickTextValue}
                              onChange={(e) => setQuickTextValue(e.target.value)}
                              placeholder={`Enter ${quickTextType}...`}
                              className="flex-1 px-3 py-2 bg-[#2a2a2a] border border-[#444] rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleQuickTextSubmit()
                                if (e.key === 'Escape') {
                                  setShowQuickTextInput(false)
                                  setQuickTextValue("")
                                }
                              }}
                              autoFocus
                            />
                            <Button onClick={handleQuickTextSubmit} disabled={!quickTextValue.trim()} size="sm">
                              Add {quickTextType}
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => {
                                setShowQuickTextInput(false)
                                setQuickTextValue("")
                              }}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                          <p className="text-xs text-[var(--color-text-muted)] mt-2">
                            Will be placed on front cover with white text
                          </p>
                        </CardContent>
                      </Card>
                    )}
                
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newTextContent}
                      onChange={(e) => setNewTextContent(e.target.value)}
                      placeholder="Enter text..."
                      className="flex-1 px-3 py-2 bg-[#2a2a2a] border border-[#444] rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      onKeyDown={(e) => e.key === 'Enter' && handleAddText()}
                    />
                    <Button onClick={handleAddText} disabled={!newTextContent.trim()} size="sm">
                      <Plus className="w-4 h-4 mr-1" />
                      Add
                    </Button>
                  </div>
                  
                  {/* Visual Panel Selector */}
                  <div className="pt-2">
                    <label className="block text-xs text-[var(--color-text-muted)] mb-2">Add text to panel:</label>
                    <div className="flex gap-2">
                      {(['front', 'back', 'spine'] as const).map(panel => (
                        <button
                          key={panel}
                          onClick={() => setNewTextPart(panel)}
                          className={cn(
                            "flex-1 p-2 rounded-lg border-2 transition-all",
                            newTextPart === panel 
                              ? "border-pink-500 bg-pink-500/10" 
                              : "border-[#333] bg-[#1a1a1a] hover:border-pink-500/50"
                          )}
                        >
                          {/* Mini Cover Icon */}
                          <div className="flex h-10 rounded overflow-hidden mb-1.5 mx-auto max-w-[60px]">
                            {/* Back panel */}
                            <div className={cn(
                              "flex-1 transition-colors",
                              panel === 'back' ? "bg-pink-500" : "bg-[#333]"
                            )} />
                            {/* Spine */}
                            <div className={cn(
                              "w-1 transition-colors",
                              panel === 'spine' ? "bg-pink-500" : "bg-[#444]"
                            )} />
                            {/* Front panel */}
                            <div className={cn(
                              "flex-1 transition-colors",
                              panel === 'front' ? "bg-pink-500" : "bg-[#333]"
                            )} />
                          </div>
                          <span className={cn(
                            "text-xs font-medium block text-center",
                            newTextPart === panel ? "text-pink-400" : "text-[#888]"
                          )}>
                            {panel === 'front' ? 'Front' : panel === 'back' ? 'Back' : 'Spine'}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Barcode Placeholder */}
              <div className="pt-3 border-t border-[var(--color-border)]">
                <h4 className="text-sm font-medium text-white flex items-center gap-2 mb-2">
                  <Barcode className="w-4 h-4" />
                  Barcode Placeholder
                  <span className="text-xs text-[var(--color-text-muted)]">(preview only, not in export)</span>
                </h4>
                {hasBarcode ? (
                  <Button variant="outline" size="sm" onClick={handleRemoveBarcode} className="gap-2 text-red-500 border-red-500/50 hover:bg-red-500/10">
                    <X className="w-4 h-4" />
                    Remove Barcode
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={handleAddBarcode} className="gap-2">
                    <Plus className="w-4 h-4" />
                    Add Barcode to Back Cover
                  </Button>
                )}
              </div>

              {/* Text Elements List */}
              {textElements.length > 0 && (
                <div className="pt-3 border-t border-[var(--color-border)]">
                  <h4 className="text-sm font-medium text-white mb-2">Text Elements</h4>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {textElements.map(text => (
                      <div
                        key={text.id}
                        className={cn(
                          "flex items-center gap-2 p-2 rounded-lg border transition-colors cursor-pointer",
                          selectedTextId === text.id
                            ? "border-blue-500 bg-blue-500/10"
                            : "border-[var(--color-border)] hover:border-blue-300"
                        )}
                        onClick={() => setSelectedTextId(text.id)}
                      >
                        <span className={cn(
                          "px-1.5 py-0.5 rounded text-[10px] font-medium",
                          text.coverPart === "front" ? "bg-purple-500/20 text-purple-400" :
                          text.coverPart === "back" ? "bg-blue-500/20 text-blue-400" :
                          "bg-green-500/20 text-green-400"
                        )}>
                          {text.coverPart?.toUpperCase() || "?"}
                        </span>
                        <span className="flex-1 text-sm text-white truncate" style={{
                          fontFamily: text.style.fontFamily,
                          fontWeight: text.style.fontWeight,
                          fontStyle: text.style.fontStyle,
                        }}>
                          {text.content}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteTextElement(text.id)
                          }}
                          className="p-1 text-red-500 hover:bg-red-500/10 rounded"
                          title="Delete text"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Selected Text Editor */}
              {selectedTextId && (() => {
                const selectedText = textElements.find(t => t.id === selectedTextId)
                if (!selectedText) return null
                return (
                  <div className="pt-3 border-t border-[var(--color-border)] space-y-2">
                    <h4 className="text-sm font-medium text-white flex items-center gap-2">
                      <Type className="w-4 h-4 text-cyan-400" />
                      Edit Selected Text
                    </h4>
                    
                    {/* Row 1: Content input (full width) */}
                    <div>
                      <input
                        type="text"
                        value={selectedText.content}
                        onChange={(e) => handleUpdateTextElement(selectedTextId, { content: e.target.value })}
                        className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#444] rounded text-white text-sm"
                        placeholder="Text content"
                      />
                    </div>
                    
                    {/* Row 2: Font dropdown (60%) + Size slider (40%) - inline */}
                    <div className="flex items-center gap-2">
                      <select
                        value={selectedText.style.fontFamily}
                        onChange={(e) => handleUpdateTextElement(selectedTextId, { style: { ...selectedText.style, fontFamily: e.target.value } })}
                        className="w-[60%] px-2 py-1.5 bg-[#2a2a2a] border border-[#444] rounded text-white text-xs"
                      >
                        <option value="Arial">Arial</option>
                        <option value="Times New Roman">Times New Roman</option>
                        <option value="Georgia">Georgia</option>
                        <option value="Verdana">Verdana</option>
                        <option value="Impact">Impact</option>
                      </select>
                      <div className="w-[40%] flex items-center gap-1">
                        <input
                          type="range"
                          min="8"
                          max="200"
                          value={selectedText.style.fontSize}
                          onChange={(e) => handleUpdateTextElement(selectedTextId, { style: { ...selectedText.style, fontSize: parseInt(e.target.value) } })}
                          className="flex-1"
                        />
                        <input
                          type="number"
                          min="8"
                          max="200"
                          value={selectedText.style.fontSize}
                          onChange={(e) => {
                            const value = parseInt(e.target.value) || 8
                            const clampedValue = Math.max(8, Math.min(200, value))
                            handleUpdateTextElement(selectedTextId, { style: { ...selectedText.style, fontSize: clampedValue } })
                          }}
                          className="w-14 px-1.5 py-0.5 bg-pink-500 text-white text-xs rounded text-center"
                        />
                      </div>
                    </div>
                    
                    {/* Row 3: Color picker + hex input + Style buttons (B/I) + Alignment (L/C/R) + Rotation - all inline */}
                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        value={selectedText.style.color}
                        onChange={(e) => handleUpdateTextElement(selectedTextId, { style: { ...selectedText.style, color: e.target.value } })}
                        className="w-8 h-8 rounded cursor-pointer border border-[#444] bg-transparent"
                      />
                      <input
                        type="text"
                        value={selectedText.style.color}
                        onChange={(e) => handleUpdateTextElement(selectedTextId, { style: { ...selectedText.style, color: e.target.value } })}
                        className="w-16 px-1 py-1 bg-[#2a2a2a] border border-[#444] rounded text-white text-xs font-mono"
                      />
                      <button
                        onClick={() => handleUpdateTextElement(selectedTextId, { style: { ...selectedText.style, fontWeight: selectedText.style.fontWeight === 'bold' ? 'normal' : 'bold' } })}
                        className={cn("p-1.5 rounded border", selectedText.style.fontWeight === 'bold' ? "bg-blue-500 border-blue-500 text-white" : "border-[#444] text-gray-400 hover:text-white")}
                      >
                        <Bold className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleUpdateTextElement(selectedTextId, { style: { ...selectedText.style, fontStyle: selectedText.style.fontStyle === 'italic' ? 'normal' : 'italic' } })}
                        className={cn("p-1.5 rounded border", selectedText.style.fontStyle === 'italic' ? "bg-blue-500 border-blue-500 text-white" : "border-[#444] text-gray-400 hover:text-white")}
                      >
                        <Italic className="w-3.5 h-3.5" />
                      </button>
                      <div className="flex rounded border border-[#444] overflow-hidden">
                        {(['left', 'center', 'right'] as const).map(align => (
                          <button
                            key={align}
                            onClick={() => handleTextAlignment(selectedTextId, align)}
                            className={cn("p-1.5 text-gray-400 hover:text-white")}
                            title={`Move text box to ${align}`}
                          >
                            {align === 'left' && <AlignLeft className="w-3.5 h-3.5" />}
                            {align === 'center' && <AlignCenter className="w-3.5 h-3.5" />}
                            {align === 'right' && <AlignRight className="w-3.5 h-3.5" />}
                          </button>
                        ))}
                      </div>
                      {/* Rotation buttons */}
                      <div className="flex rounded border border-[#444] overflow-hidden ml-1">
                        <button
                          onClick={() => handleUpdateTextElement(selectedTextId, { rotation: 0 })}
                          className={cn("p-1.5 text-gray-400 hover:text-white", selectedText.rotation === 0 && "bg-blue-500 text-white")}
                          title="Horizontal (0°)"
                        >
                          <span className="text-xs font-bold">☰</span>
                        </button>
                        <button
                          onClick={() => handleUpdateTextElement(selectedTextId, { rotation: 90 })}
                          className={cn("p-1.5 text-gray-400 hover:text-white", selectedText.rotation === 90 && "bg-blue-500 text-white")}
                          title="Vertical up (90°)"
                        >
                          <span className="text-xs font-bold" style={{ transform: 'rotate(90deg)', display: 'inline-block' }}>☰</span>
                        </button>
                        <button
                          onClick={() => handleUpdateTextElement(selectedTextId, { rotation: -90 })}
                          className={cn("p-1.5 text-gray-400 hover:text-white", selectedText.rotation === -90 && "bg-blue-500 text-white")}
                          title="Vertical down (-90°)"
                        >
                          <span className="text-xs font-bold" style={{ transform: 'rotate(-90deg)', display: 'inline-block' }}>☰</span>
                        </button>
                      </div>
                    </div>
                    
                    {/* Row 4: Color palette - 16 colors (2 rows of 8) */}
                    <div className="grid grid-cols-8 gap-1">
                      {['#ffffff', '#000000', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff',
                        '#f8f8f8', '#333333', '#ff6b6b', '#51cf66', '#339af0', '#fcc419', '#cc5de8', '#22b8cf'].map(color => (
                        <button
                          key={color}
                          onClick={() => handleUpdateTextElement(selectedTextId, { style: { ...selectedText.style, color } })}
                          className="w-6 h-6 rounded border border-[#555] hover:scale-110 transition-transform"
                          style={{ backgroundColor: color }}
                          title={color}
                        />
                      ))}
                    </div>
                    
                    {/* Row 5: Opacity slider (full width) */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">Opacity</span>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={Math.round((selectedText.style.opacity ?? 1) * 100)}
                        onChange={(e) => handleUpdateTextElement(selectedTextId, { style: { ...selectedText.style, opacity: parseInt(e.target.value) / 100 } })}
                        className="flex-1"
                      />
                      <span className="px-1.5 py-0.5 bg-cyan-500 text-white text-xs rounded min-w-[36px] text-center">
                        {Math.round((selectedText.style.opacity ?? 1) * 100)}%
                      </span>
                    </div>
                    
                    {/* Row: Background Color Controls */}
                    <div className="space-y-2 pt-2 border-t border-[#444]">
                      <label className="text-xs text-gray-400 font-semibold">Text Box Background:</label>
                      
                      {/* Background color picker + opacity */}
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={selectedText.backgroundColor || '#000000'}
                          onChange={(e) => handleUpdateTextElement(selectedTextId, { 
                            backgroundColor: e.target.value,
                            backgroundOpacity: selectedText.backgroundOpacity ?? 0.5
                          })}
                          className="w-10 h-8 rounded cursor-pointer border border-[#444]"
                        />
                        <input
                          type="text"
                          value={selectedText.backgroundColor || 'transparent'}
                          onChange={(e) => handleUpdateTextElement(selectedTextId, { 
                            backgroundColor: e.target.value,
                            backgroundOpacity: selectedText.backgroundOpacity ?? 0.5
                          })}
                          className="flex-1 px-2 py-1 bg-[#2a2a2a] border border-[#444] rounded text-white text-xs font-mono"
                          placeholder="transparent"
                        />
                        {selectedText.backgroundColor && (
                          <button
                            onClick={() => handleUpdateTextElement(selectedTextId, { 
                              backgroundColor: undefined,
                              backgroundOpacity: undefined
                            })}
                            className="p-1 text-red-400 hover:text-red-300"
                            title="Remove background"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      
                      {/* Background opacity slider (only show if background color is set) */}
                      {selectedText.backgroundColor && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400">BG Opacity</span>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={Math.round((selectedText.backgroundOpacity ?? 0.5) * 100)}
                            onChange={(e) => handleUpdateTextElement(selectedTextId, { 
                              backgroundOpacity: parseInt(e.target.value) / 100 
                            })}
                            className="flex-1"
                          />
                          <span className="px-1.5 py-0.5 bg-purple-500 text-white text-xs rounded min-w-[36px] text-center">
                            {Math.round((selectedText.backgroundOpacity ?? 0.5) * 100)}%
                          </span>
                        </div>
                      )}
                      
                      {/* Quick preset buttons */}
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleUpdateTextElement(selectedTextId, { 
                            backgroundColor: '#000000',
                            backgroundOpacity: 0.7
                          })}
                          className="flex-1 py-1 px-2 rounded text-xs bg-black text-white border border-[#444] hover:border-white"
                          title="Black semi-transparent"
                        >
                          Black
                        </button>
                        <button
                          onClick={() => handleUpdateTextElement(selectedTextId, { 
                            backgroundColor: '#ffffff',
                            backgroundOpacity: 0.7
                          })}
                          className="flex-1 py-1 px-2 rounded text-xs bg-white text-black border border-[#444] hover:border-white"
                          title="White semi-transparent"
                        >
                          White
                        </button>
                        <button
                          onClick={() => handleUpdateTextElement(selectedTextId, { 
                            backgroundColor: undefined,
                            backgroundOpacity: undefined
                          })}
                          className="flex-1 py-1 px-2 rounded text-xs bg-transparent text-gray-400 border border-[#444] hover:text-white hover:border-white"
                          title="No background"
                        >
                          None
                        </button>
                      </div>
                    </div>
                    
                    {/* Row 6: Panel buttons (Front/Back/Spine) - inline */}
                    <div className="flex gap-1">
                      {(['front', 'back', 'spine'] as const).map(panel => (
                        <button
                          key={panel}
                          onClick={() => moveElementToPanel(selectedTextId, panel)}
                          className={cn("flex-1 py-1.5 rounded text-xs font-medium", selectedText.coverPart === panel ? "bg-cyan-500 text-white" : "bg-[#2a2a2a] text-gray-400 hover:text-white border border-[#444]")}
                        >
                          {panel.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })()}
                </>
              )}

              {/* Shapes Tab */}
              {editorTab === 'shapes' && (
                <div className="space-y-4">
                  <div className="border-b-2 border-emerald-500 px-4 py-2">
                    <h3 className="text-white font-medium text-sm">Shape Tools</h3>
                  </div>
                  
                  {/* Panel selector */}
                  <div className="px-4">
                    <span className="text-xs text-gray-400 block mb-2">Add shape to:</span>
                    <div className="flex gap-2">
                      {(['front', 'back', 'spine'] as const).map(panel => (
                        <Button
                          key={panel}
                          variant={activePanel === panel ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setActivePanel(panel)}
                          className="flex-1"
                        >
                          {panel.toUpperCase()}
                        </Button>
                      ))}
                    </div>
                  </div>
                  
                  {/* Shape type buttons */}
                  <div className="px-4 space-y-2">
                    <h4 className="text-xs font-semibold text-gray-400 mb-2">Insert Shape:</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        onClick={() => handleAddShape('rectangle')}
                        className="gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700"
                      >
                        <Square className="w-4 h-4" />
                        Rectangle
                      </Button>
                      <Button
                        onClick={() => handleAddShape('circle')}
                        className="gap-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700"
                      >
                        <Circle className="w-4 h-4" />
                        Circle
                      </Button>
                      <Button
                        onClick={() => handleAddShape('line')}
                        className="gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                      >
                        <Minus className="w-4 h-4" />
                        Line
                      </Button>
                      <Button
                        onClick={() => handleAddShape('arrow')}
                        className="gap-2 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700"
                      >
                        <ArrowRight className="w-4 h-4" />
                        Arrow
                      </Button>
                    </div>
                  </div>
                  
                  {/* Shape editor (when shape is selected) */}
                  {selectedShapeId && (() => {
                    const selectedShape = (project.cover.elements || []).find(el => el.id === selectedShapeId && el.type === 'shape') as KDPShapeElement | undefined
                    if (!selectedShape) return null
                    
                    return (
                      <div className="px-4 space-y-3 pt-3 border-t-2 border-emerald-500/30">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-semibold text-white capitalize">{selectedShape.shapeType} Settings</h4>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteShape(selectedShapeId)}
                            className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                        
                        {/* Fill Color */}
                        {selectedShape.shapeType !== 'line' && selectedShape.shapeType !== 'arrow' && (
                          <div>
                            <label className="text-xs text-gray-400 block mb-1">Fill Color</label>
                            <div className="flex items-center gap-2">
                              <input
                                type="color"
                                value={selectedShape.style.fill}
                                onChange={(e) => handleUpdateShape(selectedShapeId, { 
                                  style: { ...selectedShape.style, fill: e.target.value } 
                                })}
                                className="w-12 h-8 rounded border border-[#555] cursor-pointer"
                              />
                              <input
                                type="text"
                                value={selectedShape.style.fill}
                                onChange={(e) => handleUpdateShape(selectedShapeId, { 
                                  style: { ...selectedShape.style, fill: e.target.value } 
                                })}
                                className="flex-1 px-2 py-1 bg-[#2a2a2a] border border-[#555] rounded text-xs text-white"
                              />
                            </div>
                          </div>
                        )}
                        
                        {/* Stroke Color */}
                        <div>
                          <label className="text-xs text-gray-400 block mb-1">Stroke Color</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={selectedShape.style.stroke}
                              onChange={(e) => handleUpdateShape(selectedShapeId, { 
                                style: { ...selectedShape.style, stroke: e.target.value } 
                              })}
                              className="w-12 h-8 rounded border border-[#555] cursor-pointer"
                            />
                            <input
                              type="text"
                              value={selectedShape.style.stroke}
                              onChange={(e) => handleUpdateShape(selectedShapeId, { 
                                style: { ...selectedShape.style, stroke: e.target.value } 
                              })}
                              className="flex-1 px-2 py-1 bg-[#2a2a2a] border border-[#555] rounded text-xs text-white"
                            />
                          </div>
                        </div>
                        
                        {/* Stroke Width */}
                        <div>
                          <label className="text-xs text-gray-400 block mb-1">Stroke Width: {selectedShape.style.strokeWidth}px</label>
                          <input
                            type="range"
                            min="0"
                            max="20"
                            value={selectedShape.style.strokeWidth}
                            onChange={(e) => handleUpdateShape(selectedShapeId, { 
                              style: { ...selectedShape.style, strokeWidth: parseInt(e.target.value) } 
                            })}
                            className="w-full"
                          />
                        </div>
                        
                        {/* Border Radius (rectangles only) */}
                        {selectedShape.shapeType === 'rectangle' && (
                          <div>
                            <label className="text-xs text-gray-400 block mb-1">Corner Radius: {selectedShape.style.borderRadius || 0}px</label>
                            <input
                              type="range"
                              min="0"
                              max="50"
                              value={selectedShape.style.borderRadius || 0}
                              onChange={(e) => handleUpdateShape(selectedShapeId, { 
                                style: { ...selectedShape.style, borderRadius: parseInt(e.target.value) } 
                              })}
                              className="w-full"
                            />
                          </div>
                        )}
                        
                        {/* Opacity */}
                        <div>
                          <label className="text-xs text-gray-400 block mb-1">Opacity: {Math.round(selectedShape.style.opacity * 100)}%</label>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={Math.round(selectedShape.style.opacity * 100)}
                            onChange={(e) => handleUpdateShape(selectedShapeId, { 
                              style: { ...selectedShape.style, opacity: parseInt(e.target.value) / 100 } 
                            })}
                            className="w-full"
                          />
                        </div>
                        
                        {/* Panel buttons */}
                        <div>
                          <label className="text-xs text-gray-400 block mb-1">Move to Panel:</label>
                          <div className="flex gap-1">
                            {(['front', 'back', 'spine'] as const).map(panel => (
                              <button
                                key={panel}
                                onClick={() => handleUpdateShape(selectedShapeId, { coverPart: panel })}
                                className={cn("flex-1 py-1.5 rounded text-xs font-medium", 
                                  selectedShape.coverPart === panel ? "bg-emerald-500 text-white" : "bg-[#2a2a2a] text-gray-400 hover:text-white border border-[#444]"
                                )}
                              >
                                {panel.toUpperCase()}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )
                  })()}
                  
                  {/* Quick color presets */}
                  <div className="px-4">
                    <h4 className="text-xs font-semibold text-gray-400 mb-2">Quick Colors:</h4>
                    <div className="grid grid-cols-8 gap-1">
                      {['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6',
                        '#ffffff', '#000000', '#64748b', '#f97316', '#06b6d4', '#a855f7', '#84cc16', '#f43f5e'].map(color => (
                        <button
                          key={color}
                          onClick={() => {
                            if (selectedShapeId) {
                              const shape = (project.cover.elements || []).find(el => el.id === selectedShapeId && el.type === 'shape') as KDPShapeElement | undefined
                              if (shape) {
                                handleUpdateShape(selectedShapeId, { 
                                  style: { 
                                    ...shape.style, 
                                    fill: shape.shapeType !== 'line' && shape.shapeType !== 'arrow' ? color : 'transparent',
                                    stroke: color 
                                  } 
                                })
                              }
                            }
                          }}
                          disabled={!selectedShapeId}
                          className="w-7 h-7 rounded border-2 border-[#555] hover:scale-110 transition-transform disabled:opacity-30 disabled:cursor-not-allowed"
                          style={{ backgroundColor: color }}
                          title={color}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Images Tab */}
              {editorTab === 'images' && (
                <div className="space-y-4">
                  <div className="border-b-2 border-pink-500 px-4 py-2">
                    <h3 className="text-white font-medium text-sm">Image Manager</h3>
                  </div>
                  {/* Panel selector for image placement */}
                  <div className="flex gap-2">
                    <span className="text-sm text-white">Add image to:</span>
                    {(['front', 'back', 'spine'] as const).map(panel => (
                      <Button
                        key={panel}
                        variant={activePanel === panel ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setActivePanel(panel)}
                      >
                        {panel.toUpperCase()}
                      </Button>
                    ))}
                  </div>
                  
                  {/* AI Cover Generator Button */}
                  <Button
                    onClick={() => setShowAICoverModal(true)}
                    className="w-full gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                  >
                    <Wand2 className="w-4 h-4" />
                    Generate AI Cover for {activePanel.toUpperCase()}
                  </Button>
                  
                  {/* Upload dropzone */}
                  <div
                    className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors hover:border-blue-500 hover:bg-blue-500/5"
                    onClick={() => triggerUpload(activePanel)}
                  >
                    <Upload className="w-8 h-8 mx-auto mb-2 text-[var(--color-text-muted)]" />
                    <p className="text-sm text-[var(--color-text-muted)]">Drop image or click to upload to <strong>{activePanel}</strong> cover</p>
                  </div>
                  
                  {/* Image list per panel */}
                  <div className="space-y-2">
                    {(['front', 'back', 'spine'] as const).map(panel => {
                      const img = getPartImage(panel)
                      if (!img) return null
                      return (
                        <div key={panel} className="flex items-center gap-2 p-2 rounded border border-[var(--color-border)] bg-[var(--color-surface)]">
                          <img src={img.src} className="w-12 h-12 object-cover rounded" alt={`${panel} cover`} />
                          <span className="flex-1 font-medium text-sm text-white capitalize">{panel} Cover</span>
                          <Button size="sm" variant="outline" onClick={() => handleOpenCrop(panel)}>
                            <Crop className="w-3 h-3 mr-1" />
                            Crop
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleDeleteCover(panel)} className="text-red-500 hover:bg-red-500/10">
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Backgrounds Tab */}
              {editorTab === 'backgrounds' && (
                <div className="space-y-4">
                  <div className="border-b-2 border-pink-500 px-4 py-2">
                    <h3 className="text-white font-medium text-sm">Background Styles</h3>
                  </div>
                  
                  {/* AI Background Generation Button */}
                  <Button
                    onClick={() => setShowAIBgModal(true)}
                    className="w-full gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                  >
                    <Wand2 className="w-4 h-4" />
                    Generate AI Background
                  </Button>
                  
                  {/* Color Templates Gallery */}
                  <div>
                    <h4 className="text-sm font-medium text-white mb-2">Solid Color Templates</h4>
                    <div className="grid grid-cols-4 gap-2">
                      {COLOR_TEMPLATES.map(template => (
                        <button
                          key={template.name}
                          onClick={() => applyColorTemplate(template)}
                          className="p-2 rounded border border-[var(--color-border)] hover:border-blue-500 transition-colors"
                          title={template.name}
                        >
                          <div className="flex h-6 rounded overflow-hidden mb-1 shadow-sm">
                            <div style={{ background: template.back, flex: 1 }} />
                            <div style={{ background: template.spine, width: 4 }} />
                            <div style={{ background: template.front, flex: 1 }} />
                          </div>
                          <span className="text-[10px] text-[var(--color-text-muted)] truncate block">{template.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Custom Color Picker for Individual Panel */}
                  <div>
                    <h4 className="text-sm font-medium text-white mb-2">Custom Solid Color</h4>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={panelSolidColors[activePanel]}
                        onChange={(e) => applySolidColorToPanel(activePanel, e.target.value)}
                        className="w-12 h-12 rounded border border-[var(--color-border)] cursor-pointer bg-transparent"
                      />
                      <div className="flex-1">
                        <input
                          type="text"
                          value={panelSolidColors[activePanel]}
                          onChange={(e) => applySolidColorToPanel(activePanel, e.target.value)}
                          className="w-full px-3 py-2 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded text-sm text-white font-mono"
                          placeholder="#000000"
                        />
                        <p className="text-xs text-[var(--color-text-muted)] mt-1">
                          Applies to: <span className="text-blue-400 font-medium uppercase">{activePanel}</span> panel
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  {/* Gradient Presets */}
                  <div>
                    <h4 className="text-sm font-medium text-white mb-2">Gradient Presets</h4>
                    <div className="grid grid-cols-3 gap-2">
                      {GRADIENT_PRESETS.map(gradient => (
                        <button
                          key={gradient.name}
                          onClick={() => applyGradientToPanel(activePanel, gradient.value)}
                          className="p-2 rounded border border-[var(--color-border)] hover:border-purple-500 transition-colors"
                          title={`Apply ${gradient.name} to ${activePanel}`}
                        >
                          <div 
                            className="h-8 rounded mb-1 shadow-sm"
                            style={{ background: gradient.value }}
                          />
                          <span className="text-[10px] text-[var(--color-text-muted)] truncate block">{gradient.name}</span>
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-[var(--color-text-muted)] mt-2">
                      Applies to: <span className="text-purple-400 font-medium uppercase">{activePanel}</span> panel
                    </p>
                  </div>
                  
                  {/* Custom Gradient Builder */}
                  <div className="border-2 border-purple-500/30 rounded-lg p-4 bg-purple-500/5">
                    <h4 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
                      <Palette className="w-4 h-4 text-purple-400" />
                      Custom Gradient Builder
                    </h4>
                    
                    {/* Gradient Type Selector */}
                    <div className="mb-3">
                      <label className="text-xs text-[var(--color-text-muted)] block mb-1">Gradient Type:</label>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setCustomGradient(prev => ({ ...prev, type: 'linear' }))}
                          className={cn(
                            "flex-1 px-3 py-2 rounded text-xs font-medium transition-colors",
                            customGradient.type === 'linear'
                              ? "bg-purple-600 text-white"
                              : "bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"
                          )}
                        >
                          Linear
                        </button>
                        <button
                          onClick={() => setCustomGradient(prev => ({ ...prev, type: 'radial' }))}
                          className={cn(
                            "flex-1 px-3 py-2 rounded text-xs font-medium transition-colors",
                            customGradient.type === 'radial'
                              ? "bg-purple-600 text-white"
                              : "bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"
                          )}
                        >
                          Radial
                        </button>
                      </div>
                    </div>
                    
                    {/* Color Pickers */}
                    <div className="mb-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-[var(--color-text-muted)] w-16">Color 1:</label>
                        <input
                          type="color"
                          value={customGradient.color1}
                          onChange={(e) => setCustomGradient(prev => ({ ...prev, color1: e.target.value }))}
                          className="w-12 h-8 rounded cursor-pointer border border-[var(--color-border)]"
                        />
                        <input
                          type="text"
                          value={customGradient.color1}
                          onChange={(e) => {
                            const value = e.target.value
                            if (value.match(/^#[0-9A-Fa-f]{0,6}$/)) {
                              setCustomGradient(prev => ({ ...prev, color1: value }))
                            }
                          }}
                          className="flex-1 px-2 py-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded text-xs text-white font-mono"
                          placeholder="#667eea"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-[var(--color-text-muted)] w-16">Color 2:</label>
                        <input
                          type="color"
                          value={customGradient.color2}
                          onChange={(e) => setCustomGradient(prev => ({ ...prev, color2: e.target.value }))}
                          className="w-12 h-8 rounded cursor-pointer border border-[var(--color-border)]"
                        />
                        <input
                          type="text"
                          value={customGradient.color2}
                          onChange={(e) => {
                            const value = e.target.value
                            if (value.match(/^#[0-9A-Fa-f]{0,6}$/)) {
                              setCustomGradient(prev => ({ ...prev, color2: value }))
                            }
                          }}
                          className="flex-1 px-2 py-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded text-xs text-white font-mono"
                          placeholder="#764ba2"
                        />
                      </div>
                    </div>
                    
                    {/* Angle Slider (only for linear gradients) */}
                    {customGradient.type === 'linear' && (
                      <div className="mb-3">
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs text-[var(--color-text-muted)]">Angle:</label>
                          <span className="text-xs text-purple-400 font-medium">{customGradient.angle}°</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="360"
                          value={customGradient.angle}
                          onChange={(e) => setCustomGradient(prev => ({ ...prev, angle: parseInt(e.target.value) }))}
                          className="w-full"
                        />
                        <div className="flex justify-between text-[10px] text-[var(--color-text-dim)] mt-1">
                          <span>0°</span>
                          <span>90°</span>
                          <span>180°</span>
                          <span>270°</span>
                          <span>360°</span>
                        </div>
                      </div>
                    )}
                    
                    {/* Gradient Preview */}
                    <div className="mb-3">
                      <label className="text-xs text-[var(--color-text-muted)] block mb-1">Preview:</label>
                      <div 
                        className="h-16 rounded-lg shadow-md border border-[var(--color-border)]"
                        style={{ background: generateCustomGradient() }}
                      />
                    </div>
                    
                    {/* Apply Button */}
                    <Button
                      onClick={applyCustomGradient}
                      className="w-full gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                    >
                      <Check className="w-4 h-4" />
                      Apply to {activePanel.toUpperCase()}
                    </Button>
                  </div>
                  
                  {/* Pattern Presets */}
                  <div>
                    <h4 className="text-sm font-medium text-white mb-2">Pattern Presets</h4>
                    <div className="grid grid-cols-4 gap-2">
                      {PATTERN_PRESETS.map(pattern => (
                        <button
                          key={pattern.name}
                          onClick={() => applyPatternToPanel(activePanel, pattern)}
                          className="p-2 rounded border border-[var(--color-border)] hover:border-green-500 transition-colors"
                          title={`Apply ${pattern.name} to ${activePanel}`}
                        >
                          <div 
                            className="h-8 rounded mb-1 shadow-sm"
                            style={{ 
                              background: pattern.value,
                              backgroundColor: panelSolidColors[activePanel] || pattern.bg,
                              backgroundSize: pattern.size,
                            }}
                          />
                          <span className="text-[10px] text-[var(--color-text-muted)] truncate block">{pattern.name}</span>
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-[var(--color-text-muted)] mt-2">
                      Pattern overlays on: <span className="text-green-400 font-medium uppercase">{activePanel}</span> panel's solid color
                    </p>
                    <p className="text-xs text-[var(--color-text-muted)] italic mt-1">
                      💡 Tip: Choose a solid color first, then apply a pattern on top
                    </p>
                  </div>
                  
                  {/* Panel Selector for Backgrounds */}
                  <div className="pt-3 border-t border-[var(--color-border)]">
                    <h4 className="text-sm font-medium text-white mb-2">Apply To Panel</h4>
                    <div className="flex gap-1">
                      {(['front', 'back', 'spine'] as const).map(panel => (
                        <button
                          key={panel}
                          onClick={() => setActivePanel(panel)}
                          className={cn(
                            "flex-1 py-2 rounded text-xs font-medium transition-colors",
                            activePanel === panel 
                              ? "bg-pink-500 text-white" 
                              : "bg-[#2a2a2a] text-[#999] hover:bg-[#333] hover:text-white"
                          )}
                        >
                          {panel.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  {/* Per-panel color pickers */}
                  <div className="space-y-2 pt-3 border-t border-[var(--color-border)]">
                    <h4 className="text-sm font-medium text-white">Custom Colors</h4>
                    {(['front', 'back', 'spine'] as const).map(panel => {
                      const bgValue = project.cover.panelBackgrounds?.[panel] || '#ffffff'
                      const isGradientOrPattern = bgValue.includes('gradient') || bgValue.includes('pattern')
                      const displayColor = isGradientOrPattern ? '#ffffff' : bgValue
                      return (
                        <div key={panel} className="space-y-1">
                          <span className="text-xs capitalize text-white font-medium">{panel}:</span>
                          <div className="flex items-center gap-2">
                            {isGradientOrPattern ? (
                              <div 
                                className="w-10 h-8 rounded border border-[var(--color-border)] flex-shrink-0"
                                style={{ 
                                  background: bgValue.startsWith('pattern|') 
                                    ? (() => {
                                        const parts = bgValue.split('|')
                                        return parts[1]
                                      })()
                                    : bgValue,
                                  backgroundColor: bgValue.startsWith('pattern|') 
                                    ? bgValue.split('|')[3] 
                                    : undefined,
                                  backgroundSize: bgValue.startsWith('pattern|') 
                                    ? bgValue.split('|')[2] 
                                    : undefined,
                                }}
                              />
                            ) : (
                              <input
                                type="color"
                                value={displayColor.startsWith('#') ? displayColor : '#ffffff'}
                                onChange={(e) => {
                                  updatePanelBackground(panel, e.target.value)
                                  setPanelBgTypes(prev => ({ ...prev, [panel]: 'solid' }))
                                }}
                                className="w-10 h-8 rounded cursor-pointer border border-[var(--color-border)] flex-shrink-0"
                              />
                            )}
                            <input
                              type="text"
                              value={isGradientOrPattern ? panelBgTypes[panel] : displayColor}
                              onChange={(e) => {
                                if (!isGradientOrPattern) {
                                  const value = e.target.value
                                  // Allow typing hex codes
                                  if (value.match(/^#[0-9A-Fa-f]{0,6}$/)) {
                                    updatePanelBackground(panel, value)
                                  }
                                }
                              }}
                              onBlur={(e) => {
                                if (!isGradientOrPattern) {
                                  const value = e.target.value
                                  // Validate on blur
                                  if (!value.match(/^#[0-9A-Fa-f]{6}$/)) {
                                    updatePanelBackground(panel, '#ffffff')
                                  }
                                }
                              }}
                              disabled={isGradientOrPattern}
                              className="flex-1 px-2 py-1 bg-[#2a2a2a] border border-[var(--color-border)] rounded text-white text-xs font-mono disabled:opacity-50"
                              placeholder="#000000"
                            />
                            {!isGradientOrPattern && (
                              <button
                                onClick={() => handleCopyColor(displayColor)}
                                className="p-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded transition-colors"
                                title="Copy color code"
                              >
                                {copiedColor === displayColor ? (
                                  <Check className="w-4 h-4 text-green-400" />
                                ) : (
                                  <Copy className="w-4 h-4" />
                                )}
                              </button>
                            )}
                            {isGradientOrPattern && (
                              <button
                                onClick={() => {
                                  updatePanelBackground(panel, '#ffffff')
                                  setPanelBgTypes(prev => ({ ...prev, [panel]: 'solid' }))
                                }}
                                className="p-1 text-red-400 hover:text-red-300"
                                title="Reset to solid color"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  
                  {/* Background Fit Controls */}
                  <div className="space-y-2 pt-3 border-t border-[var(--color-border)]">
                    <h4 className="text-sm font-medium text-white">Background Fitting</h4>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      Control how backgrounds extend on the canvas
                    </p>
                    {(['front', 'back', 'spine'] as const).map(panel => (
                      <div key={panel} className="space-y-1">
                        <span className="text-xs capitalize text-white font-medium">{panel} Panel:</span>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleFitBackgroundToTrim(panel)}
                            className="flex-1 text-xs border-blue-500/50 text-blue-400 hover:bg-blue-500/10"
                            title="Background fills trim area (excludes bleed)"
                          >
                            Fit to Trim
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleFitBackgroundToBleed(panel)}
                            className="flex-1 text-xs border-green-500/50 text-green-400 hover:bg-green-500/10"
                            title="Background fills entire canvas including bleed"
                          >
                            Fit to Bleed
                          </Button>
                        </div>
                      </div>
                    ))}
                    <p className="text-xs text-[var(--color-text-muted)] italic mt-2">
                      💡 Images and text always stay within safe zones. Only backgrounds can extend to bleed.
                    </p>
                  </div>
                </div>
              )}

              {/* Badges Tab */}
              {editorTab === 'badges' && coverDims && (
                <div className="space-y-4">
                  <div className="border-b-2 border-yellow-500 px-4 py-2">
                    <h3 className="text-white font-medium text-sm flex items-center gap-2">
                      <Award className="w-4 h-4 text-yellow-500" />
                      Marketing Badges
                    </h3>
                  </div>
                  
                  <div className="px-4 space-y-4">
                    {/* Panel Selector */}
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-[var(--color-text-muted)]">Add Badge To:</label>
                      <div className="flex gap-2">
                        {(['back', 'spine', 'front'] as const).map(panel => (
                          <button
                            key={panel}
                            onClick={() => setNewElementTargetPanel(panel)}
                            className={cn(
                              "flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all border",
                              newElementTargetPanel === panel
                                ? "bg-yellow-500 text-black border-yellow-400"
                                : "bg-[#2a2a2a] text-gray-400 border-[#444] hover:border-yellow-500/50 hover:text-white"
                            )}
                          >
                            {panel.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="text-xs text-[var(--color-text-muted)]">
                      Click any badge to add it to the selected panel. Badges will be centered in the safe zone.
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {MARKETING_BADGE_TEMPLATES.map(template => (
                        <button
                          key={template.id}
                          onClick={() => {
                            const dpi = 300
                            const trimW = coverDims.trimWidth * dpi
                            const trimH = coverDims.trimHeight * dpi
                            const spineW = coverDims.spineWidth * dpi
                            const safeMargin = 0.125 * dpi
                            
                            // Get safe zone bounds for target panel
                            const panelBounds = {
                              back: { x: safeMargin, y: safeMargin, width: trimW - safeMargin * 2, height: trimH - safeMargin * 2 },
                              spine: { x: trimW + safeMargin / 2, y: safeMargin, width: spineW - safeMargin, height: trimH - safeMargin * 2 },
                              front: { x: trimW + spineW + safeMargin, y: safeMargin, width: trimW - safeMargin * 2, height: trimH - safeMargin * 2 },
                            }
                            
                            const bounds = panelBounds[newElementTargetPanel]
                            
                            // Scale badge to fit within safe zone if needed
                            const maxWidth = bounds.width * 0.6 // Max 60% of safe zone width
                            const maxHeight = bounds.height * 0.4 // Max 40% of safe zone height
                            const scale = Math.min(
                              maxWidth / template.defaultSize.width,
                              maxHeight / template.defaultSize.height,
                              1 // Don't scale up
                            )
                            
                            const scaledSize = {
                              width: template.defaultSize.width * scale,
                              height: template.defaultSize.height * scale
                            }
                            
                            // Center in target panel's safe zone
                            const baseX = bounds.x + (bounds.width - scaledSize.width) / 2
                            const baseY = bounds.y + (bounds.height - scaledSize.height) / 2
                            
                            const badgeElements = createBadgeElements(
                              template,
                              { x: baseX, y: baseY },
                              scaledSize
                            )
                            
                            // Set coverPart on all elements
                            const elementsWithPanel = badgeElements.map(el => ({
                              ...el,
                              coverPart: newElementTargetPanel
                            }))
                            
                            handleUpdateCover({
                              elements: [...(project.cover.elements || []), ...elementsWithPanel]
                            })
                            
                            // Show success feedback
                            setEditorTab('layers')
                          }}
                          className="flex flex-col items-center gap-2 p-3 border border-[var(--color-border)] rounded-lg hover:border-yellow-500 hover:bg-yellow-500/10 transition-all group"
                        >
                          {/* Visual preview using BadgePreview component */}
                          <div className="w-20 h-20 flex items-center justify-center bg-[#1a1a1a] rounded-lg overflow-hidden">
                            <BadgePreview template={template} />
                          </div>
                          <div className="text-xs font-medium text-white text-center group-hover:text-yellow-400">
                            {template.name}
                          </div>
                          <div className="text-[9px] text-[var(--color-text-dim)] capitalize">
                            {template.category}
                          </div>
                        </button>
                      ))}
                    </div>

                    <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-xs text-[var(--color-text-muted)]">
                      <strong className="text-yellow-400">💡 Tip:</strong> After adding, customize text and colors in the Layers tab or directly on the canvas.
                    </div>
                  </div>
                </div>
              )}

              {/* Elements Tab */}
              {editorTab === 'elements' && coverDims && (
                <div className="space-y-4">
                  <div className="border-b-2 border-purple-500 px-4 py-2">
                    <h3 className="text-white font-medium text-sm flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-purple-500" />
                      Decorative Elements
                    </h3>
                  </div>
                  
                  <div className="px-4 space-y-4">
                    {/* Panel Selector */}
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-[var(--color-text-muted)]">Add Element To:</label>
                      <div className="flex gap-2">
                        {(['back', 'spine', 'front'] as const).map(panel => (
                          <button
                            key={panel}
                            onClick={() => setNewElementTargetPanel(panel)}
                            className={cn(
                              "flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all border",
                              newElementTargetPanel === panel
                                ? "bg-purple-500 text-white border-purple-400"
                                : "bg-[#2a2a2a] text-gray-400 border-[#444] hover:border-purple-500/50 hover:text-white"
                            )}
                          >
                            {panel.toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="text-xs text-[var(--color-text-muted)]">
                      SVG decorative elements to enhance your cover. Click to add to the selected panel.
                    </div>

                    {(['symbol', 'animal', 'nature', 'ornament', 'badge', 'divider'] as const).map(category => {
                      const categoryElements = getElementsByCategory(category)
                      if (categoryElements.length === 0) return null
                      
                      return (
                        <div key={category} className="space-y-2">
                          <h4 className="text-xs font-bold uppercase text-[var(--color-text-muted)] flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-purple-500" />
                            {category}s
                          </h4>
                          
                          <div className="grid grid-cols-4 gap-1.5">
                            {categoryElements.map(element => (
                              <button
                                key={element.id}
                                onClick={() => {
                                  const dpi = 300
                                  const trimW = coverDims.trimWidth * dpi
                                  const trimH = coverDims.trimHeight * dpi
                                  const spineW = coverDims.spineWidth * dpi
                                  const safeMargin = 0.125 * dpi
                                  
                                  // Get safe zone bounds for target panel
                                  const panelBounds = {
                                    back: { x: safeMargin, y: safeMargin, width: trimW - safeMargin * 2, height: trimH - safeMargin * 2 },
                                    spine: { x: trimW + safeMargin / 2, y: safeMargin, width: spineW - safeMargin, height: trimH - safeMargin * 2 },
                                    front: { x: trimW + spineW + safeMargin, y: safeMargin, width: trimW - safeMargin * 2, height: trimH - safeMargin * 2 },
                                  }
                                  
                                  const bounds = panelBounds[newElementTargetPanel]
                                  
                                  // Scale element to fit within safe zone if needed
                                  const maxWidth = bounds.width * 0.3 // Max 30% of safe zone width
                                  const maxHeight = bounds.height * 0.3 // Max 30% of safe zone height
                                  const scale = Math.min(
                                    maxWidth / element.defaultSize.width,
                                    maxHeight / element.defaultSize.height,
                                    1 // Don't scale up
                                  )
                                  
                                  const scaledSize = {
                                    width: element.defaultSize.width * scale,
                                    height: element.defaultSize.height * scale
                                  }
                                  
                                  // Center in target panel's safe zone
                                  const baseX = bounds.x + (bounds.width - scaledSize.width) / 2
                                  const baseY = bounds.y + (bounds.height - scaledSize.height) / 2
                                  
                                  const newShape: KDPShapeElement = {
                                    id: generateKDPId('element'),
                                    type: 'shape',
                                    shapeType: 'rectangle',
                                    position: { x: baseX, y: baseY },
                                    width: scaledSize.width,
                                    height: scaledSize.height,
                                    rotation: 0,
                                    locked: false,
                                    visible: true,
                                    coverPart: newElementTargetPanel,
                                    style: {
                                      fill: element.fillable ? '#FFD700' : 'transparent',
                                      stroke: element.strokeable ? '#000000' : 'transparent',
                                      strokeWidth: 2,
                                      opacity: 0.8,
                                      borderRadius: 0,
                                    }
                                  }
                                  
                                  handleUpdateCover({
                                    elements: [...(project.cover.elements || []), newShape]
                                  })
                                  
                                  setEditorTab('layers')
                                }}
                                className="flex flex-col items-center p-2 border border-[var(--color-border)] rounded hover:border-purple-500 hover:bg-purple-500/10 transition-all group"
                                title={element.name}
                              >
                                <div 
                                  className="w-full aspect-square flex items-center justify-center text-white"
                                  dangerouslySetInnerHTML={{ 
                                    __html: `<svg viewBox="${element.viewBox}" class="w-full h-full" fill="currentColor">${element.svg}</svg>`
                                  }}
                                />
                              </button>
                            ))}
                          </div>
                        </div>
                      )
                    })}

                    <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg text-xs text-[var(--color-text-muted)]">
                      <strong className="text-purple-400">ℹ️ Note:</strong> Elements are added as shapes. Customize their color, size, and position on the canvas.
                    </div>
                  </div>
                </div>
              )}

              {/* Layers Tab */}
              {editorTab === 'layers' && (
                <div className="space-y-3">
                  <div className="text-sm text-[var(--color-text-muted)]">
                    Manage all cover elements by panel. Toggle visibility, lock/unlock, reorder elements.
                  </div>
                  
                  {/* Group by panel */}
                  {(['front', 'spine', 'back'] as const).map(panel => {
                    const panelTexts = textElements.filter(t => t.coverPart === panel)
                    const panelImage = getPartImage(panel)
                    const panelHasContent = panelImage || panelTexts.length > 0
                    
                    if (!panelHasContent) return null
                    
                    return (
                      <div key={panel}>
                        <h4 className="text-xs font-bold uppercase text-[var(--color-text-muted)] mb-1 flex items-center gap-1">
                          <span className={cn("w-2 h-2 rounded-full",
                            panel === 'front' ? 'bg-purple-500' :
                            panel === 'back' ? 'bg-blue-500' : 'bg-green-500'
                          )} />
                          {panel}
                        </h4>
                        
                        {/* Panel image */}
                        {panelImage && (
                          <div className="flex items-center gap-2 p-2 mb-1 rounded border border-[var(--color-border)] text-xs bg-[var(--color-surface)]">
                            <ImageIcon className="w-4 h-4 text-[var(--color-text-muted)]" />
                            <span className="flex-1 text-white">{panel} cover image</span>
                          </div>
                        )}
                        
                        {/* Panel text elements */}
                        {panelTexts.map((text, index) => (
                          <div key={text.id} className="flex items-center gap-1 p-1.5 mb-1 rounded border border-[var(--color-border)] text-xs bg-[var(--color-surface)]">
                            {/* Visibility toggle */}
                            <button
                              onClick={() => toggleElementVisible(text.id)}
                              className="p-1 hover:bg-[var(--color-border)] rounded transition-colors"
                              title={text.visible === false ? "Show element" : "Hide element"}
                            >
                              {text.visible === false ? 
                                <EyeOff className="w-3.5 h-3.5 text-[var(--color-text-muted)]" /> : 
                                <Eye className="w-3.5 h-3.5 text-blue-500" />
                              }
                            </button>
                            
                            {/* Lock toggle */}
                            <button
                              onClick={() => toggleElementLock(text.id)}
                              className="p-1 hover:bg-[var(--color-border)] rounded transition-colors"
                              title={text.locked ? "Unlock element" : "Lock element"}
                            >
                              {text.locked ? 
                                <Lock className="w-3.5 h-3.5 text-orange-500" /> : 
                                <Unlock className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
                              }
                            </button>
                            
                            <Type className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
                            <span className="flex-1 truncate text-white" style={{ opacity: text.visible === false ? 0.5 : 1 }}>
                              {text.content}
                            </span>
                            
                            {/* Move to panel dropdown */}
                            <select
                              value={text.coverPart}
                              onChange={(e) => moveElementToPanel(text.id, e.target.value as 'front' | 'back' | 'spine')}
                              className="px-1 py-0.5 bg-[#2a2a2a] border border-[#444] rounded text-xs"
                              onClick={(e) => e.stopPropagation()}
                              title="Move to panel"
                            >
                              <option value="front">Front</option>
                              <option value="back">Back</option>
                              <option value="spine">Spine</option>
                            </select>
                            
                            {/* Reorder buttons */}
                            <button
                              onClick={() => moveElementUp(text.id)}
                              className="p-0.5 hover:bg-blue-500/10 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                              disabled={index === panelTexts.length - 1}
                              title="Move up (forward)"
                            >
                              <ChevronUp className="w-3.5 h-3.5 text-blue-500" />
                            </button>
                            <button
                              onClick={() => moveElementDown(text.id)}
                              className="p-0.5 hover:bg-blue-500/10 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                              disabled={index === 0}
                              title="Move down (backward)"
                            >
                              <ChevronDown className="w-3.5 h-3.5 text-blue-500" />
                            </button>
                            
                            {/* Delete button */}
                            <button
                              onClick={() => handleDeleteTextElement(text.id)}
                              className="p-1 text-red-500 hover:bg-red-500/10 rounded transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                        
                        {/* Barcode if on back */}
                        {panel === 'back' && hasBarcode && (
                          <div className="flex items-center gap-2 p-2 mb-1 rounded border border-[var(--color-border)] text-xs bg-[var(--color-surface)]">
                            <Barcode className="w-4 h-4 text-[var(--color-text-muted)]" />
                            <span className="flex-1 text-white">Barcode placeholder</span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Upload Cards - Vertical Stack */}
        {coverMode === "separate" && (
          <div className="space-y-3">
            {/* Back Cover */}
            <Card>
              <CardContent className="p-3">
                <h4 className="text-xs font-medium text-white mb-2 flex items-center gap-2">
                  <span className="w-5 h-5 rounded bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-bold">B</span>
                  Back Cover
                </h4>
                <div
                  className={cn(
                    "aspect-square rounded-lg border-2 border-dashed flex items-center justify-center cursor-pointer transition-all overflow-hidden",
                    project.cover.backImage
                      ? "border-blue-500/50 bg-blue-500/5"
                      : isFileDragging
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 scale-105"
                      : "border-[var(--color-border)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary)]/5"
                  )}
                  onClick={() => backCoverInputRef.current?.click()}
                  onDragEnter={handleFileDragEnter}
                  onDragLeave={handleFileDragLeave}
                  onDragOver={handleFileDragOver}
                  onDrop={(e) => handleFileDrop(e, "back")}
                >
                  {project.cover.backImage ? (
                    <div className="relative w-full h-full">
                      <img
                        src={project.cover.backImage.src}
                        alt="Back Cover"
                        className="w-full h-full object-contain"
                      />
                      <div className="absolute top-1 right-1 flex gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleScalePanelImageToBleed("back")
                          }}
                          className="p-1 bg-green-500 rounded-full text-white hover:bg-green-600 shadow-md"
                          title="Scale to fill bleed area"
                        >
                          <Maximize2 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleOpenCrop("back")
                          }}
                          className="p-1 bg-purple-500 rounded-full text-white hover:bg-purple-600 shadow-md"
                          title="Crop image"
                        >
                          <Crop className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteCover("back")
                          }}
                          className="p-1 bg-red-500 rounded-full text-white hover:bg-red-600 shadow-md"
                          title="Remove image"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center p-2">
                      <ImageIcon className="w-5 h-5 mx-auto mb-1 text-[var(--color-text-dim)]" />
                      <span className="text-xs text-[var(--color-text-muted)]">Drop or Click</span>
                    </div>
                  )}
                </div>
                <input
                  ref={backCoverInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFileUpload(e.target.files, "back")}
                  className="hidden"
                />
              </CardContent>
            </Card>

            {/* Spine */}
            <Card>
              <CardContent className="p-3">
                <h4 className="text-xs font-medium text-white mb-2 flex items-center gap-2">
                  <span className="w-5 h-5 rounded bg-green-500/20 text-green-400 flex items-center justify-center text-xs font-bold">S</span>
                  Spine
                  {coverDims && (
                    <span className="text-[10px] text-[var(--color-text-dim)] ml-auto">
                      {coverDims.spineWidth.toFixed(2)}"
                    </span>
                  )}
                </h4>
                <div
                  className={cn(
                    "aspect-square rounded-lg border-2 border-dashed flex items-center justify-center cursor-pointer transition-all overflow-hidden",
                    project.cover.spineImage
                      ? "border-green-500/50 bg-green-500/5"
                      : isFileDragging
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 scale-105"
                      : "border-[var(--color-border)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary)]/5"
                  )}
                  onClick={() => spineCoverInputRef.current?.click()}
                  onDragEnter={handleFileDragEnter}
                  onDragLeave={handleFileDragLeave}
                  onDragOver={handleFileDragOver}
                  onDrop={(e) => handleFileDrop(e, "spine")}
                >
                  {project.cover.spineImage ? (
                    <div className="relative w-full h-full">
                      <img
                        src={project.cover.spineImage.src}
                        alt="Spine"
                        className="w-full h-full object-contain"
                      />
                      <div className="absolute top-1 right-1 flex gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleScalePanelImageToBleed("spine")
                          }}
                          className="p-1 bg-green-500 rounded-full text-white hover:bg-green-600 shadow-md"
                          title="Scale to fill bleed area (vertical)"
                        >
                          <Maximize2 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleOpenCrop("spine")
                          }}
                          className="p-1 bg-purple-500 rounded-full text-white hover:bg-purple-600 shadow-md"
                          title="Crop image"
                        >
                          <Crop className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteCover("spine")
                          }}
                          className="p-1 bg-red-500 rounded-full text-white hover:bg-red-600 shadow-md"
                          title="Remove image"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center p-2">
                      <Type className="w-5 h-5 mx-auto mb-1 text-[var(--color-text-dim)]" />
                      <span className="text-xs text-[var(--color-text-muted)]">Drop or Click</span>
                    </div>
                  )}
                </div>
                <input
                  ref={spineCoverInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFileUpload(e.target.files, "spine")}
                  className="hidden"
                />
                {/* Spine Text with inline rotation buttons */}
                <div className="mt-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={project.cover.spineText || ""}
                      onChange={(e) => handleSpineTextChange(e.target.value)}
                      placeholder="Spine text..."
                      className="flex-1 px-2 py-1 bg-[#2a2a2a] border border-[#444] rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                    />
                    {/* Compact rotation buttons inline */}
                    <button
                      onClick={() => handleUpdateCover({
                        spineTextStyle: {
                          ...project.cover.spineTextStyle,
                          fontFamily: project.cover.spineTextStyle?.fontFamily || "Arial",
                          fontSize: project.cover.spineTextStyle?.fontSize || 14,
                          color: project.cover.spineTextStyle?.color || "#000000",
                          rotation: "horizontal"
                        }
                      })}
                      className={cn(
                        "p-1.5 rounded transition-all border",
                        project.cover.spineTextStyle?.rotation === "horizontal"
                          ? "bg-blue-600 border-blue-400 text-white"
                          : "bg-[#2a2a2a] border-[#444] text-gray-400 hover:bg-[#333]"
                      )}
                      title="Horizontal text"
                    >
                      <span className="text-sm">☰</span>
                    </button>
                    <button
                      onClick={() => handleUpdateCover({
                        spineTextStyle: {
                          ...project.cover.spineTextStyle,
                          fontFamily: project.cover.spineTextStyle?.fontFamily || "Arial",
                          fontSize: project.cover.spineTextStyle?.fontSize || 14,
                          color: project.cover.spineTextStyle?.color || "#000000",
                          rotation: "vertical-up"
                        }
                      })}
                      className={cn(
                        "p-1.5 rounded transition-all border",
                        project.cover.spineTextStyle?.rotation === "vertical-up"
                          ? "bg-blue-600 border-blue-400 text-white"
                          : "bg-[#2a2a2a] border-[#444] text-gray-400 hover:bg-[#333]"
                      )}
                      title="Vertical text (bottom to top)"
                    >
                      <span className="text-sm">☰</span>
                    </button>
                    <button
                      onClick={() => handleUpdateCover({
                        spineTextStyle: {
                          ...project.cover.spineTextStyle,
                          fontFamily: project.cover.spineTextStyle?.fontFamily || "Arial",
                          fontSize: project.cover.spineTextStyle?.fontSize || 14,
                          color: project.cover.spineTextStyle?.color || "#000000",
                          rotation: "vertical-down"
                        }
                      })}
                      className={cn(
                        "p-1.5 rounded transition-all border",
                        project.cover.spineTextStyle?.rotation === "vertical-down"
                          ? "bg-blue-600 border-blue-400 text-white"
                          : "bg-[#2a2a2a] border-[#444] text-gray-400 hover:bg-[#333]"
                      )}
                      title="Vertical text (top to bottom)"
                    >
                      <span className="text-sm">☰</span>
                    </button>
                  </div>
                  <div className="text-[10px] text-gray-500 mt-1 ml-1">
                    {project.cover.spineTextStyle?.rotation === "horizontal" ? "Horizontal" :
                     project.cover.spineTextStyle?.rotation === "vertical-up" ? "Vertical ↑" :
                     "Vertical ↓"}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Front Cover */}
            <Card>
              <CardContent className="p-3">
                <h4 className="text-xs font-medium text-white mb-2 flex items-center gap-2">
                  <span className="w-5 h-5 rounded bg-purple-500/20 text-purple-400 flex items-center justify-center text-xs font-bold">F</span>
                  Front Cover
                </h4>
                <div
                  className={cn(
                    "aspect-square rounded-lg border-2 border-dashed flex items-center justify-center cursor-pointer transition-all overflow-hidden",
                    project.cover.frontImage
                      ? "border-purple-500/50 bg-purple-500/5"
                      : isFileDragging
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 scale-105"
                      : "border-[var(--color-border)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary)]/5"
                  )}
                  onClick={() => frontCoverInputRef.current?.click()}
                  onDragEnter={handleFileDragEnter}
                  onDragLeave={handleFileDragLeave}
                  onDragOver={handleFileDragOver}
                  onDrop={(e) => handleFileDrop(e, "front")}
                >
                  {project.cover.frontImage ? (
                    <div className="relative w-full h-full">
                      <img
                        src={project.cover.frontImage.src}
                        alt="Front Cover"
                        className="w-full h-full object-contain"
                      />
                      <div className="absolute top-1 right-1 flex gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleScalePanelImageToBleed("front")
                          }}
                          className="p-1 bg-green-500 rounded-full text-white hover:bg-green-600 shadow-md"
                          title="Scale to fill bleed area"
                        >
                          <Maximize2 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleOpenCrop("front")
                          }}
                          className="p-1 bg-purple-500 rounded-full text-white hover:bg-purple-600 shadow-md"
                          title="Crop image"
                        >
                          <Crop className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteCover("front")
                          }}
                          className="p-1 bg-red-500 rounded-full text-white hover:bg-red-600 shadow-md"
                          title="Remove image"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center p-2">
                      <ImageIcon className="w-5 h-5 mx-auto mb-1 text-[var(--color-text-dim)]" />
                      <span className="text-xs text-[var(--color-text-muted)]">Drop or Click</span>
                    </div>
                  )}
                </div>
                <input
                  ref={frontCoverInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFileUpload(e.target.files, "front")}
                  className="hidden"
                />
              </CardContent>
            </Card>
          </div>
        )}

        {/* Download Section - Compact */}
        {(project.cover.fullCoverImage || project.cover.frontImage || project.cover.backImage) && (
          <div className="p-3 bg-gradient-to-r from-green-500/5 to-emerald-500/5 border border-green-500/30 rounded-lg space-y-2">
            <div className="flex items-center gap-2">
              <Download className="w-4 h-4 text-green-500 flex-shrink-0" />
              <span className="text-xs font-medium text-white">Download</span>
            </div>
            <input
              type="text"
              value={downloadName}
              onChange={(e) => setDownloadName(e.target.value)}
              placeholder="File name..."
              className="w-full px-2 py-1 bg-[#2a2a2a] border border-[#444] rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-green-500"
            />
            <div className="flex flex-wrap gap-2">
              {coverMode === "full" && project.cover.fullCoverImage && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownloadCover("full")}
                  disabled={isDownloading}
                  className="flex-1 gap-1.5 border-green-500/50 text-green-600 hover:bg-green-500/10 h-8 text-xs"
                >
                  {isDownloading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                  Full
                </Button>
              )}
              {coverMode === "separate" && project.cover.frontImage && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownloadCover("front")}
                  disabled={isDownloading}
                  className="flex-1 gap-1 border-purple-500/50 text-purple-600 hover:bg-purple-500/10 h-8 text-xs"
                >
                  {isDownloading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                  Front
                </Button>
              )}
              {coverMode === "separate" && project.cover.backImage && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownloadCover("back")}
                  disabled={isDownloading}
                  className="flex-1 gap-1 border-blue-500/50 text-blue-600 hover:bg-blue-500/10 h-8 text-xs"
                >
                  {isDownloading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                  Back
                </Button>
              )}
            </div>
            
            {/* Export Full Cover PDF from Separate Panels */}
            {coverMode === "separate" && (project.cover.frontImage || project.cover.backImage) && (
              <div className="pt-2 border-t border-green-500/20">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportSeparatePanelsAsCover}
                  disabled={isDownloading}
                  className="w-full gap-2 border-green-500/50 text-green-600 hover:bg-green-500/10 h-9 text-xs font-semibold"
                  title="Export all panels as one complete cover PDF (300 DPI + Bleed)"
                >
                  {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                  Export Full Cover PDF (All Panels)
                </Button>
                <p className="text-[10px] text-green-400/70 mt-1 text-center">
                  300 DPI • Includes Bleed • Print-Ready
                </p>
              </div>
            )}
          </div>
        )}
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Toolbar */}
        <div className="flex items-center gap-3 flex-wrap pb-3 border-b border-[var(--color-border)]">
          {/* Cover Mode Toggle */}
          <div className="flex gap-2 p-1 bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)]">
            <button
              onClick={() => setCoverMode("separate")}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                coverMode === "separate"
                  ? "bg-[var(--color-primary)] text-white"
                  : "text-[var(--color-text-muted)] hover:text-white"
              )}
            >
              Separate Parts
            </button>
            <button
              onClick={() => setCoverMode("full")}
              className={cn(
                "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                coverMode === "full"
                  ? "bg-[var(--color-primary)] text-white"
                  : "text-[var(--color-text-muted)] hover:text-white"
              )}
            >
              Full Cover
            </button>
          </div>

          {/* Guidelines Toggle with Panel Options */}
          <div className="relative group">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowGuides(!showGuides)}
              className="gap-2"
            >
              {showGuides ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              Guides
              <ChevronDown className="w-3 h-3" />
            </Button>
            
            {/* Dropdown for individual panel guides */}
            {showGuides && (
              <div className="absolute top-full left-0 mt-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-lg p-2 min-w-[140px] z-50 opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity">
                <label className="flex items-center gap-2 px-2 py-1.5 hover:bg-[var(--color-hover)] rounded cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={showBackGuides}
                    onChange={(e) => setShowBackGuides(e.target.checked)}
                    className="w-3.5 h-3.5"
                  />
                  <span>Back</span>
                </label>
                <label className="flex items-center gap-2 px-2 py-1.5 hover:bg-[var(--color-hover)] rounded cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={showSpineGuides}
                    onChange={(e) => setShowSpineGuides(e.target.checked)}
                    className="w-3.5 h-3.5"
                  />
                  <span>Spine</span>
                </label>
                <label className="flex items-center gap-2 px-2 py-1.5 hover:bg-[var(--color-hover)] rounded cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={showFrontGuides}
                    onChange={(e) => setShowFrontGuides(e.target.checked)}
                    className="w-3.5 h-3.5"
                  />
                  <span>Front</span>
                </label>
              </div>
            )}
          </div>

          {/* Auto-Size Buttons */}
        {coverMode === "separate" && (
          <>
            {project.cover.backImage && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleAutoSizeSeparateBack}
                disabled={isAutoSizing}
                className="gap-2 border-blue-500/50 text-blue-600 hover:bg-blue-500/10"
                title="Fit back cover image to safe zone"
              >
                {isAutoSizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Target className="w-4 h-4" />}
                Auto-Size Back
              </Button>
            )}
            {project.cover.frontImage && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleAutoSizeSeparateFront}
                disabled={isAutoSizing}
                className="gap-2 border-purple-500/50 text-purple-600 hover:bg-purple-500/10"
                title="Fit front cover image to safe zone"
              >
                {isAutoSizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Target className="w-4 h-4" />}
                Auto-Size Front
              </Button>
            )}
            {hasSeparateParts && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAutoSizeAll}
                  disabled={isAutoSizing}
                  className="gap-2 border-green-500/50 text-green-600 hover:bg-green-500/10"
                  title="Fit all images to their safe zones (maintains aspect ratio)"
                >
                  {isAutoSizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Target className="w-4 h-4" />}
                  Auto-Size All
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePerfectFitAll}
                  disabled={isAutoSizing}
                  className="gap-2 border-orange-500/50 text-orange-600 hover:bg-orange-500/10"
                  title="Stretch all images to fill entire safe zone (may distort)"
                >
                  {isAutoSizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Maximize2 className="w-4 h-4" />}
                  Perfect Fit
                </Button>
              </>
            )}
          </>
        )}

        {/* Full Cover Mode - Fit Buttons */}
        {coverMode === "full" && project.cover.fullCoverImage && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={handleFitFullCoverToSafeZone}
              disabled={isAutoSizing}
              className="gap-2 border-green-500/50 text-green-600 hover:bg-green-500/10"
              title="Fit cover image within safe zone (maintains aspect ratio)"
            >
              {isAutoSizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Target className="w-4 h-4" />}
              Fit to SafeZone
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleFitFullCoverToTrim}
              disabled={isAutoSizing}
              className="gap-2 border-blue-500/50 text-blue-600 hover:bg-blue-500/10"
              title="Fill trim area (excludes bleed, may crop)"
            >
              {isAutoSizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crop className="w-4 h-4" />}
              Fit to Trim
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleFitFullCoverToBleed}
              disabled={isAutoSizing}
              className="gap-2 border-red-500/50 text-red-600 hover:bg-red-500/10"
              title="Fill entire canvas including bleed area (may crop)"
            >
              {isAutoSizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Maximize2 className="w-4 h-4" />}
              Fit to Bleed
            </Button>
            
            {/* Undo Full Cover Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleUndoFullCover}
              className="gap-2 border-orange-500/50 text-orange-600 hover:bg-orange-500/10"
              title="Remove full cover and return to editing separate panels"
            >
              <X className="w-4 h-4" />
              Undo Full Cover
            </Button>
          </>
        )}

        {/* Fill Bleed Button - For extending backgrounds */}
        {coverMode === "full" && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleFillBackgroundToBleed}
            className="gap-2 border-purple-500/50 text-purple-600 hover:bg-purple-500/10"
            title="Extend background to fill entire canvas including bleed area"
          >
            <Palette className="w-4 h-4" />
            Fill Bleed
          </Button>
        )}

          {/* Analyze Cover Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleAnalyzeCover}
            className="gap-2 border-purple-500/50 text-purple-400 hover:bg-purple-500/10"
            title="Analyze cover for KDP compliance"
          >
            <AlertCircle className="w-4 h-4" />
            Analyze Cover
          </Button>

          {/* Toggle Analysis Overlay */}
          {analysisResult && (
            <Button
              variant={showAnalysisOverlay ? "primary" : "outline"}
              size="sm"
              onClick={() => setShowAnalysisOverlay(!showAnalysisOverlay)}
              className={cn(
                "gap-2",
                showAnalysisOverlay 
                  ? "bg-purple-600 hover:bg-purple-700" 
                  : "border-purple-500/50 text-purple-400 hover:bg-purple-500/10"
              )}
              title={showAnalysisOverlay ? "Hide issues overlay" : "Show issues overlay"}
            >
              {showAnalysisOverlay ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {showAnalysisOverlay ? "Hide Issues" : "Show Issues"}
            </Button>
          )}

          {/* Zoom Controls */}
          <div className="flex items-center gap-2 ml-auto">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setCanvasZoom(z => Math.max(0.3, z - 0.1))}
              title="Zoom out (Ctrl+-)"
            >
              <ZoomOut className="w-4 h-4" />
            </Button>
            <span className="text-sm text-[var(--color-text-muted)] w-12 text-center">
              {Math.round(canvasZoom * 100)}%
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setCanvasZoom(z => Math.min(2.0, z + 0.1))}
              title="Zoom in (Ctrl++)"
            >
              <ZoomIn className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleFitToView}
              className="gap-1"
              title="Fit to view (Ctrl+0)"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              Fit
            </Button>
          </div>
          </div>

        {/* Canvas Container - Flex-1 to fill remaining space */}
        <div ref={canvasContainerRef} className="flex-1 overflow-auto mt-3 min-h-[600px]">
          {/* Interactive Canvas */}
          {coverDims && (
            <div className="relative bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] h-full overflow-auto p-4">
              <div className="flex items-center justify-center min-h-full">
                <CoverCanvas
                  coverDims={coverDims}
                  project={project}
                  onUpdateCover={handleUpdateCover}
                  showGuides={showGuides}
                  showBackGuides={showBackGuides}
                  showSpineGuides={showSpineGuides}
                  showFrontGuides={showFrontGuides}
                  zoom={canvasZoom}
                  mode={coverMode === "separate" ? "separate" : "full"}
                  selectedTextId={selectedTextId}
                  onSelectText={setSelectedTextId}
                  selectedShapeId={selectedShapeId}
                  onSelectShape={setSelectedShapeId}
                  getPanelSafeArea={getPanelSafeArea}
                  analysisResult={analysisResult}
                  showAnalysisOverlay={showAnalysisOverlay}
                />
              </div>

              {/* Text Alignment Toolbar (appears when text is selected) */}
              {selectedTextId && (() => {
                const selectedText = textElements.find(t => t.id === selectedTextId)
                if (!selectedText) return null
                
                return (
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
                    <Card className="bg-[var(--color-surface)]/95 backdrop-blur-sm border-[var(--color-primary)] shadow-lg">
                      <CardContent className="py-2 px-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-[var(--color-text-muted)] mr-1">Move to:</span>
                          <button
                            onClick={() => handleTextAlignment(selectedTextId, 'left')}
                            className="p-1.5 rounded transition-colors hover:bg-[var(--color-surface)]"
                            title="Move to Left"
                          >
                            <AlignLeft className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleTextAlignment(selectedTextId, 'center')}
                            className="p-1.5 rounded transition-colors hover:bg-[var(--color-surface)]"
                            title="Move to Center"
                          >
                            <AlignCenter className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleTextAlignment(selectedTextId, 'right')}
                            className="p-1.5 rounded transition-colors hover:bg-[var(--color-surface)]"
                            title="Move to Right"
                          >
                            <AlignRight className="w-4 h-4" />
                          </button>
                          <div className="w-px h-6 bg-[var(--color-border)] mx-1" />
                          <span className="text-xs text-white">"{selectedText.content}"</span>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )
              })()}

              {/* Upload Overlay for full mode */}
              {coverMode === "full" && !project.cover.fullCoverImage && (
                <div 
                  className={cn(
                    "absolute inset-4 flex items-center justify-center rounded-lg transition-all",
                    isFileDragging 
                      ? "bg-[var(--color-primary)]/30 border-2 border-dashed border-[var(--color-primary)]" 
                      : "bg-black/50"
                  )}
                  onDragEnter={handleFileDragEnter}
                  onDragLeave={handleFileDragLeave}
                  onDragOver={handleFileDragOver}
                  onDrop={(e) => handleFileDrop(e, "full")}
                >
                  <div className="text-center">
                    <Upload className={cn(
                      "w-12 h-12 mx-auto mb-4",
                      isFileDragging ? "text-[var(--color-primary)] animate-bounce" : "text-white/70"
                    )} />
                    <p className="text-white mb-4">
                      {isFileDragging ? "Drop your cover image here!" : "Drag & drop or click to upload your full cover"}
                    </p>
                    <Button
                      onClick={() => fullCoverInputRef.current?.click()}
                      disabled={isUploading}
                    >
                      {isUploading ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Upload className="w-4 h-4 mr-2" />
                      )}
                      Select Cover Image
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom Confirm Bar - Sticky with Navigation */}
        <div className="flex-shrink-0 p-3 bg-gradient-to-r from-purple-500/10 to-indigo-500/10 border-t border-purple-500/30 mt-3">
          <div className="flex items-center justify-between">
            <div className="text-sm">
              <span className="font-medium">Ready to confirm?</span>
              <span className="text-[var(--color-text-muted)] ml-2">Your cover will be finalized</span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onBack} className="gap-2">
                <ChevronLeft className="w-4 h-4" />
                Back
              </Button>
              {coverMode === "separate" && (
                <Button
                  onClick={handleCreateFullWrapCover}
                  disabled={isCreatingFullWrap}
                  className="gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700"
                >
                  {isCreatingFullWrap ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-4 h-4" />
                      Confirm Cover
                    </>
                  )}
                </Button>
              )}
              <Button
                onClick={onNext}
                disabled={!canProceed}
                className="gap-2"
              >
                Continue to Export
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Hidden File Inputs */}
      <input
        ref={fullCoverInputRef}
        type="file"
        accept="image/*"
        onChange={(e) => handleFileUpload(e.target.files, "full")}
        className="hidden"
      />

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
      
      {/* AI Background Generation Modal */}
      {showAIBgModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <Card className="w-full max-w-lg mx-4 bg-[var(--color-surface)] border-[var(--color-border)]">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-semibold text-[var(--color-text)] flex items-center gap-2">
                  <Wand2 className="w-5 h-5 text-purple-500" />
                  Generate AI Background
                </h3>
                <button
                  onClick={() => setShowAIBgModal(false)}
                  className="p-1 hover:bg-[var(--color-border)] rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-[var(--color-text-muted)]" />
                </button>
              </div>
              
              {isGeneratingBg ? (
                <div className="text-center py-8">
                  <Loader2 className="w-12 h-12 mx-auto text-purple-500 animate-spin mb-4" />
                  <p className="text-[var(--color-text)]">
                    Generating your background...
                  </p>
                  <p className="text-sm text-[var(--color-text-muted)] mt-2">
                    This may take a few seconds
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Prompt Input */}
                  <div>
                    <label className="block text-sm font-medium text-[var(--color-text)] mb-2">
                      Describe your background
                    </label>
                    <textarea
                      value={aiBgPrompt}
                      onChange={(e) => setAiBgPrompt(e.target.value)}
                      placeholder="e.g., Abstract watercolor texture with soft purple and blue tones..."
                      className="w-full px-4 py-3 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                      rows={3}
                    />
                  </div>
                  
                  {/* Panel Selection */}
                  <div>
                    <label className="block text-sm font-medium text-[var(--color-text)] mb-2">
                      Apply to panel
                    </label>
                    <div className="flex gap-2">
                      {(['front', 'back', 'spine', 'all'] as const).map(panel => (
                        <button
                          key={panel}
                          onClick={() => setAiBgPanel(panel)}
                          className={cn(
                            "flex-1 p-3 rounded-lg border-2 transition-all",
                            aiBgPanel === panel 
                              ? "border-purple-500 bg-purple-500/10" 
                              : "border-[#333] bg-[#1a1a1a] hover:border-purple-500/50"
                          )}
                        >
                          {panel === 'all' ? (
                            <div className="flex h-8 rounded overflow-hidden mb-1.5 mx-auto max-w-[50px]">
                              <div className="flex-1 bg-purple-500" />
                              <div className="w-1 bg-purple-400" />
                              <div className="flex-1 bg-purple-500" />
                            </div>
                          ) : (
                            <div className="flex h-8 rounded overflow-hidden mb-1.5 mx-auto max-w-[50px]">
                              <div className={cn("flex-1", panel === 'back' ? "bg-purple-500" : "bg-[#333]")} />
                              <div className={cn("w-1", panel === 'spine' ? "bg-purple-500" : "bg-[#444]")} />
                              <div className={cn("flex-1", panel === 'front' ? "bg-purple-500" : "bg-[#333]")} />
                            </div>
                          )}
                          <span className={cn(
                            "text-xs font-medium block text-center capitalize",
                            aiBgPanel === panel ? "text-purple-400" : "text-[#888]"
                          )}>
                            {panel === 'all' ? 'All Panels' : panel}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  {/* Quick Prompts */}
                  <div>
                    <label className="block text-sm font-medium text-[var(--color-text)] mb-2">
                      Quick prompts
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        'Abstract watercolor',
                        'Starry night sky',
                        'Vintage paper texture',
                        'Geometric patterns',
                        'Bokeh lights',
                        'Marble texture',
                        'Wood grain',
                        'Cosmic nebula',
                      ].map(prompt => (
                        <button
                          key={prompt}
                          onClick={() => setAiBgPrompt(prompt)}
                          className="px-3 py-1.5 text-xs rounded-full border border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-purple-500 hover:text-purple-400 transition-colors"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  {/* Actions */}
                  <div className="flex gap-3 pt-4">
                    <Button
                      variant="outline"
                      onClick={() => setShowAIBgModal(false)}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleGenerateAIBackground}
                      disabled={!aiBgPrompt.trim()}
                      className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 gap-2"
                    >
                      <Wand2 className="w-4 h-4" />
                      Generate
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
      
      {/* AI Cover Generation Modal */}
      {showAICoverModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <Card className="w-full max-w-lg mx-4 bg-[var(--color-surface)] border-[var(--color-border)]">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-semibold text-[var(--color-text)] flex items-center gap-2">
                  <Wand2 className="w-5 h-5 text-purple-500" />
                  Generate AI Cover for {activePanel.toUpperCase()}
                </h3>
                <button
                  onClick={() => setShowAICoverModal(false)}
                  className="p-1 hover:bg-[var(--color-border)] rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-[var(--color-text-muted)]" />
                </button>
              </div>
              
              {isGeneratingCover ? (
                <div className="text-center py-8">
                  <Loader2 className="w-12 h-12 mx-auto text-purple-500 animate-spin mb-4" />
                  <p className="text-[var(--color-text)]">
                    Generating your cover image...
                  </p>
                  <p className="text-sm text-[var(--color-text-muted)] mt-2">
                    This may take a few seconds
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Prompt Input */}
                  <div>
                    <label className="block text-sm font-medium text-[var(--color-text)] mb-2">
                      Describe your cover image
                    </label>
                    <textarea
                      value={aiCoverPrompt}
                      onChange={(e) => setAICoverPrompt(e.target.value)}
                      placeholder={`e.g., ${activePanel === 'front' ? 'Epic fantasy landscape with mountains and castle at sunset' : activePanel === 'back' ? 'Author photo or book description background' : 'Simple elegant pattern for spine'}`}
                      className="w-full px-4 py-3 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                      rows={4}
                    />
                  </div>
                  
                  {/* Quick Prompts based on panel */}
                  <div>
                    <label className="block text-sm font-medium text-[var(--color-text)] mb-2">
                      Quick prompts
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {(activePanel === 'front' ? [
                        'Fantasy castle at sunset',
                        'Sci-fi cityscape',
                        'Mysterious forest',
                        'Ocean waves',
                        'Mountain landscape',
                        'Starry night',
                      ] : activePanel === 'back' ? [
                        'Simple texture',
                        'Author silhouette',
                        'Book stack',
                        'Vintage paper',
                        'Minimalist design',
                      ] : [
                        'Elegant pattern',
                        'Simple gradient',
                        'Book title text',
                      ]).map(prompt => (
                        <button
                          key={prompt}
                          onClick={() => setAICoverPrompt(prompt)}
                          className="px-3 py-1.5 text-xs rounded-full border border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-purple-500 hover:text-purple-400 transition-colors"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  {/* Actions */}
                  <div className="flex gap-3 pt-4">
                    <Button
                      variant="outline"
                      onClick={() => setShowAICoverModal(false)}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleGenerateAICover}
                      disabled={!aiCoverPrompt.trim()}
                      className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 gap-2"
                    >
                      <Wand2 className="w-4 h-4" />
                      Generate Cover
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
      
      {/* Cover Analysis Modal */}
      {showAnalysisModal && analysisResult && (
        <CoverAnalysisModal
          result={analysisResult}
          onClose={() => setShowAnalysisModal(false)}
        />
      )}
    </div>
  )
}
