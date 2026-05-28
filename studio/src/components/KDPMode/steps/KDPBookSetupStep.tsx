import { useState } from "react"
import { Button } from "../../Button"
import { Card, CardContent } from "../../Card"
import { cn } from "@/lib/utils"
import {
  KDPProject,
  BookType,
  BOOK_TYPES,
  INTERIOR_TYPES,
  InteriorType,
  BOOK_TEMPLATES,
  KDP_TRIM_SIZES,
  KDPTrimSizeKey,
} from "@/types/KDPMode"
import { ChevronRight, BookOpen, Book, Palette, Sparkles, Ruler, Check, Settings2 } from "lucide-react"

interface KDPBookSetupStepProps {
  project: KDPProject
  onUpdate: (updates: Partial<KDPProject>) => void
  onNext: () => void
}

// Popular trim sizes for quick selection
const QUICK_TRIM_SIZES = [
  { id: "5x8", label: "5×8", desc: "Pocket" },
  { id: "5.5x8.5", label: "5.5×8.5", desc: "Trade" },
  { id: "6x9", label: "6×9", desc: "Standard" },
  { id: "8.5x8.5", label: "8.5×8.5", desc: "Square" },
  { id: "8.5x11", label: "8.5×11", desc: "Letter" },
]

export function KDPBookSetupStep({ project, onUpdate, onNext }: KDPBookSetupStepProps) {
  const [showCustomSize, setShowCustomSize] = useState(false)
  const [customWidth, setCustomWidth] = useState("")
  const [customHeight, setCustomHeight] = useState("")

  const handleBookTypeSelect = (bookType: BookType) => {
    onUpdate({ bookType })
  }

  const handleInteriorTypeSelect = (interiorType: InteriorType) => {
    // Auto-select appropriate paper type
    const paperTypes = INTERIOR_TYPES[interiorType].paperTypes
    onUpdate({ 
      interiorType,
      paperType: paperTypes[0],
    })
  }

  const handleTemplateSelect = (templateId: string) => {
    const template = BOOK_TEMPLATES.find(t => t.id === templateId)
    if (template) {
      onUpdate({
        bookType: template.defaultBookType,
        trimSize: template.defaultTrimSize,
        interiorType: template.defaultInteriorType,
      })
      setShowCustomSize(false)
    }
  }

  const handleTrimSizeSelect = (trimSize: string) => {
    onUpdate({ trimSize })
    setShowCustomSize(false)
  }

  const handleCustomSizeApply = () => {
    const w = parseFloat(customWidth)
    const h = parseFloat(customHeight)
    if (w >= 4 && w <= 8.5 && h >= 6 && h <= 11.69) {
      // Find closest matching KDP size or use custom format
      const customKey = `${w}x${h}`
      if (KDP_TRIM_SIZES[customKey as KDPTrimSizeKey]) {
        onUpdate({ trimSize: customKey })
      } else {
        // Find closest available size
        const allSizes = Object.entries(KDP_TRIM_SIZES)
        const closest = allSizes.reduce((prev, curr) => {
          const prevDiff = Math.abs(prev[1].width - w) + Math.abs(prev[1].height - h)
          const currDiff = Math.abs(curr[1].width - w) + Math.abs(curr[1].height - h)
          return currDiff < prevDiff ? curr : prev
        })
        onUpdate({ trimSize: closest[0] })
      }
      setShowCustomSize(false)
    }
  }

  const canProceed = project.bookType && project.interiorType && project.trimSize

  // Current selected trim size info
  const currentTrim = KDP_TRIM_SIZES[project.trimSize as KDPTrimSizeKey]
  const isCustomSelected = !QUICK_TRIM_SIZES.some(s => s.id === project.trimSize)

  return (
    <div className="space-y-8">
      {/* Quick Templates */}
      <div>
        <h3 className="text-lg font-semibold text-[var(--color-text)] mb-4 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-[var(--color-primary)]" />
          Quick Start Templates
        </h3>
        <p className="text-sm text-[var(--color-text-muted)] mb-4">
          Choose a template to auto-configure your book settings, or customize below.
        </p>
        {/* Horizontal scrollable template row */}
        <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide">
          {BOOK_TEMPLATES.map((template) => (
            <button
              key={template.id}
              onClick={() => handleTemplateSelect(template.id)}
              className={cn(
                "flex-shrink-0 p-4 rounded-xl border-2 transition-all text-center group snap-start w-32",
                "hover:border-[var(--color-primary)] hover:bg-[var(--color-primary)]/5",
                "border-[var(--color-border)] bg-[var(--color-surface)]"
              )}
            >
              <div className="text-3xl mb-2 group-hover:scale-110 transition-transform">
                {template.thumbnail}
              </div>
              <div className="text-sm font-medium text-[var(--color-text)]">
                {template.name}
              </div>
              <div className="text-xs text-[var(--color-text-dim)] mt-1">
                {template.defaultTrimSize}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Book Type - Horizontal Row */}
      <div>
        <h3 className="text-lg font-semibold text-[var(--color-text)] mb-4 flex items-center gap-2">
          <Book className="w-5 h-5 text-[var(--color-primary)]" />
          Book Type
        </h3>
        <div className="flex gap-3">
          {(Object.entries(BOOK_TYPES) as [BookType, typeof BOOK_TYPES[BookType]][])
            .filter(([type]) => type !== "ebook") // Hide ebook for now
            .map(([type, info]) => (
              <button
                key={type}
                onClick={() => handleBookTypeSelect(type)}
                className={cn(
                  "flex-1 p-4 rounded-xl border-2 transition-all text-center relative overflow-hidden",
                  "hover:shadow-md hover:shadow-[var(--color-primary)]/10",
                  project.bookType === type
                    ? [
                        "border-[var(--color-primary)]",
                        "bg-gradient-to-br from-[var(--color-primary)]/10 to-[var(--color-accent)]/5",
                        "ring-2 ring-[var(--color-primary)]/20",
                      ]
                    : "border-[var(--color-border)] hover:border-[var(--color-border-bright)]"
                )}
              >
                {/* Selection Indicator */}
                {project.bookType === type && (
                  <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[var(--color-primary)] flex items-center justify-center">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
                
                <div className="text-3xl mb-2">{info.icon}</div>
                <h4 className="text-sm font-semibold text-[var(--color-text)]">
                  {info.label}
                </h4>
              </button>
            ))}
        </div>
      </div>

      {/* Interior Type - Horizontal Row */}
      <div>
        <h3 className="text-lg font-semibold text-[var(--color-text)] mb-4 flex items-center gap-2">
          <Palette className="w-5 h-5 text-[var(--color-primary)]" />
          Interior Type
        </h3>
        <div className="flex gap-3">
          {(Object.entries(INTERIOR_TYPES) as [InteriorType, typeof INTERIOR_TYPES[InteriorType]][]).map(
            ([type, info]) => (
              <button
                key={type}
                onClick={() => handleInteriorTypeSelect(type)}
                className={cn(
                  "flex-1 p-4 rounded-xl border-2 transition-all text-center relative overflow-hidden",
                  "hover:shadow-md hover:shadow-[var(--color-primary)]/10",
                  project.interiorType === type
                    ? [
                        "border-[var(--color-primary)]",
                        "bg-gradient-to-br from-[var(--color-primary)]/10 to-[var(--color-accent)]/5",
                        "ring-2 ring-[var(--color-primary)]/20",
                      ]
                    : "border-[var(--color-border)] hover:border-[var(--color-border-bright)]"
                )}
              >
                {/* Selection Indicator */}
                {project.interiorType === type && (
                  <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[var(--color-primary)] flex items-center justify-center">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
                
                {/* Visual Preview */}
                <div className="w-10 h-10 mx-auto mb-2 rounded-lg flex items-center justify-center border border-[var(--color-border)]"
                  style={{
                    background: type === "black-white" 
                      ? "linear-gradient(135deg, #fff 50%, #000 50%)"
                      : type === "standard-color"
                        ? "linear-gradient(135deg, #ff6b6b, #4ecdc4, #ffe66d)"
                        : "linear-gradient(135deg, #667eea, #764ba2, #f093fb)"
                  }}
                />
                
                <h4 className="text-sm font-semibold text-[var(--color-text)]">
                  {info.label}
                </h4>
              </button>
            )
          )}
        </div>
      </div>

      {/* Trim Size - Icon Row */}
      <div>
        <h3 className="text-lg font-semibold text-[var(--color-text)] mb-4 flex items-center gap-2">
          <Ruler className="w-5 h-5 text-[var(--color-primary)]" />
          Trim Size
        </h3>
        
        <div className="flex gap-2">
          {/* Quick size options */}
          {QUICK_TRIM_SIZES.map((size) => {
            const isSelected = project.trimSize === size.id
            const trim = KDP_TRIM_SIZES[size.id as KDPTrimSizeKey]
            
            return (
              <button
                key={size.id}
                onClick={() => handleTrimSizeSelect(size.id)}
                className={cn(
                  "flex-1 p-3 rounded-xl border-2 transition-all text-center relative",
                  "hover:shadow-md hover:shadow-[var(--color-primary)]/10",
                  isSelected
                    ? [
                        "border-[var(--color-primary)]",
                        "bg-gradient-to-br from-[var(--color-primary)]/10 to-[var(--color-accent)]/5",
                        "ring-2 ring-[var(--color-primary)]/20",
                      ]
                    : "border-[var(--color-border)] hover:border-[var(--color-border-bright)]"
                )}
              >
                {isSelected && (
                  <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[var(--color-primary)] flex items-center justify-center">
                    <Check className="w-2.5 h-2.5 text-white" />
                  </div>
                )}
                {/* Visual book shape */}
                {trim && (
                  <div 
                    className={cn(
                      "mx-auto mb-2 rounded-sm",
                      isSelected 
                        ? "bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-accent)]" 
                        : "bg-[var(--color-border)]"
                    )}
                    style={{ 
                      width: `${Math.min(32, trim.width * 4)}px`, 
                      height: `${Math.min(44, trim.height * 4)}px` 
                    }}
                  />
                )}
                <div className="text-xs font-semibold text-[var(--color-text)]">{size.label}</div>
                <div className="text-[10px] text-[var(--color-text-dim)]">{size.desc}</div>
              </button>
            )
          })}
          
          {/* Custom size button */}
          <button
            onClick={() => setShowCustomSize(!showCustomSize)}
            className={cn(
              "flex-1 p-3 rounded-xl border-2 transition-all text-center relative",
              "hover:shadow-md hover:shadow-[var(--color-primary)]/10",
              (showCustomSize || isCustomSelected)
                ? [
                    "border-[var(--color-primary)]",
                    "bg-gradient-to-br from-[var(--color-primary)]/10 to-[var(--color-accent)]/5",
                    "ring-2 ring-[var(--color-primary)]/20",
                  ]
                : "border-[var(--color-border)] hover:border-[var(--color-border-bright)]"
            )}
          >
            {isCustomSelected && (
              <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[var(--color-primary)] flex items-center justify-center">
                <Check className="w-2.5 h-2.5 text-white" />
              </div>
            )}
            <Settings2 className={cn(
              "w-6 h-6 mx-auto mb-2",
              (showCustomSize || isCustomSelected) ? "text-[var(--color-primary)]" : "text-[var(--color-text-dim)]"
            )} />
            <div className="text-xs font-semibold text-[var(--color-text)]">More Sizes</div>
            <div className="text-[10px] text-[var(--color-text-dim)]">
              {isCustomSelected ? currentTrim?.label : "Other"}
            </div>
          </button>
        </div>

        {/* Custom size panel */}
        {showCustomSize && (
          <Card className="mt-4 bg-[var(--color-surface)]/50">
            <CardContent className="py-4">
              <div className="flex items-end gap-4">
                <div className="flex-1">
                  <label className="block text-xs text-[var(--color-text-muted)] mb-1">Width (inches)</label>
                  <input
                    type="number"
                    step="0.25"
                    min="4"
                    max="8.5"
                    value={customWidth}
                    onChange={(e) => setCustomWidth(e.target.value)}
                    placeholder="e.g. 6"
                    className="w-full px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  />
                </div>
                <span className="text-[var(--color-text-dim)] pb-2">×</span>
                <div className="flex-1">
                  <label className="block text-xs text-[var(--color-text-muted)] mb-1">Height (inches)</label>
                  <input
                    type="number"
                    step="0.25"
                    min="6"
                    max="11.69"
                    value={customHeight}
                    onChange={(e) => setCustomHeight(e.target.value)}
                    placeholder="e.g. 9"
                    className="w-full px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                  />
                </div>
                <Button 
                  onClick={handleCustomSizeApply}
                  disabled={!customWidth || !customHeight}
                  size="sm"
                >
                  Apply
                </Button>
              </div>
              <p className="text-xs text-[var(--color-text-dim)] mt-2">
                KDP supports sizes from 4×6" to 8.5×11.69". We'll match the closest available size.
              </p>
              
              {/* All sizes dropdown */}
              <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Or select from all {Object.keys(KDP_TRIM_SIZES).length} sizes:</label>
                <select
                  value={project.trimSize}
                  onChange={(e) => handleTrimSizeSelect(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
                >
                  {Object.entries(KDP_TRIM_SIZES).map(([key, size]) => (
                    <option key={key} value={key}>
                      {size.label} ({(size.width * 2.54).toFixed(1)} × {(size.height * 2.54).toFixed(1)} cm)
                    </option>
                  ))}
                </select>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Selected Summary Bar */}
      {canProceed && (
        <Card className="bg-gradient-to-r from-[var(--color-primary)]/10 to-[var(--color-accent)]/10 border-[var(--color-primary)]/30">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium text-[var(--color-text)]">Book Setup Complete</h4>
                <p className="text-sm text-[var(--color-text-muted)] mt-1">
                  {BOOK_TYPES[project.bookType].label} • {INTERIOR_TYPES[project.interiorType].label} • {project.trimSize}
                </p>
              </div>
              <Button onClick={onNext} className="gap-2">
                Continue to Interior
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Help Text */}
      <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
        <h4 className="text-sm font-medium text-blue-400 mb-2 flex items-center gap-2">
          <BookOpen className="w-4 h-4" />
          Tips
        </h4>
        <ul className="text-sm text-[var(--color-text-muted)] space-y-1">
          <li>• <strong>Paperback</strong> is cost-effective for most books</li>
          <li>• <strong>Premium Color</strong> is recommended for art books and children's books</li>
          <li>• <strong>6×9</strong> is the most popular size for novels</li>
        </ul>
      </div>
    </div>
  )
}
