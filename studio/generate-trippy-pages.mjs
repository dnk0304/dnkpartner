/**
 * Generate 50 Psychedelic/Trippy Coloring Pages via Imagen 4.0
 * Output: C:\Users\D\Desktop\panini-pano-website\images\pdf-ready\psy-trippy-psychedelic\
 * 
 * Style: Black line art on pure white background, adult complexity,
 * no fills/shading — just outlines for coloring.
 * 
 * KDP standard: 8.5x11" at 300 DPI = 2550x3300px
 * Imagen outputs 1024x1024 — we'll upscale later or use as-is for digital PDFs
 */

import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || 'AIzaSyC_qH7WX3DNa7ziM4bGExDl-BlPvsypMGM';
const OUTPUT_DIR = 'C:\\Users\\D\\Desktop\\panini-pano-website\\images\\pdf-ready\\psy-trippy-psychedelic';
const PROGRESS_FILE = path.join(OUTPUT_DIR, 'progress.json');

const ai = new GoogleGenAI({ apiKey: GOOGLE_API_KEY });

// Load or create progress
let progress = {};
if (fs.existsSync(PROGRESS_FILE)) {
  progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
}

const BASE_STYLE = `Black and white adult coloring page, intricate detailed line art on pure white background, no fills no shading no gray tones, only clean black outlines, highly detailed for adult coloring, printable quality`;

