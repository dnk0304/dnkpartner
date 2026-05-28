/**
 * Use Cloud Shell via Playwright to create service account + key
 */
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
  
  // Find the Cloud Shell tab
  let page = context.pages().find(p => p.url().includes("shell.cloud.google.com"))
  if (!page) {
    page = await context.newPage()
    await page.goto(`https://shell.cloud.google.com/?project=${PROJECT}&show=terminal`, {
      waitUntil: "domcontentloaded", timeout: 30000
    })
    await sleep(5000)
  }
  console.log("On Cloud Shell:", page.url())

  // Click Continue if the welcome dialog is showing
  try {
    const continueBtn = page.getByText("Continue", { exact: true })
    await continueBtn.waitFor({ timeout: 5000 })
    await continueBtn.click()
    console.log("Clicked Continue")
    await sleep(8000) // Wait for shell to provision
  } catch {
    console.log("No Continue dialog — shell may already be open")
  }

  // Wait for terminal to be ready — look for the terminal area
  console.log("Waiting for terminal...")
  await sleep(5000)
  
  // Take a screenshot to see current state
  await page.screenshot({ path: path.join(__dirname, "cloud-shell-state.png") })
  console.log("Screenshot saved: cloud-shell-state.png")

  // Try to find and interact with the terminal
  // Cloud Shell uses xterm.js — look for the textarea input
  const termInput = page.locator('textarea.xterm-helper-textarea, .xterm textarea, [class*="xterm"] textarea').first()
  
  try {
    await termInput.waitFor({ timeout: 15000 })
    console.log("Terminal found!")
  } catch {
    // Alternative: try clicking the terminal area to focus it
    console.log("Looking for terminal area...")
    const termArea = page.locator('.xterm, [class*="terminal"], .cloud-shell-terminal').first()
    try {
      await termArea.waitFor({ timeout: 10000 })
      await termArea.click()
      console.log("Clicked terminal area")
    } catch {
      console.log("Could not find terminal — taking screenshot for debugging")
      await page.screenshot({ path: path.join(__dirname, "cloud-shell-debug.png") })
      return
    }
  }

  // Function to run a command in Cloud Shell
  async function runCmd(cmd, waitSec = 8) {
    console.log(`\n$ ${cmd}`)
    await page.keyboard.type(cmd, { delay: 20 })
    await sleep(300)
    await page.keyboard.press("Enter")
    await sleep(waitSec * 1000)
  }

  // Set project
  await runCmd(`gcloud config set project ${PROJECT}`, 3)

  // Create service account
  await runCmd(`gcloud iam service-accounts create ${SA_ID} --display-name="Panini Pano Veo" --project=${PROJECT}`, 5)

  // Grant Vertex AI User role
  await runCmd(`gcloud projects add-iam-policy-binding ${PROJECT} --member="serviceAccount:${SA_ID}@${PROJECT}.iam.gserviceaccount.com" --role="roles/aiplatform.user" --quiet`, 8)

  // Create JSON key
  await runCmd(`gcloud iam service-accounts keys create /tmp/vertex-key.json --iam-account=${SA_ID}@${PROJECT}.iam.gserviceaccount.com`, 5)

  // Read the key file content
  await runCmd(`cat /tmp/vertex-key.json`, 3)

  // Take final screenshot
  await page.screenshot({ path: path.join(__dirname, "cloud-shell-final.png") })
  console.log("\nFinal screenshot saved: cloud-shell-final.png")

  // Try to extract the JSON key from the terminal output
  // We'll use a different approach: base64 encode it for clean extraction
  await runCmd(`base64 -w0 /tmp/vertex-key.json`, 3)
  
  await sleep(2000)

  // Get the terminal content
  const termContent = await page.evaluate(() => {
    // Try to get text from xterm buffer
    const rows = document.querySelectorAll('.xterm-rows div, .xterm .xterm-screen div')
    const lines = []
    rows.forEach(r => { if (r.textContent.trim()) lines.push(r.textContent) })
    return lines.join('\n')
  }).catch(() => "")

  console.log("\n--- Terminal output (last part) ---")
  console.log(termContent.substring(Math.max(0, termContent.length - 2000)))

  // Try to extract base64 key from terminal output
  const b64Match = termContent.match(/([A-Za-z0-9+/=]{100,})/)
  if (b64Match) {
    try {
      const keyJson = Buffer.from(b64Match[1], "base64").toString("utf8")
      const parsed = JSON.parse(keyJson)
      fs.writeFileSync(KEY_OUT, keyJson)
      console.log(`\n✅ Key saved: ${KEY_OUT}`)
      console.log(`  Project: ${parsed.project_id}`)
      console.log(`  Email: ${parsed.client_email}`)
    } catch(e) {
      console.log("Could not decode key:", e.message)
    }
  } else {
    console.log("\n⚠️  Could not extract key from terminal. Check cloud-shell-final.png")
    console.log("The key was saved to /tmp/vertex-key.json in Cloud Shell")
    console.log("Run 'cat /tmp/vertex-key.json' in Cloud Shell to copy it manually")
  }
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1) })
