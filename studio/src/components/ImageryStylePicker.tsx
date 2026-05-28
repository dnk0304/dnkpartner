// ============================================================
// DNK AI Studio - Imagery Style Picker (Modal with Grid)
// ============================================================

import { useState, useEffect } from "react"
import { X, Check, Sparkles, Image as ImageIcon, Plus, Edit2, Trash2 } from "lucide-react"
import { Button } from "./Button"
import { cn } from "@/lib/utils"
import { ImageryStyle, IMAGERY_STYLE_PRESETS } from "@/types/StudioMode"

interface ImageryStylePickerProps {
  selectedStyle: ImageryStyle | null
  onSelectStyle: (style: ImageryStyle | null) => void
  onClose: () => void
}

export function ImageryStylePicker({ selectedStyle, onSelectStyle, onClose }: ImageryStylePickerProps) {
  const [previewStyle, setPreviewStyle] = useState<ImageryStyle | null>(null) // Style shown in preview (clicked)
  const [stylePreviewUrls, setStylePreviewUrls] = useState<Record<string, string>>({})
  const [customStyles, setCustomStyles] = useState<ImageryStyle[]>([])
  const [isCreatingCustom, setIsCreatingCustom] = useState(false)
  const [editingCustomId, setEditingCustomId] = useState<string | null>(null)
  const [customName, setCustomName] = useState("")
  const [customDescription, setCustomDescription] = useState("")
  const [customPrompt, setCustomPrompt] = useState("")

  // Convert presets to ImageryStyle objects with IDs
  const presetStyles: ImageryStyle[] = IMAGERY_STYLE_PRESETS.map((preset, index) => ({
    id: preset.name.toLowerCase().replace(/\s+/g, "-").replace(/&/g, "and"),
    name: preset.name,
    description: preset.description,
    prompt: preset.prompt,
    isCustom: false,
    createdAt: Date.now() - (IMAGERY_STYLE_PRESETS.length - index) * 1000,
  }))

  // Merge preset and custom styles
  const styles: ImageryStyle[] = [...presetStyles, ...customStyles]

  // The style to display in the preview (clicked preview > currently selected > first style)
  const displayStyle = previewStyle || selectedStyle || styles[0]

  // Load style preview URLs and custom styles on mount
  useEffect(() => {
    const loadPreviews = async () => {
      try {
        const response = await fetch("/api/styles/previews")
        if (response.ok) {
          const previews = await response.json()
          setStylePreviewUrls(previews)
        }
      } catch (error) {
        console.error("Failed to load style previews:", error)
      }
    }

    const loadCustomStyles = async () => {
      try {
        const response = await fetch("/api/styles/custom")
        if (response.ok) {
          const customs = await response.json()
          setCustomStyles(customs)
        }
      } catch (error) {
        console.error("Failed to load custom styles:", error)
      }
    }

    loadPreviews()
    loadCustomStyles()
  }, [])

  const handleSelectStyle = (style: ImageryStyle) => {
    onSelectStyle(style)
    onClose()
  }

  const handleCreateCustom = async () => {
    if (!customName.trim() || !customDescription.trim() || !customPrompt.trim()) {
      alert("Please fill in all fields")
      return
    }

    try {
      const response = await fetch("/api/styles/custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: customName,
          description: customDescription,
          prompt: customPrompt,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to create custom style")
      }

      const newStyle = await response.json()
      setCustomStyles([...customStyles, newStyle])
      setCustomName("")
      setCustomDescription("")
      setCustomPrompt("")
      setIsCreatingCustom(false)
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to create custom style")
    }
  }

  const handleEditCustom = (style: ImageryStyle) => {
    setEditingCustomId(style.id)
    setCustomName(style.name)
    setCustomDescription(style.description)
    setCustomPrompt(style.prompt)
    setIsCreatingCustom(true)
  }

  const handleUpdateCustom = async () => {
    if (!editingCustomId || !customName.trim() || !customDescription.trim() || !customPrompt.trim()) {
      alert("Please fill in all fields")
      return
    }

    try {
      const response = await fetch(`/api/styles/custom/${editingCustomId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: customName,
          description: customDescription,
          prompt: customPrompt,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to update custom style")
      }

      const updatedStyle = await response.json()
      setCustomStyles(customStyles.map((s) => (s.id === editingCustomId ? updatedStyle : s)))
      setCustomName("")
      setCustomDescription("")
      setCustomPrompt("")
      setEditingCustomId(null)
      setIsCreatingCustom(false)
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to update custom style")
    }
  }

  const handleDeleteCustom = async (styleId: string, styleName: string) => {
    if (!confirm(`Are you sure you want to delete "${styleName}"?`)) return

    try {
      const response = await fetch(`/api/styles/custom/${styleId}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        throw new Error("Failed to delete custom style")
      }

      setCustomStyles(customStyles.filter((s) => s.id !== styleId))
    } catch (error) {
      alert("Failed to delete custom style")
    }
  }

  const previewUrl = displayStyle ? stylePreviewUrls[displayStyle.id] : null

  return (
    <>
      {/* Backdrop with blur */}
      <div 
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="fixed inset-4 md:inset-8 lg:inset-12 z-50 flex items-center justify-center pointer-events-none">
        <div className="w-full max-w-5xl max-h-full bg-[var(--color-surface)] rounded-2xl shadow-2xl border border-[var(--color-border)] overflow-hidden pointer-events-auto flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
            <div>
              <h2 className="text-xl font-bold text-[var(--color-text)] flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-yellow-400" />
                Choose Imagery Style
              </h2>
              <p className="text-sm text-[var(--color-text-muted)]">
                {styles.length} styles available
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsCreatingCustom(true)}
              >
                <Plus className="w-4 h-4 mr-1" />
                Custom
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
            {/* Preview Panel (Left) */}
            <div className="lg:w-80 p-4 border-b lg:border-b-0 lg:border-r border-[var(--color-border)] flex flex-col">
              {displayStyle && (
                <>
                  {/* Large Preview Image */}
                  <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-gradient-to-br from-gray-800 to-gray-900 mb-3">
                    {previewUrl ? (
                      <img
                        src={previewUrl}
                        alt={displayStyle.name}
                        className="w-full h-full object-contain bg-black"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-gray-500">
                        <ImageIcon className="w-12 h-12 mb-2 opacity-30" />
                        <p className="text-xs">No preview</p>
                      </div>
                    )}
                    {displayStyle.isCustom && (
                      <div className="absolute top-2 right-2 px-2 py-0.5 text-xs font-semibold bg-purple-500 text-white rounded">
                        Custom
                      </div>
                    )}
                  </div>

                  {/* Style Info */}
                  <h3 className="text-lg font-bold text-[var(--color-text)] mb-1">
                    {displayStyle.name}
                  </h3>
                  <p className="text-sm text-[var(--color-text-muted)] mb-3 line-clamp-2">
                    {displayStyle.description}
                  </p>

                  {/* Prompt Preview */}
                  <div className="bg-[var(--color-background)] rounded-lg p-2 mb-3 flex-shrink-0">
                    <p className="text-xs text-[var(--color-text-dim)] font-mono line-clamp-3">
                      {displayStyle.prompt}
                    </p>
                  </div>

                  {/* Select Button */}
                  <div className="flex gap-2 mt-auto">
                    <Button
                      onClick={() => handleSelectStyle(displayStyle)}
                      className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-black font-semibold"
                    >
                      <Check className="w-4 h-4 mr-1" />
                      Select
                    </Button>
                    {displayStyle.isCustom && (
                      <>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => handleEditCustom(displayStyle)}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => handleDeleteCustom(displayStyle.id, displayStyle.name)}
                          className="text-red-500 hover:text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Grid Panel (Right) */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                {styles.map((style) => {
                  const isSelected = selectedStyle?.id === style.id
                  const isPreviewing = previewStyle?.id === style.id
                  const thumbUrl = stylePreviewUrls[style.id]

                  return (
                    <button
                      key={style.id}
                      onClick={() => setPreviewStyle(style)}
                      className={cn(
                        "relative aspect-square rounded-lg overflow-hidden border-2 transition-all group",
                        isSelected
                          ? "border-yellow-400 ring-2 ring-yellow-400/30"
                          : isPreviewing
                          ? "border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/30"
                          : "border-transparent hover:border-[var(--color-border)]"
                      )}
                    >
                      {/* Thumbnail */}
                      {thumbUrl ? (
                        <img
                          src={thumbUrl}
                          alt={style.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center">
                          <ImageIcon className="w-6 h-6 text-gray-500 opacity-50" />
                        </div>
                      )}

                      {/* Overlay with name on hover */}
                      <div className={cn(
                        "absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex items-end p-1.5 transition-opacity",
                        isPreviewing || isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                      )}>
                        <p className="text-[10px] font-medium text-white truncate w-full">
                          {style.name}
                        </p>
                      </div>

                      {/* Selected checkmark */}
                      {isSelected && (
                        <div className="absolute top-1 right-1 w-5 h-5 bg-yellow-400 rounded-full flex items-center justify-center">
                          <Check className="w-3 h-3 text-black" />
                        </div>
                      )}

                      {/* Custom badge */}
                      {style.isCustom && (
                        <div className="absolute top-1 left-1 px-1 py-0.5 text-[8px] font-bold bg-purple-500 text-white rounded">
                          C
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Custom Style Creation/Edit Modal */}
      {isCreatingCustom && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg bg-[var(--color-surface)] rounded-2xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="p-5 border-b border-[var(--color-border)]">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-bold text-[var(--color-text)] flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-purple-400" />
                    {editingCustomId ? "Edit Custom Style" : "Create Custom Style"}
                  </h2>
                  <p className="text-sm text-[var(--color-text-muted)] mt-1">
                    Define your own unique imagery style
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setIsCreatingCustom(false)
                    setEditingCustomId(null)
                    setCustomName("")
                    setCustomDescription("")
                    setCustomPrompt("")
                  }}
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </div>

            {/* Form */}
            <div className="p-5 space-y-4">
              <div>
                <label className="text-sm font-semibold text-[var(--color-text)] mb-1.5 block">
                  Style Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="e.g., Dreamy Pastel"
                  className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-[var(--color-text)] mb-1.5 block">
                  Description <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={customDescription}
                  onChange={(e) => setCustomDescription(e.target.value)}
                  placeholder="e.g., Soft, dreamy aesthetic with pastel colors"
                  className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-[var(--color-text)] mb-1.5 block">
                  Style Prompt <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder="e.g., dreamy pastel aesthetic, soft lighting, pale pink and blue tones"
                  rows={3}
                  className="w-full px-3 py-2 bg-[var(--color-background)] border border-[var(--color-border)] rounded-lg text-[var(--color-text)] text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                />
                <p className="text-xs text-[var(--color-text-dim)] mt-1">
                  This prompt will be appended to all image generations
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-[var(--color-border)] flex items-center gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setIsCreatingCustom(false)
                  setEditingCustomId(null)
                  setCustomName("")
                  setCustomDescription("")
                  setCustomPrompt("")
                }}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={editingCustomId ? handleUpdateCustom : handleCreateCustom}
                disabled={!customName.trim() || !customDescription.trim() || !customPrompt.trim()}
                className="flex-1 bg-purple-500 hover:bg-purple-600 text-white font-semibold"
              >
                <Check className="w-4 h-4 mr-1" />
                {editingCustomId ? "Update" : "Create"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
