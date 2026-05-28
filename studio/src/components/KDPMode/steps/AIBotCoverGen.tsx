// ============================================================
// AI Bot Cover Generation Step - Auto cover prompt generation with optional title/author
// ============================================================

import { useState, useCallback, useEffect, useRef } from "react"
import { 
  Sparkles, 
  CheckCircle, 
  Loader2, 
  AlertCircle, 
  Image as ImageIcon, 
  Wand2, 
  RefreshCw,
  BookOpen,
  User,
  FileText,
  X,
  Check,
  Type,
  Trash2,
  Plus,
  Square,
  RectangleVertical,
  RectangleHorizontal,
  Cpu,
} from "lucide-react"
import { Button } from "../../Button"
import { Card, CardContent } from "../../Card"
import { cn } from "@/lib/utils"
import type { AIBotWizardState, CoverTextElement } from "../KDPAIBotWizard"

// ============================================================
// Constants
// ============================================================

// Available aspect ratios for cover generation
const ASPECT_RATIOS = [
  { 
    id: "9:16", 
    label: "Portrait", 
    description: "9:16 - Tall book covers",
    icon: RectangleVertical,
    dimensions: "1024x1820"
  },
  { 
    id: "2:3", 
    label: "Standard", 
    description: "2:3 - Standard book cover",
    icon: RectangleVertical,
    dimensions: "1024x1536"
  },
  { 
    id: "1:1", 
    label: "Square", 
    description: "1:1 - Square format",
    icon: Square,
    dimensions: "1024x1024"
  },
  { 
    id: "16:9", 
    label: "Landscape", 
    description: "16:9 - Wide format",
    icon: RectangleHorizontal,
    dimensions: "1820x1024"
  },
] as const

// Available AI models for image generation
const IMAGE_MODELS = [
  {
    id: "z-image-turbo-replicate",
    name: "Z-Image Turbo",
    description: "Fast generation, good quality",
    speed: "Fast",
    quality: "Good"
  },
  {
    id: "gemini-3-pro-image-preview",
    name: "Gemini 3 Pro",
    description: "High quality, balanced speed",
    speed: "Medium",
    quality: "High"
  },
  {
    id: "dall-e-3",
    name: "DALL-E 3",
    description: "Premium quality, detailed",
    speed: "Slow",
    quality: "Premium"
  },
  {
    id: "gpt-image-1",
    name: "GPT Image",
    description: "Latest OpenAI model",
    speed: "Medium",
    quality: "High"
  },
] as const

// ============================================================
// Types
// ============================================================

interface AIBotCoverGenProps {
  state: AIBotWizardState
  onUpdate: (updates: Partial<AIBotWizardState>) => void
  onComplete: () => void
  onBack: () => void
}

// ============================================================
// Helper Functions
// ============================================================

/**
 * Generate an auto cover prompt based on interior prompts and metadata
 */
