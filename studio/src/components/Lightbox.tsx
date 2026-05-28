import { X, ZoomIn, ZoomOut, Download, ChevronLeft, ChevronRight } from "lucide-react"
import { useState, useEffect } from "react"
import { Button } from "./Button"
import { cn } from "@/lib/utils"

interface LightboxProps {
  images: string[]
  initialIndex: number
  isOpen: boolean
  onClose: () => void
}

export function Lightbox({ images, initialIndex, isOpen, onClose }: LightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [zoom, setZoom] = useState(1)

  useEffect(() => {
    setCurrentIndex(initialIndex)
    setZoom(1)
  }, [initialIndex, isOpen])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return
      
      switch (e.key) {
        case "Escape":
          onClose()
          break
        case "ArrowLeft":
          handlePrevious()
          break
        case "ArrowRight":
          handleNext()
          break
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, currentIndex])

  const handlePrevious = () => {
    setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1))
    setZoom(1)
  }

  const handleNext = () => {
    setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1))
    setZoom(1)
  }

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 0.25, 3))
  }

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 0.25, 0.5))
  }

  const handleDownload = () => {
    const link = document.createElement("a")
    link.href = images[currentIndex]
    link.download = `image-${currentIndex + 1}.png`
    link.click()
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 animate-fade-in-up"
      onClick={onClose}
    >
      {/* Header Controls */}
      <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between glass-strong z-10">
        <div className="text-sm text-[var(--color-text-muted)]">
          {currentIndex + 1} / {images.length}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon-sm" onClick={(e) => { e.stopPropagation(); handleZoomOut(); }}>
            <ZoomOut className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={(e) => { e.stopPropagation(); handleZoomIn(); }}>
            <ZoomIn className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={(e) => { e.stopPropagation(); handleDownload(); }}>
            <Download className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Image Container */}
      <div
        className="relative max-w-[90vw] max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={images[currentIndex]}
          alt={`Image ${currentIndex + 1}`}
          className="transition-transform duration-200"
          style={{
            transform: `scale(${zoom})`,
            maxWidth: "100%",
            maxHeight: "90vh",
            objectFit: "contain",
          }}
        />
      </div>

      {/* Navigation Arrows */}
      {images.length > 1 && (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="absolute left-4 top-1/2 -translate-y-1/2 glass-strong"
            onClick={(e) => { e.stopPropagation(); handlePrevious(); }}
          >
            <ChevronLeft className="w-6 h-6" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-4 top-1/2 -translate-y-1/2 glass-strong"
            onClick={(e) => { e.stopPropagation(); handleNext(); }}
          >
            <ChevronRight className="w-6 h-6" />
          </Button>
        </>
      )}
    </div>
  )
}

