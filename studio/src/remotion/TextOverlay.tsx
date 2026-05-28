import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';

export interface TextOverlayProps {
  text: string;
  fontSize: number;
  color: string;
  x: number;
  y: number;
  startTime: number;
  duration: number;
  fps: number;
}

export const TextOverlayComp: React.FC<TextOverlayProps> = ({
  text,
  fontSize,
  color,
  x,
  y,
  startTime,
  duration,
  fps,
}) => {
  const frame = useCurrentFrame();
  const startFrame = Math.round(startTime * fps);
  const endFrame = Math.round((startTime + duration) * fps);
  const fadeDuration = Math.min(15, Math.floor((endFrame - startFrame) / 4));

  const opacity = interpolate(
    frame,
    [startFrame, startFrame + fadeDuration, endFrame - fadeDuration, endFrame],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const translateY = interpolate(
    frame,
    [startFrame, startFrame + fadeDuration],
    [10, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  if (opacity === 0) return null;

  return (
    <AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          left: `${x}%`,
          top: `${y}%`,
          transform: `translate(-50%, calc(-50% + ${translateY}px))`,
          opacity,
          color,
          fontSize: `${fontSize}px`,
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontWeight: 'bold',
          textShadow: '2px 2px 8px rgba(0,0,0,0.85), -1px -1px 4px rgba(0,0,0,0.5)',
          textAlign: 'center',
          maxWidth: '85%',
          lineHeight: 1.3,
          letterSpacing: '0.02em',
          padding: '8px 16px',
          borderRadius: '4px',
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};
