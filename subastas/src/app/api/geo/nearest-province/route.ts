/**
 * GET /api/geo/nearest-province — automatic IP-based province detection
 * (Phase 2 of "subastas cerca de ti", Forge geoip brief 2026-07-10).
 *
 * Mechanism: Cloudflare "Add visitor location headers" Managed Transform.
 * The site is fully fronted by CF, which (once the toggle is enabled in the
 * CF dashboard) injects `cf-iplatitude` / `cf-iplongitude` / `cf-ipcountry`
 * on every origin request. We snap those coords to the nearest Spanish
 * province centroid via the SAME pure helper the client GPS flow uses
 * (`nearestProvince()` in src/lib/province-centroids.ts, which carries its
 * own ~400 km implausibility cutoff), and return the canonical province +
 * SEO slug. No maxmind, no external geo API, zero deps.
 *
 * Degrades gracefully: until the CF toggle is flipped (or on direct/dev
 * requests with no CF headers) every failure path is a 200 with
 * `province: null` — the client treats null exactly like "no detection".
 *
 * Country gate: we only snap when `cf-ipcountry` is ES or a border-plausible
 * neighbor (AD / GI / PT — their IPs can sit within real browsing distance
 * of Spanish provinces and the 400 km centroid guard still applies). Any
 * other country (e.g. DE) returns null rather than snapping a Berlin VPN
 * exit to Zaragoza. When the country header is absent but coords are
 * present, the centroid distance guard alone decides.
 *
 * PRIVACY INVARIANT (do not weaken): this handler must NOT log, store, or
 * forward the visitor's IP, coordinates, or city — no console.log of header
 * values, no DB write, no analytics event. Everything is request-scoped and
 * transient; the response contains only the derived province.
 *
 * Response contract (LOCKED — Pixel builds against this; flag any change):
 *   200 { province: { key, label, slug } | null, source: "ip" }
 * Always 200; failures are `province: null`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { nearestProvince } from '@/lib/province-centroids';
import { PROVINCE_DB_KEY_TO_SLUG } from '@/lib/seo/slugs';

export const dynamic = 'force-dynamic';

/** Countries whose IPs may plausibly sit near a Spanish province. */
const SNAP_ALLOWED_COUNTRIES = new Set(['ES', 'AD', 'GI', 'PT']);

/** Per-visitor result — must never be shared-cached. */
const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' } as const;

function nullResult(): NextResponse {
  return NextResponse.json(
    { province: null, source: 'ip' as const },
    { headers: NO_STORE_HEADERS },
  );
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const latRaw = request.headers.get('cf-iplatitude');
    const lngRaw = request.headers.get('cf-iplongitude');
    const country = (request.headers.get('cf-ipcountry') ?? '').trim().toUpperCase();

    if (!latRaw || !lngRaw) return nullResult();

    const lat = Number.parseFloat(latRaw);
    const lng = Number.parseFloat(lngRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return nullResult();
    // Sanity range check — anything outside valid geodetic bounds is garbage.
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return nullResult();

    // Country gate: header present but not border-plausible → null.
    // (Header absent → fall through; the 400 km centroid guard decides.)
    if (country && country !== 'XX' && !SNAP_ALLOWED_COUNTRIES.has(country)) {
      return nullResult();
    }

    // Same pure snap the client GPS flow uses; returns null when the fix is
    // > ~400 km from every provincial centroid (far-from-Spain guard).
    const province = nearestProvince(lat, lng);
    if (!province) return nullResult();

    const slug = PROVINCE_DB_KEY_TO_SLUG[province.key];
    if (!slug) return nullResult();

    return NextResponse.json(
      {
        province: { key: province.key, label: province.label, slug },
        source: 'ip' as const,
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch {
    // Never 500 the homepage funnel over a geolocation nicety.
    return nullResult();
  }
}
