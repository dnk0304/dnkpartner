// ============================================================
// AI Bot Prompt Studio - Page count, imagery style, and AI chat for prompt generation
// ============================================================

import { useState, useCallback, useEffect } from "react"
import { 
  Sparkles, 
  CheckCircle, 
  AlertCircle, 
  Grid3x3, 
  Info, 
  ChevronLeft,
  ChevronDown,
  Hash,
  Palette,
  Check,
  Minus,
  Plus,
  X
} from "lucide-react"
import { Button } from "../../Button"
import { Card, CardContent } from "../../Card"
import { InlineChat } from "../../InlineChat"
import { ImageryStylePicker } from "../../ImageryStylePicker"
import { cn } from "@/lib/utils"
import { ImageryStyle } from "@/types/StudioMode"
import type { AIBotWizardState } from "../KDPAIBotWizard"

// ============================================================
// Types
// ============================================================

interface AIBotPromptStudioProps {
  state: AIBotWizardState
  onUpdate: (updates: Partial<AIBotWizardState>) => void
  onComplete: () => void
  onBack: () => void
}

// ============================================================
// Constants
// ============================================================

const PAGE_COUNT_PRESETS = [
  { value: 24, label: "24", desc: "Minimum" },
  { value: 32, label: "32", desc: "Short" },
  { value: 48, label: "48", desc: "Medium" },
  { value: 64, label: "64", desc: "Standard" },
  { value: 100, label: "100", desc: "Large" },
]

// ============================================================
// Component
// ============================================================

