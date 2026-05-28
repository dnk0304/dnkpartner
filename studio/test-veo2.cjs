const { GoogleGenAI } = require("@google/genai")
const fs = require("fs")
require("dotenv").config()

const key = process.env.GOOGLE_API_KEY
console.log(`API key: ${key.substring(0,10)}... (${key.length} chars)`)

async function main() {
  const ai = new GoogleGenAI({ apiKey: key })
  
  console.log("Testing Veo 2 via Gemini API...")
  
  // Load a small test image (one of our coloring pages)
  const imgPath = "C:\\Users\\D\\Desktop\\panini-pano-website\\images\\generated\\gemini-comparison\\gemini_botanical_002_mushroom_forest.png"
  const imgB64 = fs.readFileSync(imgPath).toString("base64")
  
  try {
    let op = await ai.models.generateVideos({
      model: "veo-2.0-generate-001",
      prompt: "A detailed mushroom forest coloring book page slowly being colored by hand. Black line art fills with rich reds, forest greens, earthy browns. Overhead view, ASMR aesthetic.",
      referenceImages: [{
        referenceType: "REFERENCE_TYPE_STYLE",
        referenceImage: { imageBytes: imgB64, mimeType: "image/png" }
      }],
      generationConfig: {
        aspectRatio: "9:16",
        durationSeconds: 8
      }
    })
    
    console.log("Operation started:", op.name)
    
    // Poll until done
    while (!op.done) {
      await new Promise(r => setTimeout(r, 5000))
      op = await ai.operations.getVideosOperation({ operation: op })
      console.log(`Polling... done: ${op.done}`)
    }
    
    if (op.response?.generatedSamples) {
      const sample = op.response.generatedSamples[0]
      const videoBytes = Buffer.from(sample.video.videoBytes, "base64")
      const out = "C:\\Users\\D\\Desktop\\panini-pano-website\\images\\generated\\video\\veo2_test.mp4"
      fs.writeFileSync(out, videoBytes)
      console.log(`✅ Veo 2 video saved: ${out} (${Math.round(videoBytes.length/1024/1024*10)/10}MB)`)
    } else {
      console.log("Response:", JSON.stringify(op).substring(0, 300))
    }
  } catch(e) {
    console.log("Error:", e.message?.substring(0, 300))
    if (e.status) console.log("Status:", e.status)
    if (e.errorDetails) console.log("Details:", JSON.stringify(e.errorDetails).substring(0, 200))
  }
}

main()
