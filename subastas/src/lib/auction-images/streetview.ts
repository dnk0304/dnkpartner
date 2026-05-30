/**
 * Google Street View Static API fetcher (FALLBACK image source).
 *
 * Endpoint:
 *   GET https://maps.googleapis.com/maps/api/streetview?size=WxH&location=LAT,LNG&key=KEY
 *   GET https://maps.googleapis.com/maps/api/streetview/metadata?location=LAT,LNG&key=KEY
 *
 * Per Google ToS we MUST:
 *   - Only use this for active listings on-demand (no historical bulk fetch).
 *   - Pre-check /metadata first so we don't burn a paid request when there's
 *     no imagery (status:ZERO_RESULTS → fall through to placeholder).
 *   - Cache locally for serving (allowed under the Maps Static caching clause
 *     for content displayed in our own UI; we don't redistribute keys).
 *
 * Env:
 *   STREETVIEW_API_KEY — required. Set on Coolify; never committed.
 *
 * Status of the lehubdelcreative key (verified 2026-05-30): the Maps APIs are
 * enabled BUT the **Street View Static API specifically is NOT enabled** on
 * the project. Dennis must toggle it in the GCP console; until then this
 * module returns { ok:false, reason:'api-disabled' } and the resolver falls
 * through to the existing placeholder.
 */

const STREETVIEW_URL = 'https://maps.googleapis.com/maps/api/streetview';
const METADATA_URL = 'https://maps.googleapis.com/maps/api/streetview/metadata';

const DEFAULT_SIZE = process.env.STREETVIEW_SIZE || '640x400';

function getKey(): string | null {
  return process.env.STREETVIEW_API_KEY || process.env.GOOGLE_API_KEY || null;
}

export type StreetViewResult =
  | { ok: true; bytes: Buffer; bytesLen: number }
  | { ok: false; reason: 'no-key' | 'api-disabled' | 'zero-results' | 'http-error' | 'network-error' | 'invalid-coords'; status?: number };

function validCoords(lat: number | null | undefined, lng: number | null | undefined): boolean {
  if (lat == null || lng == null) return false;
  if (!isFinite(lat) || !isFinite(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  return true;
}

/** Hit the metadata endpoint first — it's free per Google's docs and returns
 *  status:OK only when actual imagery exists at the location. */
export async function checkStreetViewMetadata(
  lat: number,
  lng: number,
  opts: { timeoutMs?: number } = {}
): Promise<StreetViewResult | { ok: true; bytes?: never }> {
  const key = getKey();
  if (!key) return { ok: false, reason: 'no-key' };
  if (!validCoords(lat, lng)) return { ok: false, reason: 'invalid-coords' };

  const url = `${METADATA_URL}?location=${lat},${lng}&key=${key}`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), opts.timeoutMs ?? 10_000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return { ok: false, reason: 'http-error', status: res.status };
    const j = (await res.json()) as { status?: string; error_message?: string };
    if (j.status === 'OK') return { ok: true };
    if (j.status === 'REQUEST_DENIED') return { ok: false, reason: 'api-disabled' };
    // ZERO_RESULTS / NOT_FOUND / OVER_QUERY_LIMIT etc.
    return { ok: false, reason: 'zero-results' };
  } catch {
    return { ok: false, reason: 'network-error' };
  } finally {
    clearTimeout(t);
  }
}

export async function fetchStreetView(
  lat: number,
  lng: number,
  opts: { size?: string; timeoutMs?: number; skipMetadata?: boolean } = {}
): Promise<StreetViewResult> {
  const key = getKey();
  if (!key) return { ok: false, reason: 'no-key' };
  if (!validCoords(lat, lng)) return { ok: false, reason: 'invalid-coords' };

  if (!opts.skipMetadata) {
    const meta = await checkStreetViewMetadata(lat, lng, { timeoutMs: opts.timeoutMs });
    if (!meta.ok) return meta as StreetViewResult;
  }

  const size = opts.size || DEFAULT_SIZE;
  const url = `${STREETVIEW_URL}?size=${size}&location=${lat},${lng}&key=${key}`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15_000);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return { ok: false, reason: 'http-error', status: res.status };
    const ct = res.headers.get('content-type') || '';
    if (!ct.startsWith('image/')) return { ok: false, reason: 'zero-results' };
    const ab = await res.arrayBuffer();
    const buf = Buffer.from(ab);
    if (buf.byteLength < 1024) return { ok: false, reason: 'zero-results' };
    return { ok: true, bytes: buf, bytesLen: buf.byteLength };
  } catch {
    return { ok: false, reason: 'network-error' };
  } finally {
    clearTimeout(t);
  }
}
