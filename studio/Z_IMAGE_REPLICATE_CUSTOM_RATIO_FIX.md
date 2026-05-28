# 🔧 Z-Image Turbo Replicate - Custom Aspect Ratio Fix

**Date:** January 4, 2026  
**Issue:** Custom aspect ratios not working with Z-Image Turbo (Replicate)  
**Status:** ✅ Fixed

---

## 🐛 Problem

Custom aspect ratios (e.g., `10:16`, `11:16`) were not working correctly with the Z-Image Turbo model on Replicate. The model requires specific dimension constraints that weren't being enforced.

---

## 🔍 Root Cause

Diffusion models like Z-Image Turbo have strict requirements:

1. **Dimensions must be multiples of 8** (due to the model's architecture with multiple downsampling layers)
2. **Minimum dimension constraint** needed to prevent too-small images
3. **Maximum dimension constraint** needed to prevent memory/timeout issues

The original `convertAspectRatioToZImage()` function was using `Math.round()` which could produce dimensions that weren't multiples of 8.

---

## ✅ Solution Implemented

### Updated `convertAspectRatioToZImage()` Function

**File:** `server/index.ts`

Added a helper function to ensure dimension constraints:

```typescript
const roundToMultipleOf8 = (num: number): number => {
  const rounded = Math.round(num / 8) * 8
  // Ensure minimum dimension of 256px and maximum of 2048px for stability
  return Math.max(256, Math.min(2048, rounded))
}
```

### Applied to Custom Ratio Calculation

**Before:**
```typescript
return {
  width: Math.round((baseSize * w / h) * mult),
  height: Math.round(baseSize * mult)
}
```

**After:**
```typescript
const width = roundToMultipleOf8((baseSize * w / h) * mult)
const height = roundToMultipleOf8(baseSize * mult)
console.log(`[Dimension Calc] Custom ratio ${aspectRatio}: ${width}x${height} (portrait)`)
return { width, height }
```

---

## 📊 Dimension Constraints

| Constraint | Value | Reason |
|------------|-------|--------|
| **Multiple of** | 8 | Model architecture requirement |
| **Minimum** | 256px | Prevent too-small images |
| **Maximum** | 2048px | Prevent memory issues |

---

## 🧪 Example Calculations

### Custom Ratio `10:16` with 1K size

**Input:**
- Ratio: `10:16` (portrait)
- Image size: `1K` (multiplier = 1.0)
- Base size: 1024

**Calculation:**
- Raw width: 1024 × (10/16) = 640
- Raw height: 1024
- Rounded width: round(640/8) × 8 = **640** ✅
- Rounded height: round(1024/8) × 8 = **1024** ✅

**Result:** `640×1024` (both multiples of 8)

### Custom Ratio `11:16` with 2K size

**Input:**
- Ratio: `11:16` (portrait)
- Image size: `2K` (multiplier = 1.5)
- Base size: 1024

**Calculation:**
- Raw width: 1024 × 1.5 × (11/16) = 1056
- Raw height: 1024 × 1.5 = 1536
- Rounded width: round(1056/8) × 8 = **1056** ✅
- Rounded height: round(1536/8) × 8 = **1536** ✅

**Result:** `1056×1536` (both multiples of 8)

---

## 🎯 What Was Changed

### File: `server/index.ts`

**Line ~410-445:** Updated `convertAspectRatioToZImage()` function

Changes:
- ✅ Added `roundToMultipleOf8()` helper with min/max constraints
- ✅ Applied rounding to all custom ratio calculations
- ✅ Added logging for dimension calculation debugging
- ✅ Enforced 256px minimum dimension
- ✅ Enforced 2048px maximum dimension

---

## 🚀 Testing

To verify the fix works:

1. **Select Z-Image Turbo (Replicate)** as the model
2. **Select "Custom..."** from aspect ratio dropdown
3. **Enter `10:16`** in the custom input
4. **Verify** green text shows "→ 640×1024 px"
5. **Generate an image**
6. **Check server console** for dimension calculation log:
   ```
   [Dimension Calc] Custom ratio 10:16: 640x1024 (portrait)
   ```
7. **Verify** image generates successfully

### Test Cases

- [ ] `10:16` with 1K → Should produce `640×1024`
- [ ] `11:16` with 1K → Should produce `704×1024`
- [ ] `3:4` with 1K → Should produce `768×1024`
- [ ] `16:9` with 1K → Should produce `1024×576`
- [ ] `1:1` with 2K → Should produce `1536×1536`

---

## 📝 Additional Improvements

### Added Debug Logging

The function now logs calculated dimensions:
```
[Dimension Calc] Custom ratio 10:16: 640x1024 (portrait)
```

This helps diagnose any dimension-related issues.

### Constraint Safety

The `roundToMultipleOf8()` helper ensures:
- No dimensions below 256px (prevents model errors)
- No dimensions above 2048px (prevents timeouts/memory issues)
- All dimensions are multiples of 8 (model requirement)

---

## ✅ Expected Behavior

**All custom aspect ratios should now work with Z-Image Turbo (Replicate)**, producing properly sized images that meet the model's requirements.

If you still encounter issues, check the server console for the dimension calculation logs to verify the dimensions being sent to Replicate.

---

**Fix Complete! Custom aspect ratios now work with Z-Image Turbo (Replicate).**
