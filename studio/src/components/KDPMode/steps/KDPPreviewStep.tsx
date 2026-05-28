import { useState, useEffect, useRef } from "react"
import { Button } from "../../Button"
import { Card, CardContent } from "../../Card"
import { cn } from "@/lib/utils"
import {
  KDPProject,
  KDP_TRIM_SIZES,
  KDPTrimSizeKey,
  calculateCoverDimensions,
  KDPPaperType,
  BOOK_TYPES,
  INTERIOR_TYPES,
} from "@/types/KDPMode"
import { 
  ChevronLeft, 
  ChevronRight,
  RotateCcw,
  BookOpen,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Eye,
  Download,
  Printer,
} from "lucide-react"

interface KDPPreviewStepProps {
  project: KDPProject
  onUpdate: (updates: Partial<KDPProject>) => void
  onBack: () => void
  validation: {
    valid: boolean
    errors: string[]
    warnings: string[]
  }
}

export function KDPPreviewStep({ project, onUpdate, onBack, validation }: KDPPreviewStepProps) {
  const [previewMode, setPreviewMode] = useState<"spread" | "3d" | "flip">("spread")
  const [currentSpread, setCurrentSpread] = useState(0)
  const [isFlipping, setIsFlipping] = useState(false)
  const [flipAngle, setFlipAngle] = useState(0)
  const bookRef = useRef<HTMLDivElement>(null)

  const trim = project.trimSize ? KDP_TRIM_SIZES[project.trimSize as KDPTrimSizeKey] : null
  const coverDims = trim && project.pageCount
    ? calculateCoverDimensions(project.trimSize as KDPTrimSizeKey, project.pageCount, (project.paperType || "white") as KDPPaperType)
    : null

  // Calculate spreads (pairs of pages)
  const spreads = []
  for (let i = 0; i < project.pages.length; i += 2) {
    spreads.push({
      left: project.pages[i],
      right: project.pages[i + 1] || null,
    })
  }

  // Navigate spreads
  const goToNextSpread = () => {
    if (currentSpread < spreads.length - 1) {
      setIsFlipping(true)
      setFlipAngle(180)
      setTimeout(() => {
        setCurrentSpread(s => s + 1)
        setFlipAngle(0)
        setIsFlipping(false)
      }, 300)
    }
  }

  const goToPrevSpread = () => {
    if (currentSpread > 0) {
      setIsFlipping(true)
      setFlipAngle(-180)
      setTimeout(() => {
        setCurrentSpread(s => s - 1)
        setFlipAngle(0)
        setIsFlipping(false)
      }, 300)
    }
  }

  // Validation summary
  const getValidationIcon = () => {
    if (validation.errors.length > 0) {
      return <XCircle className="w-6 h-6 text-red-500" />
    }
    if (validation.warnings.length > 0) {
      return <AlertTriangle className="w-6 h-6 text-yellow-500" />
    }
    return <CheckCircle className="w-6 h-6 text-green-500" />
  }

  const getValidationStatus = () => {
    if (validation.errors.length > 0) {
      return { text: "Not Ready", color: "text-red-500", bg: "bg-red-500/10 border-red-500/30" }
    }
    if (validation.warnings.length > 0) {
      return { text: "Ready with Warnings", color: "text-yellow-500", bg: "bg-yellow-500/10 border-yellow-500/30" }
    }
    return { text: "Ready for Export", color: "text-green-500", bg: "bg-green-500/10 border-green-500/30" }
  }

  const status = getValidationStatus()

  return (
    <div className="space-y-6">
      {/* Validation Status Banner */}
      <Card className={cn("border", status.bg)}>
        <CardContent className="py-4">
          <div className="flex items-center gap-4">
            {getValidationIcon()}
            <div className="flex-1">
              <h3 className={cn("text-lg font-semibold", status.color)}>
                {status.text}
              </h3>
              <p className="text-sm text-[var(--color-text-muted)]">
                {validation.errors.length > 0 
                  ? `${validation.errors.length} error(s) must be fixed before export`
                  : validation.warnings.length > 0
                    ? `${validation.warnings.length} warning(s) - review before export`
                    : "Your book is ready for KDP submission"
                }
              </p>
            </div>
            {validation.valid && (
              <Button className="gap-2">
                <Download className="w-4 h-4" />
                Export Now
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Preview Mode Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2 p-1 bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)]">
          <button
            onClick={() => setPreviewMode("spread")}
            className={cn(
              "px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2",
              previewMode === "spread"
                ? "bg-[var(--color-primary)] text-white"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            )}
          >
            <BookOpen className="w-4 h-4" />
            Spread View
          </button>
          <button
            onClick={() => setPreviewMode("3d")}
            className={cn(
              "px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2",
              previewMode === "3d"
                ? "bg-[var(--color-primary)] text-white"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            )}
          >
            <Eye className="w-4 h-4" />
            3D Preview
          </button>
        </div>
        
        <div className="text-sm text-[var(--color-text-muted)]">
          Spread {currentSpread + 1} of {spreads.length || 1}
        </div>
      </div>

      {/* Book Preview */}
      <div className="relative bg-gradient-to-br from-[#1a1a2e] to-[#16213e] rounded-2xl p-8 min-h-[500px] flex items-center justify-center overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0" style={{
            backgroundImage: `radial-gradient(circle at 2px 2px, white 1px, transparent 0)`,
            backgroundSize: "32px 32px",
          }} />
        </div>

        {previewMode === "spread" ? (
          // Spread View
          <div className="relative z-10">
            {/* Book Spread */}
            <div 
              ref={bookRef}
              className={cn(
                "flex shadow-2xl transition-transform duration-300",
                isFlipping && "scale-95"
              )}
              style={{
                perspective: "1000px",
                transform: `rotateY(${flipAngle}deg)`,
                transformStyle: "preserve-3d",
              }}
            >
              {/* Left Page */}
              <div 
                className="bg-white rounded-l-lg shadow-inner flex items-center justify-center relative overflow-hidden"
                style={{ 
                  width: trim ? `${trim.width * 40}px` : "240px",
                  height: trim ? `${trim.height * 40}px` : "320px",
                }}
              >
                {spreads[currentSpread]?.left?.images[0] ? (
                  <img
                    src={spreads[currentSpread].left.images[0].src}
                    alt={`Page ${spreads[currentSpread].left.pageNumber}`}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="text-gray-300 text-sm">
                    {spreads[currentSpread]?.left ? `Page ${spreads[currentSpread].left.pageNumber}` : "Empty"}
                  </div>
                )}
                {/* Page number */}
                <div className="absolute bottom-2 left-4 text-xs text-gray-400">
                  {spreads[currentSpread]?.left?.pageNumber || "-"}
                </div>
                {/* Spine shadow */}
                <div className="absolute right-0 top-0 bottom-0 w-4 bg-gradient-to-l from-black/10 to-transparent" />
              </div>

              {/* Spine */}
              <div 
                className="bg-gradient-to-r from-gray-200 to-gray-100 flex items-center justify-center"
                style={{ 
                  width: coverDims ? `${coverDims.spineWidth * 40}px` : "20px",
                  minWidth: "8px",
                }}
              >
                {project.cover.spineText && (
                  <span 
                    className="text-xs text-gray-600 whitespace-nowrap"
                    style={{ 
                      writingMode: "vertical-rl",
                      textOrientation: "mixed",
                      transform: "rotate(180deg)",
                    }}
                  >
                    {project.cover.spineText}
                  </span>
                )}
              </div>

              {/* Right Page */}
              <div 
                className="bg-white rounded-r-lg shadow-inner flex items-center justify-center relative overflow-hidden"
                style={{ 
                  width: trim ? `${trim.width * 40}px` : "240px",
                  height: trim ? `${trim.height * 40}px` : "320px",
                }}
              >
                {spreads[currentSpread]?.right?.images[0] ? (
                  <img
                    src={spreads[currentSpread].right.images[0].src}
                    alt={`Page ${spreads[currentSpread].right.pageNumber}`}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="text-gray-300 text-sm">
                    {spreads[currentSpread]?.right ? `Page ${spreads[currentSpread].right.pageNumber}` : "Empty"}
                  </div>
                )}
                {/* Page number */}
                <div className="absolute bottom-2 right-4 text-xs text-gray-400">
                  {spreads[currentSpread]?.right?.pageNumber || "-"}
                </div>
                {/* Spine shadow */}
                <div className="absolute left-0 top-0 bottom-0 w-4 bg-gradient-to-r from-black/10 to-transparent" />
              </div>
            </div>

            {/* Navigation Arrows */}
            <button
              onClick={goToPrevSpread}
              disabled={currentSpread === 0}
              className={cn(
                "absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center transition-all",
                currentSpread === 0 
                  ? "opacity-30 cursor-not-allowed" 
                  : "hover:bg-white/20 hover:scale-110"
              )}
            >
              <ChevronLeft className="w-6 h-6 text-white" />
            </button>
            <button
              onClick={goToNextSpread}
              disabled={currentSpread >= spreads.length - 1}
              className={cn(
                "absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center transition-all",
                currentSpread >= spreads.length - 1 
                  ? "opacity-30 cursor-not-allowed" 
                  : "hover:bg-white/20 hover:scale-110"
              )}
            >
              <ChevronRight className="w-6 h-6 text-white" />
            </button>
          </div>
        ) : (
          // 3D Preview
          <div 
            className="relative z-10"
            style={{
              perspective: "1000px",
              transformStyle: "preserve-3d",
            }}
          >
            <div
              className="relative transition-transform duration-500"
              style={{
                transform: "rotateY(-20deg) rotateX(10deg)",
                transformStyle: "preserve-3d",
              }}
            >
              {/* Book Cover */}
              <div 
                className="relative rounded-r-lg shadow-2xl overflow-hidden"
                style={{ 
                  width: trim ? `${trim.width * 50}px` : "300px",
                  height: trim ? `${trim.height * 50}px` : "400px",
                  transformStyle: "preserve-3d",
                }}
              >
                {project.cover.frontImage?.src || project.cover.fullCoverImage?.src ? (
                  <img
                    src={project.cover.frontImage?.src || project.cover.fullCoverImage?.src}
                    alt="Book Cover"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-purple-600 to-pink-500 flex items-center justify-center">
                    <div className="text-white text-center p-4">
                      <BookOpen className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <span className="text-sm opacity-70">No Cover</span>
                    </div>
                  </div>
                )}
                
                {/* Spine edge */}
                <div 
                  className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-black/30 to-transparent"
                  style={{ 
                    width: coverDims ? `${coverDims.spineWidth * 50}px` : "15px",
                    transform: "translateX(-100%) rotateY(-90deg)",
                    transformOrigin: "right center",
                  }}
                />
              </div>

              {/* Pages edge effect */}
              <div 
                className="absolute right-0 top-2 bottom-2 bg-gradient-to-l from-gray-100 to-gray-200"
                style={{
                  width: "10px",
                  transform: "translateX(100%) rotateY(90deg)",
                  transformOrigin: "left center",
                  borderRadius: "0 2px 2px 0",
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Page Thumbnails */}
      {previewMode === "spread" && spreads.length > 1 && (
        <div className="flex items-center justify-center gap-2 overflow-x-auto pb-2">
          {spreads.map((spread, index) => (
            <button
              key={index}
              onClick={() => setCurrentSpread(index)}
              className={cn(
                "flex-shrink-0 w-16 h-12 rounded border-2 overflow-hidden transition-all",
                currentSpread === index
                  ? "border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/30"
                  : "border-[var(--color-border)] hover:border-[var(--color-border-bright)] opacity-60"
              )}
            >
              <div className="flex w-full h-full">
                <div className="w-1/2 h-full bg-gray-100 flex items-center justify-center text-xs text-gray-400">
                  {spread.left?.pageNumber || "-"}
                </div>
                <div className="w-1/2 h-full bg-gray-50 flex items-center justify-center text-xs text-gray-400">
                  {spread.right?.pageNumber || "-"}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Book Details Summary */}
      <Card>
        <CardContent className="py-4">
          <h4 className="text-sm font-semibold text-[var(--color-text)] mb-4">Book Details</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-[var(--color-text-dim)]">Format:</span>
              <div className="font-medium text-[var(--color-text)]">
                {BOOK_TYPES[project.bookType].label}
              </div>
            </div>
            <div>
              <span className="text-[var(--color-text-dim)]">Trim Size:</span>
              <div className="font-medium text-[var(--color-text)]">
                {trim?.label || project.trimSize}
              </div>
            </div>
            <div>
              <span className="text-[var(--color-text-dim)]">Interior:</span>
              <div className="font-medium text-[var(--color-text)]">
                {INTERIOR_TYPES[project.interiorType].label}
              </div>
            </div>
            <div>
              <span className="text-[var(--color-text-dim)]">Pages:</span>
              <div className="font-medium text-[var(--color-text)]">
                {project.pageCount} ({project.pages.length} with content)
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Validation Details */}
      {(validation.errors.length > 0 || validation.warnings.length > 0) && (
        <div className="space-y-4">
          {validation.errors.length > 0 && (
            <Card className="border-red-500/30 bg-red-500/5">
              <CardContent className="py-4">
                <h4 className="text-sm font-semibold text-red-500 mb-2 flex items-center gap-2">
                  <XCircle className="w-4 h-4" />
                  Errors ({validation.errors.length})
                </h4>
                <ul className="text-sm text-[var(--color-text-muted)] space-y-1">
                  {validation.errors.map((error, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-red-500">•</span>
                      {error}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {validation.warnings.length > 0 && (
            <Card className="border-yellow-500/30 bg-yellow-500/5">
              <CardContent className="py-4">
                <h4 className="text-sm font-semibold text-yellow-500 mb-2 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Warnings ({validation.warnings.length})
                </h4>
                <ul className="text-sm text-[var(--color-text-muted)] space-y-1">
                  {validation.warnings.map((warning, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-yellow-500">•</span>
                      {warning}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-4 border-t border-[var(--color-border)]">
        <Button variant="outline" onClick={onBack} className="gap-2">
          <ChevronLeft className="w-4 h-4" />
          Back to Export
        </Button>
        
        <Button 
          onClick={() => window.print()}
          variant="outline"
          className="gap-2"
        >
          <Printer className="w-4 h-4" />
          Print Preview
        </Button>
      </div>
    </div>
  )
}

