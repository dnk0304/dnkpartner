/**
 * PermissionSlip — Panini Pano Brand Theme
 * "You have permission to stop. Panini Pano."
 * Bold amber / warm typography — direct, human, mid-overwhelm
 */
import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';

export const PermissionSlip: React.FC = () => {
  const frame = useCurrentFrame();

  const bgOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const checkOpacity = interpolate(frame, [5, 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const checkScale = interpolate(frame, [5, 30], [0.3, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const line1Opacity = interpolate(frame, [30, 50], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const line1Y = interpolate(frame, [30, 50], [15, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const line2Opacity = interpolate(frame, [45, 65], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const logoOpacity = interpolate(frame, [65, 85], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const decorOpacity = interpolate(frame, [80, 100], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill
      style={{
        opacity: bgOpacity,
        background: 'linear-gradient(150deg, #4a1500 0%, #7a2800 20%, #b5451b 50%, #d4784a 80%, #e8a87c 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '80px 50px',
      }}
    >
      {/* Permission checkmark */}
      <div style={{
        opacity: checkOpacity,
        transform: `scale(${checkScale})`,
        marginBottom: '30px',
        textAlign: 'center',
      }}>
        <div style={{
          fontSize: '64px',
          filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.4))',
        }}>
          ✅
        </div>
      </div>

      {/* Main message line 1 */}
      <div style={{
        opacity: line1Opacity,
        transform: `translateY(${line1Y}px)`,
        textAlign: 'center',
        marginBottom: '12px',
        maxWidth: '80%',
      }}>
        <div style={{
          fontSize: '42px',
          fontFamily: 'Georgia, "Times New Roman", serif',
          color: '#fff9f0',
          fontWeight: 'bold',
          lineHeight: 1.25,
          letterSpacing: '0.5px',
        }}>
          You have permission to stop.
        </div>
      </div>

      {/* Main message line 2 */}
      <div style={{
        opacity: line2Opacity,
        textAlign: 'center',
        marginBottom: '32px',
        maxWidth: '78%',
      }}>
        <div style={{
          fontSize: '26px',
          fontFamily: 'Georgia, "Times New Roman", serif',
          color: 'rgba(255,249,240,0.88)',
          fontStyle: 'italic',
          lineHeight: 1.4,
        }}>
          Grab a pencil. Make something beautiful. That's the whole plan.
        </div>
      </div>

      {/* Decorative line */}
      <div style={{
        width: '50%',
        height: '1px',
        background: 'linear-gradient(90deg, transparent, rgba(255,249,240,0.5), transparent)',
        marginBottom: '24px',
        opacity: decorOpacity,
      }} />

      {/* Logo */}
      <div style={{
        opacity: logoOpacity,
        textAlign: 'center',
      }}>
        <div style={{
          fontSize: '44px',
          fontFamily: 'Georgia, "Times New Roman", serif',
          color: '#fff9f0',
          fontWeight: 'bold',
          letterSpacing: '2px',
        }}>
          Panini Pano
        </div>
      </div>

      {/* Sub-brand */}
      <div style={{
        opacity: decorOpacity,
        marginTop: '20px',
        textAlign: 'center',
      }}>
        <div style={{
          fontSize: '12px',
          fontFamily: 'Georgia, serif',
          color: 'rgba(255,249,240,0.5)',
          letterSpacing: '5px',
          textTransform: 'uppercase',
        }}>
          COLORING BOOKS • panini-pano.com
        </div>
      </div>
    </AbsoluteFill>
  );
};
