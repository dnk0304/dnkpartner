/**
 * Self-hosted FREE OSM static map (rung-2 map for UPCOMING auctions).
 *
 * WHY this exists (wave105, Forge 2026-06-14):
 *   Street View Static API is PAID (~$7/1k). Policy decision (Dennis): UPCOMING
 *   auctions (PROXIMA_APERTURA / PRE_AUCTION) must NEVER burn a paid Street View
 *   request — they may never go live / never get viewed. Instead they show a
 *   FREE map of the location. The previous "free map" rung hot-linked OSM tiles,
 *   but OSM BLOCKS server-side / email / bulk hot-linking (policy: osm.wiki/Blocked).
 *   So the map MUST be self-hosted on our own origin.
 *
 * HOW:
 *   We stitch a small NxN grid of OSM raster tiles around the target lat/lng,
 *   draw a red pin at the exact point, and CACHE the composed PNG to a host
 *   volume (AUCTION_MAPS_DIR, mirrors the auction-images volume pattern so it
 *   survives redeploys). Served thereafter from GET /api/auction-map/<key>.
 *
 * OSM TILE USAGE POLICY COMPLIANCE (MANDATORY — non-negotiable):
 *   - Descriptive User-Agent identifying the app + a contact email (the EXACT
 *     UA the Nominatim geocoder already uses — wave96).
 *   - Fetch each tile ONCE, cache the composed PNG FOREVER. An auction's coords
 *     never move, so there is no reason to ever re-fetch. We do NOT hammer tiles.
 *   - Tiny tile count per map (3x3 = 9 tiles), one-time, behind a per-key lock.
 *   A hammering fetcher gets our box IP-banned by OSM and breaks every map — so
 *   the cache-once guarantee is load-bearing, not an optimization.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {
  mapKeyFor,
  decodeMapKey,
  isValidMapKey,
  mapPublicPathFor,
  getOptimalMapZoom,
  DEFAULT_MAP_ZOOM,
} from './osm-map-key';

// Re-export the pure key/URL helpers so existing server-side importers of
// osm-map.ts keep working. The pure helpers live in osm-map-key.ts (no fs/sharp)
// so client bundles can import them without dragging server-only modules in.
export { mapKeyFor, decodeMapKey, isValidMapKey, mapPublicPathFor, getOptimalMapZoom };

/** Host volume for composed map PNGs. Mirrors AUCTION_IMAGES_DIR. */
export const AUCTION_MAPS_DIR =
  process.env.AUCTION_MAPS_DIR || '/data/auction-maps';

/**
 * OSM tile usage policy: descriptive UA identifying the app + contact email.
 * Reuses the EXACT string the Nominatim geocoder set (wave96,
 * scraper/services/geocoding_service.py). Must never be empty/generic.
 */
const OSM_TILE_USER_AGENT =
  'SubastasActivas/1.0 (https://subastasactivas.com; dennis.kotlenko@gmail.com)';

const TILE_BASE = 'https://tile.openstreetmap.org';
const TILE_SIZE = 256; // OSM raster tile px
const GRID = 3; // 3x3 tiles around center → 768x768 composed
const DEFAULT_ZOOM = DEFAULT_MAP_ZOOM;

function mapDiskPathFor(key: string): string {
  return path.join(AUCTION_MAPS_DIR, `${key}.png`);
}

export async function mapExists(key: string): Promise<boolean> {
  try {
    const s = await fs.stat(mapDiskPathFor(key));
    return s.isFile() && s.size > 0;
  } catch {
    return false;
  }
}

export async function readMap(key: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(mapDiskPathFor(key));
  } catch {
    return null;
  }
}

