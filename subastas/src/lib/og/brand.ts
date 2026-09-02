/**
 * Brand tokens for the OG-image templates.
 *
 * ImageResponse/Satori does NOT read CSS custom properties, so the site's
 * `--color-*` design tokens (globals.css) are mirrored here as literals. Keep
 * these in sync with globals.css if the palette ever moves.
 */
export const BRAND = {
  pine: '#1F4A3A', // --color-brand — deep pine, header/footer surface
  pineDark: '#163A2D', // --color-brand-hover
  action: '#17926D', // --color-action — winter-green CTA
  actionSoft: '#DCF1EA', // --color-action-soft
  gold: '#8C7339', // --color-gold — accent hairline / price
  ink: '#0A0F1A', // --color-ink-primary
  inkOnPine: '#FFFFFF',
  inkQuietOnPine: 'rgba(255,255,255,0.72)',
  page: '#FBFCFD', // --color-page
  surface: '#FFFFFF',
  hairline: '#E5EAEC',
  live: '#1FA37A', // --color-status-live
} as const;

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = 'image/png';
export const OG_ALT = 'SubastasActivas — subastas judiciales y notariales en España';

/** Site wordmark, split like the header (`Subastas` bold + `Activas` regular). */
export const WORDMARK = { a: 'Subastas', b: 'Activas' } as const;
export const SITE_HOST = 'subastasactivas.com';

/** EUR, no decimals — matches the detail-page meta price format. */
export function formatEur(value: number | bigint | null | undefined): string | null {
  if (value == null) return null;
  const n = typeof value === 'bigint' ? Number(value) : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  try {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return null;
  }
}
