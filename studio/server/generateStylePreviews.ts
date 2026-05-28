// ============================================================
// DNK AI Studio - Imagery Style Preview Generation
// Using Z-Image-Turbo via Replicate
// ============================================================

import Replicate from "replicate"
import * as fs from "fs"
import * as path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN || ""

// Imagery Style Presets (matching StudioMode.ts and actual filenames in public/styles/)
export const IMAGERY_STYLE_PRESETS = [
  { id: "photorealistic", name: "Photorealistic" },
  { id: "cinematic-reality", name: "Cinematic Reality" },
  { id: "super-reality", name: "Super Reality" },
  { id: "anime-style", name: "Anime Style" },
  { id: "pixar-3d-cartoon", name: "Pixar 3D Cartoon" },
  { id: "classic-2d-cartoon", name: "Classic 2D Cartoon" },
  { id: "black-line-art", name: "Black Line Art" },
  { id: "oil-painting", name: "Oil Painting" },
  { id: "watercolor", name: "Watercolor" },
  { id: "cyberpunk", name: "Cyberpunk" },
  { id: "fantasy-art", name: "Fantasy Art" },
  { id: "minimalist", name: "Minimalist" },
  { id: "vintage-retro", name: "Vintage Retro" },
  { id: "3d-render", name: "3D Render" },
  { id: "comic-book", name: "Comic Book" },
  { id: "pixel-art", name: "Pixel Art" },
  { id: "dark-and-moody", name: "Dark & Moody" },
]

