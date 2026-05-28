// ============================================================
// AI Bot Book Setup Step - Collect book type, trim size, and metadata
// ============================================================

import { useState } from "react"
import { User, BookOpen, FileText, Book, Ruler, ChevronRight, Info, Check } from "lucide-react"
import { Button } from "../../Button"
import { Card, CardContent } from "../../Card"
import { cn } from "@/lib/utils"
import {
  BookType,
  BOOK_TYPES,
  KDP_TRIM_SIZES,
  KDPTrimSizeKey,
} from "@/types/KDPMode"
import type { AIBotWizardState } from "../KDPAIBotWizard"

// ============================================================
// Types
// ============================================================

interface AIBotBookSetupProps {
  state: AIBotWizardState
  onUpdate: (updates: Partial<AIBotWizardState>) => void
  onNext: () => void
}

// ============================================================
// Constants
// ============================================================

// Popular trim sizes for quick selection
const QUICK_TRIM_SIZES = [
  { id: "5x8", label: "5×8", desc: "Pocket", icon: "📘" },
  { id: "5.5x8.5", label: "5.5×8.5", desc: "Trade", icon: "📗" },
  { id: "6x9", label: "6×9", desc: "Standard", icon: "📕" },
  { id: "8.5x8.5", label: "8.5×8.5", desc: "Square", icon: "📙" },
  { id: "8.5x11", label: "8.5×11", desc: "Letter", icon: "📓" },
]

// ============================================================
// Component
// ============================================================

