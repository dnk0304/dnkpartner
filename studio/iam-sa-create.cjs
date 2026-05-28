/**
 * Create service account via GCP Console IAM UI (no Cloud Shell needed)
 * Then create + download a JSON key via the SA details page
 */
const { chromium } = require("playwright")
const fs = require("fs"), path = require("path")
const CDP_URL = "http://127.0.0.1:18800"
const PROJECT = "openclaw-dnk"
const SA_ID   = "panini-pano-veo"
const SA_EMAIL = `${SA_ID}@${PROJECT}.iam.gserviceaccount.com`
const KEY_OUT  = path.join(__dirname, "vertex-key.json")
const SNAP = label => `C:\\Users\\D\\.openclaw\\workspace-cash\\iam_${label}.png`
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function main() {
  const browser = await chromium.connectOverCDP(CDP_URL)
  const context = browser.contexts()[0]

  // ─── Step 1: Create the service account ──────────────────────────────
  let page = context.pages().find(p => p.url().includes("serviceaccounts/create"))
  if (!page) {
    page = await context.newPage()
    await page.goto(
      `https://console.cloud.google.com/iam-admin/serviceaccounts/create?project=${PROJECT}`,
      { waitUntil: "domcontentloaded", timeout: 30000 }
    )
  }
  await sleep(8000)
  await page.screenshot({ path: SNAP("01_create_start") })
  console.log("📸 01_create_start")

  // The GCP console loads inside an iframe — we need to reach it
  // Find the main content iframe
  let target = page
  const frames = page.frames()
  console.log(`Frames: ${frames.length}`)
  for (const frame of frames) {
    const url = frame.url()
    if (url && url !== "about:blank" && !url.startsWith("chrome")) {
      console.log("  Frame:", url.substring(0, 80))
    }
  }

  // Try to find the "Service account name" input in any frame
  async function findInput(labelText) {
    // Try main page first
    for (const f of [page, ...page.frames()]) {
      try {
        const input = f.getByLabel(labelText, { exact: false })
        await input.waitFor({ timeout: 2000 })
        return input
      } catch {}
      try {
        const input = f.locator(`input[placeholder*="${labelText}"], input[aria-label*="${labelText}"]`).first()
        await input.waitFor({ timeout: 2000 })
        return input
      } catch {}
    }
    return null
  }

  // Fill service account name
  const saNameInput = await findInput("Service account name")
  if (saNameInput) {
    await saNameInput.fill("panini-pano-veo")
    console.log("✅ Filled SA name")
    await sleep(500)
  } else {
    // Try clicking the first visible text input
    console.log("Looking for any text input...")
    for (const f of [page, ...page.frames()]) {
      try {
        const inputs = await f.locator('input[type="text"]').all()
        if (inputs.length > 0) {
          await inputs[0].click()
          await inputs[0].fill("panini-pano-veo")
          console.log(`✅ Filled first text input in frame: ${f.url().substring(0,60)}`)
          break
        }
      } catch {}
    }
  }

  await page.screenshot({ path: SNAP("02_name_filled") })

  // Fill description
  const descInput = await findInput("Description")
  if (descInput) {
    await descInput.fill("Panini Pano Veo video generation")
    console.log("✅ Filled description")
    await sleep(300)
  }

  // Click "Create and Continue"
  for (const f of [page, ...page.frames()]) {
    for (const label of ["Create and continue", "Create", "CONTINUE"]) {
      try {
        const btn = f.getByRole("button", { name: new RegExp(label, "i") })
        await btn.waitFor({ timeout: 2000 })
        await btn.click()
        console.log(`✅ Clicked: ${label}`)
        await sleep(5000)
        break
      } catch {}
    }
  }

  await page.screenshot({ path: SNAP("03_after_create") })
  console.log("📸 03_after_create")

  // Step 2: Grant role (Vertex AI User)
  // Look for role selector
  for (const f of [page, ...page.frames()]) {
    try {
      const roleSelect = f.getByPlaceholder(/role/i).or(f.getByLabel(/role/i)).first()
      await roleSelect.waitFor({ timeout: 3000 })
      await roleSelect.click()
      await sleep(1000)
      await roleSelect.fill("Vertex AI User")
      await sleep(2000)
      // Select from dropdown
      const option = f.getByText("Vertex AI User").first()
      await option.click()
      console.log("✅ Selected Vertex AI User role")
      await sleep(1000)
      break
    } catch {}
  }

  await page.screenshot({ path: SNAP("04_role_selected") })

  // Click Continue / Done
  for (const f of [page, ...page.frames()]) {
    for (const label of ["Continue", "Done", "DONE"]) {
      try {
        const btn = f.getByRole("button", { name: new RegExp(`^${label}$`, "i") })
        await btn.waitFor({ timeout: 2000 })
        await btn.click()
        console.log(`Clicked: ${label}`)
        await sleep(5000)
        break
      } catch {}
    }
  }

  await page.screenshot({ path: SNAP("05_sa_created") })
  console.log("📸 05_sa_created")

  // ─── Step 3: Navigate to the SA and create a key ─────────────────────
  console.log("\nNavigating to SA details to create key...")
  await page.goto(
    `https://console.cloud.google.com/iam-admin/serviceaccounts/details/${SA_EMAIL}/keys?project=${PROJECT}`,
    { waitUntil: "domcontentloaded", timeout: 30000 }
  )
  await sleep(8000)
  await page.screenshot({ path: SNAP("06_sa_keys") })
  console.log("📸 06_sa_keys")

  // Click "Add key" → "Create new key"
  for (const f of [page, ...page.frames()]) {
    try {
      const addKey = f.getByRole("button", { name: /add key/i })
      await addKey.waitFor({ timeout: 5000 })
      await addKey.click()
      console.log("Clicked Add key")
      await sleep(1500)
      // Select "Create new key"
      const createNew = f.getByText("Create new key").first()
      await createNew.waitFor({ timeout: 3000 })
      await createNew.click()
      console.log("Clicked Create new key")
      await sleep(2000)
      break
    } catch {}
  }

  await page.screenshot({ path: SNAP("07_key_dialog") })

  // Make sure JSON is selected and click Create
  for (const f of [page, ...page.frames()]) {
    try {
      const jsonRadio = f.locator('input[value="TYPE_GOOGLE_CREDENTIALS_FILE"], input[value="json"], label:has-text("JSON")').first()
      await jsonRadio.click()
      console.log("Selected JSON format")
      await sleep(500)
      break
    } catch {}
  }

  // Set up download listener before clicking Create
  const downloadPromise = page.waitForEvent("download", { timeout: 30000 }).catch(() => null)

  for (const f of [page, ...page.frames()]) {
    try {
      const createBtn = f.getByRole("button", { name: /^create$/i })
      await createBtn.waitFor({ timeout: 3000 })
      await createBtn.click()
      console.log("Clicked Create (key download)")
      break
    } catch {}
  }

  // Wait for download
  const download = await downloadPromise
  if (download) {
    const dlPath = await download.path()
    if (dlPath) {
      const content = fs.readFileSync(dlPath, "utf8")
      fs.writeFileSync(KEY_OUT, content)
      const parsed = JSON.parse(content)
      console.log(`\n✅ vertex-key.json saved!`)
      console.log(`  Project: ${parsed.project_id}`)
      console.log(`  Email:   ${parsed.client_email}`)

      // Update .env
      const envPath = path.join(__dirname, ".env")
      let env = fs.readFileSync(envPath, "utf8")
      env = env.replace(/GOOGLE_APPLICATION_CREDENTIALS=.*\n?/, "")
      env += `\nGOOGLE_APPLICATION_CREDENTIALS=${KEY_OUT.replace(/\\/g, "\\\\")}\n`
      fs.writeFileSync(envPath, env)
      console.log("  .env updated with GOOGLE_APPLICATION_CREDENTIALS ✅")
    }
  } else {
    console.log("⚠️  No download detected. The key may have been saved to Downloads folder.")
    // Check Downloads folder
    const downloads = path.join(process.env.USERPROFILE, "Downloads")
    const files = fs.readdirSync(downloads).filter(f => f.endsWith(".json")).sort()
    if (files.length > 0) {
      const latest = files[files.length - 1]
      const latestPath = path.join(downloads, latest)
      try {
        const content = fs.readFileSync(latestPath, "utf8")
        const parsed = JSON.parse(content)
        if (parsed.type === "service_account") {
          fs.copyFileSync(latestPath, KEY_OUT)
          console.log(`✅ Found key in Downloads: ${latest}`)
          console.log(`  Email: ${parsed.client_email}`)
        }
      } catch {}
    }
  }

  await page.screenshot({ path: SNAP("08_done") })
  console.log("📸 08_done")
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1) })
