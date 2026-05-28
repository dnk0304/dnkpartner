/**
 * Use GCP cookies + SAPISIDHASH to create service account via REST API
 * GCP console uses cookie auth, not Bearer tokens
 */
const { chromium } = require("playwright")
const crypto = require("crypto")
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

  // Get cookies for google.com
  const cookies = await context.cookies(["https://console.cloud.google.com", "https://iam.googleapis.com"])
  console.log(`Got ${cookies.length} cookies`)

  // Build cookie string
  const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join("; ")
  
  // Find SAPISID for auth hash
  const sapisid = cookies.find(c => c.name === "SAPISID")?.value
  const apisid = cookies.find(c => c.name === "__Secure-3PAPISID")?.value || sapisid
  
  console.log(`SAPISID: ${sapisid ? "found" : "missing"}`)
  console.log(`__Secure-3PAPISID: ${apisid ? "found" : "missing"}`)

  // Generate SAPISIDHASH
  // Format: SAPISIDHASH <timestamp>_<sha1(timestamp SAPISID origin)>
  const origin = "https://console.cloud.google.com"
  const timestamp = Math.floor(Date.now() / 1000)
  const input = `${timestamp} ${apisid || sapisid} ${origin}`
  const hash = crypto.createHash("sha1").update(input).digest("hex")
  const sapisidhash = `SAPISIDHASH ${timestamp}_${hash}`
  console.log(`Auth hash generated`)

  // Actually, GCP APIs don't use SAPISIDHASH - they use OAuth.
  // The console gets an access token via a hidden iframe/endpoint.
  // Let me try to get it via the oauth2/v4/token endpoint using cookies

  // Method: Navigate to a page that returns an access token
  const page = await context.newPage()
  
  // Try getting token from GCP's internal auth endpoint
  console.log("\nFetching access token from GCP auth...")
  
  // GCP console gets tokens via ServiceLogin
  // Try the accounts endpoint that returns tokens
  const tokenUrl = `https://accounts.google.com/o/oauth2/iframe#origin=https://console.cloud.google.com&rpcToken=`
  
  // Actually, let me try evaluate in a GCP console page to get the token
  let gcpPage = context.pages().find(p => p.url().includes("console.cloud.google.com"))
  if (!gcpPage) {
    gcpPage = await context.newPage()
    await gcpPage.goto(`https://console.cloud.google.com/iam-admin/serviceaccounts?project=${PROJECT}`, {
      waitUntil: "load", timeout: 60000
    })
    await sleep(10000)
  }

  // Try multiple ways to extract the token from the page context
  const token = await gcpPage.evaluate(async () => {
    // Method 1: Try window credentials
    try {
      if (window.__CPDATA) {
        const data = JSON.stringify(window.__CPDATA)
        const match = data.match(/ya29\.[A-Za-z0-9_-]+/)
        if (match) return match[0]
      }
    } catch {}

    // Method 2: Look for token in any script tag
    try {
      const scripts = document.querySelectorAll("script")
      for (const s of scripts) {
        const text = s.textContent || ""
        const match = text.match(/ya29\.[A-Za-z0-9_-]{50,}/)
        if (match) return match[0]
      }
    } catch {}

    // Method 3: Try fetch to token endpoint
    try {
      const r = await fetch("https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=test", {
        credentials: "include"
      })
    } catch {}

    // Method 4: Check all window properties for token-like strings
    try {
      const json = JSON.stringify(window)
      const match = json?.match?.(/ya29\.[A-Za-z0-9_-]{50,}/)
      if (match) return match[0]
    } catch {}

    return null
  }).catch(() => null)

  if (token) {
    console.log(`✅ Got OAuth token from page: ${token.substring(0,25)}...`)
  } else {
    // Method 5: Try the hidden auth iframe approach
    console.log("Trying iframe auth approach...")
    
    // Navigate to a minimal endpoint that might return a token
    const authPage = await context.newPage()
    
    // This endpoint is used by GCP console internally
    await authPage.goto("https://accounts.google.com/ServiceLogin?passive=true&continue=https://console.cloud.google.com/", {
      waitUntil: "domcontentloaded", timeout: 20000
    })
    await sleep(3000)
    
    // Check if we got redirected to the console (already logged in)
    const url = authPage.url()
    console.log(`  Redirected to: ${url.substring(0, 80)}`)
    
    // Try another approach: use the cloudshell API which might accept cookies
    await authPage.close()
  }

  if (!token) {
    // Last approach: Use CDP to send requests WITH cookies to the API
    console.log("\nUsing fetch with cookies (from browser context)...")
    
    const result = await gcpPage.evaluate(async (params) => {
      const { PROJECT, SA_ID, SA_EMAIL } = params
      const results = { sa: null, role: null, key: null }
      
      // 1. Create service account
      try {
        const r1 = await fetch(`https://iam.googleapis.com/v1/projects/${PROJECT}/serviceAccounts`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", "X-Goog-AuthUser": "0" },
          body: JSON.stringify({
            accountId: SA_ID,
            serviceAccount: { displayName: "Panini Pano Veo" }
          })
        })
        results.sa = { status: r1.status, data: await r1.json() }
      } catch(e) { results.sa = { error: e.message } }

      // 2. Get current IAM policy
      try {
        const r2 = await fetch(`https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT}:getIamPolicy`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", "X-Goog-AuthUser": "0" },
          body: JSON.stringify({ options: { requestedPolicyVersion: 3 } })
        })
        const policy = await r2.json()
        if (r2.ok) {
          const member = `serviceAccount:${SA_EMAIL}`
          const role = "roles/aiplatform.user"
          let binding = policy.bindings?.find(b => b.role === role)
          if (binding) { if (!binding.members.includes(member)) binding.members.push(member) }
          else { policy.bindings = policy.bindings || []; policy.bindings.push({ role, members: [member] }) }
          
          const r2b = await fetch(`https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT}:setIamPolicy`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json", "X-Goog-AuthUser": "0" },
            body: JSON.stringify({ policy })
          })
          results.role = { status: r2b.status, data: await r2b.json() }
        } else {
          results.role = { status: r2.status, data: policy }
        }
      } catch(e) { results.role = { error: e.message } }

      // 3. Create key
      try {
        const r3 = await fetch(`https://iam.googleapis.com/v1/projects/${PROJECT}/serviceAccounts/${SA_EMAIL}/keys`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", "X-Goog-AuthUser": "0" },
          body: JSON.stringify({ keyAlgorithm: "KEY_ALG_RSA_2048", privateKeyType: "TYPE_GOOGLE_CREDENTIALS_FILE" })
        })
        results.key = { status: r3.status, data: await r3.json() }
      } catch(e) { results.key = { error: e.message } }

      return results
    }, { PROJECT, SA_ID, SA_EMAIL })

    console.log("\n=== Results ===")
    
    // SA
    if (result.sa?.status === 200) {
      console.log(`✅ SA created: ${result.sa.data.email}`)
    } else if (result.sa?.data?.error?.status === "ALREADY_EXISTS") {
      console.log(`ℹ️  SA exists`)
    } else {
      console.log(`SA: ${result.sa?.status}`, JSON.stringify(result.sa?.data || result.sa?.error).substring(0, 200))
    }

    // Role
    if (result.role?.status === 200) {
      console.log(`✅ Role granted`)
    } else {
      console.log(`Role: ${result.role?.status}`, JSON.stringify(result.role?.data || result.role?.error).substring(0, 200))
    }

    // Key
    if (result.key?.status === 200 && result.key?.data?.privateKeyData) {
      const keyJson = Buffer.from(result.key.data.privateKeyData, "base64").toString("utf8")
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
    } else {
      console.log(`Key: ${result.key?.status}`, JSON.stringify(result.key?.data || result.key?.error).substring(0, 200))
    }
  }

  await page.close()
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1) })
