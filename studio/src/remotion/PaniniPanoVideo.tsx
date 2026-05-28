import React from 'react';
import { AbsoluteFill, useVideoConfig, OffthreadVideo, Audio } from 'remotion';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { wipe } from '@remotion/transitions/wipe';
import { slide } from '@remotion/transitions/slide';
import { TextOverlayComp } from './TextOverlay';
import { BrandingOutro, type BrandingTheme } from './BrandingOutro';

export interface ClipTextOverlay {
  text: string;
  fontSize: number;
  color: string;
  x: number;
  y: number;
  startTime: number;
  duration: number;
}

export interface VideoClipInput {
  path: string;
  trimStart: number;
  trimEnd: number;
  transition: 'cut' | 'crossfade' | 'wipe-left' | 'wipe-right' | 'slide';
  transitionDuration?: number;
  textOverlays?: ClipTextOverlay[];
}

export interface PaniniPanoVideoProps {
  clips: VideoClipInput[];
  musicPath: string | null;
  brandingTheme: BrandingTheme;
  brandingEnabled: boolean;
  textOverlays: ClipTextOverlay[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getPresentation(transition: VideoClipInput['transition']): any {
  switch (transition) {
    case 'wipe-left': return wipe({ direction: 'from-left' });
    case 'wipe-right': return wipe({ direction: 'from-right' });
    case 'slide': return slide({ direction: 'from-right' });
    case 'cut': return fade();
    case 'crossfade':
    default: return fade();
  }
}

function getTransitionFrames(transition: VideoClipInput['transition'], customDuration?: number): number {
  if (customDuration !== undefined) {
    return Math.round(customDuration * 30);
  }
  switch (transition) {
    case 'cut': return 1;
    case 'crossfade': return 15;
    case 'wipe-left':
    case 'wipe-right':
    case 'slide': return 20;
    default: return 15;
  }
}

export const PaniniPanoVideo: React.FC<PaniniPanoVideoProps> = ({
  clips,
  musicPath,
  brandingTheme,
  brandingEnabled,
  textOverlays,
}) => {
  const { fps } = useVideoConfig();

  if (clips.length === 0) {
    return (
      <AbsoluteFill style={{ backgroundColor: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#fff', fontSize: 40, fontFamily: 'Georgia, serif' }}>
          No clips added
        </div>
      </AbsoluteFill>
    );
  }

  const brandingFrames = brandingEnabled ? 120 : 0;

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {/* Main video content with transitions */}
      <TransitionSeries>
        {clips.map((clip, i) => {
          const clipDuration = Math.max(30, Math.round((clip.trimEnd - clip.trimStart) * fps));
          const presentation = getPresentation(clip.transition);
          const transitionFrames = getTransitionFrames(clip.transition, clip.transitionDuration);

          return (
            <React.Fragment key={`${clip.path}-${i}`}>
              {i > 0 && (
                <TransitionSeries.Transition
                  presentation={presentation}
                  timing={linearTiming({ durationInFrames: transitionFrames })}
                />
              )}
              <TransitionSeries.Sequence durationInFrames={clipDuration}>
                <AbsoluteFill>
                  <OffthreadVideo
                    src={clip.path}
                    startFrom={Math.round(clip.trimStart * fps)}
                    endAt={Math.round(clip.trimEnd * fps)}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  {/* Per-clip text overlays */}
                  {clip.textOverlays?.map((overlay, j) => (
                    <TextOverlayComp
                      key={j}
                      text={overlay.text}
                      fontSize={overlay.fontSize}
                      color={overlay.color}
                      x={overlay.x}
                      y={overlay.y}
                      startTime={overlay.startTime}
                      duration={overlay.duration}
                      fps={fps}
                    />
                  ))}
                </AbsoluteFill>
              </TransitionSeries.Sequence>
            </React.Fragment>
          );
        })}

        {/* Branding outro */}
        {brandingEnabled && (
          <>
            <TransitionSeries.Transition
              presentation={fade()}
              timing={linearTiming({ durationInFrames: 15 })}
            />
            <TransitionSeries.Sequence durationInFrames={brandingFrames}>
              <BrandingOutro theme={brandingTheme} />
            </TransitionSeries.Sequence>
          </>
        )}
      </TransitionSeries>

      {/* Global text overlays (shown across full video) */}
      {textOverlays?.map((overlay, i) => (
        <TextOverlayComp
          key={i}
          text={overlay.text}
          fontSize={overlay.fontSize}
          color={overlay.color}
          x={overlay.x}
          y={overlay.y}
          startTime={overlay.startTime}
          duration={overlay.duration}
          fps={fps}
        />
      ))}

      {/* Background music */}
      {musicPath && (
        <Audio
          src={musicPath}
          volume={0.4}
          startFrom={0}
        />
      )}
    </AbsoluteFill>
  );
};
