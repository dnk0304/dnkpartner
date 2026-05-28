import { useState, useCallback } from "react"
import { Button } from "../../Button"
import { Card, CardContent } from "../../Card"
import { cn } from "@/lib/utils"
import {
  KDPProject,
  KDPExportSettings,
  ExportFormat,
  ColorProfile,
  KDP_TRIM_SIZES,
  KDPTrimSizeKey,
  calculateCoverDimensions,
  KDPPaperType,
} from "@/types/KDPMode"
import { 
  ChevronRight, 
  ChevronLeft, 
  Download,
  FileText,
  Image as ImageIcon,
  Loader2,
  CheckCircle,
  AlertCircle,
  Settings,
} from "lucide-react"

interface KDPExportStepProps {
  project: KDPProject
  onUpdate: (updates: Partial<KDPProject>) => void
  onNext: () => void
  onBack: () => void
}

export function KDPExportStep({ project, onUpdate, onNext, onBack }: KDPExportStepProps) {
  const [isExporting, setIsExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState("")
  const [exportError, setExportError] = useState<string | null>(null)
  const [exportSuccess, setExportSuccess] = useState<string | null>(null)

  const trim = project.trimSize ? KDP_TRIM_SIZES[project.trimSize as KDPTrimSizeKey] : null
  const coverDims = trim && project.pageCount
    ? calculateCoverDimensions(project.trimSize as KDPTrimSizeKey, project.pageCount, (project.paperType || "white") as KDPPaperType)
    : null

  // Compress image to reduce payload size
  const compressImage = async (base64: string, quality: number = 0.8): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(base64) // Return original if canvas fails
          return
        }
        
        ctx.drawImage(img, 0, 0)
        
        // Compress as JPEG with specified quality
        const compressed = canvas.toDataURL('image/jpeg', quality)
        resolve(compressed)
      }
      img.onerror = () => resolve(base64) // Return original on error
      img.src = base64
    })
  }

  // Compress all images in the project
  const compressProjectImages = async (projectData: any): Promise<any> => {
    console.log('[Export] Compressing images...')
    
    // Compress cover images
    const compressedCover = { ...projectData.cover }
    
    if (compressedCover.fullCoverImage?.data) {
      console.log('[Export] Compressing full cover image...')
      compressedCover.fullCoverImage.data = await compressImage(compressedCover.fullCoverImage.data, 0.85)
    }
    if (compressedCover.frontImage?.data) {
      console.log('[Export] Compressing front cover image...')
      compressedCover.frontImage.data = await compressImage(compressedCover.frontImage.data, 0.85)
    }
    if (compressedCover.backImage?.data) {
      console.log('[Export] Compressing back cover image...')
      compressedCover.backImage.data = await compressImage(compressedCover.backImage.data, 0.85)
    }
    if (compressedCover.spineImage?.data) {
      console.log('[Export] Compressing spine image...')
      compressedCover.spineImage.data = await compressImage(compressedCover.spineImage.data, 0.85)
    }
    
    // Compress interior page images
    const compressedPages = await Promise.all(
      projectData.pages.map(async (page: any, pageIndex: number) => {
        if (page.images && page.images.length > 0) {
          console.log(`[Export] Compressing images on page ${pageIndex + 1}...`)
          const compressedImages = await Promise.all(
            page.images.map(async (img: any) => ({
              ...img,
              data: await compressImage(img.data, 0.85)
            }))
          )
          return { ...page, images: compressedImages }
        }
        return page
      })
    )
    
    console.log('[Export] Image compression complete')
    
    return {
      ...projectData,
      cover: compressedCover,
      pages: compressedPages
    }
  }

  // Update export settings
  const updateExportSettings = useCallback((updates: Partial<KDPExportSettings>) => {
    onUpdate({
      exportSettings: {
        ...project.exportSettings,
        ...updates,
      },
    })
  }, [project.exportSettings, onUpdate])

  // Export handlers
  const handleExport = useCallback(async (format: ExportFormat) => {
    setIsExporting(true)
    setExportError(null)
    setExportSuccess(null)
    setExportProgress("Preparing export...")

    try {
      // Prepare project data for export
      const exportData = {
        project: {
          ...project,
          // Convert images to base64 data
          pages: project.pages.map(page => ({
            ...page,
            images: page.images.map(img => ({
              ...img,
              data: img.src,
            })),
          })),
          cover: {
            ...project.cover,
            fullCoverImage: project.cover.fullCoverImage ? {
              ...project.cover.fullCoverImage,
              data: project.cover.fullCoverImage.src,
            } : undefined,
            frontImage: project.cover.frontImage ? {
              ...project.cover.frontImage,
              data: project.cover.frontImage.src,
            } : undefined,
            backImage: project.cover.backImage ? {
              ...project.cover.backImage,
              data: project.cover.backImage.src,
            } : undefined,
            spineImage: project.cover.spineImage ? {
              ...project.cover.spineImage,
              data: project.cover.spineImage.src,
            } : undefined,
          },
        },
        format,
        settings: project.exportSettings,
      }

      // Compress images before sending
      setExportProgress("Compressing images...")
      const compressedExportData = {
        ...exportData,
        project: await compressProjectImages(exportData.project)
      }

      setExportProgress(`Generating ${format.toUpperCase()}...`)

      const response = await fetch("/api/kdp/generate-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(compressedExportData),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || "Export failed")
      }

      // Download the file
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      
      const extensions: Record<string, string> = {
        "pdf": ".pdf",
        "pdf-cover": "_cover.pdf",
        "pdf-interior": "_interior.pdf",
        "png-cover": "_cover.png",
      }
      
      const fileName = `${project.name.replace(/[^a-z0-9]/gi, "_")}${extensions[format] || ".pdf"}`
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      setExportSuccess(`Successfully exported ${fileName}`)
      setExportProgress("")
    } catch (error) {
      console.error("Export error:", error)
      // Better error message for network issues
      if (error instanceof TypeError && error.message === "Failed to fetch") {
        setExportError("Cannot connect to server. Make sure the backend is running on port 3001.")
      } else {
        setExportError(error instanceof Error ? error.message : "Export failed")
      }
      setExportProgress("")
    } finally {
      setIsExporting(false)
    }
  }, [project])

  return (
    <div className="space-y-6">
      {/* Export Summary */}
      <Card className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 border-green-500/30">
        <CardContent className="py-4">
          <h3 className="text-lg font-semibold text-[var(--color-text)] mb-4 flex items-center gap-2">
            <Download className="w-5 h-5 text-green-500" />
            Export Summary
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-[var(--color-text-dim)]">Book Type:</span>
              <div className="font-semibold text-[var(--color-text)] capitalize">
                {project.bookType}
              </div>
            </div>
            <div>
              <span className="text-[var(--color-text-dim)]">Trim Size:</span>
              <div className="font-semibold text-[var(--color-text)]">
                {trim?.label || project.trimSize}
              </div>
            </div>
            <div>
              <span className="text-[var(--color-text-dim)]">Pages:</span>
              <div className="font-semibold text-[var(--color-text)]">
                {project.pages.length} / {project.pageCount}
              </div>
            </div>
            <div>
              <span className="text-[var(--color-text-dim)]">Cover:</span>
              <div className="font-semibold text-[var(--color-text)]">
                {project.cover.fullCoverImage || project.cover.frontImage ? "✓ Ready" : "✗ Missing"}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KDP Bleed Requirement Warning */}
      {!project.exportSettings.includeBleed && (
        <Card className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-amber-500/50 border-2">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-6 h-6 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="font-semibold text-amber-600 dark:text-amber-400 mb-1">
                  ⚠️ KDP Cover Requirement
                </h4>
                <p className="text-sm text-[var(--color-text-muted)] mb-2">
                  <strong>Important:</strong> Make sure "Include bleed area" is checked below before downloading your <strong>cover PDF</strong>! 
                  KDP requires covers to include bleed for proper printing.
                </p>
                <button
                  onClick={() => updateExportSettings({ includeBleed: true })}
                  className="text-xs font-semibold text-amber-600 dark:text-amber-400 hover:underline"
                >
                  → Enable "Include bleed area" now
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Export Options */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Complete Book PDF */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-lg bg-[var(--color-primary)]/20 flex items-center justify-center">
                <FileText className="w-6 h-6 text-[var(--color-primary)]" />
              </div>
              <div className="flex-1">
                <h4 className="text-lg font-semibold text-[var(--color-text)] mb-1">
                  Complete Book PDF
                </h4>
                <p className="text-sm text-[var(--color-text-muted)] mb-4">
                  Full print-ready PDF with cover and interior pages. Ready for KDP upload.
                </p>
                <Button
                  onClick={() => handleExport("pdf")}
                  disabled={isExporting || project.pages.length === 0}
                  className="w-full"
                >
                  {isExporting ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 mr-2" />
                  )}
                  Export Complete PDF
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cover Only PDF */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-lg bg-purple-500/20 flex items-center justify-center">
                <ImageIcon className="w-6 h-6 text-purple-400" />
              </div>
              <div className="flex-1">
                <h4 className="text-lg font-semibold text-[var(--color-text)] mb-1">
                  Cover Only PDF
                </h4>
                <p className="text-sm text-[var(--color-text-muted)] mb-4">
                  Export just the cover as a separate print-ready PDF file.
                </p>
                <Button
                  variant="outline"
                  onClick={() => handleExport("pdf-cover")}
                  disabled={isExporting || (!project.cover.fullCoverImage && !project.cover.frontImage)}
                  className="w-full"
                >
                  {isExporting ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 mr-2" />
                  )}
                  Export Cover PDF
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Interior Only PDF */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <FileText className="w-6 h-6 text-blue-400" />
              </div>
              <div className="flex-1">
                <h4 className="text-lg font-semibold text-[var(--color-text)] mb-1">
                  Interior Only PDF
                </h4>
                <p className="text-sm text-[var(--color-text-muted)] mb-4">
                  Export just the interior pages as a separate PDF file.
                </p>
                <Button
                  variant="outline"
                  onClick={() => handleExport("pdf-interior")}
                  disabled={isExporting || project.pages.length === 0}
                  className="w-full"
                >
                  {isExporting ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 mr-2" />
                  )}
                  Export Interior PDF
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cover as PNG */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-lg bg-pink-500/20 flex items-center justify-center">
                <ImageIcon className="w-6 h-6 text-pink-400" />
              </div>
              <div className="flex-1">
                <h4 className="text-lg font-semibold text-[var(--color-text)] mb-1">
                  Cover as PNG
                </h4>
                <p className="text-sm text-[var(--color-text-muted)] mb-4">
                  High-resolution PNG image of your cover for previews or marketing.
                </p>
                <Button
                  variant="outline"
                  onClick={() => handleExport("png-cover")}
                  disabled={isExporting || (!project.cover.fullCoverImage && !project.cover.frontImage)}
                  className="w-full"
                >
                  {isExporting ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4 mr-2" />
                  )}
                  Export Cover PNG
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Export Settings */}
      <Card>
        <CardContent className="p-6">
          <h4 className="text-lg font-semibold text-[var(--color-text)] mb-4 flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Export Settings
          </h4>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Resolution */}
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-2">
                Resolution (DPI)
              </label>
              <select
                value={project.exportSettings.resolution}
                onChange={(e) => updateExportSettings({ resolution: parseInt(e.target.value) })}
                className="w-full px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              >
                <option value="150">150 DPI (Draft)</option>
                <option value="300">300 DPI (Print)</option>
                <option value="600">600 DPI (High Quality)</option>
              </select>
              <p className="text-xs text-[var(--color-text-dim)] mt-1">
                300 DPI recommended for KDP
              </p>
            </div>

            {/* Color Profile */}
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-2">
                Color Profile
              </label>
              <select
                value={project.exportSettings.colorProfile}
                onChange={(e) => updateExportSettings({ colorProfile: e.target.value as ColorProfile })}
                className="w-full px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              >
                <option value="rgb">RGB (Standard)</option>
                <option value="cmyk">CMYK (Print)</option>
              </select>
              <p className="text-xs text-[var(--color-text-dim)] mt-1">
                KDP accepts RGB and converts automatically
              </p>
            </div>

            {/* Compression */}
            <div>
              <label className="block text-sm font-medium text-[var(--color-text-muted)] mb-2">
                Compression
              </label>
              <select
                value={project.exportSettings.compression}
                onChange={(e) => updateExportSettings({ compression: e.target.value as any })}
                className="w-full px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
              >
                <option value="high">High (Smallest file) - Recommended</option>
                <option value="medium">Medium (Balanced)</option>
                <option value="low">Low (Best quality)</option>
                <option value="none">None (Largest file)</option>
              </select>
              <p className="text-xs text-[var(--color-text-dim)] mt-1">
                High compression recommended for faster uploads
              </p>
            </div>
          </div>

          {/* Checkboxes */}
          <div className="flex flex-wrap gap-6 mt-6 pt-6 border-t border-[var(--color-border)]">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={project.exportSettings.includeBleed}
                onChange={(e) => updateExportSettings({ includeBleed: e.target.checked })}
                className="w-4 h-4 rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
              />
              <span className="text-sm text-[var(--color-text)]">Include bleed area</span>
            </label>
            
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={project.exportSettings.includeCropMarks}
                onChange={(e) => updateExportSettings({ includeCropMarks: e.target.checked })}
                className="w-4 h-4 rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
              />
              <span className="text-sm text-[var(--color-text)]">Include crop marks</span>
            </label>
            
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={project.exportSettings.embedFonts}
                onChange={(e) => updateExportSettings({ embedFonts: e.target.checked })}
                className="w-4 h-4 rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
              />
              <span className="text-sm text-[var(--color-text)]">Embed fonts</span>
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Export Status */}
      {exportProgress && (
        <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg flex items-center gap-3">
          <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
          <span className="text-sm text-[var(--color-text)]">{exportProgress}</span>
        </div>
      )}

      {exportSuccess && (
        <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-green-400" />
          <span className="text-sm text-[var(--color-text)]">{exportSuccess}</span>
        </div>
      )}

      {exportError && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <span className="text-sm text-[var(--color-text)]">{exportError}</span>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-4 border-t border-[var(--color-border)]">
        <Button variant="outline" onClick={onBack} className="gap-2">
          <ChevronLeft className="w-4 h-4" />
          Back to Cover
        </Button>
        
        <Button onClick={onNext} className="gap-2">
          Continue to Preview
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}

