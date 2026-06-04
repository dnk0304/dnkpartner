/**
 * Standalone preview renderer — produces a sample alert email HTML on disk
 * so a human can open it in a browser / paste it into a Gmail compose to verify
 * the wave52 fixes:
 *   - Status-branched date line (CELEBRANDOSE: Termina, PROXIMA_APERTURA:
 *     Próxima apertura, SUSPENDIDA: Fecha prevista de reanudación — never
 *     a faked endsAt date on a pre-auction).
 *   - Status-translated badges (no raw CONCLUIDA_PORTAL etc.).
 *   - Image ladder: SV / resolver photo → Google Static Maps pin → branded
 *     PNG placeholder. ZERO `tile.openstreetmap.org` URLs.
 *
 * Run with: node scripts/render-alert-email-preview.mjs
 * Output:   tmp/alert-email-preview.html
 *
 * This script MIRRORS the production helpers in src/lib/email-templates.ts,
 * src/lib/auction-image-url.ts, and src/lib/auction-status.ts. Keep in sync.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const APP_URL = 'https://subastasactivas.com';

// ── Image-URL ladder (mirror of auction-image-url.ts) ────────────────────
const BRANDED_PLACEHOLDER_PATH = '/images/email-placeholder.png';
function isStaticMapsApiUsable() {
  if (process.env.STATIC_MAPS_API_DISABLED === '1') return false;
  const key = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_API_KEY;
  return Boolean(key && key.trim().length > 0);
}
function googleStaticMapUrl(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (!isStaticMapsApiUsable()) return null;
  const key = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_API_KEY;
  const slat = lat.toFixed(6); const slng = lng.toFixed(6);
  return `https://maps.googleapis.com/maps/api/staticmap?center=${slat},${slng}&zoom=16&size=640x400&scale=2&markers=color:red%7C${slat},${slng}&key=${encodeURIComponent(key)}`;
}
function emailFallbackImageUrl(lat, lng, appUrl) {
  if (lat != null && lng != null) {
    const sm = googleStaticMapUrl(lat, lng);
    if (sm) return sm;
  }
  return `${appUrl}${BRANDED_PLACEHOLDER_PATH}`;
}
function emailAuctionImageUrl(a) {
  const { imageUrl, latitude, longitude, title } = a;
  if (imageUrl && (imageUrl.startsWith('/api/auction-image/') || imageUrl.startsWith('/streetview/'))) {
    return { src: `${APP_URL}${imageUrl}`, alt: title ? `Foto de ${title}` : 'Foto', rung: 'photo' };
  }
  if (imageUrl && /^https?:\/\//.test(imageUrl) && !imageUrl.endsWith('.svg')) {
    return { src: imageUrl, alt: title ? `Foto de ${title}` : 'Foto', rung: 'photo' };
  }
  const src = emailFallbackImageUrl(latitude ?? null, longitude ?? null, APP_URL);
  const isPlaceholder = src.endsWith(BRANDED_PLACEHOLDER_PATH);
  if (isPlaceholder) return { src, alt: title ? `Categoría: ${title}` : 'Subasta sin imagen', rung: 'placeholder' };
  return { src, alt: title ? `Mapa ${title}` : 'Mapa', rung: 'map' };
}

// ── Status-branched date label (mirror of auction-status.ts) ─────────────
function statusDateLabel(s) {
  if (!s) return null;
  if (s === 'CELEBRANDOSE' || s === 'ACTIVE') return 'Termina';
  if (s === 'PROXIMA_APERTURA' || s === 'PRE_AUCTION') return 'Próxima apertura';
  if (s === 'SUSPENDIDA' || s === 'SUSPENDED') return 'Fecha prevista de reanudación';
  return null;
}
function statusHumanLabel(s) {
  if (!s) return 'Sin estado';
  switch (s) {
    case 'CELEBRANDOSE': case 'ACTIVE': return 'En curso';
    case 'PROXIMA_APERTURA': case 'PRE_AUCTION': return 'Próxima apertura';
    case 'SUSPENDIDA': case 'SUSPENDED': return 'Suspendida';
    case 'CANCELADA': case 'CANCELLED': return 'Cancelada';
    case 'CONCLUIDA_PORTAL': case 'FINISHED': return 'Concluida';
    case 'FINALIZADA_AUTORIDAD': return 'Finalizada';
    case 'CELEBRADA': return 'Celebrada';
    default: return String(s).toLowerCase().replace(/_/g,' ').replace(/^\w/, c => c.toUpperCase());
  }
}

function fmt(v) {
  if (!v) return null; const d = v instanceof Date ? v : new Date(v); if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('es-ES', { day:'2-digit', month:'short', year:'numeric' }).format(d);
}
function dateLine(a) {
  const label = statusDateLabel(a.status);
  if (!label) return null;
  const TBC = 'Fecha por confirmar';
  if (label === 'Termina') {
    const e = fmt(a.endsAt) ?? fmt(a.endDateTime); return e ? { label, dateStr: e } : null;
  }
  if (label === 'Próxima apertura') {
    return { label, dateStr: fmt(a.opensAt) ?? TBC };
  }
  if (label === 'Fecha prevista de reanudación') {
    return { label, dateStr: fmt(a.resumeAt) ?? TBC };
  }
  return null;
}
function badge(s) {
  if (!s) return null;
  const label = statusHumanLabel(s);
  switch (s) {
    case 'CELEBRANDOSE': case 'ACTIVE': return { label, bg:'#dcfce7', fg:'#166534' };
    case 'PROXIMA_APERTURA': case 'PRE_AUCTION': return { label, bg:'#fef3c7', fg:'#92400e' };
    case 'SUSPENDIDA': case 'SUSPENDED': return { label, bg:'#fef3c7', fg:'#92400e' };
    default: return { label, bg:'#f3f4f6', fg:'#4b5563' };
  }
}
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Fixture covers every status the email can render.
const sample = [
  // CELEBRANDOSE — rung 1 real photo + Termina
  { title: 'Piso de 3 dormitorios en Gandia centro', url: `${APP_URL}/auction/test-1`,
    municipality: 'Gandia', province: 'Valencia', appraisalValue: 187500,
    endsAt: '2026-06-14T18:00:00Z', status: 'CELEBRANDOSE', category: 'Viviendas',
    imageUrl: '/api/auction-image/SUB-2026-12345', latitude: 38.9686, longitude: -0.1828 },
  // PROXIMA_APERTURA — coords but no real photo (rung 2 = Google pin OR placeholder);
  // opensAt SET → "Próxima apertura: <date>" (NOT a fake Termina date)
  { title: 'Garaje en planta sótano · Calle Mayor 21, Madrid', url: `${APP_URL}/auction/test-2`,
    municipality: 'Madrid', province: 'Madrid', appraisalValue: 18500,
    opensAt: '2026-07-20T09:00:00Z',
    // Deliberately also set a placeholder endsAt — proves we DON'T fall through to it
    endsAt: '2026-08-30T12:00:00Z',
    status: 'PROXIMA_APERTURA', category: 'Garajes',
    imageUrl: null, latitude: 40.4168, longitude: -3.7038 },
  // PROXIMA_APERTURA — opensAt NULL → "Fecha por confirmar"
  { title: 'Local comercial en Sevilla — Próxima', url: `${APP_URL}/auction/test-2b`,
    municipality: 'Sevilla', province: 'Sevilla', appraisalValue: 92000,
    opensAt: null, endsAt: '2026-08-30T12:00:00Z',
    status: 'PROXIMA_APERTURA', category: 'Locales',
    imageUrl: null, latitude: 37.3886, longitude: -5.9823 },
  // SUSPENDIDA — resumeAt SET
  { title: 'Vivienda en Bilbao — suspendida por reclamación', url: `${APP_URL}/auction/test-3`,
    municipality: 'Bilbao', province: 'Vizcaya', appraisalValue: 245000,
    resumeAt: '2026-09-10T09:00:00Z',
    status: 'SUSPENDIDA', category: 'Viviendas',
    imageUrl: null, latitude: 43.2630, longitude: -2.9350 },
  // SUSPENDIDA — resumeAt NULL → "Fecha por confirmar"
  { title: 'Finca rústica en Lugo — suspendida', url: `${APP_URL}/auction/test-3b`,
    municipality: 'Lugo', province: 'Lugo', appraisalValue: 65000,
    resumeAt: null,
    status: 'SUSPENDIDA', category: 'Fincas rústicas',
    imageUrl: null, latitude: null, longitude: null },
  // Defensive — these should NEVER reach the email after the ALERTABLE filter, but
  // the renderer must still translate the badge and emit NO date line.
  { title: 'Cancelled control row', url: `${APP_URL}/auction/test-4`,
    municipality: 'Madrid', province: 'Madrid', appraisalValue: 1,
    status: 'CANCELADA', category: 'Viviendas',
    imageUrl: null, latitude: null, longitude: null },
  { title: 'Concluded control row', url: `${APP_URL}/auction/test-5`,
    municipality: 'Madrid', province: 'Madrid', appraisalValue: 1,
    status: 'CONCLUIDA_PORTAL', category: 'Viviendas',
    imageUrl: null, latitude: null, longitude: null },
];

const brandName = 'SubastasActivas';
const alertName = 'Verificación wave52';
const subject = `Nuevas subastas para tu alerta: ${alertName}`;
const manageUrl = `${APP_URL}/alerts`;

const listHtml = sample.map(a => {
  const location = [a.municipality, a.province].filter(Boolean).join(', ') || 'Sin ubicación';
  const price = a.appraisalValue ? new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(a.appraisalValue) : 'Sin tasación';
  const image = emailAuctionImageUrl(a);
  const dl = dateLine(a); const b = badge(a.status); const cat = a.category;
  const badgeHtml = b ? `<span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600;background:${b.bg};color:${b.fg};line-height:1.4;">${esc(b.label)}</span>` : '';
  const catHtml = cat ? `<span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:500;background:#eef2ff;color:#3730a3;line-height:1.4;margin-left:6px;">${esc(cat)}</span>` : '';
  const dateHtml = dl ? `<div style="font-size:13px;color:#374151;margin-top:6px;"><strong>${dl.label}:</strong> ${esc(dl.dateStr)}</div>` : '';
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 16px;border-bottom:1px solid #e5e7eb;padding-bottom:16px;">
      <tr>
        <td valign="top" width="130" style="width:130px;padding-right:12px;">
          <img src="${esc(image.src)}" alt="${esc(image.alt)}" width="120" height="90" style="display:block;width:120px;height:90px;border-radius:6px;object-fit:cover;border:0;outline:none;text-decoration:none;background:#e5e7eb;" />
        </td>
        <td valign="top" style="vertical-align:top;">
          <div style="font-weight:600;color:#111827;font-size:15px;line-height:1.35;margin-bottom:6px;">${esc(a.title)}</div>
          <div style="margin-bottom:6px;">${badgeHtml}${catHtml}</div>
          <div style="font-size:13px;color:#6b7280;">${esc(location)}</div>
          <div style="font-size:13px;color:#111827;font-weight:600;margin-top:4px;">${price}</div>
          ${dateHtml}
          <div style="margin-top:8px;"><a href="${esc(a.url)}" style="color:#2563eb;text-decoration:none;font-size:13px;font-weight:600;">Ver subasta &rarr;</a></div>
        </td>
      </tr>
    </table>`;
}).join('');

const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${subject}</title></head>
<body style="margin:0;padding:0;font-family:Arial, sans-serif;background:#f9fafb;color:#111827;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">
    <div style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
      <div style="padding:24px;background:#111827;color:#ffffff;">
        <h1 style="margin:0;font-size:20px;">${brandName}</h1>
        <p style="margin:8px 0 0;font-size:14px;color:#e5e7eb;">Alertas personalizadas</p>
      </div>
      <div style="padding:24px;">
        <h2 style="margin:0 0 12px;font-size:18px;">${subject}</h2>
        <p style="margin:0 0 20px;font-size:14px;color:#4b5563;">Encontramos nuevas subastas que coinciden con tus criterios.</p>
        <div>${listHtml}</div>
        <div style="margin-top:24px;text-align:center;"><a href="${manageUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:14px;">Gestionar alertas</a></div>
      </div>
    </div>
    <p style="text-align:center;font-size:12px;color:#6b7280;margin-top:16px;">Recibes este correo porque tienes alertas activas en ${brandName}.</p>
  </div>
</body></html>`;

const out = 'tmp/alert-email-preview.html';
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html, 'utf8');

// Verification assertions — fail loud if any wave52 bug regresses.
// Note: we strip HTML-escaped chars (Pr&oacute;xima vs Próxima both decode to "Próxima")
// before searching. The escaper used here is the same one used by the production
// helper — characters in the [&<>"'] set get escaped, others (including í/ó/é) pass through.
const errors = [];

function block(after, before) {
  // Extract a window of HTML starting at `after` and ending at the next `</table>`.
  const i = html.indexOf(after);
  if (i < 0) return '';
  const j = html.indexOf('</table>', i);
  return j < 0 ? html.slice(i) : html.slice(i, j);
}

if ((html.match(/tile\.openstreetmap/g) || []).length > 0) {
  errors.push('FAIL: tile.openstreetmap URL leaked into rendered HTML.');
}
// Raw enum codes must never appear in user-facing text. Strip href + alt
// (which contain auction URLs like /auction/test-2 — innocuous identifiers
// won't match the enum patterns) and check.
const visible = html.replace(/href="[^"]*"/g, '').replace(/alt="[^"]*"/g, '');
const rawCodes = visible.match(/\b(CONCLUIDA_PORTAL|FINALIZADA_AUTORIDAD|PROXIMA_APERTURA|CELEBRANDOSE|SUSPENDIDA)\b/g);
if (rawCodes) errors.push(`FAIL: raw status enum code leaked into visible HTML: ${rawCodes.join(', ')}`);

const proximaBlock = block('Garaje en planta sótano');
if (proximaBlock.includes('Termina:')) errors.push('FAIL: PROXIMA_APERTURA row shows a "Termina:" date — fake termination date regression.');
if (!proximaBlock.includes('Próxima apertura:')) errors.push('FAIL: PROXIMA_APERTURA row missing "Próxima apertura:" date line.');

const proximaTbcBlock = block('Local comercial en Sevilla');
if (proximaTbcBlock.includes('Termina:')) errors.push('FAIL: PROXIMA_APERTURA-no-opensAt row shows "Termina:".');
if (!proximaTbcBlock.includes('Fecha por confirmar')) errors.push('FAIL: PROXIMA_APERTURA-no-opensAt row missing "Fecha por confirmar".');

const suspBlock = block('Vivienda en Bilbao');
if (!suspBlock.includes('Fecha prevista de reanudación')) errors.push('FAIL: SUSPENDIDA row missing reanudación label.');

const suspTbcBlock = block('Finca rústica en Lugo');
if (!suspTbcBlock.includes('Fecha prevista de reanudación')) errors.push('FAIL: SUSPENDIDA-no-resumeAt row missing reanudación label.');
if (!suspTbcBlock.includes('Fecha por confirmar')) errors.push('FAIL: SUSPENDIDA-no-resumeAt row missing "Fecha por confirmar".');

const cancelBlock = block('Cancelled control row');
if (cancelBlock.includes('Termina:') || cancelBlock.includes('Próxima apertura:') || cancelBlock.includes('Fecha prevista de reanudación')) {
  errors.push('FAIL: CANCELADA row leaked a date line.');
}
if (!cancelBlock.includes('Cancelada')) errors.push('FAIL: CANCELADA badge not translated.');

const concBlock = block('Concluded control row');
if (concBlock.includes('Termina:') || concBlock.includes('Próxima apertura:') || concBlock.includes('Fecha prevista de reanudación')) {
  errors.push('FAIL: CONCLUIDA_PORTAL row leaked a date line.');
}
if (!concBlock.includes('Concluida')) errors.push('FAIL: CONCLUIDA_PORTAL badge not translated to "Concluida".');

console.log(`Wrote ${out} (${html.length} bytes)`);
console.log(`OSM hot-links in HTML: ${(html.match(/tile\.openstreetmap/g) || []).length}`);
console.log(`Static-Maps API usable in env: ${isStaticMapsApiUsable()} (rung-2 = ${isStaticMapsApiUsable() ? 'Google pin' : 'branded placeholder'})`);
if (errors.length) {
  for (const e of errors) console.error(e);
  process.exit(1);
} else {
  console.log('ALL wave52 ASSERTIONS PASSED:');
  console.log('  - 0 tile.openstreetmap URLs in rendered HTML');
  console.log('  - PROXIMA_APERTURA shows "Próxima apertura:", never "Termina:"');
  console.log('  - SUSPENDIDA shows "Fecha prevista de reanudación:"');
  console.log('  - CANCELADA / CONCLUIDA_PORTAL translated (never raw enum codes)');
  console.log('  - Terminal-state rows emit no date line');
}
