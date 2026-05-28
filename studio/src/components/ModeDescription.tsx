import { useState, useEffect } from "react"
import { ChevronDown, ChevronUp, Sparkles, Film, Wand2, Workflow } from "lucide-react"
import { cn } from "@/lib/utils"

interface ModeDescriptionProps {
  mode: "normal" | "storymaker" | "advanced-prompting" | "manager"
  className?: string
}

const MODE_DESCRIPTIONS: Record<ModeDescriptionProps["mode"], {
  title: string
  icon: typeof Sparkles
  description: string
  features: string[]
  bestFor: string
}> = {
  manager: {
    title: "Master Manager Mode",
    icon: Workflow,
    description: "Manager-mode assistant that keeps normal conversation while auto-routing requests to specialist assistants based on intent and memory.",
    features: [
      "Auto-detects user intent and delegates to specialist assistants",
      "Uses manager memory profile for routing consistency",
      "Keeps project-scoped continuity and context",
      "Falls back to normal assistant for general requests",
      "Supports explicit delegation commands when needed"
    ],
    bestFor: "Unified workflow management, mixed request handling, and hands-free assistant delegation."
  },
  normal: {
    title: "AI Prompt Assistant",
    icon: Sparkles,
    description: "Your intelligent assistant for extracting and creating prompts from natural language descriptions. Simply describe what you want to create, and I'll automatically identify and extract detailed prompts for image or video generation.",
    features: [
      "Automatic prompt extraction from descriptions",
      "Support for multiple prompts in one message",
      "Image upload and analysis capabilities",
      "Duration detection for video prompts (e.g., '5s scene of...')",
      "Context-aware suggestions based on your inputs"
    ],
    bestFor: "Quick prompt generation, exploring ideas, and converting descriptions into actionable prompts."
  },
  storymaker: {
    title: "AI StoryCreator Mode",
    icon: Film,
    description: "Transform complete scripts or transcripts into structured scene prompts automatically. Perfect for creating storyboards, video sequences, or visual narratives from your written content.",
    features: [
      "Automatic scene splitting from scripts/transcripts",
      "Smart duration assignment for each scene",
      "Scene enhancement with visual details",
      "Story Base integration for consistent characters & settings",
      "Split scenes further for more detailed breakdowns",
      "Export as JSON, TXT, or PDF for production use",
      "Side-by-side comparison of original script and extracted scenes"
    ],
    bestFor: "Storyboard creation, video production planning, visual storytelling, and adapting written content into visual sequences."
  },
  "advanced-prompting": {
    title: "Advanced Prompting Mode",
    icon: Wand2,
    description: "Professional-grade prompt engineering with persistence and advanced features. Create highly detailed, optimized prompts with full session management and export capabilities.",
    features: [
      "Highly detailed prompt generation with artistic focus",
      "Session persistence - save and reload chat history",
      "Imagery style integration for consistent aesthetics",
      "Export prompts to JSON, TXT, or professional PDF formats",
      "Direct integration with image generation queue",
      "Chat naming and organization",
      "Multiple prompt generation in one request",
      "Advanced compositional and technical details"
    ],
    bestFor: "Professional projects, detailed artistic direction, maintaining consistent style across multiple images, and building reusable prompt libraries."
  }
}

export function ModeDescription({ mode, className }: ModeDescriptionProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [storageKey] = useState(`mode-description-expanded-${mode}`)

  // Load expansion state from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(storageKey)
    if (stored !== null) {
      setIsExpanded(stored === "true")
    }
  }, [storageKey])

  // Save expansion state to localStorage
  useEffect(() => {
    localStorage.setItem(storageKey, isExpanded.toString())
  }, [isExpanded, storageKey])

  const modeInfo = MODE_DESCRIPTIONS[mode]
  const Icon = modeInfo.icon

  return (
    <div className={cn("border border-[var(--color-border)] rounded-lg overflow-hidden bg-[var(--color-background)]", className)}>
      {/* Header - Always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-[var(--color-surface)] transition-colors"
      >
        <div className="flex items-center gap-2">
          <Icon className={cn(
            "w-4 h-4",
            mode === "storymaker"
              ? "text-purple-400"
              : mode === "advanced-prompting"
              ? "text-cyan-400"
              : mode === "manager"
              ? "text-emerald-400"
              : "text-[var(--color-primary)]"
          )} />
          <span className="text-sm font-medium text-[var(--color-text)]">
            What can this mode do?
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-[var(--color-text-muted)]" />
        ) : (
          <ChevronDown className="w-4 h-4 text-[var(--color-text-muted)]" />
        )}
      </button>

      {/* Expandable Content */}
      <div className={cn(
        "overflow-hidden transition-all duration-300 ease-in-out",
        isExpanded ? "max-h-[1000px] opacity-100" : "max-h-0 opacity-0"
      )}>
        <div className="p-4 pt-0 space-y-3 border-t border-[var(--color-border)]">
          {/* Description */}
          <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
            {modeInfo.description}
          </p>

          {/* Features */}
          <div>
            <h4 className="text-xs font-semibold text-[var(--color-text)] uppercase tracking-wider mb-2">
              Key Features:
            </h4>
            <ul className="space-y-1.5">
              {modeInfo.features.map((feature, index) => (
                <li key={index} className="flex items-start gap-2 text-xs text-[var(--color-text-muted)]">
                  <span className={cn(
                    "flex-shrink-0 w-1 h-1 rounded-full mt-1.5",
                    mode === "storymaker" 
                      ? "bg-purple-400" 
                      : mode === "advanced-prompting" 
                      ? "bg-cyan-400" 
                      : mode === "manager"
                      ? "bg-emerald-400"
                      : "bg-[var(--color-primary)]"
                  )} />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Best For */}
          <div className={cn(
            "p-2.5 rounded-lg border text-xs",
            mode === "storymaker"
              ? "bg-purple-500/5 border-purple-500/20 text-purple-300"
              : mode === "advanced-prompting"
              ? "bg-cyan-500/5 border-cyan-500/20 text-cyan-300"
              : mode === "manager"
              ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-300"
              : "bg-[var(--color-primary)]/5 border-[var(--color-primary)]/20 text-[var(--color-primary)]"
          )}>
            <span className="font-medium">Best for: </span>
            {modeInfo.bestFor}
          </div>
        </div>
      </div>
    </div>
  )
}
