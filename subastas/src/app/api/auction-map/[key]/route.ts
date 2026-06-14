/**
 * GET /api/auction-map/[key]
 *
 * Serves a self-hosted, cached OSM static map PNG for an auction location.
 * Mirrors the /api/auction-image/[boeId] serving + caching pattern: files live
 * on the AUCTION_MAPS_DIR host volume so they survive redeploys.
 *
 * The map is the FREE rung-2 imagery for UPCOMING auctions (no paid Street View).
 * `key` is the deterministic coord+zoom key produced by `mapKeyFor` (e.g.
 * `m_40-416800_-3-703800_z16`). It is NOT a raw lat/lng pair, so this route
 * cannot be turned into an open OSM-tile proxy — only keys we minted resolve,
 * and an unknown key 404s after a single one-time stitch attempt fails.
 *
 * If the PNG isn't on disk yet (e.g. served before the backfill persisted it),
 * we reconstruct the coords FROM the key and stitch once, cache, then serve.
 * Fetch-once / cache-forever keeps us OSM-policy compliant.
 *
 * Public, no auth — same exposure profile as /api/auction-image. A map of a
 * public auction address leaks nothing the listing doesn't already show.
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  readMap,
  isValidMapKey,
  buildOrGetMap,
  decodeMapKey,
} from '@/lib/auction-images/osm-map';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ key: string }> },
) {
  const { key } = await ctx.params;
  if (!isValidMapKey(key)) {
    return NextResponse.json({ error: 'invalid key' }, { status: 400 });
  }

  let bytes = await readMap(key);

  if (!bytes) {
    // Not cached yet — reconstruct coords from the key and stitch once.
    const coords = decodeMapKey(key);
    if (coords) {
      const built = await buildOrGetMap(coords.lat, coords.lng, coords.zoom);
      if (built) bytes = built.bytes;
    }
  }

  if (!bytes) return NextResponse.json({ error: 'not found' }, { status: 404 });

  return new NextResponse(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      // Maps are immutable per key (coords don't move) — cache hard.
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Length': String(bytes.byteLength),
    },
  });
}