// Detailed prompts for each style (people, scenery, objects, vehicles)
export const STYLE_PREVIEW_PROMPTS: Record<string, string> = {
  "photorealistic": "A professional photograph of a woman standing next to a vintage red sports car on a coastal highway at golden hour. The scene includes dramatic ocean cliffs in the background, with waves crashing against rocks. She wears a flowing summer dress, and her hair moves gently in the wind. The car's chrome details reflect the warm sunlight. Photorealistic, DSLR quality, natural lighting, high detail, lifelike, 8k resolution.",
  
  "cinematic-reality": "An epic cinematic shot of a man walking away from a sleek black motorcycle in an urban street at dusk. The scene features dramatic teal and orange color grading, with neon signs reflected in wet pavement. Volumetric light rays pierce through atmospheric mist. The composition includes modern skyscrapers in the background. Cinematic reality, Hollywood film look, anamorphic lens, teal and orange color grading, dramatic lighting, film grain.",
  
  "super-reality": "An impossibly detailed view of a woman standing in a futuristic garden with a hovering drone nearby. Every leaf, every strand of hair, every surface texture is hyper-realistic beyond what a camera can capture. The scene includes crystal-clear water features, ultra-sharp architectural elements, and a luxury electric vehicle in the background. Super reality, hyper-detailed, beyond photography, extreme HDR, crystal clear, ultra sharp, maximum detail.",
  
  "anime-style": "A beautiful anime character standing in a magical forest clearing with their companion fox. Cherry blossom petals float through the air, and a wooden cart filled with glowing crystals sits nearby. The scene has soft cel-shading, vibrant colors, and Studio Ghibli-inspired background art with detailed trees and a distant mountain. Anime style, cel-shaded, vibrant colors, Studio Ghibli inspired, detailed linework, soft shading.",
  
  "pixar-3d-cartoon": "A cheerful Pixar-style character with large expressive eyes standing next to a colorful, round-shaped car. The scene is set in a whimsical town with rounded buildings, fluffy clouds, and bright rainbow colors. A friendly cartoon bird perches on a nearby mailbox. Everything has smooth, appealing 3D rendering with soft shadows. Pixar 3D cartoon style, Disney animation, rounded features, expressive faces, colorful, family-friendly, smooth 3D rendering.",
  
  "classic-2d-cartoon": "A classic 2D cartoon character in the style of Looney Tunes, standing with exaggerated pose next to a zany, squash-and-stretch styled car with wobbly wheels. The background shows a simple but vibrant landscape with bold black outlines. A cartoon bird flies overhead with motion lines. Classic 2D cartoon style, Looney Tunes inspired, bold black outlines, exaggerated features, vibrant flat colors, rubbery animation.",
  
  "black-line-art": "A detailed line art illustration of a woman standing beside an elegant vintage car in a scenic landscape. The drawing features intricate outlines showing her flowing hair, the car's detailed curves, trees in the background, and a mountain vista. Clean black lines on white background, no fill colors, perfect for a coloring book. Black line art, coloring book style, clean outlines, no fill, white background, detailed linework, suitable for coloring.",
  
  "oil-painting": "A classical oil painting of a noble figure standing near an ornate horse-drawn carriage in front of a grand estate. Rich, textured brushstrokes capture the golden light of sunset, the detailed costume, the horses' flowing manes, and the Renaissance architecture. Visible impasto technique with warm, deep colors. Oil painting style, classical art, visible brushstrokes, Renaissance inspired, rich colors, textured canvas.",
  
  "watercolor": "A delicate watercolor painting of a young woman in a garden, sitting near a bicycle with a basket of flowers. Soft washes of color bleed gently into each other, creating a dreamy atmosphere. The background features trees and a distant cottage, all rendered with gentle, flowing watercolor techniques on textured paper. Watercolor painting, soft washes, bleeding colors, dreamy atmosphere, textured paper, delicate details.",
  
  "cyberpunk": "A cyberpunk scene of a figure in a neon-lit alley standing next to a futuristic hovering motorcycle. Rain-soaked streets reflect holographic advertisements and glowing kanji signs. The figure wears a high-tech jacket with LED accents. Towering megastructures loom in the background, with flying cars visible in the distance. Cyberpunk style, neon lights, rain-soaked streets, holographic displays, Blade Runner aesthetic, futuristic dystopia, high tech low life.",
  
  "fantasy-art": "An epic fantasy illustration of a warrior standing before a majestic dragon near ancient ruins. The scene is bathed in magical ethereal light, with glowing crystals, a mystical artifact floating nearby, and a fantasy landscape with impossible architecture. Dramatic clouds and magic energy swirl through the air. Fantasy art style, epic fantasy, magical elements, concept art quality, dramatic lighting, mythical creatures, detailed environments.",
  
  "minimalist": "A minimalist design featuring a silhouette of a person standing next to a geometric car shape against a sunset. Clean lines, simple shapes, and a limited color palette of orange, blue, and white. Negative space is used effectively, with abstract mountains in the background created from basic geometric forms. Minimalist style, clean lines, geometric shapes, negative space, modern design, simple color palette, uncluttered.",
  
  "vintage-retro": "A vintage 1970s photograph of a woman leaning against a classic muscle car at a retro diner. The image has authentic film grain, slightly faded colors with a warm amber tone, and the nostalgic aesthetic of analog photography. The scene includes vintage signage, chrome details, and period-accurate clothing. Vintage retro style, 1970s-80s aesthetic, film grain, nostalgic, faded colors, analog photography, classic design.",
  
  "3d-render": "A professional 3D product visualization of a sleek concept vehicle in a pristine studio environment. The scene features perfect ray-traced reflections, ambient occlusion, subsurface scattering on materials, and a human model showcasing scale. Dramatic studio lighting with soft shadows and glossy floor reflections. 3D render style, Octane render, ray-traced lighting, product visualization quality, reflections, ambient occlusion, studio lighting.",
  
  "comic-book": "A dynamic comic book panel showing a superhero landing dramatically next to their high-tech vehicle as they confront a villain in a city street. Bold outlines, halftone dots for shading, vibrant primary colors, and action lines emphasize motion. The background includes urban buildings with dramatic perspective. Comic book style, bold outlines, halftone dots, Marvel/DC inspired, dynamic action, speech bubbles, dramatic panels.",
  
  "pixel-art": "A 16-bit pixel art scene of a character standing next to a blocky retro-styled car in a pixelated landscape. The scene includes simplified trees, mountains, and a sunset sky, all rendered in a limited color palette with visible individual pixels. Nostalgic gaming aesthetic with sprite-like character design. Pixel art style, 16-bit retro gaming, sprite-like, limited color palette, nostalgic gaming aesthetic, sharp pixels.",
  
  "dark-and-moody": "A noir-style scene of a mysterious figure in a trench coat standing beside a vintage car under a single street lamp in a foggy alley. Heavy shadows dominate the composition, with dramatic chiaroscuro lighting. The atmosphere is brooding and mysterious, with rain-slicked pavement reflecting the dim light. Dark and moody style, film noir, low-key lighting, mysterious atmosphere, heavy shadows, dramatic contrast, brooding.",
}

