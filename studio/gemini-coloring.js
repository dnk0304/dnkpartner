/**
 * Panini Pano — Gemini Auto-Generator via CDP
 * Connects to the running OpenClaw browser (already logged in to Google)
 * Generates 20 high-quality coloring book pages via Gemini
 */

const { chromium } = require("playwright")
const fs = require("fs")
const path = require("path")

const CDP_URL = "ws://127.0.0.1:18800"
const OUTPUT = "C:\\Users\\D\\Desktop\\panini-pano-website\\images\\generated\\gemini-comparison"
const DELAY = 5000

const PROMPTS = [
  { label: "botanical", name: "foxglove", prompt: "Generate a coloring book page: elegant foxglove flowers with cascading bell-shaped blooms, ornate leaves and decorative gothic botanical border. Black line art on pure white background, no shading, no fills, no color. Adult complexity, highly detailed, suitable for coloring." },
  { label: "botanical", name: "mushroom_forest", prompt: "Generate a coloring book page: fly agaric and chanterelle mushrooms with intricate forest floor of moss, ferns and roots. Beautiful ornate frame with nature motifs. Black line art on white background, no fills, no shading, clean empty outlines. Adult complexity." },
  { label: "botanical", name: "bird_of_paradise", prompt: "Generate a coloring book page: bird of paradise flower with tropical leaves in an elegant symmetrical composition. Ornate decorative border with exotic plant motifs. Black line art on white background, no color, no shading. Adult coloring complexity." },
  { label: "botanical", name: "pressed_flowers", prompt: "Generate a coloring book page: Victorian botanical specimen sheet with pressed flowers — roses, lavender, iris, arranged scientifically with elegant labels and ornate frame. Black outlines on white background, no fills, highly detailed." },
  { label: "botanical", name: "cottage_roses", prompt: "Generate a coloring book page: cottage garden scene with climbing roses on an arch, clematis, butterflies, and garden details. Ornate botanical border. Black line art on white, no fills, no shading, highly intricate. Adult coloring level." },
  { label: "botanical", name: "monstera", prompt: "Generate a coloring book page: monstera deliciosa leaves with intricate vein patterns and tropical ferns in an ornate decorative frame. Black line art on white background, clean outlines only, no shading. Adult complexity." },
  { label: "botanical", name: "orchid", prompt: "Generate a coloring book page: exotic orchid cluster with spotted patterns, intricate labellum details and botanical border with tropical elements. Black line art on white background, no fills, no shading. Adult coloring level." },
  { label: "botanical", name: "hemlock_gothic", prompt: "Generate a coloring book page: hemlock plant with delicate umbrella flowers in gothic botanical style, surrounded by ornate dark botanical border with moon and star motifs. Black outlines on white, no color, highly detailed." },
  { label: "botanical", name: "wisteria", prompt: "Generate a coloring book page: cascading wisteria with intricate twisted vine patterns and detailed flower clusters in a symmetrical composition with ornate frame. Black line art on white background, no fills. Adult complexity." },
  { label: "botanical", name: "passion_flower", prompt: "Generate a coloring book page: passion flower with extraordinary geometric corona filaments surrounded by tropical leaves in detailed botanical composition. Decorative border. Black line art on white, no shading, adult coloring level." },
  { label: "swear", name: "garden_fails", prompt: "Generate a coloring book page with bold decorative hand-lettered text 'What The F*ck Is Growing Here' surrounded by intricate illustrations of dying plants, wilted flowers, confused garden gnome and tools. Ornate botanical border. Black line art on white background, adult humor coloring page." },
  { label: "swear", name: "wine_oclock", prompt: "Generate a coloring book page with elegant ornate lettering 'Pour Decisions' surrounded by elaborate wine glasses, grapes, grapevines and vineyard scene. Decorative baroque border. Black line art on white background, no fills, adult humor." },
  { label: "swear", name: "zero_fcks_cat", prompt: "Generate a coloring book page with decorative text 'Zero F*cks Given' featuring a regal cat on an ornate throne with elaborate royal frame, crown motifs and decorative flourishes. Black line art on white background, adult humor coloring page." },
  { label: "swear", name: "adulting", prompt: "Generate a coloring book page with fancy hand-lettered 'Adulting Is Bullsh*t' surrounded by intricate illustrations of bills, clocks, responsibilities and chaotic adult life. Ornate border. Black line art on white background, no fills." },
  { label: "swear", name: "namaste_bed", prompt: "Generate a coloring book page with ornate lettering 'Namaste In Bed' surrounded by lotus flowers, moon, stars and zen garden elements in a beautiful mandala-style border. Black line art on white background, no shading, adult humor." },
  { label: "swear", name: "wine_time", prompt: "Generate a coloring book page with decorative text 'It Is Wine O Clock Somewhere' with intricate clocks, wine bottles and elaborate grapevine border. Black line art on white background, ornate style, no fills." },
  { label: "swear", name: "cat_purrfect", prompt: "Generate a coloring book page with ornate lettering 'My Cat Thinks I Am Purrfect' with elaborate realistic cat portrait, heart motifs and decorative floral frame. Black line art on white background, no shading, adult humor coloring page." },
  { label: "swear", name: "meeting_email", prompt: "Generate a coloring book page with fancy lettering 'This Meeting Could Have Been An Email' surrounded by chaotic office illustrations — overflowing inbox, clocks, frustrated doodles. Decorative border. Black line art on white." },
  { label: "swear", name: "inner_peace", prompt: "Generate a coloring book page with decorative lettering 'Inner Peace Is Everyone Leaving Me Alone' with intricate cozy room scene — tea, candles, sleeping cat, books. Ornate border. Black line art on white background, no fills." },
  { label: "swear", name: "wellness_chaos", prompt: "Generate a coloring book page with bold ornate 'I Am Not Flexible Enough For This Sh*t' with elaborate struggling yoga pose illustration, decorative floral mandala border. Black line art on white background, adult humor coloring page." },
]

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function main() {
  console.log("\n🎨 Gemini Coloring Book Generator — 19 remaining images\n")
  fs.mkdirSync(OUTPUT, { recursive: true })

  // Connect to the existing OpenClaw browser
  console.log(`Connecting to browser at ${CDP_URL}...`)
  const browser = await chromium.connectOverCDP(CDP_URL)
  const contexts = browser.contexts()
  const context = contexts[0]
  
  // Get or create a page for Gemini
  let geminiPage = context.pages().find(p => p.url().includes("gemini.google.com"))
  if (!geminiPage) {
    geminiPage = await context.newPage()
  }

  let successCount = 1 // First image already saved manually

  for (let i = 1; i < PROMPTS.length; i++) { // Skip first (already done)
    const { label, name, prompt } = PROMPTS[i]
    const num = String(i + 1).padStart(3, "0")
    const outputPath = path.join(OUTPUT, `gemini_${label}_${num}_${name}.png`)

    if (fs.existsSync(outputPath)) {
      console.log(`  [${i+1}/20] Skip (exists): ${path.basename(outputPath)}`)
      successCount++
      continue
    }

    console.log(`  [${i+1}/20] ${label} / ${name}...`)

    try {
      // Navigate to new chat
      await geminiPage.goto("https://gemini.google.com/app", { waitUntil: "domcontentloaded", timeout: 20000 })
      await sleep(2000)

      // Find prompt input and type
      const input = geminiPage.locator('rich-textarea, div[contenteditable="true"]').first()
      await input.waitFor({ timeout: 10000 })
      await input.click()
      await geminiPage.keyboard.type(prompt, { delay: 10 })
      await sleep(500)
      await geminiPage.keyboard.press("Enter")

      console.log(`     Waiting for image generation...`)

      // Wait for image to appear
      await geminiPage.waitForSelector('img[src*="googleusercontent.com/gg-dl"]', { timeout: 60000 })
      await sleep(1500)

      // Get image URL
      const imgUrl = await geminiPage.evaluate(() => {
        const imgs = document.querySelectorAll("img")
        for (const img of imgs) {
          if (img.src && img.src.includes("googleusercontent.com/gg-dl")) return img.src
        }
        return null
      })

      if (!imgUrl) { console.log(`     ⚠️  No image URL found`); continue }

      // Open image in new tab and screenshot it
      const imgPage = await context.newPage()
      await imgPage.goto(imgUrl, { waitUntil: "domcontentloaded", timeout: 20000 })
      await sleep(1000)
      await imgPage.screenshot({ path: outputPath, fullPage: true })
      await imgPage.close()

      const kb = Math.round(fs.statSync(outputPath).size / 1024)
      console.log(`     ✅ Saved: ${path.basename(outputPath)} (${kb}KB)`)
      successCount++

    } catch (err) {
      console.log(`     ❌ Error: ${err.message.substring(0, 100)}`)
    }

    await sleep(DELAY)
  }

  console.log(`\n✅ Complete: ${successCount}/20 Gemini images saved`)
  console.log(`   Output: ${OUTPUT}`)

  await browser.close()
}

main().catch(e => { console.error(e); process.exit(1) })
