// ============================================================
// Generate Images Wizard - Mini-wizard for AI-powered image generation
// Combines prompt generation and image generation in a floating modal
// ============================================================

import { useState, useCallback, useRef, useEffect } from "react"
import {
  Sparkles,
  Send,
  Loader2,
  X,
  ChevronDown,
  Cpu,
  Palette,
  Image as ImageIcon,
  Play,
  Pause,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  XCircle,
  Grid3x3,
  Eye,
  Edit3,
  Check,
  ChevronRight,
  ChevronLeft,
  Layers,
  Grid,
  ZoomIn,
  Pencil,
  Trash2,
} from "lucide-react"
import { Button } from "../../Button"
import { Card, CardContent } from "../../Card"
import { cn } from "@/lib/utils"
import { ImageryStyle, IMAGERY_STYLE_PRESETS } from "@/types/StudioMode"
import { KDPImage, generateKDPId } from "@/types/KDPMode"

// ============================================================
// Types
// ============================================================

interface GenerateImagesWizardProps {
  isOpen: boolean
  onClose: () => void
  onComplete: (images: GeneratedImageResult[]) => void
  trimWidth?: number
  trimHeight?: number
}

interface GeneratedImageResult {
  prompt: string
  imageUrl: string
  width: number
  height: number
}

interface ChatMessage {
  role: "user" | "assistant"
  content: string
  prompts?: string[]
}

interface GeneratedImage {
  prompt: string
  imageUrl?: string
  status: "pending" | "generating" | "complete" | "error"
}

// LLM Model options for prompt generation
const LLM_MODELS = [
  { id: "gpt-4o", name: "GPT-4o", description: "Previous generation, reliable and tested" },
  { id: "gpt-5-nano", name: "GPT-5 Nano", description: "Fastest, most cost-efficient" },
  { id: "gpt-5", name: "GPT-5", description: "Balanced performance" },
  { id: "gpt-5.2", name: "GPT-5.2", description: "Most capable, highest quality" },
] as const

// Image generation models
const IMAGE_MODELS = [
  { id: "z-image-turbo-replicate", name: "Turbo (Fast)", description: "Fast generation, good quality" },
  { id: "gpt-image-1", name: "GPT Image", description: "High quality, slower" },
  { id: "flux-schnell", name: "Flux Schnell", description: "Very fast, artistic style" },
] as const

// Page count options
const PAGE_COUNT_OPTIONS = [5, 10, 15, 20, 25, 30, 40, 50]

// ============================================================
// Component
// ============================================================