const PAGES = [
  // Fractal & Geometric Psychedelia (1-10)
  { id: '001_sacred_geometry_portal', prompt: `${BASE_STYLE}, sacred geometry portal with nested Metatron's cubes, flower of life patterns spiraling into infinity, fractal edges dissolving into smaller geometric forms, mandala-like center radiating crystalline structures` },
  { id: '002_fractal_mushroom_temple', prompt: `${BASE_STYLE}, enormous psychedelic mushroom with fractal gills, the cap covered in Fibonacci spiral patterns, tiny mushrooms growing from larger ones recursively, sacred geometry ground beneath, cosmic background patterns` },
  { id: '003_kaleidoscope_eye', prompt: `${BASE_STYLE}, giant all-seeing eye at center with kaleidoscope patterns radiating outward, each segment containing different psychedelic motifs — waves, spirals, fractals, geometric crystals, paisley tears` },
  { id: '004_impossible_staircase', prompt: `${BASE_STYLE}, MC Escher-inspired impossible architecture with infinite staircases, psychedelic patterns filling each surface, geometric optical illusions, fish transforming into birds along the edges` },
  { id: '005_fibonacci_galaxy', prompt: `${BASE_STYLE}, Fibonacci spiral forming a galaxy, each arm made of increasingly detailed mandala patterns, planets as intricate geometric spheres, cosmic dust rendered as tiny sacred geometry symbols` },
  { id: '006_tessellation_morph', prompt: `${BASE_STYLE}, Escher-style tessellation where geometric shapes gradually morph into butterflies at one end and fish at the other, psychedelic wave patterns filling the transition zone` },
  { id: '007_crystal_cave', prompt: `${BASE_STYLE}, interior of a massive crystal cave with towering quartz formations, each crystal facet containing tiny geometric patterns, light beams rendered as detailed ray patterns, amethyst clusters with fractal detail` },
  { id: '008_mandala_explosion', prompt: `${BASE_STYLE}, mandala deconstructing outward from center, inner rings perfectly geometric, outer rings dissolving into organic psychedelic tendrils, paisley drops, swirling vines, and tiny stars` },
  { id: '009_platonic_solids', prompt: `${BASE_STYLE}, all five Platonic solids floating in space, each one decorated with different psychedelic patterns — dodecahedron with eyes, icosahedron with waves, tetrahedron with flames, connected by energy lines` },
  { id: '010_geometric_phoenix', prompt: `${BASE_STYLE}, phoenix bird composed entirely of sacred geometry shapes, wings made of overlapping circles and triangles, tail feathers as Fibonacci spirals, geometric flames trailing behind` },
  
  // Cosmic & Space Psychedelia (11-20)
  { id: '011_cosmic_third_eye', prompt: `${BASE_STYLE}, ornate third eye symbol surrounded by cosmic imagery, nebula patterns rendered as intricate dot work and line patterns, planets as detailed mandalas, constellation lines connecting psychedelic star formations` },
  { id: '012_astral_jellyfish', prompt: `${BASE_STYLE}, enormous jellyfish floating through space, tentacles made of flowing psychedelic patterns, body transparent showing internal geometric structures, surrounded by tiny cosmic organisms with intricate detail` },
  { id: '013_moon_phases_mandala', prompt: `${BASE_STYLE}, circular mandala incorporating all moon phases, each phase decorated with different psychedelic fill patterns, surrounded by star constellations, celestial moths, and cosmic flowers` },
  { id: '014_alien_garden', prompt: `${BASE_STYLE}, extraterrestrial garden with impossible plants, fractal flowers that bloom into smaller flowers, alien insects with geometric wing patterns, bioluminescent mushrooms with spiral caps, surreal terrain` },
  { id: '015_sun_and_moon_duality', prompt: `${BASE_STYLE}, yin-yang inspired composition with ornate sun face on one side and detailed moon face on the other, psychedelic rays and waves emanating from each, merging in the center with intricate patterns` },
  { id: '016_nebula_dragon', prompt: `${BASE_STYLE}, serpentine dragon winding through a nebula, body covered in scales that are tiny mandalas, breathing geometric fire, tail dissolving into star dust patterns, cosmic clouds as detailed swirls` },
  { id: '017_saturn_temple', prompt: `${BASE_STYLE}, Saturn's rings reimagined as concentric mandalas, the planet surface covered in alien temple architecture with sacred geometry windows, tiny figures in meditation poses on the rings` },
  { id: '018_cosmic_whale', prompt: `${BASE_STYLE}, massive whale swimming through the cosmos, body covered in constellation patterns, barnacles as tiny geometric crystals, eye reflecting a galaxy, psychedelic waves trailing from its fins` },
  { id: '019_star_gate', prompt: `${BASE_STYLE}, elaborate star gate portal with concentric rings of different patterns — outer ring tribal, middle ring geometric, inner ring organic flowing lines — opening to reveal a fractal dimension beyond` },
  { id: '020_zodiac_wheel', prompt: `${BASE_STYLE}, complete zodiac wheel with each sign as an incredibly detailed psychedelic illustration in its segment, center containing a cosmic eye, outer ring of planetary symbols and moon phases` },
  
  // Nature Meets Psychedelia (21-30)
  { id: '021_psychedelic_tree_of_life', prompt: `${BASE_STYLE}, enormous tree of life with roots forming mandala patterns underground, trunk with bark patterns that are tiny faces, canopy exploding into fractal branches, leaves as individual tiny mandalas, birds and creatures hidden throughout` },
  { id: '022_mushroom_kingdom', prompt: `${BASE_STYLE}, fantastical mushroom forest with dozens of varieties, each cap decorated with different psychedelic patterns — spirals, dots, geometric grids, paisley — caterpillar smoking hookah on largest mushroom, Alice in Wonderland vibes` },
  { id: '023_butterfly_metamorphosis', prompt: `${BASE_STYLE}, giant butterfly with wings containing entire psychedelic ecosystems — one wing has oceanic patterns with waves and fish, other wing has cosmic patterns with stars and planets, body is a chrysalis splitting open to reveal geometric light` },
  { id: '024_underwater_psychedelic', prompt: `${BASE_STYLE}, deep sea scene with psychedelic coral reef, each coral branch a different fractal pattern, bioluminescent fish with geometric markings, octopus with tentacles forming spiral patterns, bubbles containing tiny worlds` },
  { id: '025_flower_power_explosion', prompt: `${BASE_STYLE}, 1960s inspired flower power explosion, dozens of detailed psychedelic flowers of different types, peace signs woven throughout, swirling vines connecting everything, butterflies and bees with ornate wing patterns` },
  { id: '026_spirit_animal_wolf', prompt: `${BASE_STYLE}, wolf howling at moon, entire body filled with different psychedelic patterns in each section — geometric on chest, flowing waves on legs, tribal on face, fractal on tail — moon contains a mandala, sound waves visible as ornate ripples` },
  { id: '027_enchanted_forest', prompt: `${BASE_STYLE}, forest path leading to a glowing portal between two ancient trees, every tree trunk has unique bark patterns — faces, spirals, runes — mushrooms line the path, fireflies rendered as tiny geometric stars, roots forming labyrinth patterns` },
  { id: '028_lotus_awakening', prompt: `${BASE_STYLE}, massive lotus flower opening to reveal layers upon layers of petals, each petal covered in different psychedelic micro-patterns, center containing a meditating figure in fractal geometry, water ripples as concentric mandala rings` },
  { id: '029_psychedelic_ocean', prompt: `${BASE_STYLE}, cross-section of ocean showing above and below water, waves as ornate Japanese-style curves, underwater filled with psychedelic sea creatures, treasure chest spilling geometric gems, giant squid with paisley tentacles` },
  { id: '030_sacred_deer', prompt: `${BASE_STYLE}, majestic stag with antlers that branch into tree limbs bearing mandala fruit, body sections filled with different pattern types — celtic knots, geometric tiles, flowing water patterns — forest backdrop with psychedelic mushrooms` },
  
  // Mind-Bending & Optical (31-40)
  { id: '031_infinite_tunnel', prompt: `${BASE_STYLE}, optical illusion tunnel spiraling inward with alternating pattern bands — checkered, striped, dotted, geometric — creating deep 3D illusion, organic tendrils growing from the tunnel walls, eye at the vanishing point` },
  { id: '032_melting_clock_garden', prompt: `${BASE_STYLE}, Dali-inspired melting clocks draped over psychedelic landscape, each clock face showing different time with ornate numbers, ants marching in geometric formations, desert landscape with fractal cacti` },
  { id: '033_double_exposure_face', prompt: `${BASE_STYLE}, woman's face profile overlaid with psychedelic nature scene — trees forming from hair, birds flying from thoughts, flowers blooming from lips — double exposure style with intricate detail in every element` },
  { id: '034_totem_pole', prompt: `${BASE_STYLE}, towering psychedelic totem pole with stacked animal faces — eagle, bear, wolf, owl, snake — each face decorated with different tribal and geometric patterns, totemic wings spreading wide with feather detail` },
  { id: '035_hand_of_creation', prompt: `${BASE_STYLE}, ornate hand reaching upward with each finger containing different elemental energy — fire spirals, water waves, earth crystals, air swirls, spirit geometry — palm containing an eye mandala, henna-style patterns covering the hand` },
  { id: '036_labyrinth_mind', prompt: `${BASE_STYLE}, brain-shaped labyrinth viewed from above, pathways decorated with different psychedelic patterns in each region, tiny figures navigating the maze, center containing a blooming lotus, neural connections as decorative lines` },
  { id: '037_optical_sphere', prompt: `${BASE_STYLE}, Escher-inspired reflective sphere showing warped room interior, the room filled with impossible objects and psychedelic patterns, hand holding the sphere visible with geometric sleeve tattoo detail` },
  { id: '038_fractal_peacock', prompt: `${BASE_STYLE}, peacock with tail fully displayed, each tail feather eye is a different mandala pattern, body covered in scale-like geometric tiles, crown of intricate feather spirals, standing on ornate paisley ground` },
  { id: '039_vortex_mandala', prompt: `${BASE_STYLE}, mandala being sucked into central vortex, outer elements fully formed and detailed, elements closer to center stretching and distorting into the spiral, creating powerful sense of movement and depth, geometric debris spiraling` },
  { id: '040_mirror_dimensions', prompt: `${BASE_STYLE}, ornate hand mirror reflecting a completely different psychedelic dimension, real world side decorated with art nouveau patterns, mirror side showing alien geometric landscape, frame decorated with tiny skulls and roses` },
  
  // Cultural & Mystical (41-50)
  { id: '041_chakra_alignment', prompt: `${BASE_STYLE}, human figure in meditation pose with all seven chakras elaborately detailed as individual mandalas, energy channels connecting them as ornate flowing lines, aura rendered as layers of different psychedelic patterns, lotus base` },
  { id: '042_day_of_dead_skull', prompt: `${BASE_STYLE}, ornate Day of the Dead sugar skull with incredibly detailed floral and geometric patterns, marigold flowers surrounding it, candles with decorative flames, spider webs with geometric patterns, butterflies and hearts` },
  { id: '043_hamsa_protection', prompt: `${BASE_STYLE}, elaborate Hamsa hand symbol with eye in center, decorated with multiple layers of patterns — geometric, floral, tribal, paisley — fingers each containing different detailed motifs, surrounded by protective symbols and tiny flowers` },
  { id: '044_celtic_tree_knot', prompt: `${BASE_STYLE}, Celtic tree of life with trunk and branches forming elaborate interlocking knotwork, roots mirroring branches below, four seasonal quadrants with different pattern fills, border of Celtic chain patterns` },
  { id: '045_egyptian_psychedelic', prompt: `${BASE_STYLE}, Eye of Horus reimagined with psychedelic sacred geometry, pyramids with fractal surfaces, scarab beetle with mandala wings, hieroglyphic border but each symbol is an intricate psychedelic mini-design, ankh symbols with ornate detail` },
  { id: '046_dreamcatcher_cosmos', prompt: `${BASE_STYLE}, enormous dreamcatcher with web made of sacred geometry, center containing a cosmic portal with stars and planets, feathers hanging down each decorated with different tribal patterns, beads as tiny skulls and crystals` },
  { id: '047_japanese_wave_dragon', prompt: `${BASE_STYLE}, Hokusai great wave reimagined with psychedelic dragon emerging from the water, wave foam as fractal spirals, dragon scales as geometric tiles, Mt Fuji in background with mandala sun, cherry blossoms as tiny star patterns` },
  { id: '048_shaman_journey', prompt: `${BASE_STYLE}, shamanic figure with elaborate headdress of antlers, feathers, and crystals, surrounded by spirit animals rendered in geometric style, ayahuasca vine patterns flowing around, portal opening behind showing fractal dimension, drums with tribal patterns` },
  { id: '049_tarot_world', prompt: `${BASE_STYLE}, The World tarot card reimagined psychedelic style, dancing figure in center of cosmic mandala, four corner creatures — eagle, bull, lion, angel — each filled with different intricate patterns, wreath of laurel made of tiny geometric shapes, starfield background` },
  { id: '050_ouroboros_infinity', prompt: `${BASE_STYLE}, snake eating its own tail (ouroboros) forming a figure-eight infinity symbol, snake body covered in alchemical symbols and geometric patterns, interior of each loop containing different scene — one cosmic, one earthly — center point is a detailed eye mandala` },
];

