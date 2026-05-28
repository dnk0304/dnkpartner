import { PromptItem, VideoInputMode } from "@/components/PromptCard"
import { StudioModeType, ImageryStyle, StoryBase } from "@/types/StudioMode"
import { VideoAspectRatio } from "@/constants/models"

/**
 * Props interface for AdvancedModeLayout component
 * Mirrors all functions and state needed from App.tsx
 */
export interface AdvancedModeLayoutProps {
  // Generation Mode & Control
  mode: "image" | "video"
  onModeChange: (mode: "image" | "video") => void
  isRunning: boolean
  onStart: () => void
  onStop: () => void
  onReset: () => void

  // Prompts Management
  prompts: PromptItem[]
  onAddPrompt: () => void
  onAddMultiplePrompts: (count: number) => void
  onUpdatePrompt: (id: string, text: string) => void
  onDeletePrompt: (id: string) => void
  onDeleteAllPrompts: () => void
  onRegenerate: (id: string) => void

  // Image Settings
  aiModel: string
  onAiModelChange: (model: string) => void
  aspectRatio: string
  onAspectRatioChange: (ratio: string) => void
  imageSize: string
  onImageSizeChange: (size: string) => void

  // Video Settings
  videoModel: string
  onVideoModelChange: (model: string) => void
  videoDuration: number
  onVideoDurationChange: (duration: number) => void
  videoQuality: string
  onVideoQualityChange: (quality: string) => void
  videoFPS: number
  onVideoFpsChange: (fps: number) => void
  videoMotionStrength: number
  onVideoMotionStrengthChange: (strength: number) => void

  // Video-specific per-prompt handlers
  onVideoInputModeChange?: (id: string, mode: VideoInputMode) => void
  onReferenceImagesChange?: (id: string, images: string[], names: string[]) => void
  onStyleImageChange?: (id: string, image: string | undefined, name: string | undefined) => void
  onFirstFrameChange?: (id: string, image: string | undefined, name: string | undefined) => void
  onLastFrameChange?: (id: string, image: string | undefined, name: string | undefined) => void
  onVideoAspectRatioChange?: (id: string, ratio: string) => void
  onPerPromptVideoDurationChange?: (id: string, duration: number) => void
  getVideoAspectRatios?: (model: string) => VideoAspectRatio[]
  getAllowedDurations?: (model: string) => number[]
  onReferenceImageChange?: (id: string, imageBase64: string | undefined, imageName: string | undefined) => void

  // Studio Mode
  studioMode: StudioModeType
  onStudioModeChange: (mode: StudioModeType) => void
  selectedImageryStyle: ImageryStyle | null
  onSelectImageryStyle: (style: ImageryStyle | null) => void
  activeStoryBase: StoryBase | null
  activeStoryBaseName: string | undefined
  onOpenStylePicker: () => void
  onOpenStoryBaseManager: () => void

  // AI Chat Integration
  onPromptsExtracted: (prompts: string[], durations?: number[]) => void
  onChatUsage?: (usage: { model: string; inputTokens: number; outputTokens: number }) => void

  // Utilities
  onDownloadAllImages: () => void
  onOpenAIChat: () => void
  onOpenCostSummary: () => void
  onOpenTransferDialog?: () => void

  // Usage & Cost
  usageSummary: {
    today: string
    total: string
  }
}
