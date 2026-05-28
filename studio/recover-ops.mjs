/**
 * Recover results from already-started Veo operations
 */
import { GoogleGenAI } from '@google/genai';
import fs from 'fs';
import path from 'path';

const GOOGLE_API_KEY = 'AIzaSyC_qH7WX3DNa7ziM4bGExDl-BlPvsypMGM';
const OUTPUT_DIR = 'C:\\Users\\D\\Desktop\\panini-pano-website\\videos\\tiktok\\timelapse';

const ai = new GoogleGenAI({ apiKey: GOOGLE_API_KEY });

// Operations that were started
const PENDING_OPS = [
  { id: 'video1-botanicals_v1c1', operationName: 'models/veo-3.1-generate-preview/operations/ircut42lqr2y' },
  { id: 'video1-botanicals_v1c2', operationName: 'models/veo-3.1-generate-preview/operations/ykcfo5cqw1r9' },
  { id: 'video1-botanicals_v1c3', operationName: 'models/veo-3.1-generate-preview/operations/65x2shxl8ky6' },
];

const progressFile = path.join(OUTPUT_DIR, 'progress.json');
let progress = {};
if (fs.existsSync(progressFile)) {
  progress = JSON.parse(fs.readFileSync(progressFile, 'utf8'));
}

async function recoverOperation(item) {
  const outputPath = path.join(OUTPUT_DIR, `${item.id}.mp4`);
  
  if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 10000) {
    console.log(`✅ Already exists: ${item.id}`);
    progress[item.id] = { status: 'done', path: outputPath };
    return;
  }

  console.log(`\n🔄 Recovering: ${item.id}`);
  console.log(`   Operation: ${item.operationName}`);
  
  try {
    let operation = { name: item.operationName, done: false };
    
    // Save as pending so generate-clips.mjs can resume it
    progress[item.id] = { status: 'pending', operationName: item.operationName };
    fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2));
    
    let attempts = 0;
    while (!operation.done && attempts < 72) {
      operation = await ai.operations.getVideosOperation({ operation });
      if (operation.done) break;
      await new Promise(r => setTimeout(r, 10000));
      attempts++;
      process.stdout.write(`\r   ⏳ Polling... ${attempts * 10}s`);
    }
    console.log('');

    if (!operation.done) {
      console.log(`   ⏰ Timed out — leaving as pending for main script`);
      return;
    }

    if (operation.error) {
      console.log(`   ❌ API error: ${JSON.stringify(operation.error)}`);
      progress[item.id] = { status: 'failed', error: JSON.stringify(operation.error) };
      fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2));
      return;
    }

    const generatedVideos = operation.response?.generatedVideos;
    if (!generatedVideos?.length) {
      console.log(`   ❌ No videos in response`);
      progress[item.id] = { status: 'failed', error: 'no videos in response' };
      fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2));
      return;
    }

    const video = generatedVideos[0].video;
    let saved = false;

    if (video?.uri) {
      console.log(`   📥 Downloading...`);
      const resp = await fetch(video.uri);
      if (resp.ok) {
        const buf = Buffer.from(await resp.arrayBuffer());
        fs.writeFileSync(outputPath, buf);
        console.log(`   ✅ Saved: ${path.basename(outputPath)} (${(buf.length/1024/1024).toFixed(1)}MB)`);
        saved = true;
      } else {
        console.log(`   ⚠️  Download failed (${resp.status}), trying with auth...`);
        const resp2 = await fetch(video.uri, { headers: { Authorization: `Bearer ${GOOGLE_API_KEY}` } });
        if (resp2.ok) {
          const buf = Buffer.from(await resp2.arrayBuffer());
          fs.writeFileSync(outputPath, buf);
          console.log(`   ✅ Saved with auth: ${path.basename(outputPath)} (${(buf.length/1024/1024).toFixed(1)}MB)`);
          saved = true;
        }
      }
    } else if (video?.videoBytes) {
      const buf = Buffer.from(video.videoBytes, 'base64');
      fs.writeFileSync(outputPath, buf);
      console.log(`   ✅ Saved from bytes: ${path.basename(outputPath)} (${(buf.length/1024/1024).toFixed(1)}MB)`);
      saved = true;
    }

    if (saved) {
      progress[item.id] = { status: 'done', path: outputPath };
    } else {
      progress[item.id] = { status: 'failed', error: 'could not save video' };
    }
    fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2));

  } catch (err) {
    console.error(`   ❌ Error: ${err.message}`);
    progress[item.id] = { status: 'failed', error: err.message };
    fs.writeFileSync(progressFile, JSON.stringify(progress, null, 2));
  }
}

async function main() {
  console.log('🔄 Panini Pano — Operation Recovery');
  console.log('='.repeat(40));
  
  for (const op of PENDING_OPS) {
    await recoverOperation(op);
  }

  const done = Object.values(progress).filter(p => p.status === 'done').length;
  console.log(`\n✅ Recovery complete. ${done} clips ready.`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
