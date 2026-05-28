# Cover Page Count Feature - Implementation Summary

## Feature Overview

Users can now set a **separate page count specifically for cover spine calculations**, independent of the interior page count. This allows for flexibility when:
- The interior is still being designed (pages TBD)
- KDP requires a specific spine width that differs from current interior page count
- Testing different spine widths without changing the interior

## How It Works

### Two Page Count Fields

1. **`pageCount`** (Interior)
   - Located in Book Setup step
   - Can be freely typed (including 0)
   - Represents the actual number of interior pages
   - No minimum validation - user has full control

2. **`coverPageCount`** (Cover Spine)
   - Located in Cover step
   - Optional field (defaults to `pageCount` if not set)
   - Used exclusively for spine width calculation
   - Min: 24 pages (KDP requirement enforced in calculation)
   - Max: 828 pages (KDP maximum)

### Calculation Logic

```typescript
// In KDPCoverStep.tsx
const effectivePageCount = project.coverPageCount ?? project.pageCount || 100

// This means:
// 1. If coverPageCount is set → use it
// 2. If coverPageCount is undefined → use pageCount
// 3. If both are 0/undefined → use 100 as safe default
```

### Spine Width Calculation

```typescript
// In calculateSpineWidth() - all locations
const effectivePageCount = Math.max(24, pageCount)
const spineWidth = effectivePageCount * caliper

// This enforces KDP's 24-page minimum regardless of input
```

## User Interface

### Cover Step - Page Count Input

Located in the purple "Cover Dimensions Info" card:

```
┌─────────────────────────────────────┐
│ Page Count for Cover Spine:        │
│ [  76  ] [Reset]                    │
│ ⚠ Cover uses 76 pages,              │
│   interior has 50 pages             │
├─────────────────────────────────────┤
│ Total Cover Size:                   │
│ 16.421" × 10.250"                   │
│ 4926 × 3075 px                      │
└─────────────────────────────────────┘
```

**Features:**
- Number input (24-828 range)
- "Reset" button appears when `coverPageCount ≠ pageCount`
- Warning shows when cover and interior page counts differ
- Live updates to cover dimensions as you type

## Test Cases

### Test Case 1: Default Behavior
```
pageCount: 50
coverPageCount: undefined
→ effectivePageCount: 50
→ Spine width: 50 × 0.002252 = 0.1126"
→ Cover width: 16.363"
```

### Test Case 2: Custom Cover Page Count
```
pageCount: 50
coverPageCount: 76
→ effectivePageCount: 76
→ Spine width: 76 × 0.002252 = 0.171"
→ Cover width: 16.421" ✅
→ Warning shows: "Cover uses 76 pages, interior has 50 pages"
```

### Test Case 3: Zero Interior Pages (Still Designing)
```
pageCount: 0
coverPageCount: 100
→ effectivePageCount: 100
→ Spine width: 100 × 0.002252 = 0.225"
→ Cover width: 16.475"
→ No warning (user explicitly set cover count)
```

### Test Case 4: Below Minimum
```
pageCount: 10
coverPageCount: undefined
→ effectivePageCount: 10
→ calculateSpineWidth enforces: Math.max(24, 10) = 24
→ Spine width: 24 × 0.002252 = 0.054"
→ Cover width: 16.304"
→ Red warning appears: "KDP requires minimum 24 pages"
```

### Test Case 5: Reset to Interior Count
```
pageCount: 50
coverPageCount: 76
→ User clicks "Reset"
→ coverPageCount: undefined
→ effectivePageCount: 50
→ Spine width: 50 × 0.002252 = 0.1126"
→ Cover width: 16.363"
→ Warning disappears
```

## Implementation Files Modified

### 1. Type Definition
**File:** `src/types/KDPMode.ts`
- Added `coverPageCount?: number` to `KDPProject` interface
- Updated `createEmptyProject()` to set `coverPageCount: undefined`
- Reverted `pageCount` to `0` (freely typable)

### 2. Cover Step Logic
**File:** `src/components/KDPMode/steps/KDPCoverStep.tsx`
- Changed calculation: `project.coverPageCount ?? project.pageCount || 100`
- Added UI input for `coverPageCount`
- Added "Reset" button when counts differ
- Added warning message when counts differ
- Updated validation to use `effectivePageCount`

### 3. Spine Width Validation (Unchanged)
These files still enforce 24-page minimum in calculations:
- `src/types/Rescaler.ts`
- `server/kdpPDF.ts`
- `server/rescalerPDF.ts`

## User Benefits

✅ **Flexibility**: Set cover spine independently from interior
✅ **KDP Compliance**: Ensures cover meets KDP requirements
✅ **Design Freedom**: Work on cover while interior is TBD
✅ **Clear Feedback**: Warnings when counts differ
✅ **Easy Reset**: One-click to sync with interior count

## Example Use Case

**Scenario:** User is designing an 8×10 coloring book

1. **Initial Setup** (Book Setup step)
   - Set `pageCount: 0` (haven't designed pages yet)
   
2. **Design Cover** (Cover step)
   - KDP rejected previous upload saying spine should be for 76 pages
   - Set `coverPageCount: 76`
   - Cover dimensions update to 16.421" × 10.250" ✅
   - Generate and download cover PDF

3. **Design Interior** (Interior step)
   - Add 76 pages of content
   - `pageCount` automatically becomes 76

4. **Sync Cover** (Cover step)
   - Click "Reset" button
   - `coverPageCount` clears
   - Now both use 76 pages
   - No warning displayed

## Migration Notes

**Existing Projects:**
- Will have `coverPageCount: undefined`
- Will use existing `pageCount` for spine calculation
- No breaking changes - works as before
- Users can optionally set `coverPageCount` to override

**New Projects:**
- Start with `pageCount: 0`, `coverPageCount: undefined`
- User can freely type both values
- Cover defaults to 100 pages if both are 0 (prevents errors)

