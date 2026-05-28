import { useState, useRef } from "react"
import { Loader2, Check, X, Download, Image as ImageIcon, Trash2, Expand, RotateCw, Upload, XCircle, Video, Music, Play, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { Textarea } from "./Textarea"
import { Button } from "./Button"

export type PromptStatus = "idle" | "queued" | "processing" | "completed" | "error"

// Video generation mode types
export type VideoInputMode = "text-to-video" | "image-to-video" | "frames-to-video"

export interface PromptItem {
  id: string
  prompt: string
  status: PromptStatus
  imageUrl?: string
  fileName?: string
  error?: string
  referenceImage?: string // Base64 encoded reference image (legacy, for image mode)
  referenceImageName?: string
  videoUrl?: string
  videoFileName?: string
  audioBase64?: string // Base64 encoded audio for video generation
  audioFileName?: string
  videoDuration?: number // Individual video duration per prompt (for batch)
  originalVideoDuration?: number // Original duration before model switch (for preservation)
  // Video-specific fields
  videoInputMode?: VideoInputMode // How to generate video
  referenceImages?: string[] // Up to 3 reference images for Veo (character/product consistency)
  referenceImageNames?: string[]
  styleImage?: string // Single style image for Veo
  styleImageName?: string
  firstFrame?: string // First frame for frames-to-video
  firstFrameName?: string
  lastFrame?: string // Last frame for frames-to-video
  lastFrameName?: string
  videoAspectRatio?: string // Per-prompt aspect ratio for video
}

interface PromptCardProps {
  item: PromptItem
  index: number
  onChange: (id: string, prompt: string) => void
  onDelete: (id: string) => void
  onRegenerate?: (id: string) => void
  onReferenceImageChange?: (id: string, imageBase64: string | undefined, imageName: string | undefined) => void
  onAudioChange?: (id: string, audioBase64: string | undefined, audioFileName: string | undefined) => void
  onGenerateVideo?: (id: string) => void
  videoModel?: string
  mode?: "image" | "video"
  onVideoDurationChange?: (id: string, duration: number) => void
  getDurationLimits?: (model: string) => { min: number; max: number }
  getAllowedDurations?: (model: string) => number[]
  // Video-specific handlers
  onVideoInputModeChange?: (id: string, mode: VideoInputMode) => void
  onReferenceImagesChange?: (id: string, images: string[], names: string[]) => void
  onStyleImageChange?: (id: string, image: string | undefined, name: string | undefined) => void
  onFirstFrameChange?: (id: string, image: string | undefined, name: string | undefined) => void
  onLastFrameChange?: (id: string, image: string | undefined, name: string | undefined) => void
  onVideoAspectRatioChange?: (id: string, ratio: string) => void
  getVideoAspectRatios?: (model: string) => { value: string; label: string }[]
  disabled?: boolean
}

export function PromptCard({ item, index, onChange, onDelete, onRegenerate, onReferenceImageChange, onAudioChange, onGenerateVideo, videoModel = "animatediff", mode = "image", onVideoDurationChange, getDurationLimits, getAllowedDurations, onVideoInputModeChange, onReferenceImagesChange, onStyleImageChange, onFirstFrameChange, onLastFrameChange, onVideoAspectRatioChange, getVideoAspectRatios, disabled }: PromptCardProps) {
  const [showPreview, setShowPreview] = useState(false)
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [isDraggingOverTextarea, setIsDraggingOverTextarea] = useState(false)
  const [isEditingForRegenerate, setIsEditingForRegenerate] = useState(false)
  const [savedResult, setSavedResult] = useState<{imageUrl?: string, fileName?: string, videoUrl?: string, videoFileName?: string} | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const dropZoneRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLDivElement>(null)

  const processImageFile = (file: File) => {
    if (!file.type.startsWith("image/") || !onReferenceImageChange) return

    const reader = new FileReader()
    reader.onload = () => {
      const base64 = reader.result as string
      onReferenceImageChange(item.id, base64, file.name)
    }
    reader.readAsDataURL(file)
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    processImageFile(file)
  }

  const handleDragOver = (e: React.DragEvent) => {
    if (item.status !== "idle" || disabled || !onReferenceImageChange) return
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    if (item.status !== "idle" || disabled || !onReferenceImageChange) return

    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      processImageFile(files[0]) // Only take the first file for reference images
    }
  }

  const removeReferenceImage = () => {
    if (onReferenceImageChange) {
      onReferenceImageChange(item.id, undefined, undefined)
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !onAudioChange) return

    const reader = new FileReader()
    reader.onload = () => {
      const base64 = reader.result as string
      onAudioChange(item.id, base64, file.name)
    }
    reader.readAsDataURL(file)
  }

  const removeAudio = () => {
    if (onAudioChange) {
      onAudioChange(item.id, undefined, undefined)
    }
    if (audioInputRef.current) {
      audioInputRef.current.value = ""
    }
  }

  const handleGenerateVideo = async () => {
    if (!onGenerateVideo) return
    setIsGeneratingVideo(true)
    try {
      await onGenerateVideo(item.id)
    } finally {
      setIsGeneratingVideo(false)
    }
  }

  const handleRegenerateClick = () => {
    if (!onRegenerate) return
    // Save current result
    setSavedResult({
      imageUrl: item.imageUrl,
      fileName: item.fileName,
      videoUrl: item.videoUrl,
      videoFileName: item.videoFileName,
    })
    // Enter edit mode
    setIsEditingForRegenerate(true)
  }

  const handleConfirmRegenerate = () => {
    if (!onRegenerate) return
    setIsEditingForRegenerate(false)
    setSavedResult(null)
    onRegenerate(item.id)
  }

  const handleCancelRegenerate = () => {
    // Don't call regenerate, just exit edit mode
    setIsEditingForRegenerate(false)
    setSavedResult(null)
  }

  const statusConfig = {
    idle: {
      icon: null,
      text: "Ready",
      color: "text-[var(--color-text-dim)]",
      bg: "bg-[var(--color-surface)]",
      border: "border-[var(--color-border)]",
    },
    queued: {
      icon: <div className="w-2 h-2 rounded-full bg-[var(--color-warning)] animate-pulse" />,
      text: "Queued",
      color: "text-[var(--color-warning)]",
      bg: "bg-amber-950/20",
      border: "border-amber-900/50",
    },
    processing: {
      icon: <Loader2 className="w-4 h-4 animate-spin text-[var(--color-accent)]" />,
      text: "Generating...",
      color: "text-[var(--color-accent)]",
      bg: "bg-cyan-950/20",
      border: "border-cyan-900/50 animate-pulse-glow",
    },
    completed: {
      icon: <Check className="w-4 h-4 text-[var(--color-success)]" />,
      text: "Completed",
      color: "text-[var(--color-success)]",
      bg: "bg-emerald-950/20",
      border: "border-emerald-900/50",
    },
    error: {
      icon: <X className="w-4 h-4 text-[var(--color-error)]" />,
      text: "Failed",
      color: "text-[var(--color-error)]",
      bg: "bg-red-950/20",
      border: "border-red-900/50",
    },
  }

  const status = statusConfig[item.status]

  return (
    <div
      className={cn(
        "relative rounded-xl border p-4 transition-all duration-300 animate-fade-in-up",
        status.bg,
        status.border,
        // Make card larger in video mode to accommodate all video controls
        mode === "video" && "min-h-[400px]"
      )}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-[var(--color-text-dim)] bg-[var(--color-background)] px-2 py-1 rounded">
            #{index + 1}
          </span>
          <div className="flex items-center gap-2">
            {status.icon}
            <span className={cn("text-xs font-medium", status.color)}>
              {status.text}
            </span>
          </div>
        </div>
        
        {item.status === "idle" && (
          <div className="flex items-center gap-1">
            {item.prompt && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
                onClick={() => onChange(item.id, "")}
                disabled={disabled}
                title="Clear text"
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-[var(--color-text-dim)] hover:text-[var(--color-error)]"
            onClick={() => onDelete(item.id)}
            disabled={disabled}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
          </div>
        )}
      </div>

      {/* Textarea with drag and drop */}
      <div
        ref={textareaRef}
        className="relative"
        onDragOver={(e) => {
          if (item.status === "idle" && !disabled && onReferenceImageChange) {
            e.preventDefault()
            e.stopPropagation()
            setIsDraggingOverTextarea(true)
          }
        }}
        onDragLeave={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setIsDraggingOverTextarea(false)
        }}
        onDrop={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setIsDraggingOverTextarea(false)

          if (item.status !== "idle" || disabled || !onReferenceImageChange) return

          const files = e.dataTransfer.files
          if (files && files.length > 0) {
            processImageFile(files[0])
          }
        }}
      >
      <Textarea
        value={item.prompt}
        onChange={(e) => onChange(item.id, e.target.value)}
          placeholder={mode === "video" 
            ? "Describe your video scene in detail... Include camera movements, actions, lighting, mood, and style."
            : "Enter your image prompt..."}
        className={cn(
            "text-sm relative z-10",
            mode === "video" ? "min-h-[120px]" : "min-h-[80px]",
            item.status !== "idle" && !isEditingForRegenerate && "opacity-70 cursor-not-allowed",
            isDraggingOverTextarea && "ring-2 ring-[var(--color-primary)] ring-offset-2",
            isEditingForRegenerate && "ring-2 ring-[var(--color-warning)] ring-offset-2"
        )}
        disabled={(item.status !== "idle" && !isEditingForRegenerate) || disabled}
      />
        {isDraggingOverTextarea && (
          <div className="absolute inset-0 bg-[var(--color-primary)]/10 border-2 border-dashed border-[var(--color-primary)] rounded-lg flex items-center justify-center z-20 pointer-events-none">
            <div className="text-sm font-medium text-[var(--color-primary)]">Drop image here</div>
          </div>
        )}
      </div>

      {/* Elegant Action Buttons Row - Directly below prompt textarea */}
      {item.status === "idle" && !isEditingForRegenerate && (
        <div className="mt-2 p-1.5 bg-[var(--color-surface)]/50 rounded-lg border border-[var(--color-border)] flex items-center gap-1">
          {/* Reference Image Upload (Image mode only) */}
          {mode === "image" && onReferenceImageChange && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageUpload}
                disabled={disabled}
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled}
                title="Upload Reference Image"
                className="h-7 w-7"
              >
                <ImageIcon className="w-3.5 h-3.5" />
              </Button>
            </>
          )}
          
          {/* Spacer */}
          <div className="flex-1" />
          
          {/* Clear Text Button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onChange(item.id, "")}
            disabled={disabled}
            title="Clear prompt text"
            className="h-7 w-7 text-[var(--color-text-dim)] hover:text-[var(--color-error)]"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}

      {/* Edit for Regenerate Controls */}
      {isEditingForRegenerate && (
        <div className="mt-3 p-3 bg-amber-950/20 border border-amber-900/50 rounded-lg">
          <p className="text-xs text-[var(--color-warning)] mb-2 font-medium">Edit prompt and confirm to regenerate</p>
          <div className="flex gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={handleConfirmRegenerate}
              disabled={disabled || !item.prompt.trim()}
              className="flex-1"
            >
              <Check className="w-3 h-3 mr-1" />
              Confirm & Regenerate
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancelRegenerate}
              disabled={disabled}
              className="flex-1"
            >
              <X className="w-3 h-3 mr-1" />
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Video Controls (only in video mode) */}
      {mode === "video" && item.status === "idle" && (
        <div className="mt-4 pt-4 border-t border-[var(--color-border)] space-y-4">
          {/* Section Header */}
          <div className="flex items-center gap-2 mb-2">
            <Video className="w-4 h-4 text-[var(--color-primary)]" />
            <span className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Video Settings</span>
          </div>
          {/* Row 1: Duration and Aspect Ratio */}
          <div className="grid grid-cols-2 gap-2">
            {/* Video Duration */}
            {onVideoDurationChange && getAllowedDurations && videoModel && (
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">
                  Duration
                </label>
                <select
                  value={item.videoDuration || getAllowedDurations(videoModel)[0]}
                  onChange={(e) => onVideoDurationChange(item.id, Number(e.target.value))}
                  disabled={disabled}
                  className="w-full h-8 px-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-xs text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] cursor-pointer"
                >
                  {getAllowedDurations(videoModel).map((duration) => (
                    <option key={duration} value={duration}>
                      {duration}s
                    </option>
                  ))}
                </select>
              </div>
            )}
            
            {/* Aspect Ratio */}
            {onVideoAspectRatioChange && getVideoAspectRatios && videoModel && (
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">
                  Aspect Ratio
                </label>
                <select
                  value={item.videoAspectRatio || "16:9"}
                  onChange={(e) => onVideoAspectRatioChange(item.id, e.target.value)}
                  disabled={disabled}
                  className="w-full h-8 px-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-xs text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] cursor-pointer"
                >
                  {getVideoAspectRatios(videoModel).map((ratio) => (
                    <option key={ratio.value} value={ratio.value}>
                      {ratio.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Video Input Mode (Veo models) */}
          {(videoModel === "veo-3" || videoModel === "veo-3.1") && onVideoInputModeChange && (
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">
                Generation Mode
              </label>
              <div className="grid grid-cols-3 gap-1">
                <button
                  type="button"
                  onClick={() => onVideoInputModeChange(item.id, "text-to-video")}
                  disabled={disabled}
                  className={cn(
                    "px-2 py-1.5 text-xs rounded-lg border transition-colors",
                    (item.videoInputMode || "text-to-video") === "text-to-video"
                      ? "bg-[var(--color-primary)] text-white border-[var(--color-primary)]"
                      : "bg-[var(--color-surface)] text-[var(--color-text-muted)] border-[var(--color-border)] hover:border-[var(--color-primary)]"
                  )}
                >
                  Text→Video
                </button>
                <button
                  type="button"
                  onClick={() => onVideoInputModeChange(item.id, "image-to-video")}
                  disabled={disabled}
                  className={cn(
                    "px-2 py-1.5 text-xs rounded-lg border transition-colors",
                    item.videoInputMode === "image-to-video"
                      ? "bg-[var(--color-primary)] text-white border-[var(--color-primary)]"
                      : "bg-[var(--color-surface)] text-[var(--color-text-muted)] border-[var(--color-border)] hover:border-[var(--color-primary)]"
                  )}
                >
                  Image→Video
                </button>
                <button
                  type="button"
                  onClick={() => onVideoInputModeChange(item.id, "frames-to-video")}
                  disabled={disabled}
                  className={cn(
                    "px-2 py-1.5 text-xs rounded-lg border transition-colors",
                    item.videoInputMode === "frames-to-video"
                      ? "bg-[var(--color-primary)] text-white border-[var(--color-primary)]"
                      : "bg-[var(--color-surface)] text-[var(--color-text-muted)] border-[var(--color-border)] hover:border-[var(--color-primary)]"
                  )}
                >
                  Frames→Video
                </button>
              </div>
            </div>
          )}

          {/* Sora 2 Input Mode (simpler) */}
          {videoModel === "sora-2" && onVideoInputModeChange && (
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">
                Generation Mode
              </label>
              <div className="grid grid-cols-2 gap-1">
                <button
                  type="button"
                  onClick={() => onVideoInputModeChange(item.id, "text-to-video")}
                  disabled={disabled}
                  className={cn(
                    "px-2 py-1.5 text-xs rounded-lg border transition-colors",
                    (item.videoInputMode || "text-to-video") === "text-to-video"
                      ? "bg-[var(--color-primary)] text-white border-[var(--color-primary)]"
                      : "bg-[var(--color-surface)] text-[var(--color-text-muted)] border-[var(--color-border)] hover:border-[var(--color-primary)]"
                  )}
                >
                  Text→Video
                </button>
                <button
                  type="button"
                  onClick={() => onVideoInputModeChange(item.id, "image-to-video")}
                  disabled={disabled}
                  className={cn(
                    "px-2 py-1.5 text-xs rounded-lg border transition-colors",
                    item.videoInputMode === "image-to-video"
                      ? "bg-[var(--color-primary)] text-white border-[var(--color-primary)]"
                      : "bg-[var(--color-surface)] text-[var(--color-text-muted)] border-[var(--color-border)] hover:border-[var(--color-primary)]"
                  )}
                >
                  Image→Video
                </button>
              </div>
            </div>
          )}

          {/* Reference Images for Veo (up to 3) - shown in text-to-video mode */}
          {(videoModel === "veo-3" || videoModel === "veo-3.1") && 
           (item.videoInputMode || "text-to-video") === "text-to-video" && 
           onReferenceImagesChange && (
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">
                Reference Images <span className="text-[var(--color-text-dim)]">(up to 3 for consistency)</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {(item.referenceImages || []).map((img, idx) => (
                  <div key={idx} className="relative group">
                    <img
                      src={img}
                      alt={`Ref ${idx + 1}`}
                      className="w-14 h-14 object-cover rounded-lg border border-[var(--color-border)]"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const newImages = [...(item.referenceImages || [])]
                        const newNames = [...(item.referenceImageNames || [])]
                        newImages.splice(idx, 1)
                        newNames.splice(idx, 1)
                        onReferenceImagesChange(item.id, newImages, newNames)
                      }}
                      disabled={disabled}
                      className="absolute -top-1 -right-1 w-4 h-4 bg-[var(--color-error)] text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                {(item.referenceImages?.length || 0) < 3 && (
                  <label className="w-14 h-14 flex items-center justify-center border-2 border-dashed border-[var(--color-border)] rounded-lg cursor-pointer hover:border-[var(--color-primary)] transition-colors">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={disabled}
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        const reader = new FileReader()
                        reader.onload = () => {
                          const newImages = [...(item.referenceImages || []), reader.result as string]
                          const newNames = [...(item.referenceImageNames || []), file.name]
                          onReferenceImagesChange(item.id, newImages, newNames)
                        }
                        reader.readAsDataURL(file)
                        e.target.value = ""
                      }}
                    />
                    <Plus className="w-5 h-5 text-[var(--color-text-dim)]" />
                  </label>
                )}
              </div>
            </div>
          )}

          {/* Single Reference Image for Sora 2 - shown in image-to-video mode */}
          {videoModel === "sora-2" && item.videoInputMode === "image-to-video" && onReferenceImageChange && (
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">
                Source Image <span className="text-[var(--color-text-dim)]">(to animate)</span>
              </label>
              {item.referenceImage ? (
                <div className="flex items-center gap-2 p-2 bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)]">
                  <img
                    src={item.referenceImage}
                    alt="Source"
                    className="w-12 h-12 object-cover rounded-md border border-[var(--color-border)]"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[var(--color-text-muted)] truncate">
                      {item.referenceImageName || "Source image"}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-[var(--color-text-dim)] hover:text-[var(--color-error)]"
                    onClick={removeReferenceImage}
                    disabled={disabled}
                  >
                    <XCircle className="w-3 h-3" />
                  </Button>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-2 p-3 border-2 border-dashed border-[var(--color-border)] rounded-lg cursor-pointer hover:border-[var(--color-primary)] transition-colors">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={disabled}
                    onChange={handleImageUpload}
                  />
                  <Upload className="w-4 h-4 text-[var(--color-text-dim)]" />
                  <span className="text-xs text-[var(--color-text-muted)]">Upload image</span>
                </label>
              )}
            </div>
          )}

          {/* Image-to-Video for Veo */}
          {(videoModel === "veo-3" || videoModel === "veo-3.1") && 
           item.videoInputMode === "image-to-video" && onReferenceImageChange && (
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">
                Source Image <span className="text-[var(--color-text-dim)]">(to animate)</span>
              </label>
              {item.referenceImage ? (
                <div className="flex items-center gap-2 p-2 bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)]">
                  <img
                    src={item.referenceImage}
                    alt="Source"
                    className="w-12 h-12 object-cover rounded-md border border-[var(--color-border)]"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[var(--color-text-muted)] truncate">
                      {item.referenceImageName || "Source image"}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-[var(--color-text-dim)] hover:text-[var(--color-error)]"
                    onClick={removeReferenceImage}
                    disabled={disabled}
                  >
                    <XCircle className="w-3 h-3" />
                  </Button>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-2 p-3 border-2 border-dashed border-[var(--color-border)] rounded-lg cursor-pointer hover:border-[var(--color-primary)] transition-colors">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={disabled}
                    onChange={handleImageUpload}
                  />
                  <Upload className="w-4 h-4 text-[var(--color-text-dim)]" />
                  <span className="text-xs text-[var(--color-text-muted)]">Upload image</span>
                </label>
              )}
            </div>
          )}

          {/* Frames-to-Video for Veo (first and last frame) */}
          {(videoModel === "veo-3" || videoModel === "veo-3.1") && 
           item.videoInputMode === "frames-to-video" && 
           onFirstFrameChange && onLastFrameChange && (
            <div className="grid grid-cols-2 gap-2">
              {/* First Frame */}
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">
                  First Frame
                </label>
                {item.firstFrame ? (
                  <div className="relative group">
                    <img
                      src={item.firstFrame}
                      alt="First frame"
                      className="w-full h-20 object-cover rounded-lg border border-[var(--color-border)]"
                    />
                    <button
                      type="button"
                      onClick={() => onFirstFrameChange(item.id, undefined, undefined)}
                      disabled={disabled}
                      className="absolute top-1 right-1 w-5 h-5 bg-[var(--color-error)] text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center h-20 border-2 border-dashed border-[var(--color-border)] rounded-lg cursor-pointer hover:border-[var(--color-primary)] transition-colors">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={disabled}
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        const reader = new FileReader()
                        reader.onload = () => {
                          onFirstFrameChange(item.id, reader.result as string, file.name)
                        }
                        reader.readAsDataURL(file)
                        e.target.value = ""
                      }}
                    />
                    <Upload className="w-4 h-4 text-[var(--color-text-dim)]" />
                    <span className="text-xs text-[var(--color-text-dim)] mt-1">Start</span>
                  </label>
                )}
              </div>
              
              {/* Last Frame */}
              <div>
                <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">
                  Last Frame
                </label>
                {item.lastFrame ? (
                  <div className="relative group">
                    <img
                      src={item.lastFrame}
                      alt="Last frame"
                      className="w-full h-20 object-cover rounded-lg border border-[var(--color-border)]"
                    />
                    <button
                      type="button"
                      onClick={() => onLastFrameChange(item.id, undefined, undefined)}
                      disabled={disabled}
                      className="absolute top-1 right-1 w-5 h-5 bg-[var(--color-error)] text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center h-20 border-2 border-dashed border-[var(--color-border)] rounded-lg cursor-pointer hover:border-[var(--color-primary)] transition-colors">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={disabled}
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        const reader = new FileReader()
                        reader.onload = () => {
                          onLastFrameChange(item.id, reader.result as string, file.name)
                        }
                        reader.readAsDataURL(file)
                        e.target.value = ""
                      }}
                    />
                    <Upload className="w-4 h-4 text-[var(--color-text-dim)]" />
                    <span className="text-xs text-[var(--color-text-dim)] mt-1">End</span>
                  </label>
                )}
              </div>
            </div>
          )}

          {/* Style Image for Veo (optional, in text-to-video mode) */}
          {(videoModel === "veo-3" || videoModel === "veo-3.1") && 
           (item.videoInputMode || "text-to-video") === "text-to-video" && 
           onStyleImageChange && (
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-1">
                Style Image <span className="text-[var(--color-text-dim)]">(optional)</span>
              </label>
              {item.styleImage ? (
                <div className="flex items-center gap-2 p-2 bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)]">
                  <img
                    src={item.styleImage}
                    alt="Style"
                    className="w-10 h-10 object-cover rounded-md border border-[var(--color-border)]"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[var(--color-text-muted)] truncate">
                      {item.styleImageName || "Style image"}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-[var(--color-text-dim)] hover:text-[var(--color-error)]"
                    onClick={() => onStyleImageChange(item.id, undefined, undefined)}
                    disabled={disabled}
                  >
                    <XCircle className="w-3 h-3" />
                  </Button>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-2 p-2 border border-dashed border-[var(--color-border)] rounded-lg cursor-pointer hover:border-[var(--color-primary)] transition-colors">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={disabled}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      const reader = new FileReader()
                      reader.onload = () => {
                        onStyleImageChange(item.id, reader.result as string, file.name)
                      }
                      reader.readAsDataURL(file)
                      e.target.value = ""
                    }}
                  />
                  <ImageIcon className="w-3 h-3 text-[var(--color-text-dim)]" />
                  <span className="text-xs text-[var(--color-text-muted)]">Add style</span>
                </label>
              )}
            </div>
          )}
        </div>
      )}

      {/* Reference Image Upload (Image mode only) */}
      {mode === "image" && item.status === "idle" && onReferenceImageChange && (
        <div 
          ref={dropZoneRef}
          className={cn(
            "mt-3 relative transition-colors",
            isDragging && "ring-2 ring-[var(--color-primary)] ring-offset-2 rounded-lg"
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
            disabled={disabled}
          />
          
          {isDragging && !item.referenceImage && (
            <div className="absolute inset-0 z-10 bg-[var(--color-primary)]/10 border-2 border-dashed border-[var(--color-primary)] rounded-lg flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <ImageIcon className="w-8 h-8 mx-auto mb-1 text-[var(--color-primary)]" />
                <p className="text-xs font-medium text-[var(--color-primary)]">Drop image here</p>
              </div>
            </div>
          )}
          
          {item.referenceImage ? (
            <div className="flex items-center gap-3 p-2 bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)]">
              <img
                src={item.referenceImage}
                alt="Reference"
                className="w-12 h-12 object-cover rounded-md border border-[var(--color-border)]"
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[var(--color-text-muted)] truncate">
                  {item.referenceImageName || "Reference image"}
                </p>
                <p className="text-xs text-[var(--color-accent)]">Reference image attached</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-[var(--color-text-dim)] hover:text-[var(--color-error)]"
                onClick={removeReferenceImage}
                disabled={disabled}
              >
                <XCircle className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs gap-2"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
            >
              <Upload className="w-3 h-3" />
              Add Reference Image (optional)
            </Button>
          )}
        </div>
      )}

      {/* Error message */}
      {item.status === "error" && item.error && (
        <p className="mt-2 text-xs text-[var(--color-error)]">{item.error}</p>
      )}

      {/* Image preview and download */}
      {item.status === "completed" && item.imageUrl && (
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-4">
            <button
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setShowPreview(true)
              }}
              className="relative group cursor-pointer flex-shrink-0"
              type="button"
            >
              <img
                src={item.imageUrl}
                alt={`Generated: ${item.prompt.slice(0, 30)}...`}
                className="w-20 h-20 object-cover rounded-lg border border-[var(--color-border)] shadow-lg transition-transform group-hover:scale-105"
                onError={(e) => {
                  console.error("Failed to load image:", item.imageUrl)
                  const target = e.currentTarget as HTMLImageElement
                  if (!target.src.includes("placeholder")) {
                    target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect fill='%23ccc' width='100' height='100'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999' font-size='12'%3EImage not found%3C/text%3E%3C/svg%3E"
                  }
                }}
              />
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center pointer-events-none">
                <Expand className="w-5 h-5 text-white" />
              </div>
            </button>
            <div className="flex-1 space-y-2">
              <p className="text-xs text-[var(--color-text-muted)] font-mono truncate">
                {item.fileName}
              </p>
              {/* Elegant Action Buttons Row for Completed Items */}
              <div className="p-1.5 bg-[var(--color-surface)]/50 rounded-lg border border-[var(--color-border)] flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    const a = document.createElement('a')
                    a.href = item.imageUrl!
                    a.download = item.fileName!
                    a.click()
                  }}
                  title="Download Image"
                  className="h-7 w-7"
                >
                  <Download className="w-3.5 h-3.5" />
                </Button>
                
                {/* Add Audio Button (if video generation available) */}
                {((videoModel === "veo-3" || videoModel === "veo-3.1" || videoModel === "sora-2") && (item.prompt.trim() || item.imageUrl || item.referenceImage) || (item.imageUrl || item.referenceImage)) && (
                  <>
                    <input
                      ref={audioInputRef}
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      onChange={handleAudioUpload}
                      disabled={disabled || isGeneratingVideo}
                    />
                    {item.audioBase64 ? (
                      <div className="flex items-center gap-1 px-2 py-1 bg-[var(--color-background)] rounded text-xs">
                        <Music className="w-3 h-3 text-[var(--color-accent)]" />
                        <span className="truncate max-w-[80px]">{item.audioFileName}</span>
                        <button
                          onClick={removeAudio}
                          className="text-[var(--color-error)] hover:text-[var(--color-error)]/80"
                          type="button"
                        >
                          <XCircle className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => audioInputRef.current?.click()}
                        disabled={disabled || isGeneratingVideo}
                        title="Add Audio"
                        className="h-7 w-7"
                      >
                        <Music className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    
                    {/* Generate Video Button */}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleGenerateVideo}
                      disabled={disabled || isGeneratingVideo || (!item.imageUrl && !item.referenceImage && !item.prompt.trim() && (videoModel === "veo-3" || videoModel === "veo-3.1" || videoModel === "sora-2"))}
                      title={isGeneratingVideo ? "Generating Video..." : (item.imageUrl || item.referenceImage) ? "Animate Image" : "Generate Video"}
                      className="h-7 w-7"
                    >
                      {isGeneratingVideo ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Video className="w-3.5 h-3.5" />
                      )}
                    </Button>
                  </>
                )}
                
                {/* Regenerate Button */}
                {onRegenerate && !isEditingForRegenerate && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleRegenerateClick}
                    disabled={disabled}
                    title="Regenerate"
                    className="h-7 w-7"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Image Modal */}
      {showPreview && item.imageUrl && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-sm animate-fade-in-up"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowPreview(false)
            }
          }}
          style={{ position: "fixed" }}
        >
          <div 
            className="relative max-w-[90vw] max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={item.imageUrl}
              alt={item.prompt}
              className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
              onError={(e) => {
                console.error("Failed to load preview image:", item.imageUrl)
                const target = e.currentTarget as HTMLImageElement
                if (!target.src.includes("placeholder")) {
                  target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300'%3E%3Crect fill='%23ccc' width='400' height='300'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%23999' font-size='16'%3EImage not found%3C/text%3E%3C/svg%3E"
                }
              }}
            />
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent rounded-b-lg">
              <p className="text-white text-sm mb-2 line-clamp-2">{item.prompt}</p>
              <div className="flex items-center gap-3">
                <a
                  href={item.imageUrl}
                  download={item.fileName}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] rounded-lg transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Download
                </a>
                <button
                  onClick={() => setShowPreview(false)}
                  className="px-4 py-2 text-sm font-medium text-white/80 hover:text-white transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
            <button
              onClick={() => setShowPreview(false)}
              className="absolute top-4 right-4 p-2 text-white/80 hover:text-white bg-black/50 rounded-full transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

