import { useState, useCallback, useRef } from "react"
import { Upload, ZoomIn, ZoomOut, RotateCw, X, Check } from "lucide-react"
import { Button } from "./Button"
import { cn } from "@/lib/utils"
import {
  RescalerImage,
  KDPTrimSizeKey,
  KDPPaperType,
  calculateCoverDimensions,
  KDP_TRIM_SIZES,
  generateImageId,
} from "@/types/Rescaler"

interface CoverTemplateEditorProps {
  trimSize: KDPTrimSizeKey
  paperType: KDPPaperType
  pageCount: number
  frontCoverImage?: RescalerImage
  backCoverImage?: RescalerImage
  dpi: number
  onFrontCoverChange: (image: RescalerImage | undefined) => void
  onBackCoverChange: (image: RescalerImage | undefined) => void
}

export function CoverTemplateEditor({
  trimSize,
  paperType,
  pageCount,
  frontCoverImage,
  backCoverImage,
  dpi,
  onFrontCoverChange,
  onBackCoverChange,
}: CoverTemplateEditorProps) {
  const frontInputRef = useRef<HTMLInputElement>(null)
  const backInputRef = useRef<HTMLInputElement>(null)
  const [showGuides, setShowGuides] = useState(true)

  // Calculate cover dimensions
  const coverDims = calculateCoverDimensions(trimSize, pageCount, paperType)
  const trimInfo = KDP_TRIM_SIZES[trimSize]

  // Read file as data URL
  const readFileAsDataURL = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  // Get image dimensions
  const getImageDimensions = (src: string): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve({ width: img.width, height: img.height })
      img.onerror = reject
      img.src = src
    })
  }

  // Handle front cover upload
  const handleFrontCoverUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const file = files[0]
    if (!file.type.startsWith("image/")) return

    const preview = await readFileAsDataURL(file)
    const dimensions = await getImageDimensions(preview)

    const image: RescalerImage = {
      id: generateImageId(),
      file,
      preview,
      originalWidth: dimensions.width,
      originalHeight: dimensions.height,
      targetWidth: trimInfo.width,
      targetHeight: trimInfo.height,
      dpi,
      position: { x: 0, y: 0 },
      scale: 1,
      rotation: 0,
    }

    onFrontCoverChange(image)
  }, [dpi, onFrontCoverChange, trimInfo])

  // Handle back cover upload
  const handleBackCoverUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const file = files[0]
    if (!file.type.startsWith("image/")) return

    const preview = await readFileAsDataURL(file)
    const dimensions = await getImageDimensions(preview)

    const image: RescalerImage = {
      id: generateImageId(),
      file,
      preview,
      originalWidth: dimensions.width,
      originalHeight: dimensions.height,
      targetWidth: trimInfo.width,
      targetHeight: trimInfo.height,
      dpi,
      position: { x: 0, y: 0 },
      scale: 1,
      rotation: 0,
    }

    onBackCoverChange(image)
  }, [dpi, onBackCoverChange, trimInfo])

  // Calculate visual scale for preview (max 600px width)
  const maxPreviewWidth = 600
  const visualScale = maxPreviewWidth / coverDims.totalWidth
  const previewWidth = coverDims.totalWidth * visualScale
  const previewHeight = coverDims.totalHeight * visualScale

  return (
    <div className="space-y-4">
      {/* Cover Information */}
      <div className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg space-y-2">
        <h3 className="font-semibold text-[var(--color-text)]">Cover Specifications</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-[var(--color-text-dim)]">Trim Size:</span>
            <span className="ml-2 text-[var(--color-text)]">{trimInfo.label}</span>
          </div>
          <div>
            <span className="text-[var(--color-text-dim)]">Page Count:</span>
            <span className="ml-2 text-[var(--color-text)]">{pageCount} pages</span>
          </div>
          <div>
            <span className="text-[var(--color-text-dim)]">Spine Width:</span>
            <span className="ml-2 text-[var(--color-text)]">{coverDims.spineWidth.toFixed(3)}"</span>
          </div>
          <div>
            <span className="text-[var(--color-text-dim)]">Total Size:</span>
            <span className="ml-2 text-[var(--color-text)]">
              {coverDims.totalWidth.toFixed(2)}" × {coverDims.totalHeight.toFixed(2)}"
            </span>
          </div>
          <div>
            <span className="text-[var(--color-text-dim)]">Bleed:</span>
            <span className="ml-2 text-[var(--color-text)]">{coverDims.bleed}" (3.2mm)</span>
          </div>
          <div>
            <span className="text-[var(--color-text-dim)]">DPI:</span>
            <span className="ml-2 text-[var(--color-text)]">{dpi}</span>
          </div>
        </div>
        <div className="pt-2 border-t border-[var(--color-border)]">
          <label className="flex items-center gap-2 text-sm text-[var(--color-text-muted)] cursor-pointer">
            <input
              type="checkbox"
              checked={showGuides}
              onChange={(e) => setShowGuides(e.target.checked)}
              className="rounded"
            />
            Show bleed and safe zone guides
          </label>
        </div>
      </div>

      {/* Cover Template Visual */}
      <div className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg">
        <div 
          className="relative mx-auto border-2 border-[var(--color-border)] bg-white"
          style={{ 
            width: `${previewWidth}px`, 
            height: `${previewHeight}px`,
          }}
        >
          {/* Back Cover Area */}
          <div
            className="absolute flex items-center justify-center"
            style={{
              left: `${coverDims.backCoverX * visualScale}px`,
              top: `${coverDims.bleed * visualScale}px`,
              width: `${coverDims.trimWidth * visualScale}px`,
              height: `${coverDims.trimHeight * visualScale}px`,
              backgroundColor: backCoverImage ? "transparent" : "#f0f0f0",
            }}
          >
            {backCoverImage ? (
              <div className="relative w-full h-full">
                <img 
                  src={backCoverImage.preview} 
                  alt="Back Cover" 
                  className="w-full h-full object-cover"
                />
                <button
                  onClick={() => onBackCoverChange(undefined)}
                  className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="text-center p-4">
                <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                <p className="text-sm text-gray-600 mb-2">Back Cover</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => backInputRef.current?.click()}
                >
                  Upload Image
                </Button>
                <input
                  ref={backInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleBackCoverUpload(e.target.files)}
                  className="hidden"
                />
              </div>
            )}
          </div>

          {/* Spine Area */}
          <div
            className="absolute flex items-center justify-center bg-gray-200"
            style={{
              left: `${coverDims.spineX * visualScale}px`,
              top: `${coverDims.bleed * visualScale}px`,
              width: `${coverDims.spineWidth * visualScale}px`,
              height: `${coverDims.trimHeight * visualScale}px`,
            }}
          >
            <p className="text-xs text-gray-600 transform -rotate-90 whitespace-nowrap">
              SPINE ({coverDims.spineWidth.toFixed(3)}")
            </p>
          </div>

          {/* Front Cover Area */}
          <div
            className="absolute flex items-center justify-center"
            style={{
              left: `${coverDims.frontCoverX * visualScale}px`,
              top: `${coverDims.bleed * visualScale}px`,
              width: `${coverDims.trimWidth * visualScale}px`,
              height: `${coverDims.trimHeight * visualScale}px`,
              backgroundColor: frontCoverImage ? "transparent" : "#f0f0f0",
            }}
          >
            {frontCoverImage ? (
              <div className="relative w-full h-full">
                <img 
                  src={frontCoverImage.preview} 
                  alt="Front Cover" 
                  className="w-full h-full object-cover"
                />
                <button
                  onClick={() => onFrontCoverChange(undefined)}
                  className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="text-center p-4">
                <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                <p className="text-sm text-gray-600 mb-2">Front Cover</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => frontInputRef.current?.click()}
                >
                  Upload Image
                </Button>
                <input
                  ref={frontInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFrontCoverUpload(e.target.files)}
                  className="hidden"
                />
              </div>
            )}
          </div>

          {/* Visual Guides */}
          {showGuides && (
            <>
              {/* Bleed Guide (red) */}
              <div
                className="absolute border-2 border-red-500 pointer-events-none"
                style={{
                  left: `${coverDims.bleed * visualScale}px`,
                  top: `${coverDims.bleed * visualScale}px`,
                  width: `${(coverDims.totalWidth - coverDims.bleed * 2) * visualScale}px`,
                  height: `${(coverDims.totalHeight - coverDims.bleed * 2) * visualScale}px`,
                }}
              />
              <div className="absolute top-1 left-1 text-xs text-red-500 font-bold">TRIM LINE</div>

              {/* Safe Zone Guide (blue) - 0.0625" from spine edges */}
              <div
                className="absolute border border-blue-500 border-dashed pointer-events-none"
                style={{
                  left: `${(coverDims.spineX + 0.0625) * visualScale}px`,
                  top: `${(coverDims.bleed + 0.0625) * visualScale}px`,
                  width: `${(coverDims.spineWidth - 0.0625 * 2) * visualScale}px`,
                  height: `${(coverDims.trimHeight - 0.0625 * 2) * visualScale}px`,
                }}
              />
              <div 
                className="absolute text-xs text-blue-500 font-bold"
                style={{
                  left: `${coverDims.spineX * visualScale + 2}px`,
                  bottom: "4px",
                }}
              >
                SPINE SAFE ZONE
              </div>
            </>
          )}
        </div>

        {/* Legend */}
        <div className="mt-4 flex items-center gap-4 text-xs text-[var(--color-text-dim)]">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-red-500"></div>
            <span>Trim Line (0.125" bleed)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border border-blue-500 border-dashed"></div>
            <span>Safe Zone (0.0625" margin)</span>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => frontInputRef.current?.click()}
          disabled={!!frontCoverImage}
        >
          <Upload className="w-4 h-4 mr-2" />
          {frontCoverImage ? "Front Cover Added" : "Upload Front Cover"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => backInputRef.current?.click()}
          disabled={!!backCoverImage}
        >
          <Upload className="w-4 h-4 mr-2" />
          {backCoverImage ? "Back Cover Added" : "Upload Back Cover"}
        </Button>
        {frontCoverImage && backCoverImage && (
          <div className="ml-auto flex items-center gap-2 text-sm text-green-500">
            <Check className="w-4 h-4" />
            <span>Cover template ready!</span>
          </div>
        )}
      </div>
    </div>
  )
}

