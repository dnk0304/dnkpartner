/**
 * Navigate to GCP Console → API Credentials → Create API Key
 * This creates a standard API key that can be used with Vertex AI
 */
const { chromium } = require("playwright")
const fs = require("fs")
const path = require("path")

const CDP_URL = "http://127.0.0.1:18800"
const PROJECT = "openclaw-dnk"
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function main() {
  const browser = await chromium.connectOverCDP(CDP_URL)
  const context = browser.contexts()[0]
  const page = await context.newPage()

  // Go to API Credentials page directly
  console.log("Opening API Credentials page...")
  await page.goto(
    `https://console.cloud.google.com/apis/credentials?project=${PROJECT}`,
    { waitUntil: "domcontentloaded", timeout: 30000 }
  )
  await sleep(5000)
  await page.screenshot({ path: path.join(__dirname, "credentials-page.png") })
  console.log("Screenshot: credentials-page.png")
  
  // Look for "CREATE CREDENTIALS" button
  try {
    const createBtn = page.getByRole("button", { name: /create credentials/i })
    await createBtn.waitFor({ timeout: 10000 })
    await createBtn.click()
    console.log("Clicked Create Credentials")
    await sleep(2000)
    
    // Select "API Key" from dropdown
    const apiKeyOption = page.getByText("API key", { exact: false }).first()
    await apiKeyOption.waitFor({ timeout: 5000 })
    await apiKeyOption.click()
    console.log("Selected API Key")
    await sleep(5000)
    
    await page.screenshot({ path: path.join(__dirname, "api-key-created.png") })
    
    // Try to extract the key from the dialog
    const keyText = await page.evaluate(() => {
      // Look for the key display element
      const inputs = document.querySelectorAll('input[readonly], input[type="text"], .mdc-text-field__input')
      for (const input of inputs) {
        if (input.value && input.value.startsWith("AIza")) return input.value
      }
      // Try any text that looks like an API key
      const allText = document.body.innerText
      const match = allText.match(/AIza[A-Za-z0-9_-]{35,}/)
      return match ? match[0] : null
    }).catch(() => null)
    
    if (keyText) {
      console.log(`\n✅ API Key created: ${keyText.substring(0, 15)}...`)
      console.log(`Full key: ${keyText}`)
      
      // Update .env
      const envPath = path.join(__dirname, ".env")
      let env = fs.readFileSync(envPath, "utf8")
      env = env.replace(/GOOGLE_API_KEY=.*/, `GOOGLE_API_KEY=${keyText}`)
      fs.writeFileSync(envPath, env)
      console.log("Updated .env with new key ✅")
    } else {
      console.log("Could not extract key automatically — check api-key-created.png")
    }
    
    // Close the dialog
    try {
      const closeBtn = page.getByRole("button", { name: /close/i }).or(page.getByRole("button", { name: /done/i }))
      await closeBtn.click()
    } catch {}
    
  } catch(e) {
    console.log("Error:", e.message.substring(0, 150))
    await page.screenshot({ path: path.join(__dirname, "credentials-error.png") })
  }

  // Also check: enable the Generative Language API (needed for Veo via Gemini-style calls)
  console.log("\nEnabling Generative Language API...")
  await page.goto(
    `https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com?project=${PROJECT}`,
    { waitUntil: "domcontentloaded", timeout: 20000 }
  )
  await sleep(4000)
  
  try {
    const enableBtn = page.getByRole("button", { name: /enable/i })
    await enableBtn.waitFor({ timeout: 5000 })
    await enableBtn.click()
    console.log("Enabled Generative Language API ✅")
    await sleep(3000)
  } catch {
    console.log("Generative Language API may already be enabled")
  }

  await page.screenshot({ path: path.join(__dirname, "final-state.png") })
  await page.close()
  console.log("\nDone.")
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1) })
