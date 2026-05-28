/**
 * Automates Google Cloud Console setup for Vertex AI:
 * 1. Create service account "panini-pano-veo"
 * 2. Grant Vertex AI User role
 * 3. Create + download JSON key → saves to dennisproject/vertex-key.json
 */
const { chromium } = require("playwright")
const fs = require("fs")
const path = require("path")

const CDP_URL = "http://127.0.0.1:18800"
const PROJECT  = "openclaw-dnk"
const SA_NAME  = "panini-pano-veo"
const SA_DISP  = "Panini Pano Veo"
const KEY_OUT  = path.join(__dirname, "vertex-key.json")

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function main() {
  console.log("Connecting to browser...")
  const browser = await chromium.connectOverCDP(CDP_URL)
  const context = browser.contexts()[0]
  const page = await context.newPage()

  // ── Step 1: Create service account ──────────────────────────────────────
  console.log("\n[1/3] Creating service account...")
  await page.goto(
    `https://console.cloud.google.com/iam-admin/serviceaccounts/create?project=${PROJECT}`,
    { waitUntil: "domcontentloaded", timeout: 30000 }
  )
  await sleep(3000)

  // Fill service account name
  const nameInput = page.locator('input[placeholder*="service account name" i], input[id*="name"]').first()
  await nameInput.waitFor({ timeout: 15000 })
  await nameInput.fill(SA_DISP)
  await sleep(500)

  // Fill service account ID (auto-filled but let's confirm)
  const idInput = page.locator('input[id*="account-id"], input[placeholder*="account ID" i]').first()
  const idVal = await idInput.inputValue().catch(() => "")
  if (!idVal.includes(SA_NAME.split("-")[0])) {
    await idInput.fill(SA_NAME)
  }
  console.log(`  SA ID: ${await idInput.inputValue().catch(() => SA_NAME)}`)

  // Click Create and Continue
  await page.getByRole("button", { name: /create and continue/i }).click()
  await sleep(3000)
  console.log("  Created. Assigning role...")

  // ── Step 2: Assign Vertex AI User role ──────────────────────────────────
  // Click "Select a role" dropdown
  const roleSelect = page.locator('div[placeholder*="Select a role" i], input[placeholder*="Filter" i]').first()
  await roleSelect.waitFor({ timeout: 10000 })
  await roleSelect.click()
  await sleep(1000)

  // Search for Vertex AI User
  await page.keyboard.type("Vertex AI User")
  await sleep(1500)

  // Pick the role from dropdown
  const roleOption = page.locator('text="Vertex AI User"').first()
  await roleOption.waitFor({ timeout: 10000 })
  await roleOption.click()
  await sleep(500)

  // Click Continue
  await page.getByRole("button", { name: /continue/i }).last().click()
  await sleep(2000)

  // Click Done
  await page.getByRole("button", { name: /done/i }).click()
  await sleep(3000)
  console.log("  Role assigned.")

  // ── Step 3: Create JSON key ──────────────────────────────────────────────
  console.log("\n[2/3] Creating JSON key...")
  await page.goto(
    `https://console.cloud.google.com/iam-admin/serviceaccounts?project=${PROJECT}`,
    { waitUntil: "domcontentloaded", timeout: 20000 }
  )
  await sleep(3000)

  // Find the panini-pano-veo account and click its kebab menu
  const saRow = page.locator(`tr:has-text("${SA_NAME}"), tr:has-text("${SA_DISP}")`).first()
  await saRow.waitFor({ timeout: 10000 })
  const kebab = saRow.locator('button[aria-label*="action" i], button[aria-label*="more" i], [aria-label="More actions"]').first()
  await kebab.click()
  await sleep(1000)

  // Click "Manage keys"
  await page.getByText(/manage keys/i).first().click()
  await sleep(2000)

  // Click "ADD KEY" → "Create new key"
  await page.getByRole("button", { name: /add key/i }).click()
  await sleep(500)
  await page.getByText(/create new key/i).click()
  await sleep(1000)

  // JSON is selected by default — click Create
  // Set up download interception BEFORE clicking
  const [ download ] = await Promise.all([
    page.waitForEvent("download", { timeout: 30000 }),
    page.getByRole("button", { name: /^create$/i }).click()
  ])

  console.log("  Key download started...")
  const suggestedName = download.suggestedFilename()
  await download.saveAs(KEY_OUT)
  console.log(`  ✅ Key saved: ${KEY_OUT} (${suggestedName})`)

  await page.close()
  await browser.close()

  // ── Step 4: Verify and extract project info ──────────────────────────────
  const keyData = JSON.parse(fs.readFileSync(KEY_OUT, "utf8"))
  console.log(`\n[3/3] Key verified:`)
  console.log(`  Project: ${keyData.project_id}`)
  console.log(`  Client email: ${keyData.client_email}`)
  console.log(`  Type: ${keyData.type}`)
  console.log("\n✅ Vertex AI service account ready.")
  console.log(`   Add to .env: GOOGLE_APPLICATION_CREDENTIALS=${KEY_OUT}`)
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1) })
