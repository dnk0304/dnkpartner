# Cover Generation Fixes

## Issues Found

### 1. Gradient Backgrounds Not Applied
**Problem**: CSS gradient strings (e.g., `linear-gradient(135deg, #ff6b6b 0%, #feca57 100%)`) are assigned to `ctx.fillStyle` but Canvas doesn't support CSS gradient syntax.

**Solution**: Parse CSS gradient strings and create Canvas gradient objects using `createLinearGradient()` or `createRadialGradient()`.

### 2. Text Displacement with Center/Right Alignment
**Problem**: When text has `textAlign: center` or `right`, the canvas draws text relative to the anchor point, but background rectangles are still drawn from the left edge, causing misalignment.

**Solution**: Adjust the background rectangle position based on text alignment and measured text width.

## Files to Fix

- `dennisproject/src/components/KDPMode/steps/KDPCoverStep.tsx`
  - Lines 2401-2414: Gradient background rendering
  - Lines 2490-2524: Text background alignment
  - Lines 2532-2550: Text rendering alignment

## Implementation

### Gradient Background Parser
Create a helper function to convert CSS gradient strings to Canvas gradients:

```typescript
function parseAndCreateGradient(
  ctx: CanvasRenderingContext2D,
  gradientString: string,
  x: number,
  y: number,
  width: number,
  height: number
): CanvasGradient | string {
  // Handle solid colors
  if (!gradientString.includes('gradient')) {
    return gradientString
  }
  
  // Parse linear-gradient
  if (gradientString.startsWith('linear-gradient')) {
    const match = gradientString.match(/linear-gradient\(([^)]+)\)/)
    if (!match) return gradientString
    
    const parts = match[1].split(',').map(s => s.trim())
    const angle = parts[0].includes('deg') ? parseFloat(parts[0]) : 135
    const colorStops = parts.slice(1)
    
    // Convert angle to Canvas coordinates
    const radians = ((angle - 90) * Math.PI) / 180
    const x1 = x + (Math.cos(radians) * width) / 2
    const y1 = y + (Math.sin(radians) * height) / 2
    const x2 = x + width - (Math.cos(radians) * width) / 2
    const y2 = y + height - (Math.sin(radians) * height) / 2
    
    const gradient = ctx.createLinearGradient(x1, y1, x2, y2)
    
    colorStops.forEach(stop => {
      const match = stop.match(/([#\w]+)\s+(\d+)%/)
      if (match) {
        gradient.addColorStop(parseFloat(match[2]) / 100, match[1])
      }
    })
    
    return gradient
  }
  
  // Parse radial-gradient
  if (gradientString.startsWith('radial-gradient')) {
    const centerX = x + width / 2
    const centerY = y + height / 2
    const radius = Math.sqrt(width * width + height * height) / 2
    
    const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius)
    
    const match = gradientString.match(/radial-gradient\([^,]+,(.+)\)/)
    if (match) {
      const colorStops = match[1].split(',').map(s => s.trim())
      colorStops.forEach(stop => {
        const match = stop.match(/([#\w]+)\s+(\d+)%/)
        if (match) {
          gradient.addColorStop(parseFloat(match[2]) / 100, match[1])
        }
      })
    }
    
    return gradient
  }
  
  return gradientString
}
```

### Text Alignment Fix
Adjust text and background positioning based on alignment:

```typescript
// Calculate text width for alignment
let textX = x
let bgX = x - padding

if (textEl.style.textAlign === 'center') {
  textX = x + textEl.width / 2
  bgX = x
} else if (textEl.style.textAlign === 'right') {
  textX = x + textEl.width
  bgX = x
}

// Draw background with correct position
ctx.fillRect(
  bgX,
  y - verticalPadding,
  textEl.width + padding * 2,
  totalTextHeight + verticalPadding * 2
)

// Draw text with correct alignment
ctx.fillText(line, textX, lineY)
```

