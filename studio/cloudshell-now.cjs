/**
 * Cloud Shell is reportedly up — find it and run gcloud commands
 */
const { chromium } = require("playwright")
const fs = require("fs"), path = require("path")
const CDP_URL  = "http://127.0.0.1:18800"
const PROJECT  = "openclaw-dnk"
const SA_ID    = "panini-pano-veo"
const SA_EMAIL = `${SA_ID}@${PROJECT}.iam.gserviceaccount.com`
const KEY_OUT  = path.join(__dirname, "vertex-key.json")
const SNAPS    = "C:\\Users\\D\\.openclaw\\workspace-cash\\"
const sleep    = ms => new Promise(r => setTimeout(r, ms))

async function snap(page, name) {
  await page.screenshot({ path: SNAPS + `shell_${name}.png`, timeout: 15000 }).catch(() => {})
  console.log(`  📸 ${name}`)
}

async function typeCmd(page, cmd, waitSec = 6) {
  console.log(`\n$ ${cmd.substring(0, 90)}`)
  await page.keyboard.type(cmd, { delay: 15 })
  await page.keyboard.press("Enter")
  await sleep(waitSec * 1000)
}

async function main() {
  const browser = await chromium.connectOverCDP(CDP_URL)
  const ctx = browser.contexts()[0]

  // List all tabs
  const pages = ctx.pages()
  console.log("Open tabs:")
  pages.forEach((p, i) => console.log(`  ${i}: ${p.url().substring(0, 90)}`))

  // Find the Cloud Shell tab — try both shell.cloud.google.com and console.cloud.google.com
  let shell = pages.find(p => p.url().includes("shell.cloud.google.com"))
  
  if (!shell) {
    // Try navigating to cloud shell directly
    console.log("\nNo shell tab found — opening Cloud Shell...")
    shell = await ctx.newPage()
    await shell.goto(`https://shell.cloud.google.com/?project=${PROJECT}&show=terminal`, {
      waitUntil: "domcontentloaded", timeout: 30000
    })
    await sleep(8000)
  } else {
    console.log(`\nFound shell tab: ${shell.url()}`)
    await sleep(3000)
  }

  await snap(shell, "00_initial")

  // ── Look for the xterm textarea (the real terminal input) ──────────
  const termSelectors = [
    'textarea.xterm-helper-textarea',
    '.xterm textarea',
    '[class*="xterm"] textarea',
    'textarea[spellcheck="false"]',
  ]

  let termEl = null
  for (const sel of termSelectors) {
    try {
      await shell.locator(sel).first().waitFor({ state: "attached", timeout: 5000 })
      termEl = shell.locator(sel).first()
      console.log(`✅ Terminal input found: ${sel}`)
      break
    } catch {}
  }

  if (!termEl) {
    console.log("Terminal not visible yet — waiting 30s more...")
    await sleep(30000)
    await snap(shell, "01_wait30")
    for (const sel of termSelectors) {
      try {
        await shell.locator(sel).first().waitFor({ state: "attached", timeout: 5000 })
        termEl = shell.locator(sel).first()
        console.log(`✅ Terminal found after wait: ${sel}`)
        break
      } catch {}
    }
  }

  if (!termEl) {
    console.log("❌ Still no terminal. Taking screenshot for debug.")
    await snap(shell, "02_no_terminal")
    // Print page content hint
    const txt = await shell.locator("body").innerText().catch(() => "").then(t => t.substring(0, 500))
    console.log("Page text:", txt)
    return
  }

  // Click to focus
  await termEl.click()
  await sleep(500)

  // ── Run the 3 gcloud commands ───────────────────────────────────────
  await typeCmd(shell, `gcloud config set project ${PROJECT}`, 3)
  await snap(shell, "03_set_project")

  await typeCmd(shell,
    `gcloud iam service-accounts create ${SA_ID} --display-name="Panini Pano Veo" --project=${PROJECT} 2>&1; echo "SA_DONE"`,
    10
  )
  await snap(shell, "04_create_sa")

  await typeCmd(shell,
    `gcloud projects add-iam-policy-binding ${PROJECT} ` +
    `--member="serviceAccount:${SA_EMAIL}" --role="roles/aiplatform.user" --quiet 2>&1; echo "ROLE_DONE"`,
    15
  )
  await snap(shell, "05_grant_role")

  await typeCmd(shell,
    `gcloud iam service-accounts keys create /tmp/vk.json ` +
    `--iam-account=${SA_EMAIL} 2>&1; echo "KEY_DONE"`,
    10
  )
  await snap(shell, "06_create_key")

  // Output key as base64
  await typeCmd(shell, `base64 -w0 /tmp/vk.json; echo; echo "B64_DONE"`, 5)
  await snap(shell, "07_b64_output")
  await sleep(3000)

  // ── Extract terminal content ────────────────────────────────────────
  const termText = await shell.evaluate(() => {
    // xterm row content
    const rows = document.querySelectorAll(".xterm-rows > div")
    if (rows.length) return Array.from(rows).map(r => r.textContent || "").join("\n")
    // fallback
    return document.body.innerText || ""
  }).catch(() => "")

  console.log(`\n--- Terminal (last 1000 chars) ---\n${termText.slice(-1000)}\n---`)

  // Find base64 blob (long base64 string before B64_DONE)
  const b64Match = termText.replace(/\s/g, "").match(/([A-Za-z0-9+/=]{500,})/)
  if (b64Match) {
    try {
      const json = Buffer.from(b64Match[1], "base64").toString("utf8")
      const parsed = JSON.parse(json)
      if (parsed.type === "service_account") {
        fs.writeFileSync(KEY_OUT, json)
        console.log(`\n✅ vertex-key.json saved!`)
        console.log(`  Project: ${parsed.project_id}`)
        console.log(`  Email:   ${parsed.client_email}`)

        const envPath = path.join(__dirname, ".env")
        let env = fs.readFileSync(envPath, "utf8")
        const cred = `GOOGLE_APPLICATION_CREDENTIALS=${KEY_OUT}`
        if (env.includes("GOOGLE_APPLICATION_CREDENTIALS="))
          env = env.replace(/GOOGLE_APPLICATION_CREDENTIALS=.*/, cred)
        else env += `\n${cred}\n`
        fs.writeFileSync(envPath, env)
        console.log("  .env updated ✅")
        console.log("\n🎉 Ready to test Veo 3.1: node test-veo31.cjs")
        return
      }
    } catch (e) {
      console.log("Base64 decode failed:", e.message)
    }
  }

  // Fallback: get raw JSON via cat
  console.log("\nTrying raw cat fallback...")
  await typeCmd(shell, `echo "===BEGIN===" && cat /tmp/vk.json && echo "===END==="`, 4)
  await sleep(2000)

  const termText2 = await shell.evaluate(() =>
    document.body.innerText || ""
  ).catch(() => "")

  const jsonMatch = termText2.match(/===BEGIN===\s*([\s\S]*?)\s*===END===/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1])
      if (parsed.type === "service_account") {
        const json = JSON.stringify(parsed, null, 2)
        fs.writeFileSync(KEY_OUT, json)
        console.log(`✅ Key saved via cat fallback!  Email: ${parsed.client_email}`)
        const envPath = path.join(__dirname, ".env")
        let env = fs.readFileSync(envPath, "utf8")
        const cred = `GOOGLE_APPLICATION_CREDENTIALS=${KEY_OUT}`
        if (env.includes("GOOGLE_APPLICATION_CREDENTIALS="))
          env = env.replace(/GOOGLE_APPLICATION_CREDENTIALS=.*/, cred)
        else env += `\n${cred}\n`
        fs.writeFileSync(envPath, env)
        console.log(".env updated ✅")
      }
    } catch (e) { console.log("JSON parse failed:", e.message) }
  } else {
    console.log("⚠️  Could not extract key. Check shell_07_b64_output.png")
  }
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1) })
