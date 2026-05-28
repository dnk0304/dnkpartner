import { useState, useCallback, useRef, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { Plus, Play, Square, Sparkles, Zap, RotateCcw, Settings, Trash2, Download, X, MessageSquare, ChevronDown, ChevronUp, Upload } from "lucide-react"
import { Button } from "./components/Button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./components/Card"
import { PromptCard, PromptItem, PromptStatus } from "./components/PromptCard"
import { Select } from "./components/Select"
import { Layout } from "./components/Layout"
import { AdvancedModeLayout } from "./components/AdvancedModeLayout"
import { Rescaler } from "./components/Rescaler"
import { KDPMode } from "./components/KDPMode"
import { CostSummary, UsageEntry } from "./components/CostSummary"
import { InlineChat } from "./components/InlineChat"
import { ImageryStylePicker } from "./components/ImageryStylePicker"
import { StoryBaseManager } from "./components/StoryBaseManager"
import { ImageTransferDialog } from "./components/ImageTransferDialog"
import { FogBackground } from "./components/FogBackground"
import { HeroBanner } from "./components/HeroBanner"
import { StudioModePanel } from "./components/StudioModePanel"
import { CharacterDisplay } from "./components/CharacterDisplay"
import { AutopilotMode } from "./components/AutopilotMode"
import { AspectRatioSelector } from "./components/AspectRatioSelector"
import { cn } from "./lib/utils"
import { StudioModeType, ImageryStyle, StoryBase, IMAGERY_STYLE_PRESETS } from "./types/StudioMode"
import {
  AI_MODELS,
  ASPECT_RATIOS,
  IMAGE_SIZES,
  VIDEO_MODELS,
  VIDEO_QUALITIES,
  VIDEO_FPS_OPTIONS,
  VIDEO_ASPECT_RATIOS,
  VIDEO_ASPECT_RATIOS_SORA,
  getImageModelPrice,
  getVideoModelPrice,
  calculateTotalEstimatedCost,
  VideoAspectRatio,
} from "./constants/models"
import { VideoInputMode } from "./components/PromptCard"

type GenerationMode = "image" | "video" | "rescaler" | "kdp" | "autopilot"
type ViewMode = "simple" | "advanced"

function generateId() {
  return Math.random().toString(36).substring(2, 9)
}

function App() {
  // Navigation
  const navigate = useNavigate()
  
  // Core state
  const [mode, setMode] = useState<GenerationMode>("image")
  const [viewMode, setViewMode] = useState<ViewMode>("simple")
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  
  // Prompts state
  const [prompts, setPrompts] = useState<PromptItem[]>([
    { id: generateId(), prompt: "", status: "idle" },
    { id: generateId(), prompt: "", status: "idle" },
    { id: generateId(), prompt: "", status: "idle" },
  ])
  const [isRunning, setIsRunning] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  
  // Image settings
  const [aiModel, setAiModel] = useState("z-image-turbo-replicate")
  const [aspectRatio, setAspectRatio] = useState("1:1")
  const [imageSize, setImageSize] = useState("1K")
  
  // Log aspect ratio changes
  useEffect(() => {
    console.log('[App] aspectRatio state changed to:', aspectRatio)
  }, [aspectRatio])
  
  // Video settings
  const [videoModel, setVideoModel] = useState("veo-3.1")
  const [videoDuration, setVideoDuration] = useState(4)
  const [videoQuality, setVideoQuality] = useState("standard")
  const [videoFPS, setVideoFPS] = useState(24)
  const [videoMotionStrength, setVideoMotionStrength] = useState(0.5)
  
  // Video-specific per-prompt handlers
  // Handler for changing video input mode (text-to-video, image-to-video, frames-to-video)
  const handleVideoInputModeChange = useCallback((id: string, inputMode: VideoInputMode) => {
    setPrompts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, videoInputMode: inputMode } : p))
    )
  }, [])

  // Handler for changing reference images (Veo supports up to 3)
  const handleReferenceImagesChange = useCallback((id: string, images: string[], names: string[]) => {
    setPrompts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, referenceImages: images, referenceImageNames: names } : p))
    )
  }, [])

  // Handler for changing style image (Veo)
  const handleStyleImageChange = useCallback((id: string, image: string | undefined, name: string | undefined) => {
    setPrompts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, styleImage: image, styleImageName: name } : p))
    )
  }, [])

  // Handler for changing first frame (frames-to-video for Veo)
  const handleFirstFrameChange = useCallback((id: string, image: string | undefined, name: string | undefined) => {
    setPrompts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, firstFrame: image, firstFrameName: name } : p))
    )
  }, [])

  // Handler for changing last frame (frames-to-video for Veo)
  const handleLastFrameChange = useCallback((id: string, image: string | undefined, name: string | undefined) => {
    setPrompts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, lastFrame: image, lastFrameName: name } : p))
    )
  }, [])

  // Handler for per-prompt video aspect ratio
  const handleVideoAspectRatioChange = useCallback((id: string, ratio: string) => {
    setPrompts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, videoAspectRatio: ratio } : p))
    )
  }, [])

  // Handler for per-prompt video duration
  const handleVideoDurationChange = useCallback((id: string, duration: number) => {
    setPrompts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, videoDuration: duration } : p))
    )
  }, [])

  // Get video aspect ratios based on model (Sora 2 supports 1:1, Veo only 16:9 and 9:16)
  const getVideoAspectRatios = useCallback((model: string): VideoAspectRatio[] => {
    if (model === "sora-2") {
      return VIDEO_ASPECT_RATIOS_SORA
    }
    return VIDEO_ASPECT_RATIOS
  }, [])

  // Get allowed durations based on model
  const getAllowedDurations = useCallback((model: string): number[] => {
    if (model === "sora-2") {
      return [4, 8, 12] // Sora 2: 4, 8, 12 seconds
    }
    // Veo models: 4, 6, 8 seconds
    return [4, 6, 8]
  }, [])

  // Legacy reference image handler for image mode and single image video modes
  const handleReferenceImageChange = useCallback((id: string, imageBase64: string | undefined, imageName: string | undefined) => {
    setPrompts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, referenceImage: imageBase64, referenceImageName: imageName } : p))
    )
  }, [])
  
  // Studio mode
  const [studioMode, setStudioMode] = useState<StudioModeType>("off")
  const [selectedImageryStyle, setSelectedImageryStyle] = useState<ImageryStyle | null>(null)
  const [activeStoryBase, setActiveStoryBase] = useState<StoryBase | null>(null)
  
  // Available imagery styles for chat selector
  const availableImageryStyles: ImageryStyle[] = IMAGERY_STYLE_PRESETS.map((preset, index) => ({
    ...preset,
    id: `preset-${index}`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }))
  
  // UI state
  const [isCostSummaryOpen, setIsCostSummaryOpen] = useState(false)
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [isStylePickerOpen, setIsStylePickerOpen] = useState(false)
  const [isStoryBaseManagerOpen, setIsStoryBaseManagerOpen] = useState(false)
  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false)
  const [avatarGridColumns, setAvatarGridColumns] = useState(3)
  const [isImageSettingsExpanded, setIsImageSettingsExpanded] = useState(true)
  
  // Usage tracking
  const [usageEntries, setUsageEntries] = useState<UsageEntry[]>([])
  const [usageSummary, setUsageSummary] = useState({ today: "$0.00", total: "$0.00" })

  // Fetch usage summary from server on mount and periodically
  useEffect(() => {
    const fetchUsageSummary = async () => {
      try {
        const [todayRes, allRes] = await Promise.all([
          fetch("/api/usage/summary?period=today"),
          fetch("/api/usage/summary?period=all")
        ])
        
        if (todayRes.ok && allRes.ok) {
          const todayData = await todayRes.json()
          const allData = await allRes.json()
          
          setUsageSummary({
            today: `$${todayData.totalCost.toFixed(2)}`,
            total: `$${allData.totalCost.toFixed(2)}`
          })
        }
      } catch (error) {
        console.error("Failed to fetch usage summary:", error)
      }
    }
    
    // Fetch immediately and then every 30 seconds
    fetchUsageSummary()
    const interval = setInterval(fetchUsageSummary, 30000)
    return () => clearInterval(interval)
  }, [])

  // Prompt management
  const addPrompt = useCallback(() => {
    if (prompts.length >= 200) return
    setPrompts((prev) => [
      ...prev,
      { id: generateId(), prompt: "", status: "idle" },
    ])
  }, [prompts.length])

  const addMultiplePrompts = useCallback((count: number) => {
    const remaining = 200 - prompts.length
    const toAdd = Math.min(count, remaining)
    const newPrompts = Array.from({ length: toAdd }, () => ({
      id: generateId(),
      prompt: "",
      status: "idle" as PromptStatus,
    }))
    setPrompts((prev) => [...prev, ...newPrompts])
  }, [prompts.length])

  const deletePrompt = useCallback((id: string) => {
    setPrompts((prev) => prev.filter((p) => p.id !== id))
  }, [])

  const deleteAllPrompts = useCallback(() => {
    setPrompts([{ id: generateId(), prompt: "", status: "idle" }])
  }, [])

  const updatePrompt = useCallback((id: string, prompt: string) => {
    setPrompts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, prompt } : p))
    )
  }, [])

  const updatePromptStatus = useCallback(
    (id: string, updates: Partial<PromptItem>) => {
      setPrompts((prev) =>
        prev.map((p) => (p.id === id ? { ...p, ...updates } : p))
      )
    },
    []
  )

  // Build enhanced prompt with studio mode
  const buildEnhancedPrompt = useCallback((basePrompt: string) => {
    console.log('[Studio Mode Debug] buildEnhancedPrompt called with:', {
      studioMode,
      hasSelectedImageryStyle: !!selectedImageryStyle,
      selectedImageryStyleName: selectedImageryStyle?.name,
      hasActiveStoryBase: !!activeStoryBase,
      activeStoryBaseName: activeStoryBase?.name,
    })
    
    if (studioMode === "off") {
      console.log('[Studio Mode Debug] Studio mode is OFF, using base prompt')
      return basePrompt
    }
    
    let enhanced = basePrompt
    
    if (studioMode === "simple" && selectedImageryStyle) {
      enhanced = `${basePrompt}, ${selectedImageryStyle.prompt}`
      console.log('[Studio Mode Debug] Simple mode enhanced with style:', selectedImageryStyle.name)
    } else if (studioMode === "advanced") {
      // Add story base context and/or imagery style
      const contextParts: string[] = []
      
      // Use story base's imagery style if available, otherwise use selected imagery style
      if (activeStoryBase?.imageryStyle) {
        contextParts.push(activeStoryBase.imageryStyle.prompt)
        console.log('[Studio Mode Debug] Using story base imagery style')
      } else if (selectedImageryStyle) {
        contextParts.push(selectedImageryStyle.prompt)
        console.log('[Studio Mode Debug] Using selected imagery style')
      }
      
      if (contextParts.length > 0) {
        enhanced = `${basePrompt}, ${contextParts.join(", ")}`
      }
      console.log('[Studio Mode Debug] Advanced mode enhanced, parts count:', contextParts.length)
    }
    
    console.log('[Studio Mode Debug] Final enhanced prompt length:', enhanced.length)
    return enhanced
  }, [studioMode, selectedImageryStyle, activeStoryBase])

  // Process queue with parallel batch generation
  const processQueue = useCallback(async () => {
    const validPrompts = prompts.filter((p) => p.prompt.trim())
    if (validPrompts.length === 0) return

    setIsRunning(true)
    abortControllerRef.current = new AbortController()

    // Mark all valid prompts as queued
    setPrompts((prev) =>
      prev.map((p) =>
        p.prompt.trim() ? { ...p, status: "queued" as PromptStatus } : p
      )
    )

    // Batch size for parallel processing
    const BATCH_SIZE = 5
    
    // Helper function to generate a single image
    const generateSingleImage = async (prompt: PromptItem) => {
      if (abortControllerRef.current?.signal.aborted) return
      
      updatePromptStatus(prompt.id, { status: "processing" })

      try {
        const enhancedPrompt = buildEnhancedPrompt(prompt.prompt)
        
        console.log('[App] About to send API request with aspectRatio:', aspectRatio)
        console.log('[App] Studio Mode API Debug:', {
          studioMode,
          hasStoryBase: !!(studioMode === "advanced" && activeStoryBase),
          storyBaseName: activeStoryBase?.name,
          hasImageryStyle: !!selectedImageryStyle,
          imageryStyleName: selectedImageryStyle?.name,
          willSendStoryBase: studioMode === "advanced" ? !!activeStoryBase : false,
          willSendImageryStyle: !!selectedImageryStyle,
        })
        
        const response = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            prompt: enhancedPrompt,
            aspectRatio,
            imageSize,
            model: aiModel,
            referenceImage: prompt.referenceImage,
            storyBase: studioMode === "advanced" ? activeStoryBase : undefined,
            imageryStyle: selectedImageryStyle || undefined,
          }),
          signal: abortControllerRef.current?.signal,
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.message || "Failed to generate image")
        }

        const data = await response.json()
        updatePromptStatus(prompt.id, {
          status: "completed",
          imageUrl: data.imageUrl,
          fileName: data.fileName,
        })
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          updatePromptStatus(prompt.id, { status: "idle" })
        } else {
          updatePromptStatus(prompt.id, {
            status: "error",
            error: err instanceof Error ? err.message : "Unknown error",
          })
        }
      }
    }
    
    // Process in batches of 5
    for (let i = 0; i < validPrompts.length; i += BATCH_SIZE) {
      if (abortControllerRef.current?.signal.aborted) break
      
      const batch = validPrompts.slice(i, i + BATCH_SIZE)
      console.log(`[App] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} prompts`)
      
      // Process batch in parallel
      await Promise.all(batch.map(prompt => generateSingleImage(prompt)))
    }

    setIsRunning(false)
    abortControllerRef.current = null
  }, [prompts, aspectRatio, imageSize, aiModel, buildEnhancedPrompt, updatePromptStatus, studioMode, selectedImageryStyle, activeStoryBase])

  const stopQueue = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      setIsRunning(false)
      setPrompts((prev) =>
        prev.map((p) =>
          p.status === "queued" ? { ...p, status: "idle" as PromptStatus } : p
        )
      )
    }
  }, [])

  const resetAll = useCallback(() => {
    setPrompts((prev) =>
      prev.map((p) => ({
        ...p,
        status: "idle" as PromptStatus,
        imageUrl: undefined,
        fileName: undefined,
        error: undefined,
      }))
    )
  }, [])

  const regeneratePrompt = useCallback((id: string) => {
    const prompt = prompts.find(p => p.id === id)
    if (!prompt) return
    
    updatePromptStatus(id, { 
      status: "idle", 
      imageUrl: undefined, 
      fileName: undefined, 
      error: undefined 
    })
  }, [prompts, updatePromptStatus])

  // Download all images
  const downloadAllImages = useCallback(async () => {
    const completedPrompts = prompts.filter(p => p.status === "completed" && p.imageUrl)
    for (const prompt of completedPrompts) {
      if (prompt.imageUrl) {
        const a = document.createElement('a')
        a.href = prompt.imageUrl
        a.download = prompt.fileName || `image-${prompt.id}.png`
        a.click()
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }
  }, [prompts])

  const appendPromptsToQueue = useCallback((
    extractedPrompts: string[],
    durations?: number[],
    targetMode?: "image" | "video"
  ) => {
    const cleanedPrompts = extractedPrompts
      .map((text) => String(text || "").trim())
      .filter(Boolean)
    if (cleanedPrompts.length === 0) return

    const allowedDurations = getAllowedDurations(videoModel)
    const defaultDuration = allowedDurations[0] || 4
    const normalizeDuration = (value?: number) => {
      const raw = Number(value)
      if (!Number.isFinite(raw) || raw <= 0) return defaultDuration
      return allowedDurations.reduce((closest, current) => (
        Math.abs(current - raw) < Math.abs(closest - raw) ? current : closest
      ), defaultDuration)
    }
    const shouldAttachVideoDurations = targetMode === "video" || (targetMode === undefined && mode === "video")
    const newPrompts = cleanedPrompts.map((text, index) => ({
      id: generateId(),
      prompt: text,
      status: "idle" as PromptStatus,
      videoDuration: shouldAttachVideoDurations ? normalizeDuration(durations?.[index]) : undefined,
    }))
    setPrompts((prev) => [...prev, ...newPrompts])
    if (targetMode) setMode(targetMode)
  }, [getAllowedDurations, mode, videoModel])

  // Handle prompts from chat
  const handlePromptsExtracted = useCallback((extractedPrompts: string[], durations?: number[]) => {
    appendPromptsToQueue(extractedPrompts, durations)
    setIsChatOpen(false)
  }, [appendPromptsToQueue])

  const handleAutopilotSendToImageQueue = useCallback((extractedPrompts: string[], _runId?: string) => {
    appendPromptsToQueue(extractedPrompts, undefined, "image")
  }, [appendPromptsToQueue])

  const handleAutopilotSendToVideoQueue = useCallback((extractedPrompts: string[], durations?: number[], _runId?: string) => {
    appendPromptsToQueue(extractedPrompts, durations, "video")
  }, [appendPromptsToQueue])

  // Stats
  const validPromptsCount = prompts.filter((p) => p.prompt.trim()).length
  const completedCount = prompts.filter((p) => p.status === "completed").length
  const processingPrompt = prompts.find((p) => p.status === "processing")

  // Images for transfer dialog
  const completedImages = prompts
    .filter(p => p.status === "completed" && p.imageUrl)
    .map(p => ({
      id: p.id,
      imageUrl: p.imageUrl!,
      prompt: p.prompt,
    }))

  // Render based on mode
  if (mode === "rescaler") {
    return (
      <>
        <FogBackground />
        <Layout
          mode={mode}
          onModeChange={setMode}
          isSidebarCollapsed={isSidebarCollapsed}
          onToggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          onOpenCostSummary={() => setIsCostSummaryOpen(true)}
          usageSummary={usageSummary}
          onNavigate={navigate}
        >
          <Rescaler onBack={() => setMode("image")} />
        </Layout>
        {isCostSummaryOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Cost Summary</h2>
                <Button variant="ghost" size="icon" onClick={() => setIsCostSummaryOpen(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <CostSummary entries={usageEntries} onClear={() => setUsageEntries([])} />
            </div>
          </div>
        )}
      </>
    )
  }

  if (mode === "kdp") {
    return (
      <>
        <FogBackground />
        <Layout
          mode={mode}
          onModeChange={setMode}
          isSidebarCollapsed={isSidebarCollapsed}
          onToggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          onOpenCostSummary={() => setIsCostSummaryOpen(true)}
          usageSummary={usageSummary}
          onNavigate={navigate}
        >
          <KDPMode onBack={() => setMode("image")} />
        </Layout>
        {isCostSummaryOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Cost Summary</h2>
                <Button variant="ghost" size="icon" onClick={() => setIsCostSummaryOpen(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <CostSummary entries={usageEntries} onClear={() => setUsageEntries([])} />
            </div>
          </div>
        )}
      </>
    )
  }

  if (mode === "autopilot") {
    return (
      <>
        <FogBackground />
        <Layout
          mode={mode}
          onModeChange={setMode}
          isSidebarCollapsed={isSidebarCollapsed}
          onToggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          onOpenCostSummary={() => setIsCostSummaryOpen(true)}
          onOpenAIAssistant={() => {
            window.dispatchEvent(new CustomEvent("autopilot-open-chat"))
          }}
          usageSummary={usageSummary}
          onNavigate={navigate}
        >
          <AutopilotMode
            onSendToImageQueue={handleAutopilotSendToImageQueue}
            onSendToVideoQueue={handleAutopilotSendToVideoQueue}
          />
        </Layout>
        {isCostSummaryOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Cost Summary</h2>
                <Button variant="ghost" size="icon" onClick={() => setIsCostSummaryOpen(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <CostSummary entries={usageEntries} onClear={() => setUsageEntries([])} />
            </div>
          </div>
        )}
      </>
    )
  }

  // Advanced view for image/video mode
  if (viewMode === "advanced") {
    return (
      <>
        <FogBackground />
        <Layout
          mode={mode}
          onModeChange={setMode}
          isSidebarCollapsed={isSidebarCollapsed}
          onToggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          onOpenCostSummary={() => setIsCostSummaryOpen(true)}
          onOpenAIAssistant={() => setIsChatOpen(true)}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          usageSummary={usageSummary}
          onNavigate={navigate}
        >
          <AdvancedModeLayout
            mode={mode as "image" | "video"}
            onModeChange={(m) => setMode(m)}
            isRunning={isRunning}
            onStart={processQueue}
            onStop={stopQueue}
            onReset={resetAll}
            prompts={prompts}
            onAddPrompt={addPrompt}
            onAddMultiplePrompts={addMultiplePrompts}
            onUpdatePrompt={updatePrompt}
            onDeletePrompt={deletePrompt}
            onDeleteAllPrompts={deleteAllPrompts}
            onRegenerate={regeneratePrompt}
            aiModel={aiModel}
            onAiModelChange={setAiModel}
            aspectRatio={aspectRatio}
            onAspectRatioChange={setAspectRatio}
            imageSize={imageSize}
            onImageSizeChange={setImageSize}
            videoModel={videoModel}
            onVideoModelChange={setVideoModel}
            videoDuration={videoDuration}
            onVideoDurationChange={setVideoDuration}
            videoQuality={videoQuality}
            onVideoQualityChange={setVideoQuality}
            videoFPS={videoFPS}
            onVideoFpsChange={setVideoFPS}
            videoMotionStrength={videoMotionStrength}
            onVideoMotionStrengthChange={setVideoMotionStrength}
            // Video-specific per-prompt handlers
            onVideoInputModeChange={handleVideoInputModeChange}
            onReferenceImagesChange={handleReferenceImagesChange}
            onStyleImageChange={handleStyleImageChange}
            onFirstFrameChange={handleFirstFrameChange}
            onLastFrameChange={handleLastFrameChange}
            onVideoAspectRatioChange={handleVideoAspectRatioChange}
            onPerPromptVideoDurationChange={handleVideoDurationChange}
            getVideoAspectRatios={getVideoAspectRatios}
            getAllowedDurations={getAllowedDurations}
            onReferenceImageChange={handleReferenceImageChange}
            // Studio mode
            studioMode={studioMode}
            onStudioModeChange={setStudioMode}
            selectedImageryStyle={selectedImageryStyle}
            onSelectImageryStyle={setSelectedImageryStyle}
            activeStoryBase={activeStoryBase}
            activeStoryBaseName={activeStoryBase?.name}
            onOpenStylePicker={() => setIsStylePickerOpen(true)}
            onOpenStoryBaseManager={() => setIsStoryBaseManagerOpen(true)}
            onPromptsExtracted={handlePromptsExtracted}
            onDownloadAllImages={downloadAllImages}
            onOpenAIChat={() => setIsChatOpen(true)}
            onOpenCostSummary={() => setIsCostSummaryOpen(true)}
            onOpenTransferDialog={() => setIsTransferDialogOpen(true)}
            usageSummary={usageSummary}
          />
        </Layout>

        {/* Modals */}
        {isCostSummaryOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
            <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Cost Summary</h2>
                <Button variant="ghost" size="icon" onClick={() => setIsCostSummaryOpen(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <CostSummary entries={usageEntries} onClear={() => setUsageEntries([])} />
            </div>
          </div>
        )}
        {isStylePickerOpen && (
          <ImageryStylePicker
            onClose={() => setIsStylePickerOpen(false)}
            onSelectStyle={setSelectedImageryStyle}
            selectedStyle={selectedImageryStyle}
          />
        )}
        {isStoryBaseManagerOpen && (
          <StoryBaseManager
            onClose={() => setIsStoryBaseManagerOpen(false)}
            onSelectStoryBase={(sb) => setActiveStoryBase(sb as unknown as StoryBase)}
            activeStoryBaseId={activeStoryBase?.id}
          />
        )}
        {isTransferDialogOpen && (
          <ImageTransferDialog
            isOpen={isTransferDialogOpen}
            onClose={() => setIsTransferDialogOpen(false)}
            images={completedImages}
            onTransfer={() => {
              setIsTransferDialogOpen(false)
              setMode("rescaler")
            }}
          />
        )}
      </>
    )
  }

  // Simple view (default)
  return (
    <>
      <FogBackground />
      <Layout
        mode={mode}
        onModeChange={setMode}
        isSidebarCollapsed={isSidebarCollapsed}
        onToggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        onOpenCostSummary={() => setIsCostSummaryOpen(true)}
        onOpenAIAssistant={() => setIsChatOpen(true)}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        usageSummary={usageSummary}
        onNavigate={navigate}
      >
        <div className="min-h-screen">
          <div className="relative z-10 max-w-6xl mx-auto px-4 py-6">
            {/* Hero Banner */}
            <HeroBanner />

            {/* Stats Bar with Dynamic Total Cost */}
            {(() => {
              const estimatedCost = calculateTotalEstimatedCost(
                mode as "image" | "video",
                validPromptsCount,
                {
                  imageModel: aiModel,
                  imageSize: imageSize,
                  videoModel: videoModel,
                  videoQuality: videoQuality,
                  videoDuration: videoDuration,
                }
              )
              return (
                <div className="flex items-center justify-between mb-6 p-3 bg-[var(--color-surface)]/50 rounded-lg border border-[var(--color-border)]">
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-[var(--color-text-muted)]">Total: <span className="font-bold text-[var(--color-text)]">{prompts.length}</span></span>
                    <span className="text-[var(--color-text-muted)]">Valid: <span className="font-bold text-[var(--color-primary)]">{validPromptsCount}</span></span>
                    <span className="text-[var(--color-text-muted)]">Done: <span className="font-bold text-[var(--color-success)]">{completedCount}</span></span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-[var(--color-text-muted)]">Est. Cost:</span>
                    <span className={cn(
                      "font-bold px-2 py-0.5 rounded",
                      estimatedCost.isFree 
                        ? "text-green-400 bg-green-500/20" 
                        : "text-[var(--color-warning)] bg-[var(--color-warning)]/20"
                    )}>
                      {estimatedCost.formattedTotal}
                    </span>
                    {validPromptsCount > 0 && !estimatedCost.isFree && (
                      <span className="text-xs text-[var(--color-text-dim)]">
                        ({estimatedCost.perUnit}/{mode === "image" ? "img" : "vid"} × {validPromptsCount})
                      </span>
                    )}
                  </div>
                </div>
              )
            })()}

            {/* Settings - Collapsible (Image or Video based on mode) */}
            <Card className="mb-6">
              <button
                onClick={() => setIsImageSettingsExpanded(!isImageSettingsExpanded)}
                className="w-full px-4 py-3 flex items-center justify-between hover:bg-[var(--color-surface-hover)] transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Settings className="w-4 h-4 text-[var(--color-primary)]" />
                  <span className="font-semibold text-sm">{mode === "image" ? "Image Settings" : "Video Settings"}</span>
                </div>
                {isImageSettingsExpanded ? (
                  <ChevronUp className="w-4 h-4 text-[var(--color-text-muted)]" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-[var(--color-text-muted)]" />
                )}
              </button>
              
              {isImageSettingsExpanded && (
                <CardContent className="pt-0 pb-4">
                  {mode === "image" ? (
                    /* IMAGE SETTINGS */
                    <div className="space-y-4">
                      <div>
                        <label className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wide mb-2 block">Model</label>
                        <Select 
                          value={aiModel}
                          onChange={(e) => setAiModel(e.target.value)}
                          disabled={isRunning}
                          className="w-full"
                        >
                          {AI_MODELS.map((model) => (
                            <option key={model.value} value={model.value}>
                              {model.label} • {getImageModelPrice(model.value)}
                            </option>
                          ))}
                        </Select>
                      </div>

                      {/* Aspect Ratio & Resolution Row */}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wide mb-2 block">Aspect Ratio</label>
                          <AspectRatioSelector
                            value={aspectRatio}
                            onChange={(value) => {
                              console.log('[App] AspectRatioSelector onChange called with:', value)
                              setAspectRatio(value)
                            }}
                            disabled={isRunning}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wide mb-2 block">Resolution</label>
                          <Select 
                            value={imageSize}
                            onChange={(e) => setImageSize(e.target.value)}
                            disabled={isRunning}
                            className="w-full"
                          >
                            {IMAGE_SIZES.map((size) => (
                              <option key={size.value} value={size.value}>
                                {size.label}
                              </option>
                            ))}
                          </Select>
                        </div>
                      </div>

                      {/* Current Settings Summary */}
                      <div className="flex items-center justify-between text-xs pt-2 border-t border-[var(--color-border)]">
                        <span className="text-[var(--color-text-muted)]">
                          {AI_MODELS.find(m => m.value === aiModel)?.label} • {aspectRatio} • {imageSize}
                        </span>
                        <span className="text-[var(--color-success)] font-medium">{getImageModelPrice(aiModel, imageSize)}</span>
                      </div>
                    </div>
                  ) : (
                    /* VIDEO SETTINGS */
                    <div className="space-y-4">
                      {/* Video Model Selection */}
                      <div>
                        <label className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wide mb-2 block">Video Model</label>
                        <Select 
                          value={videoModel}
                          onChange={(e) => setVideoModel(e.target.value)}
                          disabled={isRunning}
                          className="w-full"
                        >
                          {VIDEO_MODELS.map((model) => (
                            <option key={model.value} value={model.value}>
                              {model.label} • {getVideoModelPrice(model.value)}
                            </option>
                          ))}
                        </Select>
                      </div>

                      {/* Aspect Ratio & Quality Row */}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wide mb-2 block">Aspect Ratio</label>
                          <Select 
                            value={aspectRatio}
                            onChange={(e) => setAspectRatio(e.target.value)}
                            disabled={isRunning}
                            className="w-full"
                          >
                            {(videoModel === "sora-2" ? VIDEO_ASPECT_RATIOS_SORA : VIDEO_ASPECT_RATIOS).map((ratio) => (
                              <option key={ratio.value} value={ratio.value}>
                                {ratio.label}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wide mb-2 block">Quality</label>
                          <Select 
                            value={videoQuality}
                            onChange={(e) => setVideoQuality(e.target.value)}
                            disabled={isRunning}
                            className="w-full"
                          >
                            {VIDEO_QUALITIES.map((quality) => (
                              <option key={quality.value} value={quality.value}>
                                {quality.label}
                              </option>
                            ))}
                          </Select>
                        </div>
                      </div>

                      {/* FPS & Motion Strength Row */}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wide mb-2 block">FPS</label>
                          <Select 
                            value={videoFPS.toString()}
                            onChange={(e) => setVideoFPS(Number(e.target.value))}
                            disabled={isRunning}
                            className="w-full"
                          >
                            {VIDEO_FPS_OPTIONS.map((fps) => (
                              <option key={fps.value} value={fps.value}>
                                {fps.label}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wide mb-2 block">Motion: {Math.round(videoMotionStrength * 100)}%</label>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.1"
                            value={videoMotionStrength}
                            onChange={(e) => setVideoMotionStrength(Number(e.target.value))}
                            disabled={isRunning}
                            className="w-full h-2 bg-[var(--color-border)] rounded-full appearance-none cursor-pointer accent-[var(--color-primary)]"
                          />
                        </div>
                      </div>

                      {/* Duration Info */}
                      <div className="p-2 bg-[var(--color-background)]/50 rounded-lg border border-[var(--color-border)]">
                        <p className="text-xs text-[var(--color-text-muted)]">
                          <span className="font-medium">Duration:</span> Set per-prompt below. 
                          {videoModel === "sora-2" ? " Sora 2: 4s, 8s, 12s" : " Veo: 4s, 6s, 8s"}
                        </p>
                      </div>

                      {/* Current Settings Summary */}
                      <div className="flex items-center justify-between text-xs pt-2 border-t border-[var(--color-border)]">
                        <span className="text-[var(--color-text-muted)]">
                          {VIDEO_MODELS.find(m => m.value === videoModel)?.label} • {aspectRatio} • {videoQuality} • {videoFPS}fps
                        </span>
                        <span className="text-[var(--color-success)] font-medium">{getVideoModelPrice(videoModel, videoQuality)}</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              )}
            </Card>

            {/* Controls & AI Avatars Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
              {/* Controls Panel */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Controls</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Add Prompts Row */}
                  <div className="grid grid-cols-3 gap-2">
                    <Button onClick={addPrompt} variant="outline" size="sm" disabled={prompts.length >= 200 || isRunning} className="text-xs">
                      <Plus className="w-3 h-3 mr-1" />+1
                    </Button>
                    <Button onClick={() => addMultiplePrompts(10)} variant="outline" size="sm" disabled={prompts.length >= 200 || isRunning} className="text-xs">
                      +10
                    </Button>
                    <Button onClick={() => addMultiplePrompts(50)} variant="outline" size="sm" disabled={prompts.length >= 200 || isRunning} className="text-xs">
                      +50
                    </Button>
                  </div>

                  {/* Batch Upload */}
                  <Button variant="outline" size="sm" className="w-full text-xs" disabled={isRunning}>
                    <Upload className="w-3 h-3 mr-1" />
                    Batch Upload Images
                  </Button>

                  {/* Start/Reset Row */}
                  <div className="grid grid-cols-2 gap-2">
                    {!isRunning ? (
                      <Button onClick={processQueue} disabled={validPromptsCount === 0} size="sm" className="text-xs">
                        <Play className="w-3 h-3 mr-1" />Start
                      </Button>
                    ) : (
                      <Button onClick={stopQueue} variant="destructive" size="sm" className="text-xs">
                        <Square className="w-3 h-3 mr-1" />Stop
                      </Button>
                    )}
                    <Button onClick={resetAll} variant="secondary" size="sm" disabled={isRunning} className="text-xs">
                      <RotateCcw className="w-3 h-3 mr-1" />Reset
                    </Button>
                  </div>

                  {/* Clear/Delete Row */}
                  <div className="grid grid-cols-2 gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => {
                        setPrompts(prev => prev.map(p => ({ ...p, prompt: "" })))
                      }}
                      disabled={isRunning}
                      className="text-xs"
                    >
                      <X className="w-3 h-3 mr-1" />Clear Text
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={deleteAllPrompts}
                      disabled={isRunning}
                      className="text-xs text-[var(--color-error)] hover:text-[var(--color-error)]"
                    >
                      <Trash2 className="w-3 h-3 mr-1" />Delete All
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* AI Avatars Panel */}
              <CharacterDisplay 
                onCharacterClick={(alias) => {
                  // Insert @alias into the first empty prompt or last prompt
                  const emptyPrompt = prompts.find(p => !p.prompt.trim())
                  if (emptyPrompt) {
                    updatePrompt(emptyPrompt.id, `@${alias} `)
                  } else if (prompts.length > 0) {
                    const lastPrompt = prompts[prompts.length - 1]
                    updatePrompt(lastPrompt.id, `${lastPrompt.prompt} @${alias}`)
                  }
                }}
                gridColumns={avatarGridColumns}
                onGridColumnsChange={setAvatarGridColumns}
              />
            </div>

            {/* Studio Mode Panel - Only shown for image mode */}
            {mode === "image" && (
              <div className="mb-6">
                <StudioModePanel
                  mode={studioMode}
                  onModeChange={setStudioMode}
                  selectedStyle={selectedImageryStyle}
                  onOpenStylePicker={() => setIsStylePickerOpen(true)}
                  onOpenStoryBaseManager={() => setIsStoryBaseManagerOpen(true)}
                  activeStoryBaseName={activeStoryBase?.name}
                />
              </div>
            )}

            {/* Prompts Section */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold mb-3">Prompts ({prompts.length})</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {prompts.map((item, index) => (
                  <PromptCard
                    key={item.id}
                    item={item}
                    index={index}
                    onChange={updatePrompt}
                    onDelete={deletePrompt}
                    onRegenerate={regeneratePrompt}
                    disabled={isRunning}
                    mode={mode as "image" | "video"}
                    videoModel={videoModel}
                    // Video-specific handlers
                    onVideoInputModeChange={handleVideoInputModeChange}
                    onReferenceImagesChange={handleReferenceImagesChange}
                    onStyleImageChange={handleStyleImageChange}
                    onFirstFrameChange={handleFirstFrameChange}
                    onLastFrameChange={handleLastFrameChange}
                    onVideoAspectRatioChange={handleVideoAspectRatioChange}
                    onVideoDurationChange={handleVideoDurationChange}
                    getVideoAspectRatios={getVideoAspectRatios}
                    getAllowedDurations={getAllowedDurations}
                    // Legacy reference image handler for image mode
                    onReferenceImageChange={handleReferenceImageChange}
                  />
                ))}
              </div>

              {/* Empty state */}
              {prompts.length === 0 && (
                <Card className="text-center py-12">
                  <CardContent>
                    <Sparkles className="w-12 h-12 mx-auto mb-4 text-[var(--color-text-dim)]" />
                    <p className="text-[var(--color-text-muted)]">No prompts yet. Click "+1" to get started.</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </Layout>

      {/* Modals */}
      {isCostSummaryOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
          <div className="bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Cost Summary</h2>
              <Button variant="ghost" size="icon" onClick={() => setIsCostSummaryOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <CostSummary entries={usageEntries} onClear={() => setUsageEntries([])} />
          </div>
        </div>
      )}
      {/* AI Chat Button - Identical to Advanced View */}
      {!isChatOpen && (
        <button
          onClick={() => setIsChatOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-accent)] text-white rounded-full shadow-lg hover:shadow-xl transition-all flex items-center justify-center hover:scale-110"
        >
          <MessageSquare className="w-6 h-6" />
        </button>
      )}

      {/* Full InlineChat Integration - Identical to Advanced View */}
      <InlineChat
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        onPromptsExtracted={handlePromptsExtracted}
        disabled={isRunning}
        mode={mode as "image" | "video"}
        activeStoryBase={activeStoryBase}
        selectedImageryStyle={selectedImageryStyle}
        onSelectImageryStyle={(style) => setSelectedImageryStyle(style as ImageryStyle | null)}
        availableStyles={availableImageryStyles}
      />

      {/* Style Picker Modal */}
      {isStylePickerOpen && (
        <ImageryStylePicker
          onClose={() => setIsStylePickerOpen(false)}
          onSelectStyle={setSelectedImageryStyle}
          selectedStyle={selectedImageryStyle}
        />
      )}

      {/* Story Base Manager Modal */}
      {isStoryBaseManagerOpen && (
        <StoryBaseManager
          onClose={() => setIsStoryBaseManagerOpen(false)}
          onSelectStoryBase={(sb) => setActiveStoryBase(sb as unknown as StoryBase)}
          activeStoryBaseId={activeStoryBase?.id}
        />
      )}
    </>
  )
}

export default App
