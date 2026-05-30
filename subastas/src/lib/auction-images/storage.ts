/**
 * Auction-image storage.
 *
 * Files live on a Hetzner host volume mounted into the container at
 * AUCTION_IMAGES_DIR (default /data/auction-images), served by the Next.js
 * app via GET /api/auction-image/[boeId].
 *
 * One file per auction, keyed by the file-system-safe boeId. JPEG bytes
 * as fetched from the upstream (Catastro facade photo or Street View Static
 * API). Re-fetches are idempotent — same boeId overwrites.
 *
 * The volume is intentionally NOT in the container image. Coolify mounts
 * the named volume on deploy so cached images survive redeploys.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

export const AUCTION_IMAGES_DIR =
  process.env.AUCTION_IMAGES_DIR || '/data/auction-images';

const SAFE_KEY_RE = /^[A-Za-z0-9_.-]{1,128}$/;

export function safeKey(boeId: string): string {
  // Normalize to the same character set the legacy /streetview/ files used
  // (replaceAll non-alnum with _) so migrated files round-trip cleanly.
  return boeId.replace(/[^a-zA-Z0-9_.-]+/g, '_').slice(0, 128);
}

export function publicPathFor(boeId: string): string {
  return `/api/auction-image/${encodeURIComponent(safeKey(boeId))}`;
}

export function diskPathFor(boeId: string): string {
  return path.join(AUCTION_IMAGES_DIR, `${safeKey(boeId)}.jpg`);
}

export async function ensureDir(): Promise<void> {
  await fs.mkdir(AUCTION_IMAGES_DIR, { recursive: true });
}

export async function exists(boeId: string): Promise<boolean> {
  try {
    const s = await fs.stat(diskPathFor(boeId));
    return s.isFile() && s.size > 0;
  } catch {
    return false;
  }
}

export async function writeImage(
  boeId: string,
  bytes: Uint8Array | Buffer
): Promise<{ path: string; size: number; publicPath: string }> {
  if (!bytes || bytes.byteLength === 0) {
    throw new Error('writeImage: refusing to persist zero-byte image');
  }
  await ensureDir();
  const dst = diskPathFor(boeId);
  await fs.writeFile(dst, bytes);
  return { path: dst, size: bytes.byteLength, publicPath: publicPathFor(boeId) };
}

export async function readImage(boeId: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(diskPathFor(boeId));
  } catch {
    return null;
  }
}

/** Validate a route-supplied key before disk lookup. Prevents traversal. */
export function isValidKey(raw: string): boolean {
  return SAFE_KEY_RE.test(raw);
}
