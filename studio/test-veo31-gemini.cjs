/**
 * Test Veo 3.1 via Gemini API (same endpoint that works for Veo 2)
 * No service account needed — uses GOOGLE_API_KEY
 */
require("dotenv").config()
const { GoogleGenAI } = require("@google/genai")
const fs = require("fs"), path = require("path")
const sleep = ms => new Promise(r => setTimeout(r, ms))

const OUT_DIR = path.join(__dirname, "test-veo31-output")
fs.mkdirSync(OUT_DIR, { recursive: true })

const MODELS = [
  "veo-3.1-generate-preview",
  "veo-3.0-generate-preview",
  "veo-3-generate-preview",
  "veo-3.1-fast-generate-preview",
]

async function testModel(ai, modelName) {
  console.log(`\n─── Testing: ${modelName} ───`)
  try {
    let op = await ai.models.generateVideos({
      model: modelName,
      prompt: "A coloring book page with intricate botanical flowers slowly being colored in with warm amber and sage tones. Overhead ASMR timelapse.",
      config: { aspectRatio: "9:16", durationSeconds: 8, numberOfVideos: 1 }
    })

    const opName = op.name || op.response?.name
    console.log(`  Operation: ${opName}`)

    const t0 = Date.now()
    while (!op.done) {
      if (Date.now() - t0 > 300000) { console.log("  Timeout 5min"); return false }
      await sleep(6000)
      op = await ai.operations.getVideosOperation({ operation: op })
      console.log(`  polling ${Math.round((Date.now()-t0)/1000)}s... done=${op.done}`)
    }

    const uri = op.response?.generatedVideos?.[0]?.video?.uri
    if (!uri) { console.log("  No video URI. Response:", JSON.stringify(op.response).substring(0, 200)); return false }

    // Download
    const dlRes = await fetch(`${uri}&key=${process.env.GOOGLE_API_KEY}`)
    if (!dlRes.ok) { console.log(`  Download failed: ${dlRes.status}`); return false }

    const buf = Buffer.from(await dlRes.arrayBuffer())
    const outPath = path.join(OUT_DIR, `${modelName.replace(/\./g, "_")}.mp4`)
    fs.writeFileSync(outPath, buf)
    console.log(`  ✅ Saved: ${outPath} (${(buf.length/1024/1024).toFixed(1)}MB)`)
    return true
  } catch(e) {
    console.log(`  ❌ Error: ${e.message.substring(0, 200)}`)
    return false
  }
}

async function main() {
  const apiKey = process.env.GOOGLE_API_KEY
  console.log(`API key: ${apiKey?.substring(0, 12)}... (${apiKey?.length} chars)`)
  const ai = new GoogleGenAI({ apiKey })

  // First, list available models to see what's accessible
  console.log("\n=== Available models (video-related) ===")
  try {
    const models = await ai.models.list()
    for await (const m of models) {
      if (m.name?.toLowerCase().includes("veo") || m.name?.toLowerCase().includes("video")) {
        console.log(` - ${m.name}  [${m.supportedActions?.join(", ") || "?"}]`)
      }
    }
  } catch(e) {
    console.log("Could not list models:", e.message.substring(0, 100))
  }

  // Try each Veo 3.1 variant
  for (const model of MODELS) {
    const ok = await testModel(ai, model)
    if (ok) {
      console.log(`\n🎉 ${model} works via Gemini API!`)
      console.log("Update server/index.ts to use this model name")
      break
    }
  }
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1) })
