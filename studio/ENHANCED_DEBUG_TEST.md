# 🔍 Enhanced Debug Logging - Test Instructions

**Issue:** Custom aspect ratios showing valid in frontend but still generating 1:1 images

---

## ✅ New Debug Logs Added

### Frontend State Management Tracking

**Added to `App.tsx`:**

```typescript
[App] setAspectRatio called with: "10:16"    // When state updates
[App] About to send API request with aspectRatio: "10:16"    // Before API call
```

---

## 🧪 Complete Test Flow

### Step 1: Clear Browser Console
Press Ctrl+Shift+K (Firefox) or Ctrl+Shift+J (Chrome) and clear the console

### Step 2: Perform Test Generation

1. Select **Z-Image Turbo (Replicate)** model
2. Select **"Custom..."** aspect ratio
3. Type **`10:16`** in the custom input field
4. **DO NOT click "Start Generation" yet!**
5. Look at the settings summary text - it should show: `... • 10:16 • 1K`
6. Now click **"Start Generation"**

### Step 3: Check Browser Console Output

**Expected complete log sequence:**

```
[AspectRatioSelector] Custom input: 1
[AspectRatioSelector] Validation failed for: 1
[AspectRatioSelector] Custom input: 10
[AspectRatioSelector] Validation failed for: 10
[AspectRatioSelector] Custom input: 10:
[AspectRatioSelector] Validation failed for: 10:
[AspectRatioSelector] Custom input: 10:1
[AspectRatioSelector] ✅ Valid! Calling onChange with: 10:1
[App] setAspectRatio called with: 10:1    ← NEW LOG
[AspectRatioSelector] Custom input: 10:16
[AspectRatioSelector] ✅ Valid! Calling onChange with: 10:16
[App] setAspectRatio called with: 10:16    ← NEW LOG
[App] About to send API request with aspectRatio: 10:16    ← NEW LOG
```

---

## 🎯 Diagnose the Issue

### Scenario A: State Not Updating
```
[AspectRatioSelector] ✅ Valid! Calling onChange with: 10:16
❌ [App] setAspectRatio called with: 10:16    ← MISSING
```

**Problem:** The onChange callback isn't being called or there's a React issue

---

### Scenario B: State Updates But Old Value Sent to API
```
[App] setAspectRatio called with: 10:16
... (click Start Generation)
[App] About to send API request with aspectRatio: 1:1    ← WRONG VALUE!
```

**Problem:** The `processQueue` callback has a stale closure over `aspectRatio`

**Solution:** This is a React closure issue - the callback needs to read the latest value

---

### Scenario C: Correct Value Sent But Server Issues
```
[App] About to send API request with aspectRatio: 10:16    ← CORRECT
```

**Then check server console** for what it receives

---

## 🔧 If Scenario B Occurs (Stale Closure)

This is the most likely issue. The `processQueue` function captures `aspectRatio` at the time it's created, not when it runs.

**Potential Fix:** Use a ref for the latest value, or restructure the dependency array

---

## 📊 Server Console Check

You should also see in the server terminal:

```
[2026-01-04T...] Received aspectRatio: "10:16"
[2026-01-04T...] isValidAspectRatio result: true
[2026-01-04T...] Using aspectRatio: "10:16"
[2026-01-04T...] About to call convertAspectRatioToZImage with:
  validAspectRatio: "10:16"
  validImageSize: "1K"
[Dimension Calc] Custom ratio 10:16: 640x1024 (portrait)
[2026-01-04T...] Final Dimensions: 640x1024
```

---

## 🚀 What to Share

Please share the complete browser console output showing:
1. All `[AspectRatioSelector]` logs
2. All `[App]` logs
3. Whether the settings summary shows the correct aspect ratio before clicking "Start Generation"

This will pinpoint exactly where the issue is!

---

**Test now and share the browser console output!**
