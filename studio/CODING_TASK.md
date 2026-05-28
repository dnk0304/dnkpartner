# DNK Studio — VideoEditor + Remotion Integration Task

You are working inside `C:\Users\D\Desktop\dprosjekt\dennisproject` (DNK Studio).
This is a React + Express project: TypeScript, Vite frontend, tsx server.

---

## PHASE 1A: VideoEditor Improvements

File: `src/components/VideoEditor/VideoEditor.tsx` (~1600 lines)

Add/implement ALL 12 of these improvements:

### 1. Thumbnail generation
When a video file is imported (the existing file input handler), capture a frame from the HTMLVideoElement:
```
const video = document.createElement('video')
video.src = objectURL
video.currentTime = 1
video.oncanplay = () => {
  const canvas = document.createElement('canvas')
  canvas.width = 320; canvas.height = 180
  canvas.getContext('2d').drawImage(video, 0, 0, 320, 180)
  const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.8)
  // update clip.thumbnailUrl
}
```

### 2. Snap-to-grid
Add `snapEnabled` boolean state (default: true) to the editor. Add a snap toggle button near the timeline zoom controls. When dragging trim handles in the timeline, snap to nearest second boundary: `Math.round(rawTime * fps) / fps`.

### 3. Transition settings panel
Add `transitionDuration: number` (default: 0.5) and `easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'` to the `VideoClip` interface. In the existing "Transitions" properties tab, add a duration slider (0.1–2.0s) and easing dropdown.

### 4. More keyboard shortcuts
Add to the existing keyboard event handler:
- J: slow reverse (playback rate -0.5x)
- K: pause
- L: slow forward (playback rate 0.5x, then 1x, then 2x)
- ArrowLeft: step back 1/30s
- ArrowRight: step forward 1/30s
- I: set selected clip's trimStart to currentTime
- O: set selected clip's trimEnd to currentTime
Add a '?' button near transport controls that shows a keyboard shortcuts modal.

### 5. Project save/load
Add "💾 Save Project" button that does:
```js
const json = JSON.stringify(editorState.current)
const blob = new Blob([json], { type: 'application/json' })
const url = URL.createObjectURL(blob)
// download as panini-pano-project.json
```
Add "📂 Load Project" file input (accept=".json") that parses and dispatches SET_CLIPS + SET_MUSIC + SET_ASPECT_RATIO.

### 6. Text overlay drag positioning
Replace `position: 'top' | 'center' | 'bottom'` with `x: number; y: number` (percentage 0–100) in TextOverlay interface. In the preview area, make text overlays draggable via mouse events. Keep backward compat by migrating top=10, center=50, bottom=85 on load.

### 7. Export progress (SSE client)
In the export handler, after initiating export, open an EventSource to `/api/video/export-progress/${jobId}`. Show a progress bar div with percentage. For now, animate from 0 to 95% over 30 seconds while export runs, then jump to 100% on success.

### 8. Branding overlay system
Add to EditorState:
```ts
brandingEnabled: boolean (default: false)
brandingTheme: 'QuietHours' | 'GrabABite' | 'PermissionSlip' | 'ArtOfDoingLess' | 'ItalyCalled'
```
In the export settings panel, add a toggle "🎨 Add Panini Pano branding (last 3s)" and a theme selector dropdown. Pass these to the export API call.

### 9. Music preview
Create a `const audioRef = useRef<HTMLAudioElement>(null)` and add `<audio ref={audioRef} />` to the JSX. In the music track list, add a play button per track. Clicking it sets `audioRef.current.src = track.path` and calls `.play()`. Show a ▶ indicator on the currently playing track. Add a stop button.

### 10. Waveform visualization (cosmetic)
When a music track is selected, generate an array of 50 random bar heights (4–36px) stored in state as `waveformBars: number[]`. Render them as a row of thin bars (2px wide, 1px gap) in the music track row in the timeline.

