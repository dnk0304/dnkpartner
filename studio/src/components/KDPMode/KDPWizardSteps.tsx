import { cn } from "@/lib/utils"
import { WIZARD_STEPS, WizardStep } from "@/types/KDPMode"
import { BookOpen, FileText, Palette, Download, Eye, Check } from "lucide-react"

interface KDPWizardStepsProps {
  currentStep: WizardStep
  onStepClick: (step: WizardStep) => void
  getStepStatus: (step: WizardStep) => "completed" | "current" | "upcoming"
  canAccessStep: (step: WizardStep) => boolean
}

const STEP_ICONS: Record<WizardStep, React.ComponentType<{ className?: string }>> = {
  "book-setup": BookOpen,
  "interior": FileText,
  "cover": Palette,
  "export": Download,
  "preview": Eye,
}

export function KDPWizardSteps({
  currentStep,
  onStepClick,
  getStepStatus,
  canAccessStep,
}: KDPWizardStepsProps) {
  return (
    <div className="relative">
      {/* Progress Line Background */}
      <div className="absolute top-6 left-0 right-0 h-0.5 bg-[var(--color-border)]" />
      
      {/* Steps */}
      <div className="relative flex justify-between">
        {WIZARD_STEPS.map((step, index) => {
          const status = getStepStatus(step.id)
          const isAccessible = canAccessStep(step.id)
          const StepIcon = STEP_ICONS[step.id]
          
          return (
            <div key={step.id} className="flex flex-col items-center">
              {/* Step Circle */}
              <button
                onClick={() => isAccessible && onStepClick(step.id)}
                disabled={!isAccessible}
                className={cn(
                  "relative z-10 w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300",
                  "border-2 backdrop-blur-sm",
                  status === "completed" && [
                    "bg-gradient-to-br from-green-500 to-emerald-600",
                    "border-green-400",
                    "text-white",
                    "shadow-lg shadow-green-500/30",
                    isAccessible && "cursor-pointer hover:scale-110",
                  ],
                  status === "current" && [
                    "bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-accent)]",
                    "border-[var(--color-primary)]",
                    "text-white",
                    "shadow-lg shadow-[var(--color-primary)]/40",
                    "ring-4 ring-[var(--color-primary)]/20",
                    "animate-pulse",
                  ],
                  status === "upcoming" && [
                    isAccessible
                      ? "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text-dim)] cursor-pointer hover:bg-[var(--color-surface)]/80"
                      : "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text-dim)] cursor-not-allowed opacity-50",
                  ]
                )}
                title={!isAccessible ? "Complete book setup first" : ""}
              >
                {status === "completed" ? (
                  <Check className="w-5 h-5" />
                ) : (
                  <StepIcon className="w-5 h-5" />
                )}
              </button>
              
              {/* Step Label */}
              <span
                className={cn(
                  "mt-3 text-sm font-medium transition-colors",
                  status === "completed" && "text-green-500",
                  status === "current" && "text-[var(--color-text)]",
                  status === "upcoming" && (isAccessible ? "text-[var(--color-text-dim)]" : "text-[var(--color-text-dim)] opacity-50")
                )}
              >
                {step.label}
              </span>
              
              {/* Step Number */}
              <span
                className={cn(
                  "text-xs mt-0.5",
                  status === "completed" && "text-green-500/70",
                  status === "current" && "text-[var(--color-text-muted)]",
                  status === "upcoming" && (isAccessible ? "text-[var(--color-text-dim)]" : "text-[var(--color-text-dim)] opacity-50")
                )}
              >
                Step {index + 1}
              </span>
              
              {/* Progress Line Segment (colored) */}
              {index < WIZARD_STEPS.length - 1 && (
                <div
                  className={cn(
                    "absolute top-6 h-0.5 transition-all duration-500",
                    status === "completed" && "bg-gradient-to-r from-green-500 to-green-400",
                    status === "current" && "bg-gradient-to-r from-[var(--color-primary)] to-transparent",
                    status === "upcoming" && "bg-transparent"
                  )}
                  style={{
                    left: `calc(50% + 24px)`,
                    width: `calc(${100 / (WIZARD_STEPS.length - 1)}% - 48px)`,
                  }}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