function generateCoverPrompt(state: AIBotWizardState): string {
  const { bookTitle, authorName, subtitle, generatedImages, imageryStyle } = state
  
  // Analyze interior prompts to extract themes
  const interiorPrompts = generatedImages
    .filter(img => img.status === "complete" && img.prompt)
    .map(img => img.prompt)
  
  // Extract common themes from interior prompts (simple heuristic)
  const allWords = interiorPrompts.join(" ").toLowerCase()
  const themes: string[] = []
  
  // Common theme keywords to look for
  const themeKeywords = [
    "forest", "ocean", "space", "animals", "nature", "fantasy", "adventure",
    "magic", "fairy", "dragon", "princess", "castle", "garden", "underwater",
    "jungle", "desert", "mountain", "city", "farm", "dinosaur", "robot",
    "unicorn", "mermaid", "superhero", "monster", "pirate", "cowboy"
  ]
  
  themeKeywords.forEach(keyword => {
    if (allWords.includes(keyword)) {
      themes.push(keyword)
    }
  })
  
  // Build the prompt based on available metadata
  let prompt = ""
  
  const hasMetadata = bookTitle || authorName || subtitle
  
  if (hasMetadata) {
    // Build a prompt with text elements baked in
    prompt = "Professional book cover design"
    
    if (bookTitle) {
      prompt += ` with the title "${bookTitle}" prominently displayed in elegant, readable typography at the top`
    }
    
    if (subtitle) {
      prompt += `, subtitle "${subtitle}" in smaller complementary font below the title`
    }
    
    if (authorName) {
      prompt += `, author name "${authorName}" at the bottom in a refined font`
    }
    
    // Add thematic elements based on interior content
    if (themes.length > 0) {
      const selectedThemes = themes.slice(0, 3).join(", ")
      prompt += `. The cover features stunning artwork incorporating ${selectedThemes} themes`
    } else if (interiorPrompts.length > 0) {
      prompt += `. The cover features beautiful artistic elements that complement the interior content`
    }
    
    prompt += ". High quality, professionally designed book cover with clear, legible text integrated into the design"
  } else {
    // No metadata - generate a clean artistic cover without text
    prompt = "Beautiful artistic book cover design without any text"
    
    if (themes.length > 0) {
      const selectedThemes = themes.slice(0, 3).join(", ")
      prompt += ` featuring stunning ${selectedThemes} themed artwork`
    } else if (interiorPrompts.length > 0) {
      prompt += " with captivating artistic illustration"
    }
    
    prompt += ". Clean, modern cover design with no text or typography, pure visual artwork"
  }
  
  // Add imagery style if selected
  if (imageryStyle?.prompt) {
    prompt += `, ${imageryStyle.prompt}`
  }
  
  // Add quality modifiers
  prompt += ". Professional quality, high resolution, suitable for print"
  
  return prompt
}

// ============================================================
// Component
// ============================================================

