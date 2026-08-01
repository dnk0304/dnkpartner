/**
 * GET /api/auction-doc/[id]
 *
 * Serves a cached auction document PDF from the Hetzner host volume mounted
 * at AUCTION_DOCS_DIR (default /data/auction-docs).
 *
 * PAID FEATURE (wave173, 2026-08-01, Option A): our CACHED copy is the paid
 * value-add. This endpoint enforces hasFullAccessServer() (paid OR trial-active)
 * and returns 403 {error:'access_required'} for non-entitled viewers BEFORE any
 * DB/disk access, so a guessed/leaked URL can't exfiltrate the file. The free
 * public BOE source (AuctionDocument.officialUrl) is NOT gated — it stays
 * visible + crawlable in the detail payload as the non-entitled fallback.
 *
 * Lookup is by AuctionDocument.id (PRIMARY KEY) so the URL never carries a
 * raw path — no path-traversal surface. The stored relative path is then
 * validated against SAFE_REL_PATH_RE (in storage.ts) before any disk read.
 *
 * 404 when the row is missing, the storedPath is null, or the file is
 * missing on disk — the caller (detail page / card) is responsible for
 * falling back to AuctionDocument.officialUrl (the BOE link).
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hasFullAccessServer } from '@/lib/access';
import { readDoc, SNAPSHOT_FILENAME } from '@/lib/auction-docs/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Build a sensible download filename. Browsers fall back to the URL's last
 * path segment otherwise, which would just be the AuctionDocument.id (cuid).
 */
function buildDownloadFilename(
  docType: string | null,
  boeId: string | null,
  storedPath: string,
): string {
  const fromPath = storedPath.split('/').pop() ?? 'document.pdf';
  // For snapshot rows the on-disk file is the generic `snapshot.pdf`; rename
  // it to `<boeId>-snapshot.pdf` so the user's download folder stays useful.
  if (fromPath === SNAPSHOT_FILENAME && boeId) {
    return `${boeId}-snapshot.pdf`;
  }
  // For downloads, prefix with docType when present (e.g. "NOTA_SIMPLE-foo.pdf")
  // so multiple PDFs from the same auction land distinctly in the download
  // folder. Sanitize prefix to ASCII alnum/_-.
  if (docType) {
    const safeType = docType.replace(/[^A-Za-z0-9_.-]+/g, '_').slice(0, 32);
    if (safeType) return `${safeType}-${fromPath}`;
  }
  return fromPath;
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: 'id_required' }, { status: 400 });
  }

  // wave173 (2026-08-01) — PAID gate (Option A). Our cached document copy is the
  // paid value-add: enforce entitlement server-side BEFORE any DB row lookup or
  // disk read, so even a guessed/leaked /api/auction-doc/<id> URL 403s for a
  // non-entitled (guest / expired-trial) viewer. Fail-closed via
  // hasFullAccessServer() (paid OR trial-active — the SAME predicate
  // participar/alerts use; a session/DB blip collapses to false). The free
  // public BOE link (AuctionDocument.officialUrl) remains the fallback for the
  // non-entitled — it's served from the detail payload, not this endpoint.
  const hasFullAccess = await hasFullAccessServer();
  if (!hasFullAccess) {
    return NextResponse.json({ error: 'access_required' }, { status: 403 });
  }

  const doc = await prisma.auctionDocument.findUnique({
    where: { id },
    select: {
      id: true,
      docType: true,
      storedPath: true,
      auction: { select: { boeId: true } },
    },
  });
  if (!doc || !doc.storedPath) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  // storage.readDoc validates the relative path AND verifies the resolved
  // absolute path stays under AUCTION_DOCS_DIR before touching the disk.
  const bytes = await readDoc(doc.storedPath);
  if (!bytes) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const filename = buildDownloadFilename(
    doc.docType,
    doc.auction?.boeId ?? null,
    doc.storedPath,
  );

  return new NextResponse(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      // Stored PDFs are immutable once on disk (snapshots are overwritten
      // in-place under a fixed filename, downloads are content-addressed by
      // BOE idDoc). Long cache + immutable is safe.
      'Cache-Control': 'public, max-age=604800, immutable',
      'Content-Length': String(bytes.byteLength),
      'Content-Disposition': `inline; filename="${filename}"`,
    },
  });
}
