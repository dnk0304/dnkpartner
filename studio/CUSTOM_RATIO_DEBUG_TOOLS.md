# 🔧 Custom Aspect Ratio - Debugging Tools Added

**Date:** January 4, 2026  
**Issue:** Custom aspect ratios generating as 1:1 with Z-Image Turbo Replicate  
**Status:** Debug logging added to trace the issue

---

## 🛠️ Debug Logging Added

### Frontend (Browser Console)

**File:** `src/components/AspectRatioSelector.tsx`

Added console logs to track the custom input flow:

```typescript
[AspectRatioSelector] Custom input: "10:16"
[AspectRatioSelector] ✅ Valid! Calling onChange with: "10:16"
```

**Or if validation fails:**
```typescript
[AspectRatioSelector] Custom input: "100:16"
[AspectRatioSelector] Validation failed for: "100:16"
```

---

### Backend (Server Console)

**File:** `server/index.ts`

Added multiple debug checkpoints:

#### 1. Aspect Ratio Reception & Validation
```
[2026-01-04T...] Received aspectRatio: "10:16"
[2026-01-04T...] isValidAspectRatio result: true
[2026-01-04T...] Using aspectRatio: "10:16"
```

#### 2. Dimension Calculation Input
```
[2026-01-04T...] About to call convertAspectRatioToZImage with:
  validAspectRatio: "10:16"
  validImageSize: "1K"
```

#### 3. Dimension Calculation Result
```
[Dimension Calc] Custom ratio 10:16: 640x1024 (portrait)
```

#### 4. Final Values Sent to Replicate
```
[2026-01-04T...] Calling Z-Image-Turbo via Replicate
  Final Dimensions: 640x1024
  Expected for 10:16 @ 1K: 640x1024
[2026-01-04T...] Replicate Z-Image input: {
  prompt: "...",
  width: 640,
  height: 1024,
  steps: 8
}
```

---

## 🧪 How to Use These Logs

### Step 1: Open Both Consoles

1. **Browser Console:** F12 → Console tab
2. **Server Console:** Terminal where `npm run server` is running

### Step 2: Perform Test Generation

1. Select **Z-Image Turbo (Replicate)**
2. Select **"Custom..."** aspect ratio  
3. Type **`10:16`**
4. Add a prompt
5. Click **"Start Generation"**

### Step 3: Read the Logs

**Expected Flow (Working):**

**Browser:**
```
[AspectRatioSelector] Custom input: 1
[AspectRatioSelector] Custom input: 10
[AspectRatioSelector] Custom input: 10:
[AspectRatioSelector] Custom input: 10:1
[AspectRatioSelector] ✅ Valid! Calling onChange with: 10:1
[AspectRatioSelector] Custom input: 10:16
[AspectRatioSelector] ✅ Valid! Calling onChange with: 10:16
```

**Server:**
```
[...] Received aspectRatio: "10:16"
[...] isValidAspectRatio result: true
[...] Using aspectRatio: "10:16"
[...] About to call convertAspectRatioToZImage with:
  validAspectRatio: "10:16"
  validImageSize: "1K"
[Dimension Calc] Custom ratio 10:16: 640x1024 (portrait)
[...] Final Dimensions: 640x1024
[...] Replicate Z-Image input: { ..., width: 640, height: 1024, ... }
```

---

## 🔍 Diagnose Issues

### Issue A: Frontend Not Calling onChange

**Symptoms:**
- ✅ Browser shows: `[AspectRatioSelector] Custom input: "10:16"`
- ❌ Browser doesn't show: `✅ Valid! Calling onChange with: "10:16"`

**Cause:** Validation is failing

**Check:**
- Is the regex pattern matching correctly?
- Is `isValidCustomAspectRatio()` working?

---

### Issue B: onChange Called But Server Receives Wrong Value

**Symptoms:**
- ✅ Browser shows: `✅ Valid! Calling onChange with: "10:16"`
- ❌ Server shows: `Received aspectRatio: "1:1"` or `"custom"`

**Cause:** State not updating or network request using stale value

**Fix:** Check if `aspectRatio` state in `App.tsx` is updating properly

---

### Issue C: Server Receives Correct Value But Falls Back to 1:1

**Symptoms:**
- ✅ Server shows: `Received aspectRatio: "10:16"`
- ❌ Server shows: `isValidAspectRatio result: false`
- ❌ Server shows: `Using aspectRatio: "1:1"`

**Cause:** Server-side validation function not matching frontend

**Fix:** Check if `isValidAspectRatio()` regex on server matches frontend

---

### Issue D: Validation Passes But Wrong Dimensions Calculated

**Symptoms:**
- ✅ Server shows: `Using aspectRatio: "10:16"`
- ❌ Server shows: `Final Dimensions: 1024x1024`

**Cause:** `convertAspectRatioToZImage()` not handling custom ratios

**Check:** Is the custom ratio matching the regex in the dimension function?

---

## 📊 What to Share for Support

If the issue persists, please share screenshots or copy-paste of:

1. **Browser Console** - All `[AspectRatioSelector]` logs
2. **Server Console** - All logs from "Received aspectRatio" through "Replicate Z-Image input"
3. **Network Tab** - The `/api/generate` request payload JSON

---

## 🎯 Next Steps

1. Test with custom ratio `10:16`
2. Check both console outputs
3. Identify which checkpoint is failing
4. Share the logs if issue persists

---

**These debug tools will help pinpoint exactly where the custom aspect ratio value is getting lost or changed.**
