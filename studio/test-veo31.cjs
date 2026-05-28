/**
 * Test Veo 3.1 via Vertex AI using service account credentials
 */
require("dotenv").config()
const { GoogleAuth } = require("google-auth-library")
const fs = require("fs"), path = require("path")

const PROJECT   = "openclaw-dnk"
const LOCATION  = "us-central1"
const MODEL     = "veo-3.1-generate-preview"   // Veo 3.1
const KEY_PATH  = path.join(__dirname, "vertex-key.json")
const OUT_DIR   = path.join(__dirname, "test-veo31-output")
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function main() {
  if (!fs.existsSync(KEY_PATH)) {
    console.error(`❌ Key file not found: ${KEY_PATH}`)
    console.error("Run cloud-shell-gcloud.cjs first to create the service account key")
    process.exit(1)
  }

  fs.mkdirSync(OUT_DIR, { recursive: true })

  // Auth
  const auth = new GoogleAuth({
    keyFile: KEY_PATH,
    scopes: ["https://www.googleapis.com/auth/cloud-platform"]
  })
  const client = await auth.getClient()
  const token = await client.getAccessToken()
  const accessToken = token.token

  console.log("✅ Auth OK — got access token")
  console.log(`Project: ${PROJECT} | Location: ${LOCATION}`)
  console.log(`Model: ${MODEL}\n`)

  const endpoint = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/${LOCATION}/publishers/google/models/${MODEL}:predictLongRunning`

  const body = {
    instances: [{
      prompt: "A coloring book page with intricate botanical flowers filling with warm amber and sage colors, ASMR pen coloring, overhead view, soft natural lighting, timelapse",
    }],
    parameters: {
      aspectRatio: "9:16",
      durationSeconds: 8,
      sampleCount: 1,
      enhancePrompt: true,
    }
  }

  console.log("Calling Veo 3.1 Vertex AI endpoint...")
  const opRes = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  })

  if (!opRes.ok) {
    const err = await opRes.text()
    console.error(`❌ API error ${opRes.status}:`, err)
    process.exit(1)
  }

  const op = await opRes.json()
  console.log("Operation:", op.name)

  // Poll
  const pollEndpoint = `https://${LOCATION}-aiplatform.googleapis.com/v1/${op.name}`
  let done = false
  const t0 = Date.now()

  while (!done) {
    await sleep(8000)
    const elapsed = Math.round((Date.now() - t0) / 1000)
    
    const freshToken = (await client.getAccessToken()).token
    const pollRes = await fetch(pollEndpoint, {
      headers: { "Authorization": `Bearer ${freshToken}` }
    })
    const pollData = await pollRes.json()
    
    console.log(`  polling ${elapsed}s... done=${pollData.done}`)

    if (pollData.done) {
      done = true
      
      if (pollData.error) {
        console.error("❌ Operation error:", JSON.stringify(pollData.error))
        process.exit(1)
      }

      const videos = pollData.response?.predictions?.[0]?.bytesBase64Encoded
        ? [pollData.response.predictions[0]]
        : pollData.response?.generatedSamples || pollData.response?.videos || []
      
      console.log("Response keys:", Object.keys(pollData.response || {}))
      
      // Try to find video bytes in any format
      const allKeys = JSON.stringify(pollData.response)
      console.log("Response (truncated):", allKeys.substring(0, 500))
      
      // Download if URI provided
      const predictions = pollData.response?.predictions || []
      for (let i = 0; i < predictions.length; i++) {
        const p = predictions[i]
        if (p.bytesBase64Encoded) {
          const buf = Buffer.from(p.bytesBase64Encoded, "base64")
          const outPath = path.join(OUT_DIR, `veo31_test_${i}.mp4`)
          fs.writeFileSync(outPath, buf)
          console.log(`\n✅ Video saved: ${outPath} (${(buf.length/1024/1024).toFixed(1)}MB)`)
        } else if (p.videoUri || p.uri) {
          const uri = p.videoUri || p.uri
          const freshToken2 = (await client.getAccessToken()).token
          const dlRes = await fetch(uri, {
            headers: { "Authorization": `Bearer ${freshToken2}` }
          })
          if (dlRes.ok) {
            const buf = Buffer.from(await dlRes.arrayBuffer())
            const outPath = path.join(OUT_DIR, `veo31_test_${i}.mp4`)
            fs.writeFileSync(outPath, buf)
            console.log(`\n✅ Video downloaded: ${outPath} (${(buf.length/1024/1024).toFixed(1)}MB)`)
          }
        }
      }
      
      if (predictions.length === 0) {
        console.log("\n⚠️  No predictions in response — full response:")
        console.log(JSON.stringify(pollData, null, 2).substring(0, 2000))
      }
    }

    if (Date.now() - t0 > 600000) {
      console.error("Timeout after 10 minutes")
      break
    }
  }
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1) })
