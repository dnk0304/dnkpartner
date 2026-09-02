/* eslint-disable @next/next/no-img-element */
/**
 * OG-image templates (1200×630) for the three link-preview surfaces:
 *   - HomeOgTemplate      → homepage / brand default
 *   - CategoryOgTemplate  → province + category hub pages
 *   - AuctionOgTemplate    → per-auction detail (photo-led, branded fallback)
 *
 * These return plain React elements consumed by `next/og` `ImageResponse`.
 * Satori supports a FLEXBOX subset only: every multi-child element sets an
 * explicit `display: 'flex'` and direction. No CSS classes, no external CSS —
 * inline styles with literal brand tokens (see brand.ts).
 */
import { BRAND, WORDMARK, SITE_HOST } from './brand';

const DISPLAY = 'Inter Tight';
const BODY = 'Inter';

/** Wordmark lockup — reused across all templates. `onDark` flips the palette. */
function Wordmark({ onDark }: { onDark: boolean }) {
  const strong = onDark ? BRAND.inkOnPine : BRAND.pine;
  const soft = onDark ? 'rgba(255,255,255,0.85)' : BRAND.action;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 52,
          height: 52,
          borderRadius: 13,
          background: onDark ? BRAND.inkOnPine : BRAND.pine,
        }}
      >
        {/* Gavel-esque brand tick — a bold check inside a rounded square */}
        <div
          style={{
            display: 'flex',
            fontFamily: DISPLAY,
            fontWeight: 800,
            fontSize: 34,
            color: onDark ? BRAND.pine : BRAND.inkOnPine,
          }}
        >
          S
        </div>
      </div>
      <div style={{ display: 'flex', fontFamily: DISPLAY, fontWeight: 800, fontSize: 34 }}>
        <span style={{ color: strong }}>{WORDMARK.a}</span>
        <span style={{ color: soft, fontWeight: 700 }}>{WORDMARK.b}</span>
      </div>
    </div>
  );
}

function FooterHost({ onDark }: { onDark: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        fontFamily: BODY,
        fontSize: 24,
        fontWeight: 600,
        color: onDark ? BRAND.inkQuietOnPine : BRAND.action,
      }}
    >
      <div style={{ display: 'flex', width: 12, height: 12, borderRadius: 6, background: BRAND.live }} />
      {SITE_HOST}
    </div>
  );
}

const PAGE = (extra: React.CSSProperties): React.CSSProperties => ({
  width: '100%',
  height: '100%',
  display: 'flex',
  ...extra,
});

/* ────────────────────────────────────────────────────────────────────────
 * HOME — brand default
 * ──────────────────────────────────────────────────────────────────────── */
