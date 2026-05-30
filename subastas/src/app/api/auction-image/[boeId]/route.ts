/**
 * GET /api/auction-image/[boeId]
 *
 * Serves a cached auction image from the Hetzner host volume mounted at
 * AUCTION_IMAGES_DIR (default /data/auction-images). Public, no auth — the
 * auction list/detail is gated by the dnkpartner authgate at the proxy layer,
 * and image URLs leak no more than the existing /streetview/*.jpg URLs did.
 *
 * 404 if no cached file exists. The caller (auction card / detail) is
 * responsible for falling back to a category placeholder when imageUrl is null.
 */
import { NextRequest, NextResponse } from 'next/server';
import { readImage, isValidKey, safeKey } from '@/lib/auction-images/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ boeId: string }> }
) {
  const { boeId } = await ctx.params;
  const key = safeKey(boeId);
  if (!isValidKey(key)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const bytes = await readImage(key);
  if (!bytes) return NextResponse.json({ error: 'not found' }, { status: 404 });

  return new NextResponse(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      'Content-Length': String(bytes.byteLength),
    },
  });
}
