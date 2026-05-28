/**
 * Generate missing book promo videos (30s each, 2 clips per book)
 * + New toddler video using real pages
 * Uses Veo 3.1 via Gemini API
 */
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || fs.readFileSync('C:\\Users\\D\\Desktop\\dprosjekt\\dennisproject\\.env', 'utf-8').match(/GOOGLE_API_KEY=(.+)/)?.[1];
const OUTPUT_DIR = 'C:\\Users\\D\\Desktop\\panini-pano-website\\images\\generated\\video\\book-promos';
const PROGRESS_FILE = path.join(OUTPUT_DIR, 'promo-progress.json');

const ai = new GoogleGenAI({ apiKey: GOOGLE_API_KEY });

let progress = {};
if (fs.existsSync(PROGRESS_FILE)) {
  progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
}

function saveProgress() {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

// Reference images from actual book pages
const BOOKS = [
  {
    id: 'toddler_v2',
    name: 'Toddler Baby Learning (Real Pages)',
    refImage: 'C:\\Users\\D\\Desktop\\panini-pano-website\\Coloring books\\Toddler Book 1\\black_and_white_kids__coloring_1768475332685.jpg',
    clips: [
      { id: 'toddler_v2_clip1', prompt: 'Close-up of a small child\'s hand holding a chunky crayon, coloring a simple bold-outlined animal on a coloring book page, bright primary crayons scattered on a sunny kitchen table, warm morning light, cheerful and wholesome atmosphere, shallow depth of field, 4K' },
      { id: 'toddler_v2_clip2', prompt: 'Overhead timelapse of a toddler coloring book page being filled in with bright rainbow colors — a simple elephant shape going from black outlines to vibrant blues and greens, tiny fingers gripping a thick crayon, colorful stickers and crayons around the page, warm playful atmosphere' }
    ],
    outputName: 'toddler_baby_learning_v2_30sec.mp4'
  },
  {
    id: 'gs_vol2_symbols',
    name: 'Goodbye Stress Vol 2 - Positive Symbols',
    refImage: 'C:\\Users\\D\\Desktop\\panini-pano-website\\Coloring books\\Book 2 - Positive Symbols and Cozy Object\\v1 Heart shape surrounded by flowers.png',
    clips: [
      { id: 'gs_vol2_clip1', prompt: 'Macro close-up of a fine-tip colored pencil carefully filling in a heart shape surrounded by delicate flowers on a coloring book page, soft pastel colors — pink, lavender, mint — paper texture visible, cozy blanket in background, warm lamp light, ASMR-quality satisfying detail, 4K cinematic' },
      { id: 'gs_vol2_clip2', prompt: 'Overhead shot slowly pulling back to reveal a beautifully colored page of positive symbols — hearts, stars, rainbows, cozy mugs, candles — half completed in soft watercolor-style pastels, half still black line art, surrounded by colored pencils on a clean white desk, afternoon sunlight' }
    ],
    outputName: 'goodbye_stress_vol2_symbols_30sec.mp4'
  },
  {
    id: 'gs_vol3_mandalas',
    name: 'Goodbye Stress Vol 3 - Mandalas & Abstract',
    refImage: 'C:\\Users\\D\\Desktop\\panini-pano-website\\Coloring books\\Book 3 - Goodbye Stress Mandalas and Abstract Patterns\\1. v1 Simple floral mandala with symmetry.png',
    clips: [
      { id: 'gs_vol3_clip1', prompt: 'Extreme macro of a sharp colored pencil tip tracing the intricate symmetrical lines of a mandala pattern on white paper, each stroke precise and meditative, the pencil moving slowly along curved geometric shapes, deep jewel-tone purple ink flowing into paper grain, soft ambient lighting, deeply satisfying ASMR quality' },
      { id: 'gs_vol3_clip2', prompt: 'Timelapse overhead view of a complex mandala coloring page being gradually filled from center outward — inner petals in deep blue transitioning to turquoise then gold at the outer rings, creating a stunning gradient effect, the page transforming from black and white to vibrant art, peaceful atmosphere' }
    ],
    outputName: 'goodbye_stress_vol3_mandalas_30sec.mp4'
  },
  {
    id: 'ar_vol3_optical',
    name: 'Adult Relaxation Vol 3 - Optical Illusions',
    refImage: 'C:\\Users\\D\\Desktop\\panini-pano-website\\Coloring books\\Adult relaxation book 3 - optical illusions\\abstract_wave_universe_hypnoti_1767454401202.jpg',
    clips: [
      { id: 'ar_vol3_clip1', prompt: 'Close-up of hands carefully coloring an optical illusion pattern — alternating black and white geometric shapes that seem to move and pulse, using contrasting colors that enhance the 3D illusion effect, metallic silver and electric blue gel pens on white paper, mesmerizing and hypnotic, precision coloring, 4K' },
      { id: 'ar_vol3_clip2', prompt: 'Overhead timelapse of an impossible geometry coloring page being brought to life — Escher-like staircases and corridors colored in gradient purples and teals that make the illusion pop off the page, the flat drawing appearing to gain real depth as colors are added, mind-bending transformation' }
    ],
    outputName: 'relaxation_vol3_optical_30sec.mp4'
  },
  {
    id: 'ar_vol4_creative',
    name: 'Adult Relaxation Vol 4 - Creative Escape',
    refImage: 'C:\\Users\\D\\Desktop\\panini-pano-website\\Coloring books\\Adult relaxation book 4 - Creative Escape\\prompt_001_black_line_art_illustration_of_1765813628239.jpg',
    clips: [
      { id: 'ar_vol4_clip1', prompt: 'Close-up of an artist coloring an imaginative fantasy landscape on a coloring book page — a winding path through impossible architecture with floating islands and dream-like trees, using rich warm earth tones and sunset oranges, detailed brushwork with fine markers, creative and whimsical atmosphere, 4K' },
      { id: 'ar_vol4_clip2', prompt: 'Overhead shot of a creative escape coloring page being colored with watercolor pencils — fantastical buildings and surreal gardens, a wet brush activating the dry pencil strokes into smooth watercolor washes, the transformation from scratchy texture to fluid color is deeply satisfying, artistic and dreamy' }
    ],
    outputName: 'relaxation_vol4_creative_escape_30sec.mp4'
  },
  {
    id: 'ar_vol5_mindful',
    name: 'Adult Relaxation Vol 5 - Mindful Journey',
    refImage: 'C:\\Users\\D\\Desktop\\panini-pano-website\\Coloring books\\Adult Relaxation vol 5 - Mindful Journey\\a_circular_labyrinth_spiraling_1767383232049.jpg',
    clips: [
      { id: 'ar_vol5_clip1', prompt: 'Macro close-up of a hand holding a fine brush pen tracing the spiraling path of a labyrinth coloring page, ink flowing smoothly in one continuous meditative line, the pen following the curves with slow deliberate movements, soft focus background showing a steaming tea cup and candle, mindfulness atmosphere, 4K' },
      { id: 'ar_vol5_clip2', prompt: 'Overhead timelapse of a mindful journey coloring page — a circular mandala labyrinth being colored from outer edge inward with gradient blues fading to gold at the center, representing a journey to inner peace, each ring a different shade, the completed center glowing with warm amber, serene and calming' }
    ],
    outputName: 'relaxation_vol5_mindful_journey_30sec.mp4'
  }
];

let consecutiveFails = 0;

async function generateClip(clipId, prompt, refImagePath) {
  console.log(`  🎬 Generating: ${clipId}`);
  console.log(`     ${prompt.slice(0, 100)}...`);

  // Load reference image
  let imageBase64 = null;
  if (refImagePath && fs.existsSync(refImagePath)) {
    imageBase64 = fs.readFileSync(refImagePath).toString('base64');
  }

  const request = {
    model: 'veo-3.1-generate-preview',
    prompt: prompt,
    config: { numberOfVideos: 1, durationSeconds: 8, aspectRatio: '9:16' }
  };

  if (imageBase64) {
    request.image = { imageBytes: imageBase64, mimeType: 'image/jpeg' };
  }

  const response = await ai.models.generateVideos(request);

  // Poll for completion
  let opName = response.name || response.operationName;
  if (!opName && response.operation) opName = response.operation.name;

  console.log(`     Operation: ${opName}`);
  progress[clipId] = { operationName: opName, done: false };
  saveProgress();

  // Poll via REST
  let attempts = 0;
  while (attempts < 60) {
    await new Promise(r => setTimeout(r, 10000)); // 10s poll interval
    attempts++;

    const pollUrl = `https://generativelanguage.googleapis.com/v1beta/${opName}`;
    const pollRes = await fetch(pollUrl, { headers: { 'x-goog-api-key': GOOGLE_API_KEY } });
    const pollData = await pollRes.json();

    if (pollData.done) {
      const videoUri = pollData.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
      if (!videoUri) throw new Error('No video URI in response');

      // Download
      const dlRes = await fetch(`${videoUri}&key=${GOOGLE_API_KEY}`);
      const buffer = Buffer.from(await dlRes.arrayBuffer());
      const outPath = path.join(OUTPUT_DIR, `${clipId}.mp4`);
      fs.writeFileSync(outPath, buffer);

      progress[clipId] = { done: true, path: outPath };
      saveProgress();
      console.log(`  ✅ Saved: ${clipId} (${(buffer.length / 1024 / 1024).toFixed(1)}MB)`);
      return outPath;
    }

    if (pollData.error) {
      throw new Error(JSON.stringify(pollData.error));
    }

    process.stdout.write('.');
  }

  throw new Error('Timeout after 10 minutes of polling');
}

async function assembleVideo(clips, outputName) {
  const { execSync } = await import('child_process');
  const listFile = path.join(OUTPUT_DIR, `${outputName}_list.txt`);
  const listContent = clips.map(c => `file '${path.basename(c)}'`).join('\n');
  fs.writeFileSync(listFile, listContent);

  const outPath = path.join(OUTPUT_DIR, outputName);
  execSync(`ffmpeg -y -f concat -safe 0 -i "${listFile}" -c:v libx264 -preset slow -crf 23 -pix_fmt yuv420p "${outPath}"`, { cwd: OUTPUT_DIR, stdio: 'pipe' });
  console.log(`  🎬 Assembled: ${outputName}`);
  return outPath;
}

console.log('🎬 Panini Pano — Missing Book Promo Generator');
console.log('='.repeat(55));

for (const book of BOOKS) {
  console.log(`\n📹 ${book.name}`);

  const clipPaths = [];
  let allDone = true;

  for (const clip of book.clips) {
    if (progress[clip.id]?.done && progress[clip.id]?.path && fs.existsSync(progress[clip.id].path)) {
      console.log(`  ✅ Skipping (done): ${clip.id}`);
      clipPaths.push(progress[clip.id].path);
      continue;
    }

    allDone = false;
    try {
      const clipPath = await generateClip(clip.id, clip.prompt, book.refImage);
      clipPaths.push(clipPath);
      consecutiveFails = 0;
    } catch (err) {
      const errMsg = err.message || String(err);
      console.error(`  ❌ Failed: ${clip.id} — ${errMsg}`);
      progress[clip.id] = { done: false, error: errMsg };
      saveProgress();
      consecutiveFails++;

      if (errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED')) {
        console.log('\n🚫 RATE LIMIT — stopping');
        process.exit(2);
      }
      if (consecutiveFails >= 3) {
        console.log('\n🛑 3+ consecutive failures — stopping');
        process.exit(3);
      }
      break;
    }
  }

  // Assemble if both clips done
  if (clipPaths.length === 2) {
    try {
      await assembleVideo(clipPaths, book.outputName);
    } catch (err) {
      console.error(`  ❌ Assembly failed: ${err.message}`);
    }
  }
}

console.log('\n✅ DONE');
