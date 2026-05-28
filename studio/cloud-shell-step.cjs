const { chromium } = require("playwright")
const fs = require("fs"), path = require("path")
const CDP_URL = "http://127.0.0.1:18800"
const PROJECT = "openclaw-dnk"
const SA_ID   = "panini-pano-veo"
const KEY_OUT = path.join(__dirname, "vertex-key.json")
const SNAP    = p => path.join("C:\\Users\\D\\.openclaw\\workspace-cash", p)
const sleep   = ms => new Promise(r => setTimeout(r, ms))

async function snap(page, label) {
  const p = SNAP(`cs_${label}.png`)
  await page.screenshot({ path: p, fullPage: false })
  console.log(`  📸 ${label}`)
  return p
}

async function tryClick(page, selectors, label) {
  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first()
      await el.waitFor({ timeout: 4000 })
      await el.click()
      console.log(`  ✅ Clicked: ${label} (${sel})`)
      return true
    } catch {}
  }
  console.log(`  ⚠️  Could not find: ${label}`)
  return false
}

async function runCmd(page, cmd, waitSec = 6) {
  console.log(`  $ ${cmd.substring(0,80)}`)
  // Click terminal to make sure it's focused
  await page.mouse.click(600, 500)
  await sleep(300)
  await page.keyboard.type(cmd, { delay: 12 })
  await page.keyboard.press("Enter")
  await sleep(waitSec * 1000)
}

