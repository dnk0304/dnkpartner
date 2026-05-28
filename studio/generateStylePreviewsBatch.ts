// ============================================================
// One-time script to generate all 17 style preview images
// Run this with: node --loader tsx generateStylePreviewsBatch.ts
// ============================================================

import { generateAllStylePreviews } from "./server/generateStylePreviews.js"

console.log("╔════════════════════════════════════════════════════════════╗")
console.log("║  Style Preview Image Generation - Sequential Queue Mode   ║")
console.log("╚════════════════════════════════════════════════════════════╝\n")
console.log("📋 Total Images: 17 style previews")
console.log("🖼️  Format: 1:1 (1024x1024)")
console.log("🤖 Model: Z-Image-Turbo (Replicate)")
console.log("💰 Cost: ~$0.0425 total ($0.0025 per image)")
console.log("\n⚠️  IMPORTANT: Sequential generation (one at a time)")
console.log("   Each image waits for previous to complete before starting\n")
console.log("Starting generation...\n")

generateAllStylePreviews()
  .then((results) => {
    console.log("\n╔════════════════════════════════════════════════════════════╗")
    console.log("║              ✅ Batch Generation Completed!                 ║")
    console.log("╚════════════════════════════════════════════════════════════╝\n")
    console.log(`✓ Generated: ${Object.keys(results).length}/17 style previews`)
    console.log(`✓ Location: public/styles/\n`)
    console.log("Generated files:")
    Object.entries(results).forEach(([styleId, url]) => {
      console.log(`  • ${styleId} → ${url}`)
    })
    process.exit(0)
  })
  .catch((error) => {
    console.error("\n╔════════════════════════════════════════════════════════════╗")
    console.error("║              ❌ Error During Generation                     ║")
    console.error("╚════════════════════════════════════════════════════════════╝\n")
    console.error(error)
    process.exit(1)
  })

