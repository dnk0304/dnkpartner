import { useState } from "react"
import { ChevronLeft, ChevronRight, Expand, X, Download, Maximize2 } from "lucide-react"
import { Button } from "./Button"
import { Card } from "./Card"
import { cn } from "@/lib/utils"

interface CarouselImage {
  id: string
  url: string
  fileName: string
  prompt: string
  promptNumber: number
}

interface ImageCarouselProps {
  images: CarouselImage[]
  title?: string
}

export function ImageCarousel({ images, title = "Generated Images" }: ImageCarouselProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [currentPage, setCurrentPage] = useState(0)
  const [fullscreenImage, setFullscreenImage] = useState<CarouselImage | null>(null)
  
  const imagesPerPage = 4
  const totalPages = Math.ceil(images.length / imagesPerPage)
  
  if (images.length === 0) {
    return null
  }

  const currentImages = images.slice(
    currentPage * imagesPerPage,
    (currentPage + 1) * imagesPerPage
  )

  const handlePrevPage = () => {
    setCurrentPage((prev) => Math.max(0, prev - 1))
  }

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(totalPages - 1, prev + 1))
  }

  return (
    <>
      <Card className="mb-8 animate-fade-in-up overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-[var(--color-border)] bg-gradient-to-r from-[var(--color-surface)] to-[var(--color-background)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-[var(--color-text)]">{title}</h3>
            <span className="text-sm text-[var(--color-text-dim)] bg-[var(--color-background)] px-2 py-0.5 rounded-full">
              {images.length} image{images.length !== 1 ? "s" : ""}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs"
          >
            {isExpanded ? (
              <>
                <ChevronLeft className="w-4 h-4 mr-1" />
                Collapse
              </>
            ) : (
              <>
                <Expand className="w-4 h-4 mr-1" />
                Expand All
              </>
            )}
          </Button>
        </div>

        {/* Carousel View (Collapsed) */}
        {!isExpanded && (
          <div className="p-4">
            <div className="flex items-center gap-4">
              {/* Previous Button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={handlePrevPage}
                disabled={currentPage === 0}
                className="flex-shrink-0"
              >
                <ChevronLeft className="w-5 h-5" />
              </Button>

              {/* Images */}
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                {currentImages.map((image) => (
                  <div
                    key={image.id}
                    className="group relative aspect-square rounded-lg overflow-hidden border border-[var(--color-border)] bg-[var(--color-background)] cursor-pointer hover:border-[var(--color-primary)] transition-all"
                    onClick={() => setFullscreenImage(image)}
                  >
                    <img
                      src={image.url}
                      alt={image.prompt}
                      className="w-full h-full object-cover transition-transform group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="absolute bottom-2 left-2 right-2">
                        <p className="text-white text-xs font-medium mb-1">#{image.promptNumber}</p>
                        <p className="text-white/80 text-xs line-clamp-2">{image.prompt}</p>
                      </div>
                      <div className="absolute top-2 right-2">
                        <Maximize2 className="w-4 h-4 text-white" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Next Button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={handleNextPage}
                disabled={currentPage === totalPages - 1}
                className="flex-shrink-0"
              >
                <ChevronRight className="w-5 h-5" />
              </Button>
            </div>

            {/* Page Indicators */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-4">
                {Array.from({ length: totalPages }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentPage(i)}
                    className={cn(
                      "w-2 h-2 rounded-full transition-all",
                      i === currentPage
                        ? "bg-[var(--color-primary)] w-6"
                        : "bg-[var(--color-border)] hover:bg-[var(--color-primary)]/50"
                    )}
                    aria-label={`Go to page ${i + 1}`}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Expanded Gallery View */}
        {isExpanded && (
          <div className="p-4 max-h-[600px] overflow-y-auto">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {images.map((image) => (
                <div
                  key={image.id}
                  className="group relative aspect-square rounded-lg overflow-hidden border border-[var(--color-border)] bg-[var(--color-background)] cursor-pointer hover:border-[var(--color-primary)] transition-all"
                  onClick={() => setFullscreenImage(image)}
                >
                  <img
                    src={image.url}
                    alt={image.prompt}
                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="absolute bottom-2 left-2 right-2">
                      <p className="text-white text-xs font-medium mb-1">#{image.promptNumber}</p>
                      <p className="text-white/80 text-xs line-clamp-2">{image.prompt}</p>
                    </div>
                    <div className="absolute top-2 right-2">
                      <Maximize2 className="w-4 h-4 text-white" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Fullscreen Lightbox */}
      {fullscreenImage && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/95 backdrop-blur-sm animate-fade-in"
          onClick={() => setFullscreenImage(null)}
        >
          <div
            className="relative max-w-[95vw] max-h-[95vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Image */}
            <div className="flex-1 flex items-center justify-center mb-4">
              <img
                src={fullscreenImage.url}
                alt={fullscreenImage.prompt}
                className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
              />
            </div>

            {/* Info and Actions */}
            <div className="bg-black/80 rounded-lg p-4 max-w-2xl">
              <div className="flex items-start gap-4">
                <div className="flex-1">
                  <p className="text-[var(--color-primary)] text-sm font-medium mb-1">
                    Prompt #{fullscreenImage.promptNumber}
                  </p>
                  <p className="text-white text-sm mb-2">{fullscreenImage.prompt}</p>
                  <p className="text-white/60 text-xs font-mono">{fullscreenImage.fileName}</p>
                </div>
                <div className="flex gap-2">
                  <a
                    href={fullscreenImage.url}
                    download={fullscreenImage.fileName}
                    onClick={(e) => e.stopPropagation()}
                    className="p-2 text-white hover:text-[var(--color-primary)] transition-colors"
                    title="Download"
                  >
                    <Download className="w-5 h-5" />
                  </a>
                  <button
                    onClick={() => setFullscreenImage(null)}
                    className="p-2 text-white hover:text-[var(--color-error)] transition-colors"
                    title="Close"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Close Button (Top Right) */}
            <button
              onClick={() => setFullscreenImage(null)}
              className="absolute top-4 right-4 p-2 text-white/80 hover:text-white bg-black/50 rounded-full transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>
      )}
    </>
  )
}

