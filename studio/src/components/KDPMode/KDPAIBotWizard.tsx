// ============================================================
// KDP AI Bot Wizard - Floating Modal Wizard for AI-Assisted Book Creation
// ============================================================

import { useState, useCallback } from "react"
import { X, Sparkles, ChevronLeft, ChevronRight, Check } from "lucide-react"
import { Button } from "../Button"
import { cn } from "@/lib/utils"
import { KDPProject, BookType, KDPTrimSizeKey } from "@/types/KDPMode"
import { ImageryStyle } from "@/types/StudioMode"
import { AIBotBookSetup } from "./steps/AIBotBookSetup"
import { AIBotPromptGen } from "./steps/AIBotPromptGen"
import { AIBotInteriorGen } from "./steps/AIBotInteriorGen"
import { AIBotCoverGen } from "./steps/AIBotCoverGen"

// ============================================================
// Types
// ============================================================

export type AIBotStep = "book-setup" | "prompt-gen" | "interior-gen" | "cover-gen"

export const AI_BOT_STEPS: { id: AIBotStep; label: string; number: number }[] = [
  { id: "book-setup", label: "Book Setup", number: 1 },
  { id: "prompt-gen", label: "Prompts", number: 2 },
  { id: "interior-gen", label: "Interior", number: 3 },
  { id: "cover-gen", label: "Cover", number: 4 },
]

// Generated image tracking for interior pages
export interface GeneratedImage {
  prompt: string
  imageUrl?: string
  status: "pending" | "generating" | "complete" | "error"
}

// Cover text element for draggable overlays
export interface CoverTextElement {
  id: string
  type: 'title' | 'author' | 'subtitle' | 'custom'
  content: string
  position: { x: number; y: number }  // percentage-based (0-100)
  style: {
    fontFamily: string
    fontSize: number
    fontWeight: 'normal' | 'bold'
    color: string
    textAlign: 'left' | 'center' | 'right'
  }
}

export interface AIBotWizardState {
  // Step 1: Book Setup
  bookType: BookType
  trimSize: string // KDPTrimSizeKey
  authorName: string
  bookTitle: string
  subtitle: string
  
  // Step 2: Prompts
  pageCount: number
  imageryStyle: ImageryStyle | null
  prompts: string[]
  
  // Step 3: Interior Generation
  generatedImages: GeneratedImage[]
  
  // Step 4: Cover Generation
  coverPrompt: string
  coverImageUrl?: string
  coverStatus: "idle" | "generating" | "complete" | "error"
  coverTextElements: CoverTextElement[]
}

export interface KDPAIBotWizardProps {
  isOpen: boolean
  onClose: () => void
  onComplete: (project: Partial<KDPProject>) => void
  initialProject?: KDPProject
}

// ============================================================
// Component
// ============================================================