export function AIBotBookSetup({ state, onUpdate, onNext }: AIBotBookSetupProps) {
  const [showAllSizes, setShowAllSizes] = useState(false)

  // Handlers
  const handleBookTypeSelect = (bookType: BookType) => {
    onUpdate({ bookType })
  }

  const handleTrimSizeSelect = (trimSize: string) => {
    onUpdate({ trimSize })
    setShowAllSizes(false)
  }

  // Validation
  const canProceed = state.bookType && state.trimSize

  // Current selected trim size info
  const currentTrim = KDP_TRIM_SIZES[state.trimSize as KDPTrimSizeKey]

  return (
    <div className="p-6 space-y-6">
      {/* Header Info */}
      <div className="flex items-start gap-3 p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl">
        <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
        <div>
          <h4 className="text-sm font-medium text-blue-400 mb-1">Step 1: Book Setup</h4>
          <p className="text-sm text-[var(--color-text-muted)]">
            Choose your book format and enter optional details. These settings determine your book's physical dimensions and can be used in AI-generated prompts.
          </p>
        </div>
      </div>

      {/* Book Type Selection */}
      <div>
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3 flex items-center gap-2">
          <Book className="w-4 h-4 text-[var(--color-primary)]" />
          Book Type
          <span className="text-xs text-red-400 font-normal">* required</span>
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {(Object.entries(BOOK_TYPES) as [BookType, typeof BOOK_TYPES[BookType]][])
            .filter(([type]) => type !== "ebook") // Hide ebook for now
            .map(([type, info]) => (
              <button
                key={type}
                onClick={() => handleBookTypeSelect(type)}
                className={cn(
                  "p-4 rounded-xl border-2 transition-all text-left relative overflow-hidden",
                  "hover:shadow-md hover:shadow-[var(--color-primary)]/10",
                  state.bookType === type
                    ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10"
                    : "border-[var(--color-border)] hover:border-[var(--color-border-bright)]"
                )}
              >
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{info.icon}</span>
                  <div>
                    <div className="font-semibold text-[var(--color-text)]">{info.label}</div>
                    <div className="text-xs text-[var(--color-text-muted)] mt-0.5">
                      {info.description}
                    </div>
                  </div>
                </div>
                {state.bookType === type && (
                  <div className="absolute top-2 right-2 w-6 h-6 bg-[var(--color-primary)] rounded-full flex items-center justify-center">
                    <Check className="w-4 h-4 text-white" />
                  </div>
                )}
              </button>
            ))}
        </div>
      </div>

      {/* Trim Size Selection */}
      <div>
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3 flex items-center gap-2">
          <Ruler className="w-4 h-4 text-[var(--color-primary)]" />
          Trim Size
          <span className="text-xs text-red-400 font-normal">* required</span>
        </h3>
        
        {/* Quick Trim Sizes - Visual Grid */}
        <div className="grid grid-cols-5 gap-2 mb-3">
          {QUICK_TRIM_SIZES.map((size) => {
            const isSelected = state.trimSize === size.id
            const trim = KDP_TRIM_SIZES[size.id as KDPTrimSizeKey]
            
            return (
              <button
                key={size.id}
                onClick={() => handleTrimSizeSelect(size.id)}
                className={cn(
                  "p-3 rounded-xl border-2 transition-all text-center relative",
                  "hover:shadow-md hover:shadow-[var(--color-primary)]/10",
                  isSelected
                    ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10"
                    : "border-[var(--color-border)] hover:border-[var(--color-border-bright)]"
                )}
              >
                <span className="text-2xl mb-1 block">{size.icon}</span>
                <div className="text-xs font-semibold text-[var(--color-text)]">{size.label}</div>
                <div className="text-[10px] text-[var(--color-text-dim)]">{size.desc}</div>
                {trim && (
                  <div 
                    className="mt-2 mx-auto bg-[var(--color-surface)] border border-[var(--color-border)] rounded"
                    style={{ 
                      width: `${Math.min(32, trim.width * 5)}px`, 
                      height: `${Math.min(44, trim.height * 5)}px` 
                    }}
                  />
                )}
                {isSelected && (
                  <div className="absolute top-1 right-1 w-5 h-5 bg-[var(--color-primary)] rounded-full flex items-center justify-center">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
              </button>
            )
          })}
        </div>

        {/* More Sizes Toggle */}
        <button
          onClick={() => setShowAllSizes(!showAllSizes)}
          className="text-xs text-[var(--color-primary)] hover:text-[var(--color-primary-hover)] font-medium"
        >
          {showAllSizes ? "Show less sizes" : `Show all ${Object.keys(KDP_TRIM_SIZES).length} sizes...`}
        </button>

        {/* All Sizes Dropdown */}
        {showAllSizes && (
          <div className="mt-3 p-3 bg-[var(--color-background)] border border-[var(--color-border)] rounded-xl max-h-48 overflow-y-auto">
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(KDP_TRIM_SIZES).map(([key, size]) => (
                <button
                  key={key}
                  onClick={() => handleTrimSizeSelect(key)}
                  className={cn(
                    "px-3 py-2 rounded-lg border text-left text-xs transition-all",
                    state.trimSize === key
                      ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10"
                      : "border-[var(--color-border)] hover:border-[var(--color-border-bright)]"
                  )}
                >
                  <div className="font-medium text-[var(--color-text)]">{size.label}</div>
                  <div className="text-[var(--color-text-dim)]">{size.width}" × {size.height}"</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Current Size Info */}
        {currentTrim && (
          <div className="mt-3 p-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg">
            <div className="text-sm">
              <span className="text-[var(--color-text-muted)]">Selected: </span>
              <span className="font-semibold text-[var(--color-text)]">{currentTrim.label}</span>
              <span className="text-[var(--color-text-dim)]"> ({currentTrim.width}" × {currentTrim.height}")</span>
            </div>
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-[var(--color-border)]" />

      {/* Optional Metadata */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-[var(--color-text)] flex items-center gap-2">
          <FileText className="w-4 h-4 text-[var(--color-primary)]" />
          Book Details
          <span className="text-xs text-[var(--color-text-dim)] font-normal">(optional)</span>
        </h3>

        {/* Author Name */}
        <div>
          <label className="flex items-center gap-2 text-xs font-medium text-[var(--color-text-muted)] mb-1.5">
            <User className="w-3.5 h-3.5" />
            Author Name
          </label>
          <input
            type="text"
            value={state.authorName}
            onChange={(e) => onUpdate({ authorName: e.target.value })}
            placeholder="Your name or pen name"
            className="w-full px-3 py-2.5 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] placeholder-[var(--color-text-dim)] text-sm focus:outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20 transition-all"
          />
        </div>

        {/* Book Title */}
        <div>
          <label className="flex items-center gap-2 text-xs font-medium text-[var(--color-text-muted)] mb-1.5">
            <BookOpen className="w-3.5 h-3.5" />
            Book Title
          </label>
          <input
            type="text"
            value={state.bookTitle}
            onChange={(e) => onUpdate({ bookTitle: e.target.value })}
            placeholder="e.g., Adventures in the Magic Forest"
            className="w-full px-3 py-2.5 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] placeholder-[var(--color-text-dim)] text-sm focus:outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20 transition-all"
          />
        </div>

        {/* Subtitle */}
        <div>
          <label className="flex items-center gap-2 text-xs font-medium text-[var(--color-text-muted)] mb-1.5">
            <FileText className="w-3.5 h-3.5" />
            Subtitle
          </label>
          <input
            type="text"
            value={state.subtitle}
            onChange={(e) => onUpdate({ subtitle: e.target.value })}
            placeholder="e.g., A Coloring Book for Kids Ages 4-8"
            className="w-full px-3 py-2.5 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] placeholder-[var(--color-text-dim)] text-sm focus:outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20 transition-all"
          />
        </div>
      </div>

      {/* Summary Card */}
      {canProceed && (
        <Card className="bg-gradient-to-r from-[var(--color-primary)]/10 to-green-500/10 border-[var(--color-primary)]/30">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium text-[var(--color-text)]">Ready to Continue</h4>
                <p className="text-sm text-[var(--color-text-muted)] mt-1">
                  {BOOK_TYPES[state.bookType].label} • {currentTrim?.label}
                  {state.bookTitle && ` • "${state.bookTitle}"`}
                  {state.authorName && ` by ${state.authorName}`}
                </p>
              </div>
              <Button onClick={onNext} className="gap-2">
                Prompts
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
