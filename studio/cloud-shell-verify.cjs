const { chromium } = require("playwright")
const fs = require("fs")
const path = require("path")

const CDP_URL = "http://127.0.0.1:18800"
const PROJECT = "openclaw-dnk"
const SA_ID   = "panini-pano-veo"
const KEY_OUT = path.join(__dirname, "vertex-key.json")
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function main() {
  const browser = await chromium.connectOverCDP(CDP_URL)
  const context = browser.contexts()[0]
  let page = context.pages().find(p => p.url().includes("shell.cloud.google.com"))
  if (!page) throw new Error("Cloud Shell tab not found")
  
  console.log("Found Cloud Shell tab")

  // Click Verify button
  try {
    const verifyBtn = page.getByRole("button", { name: /verify/i })
    await verifyBtn.waitFor({ timeout: 5000 })
    await verifyBtn.click()
    console.log("Clicked Verify — waiting for verification flow...")
    await sleep(10000)
    
    // Screenshot to see what verification looks like
    await page.screenshot({ path: path.join(__dirname, "cloud-shell-verify.png") })
    console.log("Screenshot: cloud-shell-verify.png")
    
    // It might redirect to a phone verification or CAPTCHA
    // Wait and check
    await sleep(5000)
    await page.screenshot({ path: path.join(__dirname, "cloud-shell-verify2.png") })
  } catch(e) {
    console.log("No verify button found or already past it:", e.message.substring(0, 100))
  }

  // After verification, click Refresh if shown
  try {
    const refreshBtn = page.getByRole("button", { name: /refresh/i })
    await refreshBtn.waitFor({ timeout: 5000 })
    await refreshBtn.click()
    console.log("Clicked Refresh")
    await sleep(10000)
  } catch {}

  // Wait for terminal to appear
  console.log("Waiting for terminal to provision...")
  await sleep(15000)
  await page.screenshot({ path: path.join(__dirname, "cloud-shell-after-verify.png") })

  // Try to find the terminal
  const termArea = page.locator('textarea.xterm-helper-textarea, .xterm textarea').first()
  try {
    await termArea.waitFor({ timeout: 30000 })
    console.log("Terminal ready!")
    await termArea.click()
  } catch {
    // Try clicking any terminal-like area
    const anyTerm = page.locator('.xterm, [class*="terminal-container"], [class*="xterm-screen"]').first()
    try {
      await anyTerm.waitFor({ timeout: 10000 })
      await anyTerm.click()
      console.log("Found alternative terminal element")
    } catch {
      console.log("Still no terminal. Final screenshot saved.")
      await page.screenshot({ path: path.join(__dirname, "cloud-shell-no-terminal.png") })
      return
    }
  }

  // Run gcloud commands
  async function runCmd(cmd, waitSec = 5) {
    console.log(`$ ${cmd}`)
    await page.keyboard.type(cmd, { delay: 15 })
    await sleep(200)
    await page.keyboard.press("Enter")
    await sleep(waitSec * 1000)
  }

  await runCmd(`gcloud config set project ${PROJECT}`, 3)
  await runCmd(`gcloud iam service-accounts create ${SA_ID} --display-name="Panini Pano Veo" --project=${PROJECT} 2>&1 || echo "SA may already exist"`, 6)
  await runCmd(`gcloud projects add-iam-policy-binding ${PROJECT} --member="serviceAccount:${SA_ID}@${PROJECT}.iam.gserviceaccount.com" --role="roles/aiplatform.user" --quiet 2>&1`, 10)
  await runCmd(`gcloud iam service-accounts keys create /tmp/vk.json --iam-account=${SA_ID}@${PROJECT}.iam.gserviceaccount.com 2>&1`, 6)
  await runCmd(`cat /tmp/vk.json`, 3)

  await page.screenshot({ path: path.join(__dirname, "cloud-shell-commands.png") })
  console.log("Commands screenshot saved")

  // Extract key from terminal
  const content = await page.evaluate(() => {
    const sel = window.getSelection()
    // Try to select all in xterm
    const rows = document.querySelectorAll('.xterm-rows [style], .xterm .xterm-screen span')
    return Array.from(rows).map(r => r.textContent).join('')
  }).catch(() => "")

  // Try clipboard approach - select all, copy
  await page.keyboard.down("Control")
  await page.keyboard.press("a")
  await page.keyboard.up("Control")
  await sleep(500)
  await page.keyboard.down("Control")
  await page.keyboard.press("c")
  await page.keyboard.up("Control")
  await sleep(500)

  const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => "")
  const allText = content + clip
  
  // Find JSON key in output
  const jsonMatch = allText.match(/\{[\s\S]*?"type":\s*"service_account"[\s\S]*?\}/)
  if (jsonMatch) {
    fs.writeFileSync(KEY_OUT, jsonMatch[0])
    console.log(`\n✅ Key saved: ${KEY_OUT}`)
    const parsed = JSON.parse(jsonMatch[0])
    console.log(`  Project: ${parsed.project_id}`)
    console.log(`  Email: ${parsed.client_email}`)
  } else {
    // Try base64 approach
    await runCmd(`base64 -w0 /tmp/vk.json && echo`, 3)
    await sleep(2000)
    await page.screenshot({ path: path.join(__dirname, "cloud-shell-b64.png") })
    console.log("Could not auto-extract key. Check screenshots or run manually.")
  }
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1) })
