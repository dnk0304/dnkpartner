# 🔍 Debug Guide: Custom Aspect Ratio with Z-Image Turbo Replicate

**Issue:** Images still generating in 1:1 aspect with custom ratios like `10:16`

---

## 🧪 Testing Steps

### Step 1: Check Frontend is Sending Correct Value

1. Open browser DevTools (F12)
2. Go to **Network** tab
3. Select **Z-Image Turbo (Replicate)** model
4. Select **"Custom..."** aspect ratio
5. Enter **`10:16`**
6. Click **"Start Generation"**
7. Look for the `/api/generate` request
8. Check the **Request Payload**:

**Expected:**
```json
{
  "prompt": "your prompt",
  "aspectRatio": "10:16",    ← Should be "10:16", not "1:1"
  "imageSize": "1K",
  "model": "z-image-turbo-replicate"
}
```

**If aspectRatio is "1:1" or "custom":**
- ❌ Frontend issue - not passing the custom value correctly

---

### Step 2: Check Server Receives Correct Value

Look at the **server console** when you generate. You should see:

```
[2026-01-04T...] Received aspectRatio: "10:16"
[2026-01-04T...] isValidAspectRatio result: true
[2026-01-04T...] Using aspectRatio: "10:16"
[2026-01-04T...] About to call convertAspectRatioToZImage with:
  validAspectRatio: "10:16"
  validImageSize: "1K"
[Dimension Calc] Custom ratio 10:16: 640x1024 (portrait)
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

**If you see different values:**

### Scenario A: Received aspectRatio is "custom"
```
[...] Received aspectRatio: "custom"
[...] isValidAspectRatio result: false
[...] Using aspectRatio: "1:1"    ← Falls back to 1:1
```

**Problem:** Frontend is sending "custom" instead of the actual custom value

**Fix:** The `AspectRatioSelector` component should call `onChange()` with the custom input value, not with "custom"

---

### Scenario B: Received aspectRatio is "1:1"
```
[...] Received aspectRatio: "1:1"
[...] Using aspectRatio: "1:1"
```

**Problem:** Frontend state isn't updating when custom ratio is entered

**Check:**
- Is the custom input field calling `onChange` properly?
- Is the validation passing before calling `onChange`?
- Check React DevTools to see the `aspectRatio` state value

---

### Scenario C: Dimensions are 1024x1024 despite correct ratio
```
[...] Using aspectRatio: "10:16"
[...] Final Dimensions: 1024x1024    ← Wrong!
```

**Problem:** `convertAspectRatioToZImage()` function not handling custom ratios

**This should not happen** with our fix, but if it does, check:
- Is the custom ratio matching the regex pattern?
- Is it falling through to the default ratioMap?

---

## 🎯 Most Likely Issue

Based on the symptoms (images generating as 1:1), the most likely cause is:

### Frontend Not Calling onChange with Custom Value

Check `AspectRatioSelector.tsx` line ~60:

```typescript
// Valid input
setValidationError(null)
onChange(input)    ← This MUST be called with the custom ratio value
```

If this isn't being called, or is being called with "custom" instead of the actual ratio, that's the problem.

---

## 🔧 Quick Test

Add this to `AspectRatioSelector.tsx` in the `handleCustomInputChange` function:

```typescript
const handleCustomInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const input = e.target.value.trim()
  setCustomInput(input)
  
  console.log('[AspectRatioSelector] Custom input:', input)  // ADD THIS

  if (!input) {
    setValidationError(null)
    return
  }

  // Validate format
  if (!isValidCustomAspectRatio(input)) {
    setValidationError("Invalid format. Use W:H (1-99 range, e.g., 10:16)")
    console.log('[AspectRatioSelector] Validation failed')  // ADD THIS
    return
  }

  // Valid input
  setValidationError(null)
  console.log('[AspectRatioSelector] Calling onChange with:', input)  // ADD THIS
  onChange(input)
}
```

Then check the browser console to see if onChange is being called with the correct value.

---

## 📊 What to Share

If the issue persists, please share:

1. **Browser Network tab** - The `/api/generate` request payload
2. **Server console output** - The validation and dimension logs
3. **Browser console output** - Any errors or our debug logs

This will help identify exactly where the value is getting lost.

---

**Next Steps:** Test with custom ratio `10:16` and check the server console logs above.
