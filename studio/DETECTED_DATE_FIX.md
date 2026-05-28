# Exploding Trends "Detected Yesterday" Issue - Fixed

## Issue
Most trends in the Exploding Trends view were showing "Detected: Yesterday" even though they were active and updated today.

## Root Cause
The UI was displaying the `firstDetected` date instead of the `lastUpdated` date.

**Example**:
- Trend "Portable Blender" was first seen: **2025-12-28** (yesterday)
- But was updated today: **2025-12-29 23:00** (today)
- UI showed: **"Detected: Yesterday"** ❌
- Should show: **"Detected: Today"** ✅

## Why This Matters
When trends are "exploding", users want to know if they're **actively trending today**, not when they were historically first discovered. A trend that exploded yesterday and is still exploding today should show "Today" in the Detected column.

## Solution Applied

Changed all references from `firstDetected` to `lastUpdated` in the Exploding Trends view:

### File: `dennisproject/src/components/AITrends/views/ExplodingTrends.tsx`

**Changes Made:**

1. **Display Column (Line 582)**
   ```typescript
   // Before:
   {formatDate(trend.firstDetected)}
   
   // After:
   {formatDate(trend.lastUpdated)}
   ```

2. **Sort Type (Line 55)**
   ```typescript
   // Before:
   useState<'explosionScore' | 'growthRate' | 'volume' | 'firstDetected'>
   
   // After:
   useState<'explosionScore' | 'growthRate' | 'volume' | 'lastUpdated'>
   ```

3. **Time Range Filter (Line 119)**
   ```typescript
   // Before:
   filtered = filtered.filter(t => new Date(t.firstDetected).getTime() >= cutoff);
   
   // After:
   filtered = filtered.filter(t => new Date(t.lastUpdated).getTime() >= cutoff);
   ```

4. **Sort Logic (Lines 139-141)**
   ```typescript
   // Before:
   case 'firstDetected':
     aVal = new Date(a.firstDetected).getTime();
     bVal = new Date(b.firstDetected).getTime();
   
   // After:
   case 'lastUpdated':
     aVal = new Date(a.lastUpdated).getTime();
     bVal = new Date(b.lastUpdated).getTime();
   ```

5. **Column Header Click Handler (Line 463)**
   ```typescript
   // Before:
   onClick={() => handleSort('firstDetected')}
   
   // After:
   onClick={() => handleSort('lastUpdated')}
   ```

6. **Sort Indicator (Line 467)**
   ```typescript
   // Before:
   {sortBy === 'firstDetected' && (
   
   // After:
   {sortBy === 'lastUpdated' && (
   ```

## Impact

### Before Fix
```
Portable Blender         | Detected: Yesterday
Aesthetic Stickers Pack  | Detected: Yesterday
Aesthetic Room Decor     | Detected: Yesterday
...
```
(Even though they were all updated today at 23:00)

### After Fix
```
Portable Blender         | Detected: Today
Aesthetic Stickers Pack  | Detected: Today
Aesthetic Room Decor     | Detected: Today
...
```
(Correctly showing they're active today)

## How It Works Now

The `lastUpdated` field gets refreshed every time:
1. A scraper finds the trend again
2. The trend's volume/growth changes
3. The trend status changes (exploding → peaked, etc.)
4. Any source updates the trend data

This means:
- ✅ Trends show "Today" when they're actively trending today
- ✅ Trends show "Yesterday" only when they haven't been seen in the last 24 hours
- ✅ The "Detected" column now reflects **current activity**, not historical first appearance
- ✅ Time range filters work correctly (e.g., "Last 24 hours" shows today's active trends)

## Semantic Meaning

**Before**: "Detected" meant "When was this trend first discovered historically?"
**After**: "Detected" means "When was this trend last seen/active?"

This is more useful for users who want to see **what's trending NOW**, not what was trending at some point in the past.

## Note on firstDetected Field

The `firstDetected` field is still stored and useful for:
- Historical analysis
- Tracking how long a trend has been around
- Understanding trend lifecycle

But for the UI display of "exploding trends", showing `lastUpdated` is more accurate and useful.

## Testing

To verify the fix works:
1. Refresh the Exploding Trends page
2. Trends that were updated today (timestamp 2025-12-29) should show "Today"
3. Trends that haven't been updated since yesterday should show "Yesterday"
4. Sorting by "Detected" now sorts by most recent activity

