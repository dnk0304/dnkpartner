// ============================================================
// AI Bot Interior Generation Step - Batch image generation with progress
// ============================================================

import { useState, useCallback, useEffect, useRef } from "react"
import { Sparkles, CheckCircle, Loader2, AlertCircle, Image as ImageIcon, Play, Pause, RefreshCw, ZoomIn, RotateCcw, XCircle, ChevronLeft, ChevronRight, Grid, Layers, Pencil, Check, X } from "lucide-react"
import { Button } from "../../Button"
import { Card, CardContent } from "../../Card"
import { cn } from "@/lib/utils"
import type { AIBotWizardState } from "../KDPAIBotWizard"

// ============================================================
// Types
// ============================================================

interface AIBotInteriorGenProps {
  state: AIBotWizardState
  onUpdate: (updates: Partial<AIBotWizardState>) => void
  onNext: () => void
  onBack: () => void
}

interface GenerationProgress {
  total: number
  completed: number
  current: number[]  // Array to track multiple concurrent generations
  status: "idle" | "generating" | "complete" | "paused" | "cancelled"
}

// ============================================================
// Component
// ============================================================

export function AIBotInteriorGen({ state, onUpdate, onNext, onBack }: AIBotInteriorGenProps) {
  const [progress, setProgress] = useState<GenerationProgress>({
    total: state.prompts.length,
    completed: 0,
    current: [],
    status: "idle",
  })
  const [images, setImages] = useState(state.generatedImages)
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  
  // Edit mode state
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editPrompt, setEditPrompt] = useState("")
  
  // View mode: grid or stacked 3D slider
  const [viewMode, setViewMode] = useState<"grid" | "stacked">("stacked")
  const [activeCardIndex, setActiveCardIndex] = useState(0)
  
  // Use refs for pause/cancel to avoid stale closure issues
  const isPausedRef = useRef(false)
  const isCancelledRef = useRef(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const imagesRef = useRef(state.generatedImages)

  // Initialize images array if needed
  useEffect(() => {
    if (images.length === 0 && state.prompts.length > 0) {
      const initialImages = state.prompts.map((prompt) => ({
        prompt,
        imageUrl: undefined,
        status: "pending" as const,
      }))
      setImages(initialImages)
      imagesRef.current = initialImages
      onUpdate({ generatedImages: initialImages })
    }
  }, [state.prompts, images.length, onUpdate])

  // Keep ref in sync with images state
  useEffect(() => {
    imagesRef.current = images
  }, [images])

  // Calculate progress percentage
  const progressPercentage = progress.total > 0 
    ? Math.round((progress.completed / progress.total) * 100)
    : 0

  // Generate single image with AbortController support
  const generateImage = useCallback(async (index: number, signal?: AbortSignal): Promise<boolean> => {
    // Use ref to get current image data (avoids stale closure)
    const image = imagesRef.current[index]
    if (!image) return false

    try {
      // Check if cancelled before starting
      if (isCancelledRef.current || signal?.aborted) {
        return false
      }

      // Update status to generating using functional update
      setImages((prev) => {
        const updated = prev.map((img, i) => (i === index ? { ...img, status: "generating" as const } : img))
        imagesRef.current = updated
        return updated
      })
      // Add to current generating array
      setProgress((prev) => ({ ...prev, current: [...prev.current, index] }))

      // Build enhanced prompt with imagery style if selected
      let enhancedPrompt = image.prompt
      if (state.imageryStyle?.prompt) {
        enhancedPrompt = `${image.prompt}, ${state.imageryStyle.prompt}`
      }

      // Call image generation API with abort signal
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: enhancedPrompt,
          model: "z-image-turbo-replicate", // Use fast model for batch generation
          aspectRatio: "1:1", // Square images for book pages
          imageSize: "1024x1024",
        }),
        signal,
      })

      // Check if cancelled after fetch
      if (isCancelledRef.current || signal?.aborted) {
        return false
      }

      if (!response.ok) {
        throw new Error(`Failed to generate image: ${response.statusText}`)
      }

      const data = await response.json()
      const imageUrl = data.imageUrl

      // Update with generated image using functional update
      setImages((prev) => {
        const updated = prev.map((img, i) =>
          i === index ? { ...img, imageUrl, status: "complete" as const } : img
        )
        imagesRef.current = updated
        return updated
      })
      // Remove from current generating array and increment completed
      setProgress((prev) => ({
        ...prev,
        completed: prev.completed + 1,
        current: prev.current.filter(i => i !== index),
      }))
      return true
    } catch (error) {
      // Don't log abort errors as failures
      if (error instanceof Error && error.name === "AbortError") {
        console.log(`Image ${index} generation aborted`)
        return false
      }
      
      console.error(`Error generating image ${index}:`, error)
      setImages((prev) => {
        const updated = prev.map((img, i) => (i === index ? { ...img, status: "error" as const } : img))
        imagesRef.current = updated
        return updated
      })
      // Remove from current generating array
      setProgress((prev) => ({
        ...prev,
        current: prev.current.filter(i => i !== index),
      }))
      return false
    }
  }, [state.imageryStyle])

  // Generate all images in parallel batches with proper pause/cancel support
  const handleGenerateAll = useCallback(async () => {
    // Create new AbortController for this generation session
    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal
    
    // Reset flags
    isPausedRef.current = false
    isCancelledRef.current = false
    
    setProgress((prev) => ({ ...prev, status: "generating" }))

    // Get indices of pending images using ref (always current)
    const pendingIndices = imagesRef.current
      .map((img, i) => (img.status !== "complete" ? i : -1))
      .filter(i => i !== -1)
    
    // Process in batches of 5
    const BATCH_SIZE = 5
    for (let batchStart = 0; batchStart < pendingIndices.length; batchStart += BATCH_SIZE) {
      // Check if paused using ref for immediate response
      if (isPausedRef.current) {
        setProgress((prev) => ({ ...prev, status: "paused" }))
        return
      }
      
      // Check if cancelled
      if (isCancelledRef.current || signal.aborted) {
        setProgress((prev) => ({ ...prev, status: "cancelled", current: [] }))
        return
      }

      // Get the batch of indices to process
      const batchIndices = pendingIndices.slice(batchStart, batchStart + BATCH_SIZE)
      
      // Generate all images in this batch in parallel
      await Promise.all(
        batchIndices.map(index => generateImage(index, signal))
      )
      
      // Check again after batch completes in case it was cancelled during fetch
      if (isCancelledRef.current || signal.aborted) {
        setProgress((prev) => ({ ...prev, status: "cancelled", current: [] }))
        return
      }
      
      // Check if paused after this batch completed
      if (isPausedRef.current) {
        setProgress((prev) => ({ ...prev, status: "paused" }))
        return
      }
    }

    // Check final state
    if (!isCancelledRef.current && !isPausedRef.current) {
      setProgress((prev) => ({ ...prev, status: "complete", current: [] }))
    }
  }, [generateImage])

  // Pause generation - immediately sets ref for loop to check
  const handlePause = useCallback(() => {
    isPausedRef.current = true
    setProgress((prev) => ({ ...prev, status: "paused" }))
  }, [])

  // Resume generation
  const handleResume = useCallback(() => {
    isPausedRef.current = false
    handleGenerateAll()
  }, [handleGenerateAll])
  
  // Cancel all generation - aborts current request and stops loop
  const handleCancelAll = useCallback(() => {
    isCancelledRef.current = true
    isPausedRef.current = false
    
    // Abort any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    
    // Reset any generating images back to pending
    setImages((prev) => {
      const updated = prev.map((img) =>
        img.status === "generating" ? { ...img, status: "pending" as const } : img
      )
      imagesRef.current = updated
      return updated
    })
    
    setProgress((prev) => ({ ...prev, status: "cancelled", current: [] }))
  }, [])
  
  // Reset generation and go back to Step 2
  const handleResetGeneration = useCallback(() => {
    // Cancel any ongoing generation
    handleCancelAll()
    
    // Clear all generated images
    const resetImages = state.prompts.map((prompt) => ({
      prompt,
      imageUrl: undefined,
      status: "pending" as const,
    }))
    
    setImages(resetImages)
    imagesRef.current = resetImages
    onUpdate({ generatedImages: resetImages })
    
    // Reset progress
    setProgress({
      total: state.prompts.length,
      completed: 0,
      current: [],
      status: "idle",
    })
    
    // Close confirmation dialog and go back
    setShowResetConfirm(false)
    onBack()
  }, [state.prompts, onUpdate, onBack, handleCancelAll])

  // Retry failed image
  const handleRetry = useCallback(async (index: number) => {
    await generateImage(index)
  }, [generateImage])

  // Edit prompt handlers
  const handleEditPrompt = useCallback((index: number) => {
    setEditingIndex(index)
    setEditPrompt(imagesRef.current[index].prompt)
  }, [])

  const handleSavePrompt = useCallback((index: number, newPrompt: string) => {
    setImages((prev) => {
      const updated = prev.map((img, i) =>
        i === index ? { ...img, prompt: newPrompt } : img
      )
      imagesRef.current = updated
      return updated
    })
    setEditingIndex(null)
    setEditPrompt("")
  }, [])

  const handleCancelEdit = useCallback(() => {
    setEditingIndex(null)
    setEditPrompt("")
  }, [])

  const handleRegenerateImage = useCallback(async (index: number) => {
    // Reset the image status to pending and decrement completed count if it was complete
    setImages((prev) => {
      const wasComplete = prev[index].status === "complete"
      if (wasComplete) {
        setProgress((p) => ({ ...p, completed: p.completed - 1 }))
      }
      const updated = prev.map((img, i) =>
        i === index ? { ...img, imageUrl: undefined, status: "pending" as const } : img
      )
      imagesRef.current = updated
      return updated
    })
    
    // Generate the image
    await generateImage(index)
  }, [generateImage])

  // Update parent state when images change
  useEffect(() => {
    onUpdate({ generatedImages: images })
  }, [images, onUpdate])

  // Check if all images are complete
  const allComplete = images.length > 0 && images.every((img) => img.status === "complete")
  const completedImages = images.filter((img) => img.status === "complete")
  const hasAnyComplete = completedImages.length > 0
  const hasErrors = images.some((img) => img.status === "error")
  const hasPendingOrError = images.some((img) => img.status === "pending" || img.status === "error")
  const isGenerating = progress.status === "generating"
  const isPausedState = progress.status === "paused"
  const isCancelledState = progress.status === "cancelled"
  const hasStarted = progress.completed > 0 || isGenerating || isPausedState
  
  // Handle proceeding with partial completion (only completed images)
  const handleProceedWithPartial = useCallback(() => {
    // Filter out non-complete images from the state
    const completeImages = images.filter((img) => img.status === "complete")
    onUpdate({ generatedImages: completeImages })
    onNext()
  }, [images, onUpdate, onNext])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 bg-cyan-500/10 border-b border-cyan-500/30">
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-sm font-medium text-cyan-400 mb-1">
              Interior Image Generation
            </h4>
            <p className="text-sm text-[var(--color-text-muted)]">
              Generating {state.prompts.length} images for your book interior.
              This may take several minutes.
            </p>
          </div>
        </div>
      </div>

      {/* Progress Bar Section */}
      <div className="p-4 border-b border-[var(--color-border)]">
        <Card>
          <CardContent className="py-4">
            {/* Progress Bar */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-[var(--color-text)]">
                  Progress: {progress.completed} / {progress.total}
                </span>
                <span className="text-sm font-bold text-[var(--color-primary)]">
                  {progressPercentage}%
                </span>
              </div>
              <div className="w-full h-3 bg-[var(--color-background)] rounded-full overflow-hidden border border-[var(--color-border)]">
                <div
                  className={cn(
                    "h-full transition-all duration-300 rounded-full",
                    allComplete
                      ? "bg-gradient-to-r from-green-500 to-green-400"
                      : hasErrors
                      ? "bg-gradient-to-r from-yellow-500 to-orange-500"
                      : "bg-gradient-to-r from-cyan-500 to-blue-500"
                  )}
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              {(progress.status === "idle" || isCancelledState) && (
                <Button onClick={handleGenerateAll} className="flex-1 gap-2">
                  <Play className="w-4 h-4" />
                  {isCancelledState ? "Restart Generation" : "Generate All Images"}
                </Button>
              )}
              
              {isGenerating && (
                <>
                  <Button onClick={handlePause} variant="outline" className="flex-1 gap-2">
                    <Pause className="w-4 h-4" />
                    Pause
                  </Button>
                  <Button onClick={handleCancelAll} variant="outline" className="gap-2 text-red-400 border-red-500/50 hover:bg-red-500/10">
                    <XCircle className="w-4 h-4" />
                    Cancel All
                  </Button>
                  <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating...
                  </div>
                </>
              )}
              
              {isPausedState && (
                <>
                  <Button onClick={handleResume} className="flex-1 gap-2">
                    <Play className="w-4 h-4" />
                    Resume Generation
                  </Button>
                  <Button onClick={handleCancelAll} variant="outline" className="gap-2 text-red-400 border-red-500/50 hover:bg-red-500/10">
                    <XCircle className="w-4 h-4" />
                    Cancel All
                  </Button>
                </>
              )}
              
              {allComplete && (
                <Button onClick={onNext} className="flex-1 gap-2 bg-green-500 hover:bg-green-600">
                  <CheckCircle className="w-4 h-4" />
                  Continue to Cover
                </Button>
              )}
              
              {/* Show "Continue with partial" option when some images are complete but not all */}
              {hasAnyComplete && !allComplete && !isGenerating && (
                <Button 
                  onClick={handleProceedWithPartial} 
                  className="flex-1 gap-2 bg-amber-500 hover:bg-amber-600"
                >
                  <CheckCircle className="w-4 h-4" />
                  Continue with {completedImages.length} images
                </Button>
              )}
              
              {/* Reset & Go Back button - shown when generation has started but not complete */}
              {hasStarted && !allComplete && !isGenerating && (
                <Button 
                  onClick={() => setShowResetConfirm(true)} 
                  variant="outline" 
                  className="gap-2 text-yellow-400 border-yellow-500/50 hover:bg-yellow-500/10"
                >
                  <RotateCcw className="w-4 h-4" />
                  Reset & Go Back
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* View Mode Toggle */}
      <div className="px-4 pt-2 flex items-center justify-end gap-2">
        <span className="text-xs text-[var(--color-text-dim)] mr-2">View:</span>
        <Button
          variant={viewMode === "stacked" ? "default" : "outline"}
          size="sm"
          onClick={() => setViewMode("stacked")}
          className="gap-1 h-7 px-2"
        >
          <Layers className="w-3.5 h-3.5" />
          <span className="text-xs">3D Stack</span>
        </Button>
        <Button
          variant={viewMode === "grid" ? "default" : "outline"}
          size="sm"
          onClick={() => setViewMode("grid")}
          className="gap-1 h-7 px-2"
        >
          <Grid className="w-3.5 h-3.5" />
          <span className="text-xs">Grid</span>
        </Button>
      </div>

      {/* Edit Prompt Panel for Grid View */}
      {viewMode === "grid" && editingIndex !== null && (
        <div className="px-4 pb-2">
          <div className="bg-[var(--color-surface)] rounded-lg border border-cyan-500/50 p-3">
            <label className="text-xs font-medium text-cyan-400 mb-2 block">
              Edit Prompt for Image {editingIndex + 1}:
            </label>
            <textarea
              value={editPrompt}
              onChange={(e) => setEditPrompt(e.target.value)}
              className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg text-sm text-[var(--color-text)] resize-none focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
              rows={2}
              placeholder="Enter prompt..."
            />
            <div className="flex items-center gap-2 mt-2">
              <Button
                onClick={() => handleSavePrompt(editingIndex, editPrompt)}
                size="sm"
                className="gap-1 bg-green-500 hover:bg-green-600"
              >
                <Check className="w-4 h-4" />
                Save
              </Button>
              <Button
                onClick={handleCancelEdit}
                variant="outline"
                size="sm"
                className="gap-1"
              >
                <X className="w-4 h-4" />
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Image Display Area */}
      <div className="flex-1 overflow-y-auto p-4">
        {viewMode === "stacked" ? (
          /* 3D Stacked Card Slider */
          <div className="flex flex-col items-center justify-center h-full min-h-[400px]">
            {/* Card Stack Container */}
            <div 
              className="relative w-full max-w-md mx-auto h-[350px]"
              style={{ perspective: "1000px" }}
            >
              {images.map((image, index) => {
                const offset = index - activeCardIndex
                const isActive = index === activeCardIndex
                const absOffset = Math.abs(offset)
                
                // Only render cards within range for performance
                if (absOffset > 4) return null
                
                return (
                  <div
                    key={index}
                    onClick={() => {
                      if (isActive && image.imageUrl) {
                        setSelectedImageIndex(index)
                      } else {
                        setActiveCardIndex(index)
                      }
                    }}
                    className={cn(
                      "absolute inset-x-0 mx-auto w-[280px] aspect-square rounded-xl overflow-hidden transition-all duration-500 ease-out cursor-pointer",
                      "border-2 shadow-2xl",
                      image.status === "complete"
                        ? "border-green-500/50"
                        : image.status === "generating"
                        ? "border-cyan-500 animate-pulse"
                        : image.status === "error"
                        ? "border-red-500/50"
                        : "border-[var(--color-border)]",
                      isActive && "ring-4 ring-cyan-500/30 border-cyan-400",
                      progress.current.includes(index) && "ring-4 ring-yellow-500/50"
                    )}
                    style={{
                      transform: `
                        translateZ(${offset * -60}px) 
                        translateY(${offset * 15}px)
                        scale(${1 - absOffset * 0.08})
                        rotateX(${offset * -3}deg)
                      `,
                      zIndex: images.length - absOffset,
                      opacity: 1 - absOffset * 0.2,
                      filter: absOffset > 0 ? `blur(${absOffset * 0.5}px)` : "none",
                      pointerEvents: absOffset > 2 ? "none" : "auto",
                    }}
                  >
                    {/* Image or Placeholder */}
                    {image.imageUrl ? (
                      <img
                        src={image.imageUrl}
                        alt={`Generated ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-[var(--color-surface)] to-[var(--color-background)] flex flex-col items-center justify-center">
                        {image.status === "generating" ? (
                          <>
                            <Loader2 className="w-12 h-12 text-cyan-400 animate-spin mb-3" />
                            <span className="text-sm text-cyan-400 font-medium">Generating...</span>
                          </>
                        ) : image.status === "error" ? (
                          <>
                            <AlertCircle className="w-12 h-12 text-red-400 mb-3" />
                            <span className="text-sm text-red-400">Failed</span>
                          </>
                        ) : (
                          <>
                            <ImageIcon className="w-12 h-12 text-[var(--color-text-dim)] mb-3" />
                            <span className="text-sm text-[var(--color-text-dim)]">Pending</span>
                          </>
                        )}
                      </div>
                    )}

                    {/* Card Number Badge */}
                    <div className="absolute top-3 left-3 px-3 py-1.5 rounded-full text-sm font-bold bg-black/80 backdrop-blur-sm text-white shadow-lg">
                      {index + 1} / {images.length}
                    </div>

                    {/* Status Indicator */}
                    <div className="absolute top-3 right-3">
                      {image.status === "complete" && (
                        <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center shadow-lg">
                          <CheckCircle className="w-5 h-5 text-white" />
                        </div>
                      )}
                      {image.status === "error" && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleRetry(index)
                          }}
                          className="w-8 h-8 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors shadow-lg"
                          title="Retry"
                        >
                          <RefreshCw className="w-4 h-4 text-white" />
                        </button>
                      )}
                      {image.status === "generating" && (
                        <div className="w-8 h-8 rounded-full bg-cyan-500 flex items-center justify-center shadow-lg">
                          <Loader2 className="w-4 h-4 text-white animate-spin" />
                        </div>
                      )}
                    </div>

                    {/* Click to zoom hint for active card */}
                    {isActive && image.imageUrl && editingIndex !== index && (
                      <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
                        <div className="flex flex-col items-center gap-3">
                          {/* Action Buttons */}
                          <div className="flex items-center gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleEditPrompt(index)
                              }}
                              disabled={isGenerating}
                              className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-sm flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              title={isGenerating ? "Cannot edit during generation" : "Edit prompt"}
                            >
                              <Pencil className="w-5 h-5 text-white" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleRegenerateImage(index)
                              }}
                              disabled={isGenerating}
                              className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-sm flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              title={isGenerating ? "Cannot regenerate during generation" : "Regenerate image"}
                            >
                              <RefreshCw className="w-5 h-5 text-white" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelectedImageIndex(index)
                              }}
                              className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-sm flex items-center justify-center transition-colors"
                              title="Zoom"
                            >
                              <ZoomIn className="w-5 h-5 text-white" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Navigation Controls */}
            <div className="flex items-center gap-4 mt-6">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setActiveCardIndex(Math.max(0, activeCardIndex - 1))}
                disabled={activeCardIndex === 0}
                className="w-10 h-10 rounded-full"
              >
                <ChevronLeft className="w-5 h-5" />
              </Button>
              
              {/* Dot Indicators */}
              <div className="flex items-center gap-1.5 max-w-[200px] overflow-x-auto py-2 px-1">
                {images.map((image, index) => (
                  <button
                    key={index}
                    onClick={() => setActiveCardIndex(index)}
                    className={cn(
                      "w-2.5 h-2.5 rounded-full transition-all flex-shrink-0",
                      index === activeCardIndex
                        ? "bg-cyan-400 w-6"
                        : image.status === "complete"
                        ? "bg-green-500/60 hover:bg-green-500"
                        : image.status === "generating"
                        ? "bg-cyan-500/60 animate-pulse"
                        : image.status === "error"
                        ? "bg-red-500/60 hover:bg-red-500"
                        : "bg-[var(--color-border)] hover:bg-[var(--color-text-dim)]"
                    )}
                    title={`Image ${index + 1}: ${image.status}`}
                  />
                ))}
              </div>
              
              <Button
                variant="outline"
                size="icon"
                onClick={() => setActiveCardIndex(Math.min(images.length - 1, activeCardIndex + 1))}
                disabled={activeCardIndex === images.length - 1}
                className="w-10 h-10 rounded-full"
              >
                <ChevronRight className="w-5 h-5" />
              </Button>
            </div>

            {/* Current Card Info */}
            {images[activeCardIndex] && (
              <div className="mt-4 max-w-md w-full px-4">
                {editingIndex === activeCardIndex ? (
                  /* Edit Mode */
                  <div className="bg-[var(--color-surface)] rounded-lg border border-cyan-500/50 p-3">
                    <label className="text-xs font-medium text-cyan-400 mb-2 block">
                      Edit Prompt:
                    </label>
                    <textarea
                      value={editPrompt}
                      onChange={(e) => setEditPrompt(e.target.value)}
                      className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg text-sm text-[var(--color-text)] resize-none focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
                      rows={3}
                      placeholder="Enter prompt..."
                    />
                    <div className="flex items-center gap-2 mt-3">
                      <Button
                        onClick={() => handleSavePrompt(activeCardIndex, editPrompt)}
                        size="sm"
                        className="flex-1 gap-1 bg-green-500 hover:bg-green-600"
                      >
                        <Check className="w-4 h-4" />
                        Save
                      </Button>
                      <Button
                        onClick={handleCancelEdit}
                        variant="outline"
                        size="sm"
                        className="flex-1 gap-1"
                      >
                        <X className="w-4 h-4" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  /* Display Mode */
                  <p className="text-sm text-[var(--color-text-muted)] line-clamp-2 text-center">
                    {images[activeCardIndex].prompt}
                  </p>
                )}
              </div>
            )}
          </div>
        ) : (
          /* Grid View */
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {images.map((image, index) => (
              <div
                key={index}
                className={cn(
                  "relative aspect-square rounded-lg overflow-hidden border-2 transition-all cursor-pointer group",
                  image.status === "complete"
                    ? "border-green-500/50 hover:border-green-500"
                    : image.status === "generating"
                    ? "border-cyan-500 animate-pulse"
                    : image.status === "error"
                    ? "border-red-500/50 hover:border-red-500"
                    : "border-[var(--color-border)] hover:border-[var(--color-border-bright)]",
                  progress.current.includes(index) && "ring-4 ring-cyan-500/30"
                )}
                onClick={() => setSelectedImageIndex(index)}
              >
                {/* Image or Placeholder */}
                {image.imageUrl ? (
                  <img
                    src={image.imageUrl}
                    alt={`Generated ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-[var(--color-background)] flex items-center justify-center">
                    {image.status === "generating" ? (
                      <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
                    ) : image.status === "error" ? (
                      <AlertCircle className="w-8 h-8 text-red-400" />
                    ) : (
                      <ImageIcon className="w-8 h-8 text-[var(--color-text-dim)]" />
                    )}
                  </div>
                )}

                {/* Status Badge */}
                <div className="absolute top-2 left-2 px-2 py-1 rounded-full text-xs font-bold bg-black/70 backdrop-blur-sm text-white">
                  {index + 1}
                </div>

                {/* Status Indicator */}
                <div className="absolute top-2 right-2">
                  {image.status === "complete" && (
                    <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                      <CheckCircle className="w-4 h-4 text-white" />
                    </div>
                  )}
                  {image.status === "error" && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRetry(index)
                      }}
                      className="w-6 h-6 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors"
                      title="Retry"
                    >
                      <RefreshCw className="w-3 h-3 text-white" />
                    </button>
                  )}
                </div>

                {/* Zoom overlay on hover */}
                {image.imageUrl && (
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                    {/* Action Buttons */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleEditPrompt(index)
                        }}
                        disabled={isGenerating}
                        className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-sm flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title={isGenerating ? "Cannot edit during generation" : "Edit prompt"}
                      >
                        <Pencil className="w-4 h-4 text-white" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRegenerateImage(index)
                        }}
                        disabled={isGenerating}
                        className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-sm flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title={isGenerating ? "Cannot regenerate during generation" : "Regenerate image"}
                      >
                        <RefreshCw className="w-4 h-4 text-white" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedImageIndex(index)
                        }}
                        className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-sm flex items-center justify-center transition-colors"
                        title="Zoom"
                      >
                        <ZoomIn className="w-4 h-4 text-white" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {!isGenerating && (
        <div className="p-4 border-t border-[var(--color-border)] flex items-center justify-between">
          <Button variant="ghost" onClick={onBack}>
            Back
          </Button>
          <div className="flex items-center gap-2">
            {/* Show partial completion option in footer when applicable */}
            {hasAnyComplete && !allComplete && hasPendingOrError && (
              <Button
                variant="outline"
                onClick={handleProceedWithPartial}
                className="gap-2 border-amber-500/50 text-amber-500 hover:bg-amber-500/10"
              >
                <CheckCircle className="w-4 h-4" />
                Continue with {completedImages.length} images
              </Button>
            )}
            <Button
              onClick={onNext}
              disabled={!allComplete && !hasAnyComplete}
              className="gap-2"
            >
              {allComplete ? "Continue to Cover" : hasAnyComplete ? "Continue with All" : "Continue to Cover"}
            </Button>
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {selectedImageIndex !== null && images[selectedImageIndex]?.imageUrl && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSelectedImageIndex(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh]">
            <img
              src={images[selectedImageIndex].imageUrl}
              alt={`Preview ${selectedImageIndex + 1}`}
              className="max-w-full max-h-[90vh] object-contain rounded-lg"
            />
            <div className="absolute top-4 left-4 px-3 py-2 rounded-lg bg-black/70 backdrop-blur-sm text-white">
              <div className="text-sm font-bold">Image {selectedImageIndex + 1}</div>
              <div className="text-xs text-gray-300 mt-1">
                {images[selectedImageIndex].prompt}
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-yellow-400" />
              </div>
              <h3 className="text-lg font-bold text-[var(--color-text)]">
                Reset Generation?
              </h3>
            </div>
            <p className="text-sm text-[var(--color-text-muted)] mb-6">
              This will clear all {progress.completed} generated images and return you to the prompt editing step. 
              This action cannot be undone.
            </p>
            <div className="flex items-center gap-3">
              <Button 
                variant="outline" 
                onClick={() => setShowResetConfirm(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button 
                onClick={handleResetGeneration}
                className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-black gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Reset & Go Back
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}