// Generate a single style preview
export async function generateStylePreview(styleId: string): Promise<string | null> {
  try {
    console.log(`Generating preview for style: ${styleId}`)

    const prompt = STYLE_PREVIEW_PROMPTS[styleId]
    if (!prompt) {
      console.error(`No prompt defined for style: ${styleId}`)
      return null
    }

    const replicate = new Replicate({
      auth: REPLICATE_API_TOKEN,
    })

    // Use Z-Image-Turbo via Replicate (specific version)
    const output = await replicate.run("prunaai/z-image-turbo:41b8eafe17c4c2a76d8c1b1ab65dc9833f609c11bfb5f2d9bf1cf27f8c1f0e9c", {
      input: {
        prompt: prompt,
        width: 1024,
        height: 1024,
        output_format: "jpg",
        output_quality: 90,
        num_inference_steps: 8,
        guidance_scale: 0,
      },
    }) as any

    // Handle various output formats
    let imageUrl: string | null = null

    if (typeof output === "string") {
      imageUrl = output
    } else if (output && typeof output.url === "function") {
      imageUrl = await output.url()
    } else if (output && typeof output.url === "string") {
      imageUrl = output.url
    } else if (output && output.output) {
      if (typeof output.output === "string") {
        imageUrl = output.output
      } else if (Array.isArray(output.output) && output.output.length > 0) {
        imageUrl = output.output[0]
      }
    } else if (Array.isArray(output) && output.length > 0) {
      imageUrl = output[0]
    }

    if (!imageUrl) {
      console.error(`Failed to extract image URL for style: ${styleId}`)
      return null
    }

    // Download the image
    const response = await fetch(imageUrl)
    if (!response.ok) {
      console.error(`Failed to download image for style: ${styleId}`)
      return null
    }

    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Ensure public/styles directory exists
    const stylesDir = path.join(__dirname, "..", "public", "styles")
    if (!fs.existsSync(stylesDir)) {
      fs.mkdirSync(stylesDir, { recursive: true })
    }

    // Save the image
    const filename = `${styleId}.jpg`
    const filepath = path.join(stylesDir, filename)
    fs.writeFileSync(filepath, buffer)

    console.log(`✓ Generated preview for ${styleId} -> /styles/${filename}`)
    return `/styles/${filename}`
  } catch (error: any) {
    console.error(`Error generating preview for ${styleId}:`, error.message)
    
    // Check for rate limiting
    if (error.message && error.message.includes("429")) {
      console.log("Rate limited by Replicate. Please wait and try again, or add more credits.")
    }
    
    return null
  }
}

// Generate all style previews
export async function generateAllStylePreviews(): Promise<Record<string, string>> {
  console.log("Starting generation of all 17 style previews...")
  console.log("This may take a few minutes. Each image costs $0.0025.")
  console.log("Total estimated cost: ~$0.0425\n")

  const results: Record<string, string> = {}
  let successCount = 0
  let failCount = 0

  for (const style of IMAGERY_STYLE_PRESETS) {
    const result = await generateStylePreview(style.id)
    
    if (result) {
      results[style.id] = result
      successCount++
    } else {
      failCount++
    }

    // Add a delay between requests to avoid rate limiting
    // With low credits (<$5), Replicate limits to 6 requests/minute with burst of 1
    // Wait 15 seconds between requests to be safe
    if (style.id !== IMAGERY_STYLE_PRESETS[IMAGERY_STYLE_PRESETS.length - 1].id) {
      console.log("Waiting 15 seconds before next generation (rate limit compliance)...\n")
      await new Promise(resolve => setTimeout(resolve, 15000))
    }
  }

  console.log("\n" + "=".repeat(60))
  console.log(`Generation complete!`)
  console.log(`✓ Successful: ${successCount}`)
  console.log(`✗ Failed: ${failCount}`)
  console.log(`Images saved to: public/styles/`)
  console.log("=".repeat(60))

  return results
}

// Get all generated style preview URLs
export function getStylePreviewUrls(): Record<string, string> {
  const results: Record<string, string> = {}
  const stylesDir = path.join(__dirname, "..", "public", "styles")

  if (!fs.existsSync(stylesDir)) {
    return results
  }

  for (const style of IMAGERY_STYLE_PRESETS) {
    const filename = `${style.id}.jpg`
    const filepath = path.join(stylesDir, filename)
    
    if (fs.existsSync(filepath)) {
      results[style.id] = `/styles/${filename}`
    }
  }

  return results
}