export function AIBotPromptStudio({ state, onUpdate, onComplete, onBack }: AIBotPromptStudioProps) {
  const [showStylePicker, setShowStylePicker] = useState(false)
  const [showPromptsPreview, setShowPromptsPreview] = useState(false)
  const [customPageCount, setCustomPageCount] = useState("")

  // Handle prompts extracted from InlineChat
  const handlePromptsExtracted = useCallback((prompts: string[]) => {
    console.log(`[AIBotPromptStudio] Extracted ${prompts.length} prompts`)
    onUpdate({ prompts })
  }, [onUpdate])

  // Page count handlers
  const handlePresetSelect = (value: number) => {
    onUpdate({ pageCount: value })
    setCustomPageCount("")
  }

  const handleCustomPageCountChange = (value: string) => {
    setCustomPageCount(value)
    const num = parseInt(value, 10)
    if (!isNaN(num) && num >= 24 && num <= 828) {
      onUpdate({ pageCount: num })
    }
  }

  const handlePageCountIncrement = (delta: number) => {
    const newValue = Math.max(24, Math.min(828, state.pageCount + delta))
    onUpdate({ pageCount: newValue })
    if (!PAGE_COUNT_PRESETS.some(p => p.value === newValue)) {
      setCustomPageCount(newValue.toString())
    } else {
      setCustomPageCount("")
    }
  }

  // Style picker
  const handleStyleSelect = (style: ImageryStyle | null) => {
    onUpdate({ imageryStyle: style })
    setShowStylePicker(false)
  }

  // Build context for AI chat
  const buildContextMessage = useCallback(() => {
    const { pageCount, bookTitle, authorName, subtitle, imageryStyle, bookType, trimSize } = state
    
    let context = `You are helping create a ${bookType} book`
    if (bookTitle) context += ` titled "${bookTitle}"`
    if (authorName) context += ` by ${authorName}`
    if (subtitle) context += ` (${subtitle})`
    context += `. The book will have ${pageCount} pages with a ${trimSize} trim size.`
    
    if (imageryStyle) {
      context += `\n\nArt Style: ${imageryStyle.name} - ${imageryStyle.description}`
      if (imageryStyle.prompt) {
        context += `\nStyle Keywords: ${imageryStyle.prompt}`
      }
    }
    
    context += `\n\nPlease help generate ${pageCount} unique, detailed image prompts for this book. Each prompt should be suitable for AI image generation.`
    
    return context
  }, [state])

  // Check if we have the right number of prompts
  const promptCountMatch = state.prompts.length === state.pageCount
  const hasPrompts = state.prompts.length > 0
  const isPageCountValid = state.pageCount >= 24 && state.pageCount <= 828

  return (
    <div className="flex flex-col h-[calc(100vh-300px)] min-h-[500px]">
      {/* Settings Bar - Above Chat */}
      <div className="flex-shrink-0 p-4 bg-gradient-to-r from-purple-500/10 to-pink-500/10 border-b border-purple-500/30">
        <div className="flex items-center gap-6 flex-wrap">
          {/* Page Count */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm font-medium text-[var(--color-text)]">
              <Hash className="w-4 h-4 text-purple-400" />
              Pages:
            </div>
            
            {/* Quick Presets */}
            <div className="flex gap-1">
              {PAGE_COUNT_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => handlePresetSelect(preset.value)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-xs font-medium transition-all",
                    state.pageCount === preset.value && customPageCount === ""
                      ? "bg-purple-500 text-white"
                      : "bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] border border-[var(--color-border)]"
                  )}
                  title={preset.desc}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Custom Input */}
            <div className="flex items-center gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-1">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => handlePageCountIncrement(-2)}
                disabled={state.pageCount <= 24}
                className="h-6 w-6"
              >
                <Minus className="w-3 h-3" />
              </Button>
              
              <input
                type="number"
                value={customPageCount || state.pageCount}
                onChange={(e) => handleCustomPageCountChange(e.target.value)}
                min={24}
                max={828}
                step={2}
                className="w-12 px-1 py-0.5 bg-transparent text-center text-[var(--color-text)] text-sm font-medium focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => handlePageCountIncrement(2)}
                disabled={state.pageCount >= 828}
                className="h-6 w-6"
              >
                <Plus className="w-3 h-3" />
              </Button>
            </div>
          </div>

          {/* Divider */}
          <div className="h-8 w-px bg-[var(--color-border)]" />

          {/* Imagery Style */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-sm font-medium text-[var(--color-text)]">
              <Palette className="w-4 h-4 text-pink-400" />
              Style:
            </div>
            
            <button
              onClick={() => setShowStylePicker(true)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm transition-all",
                state.imageryStyle
                  ? "bg-pink-500/20 text-pink-300 border border-pink-500/50"
                  : "bg-[var(--color-surface)] text-[var(--color-text-muted)] border border-[var(--color-border)] hover:border-pink-500/50"
              )}
            >
              {state.imageryStyle ? (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  {state.imageryStyle.name}
                  <ChevronDown className="w-3.5 h-3.5" />
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  Select Style
                </>
              )}
            </button>

            {state.imageryStyle && (
              <button
                onClick={() => onUpdate({ imageryStyle: null })}
                className="p-1 text-[var(--color-text-dim)] hover:text-red-400 transition-colors"
                title="Clear style"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Back Button */}
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-1">
            <ChevronLeft className="w-4 h-4" />
            Back
          </Button>
        </div>
      </div>

      {/* Status Bar - Shows prompt progress */}
      <div className="flex-shrink-0 p-3 bg-[var(--color-background)] border-b border-[var(--color-border)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {hasPrompts ? (
              promptCountMatch ? (
                <div className="flex items-center gap-2 text-green-400">
                  <CheckCircle className="w-4 h-4" />
                  <span className="text-sm font-medium">{state.prompts.length} of {state.pageCount} prompts ready!</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-yellow-400">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-sm font-medium">
                    {state.prompts.length} of {state.pageCount} prompts
                    {state.prompts.length < state.pageCount 
                      ? ` (need ${state.pageCount - state.prompts.length} more)`
                      : ` (${state.prompts.length - state.pageCount} extra)`
                    }
                  </span>
                </div>
              )
            ) : (
              <div className="flex items-center gap-2 text-[var(--color-text-muted)]">
                <Info className="w-4 h-4" />
                <span className="text-sm">Use the AI chat below to generate {state.pageCount} prompts</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {hasPrompts && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPromptsPreview(!showPromptsPreview)}
                className="gap-1 text-xs"
              >
                <Grid3x3 className="w-3.5 h-3.5" />
                {showPromptsPreview ? "Hide" : "Preview"} Prompts
              </Button>
            )}
            
            {promptCountMatch && (
              <Button
                onClick={onComplete}
                className="gap-2 bg-green-500 hover:bg-green-600"
              >
                <Check className="w-4 h-4" />
                Finish Wizard
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Prompts Preview (Collapsible) */}
      {showPromptsPreview && hasPrompts && (
        <div className="flex-shrink-0 p-3 bg-[var(--color-surface)] border-b border-[var(--color-border)] max-h-40 overflow-y-auto">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {state.prompts.map((prompt, index) => (
              <div
                key={index}
                className="p-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg hover:border-[var(--color-primary)] transition-colors"
              >
                <div className="flex items-start gap-2">
                  <div className="flex-shrink-0 w-5 h-5 bg-[var(--color-primary)]/20 rounded-full flex items-center justify-center text-[10px] font-bold text-[var(--color-primary)]">
                    {index + 1}
                  </div>
                  <p className="text-[10px] text-[var(--color-text)] line-clamp-2 flex-1">
                    {prompt}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Chat Area - Takes remaining space */}
      <div className="flex-1 min-h-0 relative">
        <InlineChat
          mode="image"
          isOpen={true}
          onClose={() => {}} // Keep open, no close
          onPromptsExtracted={handlePromptsExtracted}
          disabled={false}
          selectedImageryStyle={state.imageryStyle}
          onSelectImageryStyle={(style) => onUpdate({ imageryStyle: style as ImageryStyle | null })}
        />
      </div>

      {/* Style Picker Modal */}
      {showStylePicker && (
        <ImageryStylePicker
          selectedStyle={state.imageryStyle}
          onSelectStyle={handleStyleSelect}
          onClose={() => setShowStylePicker(false)}
        />
      )}
    </div>
  )
}