export function KDPAIBotWizard({ isOpen, onClose, onComplete, initialProject }: KDPAIBotWizardProps) {
  const [currentStep, setCurrentStep] = useState<AIBotStep>("book-setup")
  const [wizardState, setWizardState] = useState<AIBotWizardState>({
    // Step 1 defaults
    bookType: initialProject?.bookType || "paperback",
    trimSize: initialProject?.trimSize || "6x9",
    authorName: initialProject?.metadata?.author || "",
    bookTitle: initialProject?.metadata?.title || "",
    subtitle: "",
    
    // Step 2 defaults
    pageCount: 24,
    imageryStyle: null,
    prompts: [],
    
    // Step 3 defaults
    generatedImages: [],
    
    // Step 4 defaults
    coverPrompt: "",
    coverImageUrl: undefined,
    coverStatus: "idle",
    coverTextElements: [],
  })

  // Update wizard state
  const updateWizardState = useCallback((updates: Partial<AIBotWizardState>) => {
    setWizardState(prev => ({ ...prev, ...updates }))
  }, [])

  // Navigation
  const goToNextStep = useCallback(() => {
    const currentIndex = AI_BOT_STEPS.findIndex(s => s.id === currentStep)
    if (currentIndex < AI_BOT_STEPS.length - 1) {
      setCurrentStep(AI_BOT_STEPS[currentIndex + 1].id)
    }
  }, [currentStep])

  const goToPreviousStep = useCallback(() => {
    const currentIndex = AI_BOT_STEPS.findIndex(s => s.id === currentStep)
    if (currentIndex > 0) {
      setCurrentStep(AI_BOT_STEPS[currentIndex - 1].id)
    }
  }, [currentStep])

  const goToStep = useCallback((step: AIBotStep) => {
    // Only allow going to steps that have been completed or are the current step
    const targetIndex = AI_BOT_STEPS.findIndex(s => s.id === step)
    const currentIndex = AI_BOT_STEPS.findIndex(s => s.id === currentStep)
    
    // For now, allow going back to any previous step or staying at current
    if (targetIndex <= currentIndex) {
      setCurrentStep(step)
    }
  }, [currentStep])

  // Check if can proceed to next step
  const canProceedFromStep = useCallback((step: AIBotStep): boolean => {
    switch (step) {
      case "book-setup":
        // Must have book type and trim size selected
        return !!wizardState.bookType && !!wizardState.trimSize
      case "prompt-gen":
        // Must have prompts matching page count
        return wizardState.prompts.length === wizardState.pageCount && wizardState.pageCount >= 24
      case "interior-gen":
        // Must have all images generated
        return wizardState.generatedImages.length > 0 && 
               wizardState.generatedImages.every(img => img.status === "complete")
      case "cover-gen":
        // Cover is optional but if started, must be complete
        return wizardState.coverStatus === "complete"
      default:
        return false
    }
  }, [wizardState])

  // Handle wizard completion
  const handleComplete = useCallback(() => {
    // Build partial project from wizard state
    const partialProject: Partial<KDPProject> = {
      bookType: wizardState.bookType,
      trimSize: wizardState.trimSize,
      pageCount: wizardState.pageCount,
      metadata: {
        title: wizardState.bookTitle || undefined,
        author: wizardState.authorName || undefined,
      },
      // Set name from title if provided
      ...(wizardState.bookTitle ? { name: wizardState.bookTitle } : {}),
    }
    
    // Store prompts in a custom property for the main KDP mode to use
    // The main mode can then use these prompts to generate images
    ;(partialProject as any).generatedPrompts = wizardState.prompts
    ;(partialProject as any).imageryStyle = wizardState.imageryStyle
    
    // Include generated images for auto-save to interior pages
    ;(partialProject as any).generatedImages = wizardState.generatedImages
    
    // Include cover data if generated
    if (wizardState.coverImageUrl) {
      ;(partialProject as any).coverImageUrl = wizardState.coverImageUrl
      ;(partialProject as any).coverTextElements = wizardState.coverTextElements
    }
    
    onComplete(partialProject)
    onClose()
  }, [wizardState, onComplete, onClose])

  // Get current step index
  const currentStepIndex = AI_BOT_STEPS.findIndex(s => s.id === currentStep)

  // Render step content
  const renderStepContent = () => {
    switch (currentStep) {
      case "book-setup":
        return (
          <AIBotBookSetup
            state={wizardState}
            onUpdate={updateWizardState}
            onNext={goToNextStep}
          />
        )
      case "prompt-gen":
        return (
          <AIBotPromptGen
            state={wizardState}
            onUpdate={updateWizardState}
            onNext={goToNextStep}
            onBack={goToPreviousStep}
          />
        )
      case "interior-gen":
        return (
          <AIBotInteriorGen
            state={wizardState}
            onUpdate={updateWizardState}
            onNext={goToNextStep}
            onBack={goToPreviousStep}
          />
        )
      case "cover-gen":
        return (
          <AIBotCoverGen
            state={wizardState}
            onUpdate={updateWizardState}
            onComplete={handleComplete}
            onBack={goToPreviousStep}
          />
        )
      default:
        return null
    }
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop with blur */}
      <div 
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="fixed inset-4 md:inset-8 lg:inset-12 z-50 flex items-center justify-center pointer-events-none">
        <div className="w-full max-w-4xl max-h-full bg-[var(--color-surface)] rounded-2xl shadow-2xl border border-[var(--color-border)] overflow-hidden pointer-events-auto flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-[var(--color-text)]">
                  AI Book Wizard
                </h2>
                <p className="text-sm text-[var(--color-text-muted)]">
                  Create your book with AI assistance
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Step Indicator */}
          <div className="px-6 py-4 border-b border-[var(--color-border)] bg-[var(--color-background)]/50">
            <div className="flex items-center justify-center gap-8">
              {AI_BOT_STEPS.map((step, index) => {
                const isCompleted = index < currentStepIndex
                const isCurrent = step.id === currentStep
                const isClickable = index <= currentStepIndex
                
                return (
                  <div key={step.id} className="flex items-center">
                    {/* Step Circle */}
                    <button
                      onClick={() => isClickable && goToStep(step.id)}
                      disabled={!isClickable}
                      className={cn(
                        "flex items-center gap-2 transition-all",
                        isClickable ? "cursor-pointer" : "cursor-default"
                      )}
                    >
                      <div
                        className={cn(
                          "w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-all",
                          isCompleted
                            ? "bg-green-500 text-white"
                            : isCurrent
                            ? "bg-[var(--color-primary)] text-white ring-4 ring-[var(--color-primary)]/20"
                            : "bg-[var(--color-surface)] text-[var(--color-text-dim)] border-2 border-[var(--color-border)]"
                        )}
                      >
                        {isCompleted ? (
                          <Check className="w-5 h-5" />
                        ) : (
                          step.number
                        )}
                      </div>
                      <span
                        className={cn(
                          "text-sm font-medium",
                          isCurrent
                            ? "text-[var(--color-text)]"
                            : isCompleted
                            ? "text-green-500"
                            : "text-[var(--color-text-dim)]"
                        )}
                      >
                        {step.label}
                      </span>
                    </button>
                    
                    {/* Connector Line */}
                    {index < AI_BOT_STEPS.length - 1 && (
                      <div
                        className={cn(
                          "w-16 sm:w-24 h-0.5 mx-4",
                          index < currentStepIndex
                            ? "bg-green-500"
                            : "bg-[var(--color-border)]"
                        )}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {renderStepContent()}
          </div>

          {/* Footer Navigation - Only show for book-setup step (other steps have their own footer) */}
          {currentStep === "book-setup" && (
            <div className="flex items-center justify-between p-4 border-t border-[var(--color-border)]">
              <div className="text-sm text-[var(--color-text-dim)]">
                Step {currentStepIndex + 1} of {AI_BOT_STEPS.length}
              </div>
              
              <Button
                onClick={goToNextStep}
                disabled={!canProceedFromStep(currentStep)}
                className="gap-2"
              >
                Next: Prompts
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
