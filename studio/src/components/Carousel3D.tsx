import { useState, useEffect } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "./Button"
import { cn } from "@/lib/utils"

interface Carousel3DProps<T> {
  items: T[]
  renderItem: (item: T, index: number) => React.ReactNode
  className?: string
}

export function Carousel3D<T>({ items, renderItem, className }: Carousel3DProps<T>) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)

  const handlePrevious = () => {
    if (isAnimating) return
    setIsAnimating(true)
    setCurrentIndex((prev) => (prev === 0 ? items.length - 1 : prev - 1))
    setTimeout(() => setIsAnimating(false), 300)
  }

  const handleNext = () => {
    if (isAnimating) return
    setIsAnimating(true)
    setCurrentIndex((prev) => (prev === items.length - 1 ? 0 : prev + 1))
    setTimeout(() => setIsAnimating(false), 300)
  }

  const getItemPosition = (index: number) => {
    const diff = index - currentIndex
    if (diff === 0) return "center"
    if (diff === 1 || diff === -(items.length - 1)) return "right"
    if (diff === -1 || diff === items.length - 1) return "left"
    return "hidden"
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-[var(--color-text-muted)]">
        No items to display
      </div>
    )
  }

  if (items.length === 1) {
    return <div className={className}>{renderItem(items[0], 0)}</div>
  }

  return (
    <div className={cn("relative", className)}>
      {/* Carousel Container */}
      <div className="relative h-[400px] flex items-center justify-center" style={{ perspective: "1200px" }}>
        {items.map((item, index) => {
          const position = getItemPosition(index)
          return (
            <div
              key={index}
              className={cn(
                "absolute transition-all duration-300 ease-out",
                position === "hidden" && "opacity-0 pointer-events-none"
              )}
              style={{
                transformStyle: "preserve-3d",
                ...(position === "center" && {
                  transform: "translateX(0) scale(1.1) translateZ(50px)",
                  zIndex: 30,
                  opacity: 1,
                }),
                ...(position === "left" && {
                  transform: "translateX(-60%) rotateY(25deg) scale(0.85)",
                  zIndex: 10,
                  opacity: 0.6,
                }),
                ...(position === "right" && {
                  transform: "translateX(60%) rotateY(-25deg) scale(0.85)",
                  zIndex: 10,
                  opacity: 0.6,
                }),
              }}
            >
              {renderItem(item, index)}
            </div>
          )
        })}
      </div>

      {/* Navigation Arrows */}
      {items.length > 1 && (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="absolute left-4 top-1/2 -translate-y-1/2 z-40 glass"
            onClick={handlePrevious}
            disabled={isAnimating}
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-4 top-1/2 -translate-y-1/2 z-40 glass"
            onClick={handleNext}
            disabled={isAnimating}
          >
            <ChevronRight className="w-5 h-5" />
          </Button>
        </>
      )}

      {/* Pagination Dots */}
      {items.length > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          {items.map((_, index) => (
            <button
              key={index}
              onClick={() => {
                if (!isAnimating) {
                  setIsAnimating(true)
                  setCurrentIndex(index)
                  setTimeout(() => setIsAnimating(false), 300)
                }
              }}
              className={cn(
                "w-2 h-2 rounded-full transition-all duration-200",
                index === currentIndex
                  ? "w-8 opacity-100"
                  : "opacity-40 hover:opacity-60"
              )}
              style={{
                background: index === currentIndex ? "var(--gradient-warm)" : "var(--color-border-bright)",
              }}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}

