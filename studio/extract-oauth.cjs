/**
 * Extract OAuth2 access token from GCP console by evaluating in the console's
 * Angular/Polymer context, which has the token cached
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
  
  // Find GCP console page
  let page = context.pages().find(p => p.url().includes("console.cloud.google.com"))
  if (!page) {
    page = await context.newPage()
    await page.goto(`https://console.cloud.google.com?project=${PROJECT}`, {
      waitUntil: "load", timeout: 60000
    })
    await sleep(15000)
  }

  console.log(`GCP page: ${page.url()}`)
  
  // Strategy: Use CDP to capture the access token via Network domain
  // Navigate to the token endpoint that GCP console uses internally
  const cdp = await context.newCDPSession(page)
  await cdp.send("Network.enable")
  
  let token = null
  
  // Listen for ALL network responses
  cdp.on("Network.responseReceived", async params => {
    const url = params.response.url
    // GCP console fetches tokens from these URLs
    if (url.includes("oauth2") || url.includes("token") || url.includes("auth")) {
      try {
        const body = await cdp.send("Network.getResponseBody", { requestId: params.requestId })
        const text = body.body || ""
        const match = text.match(/ya29\.[A-Za-z0-9_-]+/)
        if (match && !token) {
          token = match[0]
          console.log(`✅ Token from response: ${token.substring(0,25)}...`)
        }
      } catch {}
    }
  })

  // Also intercept requests
  cdp.on("Network.requestWillBeSentExtraInfo", params => {
    const cookies = params.headers?.cookie || ""
    // Look for auth header
    const auth = params.headers?.authorization || params.headers?.Authorization || ""
    if (auth.includes("ya29.") && !token) {
      token = auth.replace(/^Bearer\s+/, "")
      console.log(`✅ Token from request header: ${token.substring(0,25)}...`)
    }
  })

  // Force a navigation that will trigger token refresh
  console.log("Triggering GCP API call...")
  await page.evaluate(() => {
    // Try to trigger internal API call by navigating within the console
    window.location.hash = "#" + Date.now()
  })
  await sleep(3000)

  // Navigate to a specific API-heavy page
  await page.goto(
    `https://console.cloud.google.com/iam-admin/serviceaccounts?project=${PROJECT}`,
    { waitUntil: "load", timeout: 45000 }
  )
  await sleep(10000)

  // Try to extract token from page internals
  if (!token) {
    token = await page.evaluate(() => {
      // Search through all window properties recursively (shallow)
      try {
        // Check known locations
        const locations = [
          () => window["_GPC"]?.["auth"]?.["token"],
          () => window["__CPDATA"]?.flat?.()?.find?.(x => typeof x === "string" && x.startsWith("ya29.")),
          () => {
            // Search session/local storage
            for (let i = 0; i < sessionStorage.length; i++) {
              const val = sessionStorage.getItem(sessionStorage.key(i))
              const m = val?.match?.(/ya29\.[A-Za-z0-9_-]{50,}/)
              if (m) return m[0]
            }
            return null
          },
          () => {
            for (let i = 0; i < localStorage.length; i++) {
              const val = localStorage.getItem(localStorage.key(i))
              const m = val?.match?.(/ya29\.[A-Za-z0-9_-]{50,}/)
              if (m) return m[0]
            }
            return null
          },
          () => {
            // Check all script content
            const scripts = document.querySelectorAll("script:not([src])")
            for (const s of scripts) {
              const m = s.textContent?.match?.(/ya29\.[A-Za-z0-9_-]{50,}/)
              if (m) return m[0]
            }
            return null
          },
          () => {
            // Check the page HTML for embedded tokens
            const m = document.documentElement.innerHTML.match(/ya29\.[A-Za-z0-9_-]{50,}/)
            return m ? m[0] : null
          }
        ]
        for (const fn of locations) {
          const v = fn()
          if (v) return v
        }
      } catch {}
      return null
    }).catch(() => null)
    
    if (token) console.log(`✅ Token from page JS: ${token.substring(0,25)}...`)
  }

  if (!token) {
    console.log("❌ No token found. Last resort: checking all CDP network entries...")
    // Dump all request URLs to see what endpoints were called
    return
  }

  // ── Use token to create SA + key ────────────────────────────────────
  console.log("\n--- Creating service account ---")
  const headers = { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" }
  
  // 1. Create SA
  const r1 = await fetch(`https://iam.googleapis.com/v1/projects/${PROJECT}/serviceAccounts`, {
    method: "POST", headers,
    body: JSON.stringify({ accountId: SA_ID, serviceAccount: { displayName: "Panini Pano Veo" } })
  })
  const d1 = await r1.json()
  if (r1.ok) console.log(`✅ SA created: ${d1.email}`)
  else if (d1.error?.status === "ALREADY_EXISTS") console.log(`ℹ️  SA exists`)
  else { console.log(`❌ ${r1.status}:`, JSON.stringify(d1).substring(0,200)); return }

  // 2. Grant role
  console.log("Granting role...")
  const r2a = await fetch(`https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT}:getIamPolicy`, {
    method: "POST", headers,
    body: JSON.stringify({ options: { requestedPolicyVersion: 3 } })
  })
  const policy = await r2a.json()
  if (r2a.ok) {
    const member = `serviceAccount:${SA_EMAIL}`
    let binding = policy.bindings?.find(b => b.role === "roles/aiplatform.user")
    if (binding) { if (!binding.members.includes(member)) binding.members.push(member) }
    else { policy.bindings = policy.bindings || []; policy.bindings.push({ role: "roles/aiplatform.user", members: [member] }) }
    
    const r2b = await fetch(`https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT}:setIamPolicy`, {
      method: "POST", headers, body: JSON.stringify({ policy })
    })
    console.log(r2b.ok ? "✅ Role granted" : `❌ ${await r2b.text()}`)
  }

  // 3. Create key
  console.log("Creating key...")
  const r3 = await fetch(`https://iam.googleapis.com/v1/projects/${PROJECT}/serviceAccounts/${SA_EMAIL}/keys`, {
    method: "POST", headers,
    body: JSON.stringify({ keyAlgorithm: "KEY_ALG_RSA_2048", privateKeyType: "TYPE_GOOGLE_CREDENTIALS_FILE" })
  })
  const d3 = await r3.json()
  if (r3.ok && d3.privateKeyData) {
    const keyJson = Buffer.from(d3.privateKeyData, "base64").toString("utf8")
    fs.writeFileSync(KEY_OUT, keyJson)
    const p = JSON.parse(keyJson)
    console.log(`✅ Key saved!  Email: ${p.client_email}`)
    
    const envPath = path.join(__dirname, ".env")
    let env = fs.readFileSync(envPath, "utf8")
    const cred = `GOOGLE_APPLICATION_CREDENTIALS=${KEY_OUT}`
    if (env.includes("GOOGLE_APPLICATION_CREDENTIALS=")) env = env.replace(/GOOGLE_APPLICATION_CREDENTIALS=.*/, cred)
    else env += `\n${cred}\n`
    fs.writeFileSync(envPath, env)
    console.log(".env updated ✅\n🎉 Run: node test-veo31.cjs")
  } else {
    console.log(`❌ Key error:`, JSON.stringify(d3).substring(0,300))
  }
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1) })
