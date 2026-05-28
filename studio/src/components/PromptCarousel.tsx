// ============================================================
// DNK AI Studio - Simple Prompt Grid
// ============================================================

import { PromptCard, PromptItem, VideoInputMode } from "./PromptCard"
import { cn } from "@/lib/utils"

interface PromptCarouselProps {
  prompts: PromptItem[]
  mode: "image" | "video"
  isRunning: boolean
  videoModel: string
  onPromptChange: (id: string, prompt: string) => void
  onPromptDelete: (id: string) => void
  onRegenerate: (id: string) => void
  onReferenceImageChange: (id: string, image: string | undefined, name: string | undefined) => void
  onAudioChange: (id: string, audio: string | undefined, name: string | undefined) => void
  onGenerateVideo: (id: string) => void
  onVideoDurationChange: (id: string, duration: number) => void
  getDurationLimits: (model: string) => { min: number; max: number }
  getAllowedDurations: (model: string) => number[]
  onVideoInputModeChange: (id: string, mode: VideoInputMode) => void
  onReferenceImagesChange: (id: string, images: string[], names: string[]) => void
  onStyleImageChange: (id: string, image: string | undefined, name: string | undefined) => void
  onFirstFrameChange: (id: string, frame: string | undefined, name: string | undefined) => void
  onLastFrameChange: (id: string, frame: string | undefined, name: string | undefined) => void
  onVideoAspectRatioChange: (id: string, ratio: string) => void
  getVideoAspectRatios: (model: string) => { value: string; label: string }[]
}

export function PromptCarousel({
  prompts,
  mode,
  isRunning,
  videoModel,
  onPromptChange,
  onPromptDelete,
  onRegenerate,
  onReferenceImageChange,
  onAudioChange,
  onGenerateVideo,
  onVideoDurationChange,
  getDurationLimits,
  getAllowedDurations,
  onVideoInputModeChange,
  onReferenceImagesChange,
  onStyleImageChange,
  onFirstFrameChange,
  onLastFrameChange,
  onVideoAspectRatioChange,
  getVideoAspectRatios,
}: PromptCarouselProps) {

  if (prompts.length === 0) {
    return null
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--color-text)]">
          Prompts ({prompts.length})
        </h3>
      </div>

      {/* Simple Grid - All prompts displayed going down */}
      <div
        className={cn(
          "grid gap-4",
          mode === "video"
            ? "grid-cols-1 lg:grid-cols-2"
            : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
        )}
      >
        {prompts.map((item, index) => (
          <PromptCard
            key={item.id}
            item={item}
            index={index}
            onChange={onPromptChange}
            onDelete={onPromptDelete}
            onRegenerate={onRegenerate}
            onReferenceImageChange={onReferenceImageChange}
            onAudioChange={onAudioChange}
            onGenerateVideo={onGenerateVideo}
            videoModel={videoModel}
            mode={mode}
            onVideoDurationChange={onVideoDurationChange}
            getDurationLimits={getDurationLimits}
            getAllowedDurations={getAllowedDurations}
            onVideoInputModeChange={onVideoInputModeChange}
            onReferenceImagesChange={onReferenceImagesChange}
            onStyleImageChange={onStyleImageChange}
            onFirstFrameChange={onFirstFrameChange}
            onLastFrameChange={onLastFrameChange}
            onVideoAspectRatioChange={onVideoAspectRatioChange}
            getVideoAspectRatios={getVideoAspectRatios}
            disabled={isRunning}
          />
        ))}
      </div>
    </div>
  )
}
