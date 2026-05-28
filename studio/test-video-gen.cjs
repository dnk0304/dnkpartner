const http = require("http")
const fs = require("fs")
const path = require("path")
const { execSync } = require("child_process")

const VIDEO_OUT = "C:\\Users\\D\\Desktop\\panini-pano-website\\images\\generated\\video"
const GEMINI_DIR = "C:\\Users\\D\\Desktop\\panini-pano-website\\images\\generated\\gemini-comparison"
const DOWNLOADS = "C:\\Users\\D\\Desktop\\dprosjekt\\dennisproject\\downloads"

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function callVideoAPI(body, timeoutMs = 600000) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body)
    const req = http.request({
      hostname: "localhost", port: 3001, path: "/api/generate-video",
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) }
    }, res => {
      let d = ""
      res.on("data", c => d += c)
      res.on("end", () => { try { resolve(JSON.parse(d)) } catch(e) { resolve({ raw: d.substring(0,500) }) } })
    })
    req.on("error", reject)
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error("timeout")) })
    req.write(data); req.end()
  })
}

function getLatestVideo() {
  const files = fs.readdirSync(DOWNLOADS)
    .filter(f => f.endsWith(".mp4"))
    .map(f => ({ name: f, mtime: fs.statSync(path.join(DOWNLOADS, f)).mtime }))
    .sort((a, b) => b.mtime - a.mtime)
  return files.length > 0 ? path.join(DOWNLOADS, files[0].name) : null
}

async function main() {
  // Convert best PNG to JPEG for Veo (it expects JPEG)
  const geminiFile = path.join(GEMINI_DIR, "gemini_botanical_002_mushroom_forest.png")
  const jpegFile = path.join(GEMINI_DIR, "ref_for_video.jpg")
  
  if (!fs.existsSync(jpegFile)) {
    console.log("Converting PNG to JPEG for Veo...")
    execSync(`ffmpeg -y -i "${geminiFile}" -vf "scale=1024:1024:force_original_aspect_ratio=decrease,pad=1024:1024:(ow-iw)/2:(oh-ih)/2:white" "${jpegFile}"`, { stdio: "ignore" })
  }
  
  const imgBase64 = "data:image/jpeg;base64," + fs.readFileSync(jpegFile).toString("base64")
  console.log(`Reference image size: ${(Buffer.byteLength(imgBase64) / 1024 / 1024).toFixed(1)}MB`)

  const PROMPT = "Satisfying time-lapse of someone hand-coloring an intricate adult coloring book page. The blank black-and-white botanical line art gradually fills with beautiful warm colors: amber flowers, sage green leaves, violet accents. Colors spread organically from one area to the next. Smooth, meditative, relaxing coloring book aesthetic. Camera stays still, top-down view of the page."

  // Test 1: Veo 3.1 with referenceImages
  console.log("\n🎬 Test 1: Veo 3.1 (6s, referenceImages)")
  const t0 = Date.now()
  try {
    const r = await callVideoAPI({
      model: "veo-3.1",
      prompt: PROMPT,
      referenceImages: [imgBase64],
      duration: 6,
      aspectRatio: "1:1",
      quality: "standard"
    })
    console.log("Result:", JSON.stringify(r).substring(0, 300))
    if (r.videoUrl) {
      const dest = path.join(VIDEO_OUT, "veo31_coloring.mp4")
      execSync(`curl -s -o "${dest}" "${r.videoUrl}"`)
      console.log(`✅ Saved: ${dest} (${Math.round(fs.statSync(dest).size/1024)}KB) in ${Math.round((Date.now()-t0)/1000)}s`)
    } else if (r.fileName) {
      const src = path.join(DOWNLOADS, r.fileName)
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(VIDEO_OUT, "veo31_coloring.mp4"))
        console.log(`✅ Copied from downloads`)
      }
    }
  } catch(e) { console.log("Veo 3.1 error:", e.message) }

  await sleep(3000)

  // Test 2: Sora 2 text-to-video (no image, just prompt)
  console.log("\n🎬 Test 2: Sora 2 (5s, text-to-video only)")
  const t1 = Date.now()
  try {
    const r = await callVideoAPI({
      model: "sora-2",
      prompt: "Top-down time-lapse of someone coloring an intricate adult botanical coloring book page by hand. Blank black outlines gradually filled with warm amber, sage green, violet colors. Smooth meditative aesthetic, pencils or colored markers filling each section, warm ambient lighting.",
      duration: 5,
      aspectRatio: "1:1",
      quality: "standard"
    })
    console.log("Result:", JSON.stringify(r).substring(0, 300))
    if (r.videoUrl) {
      const dest = path.join(VIDEO_OUT, "sora2_coloring.mp4")
      execSync(`curl -s -o "${dest}" "${r.videoUrl}"`)
      console.log(`✅ Saved: ${dest} (${Math.round(fs.statSync(dest).size/1024)}KB) in ${Math.round((Date.now()-t1)/1000)}s`)
    }
  } catch(e) { console.log("Sora 2 error:", e.message) }

  console.log("\nCheck:", VIDEO_OUT)
}

main().catch(console.error)
