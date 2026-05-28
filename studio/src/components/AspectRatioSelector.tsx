import { useState, useEffect } from "react"
import { Select } from "./Select"
import { ASPECT_RATIOS, isValidCustomAspectRatio, calculateCustomDimensions } from "@/constants/models"
import { cn } from "@/lib/utils"

interface AspectRatioSelectorProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

export function AspectRatioSelector({ value, onChange, disabled }: AspectRatioSelectorProps) {
  // Determine if current value is a custom ratio
  const isCustomValue = !ASPECT_RATIOS.find(r => r.value === value && r.value !== "custom")
  const [showCustomInput, setShowCustomInput] = useState(isCustomValue)
  const [customInput, setCustomInput] = useState(isCustomValue ? value : "")
  const [validationError, setValidationError] = useState<string | null>(null)

  // Update when external value changes
  useEffect(() => {
    const isExtCustom = !ASPECT_RATIOS.find(r => r.value === value && r.value !== "custom")
    if (isExtCustom && value !== "custom") {
      setShowCustomInput(true)
      setCustomInput(value)
    }
  }, [value])

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newValue = e.target.value
    if (newValue === "custom") {
      setShowCustomInput(true)
      setCustomInput("")
      setValidationError(null)
      // Don't call onChange yet, wait for valid input
    } else {
      setShowCustomInput(false)
      setCustomInput("")
      setValidationError(null)
      onChange(newValue)
    }
  }

  const handleCustomInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value
    setCustomInput(input)
    
    const trimmedInput = input.trim()
    console.log('[AspectRatioSelector] Custom input:', trimmedInput)

    if (!trimmedInput) {
      setValidationError(null)
      return
    }

    // Validate format
    if (!isValidCustomAspectRatio(trimmedInput)) {
      setValidationError("Invalid format. Use W:H (1-99 range, e.g., 10:16)")
      console.log('[AspectRatioSelector] Validation failed for:', trimmedInput)
      return
    }

    // Valid input
    setValidationError(null)
    console.log('[AspectRatioSelector] ✅ Valid! Calling onChange with:', trimmedInput)
    onChange(trimmedInput)
  }

  // Calculate dimensions for preview
  const dimensions = customInput && isValidCustomAspectRatio(customInput)
    ? calculateCustomDimensions(customInput, 1024)
    : null

  // Determine the select value to display
  const selectValue = showCustomInput ? "custom" : value

  return (
    <div className="space-y-2">
      <Select
        value={selectValue}
        onChange={handleSelectChange}
        disabled={disabled}
      >
        {ASPECT_RATIOS.map((ratio) => (
          <option key={ratio.value} value={ratio.value}>
            {ratio.label}
          </option>
        ))}
      </Select>

      {showCustomInput && (
        <div className="space-y-1">
          <input
            type="text"
            value={customInput}
            onChange={handleCustomInputChange}
            placeholder="e.g., 10:16"
            disabled={disabled}
            className={cn(
              "w-full px-3 py-2 rounded-lg text-sm",
              "bg-[var(--color-surface)] border",
              "text-[var(--color-text)]",
              "focus:outline-none focus:ring-2",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              validationError
                ? "border-red-500 focus:ring-red-500"
                : "border-[var(--color-border)] focus:ring-[var(--color-primary)]"
            )}
          />
          
          {/* Validation message or dimension preview */}
          {validationError ? (
            <p className="text-xs text-red-400 flex items-center gap-1">
              <span>⚠</span> {validationError}
            </p>
          ) : dimensions ? (
            <p className="text-xs text-green-400">
              → {dimensions.width}×{dimensions.height} px
            </p>
          ) : customInput ? (
            <p className="text-xs text-[var(--color-text-dim)]">
              Enter aspect ratio (W:H)
            </p>
          ) : null}
        </div>
      )}
    </div>
  )
}
