/**
 * GrabABite — Panini Pano Brand Theme
 * "Grab a Panini. Color a Pano."
 * Warm terracotta / aged cream — Italian café energy
 */
import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';

export const GrabABite: React.FC = () => {
  const frame = useCurrentFrame();

  const bgOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const iconOpacity = interpolate(frame, [10, 35], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const iconScale = interpolate(frame, [10, 35], [0.5, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const logoOpacity = interpolate(frame, [25, 50], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const logoY = interpolate(frame, [25, 50], [25, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const taglineOpacity = interpolate(frame, [50, 70], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const decorOpacity = interpolate(frame, [65, 85], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill
      style={{
        opacity: bgOpacity,
        background: 'linear-gradient(155deg, #6b1700 0%, #a83500 25%, #c2450e 55%, #d96b35 80%, #e89060 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '80px 50px',
      }}
    >
      {/* Panini/food icon */}
      <div style={{
        opacity: iconOpacity,
        transform: `scale(${iconScale})`,
        marginBottom: '36px',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '60px' }}>🥪</div>
      </div>

      {/* Logo */}
      <div style={{
        opacity: logoOpacity,
        transform: `translateY(${logoY}px)`,
        textAlign: 'center',
        marginBottom: '18px',
      }}>
        <div style={{
          fontSize: '70px',
          fontFamily: 'Georgia, "Times New Roman", serif',
          color: '#fff9f0',
          fontWeight: 'bold',
          letterSpacing: '1px',
          lineHeight: 1.1,
        }}>
          Panini Pano
        </div>
      </div>

      {/* Decorative squiggle line */}
      <div style={{
        width: '55%',
        height: '2px',
        background: 'linear-gradient(90deg, transparent, rgba(255,249,240,0.6), transparent)',
        marginBottom: '26px',
        opacity: decorOpacity,
      }} />

      {/* Tagline */}
      <div style={{ opacity: taglineOpacity, textAlign: 'center', maxWidth: '80%' }}>
        <div style={{
          fontSize: '30px',
          fontFamily: 'Georgia, "Times New Roman", serif',
          color: 'rgba(255,249,240,0.92)',
          fontStyle: 'italic',
          lineHeight: 1.45,
        }}>
          Grab a Panini. Color a Pano.
        </div>
      </div>

      {/* Sub-brand */}
      <div style={{
        opacity: decorOpacity,
        marginTop: '48px',
        textAlign: 'center',
      }}>
        <div style={{
          fontSize: '13px',
          fontFamily: 'Georgia, serif',
          color: 'rgba(255,249,240,0.55)',
          letterSpacing: '6px',
          textTransform: 'uppercase',
        }}>
          COLORING BOOKS
        </div>
        <div style={{
          fontSize: '11px',
          color: 'rgba(255,249,240,0.38)',
          letterSpacing: '3px',
          textTransform: 'uppercase',
          marginTop: '7px',
          fontFamily: 'Georgia, serif',
        }}>
          panini-pano.com
        </div>
      </div>
    </AbsoluteFill>
  );
};
