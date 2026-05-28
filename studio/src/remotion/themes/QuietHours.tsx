/**
 * QuietHours — Panini Pano Brand Theme
 * "Your coloring books for the quiet hours."
 * Deep navy / soft cream — evening ritual energy
 */
import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';

export const QuietHours: React.FC = () => {
  const frame = useCurrentFrame();

  const backgroundOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const moonOpacity = interpolate(frame, [10, 40], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const logoOpacity = interpolate(frame, [20, 50], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const logoY = interpolate(frame, [20, 50], [20, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const taglineOpacity = interpolate(frame, [50, 75], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const decorOpacity = interpolate(frame, [70, 90], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill
      style={{
        opacity: backgroundOpacity,
        background: 'linear-gradient(170deg, #060d1f 0%, #0f1c3f 35%, #1a2d5a 65%, #0a1628 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '80px 50px',
      }}
    >
      {/* Decorative moon/stars */}
      <div style={{ opacity: moonOpacity, marginBottom: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '56px' }}>🌙</div>
      </div>

      {/* Logo */}
      <div
        style={{
          opacity: logoOpacity,
          transform: `translateY(${logoY}px)`,
          textAlign: 'center',
          marginBottom: '16px',
        }}
      >
        <div style={{
          fontSize: '72px',
          fontFamily: 'Georgia, "Times New Roman", serif',
          color: '#f5f0e8',
          fontWeight: 'bold',
          letterSpacing: '1px',
          lineHeight: 1.1,
        }}>
          Panini Pano
        </div>
      </div>

      {/* Decorative line */}
      <div style={{
        width: '60%',
        height: '1px',
        background: 'linear-gradient(90deg, transparent, rgba(245,240,232,0.5), transparent)',
        marginBottom: '28px',
        opacity: decorOpacity,
      }} />

      {/* Tagline */}
      <div style={{ opacity: taglineOpacity, textAlign: 'center', maxWidth: '78%' }}>
        <div style={{
          fontSize: '28px',
          fontFamily: 'Georgia, "Times New Roman", serif',
          color: 'rgba(245,240,232,0.85)',
          fontStyle: 'italic',
          lineHeight: 1.5,
          letterSpacing: '0.5px',
        }}>
          Your coloring books for the quiet hours.
        </div>
      </div>

      {/* Bottom sub-brand */}
      <div style={{
        opacity: decorOpacity,
        marginTop: '50px',
        textAlign: 'center',
      }}>
        <div style={{
          fontSize: '13px',
          fontFamily: 'Georgia, serif',
          color: 'rgba(245,240,232,0.5)',
          letterSpacing: '6px',
          textTransform: 'uppercase',
        }}>
          COLORING BOOKS
        </div>
        <div style={{
          fontSize: '11px',
          color: 'rgba(245,240,232,0.35)',
          letterSpacing: '3px',
          textTransform: 'uppercase',
          marginTop: '6px',
          fontFamily: 'Georgia, serif',
        }}>
          panini-pano.com
        </div>
      </div>
    </AbsoluteFill>
  );
};