export function GenerateImagesWizard({
  isOpen,
  onClose,
  onComplete,
  trimWidth = 6,
  trimHeight = 9,
}: GenerateImagesWizardProps) {
  // Wizard step: "prompt" or "generate"
  const [step, setStep] = useState<"prompt" | "generate">("prompt")

  // ============================================================
  // Prompt Generation State
  // ============================================================
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "Hi! I'm ready to generate image prompts for you. Tell me what kind of images you'd like to create, and I'll generate detailed prompts for each one!",
    },
  ])
  const [inputValue, setInputValue] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [extractedPrompts, setExtractedPrompts] = useState<string[]>([])
  const [pageCount, setPageCount] = useState(10)

  // Dropdown states
  const [showPageDropdown, setShowPageDropdown] = useState(false)
  const [showStyleDropdown, setShowStyleDropdown] = useState(false)
  const [showModelDropdown, setShowModelDropdown] = useState(false)
  const [showImageModelDropdown, setShowImageModelDropdown] = useState(false)
  const [showAllPrompts, setShowAllPrompts] = useState(false)
  const [showCustomPageInput, setShowCustomPageInput] = useState(false)
  const [customPageValue, setCustomPageValue] = useState("")

  // Model selections
  const [selectedLLMModel, setSelectedLLMModel] = useState<string>("gpt-4o")
  const [selectedImageModel, setSelectedImageModel] = useState<string>("z-image-turbo-replicate")
  const [imageryStyle, setImageryStyle] = useState<ImageryStyle | null>(null)

  // Prompt editing state
  const [editingPromptIndex, setEditingPromptIndex] = useState<number | null>(null)
  const [editingPromptValue, setEditingPromptValue] = useState("")
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null)
  const [isRegeneratingAll, setIsRegeneratingAll] = useState(false)

  // ============================================================
  // Image Generation State
  // ============================================================
  const [images, setImages] = useState<GeneratedImage[]>([])
  const [generationProgress, setGenerationProgress] = useState({
    total: 0,
    completed: 0,
    current: [] as number[],
    status: "idle" as "idle" | "generating" | "complete" | "paused" | "cancelled",
  })
  const [viewMode, setViewMode] = useState<"grid" | "stacked">("stacked")
  const [activeCardIndex, setActiveCardIndex] = useState(0)
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null)

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pageDropdownRef = useRef<HTMLDivElement>(null)
  const styleDropdownRef = useRef<HTMLDivElement>(null)
  const modelDropdownRef = useRef<HTMLDivElement>(null)
  const imageModelDropdownRef = useRef<HTMLDivElement>(null)
  const customPageInputRef = useRef<HTMLInputElement>(null)
  const editInputRef = useRef<HTMLTextAreaElement>(null)
  const isPausedRef = useRef(false)
  const isCancelledRef = useRef(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const imagesRef = useRef<GeneratedImage[]>([])

  // Convert presets to full ImageryStyle objects
  const imageryStyles: ImageryStyle[] = IMAGERY_STYLE_PRESETS.map((preset, index) => ({
    id: preset.name.toLowerCase().replace(/\s+/g, "-").replace(/&/g, "and"),
    name: preset.name,
    description: preset.description,
    prompt: preset.prompt,
    isCustom: false,
    createdAt: Date.now() - (IMAGERY_STYLE_PRESETS.length - index) * 1000,
  }))

  // Scroll to bottom of messages
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  // Keep images ref in sync
  useEffect(() => {
    imagesRef.current = images
  }, [images])

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (pageDropdownRef.current && !pageDropdownRef.current.contains(e.target as Node)) {
        setShowPageDropdown(false)
      }
      if (styleDropdownRef.current && !styleDropdownRef.current.contains(e.target as Node)) {
        setShowStyleDropdown(false)
      }
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setShowModelDropdown(false)
      }
      if (imageModelDropdownRef.current && !imageModelDropdownRef.current.contains(e.target as Node)) {
        setShowImageModelDropdown(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Focus edit input when editing starts
  useEffect(() => {
    if (editingPromptIndex !== null && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingPromptIndex])

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep("prompt")
      setMessages([
        {
          role: "assistant",
          content: "Hi! I'm ready to generate image prompts for you. Tell me what kind of images you'd like to create, and I'll generate detailed prompts for each one!",
        },
      ])
      setInputValue("")
      setExtractedPrompts([])
      setImages([])
      setGenerationProgress({
        total: 0,
        completed: 0,
        current: [],
        status: "idle",
      })
      isPausedRef.current = false
      isCancelledRef.current = false
    }
  }, [isOpen])

  // ============================================================
  // Prompt Generation Handlers
  // ============================================================

  // Handle sending a message
  const handleSend = async () => {
    if (!inputValue.trim() || isLoading) return

    const userMessage = inputValue.trim()
    setInputValue("")

    // Add user message
    const newMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: userMessage },
    ]
    setMessages(newMessages)
    setIsLoading(true)

    try {
      // Add instruction for prompt count
      const promptInstruction = `\n\n[SYSTEM: Generate exactly ${pageCount} unique image prompts. Each prompt should be a detailed visual description suitable for image generation. Format them as a numbered list.]`

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({
            role: m.role,
            content: m === newMessages[newMessages.length - 1] ? `${m.content}${promptInstruction}` : m.content,
          })),
          mode: "image",
          model: selectedLLMModel,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: "Unknown error" }))
        throw new Error(errorData.message || "Failed to get AI response")
      }

      const data = await response.json()

      console.log("[Wizard] API Response:", data)
      console.log("[Wizard] Prompts from API:", data.prompts)

      // Add assistant response
      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: data.response,
        prompts: data.prompts || [],
      }
      setMessages([...newMessages, assistantMessage])

      // If prompts were extracted, update state
      if (data.prompts && data.prompts.length > 0) {
        console.log("[Wizard] Extracted prompts count:", data.prompts.length)
        
        // Apply imagery style suffix if selected
        const finalPrompts = data.prompts.map((prompt: string) => {
          if (imageryStyle && imageryStyle.prompt) {
            return `${prompt}, ${imageryStyle.prompt}`
          }
          return prompt
        })

        console.log("[Wizard] Setting final prompts:", finalPrompts)
        setExtractedPrompts(finalPrompts)
      } else {
        console.warn("[Wizard] No prompts found in API response")
      }
    } catch (error) {
      const errorMessage: ChatMessage = {
        role: "assistant",
        content:
          error instanceof Error
            ? `Sorry, I encountered an error: ${error.message}. Please try again.`
            : "Sorry, I encountered an error. Please try again.",
      }
      setMessages([...newMessages, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  // Handle Enter key
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Handle page count change
  const handlePageCountChange = (count: number) => {
    setPageCount(count)
    setShowPageDropdown(false)
    setShowCustomPageInput(false)
  }

  // Handle custom page count
  const handleCustomPageClick = () => {
    setShowCustomPageInput(true)
    setCustomPageValue(pageCount.toString())
    setTimeout(() => customPageInputRef.current?.focus(), 0)
  }

  const handleCustomPageSubmit = () => {
    const value = parseInt(customPageValue, 10)
    if (!isNaN(value) && value >= 1 && value <= 100) {
      setPageCount(value)
      setShowPageDropdown(false)
      setShowCustomPageInput(false)
    }
  }

  const handleCustomPageKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      handleCustomPageSubmit()
    } else if (e.key === "Escape") {
      setShowCustomPageInput(false)
    }
  }

  // Handle style selection
  const handleStyleSelect = (style: ImageryStyle | null) => {
    setImageryStyle(style)
    setShowStyleDropdown(false)

    // Re-apply style to existing prompts if any
    if (extractedPrompts.length > 0) {
      const updatedPrompts = extractedPrompts.map((prompt) => {
        // Remove any existing style suffix (rough heuristic)
        const basePrompt = prompt
          .split(", photorealistic")[0]
          .split(", cinematic")[0]
          .split(", anime")[0]
          .split(", Pixar")[0]
          .split(", oil painting")[0]
          .split(", watercolor")[0]

        if (style && style.prompt) {
          return `${basePrompt}, ${style.prompt}`
        }
        return basePrompt
      })
      setExtractedPrompts(updatedPrompts)
    }
  }

  // Handle starting to edit a prompt
  const handleStartEdit = useCallback((index: number) => {
    setEditingPromptIndex(index)
    setEditingPromptValue(extractedPrompts[index])
  }, [extractedPrompts])

  // Handle saving an edited prompt
  const handleSaveEdit = useCallback(() => {
    if (editingPromptIndex === null) return

    const updatedPrompts = [...extractedPrompts]
    updatedPrompts[editingPromptIndex] = editingPromptValue.trim()

    setExtractedPrompts(updatedPrompts)
    setEditingPromptIndex(null)
    setEditingPromptValue("")
  }, [editingPromptIndex, editingPromptValue, extractedPrompts])

  // Handle canceling edit
  const handleCancelEdit = useCallback(() => {
    setEditingPromptIndex(null)
    setEditingPromptValue("")
  }, [])

  // Handle regenerating a single prompt
  const handleRegenerateSingle = useCallback(
    async (index: number) => {
      if (!extractedPrompts[index]) return

      setRegeneratingIndex(index)

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [
              {
                role: "user",
                content: `Generate a NEW, different image prompt for image #${index + 1}. 
The current prompt is: "${extractedPrompts[index]}"

Create a completely different but thematically related prompt. Return ONLY the new prompt, nothing else.`,
              },
            ],
            mode: "image",
            model: selectedLLMModel,
          }),
        })

        if (!response.ok) {
          throw new Error("Failed to regenerate prompt")
        }

        const data = await response.json()
        const newPrompt = data.response.trim()

        // Apply imagery style if selected
        const finalPrompt = imageryStyle?.prompt ? `${newPrompt}, ${imageryStyle.prompt}` : newPrompt

        const updatedPrompts = [...extractedPrompts]
        updatedPrompts[index] = finalPrompt

        setExtractedPrompts(updatedPrompts)
      } catch (error) {
        console.error("Error regenerating prompt:", error)
      } finally {
        setRegeneratingIndex(null)
      }
    },
    [extractedPrompts, selectedLLMModel, imageryStyle]
  )

  // Handle deleting a single prompt
  const handleDeletePrompt = useCallback((index: number) => {
    if (!extractedPrompts[index]) return
    
    // Confirm deletion
    if (!confirm(`Delete prompt #${index + 1}?`)) return
    
    const updatedPrompts = extractedPrompts.filter((_, i) => i !== index)
    setExtractedPrompts(updatedPrompts)
    
    // If we were editing this prompt, cancel edit
    if (editingPromptIndex === index) {
      setEditingPromptIndex(null)
      setEditingPromptValue("")
    } else if (editingPromptIndex !== null && editingPromptIndex > index) {
      // Adjust editing index if it's after the deleted one
      setEditingPromptIndex(editingPromptIndex - 1)
    }
    
    console.log(`[Wizard] Deleted prompt #${index + 1}, ${updatedPrompts.length} prompts remaining`)
  }, [extractedPrompts, editingPromptIndex])

  // Handle regenerating all prompts
  const handleRegenerateAll = useCallback(async () => {
    if (messages.length < 2) return

    setIsRegeneratingAll(true)

    try {
      const userMessage = messages.find((m) => m.role === "user")
      if (!userMessage) {
        throw new Error("No user message found")
      }

      const promptInstruction = `\n\n[SYSTEM: Generate exactly ${pageCount} completely NEW and DIFFERENT unique image prompts. Each prompt should be a detailed visual description suitable for image generation. These should be different from any previous prompts. Format them as a numbered list.]`

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: `${userMessage.content}${promptInstruction}` }],
          mode: "image",
          model: selectedLLMModel,
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to regenerate prompts")
      }

      const data = await response.json()

      if (data.prompts && data.prompts.length > 0) {
        // Apply imagery style suffix if selected
        const finalPrompts = data.prompts.map((prompt: string) => {
          if (imageryStyle && imageryStyle.prompt) {
            return `${prompt}, ${imageryStyle.prompt}`
          }
          return prompt
        })

        setExtractedPrompts(finalPrompts)

        // Add to chat messages
        const assistantMessage: ChatMessage = {
          role: "assistant",
          content: data.response,
          prompts: data.prompts,
        }
        setMessages((prev) => [...prev, assistantMessage])
      }
    } catch (error) {
      console.error("Error regenerating all prompts:", error)
    } finally {
      setIsRegeneratingAll(false)
    }
  }, [messages, pageCount, selectedLLMModel, imageryStyle])

  // ============================================================
  // Image Generation Handlers
  // ============================================================

  // Initialize images array when moving to generate step
  const handleProceedToGenerate = useCallback(() => {
    const initialImages = extractedPrompts.map((prompt) => ({
      prompt,
      imageUrl: undefined,
      status: "pending" as const,
    }))
    setImages(initialImages)
    imagesRef.current = initialImages
    setGenerationProgress({
      total: extractedPrompts.length,
      completed: 0,
      current: [],
      status: "idle",
    })
    setStep("generate")
  }, [extractedPrompts])

  // Generate single image
  const generateImage = useCallback(
    async (index: number, signal?: AbortSignal): Promise<boolean> => {
      const image = imagesRef.current[index]
      if (!image) return false

      try {
        if (isCancelledRef.current || signal?.aborted) {
          return false
        }

        // Update status to generating
        setImages((prev) => {
          const updated = prev.map((img, i) => (i === index ? { ...img, status: "generating" as const } : img))
          imagesRef.current = updated
          return updated
        })
        setGenerationProgress((prev) => ({ ...prev, current: [...prev.current, index] }))

        // Build enhanced prompt with imagery style if selected
        let enhancedPrompt = image.prompt
        if (imageryStyle?.prompt && !image.prompt.includes(imageryStyle.prompt)) {
          enhancedPrompt = `${image.prompt}, ${imageryStyle.prompt}`
        }

        // Call image generation API
        const response = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: enhancedPrompt,
            model: selectedImageModel,
            aspectRatio: `${trimWidth}:${trimHeight}`,
            imageSize: "1024x1024",
          }),
          signal,
        })

        if (isCancelledRef.current || signal?.aborted) {
          return false
        }

        if (!response.ok) {
          throw new Error(`Failed to generate image: ${response.statusText}`)
        }

        const data = await response.json()
        const imageUrl = data.imageUrl

        // Update with generated image
        setImages((prev) => {
          const updated = prev.map((img, i) => (i === index ? { ...img, imageUrl, status: "complete" as const } : img))
          imagesRef.current = updated
          return updated
        })
        setGenerationProgress((prev) => ({
          ...prev,
          completed: prev.completed + 1,
          current: prev.current.filter((i) => i !== index),
        }))
        return true
      } catch (error) {
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
        setGenerationProgress((prev) => ({
          ...prev,
          current: prev.current.filter((i) => i !== index),
        }))
        return false
      }
    },
    [imageryStyle, selectedImageModel, trimWidth, trimHeight]
  )

  // Generate all images in parallel batches
  const handleGenerateAll = useCallback(async () => {
    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal

    isPausedRef.current = false
    isCancelledRef.current = false

    setGenerationProgress((prev) => ({ ...prev, status: "generating" }))

    const pendingIndices = imagesRef.current.map((img, i) => (img.status !== "complete" ? i : -1)).filter((i) => i !== -1)

    const BATCH_SIZE = 5
    for (let batchStart = 0; batchStart < pendingIndices.length; batchStart += BATCH_SIZE) {
      if (isPausedRef.current) {
        setGenerationProgress((prev) => ({ ...prev, status: "paused" }))
        return
      }

      if (isCancelledRef.current || signal.aborted) {
        setGenerationProgress((prev) => ({ ...prev, status: "cancelled", current: [] }))
        return
      }

      const batchIndices = pendingIndices.slice(batchStart, batchStart + BATCH_SIZE)

      await Promise.all(batchIndices.map((index) => generateImage(index, signal)))

      if (isCancelledRef.current || signal.aborted) {
        setGenerationProgress((prev) => ({ ...prev, status: "cancelled", current: [] }))
        return
      }

      if (isPausedRef.current) {
        setGenerationProgress((prev) => ({ ...prev, status: "paused" }))
        return
      }
    }

    if (!isCancelledRef.current && !isPausedRef.current) {
      setGenerationProgress((prev) => ({ ...prev, status: "complete", current: [] }))
    }
  }, [generateImage])

  // Pause generation
  const handlePause = useCallback(() => {
    isPausedRef.current = true
    setGenerationProgress((prev) => ({ ...prev, status: "paused" }))
  }, [])

  // Resume generation
  const handleResume = useCallback(() => {
    isPausedRef.current = false
    handleGenerateAll()
  }, [handleGenerateAll])

  // Cancel all generation
  const handleCancelAll = useCallback(() => {
    isCancelledRef.current = true
    isPausedRef.current = false

    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }

    setImages((prev) => {
      const updated = prev.map((img) => (img.status === "generating" ? { ...img, status: "pending" as const } : img))
      imagesRef.current = updated
      return updated
    })

    setGenerationProgress((prev) => ({ ...prev, status: "cancelled", current: [] }))
  }, [])

  // Retry failed image
  const handleRetry = useCallback(
    async (index: number) => {
      await generateImage(index)
    },
    [generateImage]
  )

  // Regenerate image
  const handleRegenerateImage = useCallback(
    async (index: number) => {
      setImages((prev) => {
        const wasComplete = prev[index].status === "complete"
        if (wasComplete) {
          setGenerationProgress((p) => ({ ...p, completed: p.completed - 1 }))
        }
        const updated = prev.map((img, i) => (i === index ? { ...img, imageUrl: undefined, status: "pending" as const } : img))
        imagesRef.current = updated
        return updated
      })

      await generateImage(index)
    },
    [generateImage]
  )

  // Handle completion
  const handleComplete = useCallback(() => {
    const completedImages = images
      .filter((img) => img.status === "complete" && img.imageUrl)
      .map((img) => ({
        prompt: img.prompt,
        imageUrl: img.imageUrl!,
        width: 1024,
        height: 1024,
      }))

    onComplete(completedImages)
    onClose()
  }, [images, onComplete, onClose])

  // Check states
  const hasPrompts = extractedPrompts.length > 0
  const promptCountMatch = extractedPrompts.length === pageCount
  const allComplete = images.length > 0 && images.every((img) => img.status === "complete")
  const completedImages = images.filter((img) => img.status === "complete")
  const hasAnyComplete = completedImages.length > 0
  const isGenerating = generationProgress.status === "generating"
  const isPausedState = generationProgress.status === "paused"
  const isCancelledState = generationProgress.status === "cancelled"
  const progressPercentage = generationProgress.total > 0 ? Math.round((generationProgress.completed / generationProgress.total) * 100) : 0

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-4 md:inset-8 lg:inset-12 z-50 flex items-center justify-center pointer-events-none">
        <div className="w-full max-w-4xl max-h-full bg-[var(--color-surface)] rounded-2xl shadow-2xl border border-[var(--color-border)] overflow-hidden pointer-events-auto flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-[var(--color-text)]">Generate Images</h2>
                <p className="text-sm text-[var(--color-text-muted)]">
                  {step === "prompt" ? "Step 1: Create prompts with AI" : "Step 2: Generate images"}
                </p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} className="text-[var(--color-text-dim)] hover:text-[var(--color-text)]">
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* Step Indicator */}
          <div className="px-6 py-3 border-b border-[var(--color-border)] bg-[var(--color-background)]/50">
            <div className="flex items-center justify-center gap-8">
              <button
                onClick={() => step === "generate" && setStep("prompt")}
                className={cn("flex items-center gap-2 transition-all", step === "generate" ? "cursor-pointer" : "cursor-default")}
              >
                <div
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all",
                    step === "prompt"
                      ? "bg-[var(--color-primary)] text-white ring-4 ring-[var(--color-primary)]/20"
                      : hasPrompts
                      ? "bg-green-500 text-white"
                      : "bg-[var(--color-surface)] text-[var(--color-text-dim)] border-2 border-[var(--color-border)]"
                  )}
                >
                  {hasPrompts && step === "generate" ? <Check className="w-4 h-4" /> : "1"}
                </div>
                <span className={cn("text-sm font-medium", step === "prompt" ? "text-[var(--color-text)]" : "text-green-500")}>Prompts</span>
              </button>

              <div className={cn("w-16 h-0.5", hasPrompts ? "bg-green-500" : "bg-[var(--color-border)]")} />

              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all",
                    step === "generate"
                      ? "bg-[var(--color-primary)] text-white ring-4 ring-[var(--color-primary)]/20"
                      : "bg-[var(--color-surface)] text-[var(--color-text-dim)] border-2 border-[var(--color-border)]"
                  )}
                >
                  2
                </div>
                <span className={cn("text-sm font-medium", step === "generate" ? "text-[var(--color-text)]" : "text-[var(--color-text-dim)]")}>
                  Generate
                </span>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {step === "prompt" ? (
              // ============================================================
              // PROMPT GENERATION STEP
              // ============================================================
              <div className="flex flex-col h-full">
                {/* Settings Row */}
                <div className="p-4 border-b border-[var(--color-border)]">
                  <div className="flex items-center gap-3 p-3 bg-[var(--color-background)] rounded-lg border border-[var(--color-border)] flex-wrap">
                    {/* Page Count Dropdown */}
                    <div className="relative" ref={pageDropdownRef}>
                      <button
                        onClick={() => setShowPageDropdown(!showPageDropdown)}
                        className="flex items-center gap-2 px-3 py-2 bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] hover:border-[var(--color-primary)] transition-colors"
                      >
                        <Grid3x3 className="w-4 h-4 text-[var(--color-primary)]" />
                        <span className="text-sm font-medium text-[var(--color-text)]">{pageCount} Images</span>
                        <ChevronDown className={cn("w-4 h-4 text-[var(--color-text-dim)] transition-transform", showPageDropdown && "rotate-180")} />
                      </button>

                      {showPageDropdown && (
                        <div className="absolute top-full left-0 mt-1 w-40 bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] shadow-lg z-20 py-1">
                          {PAGE_COUNT_OPTIONS.map((count) => (
                            <button
                              key={count}
                              onClick={() => handlePageCountChange(count)}
                              className={cn(
                                "w-full px-3 py-2 text-sm text-left hover:bg-[var(--color-background)] transition-colors",
                                pageCount === count && !showCustomPageInput ? "text-[var(--color-primary)] font-medium" : "text-[var(--color-text)]"
                              )}
                            >
                              {count} images
                            </button>
                          ))}
                          <div className="border-t border-[var(--color-border)] mt-1 pt-1">
                            {showCustomPageInput ? (
                              <div className="px-2 py-1.5 flex items-center gap-2">
                                <input
                                  ref={customPageInputRef}
                                  type="number"
                                  min="1"
                                  max="100"
                                  value={customPageValue}
                                  onChange={(e) => setCustomPageValue(e.target.value)}
                                  onKeyDown={handleCustomPageKeyDown}
                                  onBlur={handleCustomPageSubmit}
                                  className="w-16 px-2 py-1 text-sm bg-[var(--color-background)] border border-[var(--color-border)] rounded text-[var(--color-text)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                                  placeholder="1-100"
                                />
                              </div>
                            ) : (
                              <button
                                onClick={handleCustomPageClick}
                                className={cn(
                                  "w-full px-3 py-2 text-sm text-left hover:bg-[var(--color-background)] transition-colors",
                                  !PAGE_COUNT_OPTIONS.includes(pageCount) ? "text-[var(--color-primary)] font-medium" : "text-[var(--color-text)]"
                                )}
                              >
                                Custom...
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* LLM Model Dropdown */}
                    <div className="relative" ref={modelDropdownRef}>
                      <button
                        onClick={() => setShowModelDropdown(!showModelDropdown)}
                        className="flex items-center gap-2 px-3 py-2 bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] hover:border-cyan-500 transition-colors"
                      >
                        <Cpu className="w-4 h-4 text-cyan-400" />
                        <span className="text-sm font-medium text-[var(--color-text)]">
                          {LLM_MODELS.find((m) => m.id === selectedLLMModel)?.name || "GPT-4o"}
                        </span>
                        <ChevronDown className={cn("w-4 h-4 text-[var(--color-text-dim)] transition-transform", showModelDropdown && "rotate-180")} />
                      </button>

                      {showModelDropdown && (
                        <div className="absolute top-full left-0 mt-1 w-56 bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] shadow-lg z-20 py-1">
                          {LLM_MODELS.map((model) => (
                            <button
                              key={model.id}
                              onClick={() => {
                                setSelectedLLMModel(model.id)
                                setShowModelDropdown(false)
                              }}
                              className={cn(
                                "w-full px-3 py-2 text-sm text-left hover:bg-[var(--color-background)] transition-colors",
                                selectedLLMModel === model.id ? "text-cyan-400 font-medium" : "text-[var(--color-text)]"
                              )}
                            >
                              <div className="font-medium">{model.name}</div>
                              <div className="text-xs text-[var(--color-text-dim)]">{model.description}</div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Imagery Style Dropdown */}
                    <div className="relative flex-1 min-w-[150px]" ref={styleDropdownRef}>
                      <button
                        onClick={() => setShowStyleDropdown(!showStyleDropdown)}
                        className="flex items-center gap-2 px-3 py-2 bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] hover:border-[var(--color-primary)] transition-colors w-full"
                      >
                        <Palette className="w-4 h-4 text-purple-400" />
                        <span className="text-sm font-medium text-[var(--color-text)] flex-1 text-left truncate">
                          {imageryStyle ? imageryStyle.name : "No Style"}
                        </span>
                        <ChevronDown
                          className={cn("w-4 h-4 text-[var(--color-text-dim)] transition-transform flex-shrink-0", showStyleDropdown && "rotate-180")}
                        />
                      </button>

                      {showStyleDropdown && (
                        <div className="absolute top-full left-0 mt-1 w-full max-h-64 overflow-y-auto bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] shadow-lg z-20 py-1">
                          <button
                            onClick={() => handleStyleSelect(null)}
                            className={cn(
                              "w-full px-3 py-2 text-sm text-left hover:bg-[var(--color-background)] transition-colors",
                              !imageryStyle ? "text-[var(--color-primary)] font-medium" : "text-[var(--color-text)]"
                            )}
                          >
                            No Style
                          </button>
                          {imageryStyles.map((style) => (
                            <button
                              key={style.id}
                              onClick={() => handleStyleSelect(style)}
                              className={cn(
                                "w-full px-3 py-2 text-sm text-left hover:bg-[var(--color-background)] transition-colors",
                                imageryStyle?.id === style.id ? "text-[var(--color-primary)] font-medium" : "text-[var(--color-text)]"
                              )}
                            >
                              <div className="font-medium">{style.name}</div>
                              <div className="text-xs text-[var(--color-text-dim)] truncate">{style.description}</div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Chat Bubble */}
                <div className="flex-1 flex flex-col min-h-0 mx-4 my-4">
                  <div className="flex-1 border border-[var(--color-border)] rounded-xl overflow-hidden flex flex-col bg-[var(--color-surface)]">
                    {/* Messages Area */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px] max-h-[300px]">
                      {messages.map((msg, index) => (
                        <div key={index} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                          <div
                            className={cn(
                              "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
                              msg.role === "user"
                                ? "bg-[var(--color-primary)] text-white rounded-br-md"
                                : "bg-[var(--color-background)] text-[var(--color-text)] border border-[var(--color-border)] rounded-bl-md"
                            )}
                          >
                            <p className="whitespace-pre-wrap">{msg.content}</p>
                            {msg.prompts && msg.prompts.length > 0 && (
                              <div className="mt-2 pt-2 border-t border-current/20">
                                <span className="text-xs opacity-75">✓ Extracted {msg.prompts.length} prompts</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                      {isLoading && (
                        <div className="flex justify-start">
                          <div className="bg-[var(--color-background)] text-[var(--color-text)] border border-[var(--color-border)] rounded-2xl rounded-bl-md px-4 py-3">
                            <div className="flex items-center gap-2">
                              <Loader2 className="w-4 h-4 animate-spin text-[var(--color-primary)]" />
                              <span className="text-sm text-[var(--color-text-muted)]">Generating prompts...</span>
                            </div>
                          </div>
                        </div>
                      )}
                      <div ref={messagesEndRef} />
                    </div>

                    {/* Input Area */}
                    <div className="border-t border-[var(--color-border)] p-3 bg-[var(--color-background)]">
                      <div className="flex items-end gap-2">
                        <textarea
                          ref={textareaRef}
                          value={inputValue}
                          onChange={(e) => setInputValue(e.target.value)}
                          onKeyDown={handleKeyDown}
                          placeholder="Describe what kind of images you want to generate..."
                          className="flex-1 resize-none rounded-xl px-4 py-2.5 text-sm bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] placeholder-[var(--color-text-dim)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/50 focus:border-[var(--color-primary)] min-h-[42px] max-h-[120px]"
                          rows={1}
                          disabled={isLoading}
                        />
                        <Button onClick={handleSend} disabled={!inputValue.trim() || isLoading} className="h-[42px] px-4 gap-2">
                          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Prompts Status Section */}
                <div className="p-4 border-t border-[var(--color-border)]">
                  <div
                    className={cn(
                      "p-4 rounded-xl border-2 transition-colors",
                      hasPrompts
                        ? promptCountMatch
                          ? "border-green-500/50 bg-green-500/5"
                          : "border-yellow-500/50 bg-yellow-500/5"
                        : "border-[var(--color-border)] bg-[var(--color-background)]"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {hasPrompts ? (
                          promptCountMatch ? (
                            <CheckCircle className="w-5 h-5 text-green-400" />
                          ) : (
                            <AlertCircle className="w-5 h-5 text-yellow-400" />
                          )
                        ) : (
                          <Grid3x3 className="w-5 h-5 text-[var(--color-text-dim)]" />
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-[var(--color-text)]">
                              {extractedPrompts.length} of {pageCount} prompts
                            </span>
                            {promptCountMatch && (
                              <span className="text-xs px-2 py-0.5 bg-green-500/20 text-green-400 rounded-full font-medium">Ready</span>
                            )}
                          </div>
                          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                            {!hasPrompts
                              ? "Chat with the AI to generate prompts"
                              : promptCountMatch
                              ? "Perfect! You have the right number of prompts."
                              : extractedPrompts.length < pageCount
                              ? `Need ${pageCount - extractedPrompts.length} more prompts.`
                              : `${extractedPrompts.length - pageCount} extra prompts.`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {hasPrompts && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={handleRegenerateAll}
                              disabled={isRegeneratingAll || isLoading}
                              className="gap-1.5 text-cyan-400 border-cyan-500/50 hover:bg-cyan-500/10"
                            >
                              {isRegeneratingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                              Regenerate All
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => setShowAllPrompts(true)} className="gap-1.5">
                              <Eye className="w-3.5 h-3.5" />
                              View & Edit
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-[var(--color-border)] flex items-center justify-between">
                  <Button variant="ghost" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button onClick={handleProceedToGenerate} disabled={!hasPrompts} className="gap-2">
                    Continue to Generate
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ) : (
              // ============================================================
              // IMAGE GENERATION STEP
              // ============================================================
              <div className="flex flex-col h-full">
                {/* Image Model Selector */}
                <div className="p-4 border-b border-[var(--color-border)]">
                  <div className="flex items-center gap-3">
                    <div className="relative" ref={imageModelDropdownRef}>
                      <button
                        onClick={() => setShowImageModelDropdown(!showImageModelDropdown)}
                        className="flex items-center gap-2 px-3 py-2 bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] hover:border-purple-500 transition-colors"
                      >
                        <ImageIcon className="w-4 h-4 text-purple-400" />
                        <span className="text-sm font-medium text-[var(--color-text)]">
                          {IMAGE_MODELS.find((m) => m.id === selectedImageModel)?.name || "Turbo"}
                        </span>
                        <ChevronDown
                          className={cn("w-4 h-4 text-[var(--color-text-dim)] transition-transform", showImageModelDropdown && "rotate-180")}
                        />
                      </button>

                      {showImageModelDropdown && (
                        <div className="absolute top-full left-0 mt-1 w-56 bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] shadow-lg z-20 py-1">
                          {IMAGE_MODELS.map((model) => (
                            <button
                              key={model.id}
                              onClick={() => {
                                setSelectedImageModel(model.id)
                                setShowImageModelDropdown(false)
                              }}
                              className={cn(
                                "w-full px-3 py-2 text-sm text-left hover:bg-[var(--color-background)] transition-colors",
                                selectedImageModel === model.id ? "text-purple-400 font-medium" : "text-[var(--color-text)]"
                              )}
                            >
                              <div className="font-medium">{model.name}</div>
                              <div className="text-xs text-[var(--color-text-dim)]">{model.description}</div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <span className="text-sm text-[var(--color-text-muted)]">
                      Generating {images.length} images • {trimWidth}" × {trimHeight}"
                    </span>
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
                            Progress: {generationProgress.completed} / {generationProgress.total}
                          </span>
                          <span className="text-sm font-bold text-[var(--color-primary)]">{progressPercentage}%</span>
                        </div>
                        <div className="w-full h-3 bg-[var(--color-background)] rounded-full overflow-hidden border border-[var(--color-border)]">
                          <div
                            className={cn(
                              "h-full transition-all duration-300 rounded-full",
                              allComplete
                                ? "bg-gradient-to-r from-green-500 to-green-400"
                                : images.some((img) => img.status === "error")
                                ? "bg-gradient-to-r from-yellow-500 to-orange-500"
                                : "bg-gradient-to-r from-cyan-500 to-blue-500"
                            )}
                            style={{ width: `${progressPercentage}%` }}
                          />
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {(generationProgress.status === "idle" || isCancelledState) && (
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

                {/* Image Display Area */}
                <div className="flex-1 overflow-y-auto p-4">
                  {viewMode === "stacked" ? (
                    /* 3D Stacked Card Slider */
                    <div className="flex flex-col items-center justify-center h-full min-h-[300px]">
                      <div className="relative w-full max-w-md mx-auto h-[280px]" style={{ perspective: "1000px" }}>
                        {images.map((image, index) => {
                          const offset = index - activeCardIndex
                          const isActive = index === activeCardIndex
                          const absOffset = Math.abs(offset)

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
                                "absolute inset-x-0 mx-auto w-[220px] aspect-square rounded-xl overflow-hidden transition-all duration-500 ease-out cursor-pointer",
                                "border-2 shadow-2xl",
                                image.status === "complete"
                                  ? "border-green-500/50"
                                  : image.status === "generating"
                                  ? "border-cyan-500 animate-pulse"
                                  : image.status === "error"
                                  ? "border-red-500/50"
                                  : "border-[var(--color-border)]",
                                isActive && "ring-4 ring-cyan-500/30 border-cyan-400"
                              )}
                              style={{
                                transform: `
                                  translateZ(${offset * -50}px) 
                                  translateY(${offset * 12}px)
                                  scale(${1 - absOffset * 0.08})
                                  rotateX(${offset * -3}deg)
                                `,
                                zIndex: images.length - absOffset,
                                opacity: 1 - absOffset * 0.2,
                                filter: absOffset > 0 ? `blur(${absOffset * 0.5}px)` : "none",
                                pointerEvents: absOffset > 2 ? "none" : "auto",
                              }}
                            >
                              {image.imageUrl ? (
                                <img src={image.imageUrl} alt={`Generated ${index + 1}`} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full bg-gradient-to-br from-[var(--color-surface)] to-[var(--color-background)] flex flex-col items-center justify-center">
                                  {image.status === "generating" ? (
                                    <>
                                      <Loader2 className="w-10 h-10 text-cyan-400 animate-spin mb-2" />
                                      <span className="text-sm text-cyan-400 font-medium">Generating...</span>
                                    </>
                                  ) : image.status === "error" ? (
                                    <>
                                      <AlertCircle className="w-10 h-10 text-red-400 mb-2" />
                                      <span className="text-sm text-red-400">Failed</span>
                                    </>
                                  ) : (
                                    <>
                                      <ImageIcon className="w-10 h-10 text-[var(--color-text-dim)] mb-2" />
                                      <span className="text-sm text-[var(--color-text-dim)]">Pending</span>
                                    </>
                                  )}
                                </div>
                              )}

                              {/* Card Number Badge */}
                              <div className="absolute top-2 left-2 px-2 py-1 rounded-full text-xs font-bold bg-black/80 backdrop-blur-sm text-white">
                                {index + 1} / {images.length}
                              </div>

                              {/* Status Indicator */}
                              <div className="absolute top-2 right-2">
                                {image.status === "complete" && (
                                  <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center shadow-lg">
                                    <CheckCircle className="w-4 h-4 text-white" />
                                  </div>
                                )}
                                {image.status === "error" && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleRetry(index)
                                    }}
                                    className="w-6 h-6 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors shadow-lg"
                                    title="Retry"
                                  >
                                    <RefreshCw className="w-3 h-3 text-white" />
                                  </button>
                                )}
                                {image.status === "generating" && (
                                  <div className="w-6 h-6 rounded-full bg-cyan-500 flex items-center justify-center shadow-lg">
                                    <Loader2 className="w-3 h-3 text-white animate-spin" />
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      {/* Navigation Controls */}
                      <div className="flex items-center gap-4 mt-4">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => setActiveCardIndex(Math.max(0, activeCardIndex - 1))}
                          disabled={activeCardIndex === 0}
                          className="w-8 h-8 rounded-full"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </Button>

                        {/* Dot Indicators */}
                        <div className="flex items-center gap-1 max-w-[150px] overflow-x-auto py-2 px-1">
                          {images.map((image, index) => (
                            <button
                              key={index}
                              onClick={() => setActiveCardIndex(index)}
                              className={cn(
                                "w-2 h-2 rounded-full transition-all flex-shrink-0",
                                index === activeCardIndex
                                  ? "bg-cyan-400 w-4"
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
                          className="w-8 h-8 rounded-full"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </div>

                      {/* Current Card Info */}
                      {images[activeCardIndex] && (
                        <div className="mt-3 max-w-md w-full px-4">
                          <p className="text-xs text-[var(--color-text-muted)] line-clamp-2 text-center">{images[activeCardIndex].prompt}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Grid View */
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
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
                              : "border-[var(--color-border)] hover:border-[var(--color-border-bright)]"
                          )}
                          onClick={() => image.imageUrl && setSelectedImageIndex(index)}
                        >
                          {image.imageUrl ? (
                            <img src={image.imageUrl} alt={`Generated ${index + 1}`} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-[var(--color-background)] flex items-center justify-center">
                              {image.status === "generating" ? (
                                <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
                              ) : image.status === "error" ? (
                                <AlertCircle className="w-6 h-6 text-red-400" />
                              ) : (
                                <ImageIcon className="w-6 h-6 text-[var(--color-text-dim)]" />
                              )}
                            </div>
                          )}

                          {/* Status Badge */}
                          <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-black/70 backdrop-blur-sm text-white">
                            {index + 1}
                          </div>

                          {/* Status Indicator */}
                          <div className="absolute top-1 right-1">
                            {image.status === "complete" && (
                              <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                                <CheckCircle className="w-3 h-3 text-white" />
                              </div>
                            )}
                            {image.status === "error" && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleRetry(index)
                                }}
                                className="w-5 h-5 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors"
                                title="Retry"
                              >
                                <RefreshCw className="w-2.5 h-2.5 text-white" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Footer */}
                {!isGenerating && (
                  <div className="p-4 border-t border-[var(--color-border)] flex items-center justify-between">
                    <Button variant="ghost" onClick={() => setStep("prompt")} className="gap-2">
                      <ChevronLeft className="w-4 h-4" />
                      Back to Prompts
                    </Button>
                    <div className="flex items-center gap-2">
                      {hasAnyComplete && !allComplete && (
                        <Button variant="outline" onClick={handleComplete} className="gap-2 border-amber-500/50 text-amber-500 hover:bg-amber-500/10">
                          <CheckCircle className="w-4 h-4" />
                          Add {completedImages.length} images
                        </Button>
                      )}
                      <Button onClick={handleComplete} disabled={!hasAnyComplete} className="gap-2">
                        <CheckCircle className="w-4 h-4" />
                        {allComplete ? "Add All Images" : hasAnyComplete ? "Add All & Close" : "Add Images"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

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
              <div className="text-xs text-gray-300 mt-1 max-w-[300px] line-clamp-2">{images[selectedImageIndex].prompt}</div>
            </div>
          </div>
        </div>
      )}

      {/* View All Prompts Modal */}
      {showAllPrompts && (
        <>
          <div
            className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
            onClick={() => {
              setShowAllPrompts(false)
              handleCancelEdit()
            }}
          />
          <div className="fixed inset-8 z-[60] flex items-center justify-center pointer-events-none">
            <div className="w-full max-w-3xl max-h-full bg-[var(--color-surface)] rounded-2xl shadow-2xl border border-[var(--color-border)] overflow-hidden pointer-events-auto flex flex-col">
              <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
                <div className="flex items-center gap-2">
                  <Grid3x3 className="w-5 h-5 text-[var(--color-primary)]" />
                  <h3 className="text-lg font-bold text-[var(--color-text)]">Generated Prompts ({extractedPrompts.length})</h3>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleRegenerateAll}
                    disabled={isRegeneratingAll}
                    className="gap-1.5 text-cyan-400 border-cyan-500/50 hover:bg-cyan-500/10"
                  >
                    {isRegeneratingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    Regenerate All
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setShowAllPrompts(false)
                      handleCancelEdit()
                    }}
                  >
                    <X className="w-5 h-5" />
                  </Button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {extractedPrompts.map((prompt, index) => (
                  <div
                    key={index}
                    className={cn(
                      "p-3 bg-[var(--color-background)] border rounded-lg transition-colors",
                      editingPromptIndex === index
                        ? "border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/30"
                        : "border-[var(--color-border)] hover:border-[var(--color-primary)]"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-7 h-7 bg-[var(--color-primary)]/20 rounded-full flex items-center justify-center text-xs font-bold text-[var(--color-primary)]">
                        {index + 1}
                      </div>

                      {editingPromptIndex === index ? (
                        <div className="flex-1 space-y-2">
                          <textarea
                            ref={editInputRef}
                            value={editingPromptValue}
                            onChange={(e) => setEditingPromptValue(e.target.value)}
                            className="w-full p-2 text-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/50 resize-none min-h-[80px]"
                            placeholder="Enter prompt..."
                          />
                          <div className="flex items-center gap-2 justify-end">
                            <Button variant="ghost" size="sm" onClick={handleCancelEdit} className="gap-1">
                              <X className="w-3.5 h-3.5" />
                              Cancel
                            </Button>
                            <Button size="sm" onClick={handleSaveEdit} disabled={!editingPromptValue.trim()} className="gap-1">
                              <Check className="w-3.5 h-3.5" />
                              Save
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-sm text-[var(--color-text)] flex-1">{prompt}</p>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              onClick={() => handleStartEdit(index)}
                              className="p-1.5 rounded-lg hover:bg-[var(--color-surface)] text-[var(--color-text-dim)] hover:text-[var(--color-text)] transition-colors"
                              title="Edit prompt"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleRegenerateSingle(index)}
                              disabled={regeneratingIndex === index}
                              className={cn(
                                "p-1.5 rounded-lg transition-colors",
                                regeneratingIndex === index
                                  ? "text-cyan-400"
                                  : "hover:bg-[var(--color-surface)] text-[var(--color-text-dim)] hover:text-cyan-400"
                              )}
                              title="Regenerate prompt"
                            >
                              {regeneratingIndex === index ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                            </button>
                            <button
                              onClick={() => handleDeletePrompt(index)}
                              className="p-1.5 rounded-lg hover:bg-red-500/10 text-[var(--color-text-dim)] hover:text-red-400 transition-colors"
                              title="Delete prompt"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="p-4 border-t border-[var(--color-border)]">
                <p className="text-xs text-[var(--color-text-dim)] text-center mb-3">
                  Click the edit icon to modify a prompt, refresh to regenerate it, or trash to delete it
                </p>
                <Button
                  onClick={() => {
                    setShowAllPrompts(false)
                    handleCancelEdit()
                  }}
                  className="w-full"
                >
                  Done
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}