async function main() {
  const browser = await chromium.connectOverCDP(CDP_URL)
  const context = browser.contexts()[0]

  // ── Find or open Cloud Shell ────────────────────────────────────────────
  let page = context.pages().find(p => p.url().includes("shell.cloud.google.com"))
  if (!page) {
    page = await context.newPage()
    await page.goto(`https://shell.cloud.google.com/?project=${PROJECT}&show=terminal`, {
      waitUntil: "domcontentloaded", timeout: 30000
    })
  }
  console.log(`Page: ${page.url()}`)
  await sleep(4000)
  await snap(page, "01_initial")

  // ── Handle any dialogs / verify screens ────────────────────────────────
  for (let attempt = 0; attempt < 6; attempt++) {
    const content = await page.content()

    // "Verify your account" dialog
    if (content.includes("Verify your account") || content.includes("verify your account")) {
      console.log("\nStep: Account verification dialog")
      await tryClick(page, [
        'button:has-text("Verify")',
        '[data-label="Verify"]',
        'button.verify-btn',
        'text=Verify'
      ], "Verify button")
      await sleep(8000)
      await snap(page, `0${attempt+2}_after_verify`)
      
      // If a new tab/window opened for verification, handle it
      const pages = context.pages()
      if (pages.length > 1) {
        const verifyPage = pages[pages.length - 1]
        console.log(`  New tab opened: ${verifyPage.url()}`)
        await sleep(3000)
        await snap(verifyPage, `0${attempt+2}_verify_tab`)
        
        // Try clicking through any "I agree" / Continue / terms dialogs
        for (const btn of ["Continue", "I agree", "Accept", "Next", "Got it", "OK"]) {
          try {
            const b = verifyPage.getByRole("button", { name: new RegExp(btn, "i") }).first()
            await b.waitFor({ timeout: 2000 })
            await b.click()
            console.log(`  Clicked ${btn} on verify tab`)
            await sleep(2000)
          } catch {}
        }
        
        await snap(verifyPage, `0${attempt+2}_verify_tab_after`)
        
        // If it asks for a phone number, we can't proceed — report back
        const verifyContent = await verifyPage.content()
        if (verifyContent.includes("phone") || verifyContent.includes("Phone") || verifyContent.includes("+")) {
          console.log("\n⚠️  Phone verification required — needs Deno's phone number")
          await snap(verifyPage, "phone_verification_needed")
          await verifyPage.close()
          break
        }
        
        await verifyPage.close()
      }
      continue
    }

    // "Provisioning" or loading — wait longer
    if (content.includes("Provisioning") || content.includes("Connecting")) {
      console.log(`\nStep: Provisioning/loading (attempt ${attempt+1})...`)
      await sleep(15000)
      await snap(page, `0${attempt+2}_provisioning`)
      continue
    }

    // Refresh button after verify
    if (content.includes("Refresh") && !content.includes("xterm")) {
      console.log("\nStep: Clicking Refresh...")
      await tryClick(page, ['button:has-text("Refresh")', 'text=Refresh'], "Refresh")
      await sleep(10000)
      await snap(page, `0${attempt+2}_after_refresh`)
      continue
    }

    // Accept terms of service
    if (content.includes("Terms of Service") || content.includes("terms of service")) {
      console.log("\nStep: Terms of Service")
      await tryClick(page, [
        'button:has-text("Accept")',
        'button:has-text("I agree")',
        'button:has-text("Agree")',
        'input[type="checkbox"]'
      ], "Accept terms")
      await sleep(3000)
      continue
    }

    // xterm / terminal present — we're in!
    if (content.includes("xterm") || content.includes("xterm-helper")) {
      console.log("\n✅ Terminal is ready!")
      await snap(page, "terminal_ready")
      break
    }

    console.log(`\nWaiting for terminal (attempt ${attempt+1})...`)
    await sleep(8000)
  }

  await snap(page, "before_commands")
  
  // ── Try to interact with terminal ───────────────────────────────────────
  // Click in the terminal area
  const termSelectors = [
    'textarea.xterm-helper-textarea',
    '.xterm textarea',
    '[class*="xterm"] textarea',
    '.xterm-screen',
    '.terminal-instance',
    '[id*="terminal"]'
  ]
  
  let termFound = false
  for (const sel of termSelectors) {
    try {
      const el = page.locator(sel).first()
      await el.waitFor({ timeout: 3000 })
      await el.click()
      console.log(`\nTerminal found via: ${sel}`)
      termFound = true
      break
    } catch {}
  }

  if (!termFound) {
    // Try clicking at coordinates where terminal usually is
    await page.mouse.click(600, 500)
    await sleep(1000)
    // Check if keyboard input works by typing something
    await page.keyboard.type("echo test")
    await sleep(1000)
    await snap(page, "keyboard_test")
    await page.keyboard.press("Control+c")
    
    const afterType = await page.content()
    termFound = afterType.includes("test") || afterType.includes("xterm")
    if (termFound) console.log("\nTerminal accessible via coordinates")
  }

  if (!termFound) {
    console.log("\n❌ Terminal not accessible. Final state:")
    await snap(page, "final_no_terminal")
    return
  }

  // ── Run the gcloud commands ─────────────────────────────────────────────
  console.log("\nRunning gcloud setup commands...")
  
  await runCmd(page, `gcloud config set project ${PROJECT}`, 4)
  await snap(page, "after_set_project")

  await runCmd(page, `gcloud iam service-accounts create ${SA_ID} --display-name="Panini Pano Veo" --project=${PROJECT} 2>&1`, 8)
  await snap(page, "after_create_sa")

  await runCmd(page,
    `gcloud projects add-iam-policy-binding ${PROJECT} ` +
    `--member="serviceAccount:${SA_ID}@${PROJECT}.iam.gserviceaccount.com" ` +
    `--role="roles/aiplatform.user" --quiet`, 10)
  await snap(page, "after_grant_role")

  await runCmd(page, `gcloud iam service-accounts keys create /tmp/vk.json --iam-account=${SA_ID}@${PROJECT}.iam.gserviceaccount.com`, 8)
  await snap(page, "after_create_key")

  await runCmd(page, `base64 -w0 /tmp/vk.json`, 5)
  await snap(page, "b64_key_output")

  // ── Extract key from terminal output ───────────────────────────────────
  await sleep(2000)
  const termText = await page.evaluate(() => {
    const rows = document.querySelectorAll('.xterm-rows .xterm-row, .xterm-rows div, .terminal-output div')
    return Array.from(rows).map(r => r.textContent || r.innerText || "").join("")
  }).catch(() => "")

  const b64 = termText.match(/([A-Za-z0-9+/]{200,}={0,2})/)
  if (b64) {
    try {
      const json = Buffer.from(b64[1], "base64").toString("utf8")
      const parsed = JSON.parse(json)
      fs.writeFileSync(KEY_OUT, json)
      console.log(`\n✅ vertex-key.json saved!`)
      console.log(`  Project: ${parsed.project_id}`)
      console.log(`  Email: ${parsed.client_email}`)
      
      // Update .env
      const envPath = path.join(__dirname, ".env")
      let env = fs.readFileSync(envPath, "utf8")
      if (!env.includes("GOOGLE_APPLICATION_CREDENTIALS")) {
        env += `\nGOOGLE_APPLICATION_CREDENTIALS=${KEY_OUT}\n`
      } else {
        env = env.replace(/GOOGLE_APPLICATION_CREDENTIALS=.*/, `GOOGLE_APPLICATION_CREDENTIALS=${KEY_OUT}`)
      }
      fs.writeFileSync(envPath, env)
      console.log("  .env updated with GOOGLE_APPLICATION_CREDENTIALS ✅")
    } catch(e) { console.log("Could not decode base64:", e.message) }
  } else {
    // Try to get key via clipboard
    await runCmd(page, `cat /tmp/vk.json | xclip -selection clipboard 2>/dev/null || cat /tmp/vk.json`, 3)
    await snap(page, "key_raw_output")
    console.log("Check cs_key_raw_output.png for the key content")
  }
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1) })
