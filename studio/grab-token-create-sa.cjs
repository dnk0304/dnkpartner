/**
 * Grab OAuth token from GCP console network traffic, then use REST API
 * to create service account + key
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

  // Intercept auth token from any GCP console request
  let authToken = null
  const page = await context.newPage()

  // Set up request interception to capture Bearer tokens
  page.on("request", req => {
    const auth = req.headers()["authorization"]
    if (auth && auth.startsWith("Bearer ") && !authToken) {
      authToken = auth.replace("Bearer ", "")
      console.log(`✅ Captured token: ${authToken.substring(0,20)}... (${authToken.length} chars)`)
    }
  })

  // Navigate to a lightweight GCP API page that will make authenticated requests
  console.log("Loading GCP console to capture auth token...")
  await page.goto(
    `https://console.cloud.google.com/iam-admin/serviceaccounts?project=${PROJECT}`,
    { waitUntil: "domcontentloaded", timeout: 30000 }
  )

  // Wait for XHR requests to fire
  for (let i = 0; i < 20 && !authToken; i++) {
    await sleep(2000)
    console.log(`  Waiting for token... (${i*2}s)`)
  }

  if (!authToken) {
    // Try scrolling/clicking to trigger more requests
    await page.mouse.click(500, 400)
    await sleep(3000)
    await page.reload({ waitUntil: "domcontentloaded" })
    await sleep(5000)
  }

  if (!authToken) {
    console.error("❌ Could not capture auth token from GCP console")
    await page.close()
    return
  }

  console.log(`\nUsing token to create service account via REST API...`)
  await page.close()

  // ── Step 1: Create service account ──────────────────────────────────
  console.log("\n1. Creating service account...")
  const createRes = await fetch(
    `https://iam.googleapis.com/v1/projects/${PROJECT}/serviceAccounts`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${authToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        accountId: SA_ID,
        serviceAccount: {
          displayName: "Panini Pano Veo",
          description: "Video generation via Vertex AI"
        }
      })
    }
  )
  const createData = await createRes.json()
  if (createRes.ok) {
    console.log(`   ✅ Created: ${createData.email}`)
  } else if (createData.error?.status === "ALREADY_EXISTS") {
    console.log(`   ℹ️  Already exists: ${SA_EMAIL}`)
  } else {
    console.log(`   ❌ Error ${createRes.status}:`, JSON.stringify(createData))
    return
  }

  // ── Step 2: Grant Vertex AI User role ───────────────────────────────
  console.log("\n2. Granting Vertex AI User role...")
  
  // Get current policy
  const policyRes = await fetch(
    `https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT}:getIamPolicy`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${authToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ options: { requestedPolicyVersion: 3 } })
    }
  )
  const policy = await policyRes.json()
  
  if (!policyRes.ok) {
    console.log(`   ❌ Error getting policy:`, JSON.stringify(policy))
    return
  }

  // Add the binding
  const member = `serviceAccount:${SA_EMAIL}`
  const role = "roles/aiplatform.user"
  let binding = policy.bindings?.find(b => b.role === role)
  if (binding) {
    if (!binding.members.includes(member)) {
      binding.members.push(member)
    } else {
      console.log("   ℹ️  Role already granted")
    }
  } else {
    policy.bindings = policy.bindings || []
    policy.bindings.push({ role, members: [member] })
  }

  const setPolicyRes = await fetch(
    `https://cloudresourcemanager.googleapis.com/v1/projects/${PROJECT}:setIamPolicy`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${authToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ policy })
    }
  )
  
  if (setPolicyRes.ok) {
    console.log("   ✅ Role granted: Vertex AI User")
  } else {
    const err = await setPolicyRes.json()
    console.log(`   ❌ Error:`, JSON.stringify(err))
  }

  // ── Step 3: Create JSON key ─────────────────────────────────────────
  console.log("\n3. Creating JSON key...")
  const keyRes = await fetch(
    `https://iam.googleapis.com/v1/projects/${PROJECT}/serviceAccounts/${SA_EMAIL}/keys`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${authToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ keyAlgorithm: "KEY_ALG_RSA_2048", privateKeyType: "TYPE_GOOGLE_CREDENTIALS_FILE" })
    }
  )
  const keyData = await keyRes.json()
  
  if (keyRes.ok && keyData.privateKeyData) {
    const keyJson = Buffer.from(keyData.privateKeyData, "base64").toString("utf8")
    const parsed = JSON.parse(keyJson)
    fs.writeFileSync(KEY_OUT, keyJson)
    console.log(`   ✅ Key saved: ${KEY_OUT}`)
    console.log(`   Project: ${parsed.project_id}`)
    console.log(`   Email:   ${parsed.client_email}`)

    // Update .env
    const envPath = path.join(__dirname, ".env")
    let env = fs.readFileSync(envPath, "utf8")
    const credLine = `GOOGLE_APPLICATION_CREDENTIALS=${KEY_OUT}`
    if (env.includes("GOOGLE_APPLICATION_CREDENTIALS=")) {
      env = env.replace(/GOOGLE_APPLICATION_CREDENTIALS=.*/, credLine)
    } else {
      env += `\n${credLine}\n`
    }
    fs.writeFileSync(envPath, env)
    console.log("   .env updated ✅")
  } else {
    console.log(`   ❌ Error creating key:`, JSON.stringify(keyData))
  }

  console.log("\n🎉 Done! Run `node test-veo31.cjs` to test Veo 3.1")
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1) })
