const { chromium } = require("playwright")
const fs = require("fs"), path = require("path")
const CDP_URL = "http://127.0.0.1:18800"
const PROJECT = "openclaw-dnk"
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function main() {
  const browser = await chromium.connectOverCDP(CDP_URL)
  const context = browser.contexts()[0]
  
  // Find the credentials page tab
  let page = context.pages().find(p => p.url().includes("apis/credentials"))
  if (!page) {
    page = await context.newPage()
    await page.goto(`https://console.cloud.google.com/apis/credentials?project=${PROJECT}`, {
      waitUntil: "domcontentloaded", timeout: 20000
    })
    await sleep(5000)
  }

  // Click "Show key" to reveal the existing API key
  console.log("Looking for Show key link...")
  
  // The "Show key" link is in the table
  const showKey = page.getByText("Show key", { exact: false }).first()
  try {
    await showKey.waitFor({ timeout: 8000 })
    await showKey.click()
    console.log("Clicked Show key")
    await sleep(2000)
  } catch {
    // Try alternative: click on "API key 1" row to open its details
    console.log("Trying to click API key 1 row...")
    const apiKeyRow = page.getByText("API key 1").first()
    try {
      await apiKeyRow.waitFor({ timeout: 5000 })
      await apiKeyRow.click()
      console.log("Clicked API key 1")
      await sleep(3000)
    } catch {}
  }

  await page.screenshot({ path: path.join(__dirname, "key-revealed.png") })

  // Try to extract the key
  const keyValue = await page.evaluate(() => {
    // Look for text that looks like an API key
    const allText = document.body.innerText
    const match = allText.match(/AIza[A-Za-z0-9_-]{35,}/)
    if (match) return match[0]
    
    // Check input fields
    const inputs = document.querySelectorAll('input')
    for (const input of inputs) {
      if (input.value && input.value.startsWith("AIza")) return input.value
    }
    return null
  }).catch(() => null)

  if (keyValue) {
    console.log(`\n✅ Found API key: ${keyValue}`)
    
    // Update .env
    const envPath = path.join(__dirname, ".env")
    let env = fs.readFileSync(envPath, "utf8")
    env = env.replace(/GOOGLE_API_KEY=.*/, `GOOGLE_API_KEY=${keyValue}`)
    fs.writeFileSync(envPath, env)
    console.log("Updated .env ✅")
  } else {
    console.log("Key not found in page text — checking screenshot")
  }

  await page.close()
}

main().catch(e => console.error("Fatal:", e.message))
