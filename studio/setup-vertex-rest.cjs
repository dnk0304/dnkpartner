/**
 * Creates Vertex AI service account via GCP REST API
 * Uses OAuth token extracted from authenticated browser session
 */
const { chromium } = require("playwright")
const https = require("https")
const fs = require("fs")
const path = require("path")

const CDP_URL = "http://127.0.0.1:18800"
const PROJECT = "openclaw-dnk"
const SA_ID   = "panini-pano-veo"
const KEY_OUT = path.join(__dirname, "vertex-key.json")

const sleep = ms => new Promise(r => setTimeout(r, ms))

function restCall(method, url, token, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const opts = {
      hostname: parsed.hostname, path: parsed.pathname + parsed.search,
      method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    }
    const req = https.request(opts, res => {
      let d = ""
      res.on("data", c => d += c)
      res.on("end", () => { try { resolve({ status: res.statusCode, body: JSON.parse(d) }) } catch { resolve({ status: res.statusCode, body: d }) } })
    })
    req.on("error", reject)
    if (body) req.write(JSON.stringify(body))
    req.end()
  })
}

async function main() {
  console.log("Extracting auth token from browser session...")
  const browser = await chromium.connectOverCDP(CDP_URL)
  const context = browser.contexts()[0]
  
  // Open a GCP console page and extract the auth token
  const page = await context.newPage()
  await page.goto(`https://console.cloud.google.com/?project=${PROJECT}`, {
    waitUntil: "domcontentloaded", timeout: 20000
  })
  await sleep(3000)

  // Extract OAuth2 token using the GCP console's internal auth
  const token = await page.evaluate(async () => {
    // Try window.gapi or fetch to the token endpoint
    try {
      const r = await fetch("https://oauth2.googleapis.com/tokeninfo", {
        method: "GET",
        credentials: "include"
      })
      const d = await r.json()
      return d.access_token || null
    } catch { return null }
  }).catch(() => null)

  // Alternative: intercept from gapi
  const token2 = await page.evaluate(() => {
    if (window.gapi && window.gapi.auth && window.gapi.auth.getToken) {
      const t = window.gapi.auth.getToken()
      return t ? t.access_token : null
    }
    return null
  }).catch(() => null)

  // Try via cookies / identity
  const cookies = await context.cookies(["https://console.cloud.google.com"])
  const sapisid = cookies.find(c => c.name === "SAPISID" || c.name === "__Secure-3PAPISID")
  
  console.log(`Token from tokeninfo: ${token ? "found" : "null"}`)
  console.log(`Token from gapi: ${token2 ? "found" : "null"}`)
  console.log(`SAPISID cookie: ${sapisid ? "found" : "null"}`)

  // Use page.route to intercept an actual authenticated API call to get the bearer token
  let capturedToken = null
  await page.route("**/*", async route => {
    const headers = route.request().headers()
    const auth = headers["authorization"]
    if (auth && auth.startsWith("Bearer ") && !capturedToken) {
      capturedToken = auth.replace("Bearer ", "")
      console.log(`Captured bearer token: ${capturedToken.substring(0, 20)}...`)
    }
    await route.continue()
  })

  // Trigger an authenticated API call by navigating to the service accounts page
  await page.goto(
    `https://console.cloud.google.com/iam-admin/serviceaccounts?project=${PROJECT}`,
    { waitUntil: "domcontentloaded", timeout: 20000 }
  )
  await sleep(5000)
  
  // Also try fetch interceptor inside the page
  const tokenFromFetch = await page.evaluate(async (projectId) => {
    const orig = window.fetch
    let captured = null
    window.fetch = function(url, opts) {
      if (opts && opts.headers) {
        const auth = opts.headers["authorization"] || opts.headers["Authorization"]
        if (auth && auth.startsWith("Bearer ")) captured = auth.replace("Bearer ", "")
      }
      return orig.apply(this, arguments)
    }
    // Make a GCP API call to trigger auth
    try {
      await orig(`https://iam.googleapis.com/v1/projects/${projectId}/serviceAccounts`, { credentials: "include" })
    } catch {}
    window.fetch = orig
    return captured
  }, PROJECT).catch(() => null)

  const finalToken = capturedToken || tokenFromFetch || token2 || token
  await page.unroute("**/*")

  if (!finalToken) {
    console.log("\n⚠️  Could not capture auth token automatically.")
    console.log("Manual path: Go to console.cloud.google.com → Cloud Shell → run:")
    console.log(`  gcloud iam service-accounts create ${SA_ID} --display-name="Panini Pano Veo" --project=${PROJECT}`)
    console.log(`  gcloud projects add-iam-policy-binding ${PROJECT} --member="serviceAccount:${SA_ID}@${PROJECT}.iam.gserviceaccount.com" --role="roles/aiplatform.user"`)
    console.log(`  gcloud iam service-accounts keys create key.json --iam-account=${SA_ID}@${PROJECT}.iam.gserviceaccount.com`)
    await page.close()
    return
  }

  console.log(`\nUsing token: ${finalToken.substring(0, 20)}...`)

  // Create service account
  console.log("\n[1/3] Creating service account via REST API...")
  const createSA = await restCall("POST",
    `https://iam.googleapis.com/v1/projects/${PROJECT}/serviceAccounts`,
    finalToken, { accountId: SA_ID, serviceAccount: { displayName: "Panini Pano Veo" } }
  )
  console.log(`  Status: ${createSA.status}`)
  if (createSA.status === 409) console.log("  (Already exists — continuing)")
  else if (createSA.status !== 200) { console.log("  Error:", JSON.stringify(createSA.body).substring(0,200)); return }

  const saEmail = `${SA_ID}@${PROJECT}.iam.gserviceaccount.com`
  console.log(`  SA: ${saEmail}`)

  // Grant Vertex AI User role
  console.log("\n[2/3] Granting Vertex AI User role...")
  const getIAM = await restCall("POST",
    `https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT}:getIamPolicy`,
    finalToken, {}
  )
  if (getIAM.status === 200) {
    const policy = getIAM.body
    policy.bindings = policy.bindings || []
    const existing = policy.bindings.find(b => b.role === "roles/aiplatform.user")
    const member = `serviceAccount:${saEmail}`
    if (existing) { if (!existing.members.includes(member)) existing.members.push(member) }
    else { policy.bindings.push({ role: "roles/aiplatform.user", members: [member] }) }
    const setIAM = await restCall("POST",
      `https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT}:setIamPolicy`,
      finalToken, { policy }
    )
    console.log(`  Status: ${setIAM.status}`)
  } else { console.log("  Could not get IAM policy:", getIAM.status) }

  // Create key
  console.log("\n[3/3] Creating JSON key...")
  const createKey = await restCall("POST",
    `https://iam.googleapis.com/v1/projects/${PROJECT}/serviceAccounts/${saEmail}/keys`,
    finalToken, { privateKeyType: "TYPE_GOOGLE_CREDENTIALS_FILE", keyAlgorithm: "KEY_ALG_RSA_2048" }
  )
  console.log(`  Status: ${createKey.status}`)
  if (createKey.status === 200) {
    const keyJson = Buffer.from(createKey.body.privateKeyData, "base64").toString("utf8")
    fs.writeFileSync(KEY_OUT, keyJson)
    const parsed = JSON.parse(keyJson)
    console.log(`  ✅ Key saved: ${KEY_OUT}`)
    console.log(`  Project: ${parsed.project_id}`)
    console.log(`  Client email: ${parsed.client_email}`)
  } else { console.log("  Error:", JSON.stringify(createKey.body).substring(0,200)) }

  await page.close()
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1) })
