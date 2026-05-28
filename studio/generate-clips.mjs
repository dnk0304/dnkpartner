/**
 * Veo 3.1 TikTok Timelapse Clip Generator — Panini Pano
 * Uses REST API for polling (more reliable than SDK for operation resume)
 */

import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';

const GOOGLE_API_KEY = 'AIzaSyC_qH7WX3DNa7ziM4bGExDl-BlPvsypMGM';
const OUTPUT_DIR = 'C:\\Users\\D\\Desktop\\panini-pano-website\\videos\\tiktok\\timelapse';
const PROGRESS_FILE = path.join(OUTPUT_DIR, 'progress.json');

const ai = new GoogleGenAI({ apiKey: GOOGLE_API_KEY });

const REF_IMAGES = {
  botanicals: 'C:\\Users\\D\\Desktop\\panini-pano-website\\images\\pdf-ready\\bot-dark-botanicals\\014_black_rose_thorns.png',
  wineSwear: 'C:\\Users\\D\\Desktop\\panini-pano-website\\images\\pdf-ready\\swe-wine-swear\\013_wine_book_club.png',
  cottage: 'C:\\Users\\D\\Desktop\\panini-pano-website\\images\\pdf-ready\\bot-cottage-garden\\013_hollyhock_wall.png',
};

const VIDEOS = [
  {
    id: 'video1-botanicals',
    name: 'Dark Botanicals — Midnight Bloom',
    branding: 'The Quiet Hours',
    refImageKey: 'botanicals',
    clips: [
      { id: 'v1c1', prompt: 'Extreme macro close-up of a sharp graphite pencil tip touching white textured watercolor paper, the first stroke of a dark botanical illustration begins, individual paper fibers visible, soft warm lamplight casting a long pencil shadow, shallow depth of field, ASMR satisfying quality, 4K cinematic, slow deliberate movement' },
      { id: 'v1c2', prompt: 'Close-up overhead shot of a hand holding a fine-tip black pen carefully outlining intricate mushroom gills on a coloring book page, ink flowing smoothly into the paper grain, surrounding completed botanical flowers visible slightly out of focus, warm amber desk lamp, slow deliberate movements' },
      { id: 'v1c3', prompt: 'Macro close-up of colored pencils being layered onto a dark botanical flower illustration, first a base of deep burgundy, then overlapping strokes of crimson and black, paper texture absorbing pigment, pencil shavings scattered nearby, cozy evening atmosphere, warm soft lighting' },
      { id: 'v1c4', prompt: 'Overhead shot slowly pulling back to reveal a full coloring page of an elaborate dark botanical garden scene being colored, half completed in rich jewel tones emerald sapphire ruby, half still black line art, scattered colored pencils on a wooden desk, warm lamplight' },
      { id: 'v1c5', prompt: 'Close-up of fingers gently blending colored pencil on paper using a blending stump, smooth gradient appearing on a botanical leaf from dark forest green to bright chartreuse, paper texture softening under pressure, deeply satisfying detail, warm golden light' },
      { id: 'v1c6', prompt: 'Wide pull-back shot: the completed dark botanical coloring page sits on a rustic wooden desk, a steaming cup of tea beside it, fairy lights blurred in background, the artwork rich with deep jewel-tone colors, peaceful cozy evening atmosphere' },
    ],
  },
  {
    id: 'video2-wineswear',
    name: 'Wine Swear — Sip & Color',
    branding: 'Grab a Bite of Calm',
    refImageKey: 'wineSwear',
    clips: [
      { id: 'v2c1', prompt: "Macro shot of a thick cream paper coloring page with bold decorative text design, a glass of red wine casting a warm ruby shadow across the page, a hand with burgundy nails picks up a bright pink gel pen, shallow focus, warm golden hour light through a window" },
      { id: 'v2c2', prompt: 'Close-up from the side: a gel pen tip gliding along the inside of a chunky block letter filling it with hot pink ink, each stroke leaving satisfying wet trails that dry to a matte finish, decorative vine patterns surround the letter, ASMR-quality detail, slow movement' },
      { id: 'v2c3', prompt: 'Overhead close-up: a decorative coloring page going from 30% to 70% colored, hands switching between multiple colored markers coral teal gold lavender, each section a different vibrant color, wine glass slowly emptying in corner of frame, natural evening light' },
      { id: 'v2c4', prompt: 'Extreme close-up of metallic gold gel pen adding tiny dot details along decorative vine borders of a colorful page, each dot catching the light and sparkling, surrounding colored areas rich with layered hues, deeply meditative slow pace, warm lamplight' },
      { id: 'v2c5', prompt: 'Close-up of a colorful decorated page being held up at a slight angle to the camera, vibrant multicolor letters surrounded by delicate floral borders, light catching metallic accents, fingers gently holding the page edges, warm afternoon light' },
      { id: 'v2c6', prompt: 'Wide shot: person relaxing in a cozy armchair, completed colorful coloring page on a side table next to an empty wine glass and scattered markers, warm string lights, relaxed calm atmosphere, evening golden hour, peaceful and content' },
    ],
  },
  {
    id: 'video3-cottage',
    name: 'Cottage Garden — Sunday Morning',
    branding: 'Your Permission Slip',
    refImageKey: 'cottage',
    clips: [
      { id: 'v3c1', prompt: 'Macro top-down view: sunlight streaming through a window onto a fresh white coloring book page showing intricate cottage garden with roses and a garden gate, pristine Prismacolor pencils arranged in a rainbow arc beside the page, morning coffee steam drifting across frame' },
      { id: 'v3c2', prompt: 'Close-up of a hand selecting a soft peach colored pencil from a rainbow arrangement, bringing it to the page and beginning to fill a delicate rose petal with light feathery strokes, each stroke following the petal curve, paper grain visible, warm natural morning light' },
      { id: 'v3c3', prompt: 'Overhead close-up of a cottage garden coloring page being brought to life, roses blushing from white to pink to deep coral, leaves transforming into rich greens, a garden gate gaining a weathered blue-grey patina, satisfying color progression, warm daylight' },
      { id: 'v3c4', prompt: 'Extreme close-up of a small brush dipped in water touching dry colored pencil strokes on a floral page, instantly blooming the pigment into smooth watercolor, the transformation from dry texture to fluid soft color is deeply satisfying, slow motion, beautiful detail' },
      { id: 'v3c5', prompt: 'Side angle close-up panning slowly across a nearly completed cottage garden coloring page, following the garden path from gate through rose archway to a tiny cottage in the background, every flower rendered in detailed graduated color, warm natural light' },
      { id: 'v3c6', prompt: 'Wide shot: finished cottage garden coloring page being carefully placed into a simple white frame, hands adjusting it on a sunlit windowsill next to a small potted plant, the illustration now a piece of art, warm morning sunlight, peaceful proud atmosphere' },
    ],
  },
];

