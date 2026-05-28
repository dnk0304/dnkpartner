import { useState } from "react"
import { X, Check, CheckSquare, Square, ArrowRight, Image as ImageIcon } from "lucide-react"
import { Button } from "./Button"
import { cn } from "@/lib/utils"

interface ImageItem {
  id: string
  imageUrl: string
  prompt?: string
}

interface ImageTransferDialogProps {
  isOpen: boolean
  onClose: () => void
  images: ImageItem[]
  onTransfer: (selectedImages: string[]) => void
}

export function ImageTransferDialog({ isOpen, onClose, images, onTransfer }: ImageTransferDialogProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(images.map(img => img.id)))

  if (!isOpen) return null

  const handleToggle = (id: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }

  const handleSelectAll = () => {
    setSelectedIds(new Set(images.map(img => img.id)))
  }

  const handleDeselectAll = () => {
    setSelectedIds(new Set())
  }

  const handleTransfer = () => {
    const selectedImages = images
      .filter(img => selectedIds.has(img.id))
      .map(img => img.imageUrl)
    onTransfer(selectedImages)
    onClose()
  }

  const selectedCount = selectedIds.size
  const allSelected = selectedCount === images.length
  const noneSelected = selectedCount === 0

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-fade-in"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-[var(--color-surface)] rounded-2xl shadow-2xl max-w-4xl w-full max-h-[85vh] flex flex-col pointer-events-auto animate-scale-in overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-accent)]">
                <ArrowRight className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-[var(--color-text)]">Transfer to Rescaler</h2>
                <p className="text-sm text-[var(--color-text-muted)]">
                  Select images to transfer ({selectedCount} of {images.length} selected)
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-[var(--color-surface-hover)] rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Selection Controls */}
          <div className="flex items-center gap-2 px-4 py-3 bg-[var(--color-background)]/50 border-b border-[var(--color-border)]">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSelectAll}
              disabled={allSelected}
            >
              <CheckSquare className="w-4 h-4 mr-1" />
              Select All
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDeselectAll}
              disabled={noneSelected}
            >
              <Square className="w-4 h-4 mr-1" />
              Deselect All
            </Button>
            <div className="flex-1" />
            <span className="text-sm text-[var(--color-text-muted)]">
              {selectedCount} image{selectedCount !== 1 ? 's' : ''} selected
            </span>
          </div>

          {/* Image Grid */}
          <div className="flex-1 overflow-y-auto p-4">
            {images.length > 0 ? (
              <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {images.map((img) => {
                  const isSelected = selectedIds.has(img.id)
                  return (
                    <button
                      key={img.id}
                      onClick={() => handleToggle(img.id)}
                      className={cn(
                        "relative aspect-square rounded-lg overflow-hidden border-2 transition-all group",
                        isSelected
                          ? "border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/30"
                          : "border-[var(--color-border)] hover:border-[var(--color-border-bright)]"
                      )}
                    >
                      <img
                        src={img.imageUrl}
                        alt={img.prompt || "Generated image"}
                        className="w-full h-full object-cover"
                      />
                      
                      {/* Selection Indicator */}
                      <div className={cn(
                        "absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center transition-all",
                        isSelected
                          ? "bg-[var(--color-primary)] scale-100"
                          : "bg-black/50 scale-90 opacity-0 group-hover:opacity-100 group-hover:scale-100"
                      )}>
                        {isSelected ? (
                          <Check className="w-4 h-4 text-white" />
                        ) : (
                          <div className="w-3 h-3 rounded-full border-2 border-white" />
                        )}
                      </div>

                      {/* Hover Overlay */}
                      {!isSelected && (
                        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                      )}
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <ImageIcon className="w-16 h-16 text-[var(--color-text-muted)] opacity-30 mb-4" />
                <p className="text-lg text-[var(--color-text-muted)]">No images available</p>
                <p className="text-sm text-[var(--color-text-dim)]">Generate some images first</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-4 border-t border-[var(--color-border)] bg-[var(--color-background)]/50">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="playful"
              onClick={handleTransfer}
              disabled={noneSelected}
            >
              <ArrowRight className="w-4 h-4 mr-2" />
              Transfer {selectedCount} Image{selectedCount !== 1 ? 's' : ''} to Rescaler
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
