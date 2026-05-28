import { RotateCw } from "lucide-react"
import { Button } from "./Button"
import { cn } from "@/lib/utils"

interface ImageEditControlsProps {
  scale: number
  positionX: number
  positionY: number
  rotation: number
  onScaleChange: (scale: number) => void
  onPositionChange: (x: number, y: number) => void
  onRotationChange: (rotation: number) => void
  disabled?: boolean
}

export function ImageEditControls({
  scale,
  positionX,
  positionY,
  rotation,
  onScaleChange,
  onPositionChange,
  onRotationChange,
  disabled = false,
}: ImageEditControlsProps) {
  // Rotation presets
  const rotationPresets = [0, 90, 180, 270]

  return (
    <div className="p-3 bg-[var(--color-background)] rounded-lg border border-[var(--color-border)] space-y-3">
      <h4 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
        Image Adjustments
      </h4>

      {/* Scale Slider */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-xs text-[var(--color-text-muted)]">Scale</label>
          <span className="text-xs font-mono text-[var(--color-text)]">{Math.round(scale * 100)}%</span>
        </div>
        <input
          type="range"
          min="0.5"
          max="2"
          step="0.01"
          value={scale}
          onChange={(e) => onScaleChange(parseFloat(e.target.value))}
          disabled={disabled}
          className="w-full h-2 bg-[var(--color-border)] rounded-lg appearance-none cursor-pointer accent-[var(--color-primary)]"
        />
        <div className="flex justify-between text-[10px] text-[var(--color-text-dim)]">
          <span>50%</span>
          <span>100%</span>
          <span>200%</span>
        </div>
      </div>

      {/* Position X/Y */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-xs text-[var(--color-text-muted)]">Position X</label>
          <input
            type="number"
            value={positionX}
            onChange={(e) => onPositionChange(parseFloat(e.target.value) || 0, positionY)}
            disabled={disabled}
            className="w-full px-2 py-1 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded text-[var(--color-text)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-[var(--color-text-muted)]">Position Y</label>
          <input
            type="number"
            value={positionY}
            onChange={(e) => onPositionChange(positionX, parseFloat(e.target.value) || 0)}
            disabled={disabled}
            className="w-full px-2 py-1 text-xs bg-[var(--color-surface)] border border-[var(--color-border)] rounded text-[var(--color-text)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
          />
        </div>
      </div>

      {/* Rotation Buttons */}
      <div className="space-y-1">
        <label className="text-xs text-[var(--color-text-muted)]">Rotation</label>
        <div className="flex items-center gap-1">
          {rotationPresets.map((deg) => (
            <button
              key={deg}
              onClick={() => onRotationChange(deg)}
              disabled={disabled}
              className={cn(
                "flex-1 px-2 py-1 text-xs rounded transition-colors",
                rotation === deg
                  ? "bg-[var(--color-primary)] text-white"
                  : "bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] border border-[var(--color-border)]"
              )}
            >
              {deg}°
            </button>
          ))}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onRotationChange((rotation + 90) % 360)}
            disabled={disabled}
            title="Rotate 90°"
            className="h-7 w-7"
          >
            <RotateCw className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Reset Button */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          onScaleChange(1)
          onPositionChange(0, 0)
          onRotationChange(0)
        }}
        disabled={disabled || (scale === 1 && positionX === 0 && positionY === 0 && rotation === 0)}
        className="w-full text-xs"
      >
        Reset All
      </Button>
    </div>
  )
}