### 11. Mobile touch support
Add `onTouchStart`, `onTouchMove`, `onTouchEnd` to the timeline clip drag elements. Mirror the existing mouse drag logic: use `e.touches[0].clientX` instead of `e.clientX`. Wrap the mobile timeline in a horizontally scrollable container with `overflow-x: auto`.

### 12. Transition preview canvas
Add a `canvasRef = useRef<HTMLCanvasElement>()` overlay on the preview area. During playback, when the current time is within 0.5s of a clip transition boundary and the transition is 'crossfade':
- Draw the outgoing video frame with `ctx.globalAlpha = 1 - progress`
- Draw the incoming video frame with `ctx.globalAlpha = progress`
Where `progress = (currentTime - clipEndTime + 0.5) / 1.0`

---

## PHASE 1B: Remotion Integration

### Step 1: Install packages
```bash
npm install remotion @remotion/renderer @remotion/bundler @remotion/transitions @remotion/cli --legacy-peer-deps
```

### Step 2: Create `src/remotion/index.ts`
```tsx
import React from 'react';
import { Composition } from 'remotion';
import { PaniniPanoVideo } from './PaniniPanoVideo';
import { BrandingOutro } from './BrandingOutro';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="PaniniPanoVideo"
        component={PaniniPanoVideo}
        durationInFrames={900}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          clips: [],
          musicPath: null,
          brandingTheme: 'QuietHours',
          brandingEnabled: true,
          textOverlays: [],
        }}
      />
      <Composition
        id="BrandingOutro"
        component={BrandingOutro}
        durationInFrames={120}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{ theme: 'QuietHours' }}
      />
    </>
  );
};
```

### Step 3: Create `src/remotion/PaniniPanoVideo.tsx`
Main composition using TransitionSeries. Key structure:
```tsx
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, OffthreadVideo } from 'remotion';
import { TransitionSeries } from '@remotion/transitions';
import { fade, wipe, slide } from '@remotion/transitions';
import { linearTiming } from 'remotion';
import { TextOverlayComp } from './TextOverlay';
import { BrandingOutro } from './BrandingOutro';

export interface PaniniPanoVideoProps {
  clips: Array<{
    path: string; trimStart: number; trimEnd: number;
    transition: 'cut' | 'crossfade' | 'wipe-left' | 'wipe-right';
    textOverlays: Array<{ text: string; fontSize: number; color: string; x: number; y: number; startTime: number; duration: number }>;
  }>;
  musicPath: string | null;
  brandingTheme: string;
  brandingEnabled: boolean;
  textOverlays: any[];
}

export const PaniniPanoVideo: React.FC<PaniniPanoVideoProps> = ({ clips, brandingTheme, brandingEnabled }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: 'black' }}>
      <TransitionSeries>
        {clips.map((clip, i) => {
          const durationFrames = Math.max(30, Math.round((clip.trimEnd - clip.trimStart) * fps));
          const presentation = clip.transition === 'crossfade' ? fade()
            : clip.transition === 'wipe-left' ? wipe({ direction: 'from-left' })
            : clip.transition === 'wipe-right' ? wipe({ direction: 'from-right' })
            : fade();
          return (
            <React.Fragment key={clip.path + i}>
              {i > 0 && (
                <TransitionSeries.Transition
                  presentation={presentation}
                  timing={linearTiming({ durationInFrames: 15 })}
                />
              )}
              <TransitionSeries.Sequence durationInFrames={durationFrames}>
                <AbsoluteFill>
                  <OffthreadVideo
                    src={clip.path}
                    startFrom={Math.round(clip.trimStart * fps)}
                    endAt={Math.round(clip.trimEnd * fps)}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  {clip.textOverlays?.map((overlay, j) => (
                    <TextOverlayComp key={j} {...overlay} fps={fps} />
                  ))}
                </AbsoluteFill>
              </TransitionSeries.Sequence>
            </React.Fragment>
          );
        })}
        {brandingEnabled && (
          <TransitionSeries.Sequence durationInFrames={120}>
            <BrandingOutro theme={brandingTheme as any} />
          </TransitionSeries.Sequence>
        )}
      </TransitionSeries>
    </AbsoluteFill>
  );
};
```