function saveProgress() {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

let doneCount = Object.values(progress).filter(p => p.status === 'done').length;
let failCount = 0;
let consecutiveFails = 0;

console.log(`🎨 Panini Pano — Psychedelic/Trippy Coloring Page Generator`);
console.log(`${'='.repeat(60)}`);
console.log(`📊 ${doneCount > 0 ? `Resuming — ${doneCount}/50 pages already done` : 'Starting fresh — 50 pages to generate'}\n`);

for (const page of PAGES) {
  if (progress[page.id]?.status === 'done') {
    console.log(`  ✅ Skipping (done): ${page.id}`);
    continue;
  }

  console.log(`  🎨 Generating: ${page.id}`);
  console.log(`     ${page.prompt.slice(0, 100)}...`);

  try {
    const result = await ai.models.generateImages({
      model: 'imagen-4.0-generate-001',
      prompt: page.prompt,
      config: {
        numberOfImages: 1,
        outputMimeType: 'image/png',
      },
    });

    if (!result.generatedImages?.[0]?.image?.imageBytes) {
      throw new Error('No image data in response');
    }

    const imageBytes = result.generatedImages[0].image.imageBytes;
    const buffer = Buffer.from(imageBytes, 'base64');
    const outPath = path.join(OUTPUT_DIR, `${page.id}.png`);
    fs.writeFileSync(outPath, buffer);

    progress[page.id] = { status: 'done', path: outPath };
    saveProgress();
    doneCount++;
    consecutiveFails = 0;

    console.log(`  ✅ Saved: ${page.id} (${(buffer.length / 1024).toFixed(0)}KB) [${doneCount}/50]`);

    // Small delay to be gentle on API
    await new Promise(r => setTimeout(r, 2000));

  } catch (err) {
    const errMsg = err.message || String(err);
    console.error(`  ❌ Failed: ${page.id} — ${errMsg}`);
    progress[page.id] = { status: 'failed', error: errMsg };
    saveProgress();
    failCount++;
    consecutiveFails++;

    if (errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED')) {
      console.log(`\n🚫 RATE LIMIT — stopping (${doneCount} done, ${failCount} failed)`);
      process.exit(2);
    }

    if (consecutiveFails >= 3) {
      console.log(`\n🛑 3+ consecutive failures — stopping per AGENTS.md rule`);
      console.log(`   Done: ${doneCount}/50, Failed: ${failCount}`);
      process.exit(3);
    }
  }
}

console.log(`\n✅ ALL DONE — ${doneCount}/50 pages generated`);
console.log(`📁 Output: ${OUTPUT_DIR}`);
