import { useState, useRef, useEffect } from "react"
import { 
  Image as ImageIcon, 
  Plus,
  Play,
  Square,
  RotateCcw,
  Trash2,
  Download,
  Grid3X3,
  Bot,
  RatioIcon,
  Gauge,
  Zap,
  Timer,
  Layers,
  Palette,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  X,
  Users,
  Sparkles,
  BookOpen,
  Check,
  ArrowRight,
  Video,
  Upload,
} from "lucide-react"
import { Button } from "./Button"
import { InlineChat } from "./InlineChat"
import { cn } from "@/lib/utils"
import { AdvancedModeLayoutProps } from "@/types/AdvancedView"
import {
  AI_MODELS,
  ASPECT_RATIOS,
  IMAGE_SIZES,
  VIDEO_MODELS,
  VIDEO_QUALITIES,
  VIDEO_FPS_OPTIONS,
  VIDEO_ASPECT_RATIOS,
  VIDEO_ASPECT_RATIOS_SORA,
  STUDIO_MODES,
  getImageModelPrice,
  getVideoModelPrice,
  calculateTotalEstimatedCost,
} from "@/constants/models"

// Character type for avatars
interface Character {
  id: string
  name: string
  alias: string
  images: string[]
}

export function AdvancedModeLayout(props: AdvancedModeLayoutProps) {
  const [isPaused, setIsPaused] = useState(false)
  const [viewMode, setViewMode] = useState<"carousel" | "grid">("carousel")
  const [activeSettingDropdown, setActiveSettingDropdown] = useState<string | null>(null)
  const [carouselIndex, setCarouselIndex] = useState(0)
  const [isStudioExpanded, setIsStudioExpanded] = useState(false)
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [characters, setCharacters] = useState<Character[]>([])
  const [isAvatarsOpen, setIsAvatarsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Load characters for avatar dropdown
  useEffect(() => {
    const loadCharacters = async () => {
      try {
        const response = await fetch("/api/characters")
        if (response.ok) {
          const data = await response.json()
          setCharacters(data)
        }
      } catch (error) {
        console.error("Failed to load characters:", error)
      }
    }
    loadCharacters()
  }, [])

  // Handle character click - insert @mention into prompts
  const handleCharacterClick = (alias: string) => {
    const characterMention = `@${alias}`
    // Insert into all idle prompts
    props.prompts.forEach(p => {
      if (p.status === "idle" && !p.prompt.includes(characterMention)) {
        const newPrompt = p.prompt.trim() ? `${p.prompt} ${characterMention}` : characterMention
        props.onUpdatePrompt(p.id, newPrompt)
      }
    })
    setIsAvatarsOpen(false)
  }

  // Dynamic settings based on mode (from props.mode)
  const getSettingsForTool = () => {
    if (props.mode === "image") {
      // Add computed price to each model option
      const modelsWithPrice = AI_MODELS.map(m => ({
        ...m,
        price: getImageModelPrice(m.value, props.imageSize)
      }))
      return [
        { 
          id: "model", 
          label: "Model", 
          icon: Bot, 
          value: AI_MODELS.find(m => m.value === props.aiModel)?.label || props.aiModel,
          options: modelsWithPrice,
          onChange: (val: string) => props.onAiModelChange(val),
          currentValue: props.aiModel,
        },
        { 
          id: "ratio", 
          label: "Ratio", 
          icon: RatioIcon, 
          value: props.aspectRatio,
          options: ASPECT_RATIOS,
          onChange: (val: string) => props.onAspectRatioChange(val),
          currentValue: props.aspectRatio,
        },
        { 
          id: "size", 
          label: "Size", 
          icon: Layers, 
          value: props.imageSize,
          options: IMAGE_SIZES,
          onChange: (val: string) => props.onImageSizeChange(val),
          currentValue: props.imageSize,
        },
      ]
    } else if (props.mode === "video") {
      const aspectOptions = props.videoModel === "sora-2" ? VIDEO_ASPECT_RATIOS_SORA : VIDEO_ASPECT_RATIOS
      // Add computed price to each video model option
      const videoModelsWithPrice = VIDEO_MODELS.map(m => ({
        ...m,
        price: getVideoModelPrice(m.value, props.videoQuality)
      }))
      return [
        { 
          id: "model", 
          label: "Model", 
          icon: Bot, 
          value: VIDEO_MODELS.find(m => m.value === props.videoModel)?.label || props.videoModel,
          options: videoModelsWithPrice,
          onChange: (val: string) => props.onVideoModelChange(val),
          currentValue: props.videoModel,
        },
        { 
          id: "ratio", 
          label: "Ratio", 
          icon: RatioIcon, 
          value: props.aspectRatio,
          options: aspectOptions,
          onChange: (val: string) => props.onAspectRatioChange(val),
          currentValue: props.aspectRatio,
        },
        { 
          id: "quality", 
          label: "Quality", 
          icon: Gauge, 
          value: VIDEO_QUALITIES.find(q => q.value === props.videoQuality)?.label || props.videoQuality,
          options: VIDEO_QUALITIES,
          onChange: (val: string) => props.onVideoQualityChange(val),
          currentValue: props.videoQuality,
        },
        { 
          id: "fps", 
          label: "FPS", 
          icon: Timer, 
          value: `${props.videoFPS}`,
          options: VIDEO_FPS_OPTIONS,
          onChange: (val: string) => props.onVideoFpsChange(Number(val)),
          currentValue: props.videoFPS.toString(),
        },
        { 
          id: "motion", 
          label: "Motion", 
          icon: Zap, 
          value: `${Math.round(props.videoMotionStrength * 100)}%`,
          isSlider: true,
          sliderValue: props.videoMotionStrength,
          sliderMin: 0,
          sliderMax: 1,
          sliderStep: 0.1,
          sliderUnit: "%",
          options: [] as { value: string; label: string }[],
          onChange: (val: string) => props.onVideoMotionStrengthChange(Number(val)),
          currentValue: props.videoMotionStrength.toString(),
        },
      ]
    }
    return []
  }

  const settings = getSettingsForTool()

  const handleStart = () => {
    if (isPaused) {
      props.onStart()
      setIsPaused(false)
    } else {
      props.onStart()
    }
  }

  const handlePause = () => {
    props.onStop()
    setIsPaused(true)
  }

  // Stats
  const validPromptsCount = props.prompts.filter(p => p.prompt.trim()).length
  const completedCount = props.prompts.filter(p => p.status === "completed").length

  // Horizontal carousel navigation - show 3 vertical cards
  const visibleCount = 3
  const maxIndex = Math.max(0, props.prompts.length - visibleCount)
  
  const handlePrevSlide = () => {
    setCarouselIndex(prev => Math.max(0, prev - 1))
  }
  
  const handleNextSlide = () => {
    setCarouselIndex(prev => Math.min(maxIndex, prev + 1))
  }

  // Render VERTICAL prompt card (40% taller, with video controls in video mode)
  const renderPromptCard = (promptItem: typeof props.prompts[0], index: number) => (
    <div
      className={cn(
        "flex-shrink-0 bg-[var(--color-surface)]/90 backdrop-blur-sm rounded-xl border-2 overflow-hidden transition-all flex flex-col",
        props.mode === "video" ? "w-[380px]" : "w-[320px]",
        promptItem.status === "processing" 
          ? "border-[var(--color-accent)] ring-2 ring-[var(--color-accent)]/30" 
          : promptItem.status === "completed"
            ? "border-[var(--color-success)]"
            : promptItem.status === "error"
              ? "border-[var(--color-error)]"
              : "border-[var(--color-border)] hover:border-[var(--color-primary)]"
      )}
    >
      {/* Prompt Input FIRST (vertical layout) - 40% taller (180px instead of 128px) */}
      <div className="p-4 flex-1">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-mono font-bold text-[var(--color-text-muted)]">#{index + 1}</span>
          {promptItem.status !== "idle" && (
            <span className={cn(
              "px-2 py-0.5 rounded text-xs font-semibold uppercase",
              promptItem.status === "completed" && "bg-green-500/20 text-green-400",
              promptItem.status === "processing" && "bg-blue-500/20 text-blue-400 animate-pulse",
              promptItem.status === "error" && "bg-red-500/20 text-red-400",
              promptItem.status === "queued" && "bg-yellow-500/20 text-yellow-400"
            )}>
              {promptItem.status}
            </span>
          )}
        </div>
        <textarea
          value={promptItem.prompt}
          onChange={(e) => props.onUpdatePrompt(promptItem.id, e.target.value)}
          placeholder={props.mode === "video" 
            ? "Describe your video scene in detail... Include camera movements, actions, lighting, mood."
            : "Write your prompt here..."}
          disabled={props.isRunning && promptItem.status !== "idle"}
          className={cn(
            "w-full text-sm p-3 bg-[var(--color-background)]/60 border border-[var(--color-border)] rounded-lg resize-none focus:outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/20",
            props.mode === "video" ? "h-[140px]" : "h-[180px]"
          )}
        />

        {/* Video Controls (only in video mode and idle state) */}
        {props.mode === "video" && promptItem.status === "idle" && (
          <div className="mt-3 pt-3 border-t border-[var(--color-border)] space-y-2">
            <div className="flex items-center gap-2 mb-2">
              <Video className="w-3 h-3 text-[var(--color-primary)]" />
              <span className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Video Options</span>
            </div>
            
            {/* Duration and Aspect Ratio Row */}
            <div className="grid grid-cols-2 gap-2">
              {/* Per-prompt Duration */}
              {props.onPerPromptVideoDurationChange && props.getAllowedDurations && (
                <div>
                  <label className="block text-[10px] font-medium text-[var(--color-text-muted)] mb-1">Duration</label>
                  <select
                    value={promptItem.videoDuration || props.getAllowedDurations(props.videoModel)[0]}
                    onChange={(e) => props.onPerPromptVideoDurationChange!(promptItem.id, Number(e.target.value))}
                    disabled={props.isRunning}
                    className="w-full h-7 px-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-xs text-[var(--color-text)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] cursor-pointer"
                  >
                    {props.getAllowedDurations(props.videoModel).map((duration) => (
                      <option key={duration} value={duration}>{duration}s</option>
                    ))}
                  </select>
                </div>
              )}
              
              {/* Per-prompt Aspect Ratio */}
              {props.onVideoAspectRatioChange && props.getVideoAspectRatios && (
                <div>
                  <label className="block text-[10px] font-medium text-[var(--color-text-muted)] mb-1">Aspect</label>
                  <select
                    value={promptItem.videoAspectRatio || "16:9"}
                    onChange={(e) => props.onVideoAspectRatioChange!(promptItem.id, e.target.value)}
                    disabled={props.isRunning}
                    className="w-full h-7 px-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-xs text-[var(--color-text)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] cursor-pointer"
                  >
                    {props.getVideoAspectRatios(props.videoModel).map((ratio) => (
                      <option key={ratio.value} value={ratio.value}>{ratio.label}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Video Input Mode for Veo models */}
            {(props.videoModel === "veo-3" || props.videoModel === "veo-3.1") && props.onVideoInputModeChange && (
              <div>
                <label className="block text-[10px] font-medium text-[var(--color-text-muted)] mb-1">Mode</label>
                <div className="grid grid-cols-3 gap-1">
                  {[
                    { value: "text-to-video", label: "Text" },
                    { value: "image-to-video", label: "Image" },
                    { value: "frames-to-video", label: "Frames" }
                  ].map((mode) => (
                    <button
                      key={mode.value}
                      type="button"
                      onClick={() => props.onVideoInputModeChange!(promptItem.id, mode.value as any)}
                      disabled={props.isRunning}
                      className={cn(
                        "px-2 py-1 text-[10px] rounded-md border transition-colors",
                        (promptItem.videoInputMode || "text-to-video") === mode.value
                          ? "bg-[var(--color-primary)] text-white border-[var(--color-primary)]"
                          : "bg-[var(--color-surface)] text-[var(--color-text-muted)] border-[var(--color-border)] hover:border-[var(--color-primary)]"
                      )}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Sora 2 Input Mode (simpler - only text and image) */}
            {props.videoModel === "sora-2" && props.onVideoInputModeChange && (
              <div>
                <label className="block text-[10px] font-medium text-[var(--color-text-muted)] mb-1">Mode</label>
                <div className="grid grid-cols-2 gap-1">
                  {[
                    { value: "text-to-video", label: "Text→Video" },
                    { value: "image-to-video", label: "Image→Video" }
                  ].map((mode) => (
                    <button
                      key={mode.value}
                      type="button"
                      onClick={() => props.onVideoInputModeChange!(promptItem.id, mode.value as any)}
                      disabled={props.isRunning}
                      className={cn(
                        "px-2 py-1 text-[10px] rounded-md border transition-colors",
                        (promptItem.videoInputMode || "text-to-video") === mode.value
                          ? "bg-[var(--color-primary)] text-white border-[var(--color-primary)]"
                          : "bg-[var(--color-surface)] text-[var(--color-text-muted)] border-[var(--color-border)] hover:border-[var(--color-primary)]"
                      )}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Source Image Upload for image-to-video mode */}
            {promptItem.videoInputMode === "image-to-video" && props.onReferenceImageChange && (
              <div>
                <label className="block text-[10px] font-medium text-[var(--color-text-muted)] mb-1">Source Image</label>
                {promptItem.referenceImage ? (
                  <div className="flex items-center gap-2 p-1.5 bg-[var(--color-surface)] rounded-md border border-[var(--color-border)]">
                    <img src={promptItem.referenceImage} alt="Source" className="w-8 h-8 object-cover rounded" />
                    <span className="flex-1 text-[10px] truncate">{promptItem.referenceImageName || "Image"}</span>
                    <button
                      onClick={() => props.onReferenceImageChange!(promptItem.id, undefined, undefined)}
                      className="text-[var(--color-error)] hover:opacity-80"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center justify-center gap-1 p-2 border border-dashed border-[var(--color-border)] rounded-md cursor-pointer hover:border-[var(--color-primary)] transition-colors">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={props.isRunning}
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        const reader = new FileReader()
                        reader.onload = () => {
                          props.onReferenceImageChange!(promptItem.id, reader.result as string, file.name)
                        }
                        reader.readAsDataURL(file)
                        e.target.value = ""
                      }}
                    />
                    <Upload className="w-3 h-3 text-[var(--color-text-dim)]" />
                    <span className="text-[10px] text-[var(--color-text-muted)]">Upload</span>
                  </label>
                )}
              </div>
            )}

            {/* First/Last Frame for frames-to-video (Veo) */}
            {(props.videoModel === "veo-3" || props.videoModel === "veo-3.1") && 
             promptItem.videoInputMode === "frames-to-video" && 
             props.onFirstFrameChange && props.onLastFrameChange && (
              <div className="grid grid-cols-2 gap-2">
                {/* First Frame */}
                <div>
                  <label className="block text-[10px] font-medium text-[var(--color-text-muted)] mb-1">First Frame</label>
                  {promptItem.firstFrame ? (
                    <div className="relative group">
                      <img src={promptItem.firstFrame} alt="First" className="w-full h-12 object-cover rounded-md border border-[var(--color-border)]" />
                      <button
                        onClick={() => props.onFirstFrameChange!(promptItem.id, undefined, undefined)}
                        className="absolute top-0.5 right-0.5 w-4 h-4 bg-[var(--color-error)] text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center h-12 border border-dashed border-[var(--color-border)] rounded-md cursor-pointer hover:border-[var(--color-primary)]">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={props.isRunning}
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          const reader = new FileReader()
                          reader.onload = () => props.onFirstFrameChange!(promptItem.id, reader.result as string, file.name)
                          reader.readAsDataURL(file)
                          e.target.value = ""
                        }}
                      />
                      <Upload className="w-3 h-3 text-[var(--color-text-dim)]" />
                    </label>
                  )}
                </div>
                {/* Last Frame */}
                <div>
                  <label className="block text-[10px] font-medium text-[var(--color-text-muted)] mb-1">Last Frame</label>
                  {promptItem.lastFrame ? (
                    <div className="relative group">
                      <img src={promptItem.lastFrame} alt="Last" className="w-full h-12 object-cover rounded-md border border-[var(--color-border)]" />
                      <button
                        onClick={() => props.onLastFrameChange!(promptItem.id, undefined, undefined)}
                        className="absolute top-0.5 right-0.5 w-4 h-4 bg-[var(--color-error)] text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center h-12 border border-dashed border-[var(--color-border)] rounded-md cursor-pointer hover:border-[var(--color-primary)]">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={props.isRunning}
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          const reader = new FileReader()
                          reader.onload = () => props.onLastFrameChange!(promptItem.id, reader.result as string, file.name)
                          reader.readAsDataURL(file)
                          e.target.value = ""
                        }}
                      />
                      <Upload className="w-3 h-3 text-[var(--color-text-dim)]" />
                    </label>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* Action buttons */}
        <div className="flex justify-end gap-2 mt-2">
          {promptItem.status === "completed" && (
            <Button size="sm" variant="ghost" onClick={() => props.onRegenerate(promptItem.id)} disabled={props.isRunning}>
              <RotateCcw className="w-3 h-3 mr-1" />Redo
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => props.onDeletePrompt(promptItem.id)} disabled={props.isRunning} className="text-[var(--color-error)]">
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Preview Area BELOW */}
      <div className="h-48 relative bg-gradient-to-br from-purple-500/10 to-pink-500/10 border-t border-[var(--color-border)]">
        {promptItem.status === "completed" && promptItem.imageUrl ? (
          <img
            src={promptItem.imageUrl}
            alt={promptItem.prompt}
            className="w-full h-full object-cover"
          />
        ) : promptItem.status === "completed" && promptItem.videoUrl ? (
          <video
            src={promptItem.videoUrl}
            className="w-full h-full object-cover"
            controls
            muted
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center">
            {promptItem.status === "processing" ? (
              <>
                <div className="w-10 h-10 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin mb-2" />
                <span className="text-xs text-[var(--color-text-muted)]">Generating...</span>
              </>
            ) : promptItem.status === "error" ? (
              <span className="text-3xl">⚠️</span>
            ) : (
              <>
                {props.mode === "video" ? (
                  <Video className="w-10 h-10 text-[var(--color-text-muted)] opacity-30 mb-2" />
                ) : (
                  <ImageIcon className="w-10 h-10 text-[var(--color-text-muted)] opacity-30 mb-2" />
                )}
                <span className="text-xs text-[var(--color-text-dim)]">Preview will appear here</span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="flex flex-col min-h-screen relative z-10 p-6">
      {/* Hero Banner with Settings blended into bottom */}
      <div className="relative mb-4">
        {/* Banner */}
        <div 
          className="relative overflow-hidden rounded-t-3xl"
          style={{
            background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 25%, #0f3460 50%, #533483 75%, #e94560 100%)",
            minHeight: "100px"
          }}
        >
          <div className="absolute inset-0 opacity-40">
            <div className="absolute inset-0" style={{
              background: "radial-gradient(ellipse at 20% 30%, rgba(124,58,237,0.5) 0%, transparent 50%), radial-gradient(ellipse at 80% 70%, rgba(236,72,153,0.5) 0%, transparent 50%)",
            }} />
          </div>
          <div className="relative z-10 flex flex-col items-center justify-center h-full py-5 px-6 text-center">
            <h1 className="text-xl font-bold bg-gradient-to-r from-white via-purple-200 to-pink-200 bg-clip-text text-transparent">
              Bring your ideas to life
            </h1>
          </div>
        </div>

        {/* Settings Icons Bar - Blended into banner */}
        <div className="relative -mt-6 mx-auto max-w-5xl z-20">
          <div className="flex flex-wrap items-center justify-center gap-2 p-3 bg-[var(--color-surface)]/90 backdrop-blur-md rounded-2xl border border-[var(--color-border)]/50 shadow-xl" style={{ backgroundColor: 'rgba(var(--color-surface-rgb), 0.9)' }}>
            
            {/* AI Avatars App Icon (First) */}
            <div className="relative">
              <button
                onClick={() => {
                  setIsAvatarsOpen(!isAvatarsOpen)
                  setActiveSettingDropdown(null)
                }}
                disabled={props.isRunning}
                className={cn(
                  "flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all min-w-[70px]",
                  "border bg-[var(--color-background)]/90 backdrop-blur-sm hover:scale-105",
                  isAvatarsOpen 
                    ? "border-[var(--color-primary)] bg-gradient-to-br from-purple-500/20 to-pink-500/20" 
                    : "border-transparent hover:border-[var(--color-border-bright)]",
                  props.isRunning && "opacity-50 cursor-not-allowed"
                )}
              >
                <Users className={cn(
                  "w-4 h-4 transition-colors",
                  isAvatarsOpen ? "text-[var(--color-primary)]" : "text-[var(--color-text-muted)]"
                )} />
                <span className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wider font-medium">Avatars</span>
                <span className="text-[10px] font-semibold text-[var(--color-text)]">{characters.length}</span>
              </button>

              {/* Avatars Dropdown */}
              {isAvatarsOpen && (
                <div className="absolute top-full left-0 mt-2 z-50 w-80 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-2xl overflow-hidden animate-fade-in">
                  <div className="p-3 border-b border-[var(--color-border)] flex items-center justify-between">
                    <span className="text-sm font-semibold">AI Avatars</span>
                    <span className="text-xs text-[var(--color-text-dim)]">{characters.length} available</span>
                  </div>
                  <div className="p-3 max-h-60 overflow-y-auto">
                    {characters.length > 0 ? (
                      <div className="grid grid-cols-4 gap-2">
                        {characters.map((char) => (
                          <button
                            key={char.id}
                            onClick={() => handleCharacterClick(char.alias)}
                            className="flex flex-col items-center p-2 rounded-lg hover:bg-[var(--color-background)] transition-colors group"
                            title={`@${char.alias}`}
                          >
                            <div className="w-12 h-12 rounded-lg overflow-hidden bg-[var(--color-background)] border border-[var(--color-border)] mb-1">
                              {char.images?.[0] ? (
                                <img src={char.images[0]} alt={char.name} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-[var(--color-text-dim)]">
                                  <Users className="w-5 h-5" />
                                </div>
                              )}
                            </div>
                            <span className="text-[10px] text-[var(--color-text-muted)] truncate max-w-full">@{char.alias}</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-center text-sm text-[var(--color-text-dim)] py-4">No avatars yet</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Studio Mode App Icon - Only shown for image mode */}
            {props.mode === "image" && (
              <>
                <button
                  onClick={() => {
                    setIsStudioExpanded(!isStudioExpanded)
                    setActiveSettingDropdown(null)
                    setIsAvatarsOpen(false)
                  }}
                  disabled={props.isRunning}
                  className={cn(
                    "flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all min-w-[70px]",
                    "border bg-[var(--color-background)]/70 backdrop-blur-sm hover:scale-105",
                    isStudioExpanded || props.studioMode !== "off"
                      ? "border-[var(--color-primary)] bg-gradient-to-br from-purple-500/20 to-pink-500/20" 
                      : "border-transparent hover:border-[var(--color-border-bright)]",
                    props.isRunning && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <Palette className={cn(
                    "w-4 h-4 transition-colors",
                    isStudioExpanded || props.studioMode !== "off" ? "text-[var(--color-primary)]" : "text-[var(--color-text-muted)]"
                  )} />
                  <span className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wider font-medium">Studio</span>
                  <span className="text-[10px] font-semibold text-[var(--color-text)]">
                    {props.studioMode === "off" ? "Off" : props.studioMode === "simple" ? "Simple" : "Advanced"}
                  </span>
                </button>

                <div className="w-px h-8 bg-[var(--color-border)]/50" />
              </>
            )}

            {/* Other Settings Icons */}
            {settings.map((setting) => {
              const Icon = setting.icon
              const isOpen = activeSettingDropdown === setting.id
              
              return (
                <div key={setting.id} className="relative" ref={isOpen ? dropdownRef : null}>
                  <button
                    onClick={() => {
                      setActiveSettingDropdown(isOpen ? null : setting.id)
                      setIsAvatarsOpen(false)
                    }}
                    disabled={props.isRunning}
                    className={cn(
                      "flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all min-w-[70px]",
                      "border bg-[var(--color-background)]/90 backdrop-blur-sm hover:scale-105",
                      isOpen 
                        ? "border-[var(--color-primary)] bg-gradient-to-br from-purple-500/20 to-pink-500/20" 
                        : "border-transparent hover:border-[var(--color-border-bright)]",
                      props.isRunning && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <Icon className={cn(
                      "w-4 h-4 transition-colors",
                      isOpen ? "text-[var(--color-primary)]" : "text-[var(--color-text-muted)]"
                    )} />
                    <span className="text-[9px] text-[var(--color-text-muted)] uppercase tracking-wider font-medium">{setting.label}</span>
                    <span className="text-[10px] font-semibold text-[var(--color-text)] truncate max-w-[60px]">{setting.value}</span>
                  </button>

                  {/* Dropdown */}
                  {isOpen && !('isSlider' in setting && setting.isSlider) && setting.options && setting.options.length > 0 && (
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 min-w-[160px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-2xl overflow-hidden animate-fade-in">
                      <div className="p-1">
                        {setting.options.map((option: { value: string; label: string; price?: string }) => (
                          <button
                            key={option.value}
                            onClick={() => {
                              setting.onChange(option.value)
                              setActiveSettingDropdown(null)
                            }}
                            className={cn(
                              "w-full text-left px-3 py-2 text-sm rounded-lg transition-colors",
                              setting.currentValue === option.value
                                ? "bg-[var(--color-primary)]/20 text-[var(--color-primary)] font-medium"
                                : "hover:bg-[var(--color-background)] text-[var(--color-text-muted)]"
                            )}
                          >
                            {option.label}{option.price && <span className="ml-2 text-xs opacity-70">• {option.price}</span>}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Slider for Duration/Motion Strength */}
                  {isOpen && 'isSlider' in setting && setting.isSlider && 'sliderValue' in setting && (
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 w-48 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-2xl p-4 animate-fade-in">
                      <div className="text-sm text-center mb-2 text-[var(--color-text)] font-medium">
                        {setting.label}: {
                          'sliderUnit' in setting && setting.sliderUnit === "%"
                            ? `${Math.round((setting.sliderValue as number) * 100)}%`
                            : `${setting.sliderValue}${'sliderUnit' in setting ? setting.sliderUnit : ''}`
                        }
                      </div>
                      <input
                        type="range"
                        min={'sliderMin' in setting ? setting.sliderMin as number : 0}
                        max={'sliderMax' in setting ? setting.sliderMax as number : 1}
                        step={'sliderStep' in setting ? setting.sliderStep as number : 0.1}
                        value={setting.sliderValue as number}
                        onChange={(e) => setting.onChange(e.target.value)}
                        className="w-full h-2 bg-[var(--color-border)] rounded-full appearance-none cursor-pointer accent-[var(--color-primary)]"
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setActiveSettingDropdown(null)}
                        className="w-full mt-2"
                      >
                        Done
                      </Button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Studio Mode Expanded Panel - Only shown for image mode */}
      {props.mode === "image" && isStudioExpanded && (
        <div className="mb-4 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-xl border border-purple-500/30 overflow-hidden animate-fade-in">
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Palette className="w-4 h-4 text-purple-400" />
                Studio Mode Settings
              </h3>
              <Button size="sm" variant="ghost" onClick={() => setIsStudioExpanded(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Studio Mode Toggle */}
            <div className="mb-4">
              <label className="text-xs font-semibold text-[var(--color-text-muted)] uppercase mb-2 block">Mode</label>
              <div className="flex gap-2">
                {STUDIO_MODES.map((mode) => (
                  <button
                    key={mode.value}
                    onClick={() => props.onStudioModeChange(mode.value as any)}
                    className={cn(
                      "flex-1 p-3 rounded-lg border transition-all text-left",
                      props.studioMode === mode.value
                        ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10"
                        : "border-[var(--color-border)] hover:border-[var(--color-border-bright)]"
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold">{mode.label}</span>
                      {props.studioMode === mode.value && (
                        <Check className="w-4 h-4 text-[var(--color-primary)]" />
                      )}
                    </div>
                    <span className="text-xs text-[var(--color-text-dim)]">{mode.description}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Studio Options Grid */}
            <div className="grid grid-cols-2 gap-4">
              {/* Imagery Style */}
              <div className="p-4 bg-[var(--color-surface)]/50 rounded-lg border border-[var(--color-border)]">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase flex items-center gap-2">
                    <Sparkles className="w-3 h-3" />
                    Imagery Style
                  </h4>
                  <Button size="sm" variant="ghost" onClick={props.onOpenStylePicker}>
                    {props.selectedImageryStyle ? "Change" : "Select"}
                  </Button>
                </div>
                {props.selectedImageryStyle ? (
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                      <Sparkles className="w-6 h-6 text-purple-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{props.selectedImageryStyle.name}</p>
                      <p className="text-xs text-[var(--color-text-dim)] truncate">{props.selectedImageryStyle.description}</p>
                    </div>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      onClick={() => props.onSelectImageryStyle(null)}
                      className="text-[var(--color-error)]"
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-[var(--color-text-dim)]">No style selected</p>
                )}
              </div>

              {/* Story Base */}
              <div className="p-4 bg-[var(--color-surface)]/50 rounded-lg border border-[var(--color-border)]">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase flex items-center gap-2">
                    <BookOpen className="w-3 h-3" />
                    Story Base
                  </h4>
                  <Button size="sm" variant="ghost" onClick={props.onOpenStoryBaseManager}>
                    {props.activeStoryBase ? "Change" : "Select"}
                  </Button>
                </div>
                {props.activeStoryBase ? (
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center">
                      <BookOpen className="w-6 h-6 text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{props.activeStoryBaseName}</p>
                      <p className="text-xs text-[var(--color-text-dim)]">
                        {props.activeStoryBase.characters?.length || 0} characters, {props.activeStoryBase.environments?.length || 0} environments
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-[var(--color-text-dim)]">No story base selected</p>
                )}
              </div>
            </div>

            {/* Active Indicators */}
            {(props.selectedImageryStyle || props.activeStoryBase) && (
              <div className="mt-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                <div className="flex items-center gap-2 text-sm text-green-400">
                  <Check className="w-4 h-4" />
                  <span>
                    Studio Mode: {props.studioMode} 
                    {props.selectedImageryStyle && ` • Style: ${props.selectedImageryStyle.name}`}
                    {props.activeStoryBase && ` • Story: ${props.activeStoryBaseName}`}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Queue Controls */}
      <div className="flex flex-wrap items-center justify-center gap-2 mb-4 p-2 bg-[var(--color-surface)]/90 backdrop-blur-sm rounded-xl border border-[var(--color-border)]/30">
        <Button onClick={props.onAddPrompt} variant="outline" size="sm" disabled={props.isRunning}>
          <Plus className="w-4 h-4 mr-1" />+1
        </Button>
        <Button onClick={() => props.onAddMultiplePrompts(10)} variant="outline" size="sm" disabled={props.isRunning}>+10</Button>
        <Button onClick={() => props.onAddMultiplePrompts(50)} variant="outline" size="sm" disabled={props.isRunning}>+50</Button>

        <div className="w-px h-5 bg-[var(--color-border)]/50" />

        {!props.isRunning ? (
          <Button onClick={handleStart} variant="playful" size="sm">
            <Play className="w-4 h-4 mr-1" />{isPaused ? "Resume" : "Start"}
          </Button>
        ) : (
          <Button onClick={handlePause} variant="destructive" size="sm">
            <Square className="w-4 h-4 mr-1" />Pause
          </Button>
        )}

        <Button onClick={props.onReset} variant="secondary" size="sm" disabled={props.isRunning}>
          <RotateCcw className="w-4 h-4" />
        </Button>
        <Button onClick={props.onDeleteAllPrompts} variant="secondary" size="sm" disabled={props.prompts.length === 0 || props.isRunning} className="text-[var(--color-error)]">
          <Trash2 className="w-4 h-4" />
        </Button>
        <Button onClick={props.onDownloadAllImages} variant="outline" size="sm" disabled={completedCount === 0}>
          <Download className="w-4 h-4" />
        </Button>
        {props.onOpenTransferDialog && (
          <Button onClick={props.onOpenTransferDialog} variant="outline" size="sm" disabled={completedCount === 0} title="Transfer to Rescaler">
            <ArrowRight className="w-4 h-4" />
          </Button>
        )}

        <div className="w-px h-5 bg-[var(--color-border)]/50" />

        {/* View Toggle */}
        <div className="flex items-center bg-[var(--color-background)]/50 rounded-lg p-0.5">
          <button
            onClick={() => setViewMode("carousel")}
            className={cn(
              "px-2 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1",
              viewMode === "carousel" ? "bg-[var(--color-primary)] text-white" : "text-[var(--color-text-muted)]"
            )}
          >
            <Layers className="w-3 h-3" />Carousel
          </button>
          <button
            onClick={() => setViewMode("grid")}
            className={cn(
              "px-2 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1",
              viewMode === "grid" ? "bg-[var(--color-primary)] text-white" : "text-[var(--color-text-muted)]"
            )}
          >
            <Grid3X3 className="w-3 h-3" />Grid
          </button>
        </div>

        {/* Stats with Dynamic Total Cost */}
        {(() => {
          const estimatedCost = calculateTotalEstimatedCost(
            props.mode,
            validPromptsCount,
            {
              imageModel: props.aiModel,
              imageSize: props.imageSize,
              videoModel: props.videoModel,
              videoQuality: props.videoQuality,
              videoDuration: props.videoDuration,
            }
          )
          return (
            <div className="flex items-center gap-3 ml-2 text-xs">
              <div className="flex items-center gap-1">
                <span className="font-mono font-bold text-[var(--color-text)]">{props.prompts.length}</span>
                <span className="text-[var(--color-text-dim)]">/</span>
                <span className="font-mono font-bold text-[var(--color-primary)]">{validPromptsCount}</span>
                <span className="text-[var(--color-text-dim)]">/</span>
                <span className="font-mono font-bold text-[var(--color-success)]">{completedCount}</span>
              </div>
              <div className="w-px h-4 bg-[var(--color-border)]" />
              <div className="flex items-center gap-1">
                <span className="text-[var(--color-text-dim)]">Est:</span>
                <span className={cn(
                  "font-bold px-1.5 py-0.5 rounded text-[10px]",
                  estimatedCost.isFree 
                    ? "text-green-400 bg-green-500/20" 
                    : "text-yellow-400 bg-yellow-500/20"
                )}>
                  {estimatedCost.formattedTotal}
                </span>
              </div>
            </div>
          )
        })()}
      </div>

      {/* Prompts Display - Vertical Cards */}
      <div className="flex-1 mb-4">
        {props.prompts.length > 0 ? (
          viewMode === "carousel" ? (
            /* Horizontal Sliding Carousel - 3 vertical prompts visible */
            <div className="relative">
              {/* Navigation Arrows */}
              {carouselIndex > 0 && (
                <button
                  onClick={handlePrevSlide}
                  className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 bg-[var(--color-surface)]/90 backdrop-blur-sm rounded-full border border-[var(--color-border)] flex items-center justify-center hover:bg-[var(--color-surface)] transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}
              {carouselIndex < maxIndex && (
                <button
                  onClick={handleNextSlide}
                  className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 bg-[var(--color-surface)]/90 backdrop-blur-sm rounded-full border border-[var(--color-border)] flex items-center justify-center hover:bg-[var(--color-surface)] transition-colors"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              )}

              {/* Carousel Track */}
              <div className="overflow-hidden mx-12">
                <div 
                  className="flex gap-4 transition-transform duration-300 ease-out justify-center"
                  style={{ transform: `translateX(-${carouselIndex * 336}px)` }}
                >
                  {props.prompts.map((promptItem, index) => (
                    <div key={promptItem.id}>
                      {renderPromptCard(promptItem, index)}
                    </div>
                  ))}
                </div>
              </div>

              {/* Pagination Dots */}
              {props.prompts.length > visibleCount && (
                <div className="flex justify-center gap-1.5 mt-4">
                  {Array.from({ length: Math.ceil(props.prompts.length / visibleCount) }).map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCarouselIndex(i * visibleCount)}
                      className={cn(
                        "w-2 h-2 rounded-full transition-all",
                        Math.floor(carouselIndex / visibleCount) === i
                          ? "w-6 bg-[var(--color-primary)]"
                          : "bg-[var(--color-border)] hover:bg-[var(--color-border-bright)]"
                      )}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Grid View - Vertical Cards */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {props.prompts.map((promptItem, index) => (
                <div key={promptItem.id}>
                  {renderPromptCard(promptItem, index)}
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="flex-1 bg-[var(--color-surface)]/90 backdrop-blur-sm rounded-2xl border border-[var(--color-border)]/50 p-12 flex items-center justify-center min-h-[300px]">
            <div className="text-center">
              <ImageIcon className="w-16 h-16 text-[var(--color-text-muted)] mx-auto mb-4 opacity-20" />
              <p className="text-lg text-[var(--color-text-muted)] mb-1">No prompts yet</p>
              <p className="text-sm text-[var(--color-text-dim)]">Click "+1" to add a prompt</p>
            </div>
          </div>
        )}
      </div>

      {/* AI Chat Button */}
      {!isChatOpen && (
        <button
          onClick={() => setIsChatOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-accent)] text-white rounded-full shadow-lg hover:shadow-xl transition-all flex items-center justify-center hover:scale-110"
        >
          <MessageSquare className="w-6 h-6" />
        </button>
      )}

      {/* Full InlineChat Integration */}
      <InlineChat
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        onPromptsExtracted={(prompts, durations) => {
          setIsChatOpen(false)
          props.onPromptsExtracted(prompts, durations)
        }}
        onChatUsage={props.onChatUsage}
        disabled={props.isRunning}
        mode={props.mode}
        activeStoryBase={props.activeStoryBase}
      />

      {/* Click outside to close dropdowns */}
      {(activeSettingDropdown || isAvatarsOpen) && (
        <div className="fixed inset-0 z-40" onClick={() => {
          setActiveSettingDropdown(null)
          setIsAvatarsOpen(false)
        }} />
      )}
    </div>
  )
}