### Step 4: Create `src/remotion/TextOverlay.tsx`
```tsx
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';

interface TextOverlayProps {
  text: string; fontSize: number; color: string;
  x: number; y: number; startTime: number; duration: number; fps: number;
}

export const TextOverlayComp: React.FC<TextOverlayProps> = ({ text, fontSize, color, x, y, startTime, duration, fps }) => {
  const frame = useCurrentFrame();
  const startFrame = Math.round(startTime * fps);
  const endFrame = Math.round((startTime + duration) * fps);
  const opacity = interpolate(frame, [startFrame, startFrame + 15, endFrame - 15, endFrame], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ opacity }}>
      <div style={{
        position: 'absolute', left: `${x}%`, top: `${y}%`,
        transform: 'translate(-50%, -50%)',
        color, fontSize, fontFamily: 'Georgia, serif',
        textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
        textAlign: 'center', maxWidth: '80%',
      }}>
        {text}
      </div>
    </AbsoluteFill>
  );
};
```

### Step 5: Create `src/remotion/BrandingOutro.tsx`
4-second (120-frame) branded end card:
```tsx
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';

type Theme = 'QuietHours' | 'GrabABite' | 'PermissionSlip' | 'ArtOfDoingLess' | 'ItalyCalled';

const THEMES = {
  QuietHours: { bg: 'linear-gradient(135deg, #0f1c3f 0%, #1a2d5a 100%)', tagline: 'Your coloring books for the quiet hours.' },
  GrabABite: { bg: 'linear-gradient(135deg, #c2450e 0%, #e8855a 100%)', tagline: 'Grab a Panini. Color a Pano.' },
  PermissionSlip: { bg: 'linear-gradient(135deg, #b5451b 0%, #e8a87c 100%)', tagline: 'You have permission to stop. Panini Pano.' },
  ArtOfDoingLess: { bg: 'linear-gradient(135deg, #f5f0e8 0%, #2d5a27 100%)', tagline: 'Color slowly. Breathe deeply.' },
  ItalyCalled: { bg: 'linear-gradient(135deg, #c41230 0%, #f5f0e8 50%, #2d5a27 100%)', tagline: 'Italy called. It said relax.' },
};

export const BrandingOutro: React.FC<{ theme: Theme }> = ({ theme }) => {
  const frame = useCurrentFrame();
  const config = THEMES[theme] || THEMES.QuietHours;
  const logoY = interpolate(frame, [0, 30], [60, 50], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const logoOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const taglineOpacity = interpolate(frame, [30, 50], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ background: config.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ opacity: logoOpacity, transform: `translateY(${logoY - 50}%)`, textAlign: 'center' }}>
        <div style={{ fontSize: 72, fontFamily: 'Georgia, serif', color: '#f5f0e8', fontWeight: 'bold', letterSpacing: 2 }}>
          Panini Pano
        </div>
        <div style={{ fontSize: 20, color: 'rgba(245,240,232,0.7)', letterSpacing: 8, textTransform: 'uppercase', marginTop: 8 }}>
          COLORING BOOKS
        </div>
      </div>
      <div style={{ opacity: taglineOpacity, marginTop: 40, textAlign: 'center', maxWidth: '80%' }}>
        <div style={{ fontSize: 28, fontFamily: 'Georgia, serif', color: '#f5f0e8', fontStyle: 'italic', lineHeight: 1.4 }}>
          {config.tagline}
        </div>
      </div>
    </AbsoluteFill>
  );
};
```