export function HomeOgTemplate({ activeCount }: { activeCount: number | null }) {
  return (
    <div
      style={PAGE({
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 72,
        background: `linear-gradient(135deg, ${BRAND.pine} 0%, ${BRAND.pineDark} 100%)`,
      })}
    >
      <Wordmark onDark />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {activeCount != null && (
          <div
            style={{
              display: 'flex',
              alignSelf: 'flex-start',
              alignItems: 'center',
              gap: 12,
              padding: '10px 20px',
              borderRadius: 999,
              background: 'rgba(255,255,255,0.12)',
              border: '1px solid rgba(255,255,255,0.22)',
              fontFamily: BODY,
              fontSize: 26,
              fontWeight: 600,
              color: BRAND.inkOnPine,
            }}
          >
            <div style={{ display: 'flex', width: 14, height: 14, borderRadius: 7, background: BRAND.live }} />
            {activeCount.toLocaleString('es-ES')} subastas activas ahora
          </div>
        )}
        <div
          style={{
            display: 'flex',
            fontFamily: DISPLAY,
            fontWeight: 800,
            fontSize: 76,
            lineHeight: 1.05,
            color: BRAND.inkOnPine,
            maxWidth: 900,
          }}
        >
          Subastas judiciales y notariales de toda España
        </div>
        <div style={{ display: 'flex', fontFamily: BODY, fontSize: 30, color: BRAND.inkQuietOnPine, maxWidth: 860 }}>
          Rastreamos el BOE en tiempo real: viviendas, locales, terrenos y vehículos.
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <FooterHost onDark />
        <div style={{ display: 'flex', fontFamily: BODY, fontSize: 22, color: 'rgba(255,255,255,0.55)' }}>
          Datos oficiales · actualizado a diario
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * PROVINCE / CATEGORY hub — branded template
 * ──────────────────────────────────────────────────────────────────────── */
export function CategoryOgTemplate({
  eyebrow,
  title,
  count,
}: {
  eyebrow: string;
  title: string;
  count: number | null;
}) {
  return (
    <div
      style={PAGE({
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 72,
        background: BRAND.page,
      })}
    >
      {/* Top pine accent bar */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: 1200,
          height: 12,
          display: 'flex',
          background: `linear-gradient(90deg, ${BRAND.pine}, ${BRAND.action}, ${BRAND.gold})`,
        }}
      />
      <Wordmark onDark={false} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div
          style={{
            display: 'flex',
            fontFamily: BODY,
            fontSize: 26,
            fontWeight: 600,
            letterSpacing: 2,
            textTransform: 'uppercase',
            color: BRAND.action,
          }}
        >
          {eyebrow}
        </div>
        <div
          style={{
            display: 'flex',
            fontFamily: DISPLAY,
            fontWeight: 800,
            fontSize: 78,
            lineHeight: 1.04,
            color: BRAND.ink,
            maxWidth: 1000,
          }}
        >
          {title}
        </div>
        {count != null && count > 0 && (
          <div
            style={{
              display: 'flex',
              alignSelf: 'flex-start',
              alignItems: 'center',
              gap: 12,
              padding: '12px 22px',
              borderRadius: 14,
              background: BRAND.actionSoft,
              fontFamily: BODY,
              fontSize: 28,
              fontWeight: 600,
              color: BRAND.pine,
            }}
          >
            <div style={{ display: 'flex', width: 14, height: 14, borderRadius: 7, background: BRAND.live }} />
            {count.toLocaleString('es-ES')} subastas activas
          </div>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <FooterHost onDark={false} />
        <div style={{ display: 'flex', fontFamily: BODY, fontSize: 22, color: BRAND.ink, opacity: 0.5 }}>
          Actualizado a diario desde el BOE
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 * AUCTION detail — photo-led with branded fallback
 * ──────────────────────────────────────────────────────────────────────── */
export function AuctionOgTemplate({
  title,
  where,
  category,
  auctionType,
  price,
  priceLabel,
  photoSrc,
}: {
  title: string;
  where: string;
  category: string | null;
  auctionType: string | null;
  price: string | null;
  priceLabel: string;
  photoSrc: string | null;
}) {
  const facts = [auctionType, category].filter(Boolean) as string[];
  return (
    <div style={PAGE({ flexDirection: 'row', background: BRAND.pine })}>
      {/* LEFT — photo panel (or branded pattern when no photo) */}
      <div style={{ display: 'flex', width: 620, height: 630, position: 'relative' }}>
        {photoSrc ? (
          <img src={photoSrc} width={620} height={630} style={{ objectFit: 'cover' }} alt="" />
        ) : (
          <div
            style={PAGE({
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: `linear-gradient(135deg, ${BRAND.pineDark} 0%, ${BRAND.pine} 100%)`,
            })}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 150,
                height: 150,
                borderRadius: 30,
                background: 'rgba(255,255,255,0.10)',
                border: '2px solid rgba(255,255,255,0.20)',
                fontFamily: DISPLAY,
                fontWeight: 800,
                fontSize: 96,
                color: BRAND.inkOnPine,
              }}
            >
              S
            </div>
            <div
              style={{
                display: 'flex',
                marginTop: 24,
                fontFamily: BODY,
                fontSize: 24,
                color: BRAND.inkQuietOnPine,
              }}
            >
              Sin fotografía disponible
            </div>
          </div>
        )}
        {/* Right-edge fade into the info panel for a seamless seam */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: 120,
            height: 630,
            display: 'flex',
            background: `linear-gradient(90deg, rgba(31,74,58,0) 0%, ${BRAND.pine} 100%)`,
          }}
        />
      </div>

      {/* RIGHT — info panel */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: 580,
          height: 630,
          padding: 56,
        }}
      >
        <Wordmark onDark />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            {facts.map((f) => (
              <div
                key={f}
                style={{
                  display: 'flex',
                  padding: '7px 16px',
                  borderRadius: 999,
                  background: 'rgba(255,255,255,0.12)',
                  border: '1px solid rgba(255,255,255,0.20)',
                  fontFamily: BODY,
                  fontSize: 21,
                  fontWeight: 600,
                  color: BRAND.inkOnPine,
                }}
              >
                {f}
              </div>
            ))}
          </div>
          <div
            style={{
              // Satori honours -webkit-box + line-clamp for multiline overflow.
              display: '-webkit-box',
              WebkitBoxOrient: 'vertical',
              WebkitLineClamp: 4,
              overflow: 'hidden',
              fontFamily: DISPLAY,
              fontWeight: 800,
              fontSize: 46,
              lineHeight: 1.08,
              color: BRAND.inkOnPine,
            }}
          >
            {title}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: BODY, fontSize: 26, color: BRAND.inkQuietOnPine }}>
            {where}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {price && (
            <>
              <div style={{ display: 'flex', fontFamily: BODY, fontSize: 20, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: BRAND.inkQuietOnPine }}>
                {priceLabel}
              </div>
              <div style={{ display: 'flex', fontFamily: DISPLAY, fontWeight: 800, fontSize: 52, color: '#F2D479' }}>
                {price}
              </div>
            </>
          )}
          <div style={{ display: 'flex', marginTop: price ? 14 : 0 }}>
            <FooterHost onDark />
          </div>
        </div>
      </div>
    </div>
  );
}
