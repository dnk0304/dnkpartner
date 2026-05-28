import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';

export type BrandingTheme = 'QuietHours' | 'GrabABite' | 'PermissionSlip' | 'ArtOfDoingLess' | 'ItalyCalled';

interface ThemeConfig {
  background: string;
  logoColor: string;
  taglineColor: string;
  tagline: string;
  subline: string;
}

const THEMES: Record<BrandingTheme, ThemeConfig> = {
  QuietHours: {
    background: 'linear-gradient(160deg, #0a1628 0%, #1a2d5a 50%, #0f2040 100%)',
    logoColor: '#f5f0e8',
    taglineColor: 'rgba(245,240,232,0.85)',
    tagline: 'Your coloring books for the quiet hours.',
    subline: 'PANINI PANO',
  },
  GrabABite: {
    background: 'linear-gradient(160deg, #8b2500 0%, #c2450e 40%, #e8855a 100%)',
    logoColor: '#fff9f0',
    taglineColor: 'rgba(255,249,240,0.9)',
    tagline: 'Grab a Panini. Color a Pano.',
    subline: 'PANINI PANO',
  },
  PermissionSlip: {
    background: 'linear-gradient(160deg, #7a2f0a 0%, #b5451b 40%, #e8a87c 100%)',
    logoColor: '#fff9f0',
    taglineColor: 'rgba(255,249,240,0.9)',
    tagline: 'You have permission to stop.',
    subline: 'PANINI PANO',
  },
  ArtOfDoingLess: {
    background: 'linear-gradient(160deg, #f5f0e8 0%, #d4e8d4 50%, #2d5a27 100%)',
    logoColor: '#1a3a17',
    taglineColor: 'rgba(26,58,23,0.85)',
    tagline: 'Color slowly. Breathe deeply.',
    subline: 'PANINI PANO',
  },
  ItalyCalled: {
    background: 'linear-gradient(160deg, #c41230 0%, #f5f0e8 45%, #2d5a27 100%)',
    logoColor: '#1a1a1a',
    taglineColor: 'rgba(26,26,26,0.85)',
    tagline: 'Italy called. It said relax.',
    subline: 'PANINI PANO',
  },
};

interface BrandingOutroProps {
  theme: BrandingTheme;
}

export const BrandingOutro: React.FC<BrandingOutroProps> = ({ theme }) => {
  const frame = useCurrentFrame();
  const config = THEMES[theme] ?? THEMES.QuietHours;

  // Logo slides up and fades in during first 25 frames
  const logoOpacity = interpolate(frame, [0, 25], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const logoY = interpolate(frame, [0, 25], [30, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Tagline fades in at frame 30
  const taglineOpacity = interpolate(frame, [30, 50], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Subline fades in at frame 45
  const sublineOpacity = interpolate(frame, [45, 65], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Decorative line expands
  const lineWidth = interpolate(frame, [55, 80], [0, 100], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        background: config.background,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 40px',
      }}
    >
      {/* Main logo text */}
      <div
        style={{
          opacity: logoOpacity,
          transform: `translateY(${logoY}px)`,
          textAlign: 'center',
          marginBottom: '20px',
        }}
      >
        <div
          style={{
            fontSize: '68px',
            fontFamily: 'Georgia, "Times New Roman", serif',
            color: config.logoColor,
            fontWeight: 'bold',
            letterSpacing: '2px',
            lineHeight: 1.1,
          }}
        >
          Panini Pano
        </div>
      </div>

      {/* Decorative line */}
      <div
        style={{
          width: `${lineWidth}%`,
          height: '2px',
          background: `linear-gradient(90deg, transparent, ${config.logoColor}, transparent)`,
          marginBottom: '24px',
          opacity: sublineOpacity,
        }}
      />

      {/* Tagline */}
      <div
        style={{
          opacity: taglineOpacity,
          textAlign: 'center',
          maxWidth: '75%',
        }}
      >
        <div
          style={{
            fontSize: '30px',
            fontFamily: 'Georgia, "Times New Roman", serif',
            color: config.taglineColor,
            fontStyle: 'italic',
            lineHeight: 1.5,
          }}
        >
          {config.tagline}
        </div>
      </div>

      {/* Sub branding */}
      <div
        style={{
          opacity: sublineOpacity,
          marginTop: '40px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontSize: '16px',
            fontFamily: 'Georgia, serif',
            color: config.taglineColor,
            letterSpacing: '8px',
            textTransform: 'uppercase',
          }}
        >
          {config.subline}
        </div>
        <div
          style={{
            fontSize: '14px',
            fontFamily: 'Georgia, serif',
            color: config.taglineColor,
            letterSpacing: '4px',
            textTransform: 'uppercase',
            marginTop: '8px',
            opacity: 0.7,
          }}
        >
          COLORING BOOKS
        </div>
      </div>
    </AbsoluteFill>
  );
};