### Step 6: Create `src/remotion/TransitionPresets.ts`
```ts
import { fade, wipe, slide } from '@remotion/transitions';
import { linearTiming } from 'remotion';

export const transitionPresets = {
  cut: { presentation: fade(), timing: linearTiming({ durationInFrames: 1 }) },
  crossfade: { presentation: fade(), timing: linearTiming({ durationInFrames: 15 }) },
  'wipe-left': { presentation: wipe({ direction: 'from-left' as const }), timing: linearTiming({ durationInFrames: 20 }) },
  'wipe-right': { presentation: wipe({ direction: 'from-right' as const }), timing: linearTiming({ durationInFrames: 20 }) },
  slide: { presentation: slide({ direction: 'from-right' as const }), timing: linearTiming({ durationInFrames: 20 }) },
};
```

### Step 7: Create theme components `src/remotion/themes/QuietHours.tsx`, `GrabABite.tsx`, `PermissionSlip.tsx`
Each is a standalone full-screen (1080x1920) composition using useCurrentFrame() + interpolate() with the brand colors and copy from the branding doc.

### Step 8: Create `server/videoRemotion.ts`
```ts
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = express.Router();

router.post('/render-remotion', async (req, res) => {
  const { clips, musicPath, brandingTheme = 'QuietHours', brandingEnabled = true, textOverlays = [], aspectRatio = '9:16' } = req.body;
  
  const jobId = uuidv4();
  const outputDir = path.join(__dirname, '..', 'outputs');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `${jobId}.mp4`);

  try {
    const entryPoint = path.resolve(path.join(__dirname, '..', 'src', 'remotion', 'index.ts'));
    
    const bundleLocation = await bundle({
      entryPoint,
      webpackOverride: (config) => config,
    });

    const totalFrames = clips.reduce((sum: number, clip: any) => {
      return sum + Math.max(30, Math.round((clip.trimEnd - clip.trimStart) * 30));
    }, 0) + (brandingEnabled ? 120 : 0);

    const dimensions = aspectRatio === '9:16' ? { width: 1080, height: 1920 }
      : aspectRatio === '1:1' ? { width: 1080, height: 1080 }
      : { width: 1920, height: 1080 };

    const inputProps = { clips, musicPath, brandingTheme, brandingEnabled, textOverlays };

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

    await renderMedia({
      composition: finalComposition,
      serveUrl: bundleLocation,
      codec: 'h264',
      outputLocation: outputPath,
      inputProps,
      onProgress: ({ progress }) => {
        console.log(`[Remotion] Render progress: ${Math.round(progress * 100)}%`);
      },
    });

    res.json({ success: true, jobId, outputPath, downloadUrl: `/api/video/output/${jobId}` });
  } catch (error: any) {
    console.error('[Remotion] Render error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/output/:jobId', (req, res) => {
  const outputPath = path.join(__dirname, '..', 'outputs', `${req.params.jobId}.mp4`);
  if (!fs.existsSync(outputPath)) return res.status(404).json({ error: 'Not found' });
  res.download(outputPath);
});

export default router;
```

### Step 9: Register in `server/index.ts`
Add near the top:
```ts
import videoRemotionRouter from './videoRemotion.js';
```
And after existing routes:
```ts
app.use('/api/video', videoRemotionRouter);
```

### Step 10: Update VideoEditor.tsx export
In the export button area, add a second button "🎬 Export with Remotion (HD)" that calls `/api/video/render-remotion` with the full editor state. This runs alongside the existing ffmpeg export (don't remove it).

---

## IMPORTANT NOTES
- TypeScript project, ES modules, server imports use `.js` extensions
- Use `--legacy-peer-deps` for npm install if needed
- Keep existing ffmpeg pipeline working alongside Remotion
- If Remotion install fails due to peer deps, document what was tried in a REMOTION-STATUS.md file
- For type errors, prefer `as any` over blocking progress

When completely finished with all work, run:
openclaw system event --text "Done: Phase 1A+1B — VideoEditor 12 improvements + Remotion integration complete" --mode now
