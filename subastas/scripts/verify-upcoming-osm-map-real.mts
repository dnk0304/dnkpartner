/**
 * REAL harness — imports the PRODUCTION createAuctionAlertEmail() (NOT a mirror)
 * and proves that an UPCOMING auction WITH coords now renders the self-hosted
 * FREE OSM map (/api/auction-map/<key>), NOT the branded placeholder.
 *
 * Run: node --import tsx scripts/verify-upcoming-osm-map-real.mts
 *
 * Env: NEXT_PUBLIC_APP_URL=https://subastasactivas.com
 *      (NO GOOGLE_MAPS_API_KEY / USE_GOOGLE_STATIC_MAPS — prove the FREE path.)
 */
import 'tsconfig-paths/register';
import * as emailTemplates from '../src/lib/email-templates';
import * as keyMod from '../src/lib/auction-images/osm-map-key';
const km = ((keyMod as any).default ?? keyMod) as any;
const mapKeyFor = km.mapKeyFor as (a: number, b: number, z?: number) => string;
const getOptimalMapZoom = km.getOptimalMapZoom as (c: string | null | undefined) => number;
const mapPublicPathFor = km.mapPublicPathFor as (k: string) => string;
const createAuctionAlertEmail = (emailTemplates as any).createAuctionAlertEmail
  ?? (emailTemplates as any).default?.createAuctionAlertEmail;
if (typeof createAuctionAlertEmail !== 'function') {
  console.error('Could not resolve createAuctionAlertEmail. Exports:', Object.keys(emailTemplates));
  process.exit(2);
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://subastasactivas.com';

// Ken's wave106 sample: SUB-SS-15, AV NOVELDA 45, ALICANTE, PROXIMA_APERTURA.
const UPCOMING_WITH_COORDS = {
  title: 'AV NOVELDA 45 — Alicante (PROXIMA_APERTURA)',
  url: `${APP_URL}/auction/test-upcoming`,
  address: 'AV NOVELDA 45', province: 'Alicante', municipality: 'Alicante',
  appraisalValue: 95000, valorSubasta: null, claimedAmount: null,
  opensAt: '2026-07-20T09:00:00Z', endsAt: null, endDateTime: null, resumeAt: null,
  status: 'PROXIMA_APERTURA', category: 'Viviendas',
  imageUrl: null, latitude: 38.4369763, longitude: -0.6399405,
};
const UPCOMING_NO_COORDS = {
  title: 'Upcoming sin coords (honest placeholder)',
  url: `${APP_URL}/auction/test-upcoming-nocoords`,
  address: null, province: 'Madrid', municipality: 'Madrid',
  appraisalValue: 50000, valorSubasta: null, claimedAmount: null,
  opensAt: '2026-08-01T09:00:00Z', endsAt: null, endDateTime: null, resumeAt: null,
  status: 'PROXIMA_APERTURA', category: 'Viviendas',
  imageUrl: null, latitude: null, longitude: null,
};
const LIVE_WITH_COORDS = {
  title: 'LIVE auction (path unchanged)',
  url: `${APP_URL}/auction/test-live`,
  address: 'Calle Mayor 1', province: 'Madrid', municipality: 'Madrid',
  appraisalValue: 200000, valorSubasta: null, claimedAmount: null,
  endsAt: '2026-06-20T18:00:00Z', endDateTime: null, opensAt: null, resumeAt: null,
  status: 'CELEBRANDOSE', category: 'Viviendas',
  imageUrl: null, latitude: 40.4168, longitude: -3.7038,
};
const UPCOMING_WITH_PHOTO = {
  title: 'Upcoming WITH real photo (photo must win)',
  url: `${APP_URL}/auction/test-upcoming-photo`,
  address: 'X', province: 'Madrid', municipality: 'Madrid',
  appraisalValue: 1, valorSubasta: null, claimedAmount: null,
  opensAt: '2026-07-20T09:00:00Z', endsAt: null, endDateTime: null, resumeAt: null,
  status: 'PROXIMA_APERTURA', category: 'Viviendas',
  imageUrl: '/api/auction-image/SUB-SS-99', latitude: 38.4369763, longitude: -0.6399405,
};

function cardImgSrc(html: string, marker: string): string | null {
  const i = html.indexOf(marker);
  if (i < 0) return null;
  // The <img> precedes the title in the stacked layout; search a window around the marker.
  const win = html.slice(Math.max(0, i - 4000), i + 200);
  const m = /<img[^>]+src="([^"]+)"/g;
  let last: string | null = null; let mm: RegExpExecArray | null;
  while ((mm = m.exec(win)) !== null) last = mm[1];
  return last;
}

