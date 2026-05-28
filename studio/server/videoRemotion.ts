import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = express.Router();

// Dynamic imports for Remotion (only load when actually rendering)
async function getRemotionRenderer() {
  try {
    const { bundle } = await import('@remotion/bundler');
    const { renderMedia, selectComposition } = await import('@remotion/renderer');
    return { bundle, renderMedia, selectComposition };
  } catch (err: any) {
    throw new Error(`Remotion not available: ${err.message}. Run: npm install remotion @remotion/renderer @remotion/bundler @remotion/transitions --legacy-peer-deps`);
  }
}

interface ClipInput {
  path: string;
  trimStart: number;
  trimEnd: number;
  transition: 'cut' | 'crossfade' | 'wipe-left' | 'wipe-right' | 'slide';
  transitionDuration?: number;
  textOverlays?: Array<{
    text: string;
    fontSize: number;
    color: string;
    x: number;
    y: number;
    startTime: number;
    duration: number;
  }>;
}

interface RenderRequest {
  clips: ClipInput[];
  musicPath?: string | null;
  brandingTheme?: string;
  brandingEnabled?: boolean;
  textOverlays?: any[];
  aspectRatio?: '16:9' | '9:16' | '1:1';
}

// POST /api/video/render-remotion
router.post('/render-remotion', async (req, res) => {
  const {
    clips = [],
    musicPath = null,
    brandingTheme = 'QuietHours',
    brandingEnabled = true,
    textOverlays = [],
    aspectRatio = '9:16',
  } = req.body as RenderRequest;

  if (!clips || clips.length === 0) {
    return res.status(400).json({ success: false, error: 'No clips provided' });
  }

  const jobId = uuidv4();
  const outputDir = path.join(__dirname, '..', 'outputs');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `${jobId}.mp4`);

  console.log(`[Remotion] Starting render job ${jobId}`);
  console.log(`[Remotion] Clips: ${clips.length}, Branding: ${brandingEnabled ? brandingTheme : 'off'}, Aspect: ${aspectRatio}`);

  try {
    const { bundle, renderMedia, selectComposition } = await getRemotionRenderer();

    // Bundle the Remotion entry point
    const entryPoint = path.resolve(__dirname, '..', 'src', 'remotion', 'index.tsx');
    if (!fs.existsSync(entryPoint)) {
      throw new Error(`Remotion entry point not found at: ${entryPoint}`);
    }

    console.log(`[Remotion] Bundling from ${entryPoint}...`);
    const bundleLocation = await bundle({
      entryPoint,
      webpackOverride: (config: any) => config,
    });

    // Calculate total frame count
    const fps = 30;
    const brandingFrames = brandingEnabled ? 120 : 0;
    const totalFrames = clips.reduce((sum, clip) => {
      return sum + Math.max(30, Math.round((clip.trimEnd - clip.trimStart) * fps));
    }, 0) + brandingFrames + 30; // +30 for transitions buffer

    // Determine dimensions
    const dimensions =
      aspectRatio === '9:16' ? { width: 1080, height: 1920 }
      : aspectRatio === '1:1' ? { width: 1080, height: 1080 }
      : { width: 1920, height: 1080 };

    const inputProps = {
      clips,
      musicPath: musicPath || null,
      brandingTheme,
      brandingEnabled,
      textOverlays,
    };

    console.log(`[Remotion] Selecting composition (${totalFrames} frames, ${dimensions.width}x${dimensions.height})...`);
    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: 'PaniniPanoVideo',
      inputProps,
    });

    const finalComposition = {
      ...composition,
      durationInFrames: Math.max(totalFrames, 30),
      ...dimensions,
    };

    console.log(`[Remotion] Rendering to ${outputPath}...`);
    await renderMedia({
      composition: finalComposition,
      serveUrl: bundleLocation,
      codec: 'h264',
      outputLocation: outputPath,
      inputProps,
      onProgress: ({ progress }: { progress: number }) => {
        const pct = Math.round(progress * 100);
        if (pct % 10 === 0) console.log(`[Remotion] Progress: ${pct}%`);
      },
    });

    const fileSize = fs.statSync(outputPath).size;
    console.log(`[Remotion] ✅ Complete: ${jobId} (${(fileSize / 1024 / 1024).toFixed(1)}MB)`);

    res.json({
      success: true,
      jobId,
      downloadUrl: `/api/video/output/${jobId}`,
      fileSize,
    });

  } catch (error: any) {
    console.error(`[Remotion] ❌ Render error:`, error);
    res.status(500).json({ success: false, error: error.message, jobId });
  }
});

// GET /api/video/output/:jobId — download rendered video
router.get('/output/:jobId', (req, res) => {
  const outputPath = path.join(__dirname, '..', 'outputs', `${req.params.jobId}.mp4`);
  if (!fs.existsSync(outputPath)) {
    return res.status(404).json({ error: 'Video not found' });
  }
  res.download(outputPath, `panini-pano-export-${req.params.jobId}.mp4`);
});

// GET /api/video/export-progress/:jobId — SSE progress stream
// For now returns a mock progress stream; real progress comes from render onProgress callback
router.get('/export-progress/:jobId', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let progress = 0;
  const interval = setInterval(() => {
    progress = Math.min(progress + 3, 95);
    res.write(`data: ${JSON.stringify({ progress, jobId: req.params.jobId })}\n\n`);
    if (progress >= 95) {
      clearInterval(interval);
    }
  }, 1000);

  req.on('close', () => {
    clearInterval(interval);
  });
});

export default router;