export function AIBotCoverGen({ state, onUpdate, onComplete, onBack }: AIBotCoverGenProps) {
  const [showPromptEditor, setShowPromptEditor] = useState(false)
  const [editedPrompt, setEditedPrompt] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)
  const [askGenerate, setAskGenerate] = useState(true) // Initial question state
  
  // Aspect ratio and model selection
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<string>("2:3")
  const [selectedModel, setSelectedModel] = useState<string>("z-image-turbo-replicate")
  
  // Text overlay state
  const [textElements, setTextElements] = useState<CoverTextElement[]>(state.coverTextElements || [])
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [draggedElementInitialPos, setDraggedElementInitialPos] = useState({ x: 0, y: 0 })
  const coverContainerRef = useRef<HTMLDivElement>(null)
  const [showTextControls, setShowTextControls] = useState(true)

  // Initialize cover prompt on mount
  useEffect(() => {
    if (!state.coverPrompt) {
      const autoPrompt = generateCoverPrompt(state)
      onUpdate({ coverPrompt: autoPrompt })
    }
  }, [])

  // Sync text elements with parent wizard state
  useEffect(() => {
    onUpdate({ coverTextElements: textElements })
  }, [textElements])

  // ============================================================
  // Text Overlay Handlers
  // ============================================================

  // Add a new text element
  const handleAddText = useCallback((type: 'title' | 'author' | 'subtitle' | 'custom') => {
    console.log('Adding text element:', type)
    const defaults: Record<string, { y: number; fontSize: number; content: string }> = {
      title: { y: 15, fontSize: 32, content: state.bookTitle || 'Title' },
      author: { y: 85, fontSize: 18, content: state.authorName || 'Author' },
      subtitle: { y: 25, fontSize: 16, content: state.subtitle || 'Subtitle' },
      custom: { y: 50, fontSize: 20, content: 'Custom Text' },
    }

    const config = defaults[type]
    const newElement: CoverTextElement = {
      id: `${type}-${Date.now()}`,
      type,
      content: config.content,
      position: { x: 50, y: config.y },
      style: {
        fontFamily: 'Georgia, serif',
        fontSize: config.fontSize,
        fontWeight: type === 'title' ? 'bold' : 'normal',
        color: '#ffffff',
        textAlign: 'center',
      },
    }

    console.log('New element:', newElement)
    setTextElements(prev => {
      const updated = [...prev, newElement]
      console.log('Updated textElements:', updated)
      return updated
    })
    setSelectedTextId(newElement.id)
  }, [state.bookTitle, state.authorName, state.subtitle])

  // Delete selected text element
  const handleDeleteText = useCallback(() => {
    if (!selectedTextId) return
    setTextElements(prev => prev.filter(el => el.id !== selectedTextId))
    setSelectedTextId(null)
  }, [selectedTextId])

  // Update text element content
  const handleUpdateTextContent = useCallback((id: string, content: string) => {
    setTextElements(prev => prev.map(el => 
      el.id === id ? { ...el, content } : el
    ))
  }, [])

  // Update text element style
  const handleUpdateTextStyle = useCallback((id: string, styleUpdates: Partial<CoverTextElement['style']>) => {
    setTextElements(prev => prev.map(el => 
      el.id === id ? { ...el, style: { ...el.style, ...styleUpdates } } : el
    ))
  }, [])

  // Mouse down handler for dragging
  const handleTextMouseDown = useCallback((e: React.MouseEvent, element: CoverTextElement) => {
    e.preventDefault()
    e.stopPropagation()
    setSelectedTextId(element.id)
    setIsDragging(true)
    setDragStart({ x: e.clientX, y: e.clientY })
    setDraggedElementInitialPos({ x: element.position.x, y: element.position.y })
  }, [])

  // Mouse move handler for dragging
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || !selectedTextId || !coverContainerRef.current) return

    const container = coverContainerRef.current
    const rect = container.getBoundingClientRect()
    
    // Calculate delta as percentage of container
    const deltaX = ((e.clientX - dragStart.x) / rect.width) * 100
    const deltaY = ((e.clientY - dragStart.y) / rect.height) * 100
    
    // Calculate new position
    const newX = Math.max(0, Math.min(100, draggedElementInitialPos.x + deltaX))
    const newY = Math.max(0, Math.min(100, draggedElementInitialPos.y + deltaY))
    
    setTextElements(prev => prev.map(el => 
      el.id === selectedTextId 
        ? { ...el, position: { x: newX, y: newY } }
        : el
    ))
  }, [isDragging, selectedTextId, dragStart, draggedElementInitialPos])

  // Mouse up handler to stop dragging
  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  // Handle click on container (deselect text)
  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    // Only deselect if clicking directly on the container, not on a text element
    if (e.target === e.currentTarget) {
      setSelectedTextId(null)
    }
  }, [])

  // Get selected text element
  const selectedElement = textElements.find(el => el.id === selectedTextId)

  // Get image size based on aspect ratio
  const getImageSize = useCallback((ratio: string): string => {
    const ratioConfig = ASPECT_RATIOS.find(r => r.id === ratio)
    return ratioConfig?.dimensions || "1024x1536"
  }, [])

  // Generate cover image
  const handleGenerateCover = useCallback(async () => {
    setAskGenerate(false)
    setIsGenerating(true)
    onUpdate({ coverStatus: "generating" })

    try {
      // Build enhanced prompt with imagery style
      let enhancedPrompt = state.coverPrompt
      if (state.imageryStyle?.prompt && !enhancedPrompt.includes(state.imageryStyle.prompt)) {
        enhancedPrompt = `${enhancedPrompt}, ${state.imageryStyle.prompt}`
      }

      // Call image generation API with selected model and aspect ratio
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: enhancedPrompt,
          model: selectedModel,
          aspectRatio: selectedAspectRatio,
          imageSize: getImageSize(selectedAspectRatio),
        }),
      })

      if (!response.ok) {
        throw new Error(`Failed to generate cover: ${response.statusText}`)
      }

      const data = await response.json()
      const imageUrl = data.imageUrl

      onUpdate({ 
        coverImageUrl: imageUrl,
        coverStatus: "complete" 
      })
    } catch (error) {
      console.error("Error generating cover:", error)
      onUpdate({ coverStatus: "error" })
    } finally {
      setIsGenerating(false)
    }
  }, [state.coverPrompt, state.imageryStyle, onUpdate, selectedModel, selectedAspectRatio, getImageSize])

  // Regenerate cover with same or edited prompt
  const handleRegenerate = useCallback(async () => {
    onUpdate({ coverStatus: "idle", coverImageUrl: undefined })
    await handleGenerateCover()
  }, [handleGenerateCover, onUpdate])

  // Skip cover generation
  const handleSkipCover = useCallback(() => {
    setAskGenerate(false)
    onUpdate({ coverStatus: "complete" }) // Mark as complete even without generating
    onComplete()
  }, [onUpdate, onComplete])

  // Update prompt and regenerate
  const handleUpdatePrompt = useCallback((newPrompt: string) => {
    onUpdate({ coverPrompt: newPrompt })
    setEditedPrompt(newPrompt)
  }, [onUpdate])

  // Save edited prompt
  const handleSavePrompt = useCallback(() => {
    if (editedPrompt.trim()) {
      onUpdate({ coverPrompt: editedPrompt.trim() })
    }
    setShowPromptEditor(false)
  }, [editedPrompt, onUpdate])

  // Open prompt editor
  const handleEditPrompt = useCallback(() => {
    setEditedPrompt(state.coverPrompt)
    setShowPromptEditor(true)
  }, [state.coverPrompt])

  // Reset prompt to auto-generated
  const handleResetPrompt = useCallback(() => {
    const autoPrompt = generateCoverPrompt(state)
    onUpdate({ coverPrompt: autoPrompt })
    setEditedPrompt(autoPrompt)
  }, [state, onUpdate])

  // Metadata summary for display
  const hasTitle = !!state.bookTitle.trim()
  const hasAuthor = !!state.authorName.trim()
  const hasSubtitle = !!state.subtitle.trim()
  const hasMetadata = hasTitle || hasAuthor || hasSubtitle

  // Render initial question
  if (askGenerate) {
    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="p-4 bg-purple-500/10 border-b border-purple-500/30">
          <div className="flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-sm font-medium text-purple-400 mb-1">
                Cover Generation
              </h4>
              <p className="text-sm text-[var(--color-text-muted)]">
                Generate a professional book cover with AI.
              </p>
            </div>
          </div>
        </div>

        {/* Question Card */}
        <div className="flex-1 p-6 flex items-center justify-center">
          <Card className="max-w-md w-full">
            <CardContent className="py-8 px-6 text-center">
              <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <BookOpen className="w-8 h-8 text-white" />
              </div>
              
              <h3 className="text-xl font-bold text-[var(--color-text)] mb-2">
                Generate a Book Cover?
              </h3>
              
              <p className="text-sm text-[var(--color-text-muted)] mb-6">
                AI will create a cover based on your book's interior content
                {hasMetadata && " and metadata"}.
              </p>

              {/* Metadata Preview */}
              {hasMetadata && (
                <div className="p-4 rounded-xl bg-[var(--color-background)] mb-6 text-left space-y-2">
                  {hasTitle && (
                    <div className="flex items-center gap-2 text-sm">
                      <BookOpen className="w-4 h-4 text-[var(--color-primary)]" />
                      <span className="text-[var(--color-text-muted)]">Title:</span>
                      <span className="font-medium text-[var(--color-text)]">{state.bookTitle}</span>
                    </div>
                  )}
                  {hasSubtitle && (
                    <div className="flex items-center gap-2 text-sm">
                      <FileText className="w-4 h-4 text-[var(--color-primary)]" />
                      <span className="text-[var(--color-text-muted)]">Subtitle:</span>
                      <span className="font-medium text-[var(--color-text)]">{state.subtitle}</span>
                    </div>
                  )}
                  {hasAuthor && (
                    <div className="flex items-center gap-2 text-sm">
                      <User className="w-4 h-4 text-[var(--color-primary)]" />
                      <span className="text-[var(--color-text-muted)]">Author:</span>
                      <span className="font-medium text-[var(--color-text)]">{state.authorName}</span>
                    </div>
                  )}
                </div>
              )}

              {!hasMetadata && (
                <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/30 mb-6 text-left">
                  <p className="text-sm text-yellow-400">
                    No title or author provided. The cover will be a clean artistic design without text.
                  </p>
                </div>
              )}

              {/* Aspect Ratio Selection */}
              <div className="mb-6">
                <label className="text-sm font-medium text-[var(--color-text)] block mb-3 text-left">
                  Cover Dimensions
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {ASPECT_RATIOS.map((ratio) => {
                    const Icon = ratio.icon
                    return (
                      <button
                        key={ratio.id}
                        onClick={() => setSelectedAspectRatio(ratio.id)}
                        className={cn(
                          "flex flex-col items-center p-3 rounded-xl border-2 transition-all",
                          selectedAspectRatio === ratio.id
                            ? "border-purple-500 bg-purple-500/10"
                            : "border-[var(--color-border)] bg-[var(--color-background)] hover:border-[var(--color-border-bright)]"
                        )}
                      >
                        <Icon className={cn(
                          "w-6 h-6 mb-1",
                          selectedAspectRatio === ratio.id ? "text-purple-400" : "text-[var(--color-text-dim)]"
                        )} />
                        <span className={cn(
                          "text-xs font-medium",
                          selectedAspectRatio === ratio.id ? "text-purple-400" : "text-[var(--color-text)]"
                        )}>
                          {ratio.label}
                        </span>
                        <span className="text-[10px] text-[var(--color-text-dim)]">
                          {ratio.id}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* AI Model Selection */}
              <div className="mb-6">
                <label className="text-sm font-medium text-[var(--color-text)] block mb-3 text-left">
                  AI Model
                </label>
                <div className="space-y-2">
                  {IMAGE_MODELS.map((model) => (
                    <button
                      key={model.id}
                      onClick={() => setSelectedModel(model.id)}
                      className={cn(
                        "w-full flex items-center justify-between p-3 rounded-xl border-2 transition-all text-left",
                        selectedModel === model.id
                          ? "border-purple-500 bg-purple-500/10"
                          : "border-[var(--color-border)] bg-[var(--color-background)] hover:border-[var(--color-border-bright)]"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <Cpu className={cn(
                          "w-5 h-5",
                          selectedModel === model.id ? "text-purple-400" : "text-[var(--color-text-dim)]"
                        )} />
                        <div>
                          <div className={cn(
                            "text-sm font-medium",
                            selectedModel === model.id ? "text-purple-400" : "text-[var(--color-text)]"
                          )}>
                            {model.name}
                          </div>
                          <div className="text-xs text-[var(--color-text-dim)]">
                            {model.description}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "text-xs px-2 py-0.5 rounded-full",
                          model.speed === "Fast" 
                            ? "bg-green-500/20 text-green-400"
                            : model.speed === "Medium"
                            ? "bg-yellow-500/20 text-yellow-400"
                            : "bg-orange-500/20 text-orange-400"
                        )}>
                          {model.speed}
                        </span>
                        <span className={cn(
                          "text-xs px-2 py-0.5 rounded-full",
                          model.quality === "Premium"
                            ? "bg-purple-500/20 text-purple-400"
                            : model.quality === "High"
                            ? "bg-blue-500/20 text-blue-400"
                            : "bg-gray-500/20 text-gray-400"
                        )}>
                          {model.quality}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={handleSkipCover}
                  className="flex-1"
                >
                  <X className="w-4 h-4 mr-2" />
                  Skip
                </Button>
                <Button
                  onClick={handleGenerateCover}
                  className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                >
                  <Wand2 className="w-4 h-4 mr-2" />
                  Generate Cover
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  // Render generation/result view
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 bg-purple-500/10 border-b border-purple-500/30">
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-sm font-medium text-purple-400 mb-1">
              Cover Generation
            </h4>
            <p className="text-sm text-[var(--color-text-muted)]">
              {isGenerating 
                ? "Generating your book cover..."
                : state.coverStatus === "complete" && state.coverImageUrl
                ? "Your cover is ready!"
                : state.coverStatus === "error"
                ? "There was an error generating your cover."
                : "Preview and generate your book cover."}
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Cover Prompt Card */}
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center justify-between mb-3">
                <h5 className="text-sm font-semibold text-[var(--color-text)]">
                  Cover Prompt
                </h5>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleResetPrompt}
                    className="text-xs"
                  >
                    <RefreshCw className="w-3 h-3 mr-1" />
                    Auto
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleEditPrompt}
                    className="text-xs"
                  >
                    Edit
                  </Button>
                </div>
              </div>
              
              <p className="text-sm text-[var(--color-text-muted)] bg-[var(--color-background)] p-3 rounded-lg">
                {state.coverPrompt || "No prompt generated yet."}
              </p>
            </CardContent>
          </Card>

          {/* Generation Settings Card */}
          <Card>
            <CardContent className="py-4">
              <h5 className="text-sm font-semibold text-[var(--color-text)] mb-3">
                Generation Settings
              </h5>
              
              <div className="grid grid-cols-2 gap-4">
                {/* Aspect Ratio */}
                <div>
                  <label className="text-xs text-[var(--color-text-muted)] block mb-2">
                    Aspect Ratio
                  </label>
                  <div className="flex gap-1">
                    {ASPECT_RATIOS.map((ratio) => {
                      const Icon = ratio.icon
                      return (
                        <button
                          key={ratio.id}
                          onClick={() => setSelectedAspectRatio(ratio.id)}
                          title={ratio.description}
                          className={cn(
                            "flex-1 flex flex-col items-center p-2 rounded-lg border transition-all",
                            selectedAspectRatio === ratio.id
                              ? "border-purple-500 bg-purple-500/10"
                              : "border-[var(--color-border)] hover:border-[var(--color-border-bright)]"
                          )}
                        >
                          <Icon className={cn(
                            "w-4 h-4",
                            selectedAspectRatio === ratio.id ? "text-purple-400" : "text-[var(--color-text-dim)]"
                          )} />
                          <span className="text-[10px] mt-1 text-[var(--color-text-dim)]">
                            {ratio.id}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* AI Model */}
                <div>
                  <label className="text-xs text-[var(--color-text-muted)] block mb-2">
                    AI Model
                  </label>
                  <select
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg text-sm text-[var(--color-text)] focus:outline-none focus:border-purple-500"
                  >
                    {IMAGE_MODELS.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name} ({model.speed})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Cover Preview */}
          <div 
            ref={coverContainerRef}
            className="relative aspect-[2/3] max-w-md mx-auto rounded-2xl border-2 border-[var(--color-border)] bg-[var(--color-background)]"
            style={{ overflow: 'visible' }}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onClick={handleContainerClick}
          >
            {/* Inner container for clipping the image only */}
            <div className="absolute inset-0 rounded-2xl overflow-hidden">
              {/* Generating State */}
              {isGenerating && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-[var(--color-background)] z-0">
                  <Loader2 className="w-12 h-12 text-purple-400 animate-spin mb-4" />
                  <p className="text-sm text-[var(--color-text-muted)]">
                    Generating your cover...
                  </p>
                </div>
              )}

              {/* Generated Cover */}
              {!isGenerating && state.coverImageUrl && (
                <img
                  src={state.coverImageUrl}
                  alt="Generated book cover"
                  className="w-full h-full object-cover"
                />
              )}

              {/* Error State */}
              {!isGenerating && state.coverStatus === "error" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-500/10">
                  <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
                  <p className="text-sm text-red-400 mb-4">
                    Failed to generate cover
                  </p>
                  <Button
                    onClick={handleRegenerate}
                    variant="outline"
                    className="border-red-500/50 text-red-400 hover:bg-red-500/10"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Try Again
                  </Button>
                </div>
              )}

              {/* Idle State */}
              {!isGenerating && !state.coverImageUrl && state.coverStatus !== "error" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <ImageIcon className="w-12 h-12 text-[var(--color-text-dim)] mb-4" />
                  <p className="text-sm text-[var(--color-text-muted)]">
                    Cover preview will appear here
                  </p>
                </div>
              )}
            </div>

            {/* Debug: Show text elements count */}
            {textElements.length > 0 && (
              <div className="absolute top-2 left-2 bg-blue-500 text-white text-xs px-2 py-1 rounded z-50">
                {textElements.length} text(s)
              </div>
            )}

            {/* Draggable Text Overlays - rendered outside the clipped container */}
            {textElements.map(element => {
              console.log('Rendering text element:', element.id, element.content, element.position)
              return (
                <div
                  key={element.id}
                  className={cn(
                    "absolute cursor-move select-none transition-shadow rounded",
                    selectedTextId === element.id 
                      ? "ring-2 ring-purple-400 ring-offset-2 ring-offset-transparent" 
                      : "hover:ring-2 hover:ring-purple-400/50"
                  )}
                  style={{
                    left: `${element.position.x}%`,
                    top: `${element.position.y}%`,
                    transform: 'translate(-50%, -50%)',
                    fontFamily: element.style.fontFamily,
                    fontSize: `${element.style.fontSize}px`,
                    fontWeight: element.style.fontWeight,
                    color: element.style.color,
                    textAlign: element.style.textAlign as React.CSSProperties['textAlign'],
                    textShadow: '2px 2px 4px rgba(0,0,0,0.8), -1px -1px 2px rgba(0,0,0,0.5)',
                    padding: '8px 12px',
                    whiteSpace: 'nowrap',
                    zIndex: selectedTextId === element.id ? 50 : 40,
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    border: '2px solid rgba(255,255,255,0.5)',
                    borderRadius: '4px',
                  }}
                  onMouseDown={(e) => handleTextMouseDown(e, element)}
                >
                  {element.content}
                </div>
              )
            })}

            {/* Success Badge */}
            {state.coverStatus === "complete" && state.coverImageUrl && (
              <div className="absolute top-4 right-4 w-8 h-8 rounded-full bg-green-500 flex items-center justify-center shadow-lg z-30">
                <CheckCircle className="w-5 h-5 text-white" />
              </div>
            )}
          </div>

          {/* Text Overlay Controls - always available */}
          <Card className="mt-4">
              <CardContent className="py-4">
                <div className="flex items-center justify-between mb-3">
                  <h5 className="text-sm font-semibold text-[var(--color-text)] flex items-center gap-2">
                    <Type className="w-4 h-4" />
                    Text Overlays
                  </h5>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowTextControls(!showTextControls)}
                    className="text-xs"
                  >
                    {showTextControls ? "Hide" : "Show"} Controls
                  </Button>
                </div>

                {showTextControls && (
                  <div className="space-y-4">
                    {/* Add Text Buttons */}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAddText('title')}
                        className="text-xs"
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        Title
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAddText('author')}
                        className="text-xs"
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        Author
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAddText('subtitle')}
                        className="text-xs"
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        Subtitle
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleAddText('custom')}
                        className="text-xs"
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        Custom
                      </Button>
                    </div>

                    {/* Selected Text Controls */}
                    {selectedElement && (
                      <div className="p-3 rounded-lg bg-[var(--color-background)] space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-[var(--color-text-muted)] uppercase">
                            Selected: {selectedElement.type}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleDeleteText}
                            className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-7 px-2"
                          >
                            <Trash2 className="w-3 h-3 mr-1" />
                            Delete
                          </Button>
                        </div>

                        {/* Content Editor */}
                        <div>
                          <label className="text-xs text-[var(--color-text-muted)] block mb-1">
                            Text Content
                          </label>
                          <input
                            type="text"
                            value={selectedElement.content}
                            onChange={(e) => handleUpdateTextContent(selectedElement.id, e.target.value)}
                            className="w-full px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary)]"
                          />
                        </div>

                        {/* Style Controls */}
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="text-xs text-[var(--color-text-muted)] block mb-1">
                              Size
                            </label>
                            <input
                              type="number"
                              value={selectedElement.style.fontSize}
                              onChange={(e) => handleUpdateTextStyle(selectedElement.id, { fontSize: Number(e.target.value) })}
                              min={8}
                              max={72}
                              className="w-full px-2 py-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary)]"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-[var(--color-text-muted)] block mb-1">
                              Weight
                            </label>
                            <select
                              value={selectedElement.style.fontWeight}
                              onChange={(e) => handleUpdateTextStyle(selectedElement.id, { fontWeight: e.target.value as 'normal' | 'bold' })}
                              className="w-full px-2 py-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary)]"
                            >
                              <option value="normal">Normal</option>
                              <option value="bold">Bold</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-xs text-[var(--color-text-muted)] block mb-1">
                              Color
                            </label>
                            <input
                              type="color"
                              value={selectedElement.style.color}
                              onChange={(e) => handleUpdateTextStyle(selectedElement.id, { color: e.target.value })}
                              className="w-full h-7 bg-[var(--color-surface)] border border-[var(--color-border)] rounded cursor-pointer"
                            />
                          </div>
                        </div>

                        {/* Font Family */}
                        <div>
                          <label className="text-xs text-[var(--color-text-muted)] block mb-1">
                            Font
                          </label>
                          <select
                            value={selectedElement.style.fontFamily}
                            onChange={(e) => handleUpdateTextStyle(selectedElement.id, { fontFamily: e.target.value })}
                            className="w-full px-2 py-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary)]"
                          >
                            <option value="Georgia, serif">Georgia (Serif)</option>
                            <option value="'Times New Roman', serif">Times New Roman</option>
                            <option value="Arial, sans-serif">Arial</option>
                            <option value="'Helvetica Neue', sans-serif">Helvetica</option>
                            <option value="'Palatino Linotype', serif">Palatino</option>
                            <option value="'Book Antiqua', serif">Book Antiqua</option>
                            <option value="'Courier New', monospace">Courier New</option>
                            <option value="Impact, sans-serif">Impact</option>
                          </select>
                        </div>

                        {/* Text Align */}
                        <div>
                          <label className="text-xs text-[var(--color-text-muted)] block mb-1">
                            Alignment
                          </label>
                          <div className="flex gap-1">
                            {(['left', 'center', 'right'] as const).map(align => (
                              <Button
                                key={align}
                                variant={selectedElement.style.textAlign === align ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => handleUpdateTextStyle(selectedElement.id, { textAlign: align })}
                                className="flex-1 text-xs capitalize"
                              >
                                {align}
                              </Button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Text Elements List */}
                    {textElements.length > 0 && (
                      <div className="space-y-1">
                        <label className="text-xs text-[var(--color-text-muted)] block">
                          Text Layers ({textElements.length})
                        </label>
                        <div className="space-y-1">
                          {textElements.map(el => (
                            <div
                              key={el.id}
                              onClick={() => setSelectedTextId(el.id)}
                              className={cn(
                                "flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors",
                                selectedTextId === el.id 
                                  ? "bg-purple-500/20 border border-purple-500/50" 
                                  : "bg-[var(--color-surface)] border border-transparent hover:border-[var(--color-border)]"
                              )}
                            >
                              <span className="text-sm text-[var(--color-text)] truncate flex-1">
                                {el.content}
                              </span>
                              <span className="text-xs text-[var(--color-text-dim)] ml-2 capitalize">
                                {el.type}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {textElements.length === 0 && (
                      <p className="text-xs text-[var(--color-text-muted)] text-center py-2">
                        No text overlays. Click a button above to add text.
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

          {/* Action Buttons */}
          {!isGenerating && (
            <div className="flex justify-center gap-3">
              {state.coverImageUrl && (
                <Button
                  variant="outline"
                  onClick={handleRegenerate}
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Regenerate
                </Button>
              )}
              
              {!state.coverImageUrl && state.coverStatus !== "error" && (
                <Button
                  onClick={handleGenerateCover}
                  className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                >
                  <Wand2 className="w-4 h-4 mr-2" />
                  Generate Cover
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      {!isGenerating && (
        <div className="p-4 border-t border-[var(--color-border)] flex items-center justify-between">
          <Button variant="ghost" onClick={onBack}>
            Back
          </Button>
          
          <Button
            onClick={onComplete}
            disabled={state.coverStatus !== "complete"}
            className={cn(
              "gap-2",
              state.coverStatus === "complete" && state.coverImageUrl
                ? "bg-green-500 hover:bg-green-600"
                : ""
            )}
          >
            <Check className="w-4 h-4" />
            Finish
          </Button>
        </div>
      )}

      {/* Prompt Editor Modal */}
      {showPromptEditor && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div 
            className="w-full max-w-lg bg-[var(--color-surface)] rounded-2xl shadow-2xl border border-[var(--color-border)] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between">
              <h3 className="text-lg font-bold text-[var(--color-text)]">
                Edit Cover Prompt
              </h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowPromptEditor(false)}
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
            
            <div className="p-4">
              <textarea
                value={editedPrompt}
                onChange={(e) => setEditedPrompt(e.target.value)}
                rows={8}
                className="w-full px-4 py-3 bg-[var(--color-background)] border-2 border-[var(--color-border)] rounded-xl text-[var(--color-text)] placeholder-[var(--color-text-dim)] focus:outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20 resize-none"
                placeholder="Enter your custom cover prompt..."
              />
              
              <div className="flex gap-3 mt-4">
                <Button
                  variant="outline"
                  onClick={handleResetPrompt}
                  className="flex-1"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Reset to Auto
                </Button>
                <Button
                  onClick={handleSavePrompt}
                  className="flex-1"
                >
                  Save Prompt
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
