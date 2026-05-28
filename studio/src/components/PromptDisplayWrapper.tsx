import { useState } from "react"
import { Carousel3D } from "./Carousel3D"
import { PromptCard } from "./PromptCard"
import { Button } from "./Button"
import { Maximize2, Grid3x3 } from "lucide-react"
import { cn } from "@/lib/utils"

export interface Prompt {
  id: string
  text: string
  image?: string
  timestamp: Date
  status: "pending" | "generating" | "completed" | "failed"
}

interface PromptDisplayWrapperProps {
  prompts: Prompt[]
  onDelete?: (id: string) => void
  onRegenerate?: (id: string) => void
  onExpand?: (id: string) => void
  className?: string
}

export function PromptDisplayWrapper({
  prompts,
  onDelete,
  onRegenerate,
  onExpand,
  className,
}: PromptDisplayWrapperProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  if (prompts.length === 0) {
    return (
      <div className={cn("flex items-center justify-center py-16", className)}>
        <p className="text-[var(--color-text-muted)]">
          No prompts yet. Start creating!
        </p>
      </div>
    )
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header with Expand Toggle */}
      <div className="flex items-center justify-between px-4">
        <div>
          <h2 className="text-lg font-semibold text-[var(--color-text)]">
            Your Creations
          </h2>
          <p className="text-sm text-[var(--color-text-muted)]">
            {prompts.length} {prompts.length === 1 ? "item" : "items"}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsExpanded(!isExpanded)}
          className="gap-2"
        >
          {isExpanded ? (
            <>
              <Maximize2 className="w-4 h-4" />
              Carousel View
            </>
          ) : (
            <>
              <Grid3x3 className="w-4 h-4" />
              Expand All
            </>
          )}
        </Button>
      </div>

      {/* Display Mode */}
      {isExpanded ? (
        /* Grid View - All Items */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 px-4">
          {prompts.map((prompt) => (
            <div key={prompt.id} className="border-gradient-animated rounded-lg">
              <PromptCard
                {...prompt}
                onDelete={onDelete ? () => onDelete(prompt.id) : undefined}
                onRegenerate={onRegenerate ? () => onRegenerate(prompt.id) : undefined}
                onExpand={onExpand ? () => onExpand(prompt.id) : undefined}
              />
            </div>
          ))}
        </div>
      ) : (
        /* 3D Carousel View */
        <div className="py-8">
          <Carousel3D
            items={prompts}
            renderItem={(prompt) => (
              <div className="border-gradient-animated rounded-lg">
                <PromptCard
                  {...prompt}
                  onDelete={onDelete ? () => onDelete(prompt.id) : undefined}
                  onRegenerate={onRegenerate ? () => onRegenerate(prompt.id) : undefined}
                  onExpand={onExpand ? () => onExpand(prompt.id) : undefined}
                />
              </div>
            )}
          />
        </div>
      )}
    </div>
  )
}

