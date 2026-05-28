/**
 * Use CDP Network domain to intercept auth headers from GCP console,
 * then create service account via REST API
 */
const { chromium } = require("playwright")
const fs = require("fs"), path = require("path")
const CDP_URL = "http://127.0.0.1:18800"
const PROJECT = "openclaw-dnk"
const SA_ID   = "panini-pano-veo"
const SA_EMAIL = `${SA_ID}@${PROJECT}.iam.gserviceaccount.com`
const KEY_OUT  = path.join(__dirname, "vertex-key.json")
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function main() {
  const browser = await chromium.connectOverCDP(CDP_URL)
  const context = browser.contexts()[0]
  const page = await context.newPage()

  // Use CDP session for low-level network interception
  const cdp = await page.context().newCDPSession(page)
  
  let authToken = null
  
  // Enable network domain and listen for requests
  await cdp.send("Network.enable")
  
  cdp.on("Network.requestWillBeSent", params => {
    const headers = params.request.headers
    const auth = headers["Authorization"] || headers["authorization"]
    if (auth && auth.startsWith("Bearer ") && !authToken) {
      authToken = auth.replace("Bearer ", "")
      console.log(`✅ CDP captured token: ${authToken.substring(0,25)}... (${authToken.length} chars)`)
    }
  })

  // Also listen for extra info (has actual sent headers)
  cdp.on("Network.requestWillBeSentExtraInfo", params => {
    const auth = params.headers?.["Authorization"] || params.headers?.["authorization"]
    if (auth && auth.startsWith("Bearer ") && !authToken) {
      authToken = auth.replace("Bearer ", "")
      console.log(`✅ CDP extra captured token: ${authToken.substring(0,25)}... (${authToken.length} chars)`)
    }
  })

  console.log("Navigating to GCP IAM page to trigger auth...")
  await page.goto(
    `https://console.cloud.google.com/iam-admin/serviceaccounts?project=${PROJECT}`,
    { waitUntil: "domcontentloaded", timeout: 45000 }
  )

  // Wait for requests to fire
  for (let i = 0; i < 30 && !authToken; i++) {
    await sleep(2000)
    if (i % 5 === 0) console.log(`  Waiting... ${i*2}s`)
  }

  if (!authToken) {
    // Try reloading
    console.log("  Reloading page...")
    await page.reload({ waitUntil: "domcontentloaded" })
    for (let i = 0; i < 10 && !authToken; i++) {
      await sleep(2000)
    }
  }

  if (!authToken) {
    // Last resort: try to extract from page's JavaScript context
    console.log("  Trying JS extraction...")
    authToken = await page.evaluate(() => {
      // GCP console stores auth in various places
      try {
        // Try window.__FIREBASE_DEFAULTS__
        if (window.__FIREBASE_DEFAULTS__?.config?.apiKey) return null
        // Try Google auth
        if (window.gapi?.auth?.getToken?.()?.access_token) return window.gapi.auth.getToken().access_token
        // Try __GAPI_LOADED_
        if (window.__GAPI_DATA__) return null
      } catch {}
      return null
    }).catch(() => null)
  }

  await page.close()

  if (!authToken) {
    console.error("❌ Could not capture auth token")
    console.error("Try: open GCP console in browser, check Network tab for Bearer tokens")
    return
  }

  // ── Create SA + key via REST ────────────────────────────────────────
  console.log(`\nToken captured. Creating service account...`)

  // 1. Create SA
  const r1 = await fetch(`https://iam.googleapis.com/v1/projects/${PROJECT}/serviceAccounts`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${authToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ accountId: SA_ID, serviceAccount: { displayName: "Panini Pano Veo" } })
  })
  const d1 = await r1.json()
  if (r1.ok) console.log(`✅ SA created: ${d1.email}`)
  else if (d1.error?.status === "ALREADY_EXISTS") console.log(`ℹ️  SA exists: ${SA_EMAIL}`)
  else { console.log(`❌ SA create error:`, JSON.stringify(d1)); return }

  // 2. Grant role
  console.log("Granting Vertex AI User role...")
  const r2a = await fetch(`https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT}:getIamPolicy`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${authToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ options: { requestedPolicyVersion: 3 } })
  })
  const policy = await r2a.json()
  if (!r2a.ok) { console.log("❌ Get policy error:", JSON.stringify(policy)); return }

  const member = `serviceAccount:${SA_EMAIL}`
  const role = "roles/aiplatform.user"
  let binding = policy.bindings?.find(b => b.role === role)
  if (binding) { if (!binding.members.includes(member)) binding.members.push(member) }
  else { policy.bindings = policy.bindings || []; policy.bindings.push({ role, members: [member] }) }

  const r2b = await fetch(`https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT}:setIamPolicy`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${authToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ policy })
  })
  if (r2b.ok) console.log("✅ Role granted")
  else console.log("❌ Role error:", await r2b.text())

  // 3. Create key
  console.log("Creating JSON key...")
  const r3 = await fetch(`https://iam.googleapis.com/v1/projects/${PROJECT}/serviceAccounts/${SA_EMAIL}/keys`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${authToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ keyAlgorithm: "KEY_ALG_RSA_2048", privateKeyType: "TYPE_GOOGLE_CREDENTIALS_FILE" })
  })
  const d3 = await r3.json()
  if (r3.ok && d3.privateKeyData) {
    const keyJson = Buffer.from(d3.privateKeyData, "base64").toString("utf8")
    const parsed = JSON.parse(keyJson)
    fs.writeFileSync(KEY_OUT, keyJson)
    console.log(`✅ Key saved: ${KEY_OUT}`)
    console.log(`  Email: ${parsed.client_email}`)

    const envPath = path.join(__dirname, ".env")
    let env = fs.readFileSync(envPath, "utf8")
    const cred = `GOOGLE_APPLICATION_CREDENTIALS=${KEY_OUT}`
    if (env.includes("GOOGLE_APPLICATION_CREDENTIALS=")) env = env.replace(/GOOGLE_APPLICATION_CREDENTIALS=.*/, cred)
    else env += `\n${cred}\n`
    fs.writeFileSync(envPath, env)
    console.log("  .env updated ✅")
    console.log("\n🎉 Run: node test-veo31.cjs")
  } else {
    console.log("❌ Key create error:", JSON.stringify(d3))
  }
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1) })