const { html } = createAuctionAlertEmail({
  alertName: 'verify-upcoming-osm',
  auctions: [UPCOMING_WITH_COORDS, UPCOMING_NO_COORDS, LIVE_WITH_COORDS, UPCOMING_WITH_PHOTO] as any,
  manageUrl: `${APP_URL}/alerts`,
});

const expectedZoom = getOptimalMapZoom(UPCOMING_WITH_COORDS.category);
const expectedKey = mapKeyFor(UPCOMING_WITH_COORDS.latitude, UPCOMING_WITH_COORDS.longitude, expectedZoom);
const expectedPath = `${APP_URL}${mapPublicPathFor(expectedKey)}`;

const upcomingSrc = cardImgSrc(html, 'AV NOVELDA 45');
const noCoordsSrc = cardImgSrc(html, 'Upcoming sin coords');
const liveSrc = cardImgSrc(html, 'LIVE auction');
const photoSrc = cardImgSrc(html, 'Upcoming WITH real photo');

console.log('APP_URL                :', APP_URL);
console.log('Static-Maps key set    :', Boolean(process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_API_KEY));
console.log('USE_GOOGLE_STATIC_MAPS :', process.env.USE_GOOGLE_STATIC_MAPS || '(unset)');
console.log('expected zoom          :', expectedZoom);
console.log('expected key           :', expectedKey);
console.log('expected map path      :', expectedPath);
console.log('---');
console.log('UPCOMING+coords  src   :', upcomingSrc);
console.log('UPCOMING no-coord src  :', noCoordsSrc);
console.log('LIVE+coords      src   :', liveSrc);
console.log('UPCOMING+photo   src   :', photoSrc);

const errors: string[] = [];
if (upcomingSrc !== expectedPath) errors.push(`UPCOMING+coords must be self-hosted map ${expectedPath}, got ${upcomingSrc}`);
if (!noCoordsSrc?.endsWith('/images/email-placeholder.png')) errors.push(`UPCOMING no-coords must be placeholder, got ${noCoordsSrc}`);
if (!photoSrc?.includes('/api/auction-image/SUB-SS-99')) errors.push(`UPCOMING+photo must keep real photo, got ${photoSrc}`);
if (html.includes('tile.openstreetmap')) errors.push('OSM tile hot-link leaked into HTML');
if (html.includes('maps.googleapis.com')) errors.push('Google Static Maps URL leaked into HTML (paid API in email path)');

if (errors.length) {
  for (const e of errors) console.error('FAIL:', e);
  process.exit(1);
}
console.log('---\nALL ASSERTIONS PASSED (real production createAuctionAlertEmail):');
console.log('  UPCOMING+coords  -> self-hosted FREE OSM map');
console.log('  UPCOMING no-coord-> honest placeholder');
console.log('  UPCOMING+photo   -> real photo wins');
console.log('  no OSM hot-link, no Google Static Maps in HTML');

// Emit the upcoming card HTML window for the resume.
const i = html.indexOf('AV NOVELDA 45');
console.log('\n=== UPCOMING CARD HTML (window) ===');
console.log(html.slice(Math.max(0, i - 1200), i + 600));