function validCoords(lat: number | null | undefined, lng: number | null | undefined): boolean {
  if (lat == null || lng == null) return false;
  if (!isFinite(lat) || !isFinite(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  return true;
}

// Web-Mercator fractional tile coordinates (x/y in tile units, not px).
function lonLatToTileXY(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const n = Math.pow(2, zoom);
  const x = ((lng + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x, y };
}

async function fetchTile(z: number, x: number, y: number, timeoutMs = 12_000): Promise<Buffer | null> {
  const n = Math.pow(2, z);
  // Wrap X (longitude is cyclic); clamp Y (off-grid tiles don't exist).
  const xi = ((Math.floor(x) % n) + n) % n;
  const yi = Math.floor(y);
  if (yi < 0 || yi >= n) return null;
  const url = `${TILE_BASE}/${z}/${xi}/${yi}.png`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': OSM_TILE_USER_AGENT, Referer: 'https://subastasactivas.com' },
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (!ct.startsWith('image/')) return null;
    const ab = await res.arrayBuffer();
    const buf = Buffer.from(ab);
    return buf.byteLength > 0 ? buf : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** A small red map pin (SVG → PNG via sharp) composited at the marker point. */
function pinSvg(): Buffer {
  // 26x38 teardrop pin, red with white center dot. Tip at bottom-center.
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="38" viewBox="0 0 26 38">` +
      `<path d="M13 0C5.82 0 0 5.82 0 13c0 9.25 13 25 13 25s13-15.75 13-25C26 5.82 20.18 0 13 0z" fill="#e11d2a"/>` +
      `<circle cx="13" cy="13" r="5" fill="#ffffff"/>` +
      `</svg>`,
  );
}

// Per-key in-flight lock so concurrent requests for the same map only stitch once.
const inFlight = new Map<string, Promise<Buffer | null>>();

/**
 * Build (or read from cache) the composed map PNG for a coord pair. Fetches OSM
 * tiles ONCE, composes with the pin, writes the PNG to the volume, returns bytes.
 * Returns null on invalid coords or if no tiles could be fetched.
 */
export async function buildOrGetMap(
  latitude: number,
  longitude: number,
  zoom: number = DEFAULT_ZOOM,
): Promise<{ key: string; bytes: Buffer } | null> {
  if (!validCoords(latitude, longitude)) return null;
  const key = mapKeyFor(latitude, longitude, zoom);

  const cached = await readMap(key);
  if (cached) return { key, bytes: cached };

  const existing = inFlight.get(key);
  if (existing) {
    const b = await existing;
    return b ? { key, bytes: b } : null;
  }

  const job = (async (): Promise<Buffer | null> => {
    const center = lonLatToTileXY(latitude, longitude, zoom);
    const half = Math.floor(GRID / 2);
    const x0 = Math.floor(center.x) - half;
    const y0 = Math.floor(center.y) - half;

    // Fetch the GRIDxGRID tile block (9 tiles), once.
    const composites: sharp.OverlayOptions[] = [];
    let anyTile = false;
    for (let dy = 0; dy < GRID; dy++) {
      for (let dx = 0; dx < GRID; dx++) {
        const tile = await fetchTile(zoom, x0 + dx, y0 + dy);
        if (!tile) continue;
        anyTile = true;
        composites.push({ input: tile, left: dx * TILE_SIZE, top: dy * TILE_SIZE });
      }
    }
    if (!anyTile) return null;

    const canvasW = GRID * TILE_SIZE;
    const canvasH = GRID * TILE_SIZE;

    // Marker px position within the composed canvas (center.x/y are fractional
    // tile coords; subtract the top-left tile origin, scale to px).
    const markerX = (center.x - x0) * TILE_SIZE;
    const markerY = (center.y - y0) * TILE_SIZE;
    const pin = pinSvg();
    const pinW = 26;
    const pinH = 38;
    composites.push({
      input: pin,
      left: Math.round(markerX - pinW / 2),
      top: Math.round(markerY - pinH), // tip of pin sits on the point
    });

    const png = await sharp({
      create: { width: canvasW, height: canvasH, channels: 4, background: { r: 235, g: 235, b: 235, alpha: 1 } },
    })
      .composite(composites)
      .png({ compressionLevel: 9 })
      .toBuffer();

    await fs.mkdir(AUCTION_MAPS_DIR, { recursive: true });
    await fs.writeFile(mapDiskPathFor(key), png);
    return png;
  })();

  inFlight.set(key, job);
  try {
    const bytes = await job;
    return bytes ? { key, bytes } : null;
  } finally {
    inFlight.delete(key);
  }
}