function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  }
  return {};
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

function loadImageBase64(imagePath) {
  try {
    return fs.readFileSync(imagePath).toString('base64');
  } catch (e) {
    return null;
  }
}

async function pollOperationREST(operationName) {
  const url = `https://generativelanguage.googleapis.com/v1beta/${operationName}`;
  const resp = await fetch(url, { headers: { 'x-goog-api-key': GOOGLE_API_KEY } });
  if (!resp.ok) throw new Error(`Poll request failed: ${resp.status}`);
  return resp.json();
}

async function downloadVideo(uri, outputPath) {
  const downloadUrl = uri.includes('?')
    ? `${uri}&key=${GOOGLE_API_KEY}`
    : `${uri}?key=${GOOGLE_API_KEY}`;
  const resp = await fetch(downloadUrl);
  if (!resp.ok) throw new Error(`Download failed: ${resp.status} ${resp.statusText}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  fs.writeFileSync(outputPath, buf);
  return buf.length;
}

async function generateClip(clip, imageBase64, videoId, progress) {
  const key = `${videoId}_${clip.id}`;
  const outputPath = path.join(OUTPUT_DIR, `${key}.mp4`);

  // Already done
  if (progress[key]?.status === 'done') {
    console.log(`  ✅ Skipping (done): ${clip.id}`);
    return { success: true, skipped: true };
  }

  // File already exists
  if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 10000) {
    console.log(`  ✅ File exists: ${clip.id}`);
    progress[key] = { status: 'done', path: outputPath };
    saveProgress(progress);
    return { success: true, skipped: true };
  }

  console.log(`  🎬 Generating: ${clip.id}`);
  console.log(`     ${clip.prompt.substring(0, 100)}...`);

  try {
    let operationName = null;

    // Resume pending operation if available
    if (progress[key]?.status === 'pending' && progress[key]?.operationName) {
      console.log(`  🔄 Resuming: ${progress[key].operationName}`);
      operationName = progress[key].operationName;
    } else {
      // Start new generation
      const params = {
        model: 'veo-3.1-generate-preview',
        prompt: clip.prompt,
        config: { aspectRatio: '9:16', durationSeconds: 8, numberOfVideos: 1 },
      };
      if (imageBase64) {
        params.image = { imageBytes: imageBase64, mimeType: 'image/png' };
      }
      const operation = await ai.models.generateVideos(params);
      operationName = operation.name;
      console.log(`     ⏳ Started: ${operationName}`);
    }

    // Save as pending
    progress[key] = { status: 'pending', operationName };
    saveProgress(progress);

    // Poll via REST until done (max 12 min)
    let pollData = null;
    for (let i = 0; i < 72; i++) {
      await new Promise(r => setTimeout(r, 10000));
      process.stdout.write(`\r     ⏳ Polling... ${(i + 1) * 10}s`);
      pollData = await pollOperationREST(operationName);
      if (pollData.done) break;
    }
    console.log('');

    if (!pollData || !pollData.done) {
      throw new Error('Timed out after 12 minutes');
    }

    if (pollData.error) {
      throw new Error(`API error: ${JSON.stringify(pollData.error)}`);
    }

    // Extract video URI
    const samples = pollData.response?.generateVideoResponse?.generatedSamples;
    if (!samples || samples.length === 0) {
      throw new Error('No generated samples in response');
    }
    const videoUri = samples[0].video?.uri;
    const videoBytes = samples[0].video?.videoBytes;

    if (videoUri) {
      const bytes = await downloadVideo(videoUri, outputPath);
      console.log(`  ✅ Saved: ${path.basename(outputPath)} (${(bytes/1024/1024).toFixed(1)}MB)`);
    } else if (videoBytes) {
      const buf = Buffer.from(videoBytes, 'base64');
      fs.writeFileSync(outputPath, buf);
      console.log(`  ✅ Saved: ${path.basename(outputPath)} (${(buf.length/1024/1024).toFixed(1)}MB)`);
    } else {
      throw new Error('No video URI or bytes');
    }

    progress[key] = { status: 'done', path: outputPath };
    saveProgress(progress);
    return { success: true, path: outputPath };

  } catch (err) {
    const errMsg = err.message || String(err);
    console.error(`\n  ❌ Failed: ${clip.id} — ${errMsg}`);
    progress[key] = { status: 'failed', error: errMsg };
    saveProgress(progress);
    return { success: false, error: errMsg };
  }
}

async function main() {
  console.log('🎬 Panini Pano — Veo 3.1 Clip Generator');
  console.log('='.repeat(50));

  const progress = loadProgress();
  const doneCount = Object.values(progress).filter(p => p.status === 'done').length;
  if (doneCount > 0) console.log(`📊 Resuming — ${doneCount}/18 clips already done\n`);

  let consecutiveErrors = 0;
  let newlyGenerated = 0;
  let failed = 0;

  for (const video of VIDEOS) {
    console.log(`\n📹 ${video.name} (${video.branding})`);
    console.log('-'.repeat(50));

    const imageBase64 = loadImageBase64(REF_IMAGES[video.refImageKey]);
    console.log(`   Reference: ${imageBase64 ? '✅ loaded' : '⚠️ not found'}`);

    for (const clip of video.clips) {
      const result = await generateClip(clip, imageBase64, video.id, progress);

      if (result.success) {
        consecutiveErrors = 0;
        if (!result.skipped) newlyGenerated++;
      } else {
        consecutiveErrors++;
        failed++;

        const isRateLimit = result.error?.match(/429|quota|rate.limit|resource.exhausted/i);
        if (isRateLimit) {
          console.log(`\n🚫 RATE LIMIT — stopping (${newlyGenerated} new clips, ${failed} failed)`);
          process.exit(2);
        }

        if (consecutiveErrors >= 3) {
          console.log(`\n⛔ ${consecutiveErrors} consecutive failures — stopping per AGENTS.md rule`);
          console.log(`Generated: ${newlyGenerated} new, Failed: ${failed}`);
          process.exit(1);
        }
      }

      await new Promise(r => setTimeout(r, 2000));
    }
  }

  const totalDone = Object.values(progress).filter(p => p.status === 'done').length;
  console.log(`\n${'='.repeat(50)}`);
  console.log(`🏁 Complete! New: ${newlyGenerated}, Failed: ${failed}, Total: ${totalDone}/18`);
}

main().catch(err => {
  console.error('\n💥 Fatal:', err);
  process.exit(1);
});
