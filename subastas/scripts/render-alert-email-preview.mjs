/**
 * Standalone preview renderer — produces a sample alert email HTML on disk
 * so a human can open it in a browser / paste it into a Gmail compose to verify
 * the 5 enrichment fields (end-date, image, type, status badge, location) render.
 *
 * Run with: node scripts/render-alert-email-preview.mjs
 * Output:   tmp/alert-email-preview.html
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// Inline a minimal copy of the email helper to avoid Next.js module-loading deps.
// This MIRRORS src/lib/email-templates.ts createAuctionAlertEmail — keep in sync.
const APP_URL = 'https://subastasactivas.com';

function emailAuctionImageUrl(a) {
  const { imageUrl, latitude, longitude, title } = a;
  if (imageUrl && (imageUrl.startsWith('/api/auction-image/') || imageUrl.startsWith('/streetview/'))) {
    return { src: `${APP_URL}${imageUrl}`, alt: title ? `Foto de ${title}` : 'Foto', rung: 'photo' };
  }
  if (imageUrl && /^https?:\/\//.test(imageUrl) && !imageUrl.endsWith('.svg')) {
    return { src: imageUrl, alt: title ? `Foto de ${title}` : 'Foto', rung: 'photo' };
  }
  if (typeof latitude === 'number' && typeof longitude === 'number') {
    const zoom = 16; const n = Math.pow(2, zoom);
    const xF = ((longitude + 180) / 360) * n;
    const latRad = (latitude * Math.PI) / 180;
    const yF = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
    return { src: `https://tile.openstreetmap.org/${zoom}/${Math.floor(xF)}/${Math.floor(yF)}.png`, alt: title ? `Mapa ${title}` : 'Mapa', rung: 'map' };
  }
  return { src: `https://tile.openstreetmap.org/6/31/24.png`, alt: title ? `Categoría: ${title}` : 'Subasta sin imagen', rung: 'placeholder' };
}
function fmt(v) {
  if (!v) return null; const d = v instanceof Date ? v : new Date(v); if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('es-ES', { day:'2-digit', month:'short', year:'numeric' }).format(d);
}
function dateLine(a) {
  const e = fmt(a.endsAt) ?? fmt(a.endDateTime); if (e) return { label:'Termina', dateStr:e };
  const o = fmt(a.opensAt); if (o) return { label:'Apertura', dateStr:o };
  return null;
}
function badge(s) {
  if (!s) return null;
  if (s === 'CELEBRANDOSE') return { label:'En curso', bg:'#dcfce7', fg:'#166534' };
  if (s === 'PROXIMA_APERTURA') return { label:'Próxima apertura', bg:'#fef3c7', fg:'#92400e' };
  return { label: String(s), bg:'#f3f4f6', fg:'#4b5563' };
}
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const sample = [
  // Rung 1 — real photo path
  { title: 'Piso de 3 dormitorios en Gandia centro', url: `${APP_URL}/auction/test-1`,
    municipality: 'Gandia', province: 'Valencia', appraisalValue: 187500,
    endsAt: '2026-06-14T18:00:00Z', status: 'CELEBRANDOSE', category: 'Viviendas',
    imageUrl: '/api/auction-image/SUB-2026-12345', latitude: 38.9686, longitude: -0.1828 },
  // Rung 2 — no photo, has coords (map tile)
  { title: 'Garaje en planta sótano · Calle Mayor 21, Madrid', url: `${APP_URL}/auction/test-2`,
    municipality: 'Madrid', province: 'Madrid', appraisalValue: 18500,
    opensAt: '2026-07-20T09:00:00Z', status: 'PROXIMA_APERTURA', category: 'Garajes',
    imageUrl: null, latitude: 40.4168, longitude: -3.7038 },
  // Rung 3 — no photo, no coords (Spain-centered tile)
  { title: 'Turismo Audi A4 2018 — Lote único', url: `${APP_URL}/auction/test-3`,
    municipality: null, province: 'Sevilla', appraisalValue: 12000,
    endsAt: '2026-06-22T12:00:00Z', status: 'CELEBRANDOSE', category: 'Turismos',
    imageUrl: null, latitude: null, longitude: null },
];

const brandName = 'SubastasActivas';
const alertName = 'Viviendas en Valencia';
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
console.log(`Wrote ${out} (${html.length} bytes)`);
console.log('Open in a browser to verify image rungs + badges + date lines + brand render.');
