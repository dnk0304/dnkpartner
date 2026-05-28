// ============================================================
// DNK AI Studio - Studio Mode Toggle & Panel
// ============================================================

import { useState, useEffect } from "react"
import { Sparkles, ChevronDown, ChevronUp, Palette, Layers, Image as ImageIcon } from "lucide-react"
import { Button } from "./Button"
import { cn } from "@/lib/utils"
import { StudioModeType, ImageryStyle } from "@/types/StudioMode"

interface StudioModePanelProps {
  mode: StudioModeType
  onModeChange: (mode: StudioModeType) => void
  selectedStyle: ImageryStyle | null
  onOpenStylePicker: () => void
  onOpenStoryBaseManager?: () => void
  activeStoryBaseName?: string
}

export function StudioModePanel({
  mode,
  onModeChange,
  selectedStyle,
  onOpenStylePicker,
  onOpenStoryBaseManager,
  activeStoryBaseName,
}: StudioModePanelProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const [stylePreviewUrl, setStylePreviewUrl] = useState<string | null>(null)

  const isStudioModeActive = mode !== "off"

  // Load style preview URL when style changes
  useEffect(() => {
    if (selectedStyle) {
      // Fetch preview URL from server
      fetch("/api/styles/previews")
        .then((res) => res.json())
        .then((previews) => {
          const url = previews[selectedStyle.id]
          setStylePreviewUrl(url || null)
        })
        .catch((error) => {
          console.error("Failed to load style preview:", error)
          setStylePreviewUrl(null)
        })
    } else {
      setStylePreviewUrl(null)
    }
  }, [selectedStyle])

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-lg overflow-hidden">
      {/* Header */}
      <div
        className={cn(
          "p-4 transition-colors cursor-pointer",
          isStudioModeActive
            ? "bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border-b border-yellow-500/20"
            : "hover:bg-[var(--color-surface-hover)]"
        )}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "p-2 rounded-lg transition-colors",
                isStudioModeActive
                  ? "bg-gradient-to-br from-yellow-500 to-orange-500"
                  : "bg-[var(--color-background)]"
              )}
            >
              <Sparkles className={cn("w-5 h-5", isStudioModeActive ? "text-white" : "text-[var(--color-text-dim)]")} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[var(--color-text)]">Studio Mode</h3>
              <p className="text-xs text-[var(--color-text-muted)]">
                {mode === "off" && "Enhance your prompts with styles and story elements"}
                {mode === "simple" && "Simple mode - Imagery Style only"}
                {mode === "advanced" && "Advanced mode - Full Story Base"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Studio Mode Toggle */}
            <button
              onClick={(e) => {
                e.stopPropagation()
                onModeChange(isStudioModeActive ? "off" : "simple")
              }}
              className={cn(
                "relative w-12 h-6 rounded-full transition-colors",
                isStudioModeActive ? "bg-yellow-500" : "bg-gray-600"
              )}
            >
              <div
                className={cn(
                  "absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform",
                  isStudioModeActive ? "translate-x-6" : "translate-x-0.5"
                )}
              />
            </button>
            {isExpanded ? (
              <ChevronUp className="w-4 h-4 text-[var(--color-text-dim)]" />
            ) : (
              <ChevronDown className="w-4 h-4 text-[var(--color-text-dim)]" />
            )}
          </div>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && isStudioModeActive && (
        <div className="p-4 space-y-4">
          {/* Mode Selector: Simple vs Advanced */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
              Studio Mode Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onModeChange("simple")}
                className={cn(
                  "p-3 rounded-lg border-2 transition-all text-left",
                  mode === "simple"
                    ? "border-yellow-500 bg-yellow-500/10"
                    : "border-[var(--color-border)] hover:border-[var(--color-border-hover)] bg-[var(--color-background)]"
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Palette className="w-4 h-4 text-yellow-500" />
                  <span className="text-sm font-semibold text-[var(--color-text)]">Simple</span>
                </div>
                <p className="text-xs text-[var(--color-text-muted)]">
                  Apply imagery style only
                </p>
              </button>
              <button
                onClick={() => onModeChange("advanced")}
                className={cn(
                  "p-3 rounded-lg border-2 transition-all text-left",
                  mode === "advanced"
                    ? "border-yellow-500 bg-yellow-500/10"
                    : "border-[var(--color-border)] hover:border-[var(--color-border-hover)] bg-[var(--color-background)]"
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Layers className="w-4 h-4 text-orange-500" />
                  <span className="text-sm font-semibold text-[var(--color-text)]">Advanced</span>
                </div>
                <p className="text-xs text-[var(--color-text-muted)]">
                  Full Story Base with details
                </p>
              </button>
            </div>
          </div>

          {/* Simple Mode: Imagery Style Picker */}
          {mode === "simple" && (
            <div className="space-y-3">
              <label className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
                Imagery Style
              </label>
              
              {/* Style Selector Card - Compact */}
              <div
                className={cn(
                  "p-3 rounded-lg border-2 transition-all cursor-pointer",
                  selectedStyle
                    ? "border-yellow-500 bg-yellow-500/5"
                    : "border-dashed border-[var(--color-border)] hover:border-yellow-500/50 bg-[var(--color-background)]"
                )}
                onClick={onOpenStylePicker}
              >
                {selectedStyle ? (
                  <div className="flex items-center gap-3">
                    {stylePreviewUrl ? (
                      <img
                        src={stylePreviewUrl}
                        alt={selectedStyle.name}
                        className="w-12 h-12 rounded-lg object-cover border border-yellow-500/30"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-yellow-500 to-orange-500 flex items-center justify-center">
                        <Palette className="w-6 h-6 text-white" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[var(--color-text)]">
                        {selectedStyle.name}
                      </p>
                      <p className="text-xs text-[var(--color-text-muted)] truncate">
                        Click to change
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-[var(--color-background)] border border-[var(--color-border)] flex items-center justify-center">
                      <Palette className="w-6 h-6 text-[var(--color-text-dim)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[var(--color-text-muted)]">
                        No style selected
                      </p>
                      <p className="text-xs text-[var(--color-text-dim)]">
                        Click to choose
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Advanced Mode: Story Base Manager */}
          {mode === "advanced" && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
                Active Story Base
              </label>
              <div
                className={cn(
                  "p-4 rounded-lg border-2 transition-all cursor-pointer",
                  activeStoryBaseName
                    ? "border-orange-500 bg-orange-500/5"
                    : "border-dashed border-[var(--color-border)] hover:border-orange-500/50 bg-[var(--color-background)]"
                )}
                onClick={onOpenStoryBaseManager}
              >
                {activeStoryBaseName ? (
                  <div className="flex items-center gap-3">
                    <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
                      <Layers className="w-8 h-8 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[var(--color-text)]">
                        {activeStoryBaseName}
                      </p>
                      <p className="text-xs text-[var(--color-text-muted)]">
                        Story Base with characters, objects, and environments
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-4 text-center">
                    <Layers className="w-8 h-8 text-[var(--color-text-dim)] mb-2" />
                    <p className="text-sm text-[var(--color-text-muted)]">
                      Click to create or select a Story Base
                    </p>
                  </div>
                )}
              </div>
              {activeStoryBaseName && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onOpenStoryBaseManager}
                  className="w-full text-xs"
                >
                  Edit Story Base
                </Button>
              )}

              {/* Imagery Style in Advanced Mode */}
              <div className="pt-4 border-t border-[var(--color-border)] space-y-2">
                <label className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wide">
                  Imagery Style (Optional)
                </label>
                <div
                  className={cn(
                    "p-3 rounded-lg border transition-all cursor-pointer",
                    selectedStyle
                      ? "border-yellow-500/50 bg-yellow-500/5"
                      : "border-[var(--color-border)] hover:border-yellow-500/30 bg-[var(--color-background)]"
                  )}
                  onClick={onOpenStylePicker}
                >
                  {selectedStyle ? (
                    <div className="flex items-center gap-2">
                      <Palette className="w-4 h-4 text-yellow-500" />
                      <span className="text-xs text-[var(--color-text)]">
                        {selectedStyle.name}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Palette className="w-4 h-4 text-[var(--color-text-dim)]" />
                      <span className="text-xs text-[var(--color-text-muted)]">
                        No style selected
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Info Box */}
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
            <p className="text-xs text-blue-400">
              💡 <strong>Tip:</strong> Studio Mode enhances your prompts automatically.{" "}
              {mode === "simple" && "Your chosen imagery style will be applied to all generations."}
              {mode === "advanced" && "The AI will extract relevant details from your Story Base for each prompt."}
            </p>
          </div>
        </div>
      )}

      {/* Off State Message */}
      {isExpanded && !isStudioModeActive && (
        <div className="p-4">
          <p className="text-sm text-[var(--color-text-muted)] text-center">
            Enable Studio Mode to enhance your image prompts with consistent styles and story elements
          </p>
        </div>
      )}
    </div>
  )
}


