const { chromium } = require("playwright")
const fs = require("fs"), path = require("path")
const CDP_URL = "http://127.0.0.1:18800"
const PROJECT = "openclaw-dnk"
const SA_ID   = "panini-pano-veo"
const SA_EMAIL = `${SA_ID}@${PROJECT}.iam.gserviceaccount.com`
const KEY_OUT = path.join(__dirname, "vertex-key.json")
const SNAP = p => { const fp = `C:\\Users\\D\\.openclaw\\workspace-cash\\${p}`; return fp }
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function main() {
  const browser = await chromium.connectOverCDP(CDP_URL)
  const context = browser.contexts()[0]

  // Find Cloud Shell tab
  let page = context.pages().find(p => p.url().includes("shell.cloud.google.com"))
  if (!page) {
    console.log("Opening Cloud Shell...")
    page = await context.newPage()
    await page.goto(`https://shell.cloud.google.com/?project=${PROJECT}&show=terminal`, {
      waitUntil: "domcontentloaded", timeout: 30000
    })
  }
  console.log(`Tab: ${page.url()}`)
  await sleep(5000)

  // Screenshot current state
  await page.screenshot({ path: SNAP("gcloud_01_start.png") })
  console.log("📸 gcloud_01_start")

  // Dismiss any dialogs (Continue, Close, etc.)
  for (const label of ["Continue", "Got it", "Close", "Dismiss"]) {
    try {
      const btn = page.getByRole("button", { name: new RegExp(`^${label}$`, "i") })
      await btn.waitFor({ timeout: 2000 })
      await btn.click()
      console.log(`Clicked: ${label}`)
      await sleep(2000)
    } catch {}
  }

  // Wait for terminal — try multiple strategies
  let termFound = false
  const termSelectors = [
    'textarea.xterm-helper-textarea',
    '.xterm textarea',
    '[class*="xterm"] textarea',
  ]

  console.log("Waiting for terminal to be ready...")
  for (let attempt = 0; attempt < 12; attempt++) {
    for (const sel of termSelectors) {
      try {
        await page.locator(sel).first().waitFor({ timeout: 3000 })
        await page.locator(sel).first().click()
        console.log(`✅ Terminal ready via: ${sel}`)
        termFound = true
        break
      } catch {}
    }
    if (termFound) break

    // Check page content for clues
    const content = await page.content()
    if (content.includes("Verify your account")) {
      // Cloud Shell needs account verification
      console.log("⚠️  Account verification dialog found")
      // Try clicking verify
      try {
        await page.getByRole("button", { name: /verify/i }).click()
        console.log("  Clicked Verify — waiting 5s...")
        await sleep(5000)
      } catch {}
    } else if (content.includes("Provisioning")) {
      console.log(`  Provisioning... (attempt ${attempt+1}/12)`)
    } else {
      console.log(`  Waiting for terminal... (attempt ${attempt+1}/12)`)
    }
    await sleep(8000)
    await page.screenshot({ path: SNAP(`gcloud_0${attempt+2}_wait.png`) })
  }

  if (!termFound) {
    console.log("❌ Terminal not found after waiting. Final screenshot saved.")
    await page.screenshot({ path: SNAP("gcloud_final_no_terminal.png") })
    return
  }

  await sleep(1000)
  await page.screenshot({ path: SNAP("gcloud_02_terminal_ready.png") })

  // Helper: type a command and wait
  async function cmd(command, waitSec = 8) {
    console.log(`\n$ ${command}`)
    // Ensure terminal focus
    for (const sel of termSelectors) {
      try {
        await page.locator(sel).first().click({ timeout: 1000 })
        break
      } catch {}
    }
    await sleep(200)
    await page.keyboard.type(command, { delay: 20 })
    await page.keyboard.press("Enter")
    await sleep(waitSec * 1000)
  }

  // ── Run setup commands ──────────────────────────────────────────────
  await cmd(`gcloud config set project ${PROJECT}`, 3)
  await page.screenshot({ path: SNAP("gcloud_03_set_project.png") })

  await cmd(
    `gcloud iam service-accounts create ${SA_ID} ` +
    `--display-name="Panini Pano Veo" --project=${PROJECT} 2>&1 || echo "Already exists"`, 8
  )
  await page.screenshot({ path: SNAP("gcloud_04_create_sa.png") })

  await cmd(
    `gcloud projects add-iam-policy-binding ${PROJECT} ` +
    `--member="serviceAccount:${SA_EMAIL}" --role="roles/aiplatform.user" --quiet 2>&1`, 12
  )
  await page.screenshot({ path: SNAP("gcloud_05_iam_binding.png") })

  await cmd(
    `gcloud iam service-accounts keys create /tmp/vk.json ` +
    `--iam-account=${SA_EMAIL} 2>&1`, 8
  )
  await page.screenshot({ path: SNAP("gcloud_06_create_key.png") })

  // Output base64-encoded key for extraction
  await cmd(`base64 -w0 /tmp/vk.json && echo "---KEY_DONE---"`, 4)
  await sleep(2000)
  await page.screenshot({ path: SNAP("gcloud_07_b64_output.png") })

  // ── Extract terminal text ───────────────────────────────────────────
  const termText = await page.evaluate(() => {
    // xterm rows
    const rows = document.querySelectorAll('.xterm-rows div, .xterm-rows .xterm-row')
    if (rows.length > 0) return Array.from(rows).map(r => r.textContent || "").join("\n")
    // fallback: all body text
    return document.body.innerText || ""
  }).catch(() => "")

  // Find the base64 block before ---KEY_DONE---
  const b64Match = termText.match(/([A-Za-z0-9+/=]{100,})/)
  if (b64Match) {
    try {
      const json = Buffer.from(b64Match[1].replace(/\s/g,""), "base64").toString("utf8")
      const parsed = JSON.parse(json)
      fs.writeFileSync(KEY_OUT, json)
      console.log(`\n✅ vertex-key.json saved!`)
      console.log(`  Project:  ${parsed.project_id}`)
      console.log(`  SA Email: ${parsed.client_email}`)

      // Update .env
      const envPath = path.join(__dirname, ".env")
      let env = fs.readFileSync(envPath, "utf8")
      env = env.replace(/GOOGLE_APPLICATION_CREDENTIALS=.*\n?/, "")
      env += `\nGOOGLE_APPLICATION_CREDENTIALS=${KEY_OUT.replace(/\\/g,"\\\\")}\n`
      fs.writeFileSync(envPath, env)
      console.log("  .env updated with GOOGLE_APPLICATION_CREDENTIALS ✅")
    } catch(e) {
      console.log("Base64 decode failed:", e.message)
    }
  } else {
    // Second attempt: use 'cat' and get raw JSON from terminal
    await cmd(`echo "BEGIN_JSON" && cat /tmp/vk.json && echo "END_JSON"`, 3)
    const termText2 = await page.evaluate(() =>
      document.body.innerText || ""
    ).catch(() => "")
    const jsonMatch = termText2.match(/BEGIN_JSON\s*([\s\S]*?)\s*END_JSON/)
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1])
        const json = JSON.stringify(parsed, null, 2)
        fs.writeFileSync(KEY_OUT, json)
        console.log(`\n✅ vertex-key.json saved via cat!`)
        console.log(`  Email: ${parsed.client_email}`)
      } catch(e) { console.log("JSON parse failed:", e.message) }
    } else {
      console.log("⚠️  Could not extract key automatically. Check screenshots.")
    }
  }

  // Final screenshot
  await page.screenshot({ path: SNAP("gcloud_08_done.png") })
  console.log("\nDone. Check C:\\Users\\D\\.openclaw\\workspace-cash\\gcloud_*.png for progress")
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1) })
